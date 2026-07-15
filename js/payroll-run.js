// ========================================================
// AMBIL KONEKSI DATABASE & USER DARI HALAMAN UTAMA GENPRO
// ========================================================
if (typeof window.supabase === 'undefined' && window.parent && window.parent.supabase) {
    window.supabase = window.parent.supabase;
}

var supabase = window.supabase;
var currentUser = window.currentUser || window.parent?.currentUser || {};

function updateCurrentUser() {
    currentUser = window.currentUser || window.parent?.currentUser || {};
    if (!currentUser.office_id && currentUser.user) {
        currentUser = currentUser.user;
    }
}

updateCurrentUser();

document.addEventListener("DOMContentLoaded", async () => {
    updateCurrentUser();

    // Tampilkan Role di Indikator Atas jika sudah ada
    const roleIndicator = document.getElementById('role-indicator');
    if (roleIndicator && currentUser.role) {
        roleIndicator.innerText = `Role: ${currentUser.role.toUpperCase()}`;
    }

    // PENGAMAN UTAMA: Hanya kunci halaman jika rolenya SUDAH PASTI staff biasa
    if (currentUser.role && ['staff', 'admin_departement'].includes(currentUser.role)) {
        document.body.innerHTML = "<h3 class='text-center mt-5 text-danger'>Akses Terbatas. Halaman ini hanya untuk Tim Manajemen.</h3>";
        return;
    }

    // Memaksa load dropdown periode penggajian
    await loadPeriodeDropdown();

    // SINKRONISASI VISIBILITAS TOMBOL (Default: Tampilkan dulu untuk Admin/HRD)
    const btnHitung = document.getElementById('btn-proses-hitung');
    const btnApprove = document.getElementById('btn-approve-massal');

    if (btnHitung) {
        // Jika rolenya staff, sembunyikan. Selain itu (termasuk saat loading), tetap tampilkan.
        if (currentUser.role && ['staff', 'admin_departement'].includes(currentUser.role)) {
            btnHitung.style.display = 'none';
        } else {
            btnHitung.style.display = 'inline-block';
        }
    }
    
    if (btnApprove) {
        if (currentUser.role && ['staff', 'admin_departement'].includes(currentUser.role)) {
            btnApprove.style.display = 'none';
        } else {
            btnApprove.style.display = 'inline-block';
        }
    }
});

// Memuat daftar periode ke dropdown (Bebas dari error kolom client_id)
async function loadPeriodeDropdown() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    // Bersih dari client_id karena kolom tidak ada di tabel payroll_periods
    const { data, error } = await supabase
        .from('payroll_periods')
        .select('id, nama_periode, office_id') 
        .order('created_at', { ascending: false });

    if (error) {
        console.error("🚨 ERROR LOAD PERIODE:", error.message);
        return;
    }

    const filteredPeriods = data?.filter(p => p.office_id === targetOfficeId) || [];
    const select = document.getElementById('run-pilih-periode');
    if (!select) return;

    select.innerHTML = '<option value="">-- Pilih Periode --</option>';
    filteredPeriods.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nama_periode}</option>`;
    });
}

// Event listener saat memilih periode
const selectPeriode = document.getElementById('run-pilih-periode');
if (selectPeriode) {
    selectPeriode.addEventListener('change', async (e) => {
        const periodId = e.target.value;
        if (!periodId) {
            const tbody = document.getElementById('payroll-run-table');
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Silakan tentukan periode di atas.</td></tr>';
            return;
        }
        await loadExistingPayrollRun(periodId);
    });
}

// AMBIL DATA YANG SUDAH PERNAH DI-GENERATE SEBELUMNYA
async function loadExistingPayrollRun(periodId) {
    const tbody = document.getElementById('payroll-run-table');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Memuat data draf payroll...</td></tr>';

    const { data, error } = await supabase
        .from('payroll_slips')
        .select(`id, total_pemasukan, total_potongan, gaji_bersih, status, user_id, profiles(nama_lengkap)`)
        .eq('period_id', periodId);

    if (error) {
        console.error("🚨 ERROR LOAD EXISTING DATA:", error.message);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Gagal memuat data penggajian.</td></tr>';
        return;
    }

    renderTableList(data || []);
}

// AKSI GENERATE: HITUNG GAJI KARYAWAN BERDASARKAN TEMPLATE
const btnHitungGaji = document.getElementById('btn-proses-hitung');
if (btnHitungGaji) {
    btnHitungGaji.addEventListener('click', async () => {
        updateCurrentUser();
        const targetOfficeId = currentUser.office_id || currentUser.client_id;
        const periodId = document.getElementById('run-pilih-periode')?.value;
        if (!periodId) return alert("Pilih periode yang ingin diproses!");

        const tbody = document.getElementById('payroll-run-table');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin me-2"></i>Sedang memproses & mencocokkan template...</td></tr>`;

        try {
            const { data: mappings, error: errMap } = await supabase
                .from('payroll_mappings')
                .select(`
                    user_id,
                    template_id,
                    profiles!inner(client_id, nama_lengkap)
                `);

            if (errMap) throw errMap;

            const filteredMappings = mappings?.filter(m => m.profiles && m.profiles.client_id === targetOfficeId) || [];

            if (filteredMappings.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Tidak ada karyawan yang terhubung ke template gaji di kantor ini.</td></tr>`;
                return;
            }

            for (const item of filteredMappings) {
                if (!item.template_id) continue;

                const { data: details } = await supabase
                    .from('payroll_template_details')
                    .select(`nominal, payroll_components(nama_komponen, jenis)`)
                    .eq('template_id', item.template_id);

                let totalPemasukan = 0;
                let totalPotongan = 0;

                details?.forEach(d => {
                    const nom = parseFloat(d.nominal) || 0;
                    if (d.payroll_components?.jenis === 'pemasukan') {
                        totalPemasukan += nom;
                    } else if (d.payroll_components?.jenis === 'potongan') {
                        totalPotongan += nom;
                    }
                });

                const gajiBersih = totalPemasukan - totalPotongan;

                await supabase
                    .from('payroll_slips')
                    .upsert({
                        period_id: periodId,
                        user_id: item.user_id,
                        total_pemasukan: totalPemasukan,
                        total_potongan: totalPotongan,
                        gaji_bersih: gajiBersih,
                        status: 'Belum Diapprove'
                    }, { onConflict: 'period_id,user_id' });
            }

            alert("Sukses melakukan generate draf payroll!");
            await loadExistingPayrollRun(periodId);

        } catch (err) {
            console.error(err);
            alert("Gagal memproses draf payroll: " + err.message);
            await loadExistingPayrollRun(periodId);
        }
    });
}

// RENDER DATA KE TABEL UI (Menggunakan Ikon Font Awesome)
// RENDER DATA KE TABEL UI (Perbaikan Validasi Status Tokcer)
function renderTableList(data) {
    const tbody = document.getElementById('payroll-run-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Belum ada data draf penggajian untuk periode ini. Silakan klik Ambil Template & Hitung Gaji.</td></tr>`;
        return;
    }

    data.forEach(p => {
        // Ambil status, bersihkan spasi, dan jadikan huruf kecil semua agar tidak salah validasi
        const currentStatus = (p.status || '').trim().toLowerCase();
        
        // Cek apakah statusnya mengandung kata 'approved' atau 'disetujui'
        const isApproved = currentStatus === 'approved' || currentStatus === 'disetujui';
        
        const badgeClass = isApproved ? 'bg-success text-white' : 'bg-warning text-dark';
        const labelText = isApproved ? 'Approved' : 'Belum Diapprove';

        tbody.innerHTML += `
            <tr>
                <td><strong>${p.profiles?.nama_lengkap || 'Tanpa Nama'}</strong></td>
                <td class="text-success">Rp ${parseFloat(p.total_pemasukan || 0).toLocaleString('id-ID')}</td>
                <td class="text-danger">Rp ${parseFloat(p.total_potongan || 0).toLocaleString('id-ID')}</td>
                <td class="fw-bold">Rp ${parseFloat(p.gaji_bersih || 0).toLocaleString('id-ID')}</td>
                <td><span class="badge ${badgeClass}">${labelText}</span></td>
                <td>
                    <button class="btn btn-xs btn-outline-dark btn-sm py-0 px-2 me-1" onclick="lihatDetailSlip('${p.id}', '${p.profiles?.nama_lengkap || 'Karyawan'}')">
                        <i class="fas fa-eye me-1"></i>Detail
                    </button>
                    ${!isApproved ? 
                    `<button class="btn btn-success btn-sm py-0 px-2" onclick="approveSingle('${p.id}')">
                        <i class="fas fa-check me-1"></i>Approve
                    </button>` : 
                    `<span class="badge bg-light text-success border border-success small py-1"><i class="fas fa-lock me-1"></i>Selesai</span>`}
                </td>
            </tr>`;
    });
}
// APPROVE INDIVIDU
window.approveSingle = async function(slipId) {
    const { error } = await supabase
        .from('payroll_slips')
        .update({ status: 'Approved' })
        .eq('id', slipId);

    if (error) return alert("Gagal menyetujui data: " + error.message);
    
    alert("Berhasil menyetujui slip gaji!");
    const periodId = document.getElementById('run-pilih-periode').value;
    await loadExistingPayrollRun(periodId);
};

// APPROVE MASSAL SATU PERIODE
const btnApproveMassal = document.getElementById('btn-approve-massal');
if (btnApproveMassal) {
    btnApproveMassal.addEventListener('click', async () => {
        const periodId = document.getElementById('run-pilih-periode')?.value;
        if (!periodId) return alert("Tentukan periode penggajian!");

        if (!confirm("Apakah Anda yakin ingin menyetujui seluruh slip gaji pada periode kantor ini secara massal?")) return;

        const { error } = await supabase
            .from('payroll_slips')
            .update({ status: 'Approved' })
            .eq('period_id', periodId)
            .eq('status', 'Belum Diapprove');

        if (error) return alert("Gagal melakukan approve massal: " + error.message);

        alert("Seluruh draf berhasil disetujui! Slip gaji kini dapat diakses oleh masing-masing staff.");
        await loadExistingPayrollRun(periodId);
    });
}

// MELIHAT RIWAYAT DETAIL RINCIAN KOMPONEN GAJI SECARA RAPI
window.lihatDetailSlip = async function(slipId, namaKaryawan) {
    const { data: slip } = await supabase
        .from('payroll_slips')
        .select('*')
        .eq('id', slipId)
        .single();

    if (!slip) return alert("Data slip tidak ditemukan.");

    alert(
        `📄 RINCIAN SLIP GAJI KARYAWAN\n` +
        `----------------------------------------\n` +
        `Nama Karyawan: ${namaKaryawan}\n` +
        `Status Slip: ${slip.status}\n\n` +
        `💰 Total Pemasukan : Rp ${parseFloat(slip.total_pemasukan || 0).toLocaleString('id-ID')}\n` +
        `📉 Total Potongan    : Rp ${parseFloat(slip.total_potongan || 0).toLocaleString('id-ID')}\n` +
        `----------------------------------------\n` +
        `💵 GAJI BERSIH (THP) : Rp ${parseFloat(slip.gaji_bersih || 0).toLocaleString('id-ID')}`
    );
};
