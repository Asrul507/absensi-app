// ========================================================
// AMBIL KONEKSI DATABASE & USER DARI HALAMAN UTAMA GENPRO
// ========================================================
if (typeof window.supabase === 'undefined' && window.parent && window.parent.supabase) {
    window.supabase = window.parent.supabase;
}

var supabase = window.supabase;
var currentUser = {};

function updateCurrentUser() {
    currentUser = window.currentUser || window.parent?.currentUser || {};
    if (!currentUser.office_id && currentUser.user) {
        currentUser = currentUser.user;
    }
}

updateCurrentUser();

document.addEventListener("DOMContentLoaded", async () => {
    updateCurrentUser();

    // Keamanan Akses Halaman
    if (currentUser.role && ['staff', 'admin_departement'].includes(currentUser.role)) {
        document.body.innerHTML = "<h3 class='text-center mt-5 text-danger'>Akses Ditolak. Halaman ini hanya untuk HR/Admin.</h3>";
        return;
    }

    // Load semua opsi dropdown awal
    await loadOpsiKaryawan();
    await loadOpsiTemplate();
    await loadDataMapping();

    // Event Listener untuk Form Simpan Pemetaan
    const formMapping = document.getElementById('form-mapping');
    if (formMapping) {
        formMapping.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('pilih-karyawan')?.value;
            const templateId = document.getElementById('pilih-template')?.value;

            if (!userId || !templateId) {
                return alert("Silakan pilih karyawan dan template terlebih dahulu!");
            }

            // Gunakan upsert agar jika karyawan sudah punya pemetaan, datanya langsung terupdate
            const { error } = await supabase.from('payroll_mappings').upsert([{
                user_id: userId,
                template_id: templateId
            }], { onConflict: 'user_id' });

            if (error) return alert("Gagal menyimpan pemetaan: " + error.message);
            
            alert("Pemetaan gaji karyawan berhasil disimpan!");
            formMapping.reset();
            await loadDataMapping();
        });
    }
});

// --- 1. LOAD OPSI KARYAWAN BERDASARKAN OFFICE ---
async function loadOpsiKaryawan() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId) return;

    // Menarik data user/karyawan yang aktif di kantor tersebut
    const { data, error } = await supabase
        .from('users')
        .select('id, nama')
        .eq('office_id', targetOfficeId)
        .order('nama');

    const selectKaryawan = document.getElementById('pilih-karyawan');
    if (!selectKaryawan) return;
    
    selectKaryawan.innerHTML = '<option value="">-- Pilih Karyawan --</option>';
    if (data) {
        data.forEach(emp => {
            selectKaryawan.innerHTML += `<option value="${emp.id}">${emp.nama}</option>`;
        });
    }
}

// --- 2. LOAD OPSI TEMPLATE GAJI BERDASARKAN OFFICE ---
async function loadOpsiTemplate() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId) return;

    const { data, error } = await supabase
        .from('payroll_templates')
        .select('id, nama_template')
        .eq('office_id', targetOfficeId)
        .order('nama_template');

    const selectTemplate = document.getElementById('pilih-template');
    if (!selectTemplate) return;

    selectTemplate.innerHTML = '<option value="">-- Pilih Template --</option>';
    if (data) {
        data.forEach(t => {
            selectTemplate.innerHTML += `<option value="${t.id}">${t.nama_template}</option>`;
        });
    }
}

// --- 3. LOAD DATA TABEL PEMETAAN YANG SUDAH ADA ---
async function loadDataMapping() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId) return;

    // Tarik data mapping beserta relasi nama karyawan dan nama templatenya
    const { data, error } = await supabase
        .from('payroll_mappings')
        .select(`
            user_id,
            template_id,
            users ( nama ),
            payroll_templates ( nama_template )
        `)
        .textSearch('users.office_id', targetOfficeId); // Memastikan relasi user sesuai kantor

    const tbody = document.getElementById('list-mapping-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Alternatif jika filter join di atas terlalu kompleks untuk RLS kantor:
    // Kita filter manual datanya agar aman
    const filteredData = data?.filter(m => m.users && m.payroll_templates) || [];

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Belum ada pemetaan karyawan</td></tr>';
        return;
    }

    filteredData.forEach(m => {
        tbody.innerHTML += `
            <tr>
                <td>${m.users?.nama || 'Tidak Diketahui'}</td>
                <td>${m.payroll_templates?.nama_template || 'Tanpa Template'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="hapusMapping('${m.user_id}')">Hapus</button>
                </td>
            </tr>`;
    });
}

// Expose fungsi hapus ke global window agar bisa diklik dari iframe
window.hapusMapping = async function(userId) {
    if (!confirm("Apakah Anda yakin ingin menghapus pemetaan gaji karyawan ini?")) return;

    const { error } = await supabase
        .from('payroll_mappings')
        .delete()
        .eq('user_id', userId);

    if (error) return alert("Gagal menghapus: " + error.message);
    await loadDataMapping();
};
