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

    // Tampilkan Role di Indikator Atas
    const roleIndicator = document.getElementById('role-indicator');
    if (roleIndicator && currentUser.role) {
        roleIndicator.innerText = `Role: ${currentUser.role.toUpperCase()}`;
    }

    // Keamanan Akses Halaman
    if (currentUser.role && ['staff', 'admin_departement'].includes(currentUser.role)) {
        document.body.innerHTML = "<h3 class='text-center mt-5 text-danger'>Akses Ditolak. Halaman ini hanya untuk HR/Admin.</h3>";
        return;
    }

    // Load data opsi periode ke dropdown
    await loadOpsiPeriode();

    // Event Listener ketika periode dipilih
    const selectPeriode = document.getElementById('run-pilih-periode');
    const btnHitung = document.getElementById('btn-proses-hitung');
    const btnApprove = document.getElementById('btn-approve-massal');

    if (selectPeriode) {
        selectPeriode.addEventListener('change', () => {
            const periodeId = selectPeriode.value;
            if (periodeId) {
                if (btnHitung) btnHitung.style.display = 'block';
                if (btnApprove) btnApprove.style.display = 'block';
                // Load data payroll yang sudah ter-generate (jika ada)
                loadTabelPayroll(periodeId);
            } else {
                if (btnHitung) btnHitung.style.display = 'none';
                if (btnApprove) btnApprove.style.display = 'none';
                resetTabelPayroll();
            }
        });
    }

    // Event Listener aksi hitung gaji
    if (btnHitung) {
        btnHitung.addEventListener('click', async () => {
            const periodeId = selectPeriode?.value;
            if (!periodeId) return alert("Pilih periode terlebih dahulu!");
            
            await prosesGenerateGaji(periodeId);
        });
    }
});

// --- 1. MEMUAT PERIODE AKTIF DARI DATABASE ---
async function loadOpsiPeriode() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    // Menarik data periode payroll
    const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("🚨 ERROR LOAD PERIODE:", error.message);
        return;
    }

    // Filter data periode berdasarkan office_id atau client_id tenant
    const filteredPeriods = data?.filter(p => p.office_id === targetOfficeId || p.client_id === targetOfficeId) || [];

    const selectPeriode = document.getElementById('run-pilih-periode');
    if (!selectPeriode) return;

    selectPeriode.innerHTML = '<option value="">-- Pilih Periode --</option>';
    
    if (filteredPeriods.length === 0) {
        selectPeriode.innerHTML = '<option value="">Belum ada periode yang dibuat</option>';
        return;
    }

    filteredPeriods.forEach(p => {
        selectPeriode.innerHTML += `<option value="${p.id}">${p.nama_periode} (${p.tanggal_mulai} s/d ${p.tanggal_selesai})</option>`;
    });
}

// --- 2. MEMUAT HASIL DATA TABEL PAYROLL ---
async function loadTabelPayroll(periodeId) {
    const tbody = document.getElementById('payroll-run-table');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Memuat data payroll...</td></tr>';

    // Di sini nanti proses select ke tabel hasil payroll kamu (misal: payroll_runs / slips)
    // Sementara kita tampilkan info siap hitung
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-info">Periode dipilih. Silakan klik tombol "Ambil Template & Hitung Gaji" untuk memproses.</td></tr>`;
}

function resetTabelPayroll() {
    const tbody = document.getElementById('payroll-run-table');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Silakan tentukan periode di atas.</td></tr>';
    }
}

// --- 3. AKSI GENERATE & KALKULASI GAJI ---
async function prosesGenerateGaji(periodeId) {
    alert("Memulai sinkronisasi template dan kalkulasi gaji komponen...");
    // Logika penggabungan absensi + template data payroll diletakkan di bawah sini
}
