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
                // Load data payroll yang sudah ter-generate
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

    const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("🚨 ERROR LOAD PERIODE:", error.message);
        return;
    }

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

// --- 2. MEMUAT HASIL DATA TABEL PAYROLL (REAL DATABASE) ---
async function loadTabelPayroll(periodeId) {
    const tbody = document.getElementById('payroll-run-table');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Memuat data payroll...</td></tr>';

    // Ambil data dari payroll_slips join dengan profiles untuk ambil nama lengkap
    const { data, error } = await supabase
        .from('payroll_slips')
        .select(`
            id,
            user_id,
            total_pemasukan,
            total_potongan,
            gaji_bersih,
            status,
            profiles ( nama_lengkap )
        `)
        .eq('period_id', periodeId);

    if (error) {
        console.error("🚨 ERROR LOAD TABEL PAYROLL:", error.message);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Gagal memuat data slip gaji.</td></tr>';
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-info">Periode dipilih. Silakan klik tombol "Ambil Template & Hitung Gaji" untuk memproses.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    data.forEach(s => {
        const badgeColor = s.status === 'Approved' ? 'bg-success' : 'bg-warning';
        tbody.innerHTML += `
            <tr>
                <td><strong>${s.profiles?.nama_lengkap || 'Karyawan Tanpa Nama'}</strong></td>
                <td class="text-success">Rp ${(s.total_pemasukan || 0).toLocaleString('id-ID')}</td>
                <td class="text-danger">Rp ${(s.total_potongan || 0).toLocaleString('id-ID')}</td>
                <td><strong>Rp ${(s.gaji_bersih || 0).toLocaleString('id-ID')}</strong></td>
                <td><span class="badge ${badgeColor}">${s.status || 'Draft'}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-dark py-0 px-2" onclick="lihatDetailSlip('${s.id}')">👁️ Detail</button>
                </td>
            </tr>`;
    });
}

function resetTabelPayroll() {
    const tbody = document.getElementById('payroll-run-table');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Silakan tentukan periode di atas.</td></tr>';
    }
}

// --- 3. AKSI GENERATE & KALKULASI GAJI NYATA ---
async function prosesGenerateGaji(periodeId) {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId) return alert("Session kantor tidak valid.");

    if (!confirm("Apakah Anda yakin ingin memproses kalkulasi gaji untuk semua karyawan pada periode ini?")) return;

    // A. Ambil semua data pemetaan karyawan
    const { data: mappings, error: errMap } = await supabase
        .from('payroll_mappings')
        .select(`
            user_id,
            template_id,
            profiles!inner(client_id)
        `);

    if (errMap) return alert("Gagal mengambil data pemetaan: " + errMap.message);

    // Filter agar hanya memproses karyawan milik client/kantor ini
    const filteredMappings = mappings?.filter(m => m.profiles && m.profiles.client_id === targetOfficeId) || [];

    if (filteredMappings.length === 0) {
        return alert("Belum ada karyawan yang dihubungkan ke template gaji di menu Pemetaan.");
    }

    let suksesCount = 0;

    // B. Looping kalkulasi per karyawan
    for (const map of filteredMappings) {
        // Ambil rincian komponen dari template yang terhubung
        const { data: details } = await supabase
            .from('payroll_template_details')
            .select(`
                nominal,
                payroll_components ( jenis )
            `)
            .eq('template_id', map.template_id);

        let totalPemasukan = 0;
        let totalPotongan = 0;

        details?.forEach(d => {
            const nominal = parseFloat(d.nominal) || 0;
            if (d.payroll_components?.jenis === 'pemasukan') {
                totalPemasukan += nominal;
            } else if (d.payroll_components?.jenis === 'potongan') {
                totalPotongan += nominal;
            }
        });

        const gajiBersih = totalPemasukan - totalPotongan;

        // Simpan atau update ke tabel payroll_slips
        const { error: errInsert } = await supabase
            .from('payroll_slips')
            .upsert([{
                period_id: periodeId,
                user_id: map.user_id,
                total_pemasukan: totalPemasukan,
                total_potongan: totalPotongan,
                gaji_bersih: gajiBersih,
                status: 'Draft'
            }], { onConflict: 'period_id,user_id' });

        if (!errInsert) suksesCount++;
    }

    alert(`Proses selesai! Berhasil menghitung ${suksesCount} slip gaji.`);
    
    // C. Muat ulang tampilan tabel
    await loadTabelPayroll(periodeId);
}

// Fungsi pembantu ketika tombol detail diklik
window.lihatDetailSlip = function(slipId) {
    alert("Detail slip ID: " + slipId);
};
