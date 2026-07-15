// js/payroll-mapping.js

// BENAR: Mengambil session langsung dari aplikasi utama GenPro
let currentUser = window.currentUser;

// Jika session global belum siap sewaktu di-load di dalam iframe
if (!currentUser && window.parent && window.parent.currentUser) {
    currentUser = window.parent.currentUser;
}

document.addEventListener("DOMContentLoaded", async () => {
    // Proteksi Role: Hanya Manajemen yang boleh mengutak-atik kompensasi karyawan
    if (['staff', 'admin_departement'].includes(userSession.role)) {
        document.body.innerHTML = "<h3 class='text-center mt-5 text-danger'>Akses Ditolak.</h3>";
        return;
    }

    await loadKaryawanDropdown();
    await loadTemplateDropdown();
    await loadMappingTable();
});

// 1. Ambil daftar karyawan di kantor ini untuk pilihan Dropdown
async function loadKaryawanDropdown() {
    const { data } = await supabase
        .from('profiles')
        .select('user_id, nama_lengkap')
        .eq('office_id', userSession.office_id);

    const select = document.getElementById('map-karyawan');
    data?.forEach(k => {
        select.innerHTML += `<option value="${k.user_id}">${k.nama_lengkap}</option>`;
    });
}

// 2. Ambil daftar master template gaji untuk pilihan Dropdown
async function loadTemplateDropdown() {
    const { data } = await supabase
        .from('payroll_templates')
        .select('id, nama_template')
        .eq('office_id', userSession.office_id);

    const select = document.getElementById('map-template');
    data?.forEach(t => {
        select.innerHTML += `<option value="${t.id}">${t.nama_template}</option>`;
    });
}

// 3. Aksi Submit untuk Menyimpan Pemetaan (Hubungan)
document.getElementById('form-mapping').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('map-karyawan').value;
    const templateId = document.getElementById('map-template').value;

    // Simpan atau update ke tabel 'payroll_employee_templates'
    const { error } = await supabase
        .from('payroll_employee_templates')
        .upsert({
            user_id: userId,
            template_id: templateId,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

    if (error) {
        alert("Gagal menghubungkan karyawan: " + error.message);
    } else {
        alert("Karyawan berhasil dihubungkan ke template gaji!");
        document.getElementById('form-mapping').reset();
        await loadMappingTable(); // Refresh tabel status
    }
});

// 4. Tampilkan Tabel Status untuk Memantau Karyawan yang Belum Dapat Gaji
async function loadMappingTable() {
    const tbody = document.getElementById('table-mapping-status');
    tbody.innerHTML = '';

    // Lakukan query ke profiles untuk melihat status template gajinya saat ini
    const { data, error } = await supabase
        .from('profiles')
        .select(`
            user_id, nama_lengkap, departemen,
            payroll_employee_templates (
                updated_at,
                payroll_templates ( nama_template )
            )
        `)
        .eq('office_id', userSession.office_id);

    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Tidak ada data karyawan ditemukan.</td></tr>`;
        return;
    }

    data.forEach(item => {
        // Cek apakah data template terhubung atau masih kosong
        const hasTemplate = item.payroll_employee_templates;
        const namaTemplate = hasTemplate?.payroll_templates?.nama_template || '<span class="text-danger fw-bold">Belum Diatur (Gaji Rp 0)</span>';
        const tglUpdate = hasTemplate ? new Date(hasTemplate.updated_at).toLocaleDateString('id-ID') : '-';

        tbody.innerHTML += `
            <tr>
                <td><strong>${item.nama_lengkap}</strong></td>
                <td>${item.departemen || '-'}</td>
                <td>${namaTemplate}</td>
                <td class="small text-muted">${tglUpdate}</td>
            </tr>`;
    });
}
