// js/payroll-config.js

// Simulasi user login
let currentUser = {
    id: "USER_LOGGED_IN_UUID",
    role: "admin_hr", // Harus super_admin, admin_all, atau admin_hr
    office_id: "OFFICE_UUID" 
};

document.addEventListener("DOMContentLoaded", async () => {
    // Keamanan Akses Halaman
    if (['staff', 'admin_departement'].includes(currentUser.role)) {
        document.body.innerHTML = "<h3 class='text-center mt-5 text-danger'>Akses Ditolak. Halaman ini hanya untuk HR/Admin.</h3>";
        return;
    }

    await loadDataKomponen();
    await loadDataTemplate();
    await loadDataPeriode();
});

// --- BAGIAN 1: KOMPONEN GAJI ---
document.getElementById('form-komponen').addEventListener('submit', async (e) => {
    e.preventDefault();
    const kode = document.getElementById('kode-komponen').value.toUpperCase();
    const nama = document.getElementById('nama-komponen').value;
    const jenis = document.getElementById('jenis-komponen').value;

    const { error } = await supabase.from('payroll_components').insert([{
        office_id: currentUser.office_id,
        kode_komponen: kode,
        nama_komponen: nama,
        jenis: jenis
    }]);

    if (error) return alert("Gagal menyimpan komponen: " + error.message);
    document.getElementById('form-komponen').reset();
    await loadDataKomponen();
});

async function loadDataKomponen() {
    const { data } = await supabase.from('payroll_components').select('*').eq('office_id', currentUser.office_id);
    const tbody = document.getElementById('list-komponen-table');
    const select = document.getElementById('pilih-komponen');
    
    tbody.innerHTML = '';
    select.innerHTML = '<option value="">-- Pilih Komponen --</option>';

    data?.forEach(k => {
        // Render ke tabel
        tbody.innerHTML += `<tr><td>${k.kode_komponen}</td><td>${k.nama_komponen}</td>
            <td><span class="badge ${k.jenis === 'pemasukan' ? 'bg-success' : 'bg-danger'}">${k.jenis}</span></td></tr>`;
        // Render ke form detail template
        select.innerHTML += `<option value="${k.id}">${k.nama_komponen} (${k.jenis})</option>`;
    });
}

// --- BAGIAN 2: TEMPLATE GAJI ---
document.getElementById('form-template').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = document.getElementById('nama-template').value;

    const { error } = await supabase.from('payroll_templates').insert([{
        office_id: currentUser.office_id,
        nama_template: nama
    }]);

    if (error) return alert("Gagal membuat template: " + error.message);
    document.getElementById('form-template').reset();
    await loadDataTemplate();
});

async function loadDataTemplate() {
    const { data } = await supabase.from('payroll_templates').select('*').eq('office_id', currentUser.office_id);
    const list = document.getElementById('list-template-grup');
    list.innerHTML = '';

    data?.forEach(t => {
        list.innerHTML += `<li class="list-group-item list-group-item-action" style="cursor:pointer;" 
            onclick="pilihTemplate('${t.id}', '${t.nama_template}')">${t.nama_template}</li>`;
    });
}

async function pilihTemplate(id, nama) {
    document.getElementById('template-terpilih-nama').innerText = nama;
    document.getElementById('aktif-template-id').value = id;
    document.getElementById('form-detail-template').style.display = 'flex';
    await loadDetailTemplate(id);
}

document.getElementById('form-detail-template').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tempId = document.getElementById('aktif-template-id').value;
    const compId = document.getElementById('pilih-komponen').value;
    const nominal = document.getElementById('nominal-komponen').value;

    const { error } = await supabase.from('payroll_template_details').insert([{
        template_id: tempId,
        component_id: compId,
        nominal: nominal
    }]);

    if (error) return alert("Gagal menambah rincian: " + error.message);
    document.getElementById('nominal-komponen').value = '';
    await loadDetailTemplate(tempId);
});

async function loadDetailTemplate(templateId) {
    const { data } = await supabase
        .from('payroll_template_details')
        .select(`nominal, payroll_components ( nama_komponen, jenis )`)
        .eq('template_id', templateId);

    const tbody = document.getElementById('list-detail-template');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Belum ada rincian komponen</td></tr>';
        return;
    }

    data.forEach(d => {
        const jenisClass = d.payroll_components.jenis === 'pemasukan' ? 'text-success' : 'text-danger';
        tbody.innerHTML += `
            <tr>
                <td>${d.payroll_components.nama_komponen}</td>
                <td class="${jenisClass}">${d.payroll_components.jenis}</td>
                <td>Rp ${parseFloat(d.nominal).toLocaleString('id-ID')}</td>
            </tr>`;
    });
}

// --- BAGIAN 3: PERIODE GAJI ---
document.getElementById('form-periode').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = document.getElementById('nama-periode').value;
    const mulai = document.getElementById('tgl-mulai').value;
    const selesai = document.getElementById('tgl-selesai').value;

    const { error } = await supabase.from('payroll_periods').insert([{
        office_id: currentUser.office_id,
        nama_periode: nama,
        tanggal_mulai: mulai,
        tanggal_selesai: selesai,
        status: 'Open'
    }]);

    if (error) return alert("Gagal membuat periode: " + error.message);
    document.getElementById('form-periode').reset();
    await loadDataPeriode();
});

async function loadDataPeriode() {
    const { data } = await supabase.from('payroll_periods').select('*').eq('office_id', currentUser.office_id);
    const tbody = document.getElementById('list-periode-table');
    tbody.innerHTML = '';

    data?.forEach(p => {
        const badgeColor = p.status === 'Open' ? 'bg-success' : 'bg-secondary';
        tbody.innerHTML += `
            <tr>
                <td>${p.nama_periode}</td>
                <td>${p.tanggal_mulai} s/d ${p.tanggal_selesai}</td>
                <td><span class="badge ${badgeColor}">${p.status}</span></td>
            </tr>`;
    });
}
