import { Env, UserPayload } from './types';
import { handleProductsRoutes } from './routes/products';
import { handleCheckoutRoutes } from './routes/checkout';
import { handleStockRoutes } from './routes/stock';
import { handlePORoutes } from './routes/po';
import { handleReportsRoutes } from './routes/reports';
import { handleShiftsRoutes } from './routes/shifts';
import { handleEmployeesRoutes } from './routes/employees';

const DEFAULT_JWT_SECRET = 'posta-secure-jwt-secret-key-2026';

function getJwtSecret(env: Env): string {
  return env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

function json(body: unknown, status = 200, corsHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function isAdminHost(hostname: string): boolean {
  const host = hostname.split(':')[0].toLowerCase();
  return host === 'posta.gpro.my.id' || host === 'localhost' || host === '127.0.0.1';
}

function isPlatformAdmin(role: string | undefined): boolean {
  return role === 'SUPERADMIN' || role === 'DEVELOPER';
}

// OWNER & ADMIN mengelola toko (produk, stok, laporan, karyawan) selain transaksi.
// CASHIER hanya boleh transaksi, buka/tutup shift, dan input barang masuk (PO).
function isTenantManager(role: string | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN' || isPlatformAdmin(role);
}

// Helper SHA-256
async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Base64Url Helpers
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let output = str.replace(/-/g, '+').replace(/_/g, '/');
  switch (output.length % 4) {
    case 0: break;
    case 2: output += '=='; break;
    case 3: output += '='; break;
    default: throw new Error('Illegal base64url string!');
  }
  return atob(output);
}

// Generate JWT HMAC-SHA256
async function createJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));

  return `${data}.${encodedSignature}`;
}

// Verifikasi JWT
export async function verifyJWT(authHeader: string | null, secret: string): Promise<UserPayload | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = Uint8Array.from(base64UrlDecode(encodedSignature), (c) => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(data));

    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }
    return payload as UserPayload;
  } catch {
    return null;
  }
}

async function handleAdminRoutes(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  authUser: UserPayload,
  url: URL,
): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/admin/tenants' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, subdomain, name, address, is_active FROM tenants ORDER BY name'
    ).all();
    return json({ success: true, data: results }, 200, corsHeaders);
  }

  if (path === '/api/admin/users' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.full_name AS name, u.username, u.role, u.is_active,
              u.tenant_id, COALESCE(t.name, 'Pusat Developer') AS tenant_name,
              COALESCE(t.subdomain, 'posta') AS subdomain
       FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
       ORDER BY u.full_name, u.username`
    ).all();
    return json({ success: true, data: results }, 200, corsHeaders);
  }

  if (path === '/api/admin/impersonate' && request.method === 'GET') {
    const subdomain = url.searchParams.get('subdomain');
    if (!subdomain) return json({ success: false, error: 'Subdomain wajib diisi.' }, 400, corsHeaders);
    const tenant = await env.DB.prepare(
      'SELECT id, subdomain FROM tenants WHERE subdomain = ? AND is_active = 1'
    ).bind(subdomain).first<{ id: string; subdomain: string }>();
    if (!tenant) return json({ success: false, error: 'Toko tidak ditemukan.' }, 404, corsHeaders);

    const token = await createJWT({
      ...authUser,
      tenant_id: tenant.id,
      tenant_subdomain: tenant.subdomain,
      exp: Math.floor(Date.now() / 1000) + 15 * 60,
    }, getJwtSecret(env));
    const targetUrl = `${url.protocol}//${tenant.subdomain}.posta.gpro.my.id/?sso_token=${encodeURIComponent(token)}`;
    return json({ success: true, token, target_url: targetUrl }, 200, corsHeaders);
  }

  if (path === '/api/admin/tenants' && request.method === 'POST') {
    const body = await request.json() as { subdomain?: string; name?: string; address?: string };
    const subdomain = body.subdomain?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!subdomain || !name || !/^[a-z0-9-]+$/.test(subdomain)) {
      return json({ success: false, error: 'Nama toko dan subdomain (huruf, angka, strip) wajib diisi.' }, 400, corsHeaders);
    }
    await env.DB.prepare(
      'INSERT INTO tenants (id, subdomain, name, address, is_active) VALUES (?, ?, ?, ?, 1)'
    ).bind(crypto.randomUUID(), subdomain, name, body.address?.trim() || null).run();
    return json({ success: true, message: 'Toko berhasil dibuat.' }, 201, corsHeaders);
  }

  if (path === '/api/admin/users' && request.method === 'POST') {
    const body = await request.json() as { tenant_id?: string; name?: string; username?: string; password?: string; role?: string };
    const tenantId = body.tenant_id === 'SUPERADMIN' ? 'SUPERADMIN' : body.tenant_id;
    const allowedRoles = ['SUPERADMIN', 'OWNER', 'ADMIN', 'CASHIER'];
    if (!tenantId || !body.name?.trim() || !body.username?.trim() || !body.password || !allowedRoles.includes(body.role || '')) {
      return json({ success: false, error: 'Data user tidak lengkap atau role tidak valid.' }, 400, corsHeaders);
    }
    const passwordHash = await sha256(body.password + 'posta_salt_2026');
    await env.DB.prepare(
      'INSERT INTO users (id, tenant_id, full_name, username, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).bind(crypto.randomUUID(), tenantId, body.name.trim(), body.username.trim(), passwordHash, body.role).run();
    return json({ success: true, message: 'User berhasil dibuat.' }, 201, corsHeaders);
  }

  const userEditMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);

  // UBAH DATA USER (nama, username, password, role, toko, status aktif)
  if (userEditMatch && request.method === 'PUT') {
    const targetId = userEditMatch[1];

    const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first();
    if (!existing) {
      return json({ success: false, error: 'User tidak ditemukan.' }, 404, corsHeaders);
    }

    const body = await request.json() as {
      tenant_id?: string;
      name?: string;
      username?: string;
      password?: string;
      role?: string;
      is_active?: number | boolean;
    };

    const updates: string[] = [];
    const binds: unknown[] = [];

    if (body.name?.trim()) {
      updates.push('full_name = ?');
      binds.push(body.name.trim());
    }
    if (body.username?.trim()) {
      updates.push('username = ?');
      binds.push(body.username.trim());
    }
    if (body.password) {
      updates.push('password_hash = ?');
      binds.push(await sha256(body.password + 'posta_salt_2026'));
    }
    if (body.role) {
      const allowedRoles = ['SUPERADMIN', 'DEVELOPER', 'OWNER', 'ADMIN', 'CASHIER'];
      if (!allowedRoles.includes(body.role)) {
        return json({ success: false, error: 'Role tidak valid.' }, 400, corsHeaders);
      }
      updates.push('role = ?');
      binds.push(body.role);
    }
    if (body.tenant_id) {
      updates.push('tenant_id = ?');
      binds.push(body.tenant_id === 'SUPERADMIN' ? 'SUPERADMIN' : body.tenant_id);
    }
    if (body.is_active !== undefined) {
      updates.push('is_active = ?');
      binds.push(body.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return json({ success: false, error: 'Tidak ada perubahan data yang dikirim.' }, 400, corsHeaders);
    }

    updates.push("updated_at = datetime('now')");
    binds.push(targetId);

    try {
      await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...binds)
        .run();
    } catch (e) {
      return json({ success: false, error: 'Username sudah digunakan atau data tidak valid.' }, 409, corsHeaders);
    }

    return json({ success: true, message: 'User berhasil diperbarui.' }, 200, corsHeaders);
  }

  // HAPUS USER (superadmin tidak bisa menghapus akunnya sendiri)
  if (userEditMatch && request.method === 'DELETE') {
    const targetId = userEditMatch[1];

    if (targetId === authUser.id) {
      return json({ success: false, error: 'Anda tidak bisa menghapus akun Anda sendiri yang sedang login.' }, 400, corsHeaders);
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first();
    if (!existing) {
      return json({ success: false, error: 'User tidak ditemukan.' }, 404, corsHeaders);
    }

    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();
    return json({ success: true, message: 'User berhasil dihapus.' }, 200, corsHeaders);
  }

  return json({ error: 'Endpoint admin tidak ditemukan.' }, 404, corsHeaders);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. PUBLIC ENDPOINTS
      if (path === '/api/tenant/info' && request.method === 'GET') {
        if (isAdminHost(url.hostname)) {
          return json({ success: true, is_admin: true }, 200, corsHeaders);
        }

        const subdomain = url.hostname.split('.')[0].toLowerCase();
        const tenant = await env.DB.prepare(
          'SELECT id, subdomain, name, address, is_active FROM tenants WHERE subdomain = ? AND is_active = 1'
        ).bind(subdomain).first();

        if (!tenant) return json({ success: false, error: 'Subdomain toko tidak terdaftar atau tidak aktif.' }, 404, corsHeaders);
        return json({ success: true, is_admin: false, data: tenant }, 200, corsHeaders);
      }

      if (path === '/api/login' && request.method === 'POST') {
        const body = (await request.json()) as { username?: string; password?: string; tenant_id?: string };
        const { username, password } = body;

        if (!username || !password) {
          return json({ error: 'Username dan password wajib diisi' }, 400, corsHeaders);
        }

        const passwordHash = await sha256(password + 'posta_salt_2026');
        // Instalasi lama mungkin dibuat sebelum aplikasi memakai salt, atau bahkan
        // menyimpan password apa adanya. Terima dulu bentuk lama ini supaya akun
        // tidak terkunci, lalu upgrade otomatis ke hash bersalt begitu berhasil login.
        const legacyPasswordHash = await sha256(password);

        // SUPERADMIN/DEVELOPER hanya bisa login dari portal pusat (host admin).
        const isAdminPortal = body.tenant_id === 'admin' || isAdminHost(url.hostname);

        let user:
          | { id: string; tenant_id: string; username: string; full_name: string; role: string; password_hash: string }
          | null = null;
        let resolvedTenant: { id: string; subdomain: string } | null = null;

        if (isAdminPortal) {
          user = await env.DB.prepare(
            "SELECT id, tenant_id, username, full_name, role, password_hash FROM users WHERE username = ? AND role IN ('SUPERADMIN', 'DEVELOPER') AND is_active = 1"
          )
            .bind(username)
            .first();
        } else {
          // Toko SELALU ditentukan dari subdomain URL yang sebenarnya diakses
          // (bukan dari input client), lalu username dicocokkan ke tenant_id
          // berupa UUID resmi ATAU teks subdomain — supaya tetap kompatibel
          // dengan data lama yang mungkin memakai subdomain sebagai tenant_id.
          const subdomain = url.hostname.split('.')[0].toLowerCase();
          resolvedTenant = await env.DB.prepare(
            'SELECT id, subdomain FROM tenants WHERE subdomain = ? AND is_active = 1'
          )
            .bind(subdomain)
            .first<{ id: string; subdomain: string }>();

          if (!resolvedTenant) {
            return json({ error: 'Toko untuk subdomain ini tidak ditemukan atau tidak aktif.' }, 404, corsHeaders);
          }

          user = await env.DB.prepare(
            'SELECT id, tenant_id, username, full_name, role, password_hash FROM users WHERE username = ? AND (tenant_id = ? OR tenant_id = ?) AND is_active = 1'
          )
            .bind(username, resolvedTenant.id, resolvedTenant.subdomain)
            .first();
        }

        const passwordMatches = user && [passwordHash, legacyPasswordHash, password].includes(user.password_hash);
        if (!passwordMatches || !user) {
          return json({ error: 'Username atau password salah' }, 401, corsHeaders);
        }

        if (user.password_hash !== passwordHash) {
          await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            .bind(passwordHash, user.id)
            .run();
        }

        // Rapikan otomatis: jika tenant_id user ini tersimpan sebagai teks subdomain
        // (bukan UUID resmi tenants.id), samakan sekali agar konsisten ke depannya.
        if (resolvedTenant && user.tenant_id !== resolvedTenant.id) {
          await env.DB.prepare('UPDATE users SET tenant_id = ? WHERE id = ?')
            .bind(resolvedTenant.id, user.id)
            .run();
          user.tenant_id = resolvedTenant.id;
        }

        const token = await createJWT(
          {
            id: user.id,
            tenant_id: user.tenant_id,
            tenant_subdomain: resolvedTenant?.subdomain,
            username: user.username,
            role: user.role,
            exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
          },
          getJwtSecret(env)
        );

        return json(
          {
            token,
            user: {
              id: user.id,
              tenant_id: user.tenant_id,
              username: user.username,
              full_name: user.full_name,
              role: user.role,
            },
          },
          200,
          corsHeaders
        );
      }

      // 2. PROTECTED ENDPOINTS
      if (path.startsWith('/api/')) {
        const authUser = await verifyJWT(request.headers.get('Authorization'), getJwtSecret(env));

        const protectedPrefixes = ['/api/checkout', '/api/stock', '/api/po', '/api/reports', '/api/shifts', '/api/admin', '/api/employees'];
        const isProtected = protectedPrefixes.some((prefix) => path.startsWith(prefix));

        if (isProtected && !authUser) {
          return new Response(JSON.stringify({ error: 'Sesi kedaluwarsa atau tidak terautentikasi. Silakan login kembali.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        if (path.startsWith('/api/admin')) {
          if (!authUser || !isPlatformAdmin(authUser.role)) {
            return json({ error: 'Akses khusus Superadmin.' }, 403, corsHeaders);
          }
          return await handleAdminRoutes(request, env, corsHeaders, authUser, url);
        }

        if (path.startsWith('/api/products')) {
          // Ubah & hapus produk khusus Owner/Admin. Lihat & tambah produk baru
          // (termasuk quick-add saat barcode belum ada di form barang masuk) boleh semua role toko.
          if ((request.method === 'PUT' || request.method === 'DELETE') && !isTenantManager(authUser?.role)) {
            return json({ error: 'Ubah/hapus produk khusus Owner/Admin.' }, 403, corsHeaders);
          }
          return await (handleProductsRoutes as any)(request, env, corsHeaders, authUser);
        }
        // Transaksi, buka/tutup shift, dan input barang masuk (PO) boleh diakses semua role toko,
        // termasuk CASHIER.
        if (path.startsWith('/api/checkout')) {
          return await (handleCheckoutRoutes as any)(request, env, corsHeaders, authUser);
        }
        if (path.startsWith('/api/po')) {
          return await (handlePORoutes as any)(request, env, corsHeaders, authUser);
        }
        if (path.startsWith('/api/shifts')) {
          return await (handleShiftsRoutes as any)(request, env, corsHeaders, authUser);
        }
        // Penyesuaian stok, laporan, dan manajemen karyawan khusus OWNER/ADMIN (bukan CASHIER).
        if (path.startsWith('/api/stock')) {
          if (!isTenantManager(authUser?.role)) {
            return json({ error: 'Fitur penyesuaian stok khusus Owner/Admin.' }, 403, corsHeaders);
          }
          return await (handleStockRoutes as any)(request, env, corsHeaders, authUser);
        }
        if (path.startsWith('/api/reports')) {
          if (!isTenantManager(authUser?.role)) {
            return json({ error: 'Fitur laporan khusus Owner/Admin.' }, 403, corsHeaders);
          }
          return await (handleReportsRoutes as any)(request, env, corsHeaders, authUser);
        }
        if (path.startsWith('/api/employees')) {
          // Semua role toko boleh akses endpoint karyawan; pembatasan detail
          // (Kasir hanya akun sendiri & hanya password) ditangani di dalam handler.
          if (!authUser?.tenant_id && !isPlatformAdmin(authUser?.role)) {
            return json({ error: 'Akun ini tidak terhubung ke toko manapun.' }, 400, corsHeaders);
          }
          return await handleEmployeesRoutes(request, env, corsHeaders, authUser as UserPayload);
        }
      }

      return new Response(JSON.stringify({ error: 'Endpoint tidak ditemukan' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown Server Error';
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
