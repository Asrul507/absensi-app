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

    // Ambil daftar periode yang statusnya 'Open' untuk dipilih saat generate
    await loadOpsiPeriode();

    // Event Listener untuk tombol Proses/Generate Payroll
    const formGenerate = document.getElementById('form-generate-payroll');
    if (formGenerate) {
        formGenerate.addEventListener('submit', async (e) => {
            e.preventDefault();
            const periodeId = document.getElementById('pilih-periode-generate')?.value;

            if (!periodeId) {
                return alert("Silakan pilih periode payroll terlebih dahulu!");
            }

            // Jalankan fungsi proses kalkulasi payroll di sini
            await prosesGeneratePayroll(periodeId);
        });
    }
});

// --- 1. LOAD PERIODE GAJI BERDASARKAN OFFICE ID / CLIENT ID ---
async function loadOpsiPeriode() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    
    if (!targetOfficeId || targetOfficeId === 'undefined') {
        console.error("Gagal load periode: ID Kantor tidak terdeteksi.");
        return;
    }

    // Mengambil periode dari tabel payroll_periods
    const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .eq('office_id', targetOfficeId) // Pastikan ini sesuai dengan nama kolom di payroll_periods Anda
        .order('created_at', { ascending: false });

    if (error) {
        console.error("🚨 ERROR DARI SUPABASE SAAT LOAD PERIODE:", error.message);
        return;
    }

    const selectPeriode = document.getElementById('pilih-periode-generate');
    if (!selectPeriode) return;

    selectPeriode.innerHTML = '<option value="">-- Pilih Periode Aktif --</option>';
    
    if (!data || data.length === 0) {
        selectPeriode.innerHTML = '<option value="">Belum ada periode dibuat / open</option>';
        return;
    }

    data.forEach(p => {
        selectPeriode.innerHTML += `<option value="${p.id}">${p.nama_periode} (${p.tanggal_mulai} s/d ${p.tanggal_selesai}) - [${p.status}]</option>`;
    });
}

// --- 2. FUNGSI UTAMA PROSES GENERATE PAYROLL ---
async function prosesGeneratePayroll(periodeId) {
    alert("Memulai proses kalkulasi payroll untuk periode terpilih...");
    // Di sini nanti logika hitung absen + komponen template dimasukkan.
}
