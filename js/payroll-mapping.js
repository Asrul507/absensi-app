import { supabase } from './supabase.js';

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
    const salaryModeSelect = document.getElementById('salary-mode');
    const hariKerjaWrapper = document.getElementById('hari-kerja-wrapper');
    const hariKerjaInput = document.getElementById('hari-kerja-per-bulan');

    const syncModeHarianInput = () => {
        const isHarian = salaryModeSelect?.value === 'harian';
        if (hariKerjaWrapper) hariKerjaWrapper.style.display = isHarian ? 'block' : 'none';
        if (hariKerjaInput) {
            hariKerjaInput.value = isHarian ? (hariKerjaInput.value || '26') : '26';
            hariKerjaInput.required = isHarian;
        }
    };

    if (salaryModeSelect) {
        salaryModeSelect.addEventListener('change', syncModeHarianInput);
        syncModeHarianInput();
    }

    if (formMapping) {
        formMapping.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('pilih-karyawan')?.value;
            const templateId = document.getElementById('pilih-template')?.value;
            const namaBank = document.getElementById('nama-bank')?.value || '';
            const nomorRekening = document.getElementById('nomor-rekening')?.value || '';
            const salaryMode = document.getElementById('salary-mode')?.value || 'bulanan';
            const hariKerjaRaw = parseInt(document.getElementById('hari-kerja-per-bulan')?.value || '26', 10);
            const hariKerja = Number.isFinite(hariKerjaRaw) ? hariKerjaRaw : 26;

            if (!userId || !templateId) {
                return alert("Silakan pilih karyawan dan template terlebih dahulu!");
            }
            if (!['bulanan', 'harian'].includes(salaryMode)) {
                return alert("Mode gaji tidak valid.");
            }
            if (salaryMode === 'harian' && (hariKerja < 20 || hariKerja > 31)) {
                return alert("Hari kerja per bulan wajib antara 20 sampai 31.");
            }

            const { error } = await supabase.from('payroll_mappings').upsert([{
                user_id: userId,
                template_id: templateId,
                nama_bank: namaBank,
                nomor_rekening: nomorRekening,
                salary_mode: salaryMode,
                hari_kerja_per_bulan: salaryMode === 'harian' ? hariKerja : 26
            }], { onConflict: 'user_id' });

            if (error) return alert("Gagal menyimpan pemetaan: " + error.message);
            
            alert("Pemetaan gaji karyawan berhasil disimpan!");
            formMapping.reset();
            if (salaryModeSelect) salaryModeSelect.value = 'bulanan';
            if (hariKerjaInput) hariKerjaInput.value = '26';
            syncModeHarianInput();
            await loadDataMapping();
        });
    }
});

// --- 1. LOAD OPSI KARYAWAN DARI TABEL PROFILES (Hanya Menggunakan client_id) ---
async function loadOpsiKaryawan() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    // Bersih dari office_id untuk mencegah error database
    const { data, error } = await supabase
        .from('profiles')
        .select('id, nama_lengkap, client_id')
        .order('nama_lengkap');

    if (error) {
        console.error("🚨 ERROR DARI SUPABASE SAAT LOAD KARYAWAN:", error.message);
        return;
    }

    // Filter berdasarkan client_id kantor yang aktif
    const filteredUsers = data?.filter(emp => emp.client_id === targetOfficeId) || [];

    const selectKaryawan = document.getElementById('pilih-karyawan');
    if (!selectKaryawan) return;
    
    selectKaryawan.innerHTML = '<option value="">-- Pilih Karyawan --</option>';
    filteredUsers.forEach(emp => {
        selectKaryawan.innerHTML += `<option value="${emp.id}">${emp.nama_lengkap}</option>`;
    });
}

// --- 2. LOAD DATA TABEL PEMETAAN DENGAN RELASI PROFILES ---
async function loadDataMapping() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    const { data, error } = await supabase
        .from('payroll_mappings')
        .select(`
            user_id,
            template_id,
            nama_bank,
            nomor_rekening,
            salary_mode,
            hari_kerja_per_bulan,
            profiles!inner ( nama_lengkap, client_id ),
            payroll_templates ( nama_template )
        `);

    if (error) {
        console.error("🚨 ERROR DARI SUPABASE SAAT LOAD DATA MAPPING:", error.message);
        return;
    }

    const tbody = document.getElementById('list-mapping-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filter data di sisi client hanya berdasarkan client_id yang cocok
    const filteredData = data?.filter(m => 
        m.profiles && 
        m.profiles.client_id === targetOfficeId && 
        m.payroll_templates
    ) || [];

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada pemetaan karyawan</td></tr>';
        return;
    }

    filteredData.forEach(m => {
        const bankInfo = m.nama_bank && m.nomor_rekening
            ? `${m.nama_bank} / ${m.nomor_rekening}`
            : (m.nama_bank || m.nomor_rekening || '<span class="text-muted small">-</span>');
        const salaryMode = m.salary_mode === 'harian' ? 'Harian' : 'Bulanan';
        const modeInfo = m.salary_mode === 'harian'
            ? `${salaryMode}<br><small class="text-muted">${m.hari_kerja_per_bulan || 26} hari/bulan</small>`
            : salaryMode;
        tbody.innerHTML += `
            <tr>
                <td>${m.profiles?.nama_lengkap || 'Tidak Diketahui'}</td>
                <td>${m.payroll_templates?.nama_template || 'Tanpa Template'}</td>
                <td>${bankInfo}</td>
                <td>${modeInfo}</td>
                <td>
                    <button class="btn btn-sm btn-danger py-0 px-2" onclick="hapusMapping('${m.user_id}')">Hapus</button>
                </td>
            </tr>`;
    });
}

// --- 3. LOAD OPSI TEMPLATE GAJI ---
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

// --- 4. HAPUS DATA PEMETAAN ---
window.hapusMapping = async function(userId) {
    if (!confirm("Apakah Anda yakin ingin menghapus pemetaan gaji karyawan ini?")) return;

    const { error } = await supabase
        .from('payroll_mappings')
        .delete()
        .eq('user_id', userId);

    if (error) return alert("Gagal menghapus: " + error.message);
    await loadDataMapping();
};
