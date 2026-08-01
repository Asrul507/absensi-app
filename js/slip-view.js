// js/slip-view.js
import { supabase } from './supabase.js';

var currentUser = {};

function updateCurrentUser() {
    currentUser = window.currentUser || window.parent?.currentUser || {};
    if (!currentUser.office_id && currentUser.user) {
        currentUser = currentUser.user;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    updateCurrentUser();
    await initHalamanSlip();
});

async function initHalamanSlip() {
    const role = currentUser.role;
    const targetOfficeId = currentUser.office_id || currentUser.client_id;

    if (role === 'super_admin') {
        document.getElementById('div-filter-kantor').style.display = 'block';
        document.getElementById('div-filter-karyawan').style.display = 'block';
        await loadDaftarKantor();
    } else if (['admin_all', 'admin_hr'].includes(role)) {
        document.getElementById('div-filter-karyawan').style.display = 'block';
        await loadDaftarKaryawan(targetOfficeId);
    }

    await loadDaftarPeriode(targetOfficeId);

    // Auto-load slip terbaru yang sudah Approved untuk karyawan/staff
    if (['staff', 'admin_departement'].includes(role)) {
        await autoLoadLatestSlip();
    }
}

async function loadDaftarKantor() {
    const { data } = await supabase
        .from('clients')
        .select('id, nama_client')
        .eq('status', 'active')
        .order('nama_client');

    const select = document.getElementById('filter-kantor');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih Kantor --</option>';
    data?.forEach(k => {
        select.innerHTML += `<option value="${k.id}">${k.nama_client}</option>`;
    });

    select.addEventListener('change', async (e) => {
        const officeId = e.target.value;
        if (officeId) {
            await loadDaftarKaryawan(officeId);
            await loadDaftarPeriode(officeId);
        }
    });
}

async function loadDaftarPeriode(officeId) {
    let query = supabase.from('payroll_periods').select('id, nama_periode');
    if (currentUser.role !== 'super_admin' && officeId) {
        query = query.eq('office_id', officeId);
    }
    query = query.order('created_at', { ascending: false });
    const { data } = await query;

    const select = document.getElementById('filter-periode');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih Periode --</option>';
    data?.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nama_periode}</option>`;
    });
}

async function loadDaftarKaryawan(officeId) {
    if (!officeId) return;
    const { data } = await supabase
        .from('profiles')
        .select('id, nama_lengkap')
        .eq('client_id', officeId)
        .order('nama_lengkap');

    const select = document.getElementById('filter-karyawan');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih Karyawan --</option>';
    data?.forEach(k => {
        select.innerHTML += `<option value="${k.id}">${k.nama_lengkap}</option>`;
    });
}

// Auto-load slip terbaru yang sudah Approved untuk staff
async function autoLoadLatestSlip() {
    const periodSelect = document.getElementById('filter-periode');
    if (!periodSelect) return;

    const latestOption = periodSelect.querySelector('option[value]:not([value=""])');
    if (!latestOption) return;

    periodSelect.value = latestOption.value;
    await fetchSlipGaji(currentUser.id, latestOption.value);
}

document.getElementById('btn-cari')?.addEventListener('click', async () => {
    updateCurrentUser();
    const periodId = document.getElementById('filter-periode')?.value;
    let targetUserId = currentUser.id;

    if (!periodId) return alert("Pilih periode terlebih dahulu!");

    if (['super_admin', 'admin_all', 'admin_hr'].includes(currentUser.role)) {
        const selectedKaryawan = document.getElementById('filter-karyawan')?.value;
        if (!selectedKaryawan) return alert("Pilih karyawan yang ingin dilihat!");
        targetUserId = selectedKaryawan;
    }

    await fetchSlipGaji(targetUserId, periodId);
});

async function fetchSlipGaji(userId, periodId) {
    updateCurrentUser();

    const { data: slip, error } = await supabase
        .from('payroll_slips')
        .select(`
            id, total_pemasukan, total_potongan, gaji_bersih, gaji_per_hari, salary_mode, hari_kerja_per_bulan, rincian_komponen, status,
            user_id, nama_bank, nomor_rekening,
            profiles!inner ( nama_lengkap, departemen, client_id ),
            payroll_periods ( nama_periode, office_id )
        `)
        .eq('user_id', userId)
        .eq('period_id', periodId)
        .eq('status', 'Approved')
        .maybeSingle();

    if (error || !slip) {
        tampilkanPesanKosong("Slip gaji tidak ditemukan atau belum disetujui oleh admin.");
        return;
    }

    // Ambil nama kantor
    const officeId = slip.payroll_periods?.office_id || currentUser.office_id || currentUser.client_id;
    let namaKantor = 'PERUSAHAAN';
    if (officeId) {
        const { data: officeData } = await supabase
            .from('clients')
            .select('nama_client, domain_login')
            .eq('id', officeId)
            .maybeSingle();
        if (officeData?.nama_client) {
            namaKantor = officeData.nama_client;
            const domainEl = document.getElementById('slip-domain-kantor');
            if (domainEl) domainEl.innerText = officeData.domain_login || '';
        }
    }

    // Prioritas: gunakan snapshot rincian komponen dari payroll_slips
    let detailItems = Array.isArray(slip.rincian_komponen) ? slip.rincian_komponen : [];

    // Fallback untuk data lama yang belum punya snapshot
    if (detailItems.length === 0) {
        const { data: mapping } = await supabase
            .from('payroll_mappings')
            .select('template_id')
            .eq('user_id', userId)
            .maybeSingle();

        if (mapping?.template_id) {
            const { data: details } = await supabase
                .from('payroll_template_details')
                .select('nominal, tipe_nilai, payroll_components ( nama_komponen, jenis )')
                .eq('template_id', mapping.template_id);
            detailItems = (details || []).map((item) => ({
                nama_komponen: item.payroll_components?.nama_komponen || '-',
                jenis: item.payroll_components?.jenis || '-',
                tipe_nilai: item.tipe_nilai === 'persen' ? 'persen' : 'nominal',
                nilai_input: parseFloat(item.nominal || 0),
                nominal_terhitung: parseFloat(item.nominal || 0)
            }));
        }
    }

    renderSlipHTML(slip, detailItems, namaKantor);
}

function renderSlipHTML(slip, items, namaKantor) {
    document.getElementById('slip-empty').style.display = 'none';
    document.getElementById('slip-container').style.display = 'block';

    const namaKantorEl = document.getElementById('slip-nama-kantor');
    if (namaKantorEl) namaKantorEl.innerText = namaKantor;

    document.getElementById('slip-nama-karyawan').innerText = slip.profiles?.nama_lengkap || '-';
    document.getElementById('slip-dept-karyawan').innerText = slip.profiles?.departemen || '-';
    document.getElementById('slip-periode').innerText = slip.payroll_periods?.nama_periode || '-';
    document.getElementById('slip-status').innerText = slip.status;
    document.getElementById('slip-tanggal-cetak').innerText = new Date().toLocaleDateString('id-ID');
    document.getElementById('slip-total-bersih').innerText = `Rp ${parseFloat(slip.gaji_bersih).toLocaleString('id-ID')}`;
    const mode = slip.salary_mode === 'harian' ? 'Harian' : 'Bulanan';
    const hariKerja = parseInt(slip.hari_kerja_per_bulan || 26, 10);
    const gajiPerHari = parseFloat(slip.gaji_per_hari || 0);
    const modeEl = document.getElementById('slip-salary-mode');
    const hariKerjaEl = document.getElementById('slip-hari-kerja');
    const gajiPerHariEl = document.getElementById('slip-gaji-per-hari');
    if (modeEl) modeEl.innerText = mode;
    if (hariKerjaEl) hariKerjaEl.innerText = `${hariKerja} hari`;
    if (gajiPerHariEl) gajiPerHariEl.innerText = mode === 'Harian' ? `Rp ${gajiPerHari.toLocaleString('id-ID')}` : '-';

    const bankEl = document.getElementById('slip-nama-bank');
    const rekEl = document.getElementById('slip-nomor-rekening');
    if (bankEl) bankEl.innerText = slip.nama_bank || '-';
    if (rekEl) rekEl.innerText = slip.nomor_rekening || '-';

    const boxPemasukan = document.getElementById('list-pemasukan');
    const boxPotongan = document.getElementById('list-potongan');
    if (boxPemasukan) boxPemasukan.innerHTML = '';
    if (boxPotongan) boxPotongan.innerHTML = '';

    if (items.length > 0) {
        items.forEach(item => {
            const jenis = item.jenis || item.payroll_components?.jenis;
            const namaKomponen = item.nama_komponen || item.payroll_components?.nama_komponen || '-';
            const tipeNilai = item.tipe_nilai === 'persen' ? 'persen' : 'nominal';
            const nilaiInput = parseFloat(item.nilai_input ?? item.nominal_terhitung ?? item.nominal ?? 0) || 0;
            const nominalTerhitung = parseFloat(item.nominal_terhitung ?? item.nominal ?? 0) || 0;
            const labelNilai = tipeNilai === 'persen'
                ? `${nilaiInput.toLocaleString('id-ID')}%`
                : `Rp ${nominalTerhitung.toLocaleString('id-ID')}`;
            const row = `<tr>
                <td>${namaKomponen} <small class="text-muted">(${labelNilai})</small></td>
                <td class="text-end">Rp ${nominalTerhitung.toLocaleString('id-ID')}</td>
            </tr>`;
            if (jenis === 'pemasukan') {
                if (boxPemasukan) boxPemasukan.innerHTML += row;
            } else {
                if (boxPotongan) boxPotongan.innerHTML += row;
            }
        });
    } else {
        // Fallback: tampilkan total saja jika tidak ada rincian
        if (boxPemasukan) boxPemasukan.innerHTML = `<tr><td>Total Pendapatan</td><td class="text-end">Rp ${parseFloat(slip.total_pemasukan || 0).toLocaleString('id-ID')}</td></tr>`;
        if (boxPotongan) boxPotongan.innerHTML = `<tr><td>Total Potongan</td><td class="text-end">Rp ${parseFloat(slip.total_potongan || 0).toLocaleString('id-ID')}</td></tr>`;
    }
}

function tampilkanPesanKosong(pesan) {
    document.getElementById('slip-container').style.display = 'none';
    const emptyBox = document.getElementById('slip-empty');
    if (emptyBox) {
        emptyBox.style.display = 'block';
        emptyBox.innerHTML = pesan;
    }
}
