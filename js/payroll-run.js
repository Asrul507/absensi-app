import { supabase } from './supabase.js';

var currentUser = window.currentUser || window.parent?.currentUser || {};

// Variabel Global untuk menampung data payroll aktif untuk kebutuhan ekspor
let currentPayrollData = [];

function updateCurrentUser() {
    currentUser = window.currentUser || window.parent?.currentUser || {};
    if (!currentUser.office_id && currentUser.user) {
        currentUser = currentUser.user;
    }
}

updateCurrentUser();

document.addEventListener("DOMContentLoaded", async () => {
    updateCurrentUser();

    const roleIndicator = document.getElementById('role-indicator');
    if (roleIndicator && currentUser.role) {
        roleIndicator.innerText = `Role: ${currentUser.role.toUpperCase()}`;
    }

    if (currentUser.role && ['staff', 'admin_departement'].includes(currentUser.role)) {
        document.body.innerHTML = "<h3 class='text-center mt-5 text-danger'>Akses Terbatas. Halaman ini hanya untuk Tim Manajemen.</h3>";
        return;
    }

    await loadPeriodeDropdown();
    await loadDepartemenDropdown();

    const btnHitung = document.getElementById('btn-proses-hitung');
    const btnApprove = document.getElementById('btn-approve-massal');

    if (btnHitung) {
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

    // Reload table ketika filter departemen berubah
    const selectDept = document.getElementById('run-filter-dept');
    if (selectDept) {
        selectDept.addEventListener('change', () => {
            renderTableList(currentPayrollData);
        });
    }
});

async function loadPeriodeDropdown() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

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

async function loadDepartemenDropdown() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    const { data } = await supabase
        .from('departments')
        .select('id, nama_department')
        .eq('client_id', targetOfficeId)
        .in('status', ['active', 'aktif'])
        .order('nama_department');

    const select = document.getElementById('run-filter-dept');
    if (!select || !data || data.length === 0) return;

    data.forEach(d => {
        select.innerHTML += `<option value="${d.nama_department}">${d.nama_department}</option>`;
    });
}

const selectPeriode = document.getElementById('run-pilih-periode');
if (selectPeriode) {
    selectPeriode.addEventListener('change', async (e) => {
        const periodId = e.target.value;
        if (!periodId) {
            currentPayrollData = [];
            const tbody = document.getElementById('payroll-run-table');
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Silakan tentukan periode di atas.</td></tr>';
            return;
        }
        await loadExistingPayrollRun(periodId);
    });
}

function getBaseSalaryAmount(details) {
    if (!Array.isArray(details) || details.length === 0) return 0;
    const baseByCode = details.find((item) => String(item?.payroll_components?.kode_komponen || '').toUpperCase() === 'GAPOK');
    if (baseByCode) return parseFloat(baseByCode.nominal || 0) || 0;
    const baseByName = details.find((item) => String(item?.payroll_components?.nama_komponen || '').toLowerCase().includes('gaji pokok'));
    return parseFloat(baseByName?.nominal || 0) || 0;
}

function normalizeMode(value) {
    return value === 'harian' ? 'harian' : 'bulanan';
}

async function loadExistingPayrollRun(periodId) {
    const tbody = document.getElementById('payroll-run-table');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Memuat data draf payroll...</td></tr>';

    const { data, error } = await supabase
        .from('payroll_slips')
        .select(`id, total_pemasukan, total_potongan, gaji_bersih, gaji_per_hari, salary_mode, hari_kerja_per_bulan, status, user_id, nama_bank, nomor_rekening, profiles(nama_lengkap, departemen)`)
        .eq('period_id', periodId);

    if (error) {
        console.error("🚨 ERROR LOAD EXISTING DATA:", error.message);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Gagal memuat data penggajian.</td></tr>';
        return;
    }

    renderTableList(data || []);
}

const btnHitungGaji = document.getElementById('btn-proses-hitung');
if (btnHitungGaji) {
    btnHitungGaji.addEventListener('click', async () => {
        updateCurrentUser();
        const targetOfficeId = currentUser.office_id || currentUser.client_id;
        const periodId = document.getElementById('run-pilih-periode')?.value;
        if (!periodId) return alert("Pilih periode yang ingin diproses!");

        const tbody = document.getElementById('payroll-run-table');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="8" class="text-center"><i class="fas fa-spinner fa-spin me-2"></i>Sedang memproses & mencocokkan template...</td></tr>`;

        try {
            // PENGEMBANGAN: Ikut menarik nama_bank dan nomor_rekening dari tabel mapping
            const { data: mappings, error: errMap } = await supabase
                .from('payroll_mappings')
                .select(`
                    user_id,
                    template_id,
                    nama_bank,
                    nomor_rekening,
                    salary_mode,
                    hari_kerja_per_bulan,
                    profiles!inner(client_id, nama_lengkap)
                `);

            if (errMap) throw errMap;

            const filteredMappings = mappings?.filter(m => m.profiles && m.profiles.client_id === targetOfficeId) || [];

            if (filteredMappings.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Tidak ada karyawan yang terhubung ke template gaji di kantor ini.</td></tr>`;
                return;
            }

            for (const item of filteredMappings) {
                if (!item.template_id) continue;

                const { data: details, error: errDetails } = await supabase
                    .from('payroll_template_details')
                    .select(`
                        nominal, 
                        tipe_nilai,
                        payroll_components!inner(nama_komponen, kode_komponen, jenis, office_id)
                    `)
                    .eq('template_id', item.template_id)
                    .eq('payroll_components.office_id', targetOfficeId);

                if (errDetails) continue;

                let totalPemasukan = 0;
                let totalPotongan = 0;
                const gajiPokok = getBaseSalaryAmount(details || []);
                const rincianKomponen = [];

                details?.forEach(d => {
                    const tipeNilai = d.tipe_nilai === 'persen' ? 'persen' : 'nominal';
                    const rawNilai = parseFloat(d.nominal) || 0;
                    const nom = tipeNilai === 'persen' ? (gajiPokok * rawNilai / 100) : rawNilai;
                    if (d.payroll_components?.jenis === 'pemasukan') {
                        totalPemasukan += nom;
                    } else if (d.payroll_components?.jenis === 'potongan') {
                        totalPotongan += nom;
                    }
                    rincianKomponen.push({
                        nama_komponen: d.payroll_components?.nama_komponen || '-',
                        kode_komponen: d.payroll_components?.kode_komponen || null,
                        jenis: d.payroll_components?.jenis || '-',
                        tipe_nilai: tipeNilai,
                        nilai_input: rawNilai,
                        nominal_terhitung: nom
                    });
                });

                const gajiBersih = totalPemasukan - totalPotongan;
                const salaryMode = normalizeMode(item.salary_mode);
                const hariKerjaPerBulan = salaryMode === 'harian'
                    ? Math.min(31, Math.max(20, parseInt(item.hari_kerja_per_bulan || 26, 10)))
                    : 26;
                const gajiPerHari = salaryMode === 'harian' && hariKerjaPerBulan > 0
                    ? gajiBersih / hariKerjaPerBulan
                    : 0;

                // PENGEMBANGAN: Mengirim data bank dan rekening saat simpan data slip
                await supabase
                    .from('payroll_slips')
                    .upsert({
                        period_id: periodId,
                        user_id: item.user_id,
                        total_pemasukan: totalPemasukan,
                        total_potongan: totalPotongan,
                        gaji_bersih: gajiBersih,
                        salary_mode: salaryMode,
                        hari_kerja_per_bulan: hariKerjaPerBulan,
                        gaji_per_hari: gajiPerHari,
                        rincian_komponen: rincianKomponen,
                        nama_bank: item.nama_bank || '-',
                        nomor_rekening: item.nomor_rekening || '-',
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

function renderTableList(data) {
    // Simpan data aktif ke dalam scope global untuk kebutuhan ekspor file
    currentPayrollData = data;

    // Terapkan filter departemen jika dipilih
    const selectedDept = document.getElementById('run-filter-dept')?.value || '';
    const filteredData = selectedDept
        ? data.filter(p => p.profiles?.departemen === selectedDept)
        : data;

    const tbody = document.getElementById('payroll-run-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Belum ada data draf penggajian untuk periode ini. Silakan klik Ambil Template & Hitung Gaji.</td></tr>`;
        updateTotalSummary(0, 0, 0, 0);
        return;
    }

    let sumPemasukan = 0, sumPotongan = 0, sumBersih = 0;

    filteredData.forEach(p => {
        const currentStatus = (p.status || '').trim().toLowerCase();
        const isApproved = currentStatus === 'approved' || currentStatus === 'disetujui';
        
        const badgeClass = isApproved ? 'bg-success text-white' : 'bg-warning text-dark';
        const labelText = isApproved ? 'Approved' : 'Belum Diapprove';

        const pemasukan = parseFloat(p.total_pemasukan || 0);
        const potongan = parseFloat(p.total_potongan || 0);
        const bersih = parseFloat(p.gaji_bersih || 0);
        const modeGaji = normalizeMode(p.salary_mode);
        const gajiPerHari = parseFloat(p.gaji_per_hari || 0);
        const hariKerjaPerBulan = parseInt(p.hari_kerja_per_bulan || 26, 10);
        sumPemasukan += pemasukan;
        sumPotongan += potongan;
        sumBersih += bersih;

        tbody.innerHTML += `
            <tr>
                <td>
                    <strong>${p.profiles?.nama_lengkap || 'Tanpa Nama'}</strong>
                    ${p.profiles?.departemen ? `<br><small class="text-muted">${p.profiles.departemen}</small>` : ''}
                </td>
                <td class="text-success">Rp ${pemasukan.toLocaleString('id-ID')}</td>
                <td class="text-danger">Rp ${potongan.toLocaleString('id-ID')}</td>
                <td class="fw-bold">Rp ${bersih.toLocaleString('id-ID')}</td>
                <td>
                    <span class="badge ${modeGaji === 'harian' ? 'bg-info text-dark' : 'bg-secondary'} text-uppercase">${modeGaji}</span>
                    ${modeGaji === 'harian' ? `<br><small class="text-muted">${hariKerjaPerBulan} hari/bulan</small>` : ''}
                </td>
                <td class="fw-semibold">${modeGaji === 'harian' ? `Rp ${gajiPerHari.toLocaleString('id-ID')}` : '-'}</td>
                <td><span class="badge ${badgeClass}">${labelText}</span></td>
                <td>
                    <button class="btn btn-xs btn-outline-dark btn-sm py-0 px-2 me-1" onclick="lihatDetailSlip('${p.id}', '${p.profiles?.nama_lengkap || 'Karyawan'}')">
                        <i class="fas fa-eye me-1"></i>Detail
                    </button>
                    ${!isApproved ? 
                    `<button class="btn btn-success btn-sm py-0 px-2 me-1" onclick="approveSingle('${p.id}')">
                        <i class="fas fa-check me-1"></i>Approve
                    </button>
                    <button class="btn btn-outline-danger btn-sm py-0 px-1" title="Hapus Slip" onclick="hapusSlip('${p.id}')">
                        <i class="fas fa-trash"></i>
                    </button>` : 
                    `<span class="badge bg-light text-success border border-success small py-1"><i class="fas fa-lock me-1"></i>Selesai</span>`}
                </td>
            </tr>`;
    });

    updateTotalSummary(sumPemasukan, sumPotongan, sumBersih, filteredData.length);
}

function updateTotalSummary(pemasukan, potongan, bersih, count) {
    const summaryEl = document.getElementById('payroll-total-summary');
    if (!summaryEl) return;

    if (count === 0) {
        summaryEl.style.display = 'none';
        return;
    }

    summaryEl.style.display = 'block';
    summaryEl.innerHTML = `
        <div class="d-flex flex-wrap gap-3 align-items-center">
            <span class="fw-bold small"><i class="fas fa-calculator me-1"></i>TOTAL (${count} karyawan):</span>
            <span class="badge bg-success fs-6 px-3 py-2">Pemasukan: Rp ${pemasukan.toLocaleString('id-ID')}</span>
            <span class="badge bg-danger fs-6 px-3 py-2">Potongan: Rp ${potongan.toLocaleString('id-ID')}</span>
            <span class="badge bg-warning text-dark fs-6 px-3 py-2">THP: Rp ${bersih.toLocaleString('id-ID')}</span>
        </div>`;
}

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

window.hapusSlip = async function(slipId) {
    if (!confirm("Hapus draf slip gaji ini? Data bisa di-generate ulang nanti.")) return;

    const { error } = await supabase
        .from('payroll_slips')
        .delete()
        .eq('id', slipId);

    if (error) return alert("Gagal menghapus slip: " + error.message);

    const periodId = document.getElementById('run-pilih-periode')?.value;
    if (periodId) await loadExistingPayrollRun(periodId);
};

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

// PENGEMBANGAN: Pembuatan Cetak Slip Gaji PDF Resmi (Ukuran A5 Portrait)
window.lihatDetailSlip = async function(slipId, namaKaryawan) {
    const { data: slip, error } = await supabase
        .from('payroll_slips')
        .select(`*, payroll_periods(nama_periode, office_id)`)
        .eq('id', slipId)
        .single();

    if (error || !slip) return alert("Data slip tidak ditemukan.");

    const targetOfficeId = slip.payroll_periods?.office_id || currentUser.office_id || currentUser.client_id || '-';

    // Ambil nama kantor secara dinamis dari tabel clients
    let namaKantor = 'PERUSAHAAN';
    const { data: officeData } = await supabase
        .from('clients')
        .select('nama_client')
        .eq('id', targetOfficeId)
        .maybeSingle();
    if (officeData?.nama_client) {
        namaKantor = officeData.nama_client.toUpperCase();
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a5'); // Ukuran A5 Portrait

    // KOP INFORMASI KANTOR
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(namaKantor, 15, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Office ID Tenant: ${targetOfficeId}`, 15, 19);
    doc.line(15, 21, 133, 21); 

    // DATA UTAMA SLIP
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("SLIP GAJI KARYAWAN", 15, 29);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const modeGaji = normalizeMode(slip.salary_mode);
    const hariKerjaPerBulan = parseInt(slip.hari_kerja_per_bulan || 26, 10);
    const gajiPerHari = parseFloat(slip.gaji_per_hari || 0);
    doc.text(`Nama Karyawan : ${namaKaryawan}`, 15, 36);
    doc.text(`Periode Gaji  : ${slip.payroll_periods?.nama_periode || '-'}`, 15, 41);
    doc.text(`Bank / Rek.   : ${slip.nama_bank || '-'} / ${slip.nomor_rekening || '-'}`, 15, 46);
    doc.text(`Mode Gaji     : ${modeGaji.toUpperCase()}${modeGaji === 'harian' ? ` (${hariKerjaPerBulan} hari)` : ''}`, 15, 51);
    doc.text(`Status Slip   : ${slip.status}`, 15, 56);
    doc.line(15, 59, 133, 59);

    // KATEGORI BIAYA
    doc.text("Total Pendapatan Kotor (Bruto)", 15, 68);
    doc.text(`Rp ${parseFloat(slip.total_pemasukan || 0).toLocaleString('id-ID')}`, 133, 68, { align: 'right' });

    doc.text("Total Potongan", 15, 75);
    doc.text(`- Rp ${parseFloat(slip.total_potongan || 0).toLocaleString('id-ID')}`, 133, 75, { align: 'right' });
    doc.line(15, 79, 133, 79);

    // GAJI BERSIH / TOTAL TAKE HOME PAY
    doc.setFont("helvetica", "bold");
    doc.text("GAJI BERSIH (THP)", 15, 86);
    doc.text(`Rp ${parseFloat(slip.gaji_bersih || 0).toLocaleString('id-ID')}`, 133, 86, { align: 'right' });
    if (modeGaji === 'harian') {
        doc.text("GAJI PER HARI", 15, 92);
        doc.text(`Rp ${gajiPerHari.toLocaleString('id-ID')}`, 133, 92, { align: 'right' });
    }
    doc.line(15, 95, 133, 95);

    // FOOTER KETERANGAN
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.text(`Dokumen slip ini sah diterbitkan secara elektronik oleh ${namaKantor}.`, 15, 104);

    // Proses Download Berkas
    const cleanName = namaKaryawan.replace(/\s+/g, '_');
    doc.save(`Slip_Gaji_${cleanName}.pdf`);
};

// ========================================================
// 🟢 PENGEMBANGAN FITUR AKSUR EKSPOR DATA (EXCEL & PDF REKAP)
// ========================================================

// 1. Ekspor Dokumen Spreadsheet Excel (.xlsx)
document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    if (!currentPayrollData || currentPayrollData.length === 0) {
        return alert("Pilih periode dan pastikan data draf payroll tersedia sebelum melakukan ekspor!");
    }
    
    const mappedExcel = currentPayrollData.map(p => ({
        "Nama Karyawan": p.profiles?.nama_lengkap || 'Tanpa Nama',
        "Nama Bank": p.nama_bank || '-',
        "Nomor Rekening": p.nomor_rekening || '-',
        "Mode Gaji": normalizeMode(p.salary_mode),
        "Hari Kerja / Bulan": p.hari_kerja_per_bulan || 26,
        "Total Pemasukan (Rp)": p.total_pemasukan || 0,
        "Total Potongan (Rp)": p.total_potongan || 0,
        "Gaji Bersih / THP (Rp)": p.gaji_bersih || 0,
        "Gaji Per Hari (Rp)": p.gaji_per_hari || 0,
        "Status Validasi": p.status || 'Belum Diapprove'
    }));

    const worksheet = XLSX.utils.json_to_sheet(mappedExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Laporan");
    
    const e = document.getElementById('run-pilih-periode');
    const txtPeriode = e.options[e.selectedIndex]?.text || 'Payroll';
    
    XLSX.writeFile(workbook, `Laporan_Payroll_${txtPeriode.replace(/\s+/g, '_')}.xlsx`);
});

// 2. Ekspor Dokumen Laporan Tabel Rekapitulasi PDF (A4 Landscape)
document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    if (!currentPayrollData || currentPayrollData.length === 0) {
        return alert("Pilih periode dan pastikan data draf payroll tersedia sebelum melakukan ekspor!");
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); // Mode Landscape A4
    
    const e = document.getElementById('run-pilih-periode');
    const txtPeriode = e.options[e.selectedIndex]?.text || '-';

    // Header Laporan Laporan Landscape
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("LAPORAN REKAPITULASI PENGGAJIAN KARYAWAN", 14, 15);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Periode Operasional: ${txtPeriode}`, 14, 21);
    
    const bodyTableData = currentPayrollData.map(p => [
        p.profiles?.nama_lengkap || 'Tanpa Nama',
        p.nama_bank || '-',
        p.nomor_rekening || '-',
        normalizeMode(p.salary_mode),
        `${p.hari_kerja_per_bulan || 26}`,
        `Rp ${parseFloat(p.total_pemasukan || 0).toLocaleString('id-ID')}`,
        `Rp ${parseFloat(p.total_potongan || 0).toLocaleString('id-ID')}`,
        `Rp ${parseFloat(p.gaji_bersih || 0).toLocaleString('id-ID')}`,
        normalizeMode(p.salary_mode) === 'harian' ? `Rp ${parseFloat(p.gaji_per_hari || 0).toLocaleString('id-ID')}` : '-',
        p.status || 'Belum Diapprove'
    ]);

    doc.autoTable({
        startY: 26,
        theme: 'striped',
        headStyles: { fillColor: [43, 48, 53] }, // Mengikuti tema bg-dark tabel HTML
        head: [['Nama Karyawan', 'Bank', 'No. Rekening', 'Mode', 'Hari Kerja', 'Total Pemasukan', 'Total Potongan', 'Gaji Bersih (THP)', 'Gaji Per Hari', 'Status']],
        body: bodyTableData,
        styles: { fontSize: 9 }
    });

    doc.save(`Laporan_Rekap_Payroll_${txtPeriode.replace(/\s+/g, '_')}.pdf`);
});
