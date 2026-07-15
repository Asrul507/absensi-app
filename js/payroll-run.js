// js/payroll-run.js

// Simulasi user login
let userSession = {
    id: "USER_LOGGED_IN_UUID",
    role: "admin_hr", // super_admin, admin_all, admin_hr
    office_id: "OFFICE_UUID"
};

document.addEventListener("DOMContentLoaded", async () => {
    // Validasi Akses Pengguna
    if (['staff', 'admin_departement'].includes(userSession.role)) {
        document.body.innerHTML = "<h3 class='text-center mt-5 text-danger'>Akses Terbatas. Halaman ini hanya untuk Tim Manajemen.</h3>";
        return;
    }

    document.getElementById('role-indicator').innerText = `Role: ${userSession.role}`;
    
    // Atur visibilitas tombol berdasarkan wewenang khusus role
    if (['super_admin', 'admin_all', 'admin_hr'].includes(userSession.role)) {
        document.getElementById('btn-proses-hitung').style.display = 'inline-block';
    }
    if (['super_admin', 'admin_all'].includes(userSession.role)) {
        document.getElementById('btn-approve-massal').style.display = 'inline-block';
    }

    await loadPeriodeDropdown();
});

// Memuat daftar periode ke dropdown
async function loadPeriodeDropdown() {
    let query = supabase.from('payroll_periods').select('id, nama_periode').order('created_at', { ascending: false });
    if (userSession.role !== 'super_admin') {
        query = query.eq('office_id', userSession.office_id);
    }
    const { data } = await query;
    const select = document.getElementById('run-pilih-periode');
    data?.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nama_periode}</option>`;
    });
}

// Event listener saat memilih periode / memfilter data lama
document.getElementById('run-pilih-periode').addEventListener('change', async (e) => {
    const periodId = e.target.value;
    if (!periodId) return;
    await loadExistingPayrollRun(periodId);
});

// AMBIL DATA YANG SUDAH PERNAH DI-GENERATE SEBELUMNYA
async function loadExistingPayrollRun(periodId) {
    let query = supabase
        .from('payroll_runs')
        .select(`id, total_pemasukan, total_potongan, gaji_bersih, status, user_id, profiles(nama_lengkap)`)
        .eq('period_id', periodId);

    if (userSession.role !== 'super_admin') {
        query = query.eq('office_id', userSession.office_id);
    }

    const { data } = await query;
    renderTableList(data || []);
}

// AKSI GENERATE: HITUNG GAJI KARYAWAN BERDASARKAN TEMPLATE
document.getElementById('btn-proses-hitung').addEventListener('click', async () => {
    const periodId = document.getElementById('run-pilih-periode').value;
    if (!periodId) return alert("Pilih periode yang ingin diproses!");

    const tbody = document.getElementById('payroll-run-table');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Sedang memproses & mencocokkan template...</td></tr>`;

    try {
        // 1. Ambil data semua karyawan di kantor tersebut yang sudah dipetakan ke template gaji
        const { data: employeeTemplates } = await supabase
            .from('payroll_employee_templates')
            .select(`user_id, template_id, profiles(nama_lengkap, office_id)`)
            .eq('profiles.office_id', userSession.office_id);

        if (!employeeTemplates || employeeTemplates.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Tidak ada karyawan yang terhubung ke template gaji di kantor ini.</td></tr>`;
            return;
        }

        // 2. Loop untuk memproses hitungan draf per karyawan
        for (const item of employeeTemplates) {
            if (!item.template_id) continue;

            // Ambil detail nominal komponen dari template
            const { data: details } = await supabase
                .from('payroll_template_details')
                .select(`nominal, payroll_components(nama_komponen, jenis)`)
                .eq('template_id', item.template_id);

            let totalPemasukan = 0;
            let totalPotongan = 0;
            let rincianItem = [];

            details?.forEach(d => {
                const nom = parseFloat(d.nominal);
                if (d.payroll_components.jenis === 'pemasukan') {
                    totalPemasukan += nom;
                } else {
                    totalPotongan += nom;
                }
                rincianItem.push({
                    nama_komponen: d.payroll_components.nama_komponen,
                    jenis: d.payroll_components.jenis,
                    nominal: nom
                });
            });

            const gajiBersih = totalPemasukan - totalPotongan;

            // Simpan draf utama ke tabel 'payroll_runs' (Status Awal: Belum Diapprove)
            const { data: runInserted, error: errRun } = await supabase
                .from('payroll_runs')
                .upsert({
                    office_id: userSession.office_id,
                    period_id: periodId,
                    user_id: item.user_id,
                    total_pemasukan: totalPemasukan,
                    total_potongan: totalPotongan,
                    gaji_bersih: gajiBersih,
                    status: 'Belum Diapprove'
                }, { onConflict: 'period_id, user_id' })
                .select().single();

            if (!errRun && runInserted) {
                // Hapus rincian lama jika ada (agar tidak double saat di-generate ulang)
                await supabase.from('payroll_run_details').delete().eq('payroll_run_id', runInserted.id);
                
                // Masukkan rincian item baru
                const itemFinal = rincianItem.map(r => ({ payroll_run_id: runInserted.id, ...r }));
                await supabase.from('payroll_run_details').insert(itemFinal);
            }
        }

        alert("Sukses melakukan generate draf payroll!");
        await loadExistingPayrollRun(periodId);

    } catch (err) {
        console.error(err);
        alert("Gagal memproses draf payroll.");
    }
});

// RENDER DATA KE TABEL UI
function renderTableList(data) {
    const tbody = document.getElementById('payroll-run-table');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Belum ada data draf penggajian untuk periode ini. Silakan klik Generate.</td></tr>`;
        return;
    }

    data.forEach(p => {
        const isApproved = p.status === 'Approved';
        const badgeClass = isApproved ? 'bg-success' : 'bg-warning text-dark';
        const labelText = isApproved ? 'Approved' : 'Belum Diapprove';

        tbody.innerHTML += `
            <tr>
                <td><strong>${p.profiles?.nama_lengkap || 'Tanpa Nama'}</strong></td>
                <td class="text-success">Rp ${parseFloat(p.total_pemasukan).toLocaleString('id-ID')}</td>
                <td class="text-danger">Rp ${parseFloat(p.total_potongan).toLocaleString('id-ID')}</td>
                <td class="fw-bold">Rp ${parseFloat(p.gaji_bersih).toLocaleString('id-ID')}</td>
                <td><span class="badge ${badgeClass}">${labelText}</span></td>
                <td>
                    ${!isApproved && ['super_admin', 'admin_all'].includes(userSession.role) ? 
                    `<button class="btn btn-xs btn-outline-success btn-sm" onclick="approveSingle('${p.id}')">Approve</button>` : 
                    `<span class="text-muted small">No Action</span>`}
                </td>
            </tr>`;
    });
}

// APPROVE INDIVIDU (KHUSUS SUPER_ADMIN & ADMIN_ALL)
async function approveSingle(runId) {
    const { error } = await supabase
        .from('payroll_runs')
        .update({ status: 'Approved', approved_by: userSession.id, approved_at: new Date().toISOString() })
        .eq('id', runId);

    if (error) return alert("Gagal menyetujui data: " + error.message);
    
    alert("Berhasil diapprove!");
    const periodId = document.getElementById('run-pilih-periode').value;
    await loadExistingPayrollRun(periodId);
}

// APPROVE MASSAL SATU PERIODE (KHUSUS SUPER_ADMIN & ADMIN_ALL)
document.getElementById('btn-approve-massal').addEventListener('click', async () => {
    const periodId = document.getElementById('run-pilih-periode').value;
    if (!periodId) return alert("Tentukan periode penggajian!");

    if (!confirm("Apakah Anda yakin ingin menyetujui seluruh slip gaji pada periode kantor ini secara massal?")) return;

    let query = supabase
        .from('payroll_runs')
        .update({ status: 'Approved', approved_by: userSession.id, approved_at: new Date().toISOString() })
        .eq('period_id', periodId)
        .eq('status', 'Belum Diapprove');

    if (userSession.role !== 'super_admin') {
        query = query.eq('office_id', userSession.office_id);
    }

    const { error } = await query;
    if (error) return alert("Gagal melakukan approve massal: " + error.message);

    alert("Seluruh draf berhasil disetujui! Slip gaji kini dapat diakses oleh masing-masing staff.");
    await loadExistingPayrollRun(periodId);
});
