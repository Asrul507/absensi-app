// js/slip-view.js

// Simulasi user login (nanti disesuaikan dengan auth session Supabase kamu)
// BENAR: Mengambil session langsung dari aplikasi utama GenPro
let currentUser = window.currentUser;

// Jika session global belum siap sewaktu di-load di dalam iframe
if (!currentUser && window.parent && window.parent.currentUser) {
    currentUser = window.parent.currentUser;
}

document.addEventListener("DOMContentLoaded", async () => {
    await initHalamanSlip();
});

async function initHalamanSlip() {
    // 1. Cek Role untuk visibility filter
    const role = userSession.role;

    if (role === 'super_admin') {
        document.getElementById('div-filter-kantor').style.display = 'block';
        document.getElementById('div-filter-karyawan').style.display = 'block';
        await loadDaftarKantor();
    } 
    else if (role === 'admin_all' || role === 'admin_hr') {
        document.getElementById('div-filter-karyawan').style.display = 'block';
        await loadDaftarKaryawan(userSession.office_id);
    }

    // Load daftar periode penggajian global/per kantor
    await loadDaftarPeriode(userSession.office_id);
}

// Mengambil list periode penggajian
async function loadDaftarPeriode(officeId) {
    let query = supabase.from('payroll_periods').select('id, nama_periode');
    if (userSession.role !== 'super_admin') {
        query = query.eq('office_id', officeId);
    }
    const { data } = await query;
    const select = document.getElementById('filter-periode');
    data?.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nama_periode}</option>`;
    });
}

// Mengambil list karyawan jika role-nya adalah Management (Admin/HR)
async function loadDaftarKaryawan(officeId) {
    const { data } = await supabase
        .from('profiles')
        .select('user_id, nama_lengkap')
        .eq('office_id', officeId);
        
    const select = document.getElementById('filter-karyawan');
    select.innerHTML = '<option value="">-- Pilih Karyawan --</option>';
    data?.forEach(k => {
        select.innerHTML += `<option value="${k.user_id}">${k.nama_lengkap}</option>`;
    });
}

// AKSI TOMBOL CARI DATA
document.getElementById('btn-cari').addEventListener('click', async () => {
    const periodId = document.getElementById('filter-periode').value;
    let targetUserId = userSession.id; // Default untuk staff/admin_dept (lihat diri sendiri)

    if (!periodId) return alert("Pilih periode terlebih dahulu!");

    // Jika dia Management, target usernya diambil dari dropdown pilihan karyawan
    if (['super_admin', 'admin_all', 'admin_hr'].includes(userSession.role)) {
        const selectedKaryawan = document.getElementById('filter-karyawan').value;
        if (!selectedKaryawan) return alert("Pilih karyawan yang ingin dilihat!");
        targetUserId = selectedKaryawan;
    }

    await fetchSlipGaji(targetUserId, periodId);
});

// QUERY UTAMA SLIP GAJI
async function fetchSlipGaji(userId, periodId) {
    // Ambil data run payroll utama yang berstatus Approved
    let query = supabase
        .from('payroll_runs')
        .select(`
            id, total_pemasukan, total_potongan, gaji_bersih, status,
            profiles ( nama_lengkap, departemen ),
            payroll_periods ( nama_periode )
        `)
        .eq('user_id', userId)
        .eq('period_id', periodId);

    // Filter tambahan pengunci keamanan: staff & admin_departement hanya bisa ambil ID miliknya sendiri
    if (['staff', 'admin_departement'].includes(userSession.role)) {
        query = query.eq('user_id', userSession.id);
    } else if (userSession.role !== 'super_admin') {
        query = query.eq('office_id', userSession.office_id);
    }

    const { data: runData, error } = await query.maybeSingle();

    if (error || !runData) {
        tampilkanPesanKosong("Slip gaji tidak ditemukan atau belum disetujui oleh admin_all.");
        return;
    }

    // Ambil rincian item pemasukan & potongan di tabel item detail
    const { data: detailItems } = await supabase
        .from('payroll_run_details')
        .select('nama_komponen, jenis, nominal')
        .eq('payroll_run_id', runData.id);

    renderSlipHTML(runData, detailItems || []);
}

function renderSlipHTML(run, items) {
    document.getElementById('slip-empty').style.display = 'none';
    document.getElementById('slip-container').style.display = 'block';

    // Set Data Info
    document.getElementById('slip-nama-karyawan').innerText = run.profiles?.nama_lengkap || '-';
    document.getElementById('slip-dept-karyawan').innerText = run.profiles?.departemen || '-';
    document.getElementById('slip-periode').innerText = run.payroll_periods?.nama_periode || '-';
    document.getElementById('slip-status').innerText = run.status;
    document.getElementById('slip-tanggal-cetak').innerText = new Date().toLocaleDateString('id-ID');
    document.getElementById('slip-total-bersih').innerText = `Rp ${parseFloat(run.gaji_bersih).toLocaleString('id-ID')}`;

    // Render Item List
    const boxPemasukan = document.getElementById('list-pemasukan');
    const boxPotongan = document.getElementById('list-potongan');
    boxPemasukan.innerHTML = '';
    boxPotongan.innerHTML = '';

    items.forEach(item => {
        const row = `<tr><td>${item.nama_komponen}</td><td class="text-end">Rp ${parseFloat(item.nominal).toLocaleString('id-ID')}</td></tr>`;
        if (item.jenis === 'pemasukan') {
            boxPemasukan.innerHTML += row;
        } else {
            boxPotongan.innerHTML += row;
        }
    });
}

function tampilkanPesanKosong(pesan) {
    document.getElementById('slip-container').style.display = 'none';
    const emptyBox = document.getElementById('slip-empty');
    emptyBox.style.display = 'block';
    emptyBox.innerHTML = `${pesan}`;
}
