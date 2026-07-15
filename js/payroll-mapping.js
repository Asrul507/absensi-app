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

    // Load data dropdown dan tabel
    await loadOpsiKaryawan();
    await loadOpsiTemplate();
    await loadDataMapping();

    const formMapping = document.getElementById('form-mapping');
    if (formMapping) {
        formMapping.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('pilih-karyawan')?.value;
            const templateId = document.getElementById('pilih-template')?.value;

            if (!userId || !templateId) {
                return alert("Silakan pilih karyawan dan template terlebih dahulu!");
            }

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

async function loadOpsiKaryawan() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    // UBAH KE client_id agar sesuai dengan tabel data karyawan GenPro kamu
    const { data, error } = await supabase
        .from('users')
        .select('id, nama')
        .eq('client_id', targetOfficeId) // <-- Diubah dari office_id menjadi client_id
        .order('nama');

    if (error) {
        console.error("Error load karyawan:", error.message);
        return;
    }

    const selectKaryawan = document.getElementById('pilih-karyawan');
    if (!selectKaryawan) return;
    
    selectKaryawan.innerHTML = '<option value="">-- Pilih Karyawan --</option>';
    data?.forEach(emp => {
        selectKaryawan.innerHTML += `<option value="${emp.id}">${emp.nama}</option>`;
    });
}

async function loadOpsiTemplate() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    const { data } = await supabase
        .from('payroll_templates')
        .select('id, nama_template')
        .eq('office_id', targetOfficeId)
        .order('nama_template');

    const selectTemplate = document.getElementById('pilih-template');
    if (!selectTemplate) return;

    selectTemplate.innerHTML = '<option value="">-- Pilih Template Gaji --</option>';
    data?.forEach(t => {
        selectTemplate.innerHTML += `<option value="${t.id}">${t.nama_template}</option>`;
    });
}

async function loadDataMapping() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    const { data } = await supabase
        .from('payroll_mappings')
        .select(`
            user_id,
            template_id,
            users ( nama, office_id ),
            payroll_templates ( nama_template )
        `);

    const tbody = document.getElementById('list-mapping-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Ganti baris filter di dalam fungsi loadDataMapping() menjadi seperti ini:
const filteredData = data?.filter(m => m.users && (m.users.office_id === targetOfficeId || m.users.client_id === targetOfficeId) && m.payroll_templates) || [];

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
                    <button class="btn btn-sm btn-danger py-0 px-2" onclick="hapusMapping('${m.user_id}')">Hapus</button>
                </td>
            </tr>`;
    });
}

window.hapusMapping = async function(userId) {
    if (!confirm("Apakah Anda yakin ingin menghapus pemetaan gaji karyawan ini?")) return;

    const { error } = await supabase
        .from('payroll_mappings')
        .delete()
        .eq('user_id', userId);

    if (error) return alert("Gagal menghapus: " + error.message);
    await loadDataMapping();
};
