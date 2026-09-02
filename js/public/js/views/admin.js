import { showToast, formatRupiah } from '../state.js';
import { api } from '../api.js';

let tenantListCache = [];
let userListCache = [];
let editingUserId = null;

// =========================================================================
// 1. DAFTAR TENANT & LOGIN INSTAN (IMPERSONATE)
// =========================================================================
export async function loadAdminTenants() {
  const grid = document.getElementById('admin-tenants-grid');
  if (!grid) return;

  grid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-500 text-sm"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i> Memuat daftar toko...</div>';

  try {
    const result = await api.get('/api/admin/tenants');

    if (result.success && result.data) {
      tenantListCache = result.data;
      populateTenantDropdown(result.data);

      if (result.data.length === 0) {
        grid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-500 text-sm">Belum ada toko yang terdaftar.</div>';
        return;
      }

      grid.innerHTML = result.data.map(t => `
        <div class="p-5 bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-2xl transition space-y-4 flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between gap-2">
              <div>
                <span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400">
                  ${t.subdomain}.posta.gpro.my.id
                </span>
                <h3 class="text-base font-bold text-white mt-1">${t.name}</h3>
              </div>
              <span class="w-2.5 h-2.5 rounded-full ${t.is_active ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
            </div>
            <p class="text-xs text-slate-400 mt-1">${t.address || 'Alamat belum diatur'}</p>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/80 text-xs">
            <div class="bg-slate-900 p-2.5 rounded-xl">
              <span class="text-[10px] text-slate-500 block">Total Produk</span>
              <b class="text-slate-200 text-sm">${t.total_products || 0}</b>
            </div>
            <div class="bg-slate-900 p-2.5 rounded-xl">
              <span class="text-[10px] text-slate-500 block">Transaksi</span>
              <b class="text-emerald-400 text-sm">${t.total_transactions || 0}</b>
            </div>
          </div>

          <button onclick="window.impersonateStore('${t.subdomain}')" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/30">
            <i class="fa-solid fa-arrow-right-to-bracket"></i>
            <span>Masuk ke Toko Ini</span>
          </button>
        </div>
      `).join('');

      // Muat juga daftar user
      loadAdminUsersList();
    }
  } catch (err) {
    grid.innerHTML = '<div class="col-span-full py-12 text-center text-rose-500 text-sm">Gagal memuat daftar toko.</div>';
  }
}

// Fitur Superadmin Langsung Masuk ke Toko Manapun
export async function impersonateStore(subdomain) {
  try {
    const result = await api.get(`/api/admin/impersonate?subdomain=${encodeURIComponent(subdomain)}`);

    if (result.success && result.token) {
      // Buka tab toko baru dengan SSO Token
      window.open(result.target_url, '_blank');
      showToast(`Membuka toko ${subdomain}...`);
    } else {
      showToast(result.error || 'Gagal masuk ke toko', 'error');
    }
  } catch (err) {
    showToast('Gagal memproses sesi Superadmin', 'error');
  }
}

// =========================================================================
// 2. DAFTAR USER SELURUH TOKO & TAMBAH USER
// =========================================================================
export async function loadAdminUsersList() {
  const tbody = document.getElementById('admin-users-table-tbody');
  if (!tbody) return;

  try {
    const result = await api.get('/api/admin/users');

    if (result.success && result.data) {
      userListCache = result.data;

      if (result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500">Belum ada user.</td></tr>';
        return;
      }

      tbody.innerHTML = result.data.map(u => `
        <tr class="hover:bg-slate-900/40 transition">
          <td class="py-3 px-4 font-bold text-white">${u.name}</td>
          <td class="py-3 px-4 font-mono text-slate-400">${u.username}</td>
          <td class="py-3 px-4">
            <span class="text-indigo-400 font-medium">${u.tenant_name}</span>
            <span class="text-[10px] text-slate-500 block font-mono">(${u.subdomain}.posta.gpro.my.id)</span>
          </td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
              u.role === 'SUPERADMIN' ? 'bg-indigo-500/20 text-indigo-300' :
              u.role === 'OWNER' ? 'bg-amber-500/20 text-amber-300' :
              u.role === 'ADMIN' ? 'bg-blue-500/20 text-blue-300' :
              'bg-emerald-500/20 text-emerald-300'
            }">
              ${u.role}
            </span>
          </td>
          <td class="py-3 px-4 text-center">
            <span class="w-2 h-2 rounded-full inline-block ${u.is_active ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
          </td>
          <td class="py-3 px-4 text-center whitespace-nowrap">
            <button onclick="window.openEditUserModalAdmin('${u.id}')" title="Edit user" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-bold text-slate-200 mr-1">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button onclick="window.toggleUserActiveAdmin('${u.id}', ${u.is_active ? 0 : 1})" title="${u.is_active ? 'Nonaktifkan' : 'Aktifkan'} user" class="px-2 py-1 ${u.is_active ? 'bg-amber-900/40 hover:bg-amber-900/60 text-amber-300' : 'bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300'} rounded-lg text-[11px] font-bold mr-1">
              <i class="fa-solid ${u.is_active ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
            </button>
            <button onclick="window.deleteUserAdmin('${u.id}')" title="Hapus user" class="px-2 py-1 bg-rose-900/40 hover:bg-rose-900/60 rounded-lg text-[11px] font-bold text-rose-300">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-rose-500">Gagal memuat user.</td></tr>';
  }
}

function populateTenantDropdown(tenants) {
  const select = document.getElementById('adm-user-tenant-select');
  if (!select) return;

  select.innerHTML = `
    <option value="">-- Pilih Toko Tujuan --</option>
    <option value="SUPERADMIN">⭐ SUPERADMIN (Pusat / Developer)</option>
    ${tenants.map(t => `<option value="${t.id}">${t.name} (${t.subdomain}.posta.gpro.my.id)</option>`).join('')}
  `;
}

export function openCreateUserModalAdmin() {
  editingUserId = null;
  document.getElementById('create-user-admin-modal-title').innerText = 'Tambah User Toko Baru';
  document.getElementById('adm-user-tenant-select').value = '';
  document.getElementById('adm-user-fullname').value = '';
  document.getElementById('adm-user-username').value = '';
  const passwordInput = document.getElementById('adm-user-password');
  passwordInput.value = '';
  passwordInput.required = true;
  passwordInput.placeholder = '••••••••';
  document.getElementById('adm-user-role').value = 'CASHIER';
  document.getElementById('adm-user-active-row').classList.add('hidden');
  document.getElementById('create-user-admin-modal').classList.remove('hidden');
}

export function openEditUserModalAdmin(id) {
  const u = userListCache.find((x) => x.id === id);
  if (!u) return;

  editingUserId = id;
  document.getElementById('create-user-admin-modal-title').innerText = 'Ubah Data User';
  document.getElementById('adm-user-tenant-select').value = u.tenant_id;
  document.getElementById('adm-user-fullname').value = u.name;
  document.getElementById('adm-user-username').value = u.username;
  const passwordInput = document.getElementById('adm-user-password');
  passwordInput.value = '';
  passwordInput.required = false;
  passwordInput.placeholder = 'Kosongkan jika tidak diubah';
  document.getElementById('adm-user-role').value = u.role;
  document.getElementById('adm-user-active-row').classList.remove('hidden');
  document.getElementById('adm-user-active-input').checked = !!u.is_active;
  document.getElementById('create-user-admin-modal').classList.remove('hidden');
}

export async function submitCreateUserAdmin() {
  const tenant_id = document.getElementById('adm-user-tenant-select').value;
  const name = document.getElementById('adm-user-fullname').value.trim();
  const username = document.getElementById('adm-user-username').value.trim();
  const password = document.getElementById('adm-user-password').value.trim();
  const role = document.getElementById('adm-user-role').value;
  const is_active = document.getElementById('adm-user-active-input').checked ? 1 : 0;

  if (!tenant_id || !name || !username || role === '' || (!editingUserId && !password)) {
    showToast('Harap lengkapi semua form!', 'error');
    return;
  }

  const btn = document.getElementById('btn-adm-save-user');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

  try {
    let result;
    if (editingUserId) {
      const payload = { tenant_id, name, username, role, is_active };
      if (password) payload.password = password;
      result = await api.put(`/api/admin/users/${editingUserId}`, payload);
    } else {
      result = await api.post('/api/admin/users', { tenant_id, name, username, password, role });
    }

    if (result.success) {
      showToast(result.message);
      document.getElementById('create-user-admin-modal').classList.add('hidden');
      document.getElementById('adm-user-fullname').value = '';
      document.getElementById('adm-user-username').value = '';
      document.getElementById('adm-user-password').value = '';
      editingUserId = null;
      loadAdminUsersList();
    } else {
      showToast(result.error || 'Gagal menyimpan user', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Terjadi kesalahan jaringan.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Simpan User</span>';
  }
}

export async function toggleUserActiveAdmin(id, nextActive) {
  const u = userListCache.find((x) => x.id === id);
  if (!u) return;

  try {
    const result = await api.put(`/api/admin/users/${id}`, { is_active: nextActive });
    if (result.success) {
      showToast(nextActive ? 'User diaktifkan kembali.' : 'User berhasil dinonaktifkan.');
      loadAdminUsersList();
    } else {
      showToast(result.error || 'Gagal mengubah status user.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Terjadi kesalahan jaringan.', 'error');
  }
}

export async function deleteUserAdmin(id) {
  const u = userListCache.find((x) => x.id === id);
  if (!u) return;

  if (!window.confirm(`Hapus user "${u.name}" (${u.username}) secara permanen?`)) return;

  try {
    const result = await api.delete(`/api/admin/users/${id}`);
    if (result.success) {
      showToast('User berhasil dihapus.');
      loadAdminUsersList();
    } else {
      showToast(result.error || 'Gagal menghapus user.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Terjadi kesalahan jaringan.', 'error');
  }
}

// Modal Tambah Tenant Baru
export function openCreateTenantModal() {
  document.getElementById('create-tenant-modal').classList.remove('hidden');
}
export function closeCreateTenantModal() {
  document.getElementById('create-tenant-modal').classList.add('hidden');
}

export async function submitCreateTenant() {
  const subdomain = document.getElementById('new-tenant-subdomain').value.trim();
  const name = document.getElementById('new-tenant-name').value.trim();
  const address = document.getElementById('new-tenant-address').value.trim();

  if (!subdomain || !name) {
    showToast('Subdomain dan Nama Toko wajib diisi', 'error');
    return;
  }

  const btn = document.getElementById('btn-save-tenant');
  btn.disabled = true;

  try {
    const result = await api.post('/api/admin/tenants', { subdomain, name, address });

    if (result.success) {
      showToast(result.message);
      closeCreateTenantModal();
      document.getElementById('new-tenant-subdomain').value = '';
      document.getElementById('new-tenant-name').value = '';
      document.getElementById('new-tenant-address').value = '';
      loadAdminTenants();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    showToast('Gagal membuat tenant', 'error');
  } finally {
    btn.disabled = false;
  }
}
