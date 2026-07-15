// js/payroll-control.js

// Asumsi: currentUser memiliki properti 'role', 'office_id', dan 'id'
let currentUser = {
    id: "",
    role: "", // super_admin, admin_all, admin_hr, admin_departement, staff
    office_id: ""
};

// 1. Inisialisasi Halaman & Validasi Hak Akses Menu
async function initPayrollMenu() {
    currentUser = await fetchUserSessionData(); // Ambil sesi aktif dari Supabase Auth/Profiles
    
    const role = currentUser.role;

    // Render filter kantor untuk Super Admin
    if (role === 'super_admin') {
        renderOfficeFilterSelector(); // Menampilkan pilihan kantor/domain
    } else {
        hideOfficeFilterSelector(); // Kunci filter ke office_id milik admin tersebut
    }

    // Atur visibilitas tombol aksi berdasarkan Rincian Fitur
    setupAksiButtons(role);
    
    // Muat data default
    loadPayrollPeriods();
}

function setupAksiButtons(role) {
    const btnGenerate = document.getElementById('btn-generate-payroll');
    const btnApprove = document.getElementById('btn-approve-all');
    const sectionConfig = document.getElementById('section-konfigurasi-gaji');

    if (role === 'super_admin' || role === 'admin_all') {
        if(btnGenerate) btnGenerate.disabled = false;
        if(btnApprove) btnApprove.disabled = false;
        if(sectionConfig) sectionConfig.style.display = 'block';
    } 
    else if (role === 'admin_hr') {
        // admin_hr: Melakukan edit, tambah data, dan pengajuan payroll
        if(btnGenerate) btnGenerate.disabled = false;
        if(btnApprove) btnApprove.disabled = true; // Tidak bisa approve final
        if(sectionConfig) sectionConfig.style.display = 'block';
    } 
    else {
        // admin_departement & staff: Hanya bisa lihat history dan slip gaji masing-masing
        if(btnGenerate) btnGenerate.style.display = 'none';
        if(btnApprove) btnApprove.style.display = 'none';
        if(sectionConfig) sectionConfig.style.display = 'none';
        
        // Paksa filter data hanya mengarah ke ID mereka sendiri
        restrictViewToSelf();
    }
}

// 2. Mengambil Data Payroll Berdasarkan Filter Kantor & Periode
async function loadPayrollData(selectedPeriodId, targetOfficeId = null) {
    let query = supabase
        .from('payroll_runs')
        .select(`
            id, total_pemasukan, total_potongan, gaji_bersih, status,
            profiles ( nama_lengkap, departemen )
        `);

    // Atur Filter berdasarkan Kantor/Domain
    if (currentUser.role === 'super_admin') {
        if (targetOfficeId) {
            query = query.eq('office_id', targetOfficeId);
        }
    } else {
        // admin_all, admin_hr, admin_departement, staff hanya melihat kantor mereka sendiri
        query = query.eq('office_id', currentUser.office_id);
    }

    // Atur Filter berdasarkan hak akses perorangan (Staff & Admin Departement)
    if (currentUser.role === 'staff' || currentUser.role === 'admin_departement') {
        query = query.eq('user_id', currentUser.id);
    }

    query = query.eq('period_id', selectedPeriodId);

    const { data, error } = await query;
    if (error) return console.error("Gagal memuat data rekap:", error);

    renderPayrollTable(data);
}

// 3. Fungsi Aksi Approve Khusus untuk admin_all dan super_admin
async function approvePayrollRun(payrollRunId) {
    if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin_all') {
        alert("Akses Ditolak: Hanya admin_all atau super_admin yang dapat menyetujui payroll.");
        return;
    }

    const { data, error } = await supabase
        .from('payroll_runs')
        .update({ 
            status: 'Approved',
            approved_by: currentUser.id,
            approved_at: new Date().toISOString()
        })
        .eq('id', payrollRunId)
        .select();

    if (error) {
        alert("Gagal menyetujui payroll: " + error.message);
    } else {
        alert("Payroll berhasil diapprove. Slip gaji resmi diterbitkan!");
        // Refresh tabel
        triggerRefreshTable();
    }
}
