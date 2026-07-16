// ========================================================
// AMBIL KONEKSI DATABASE & USER DARI HALAMAN UTAMA GENPRO
// ========================================================
if (typeof window.supabase === 'undefined' && window.parent && window.parent.supabase) {
    window.supabase = window.parent.supabase;
}

// Deklarasi global menggunakan var agar fleksibel
var supabase = window.supabase;
var currentUser = {};

// Fungsi internal untuk mengambil session secara aman
function updateCurrentUser() {
    currentUser = window.currentUser || window.parent?.currentUser || {};
    // Fallback jika dibungkus dalam objek user
    if (!currentUser.office_id && currentUser.user) {
        currentUser = currentUser.user;
    }
}

// Panggil di awal pembacaan skrip
updateCurrentUser();

document.addEventListener("DOMContentLoaded", async () => {
    // Perbarui session sekali lagi saat DOM siap
    updateCurrentUser();

    // Ambil ID Kantor yang valid
    const myOfficeId = currentUser.office_id || currentUser.client_id;
    console.log("Session Terdeteksi di Payroll Config:", currentUser, "Office ID:", myOfficeId);

    // Keamanan Akses Halaman
    if (currentUser.role && ['staff', 'admin_departement'].includes(currentUser.role)) {
        document.body.innerHTML = "<h3 class='text-center mt-5 text-danger'>Akses Ditolak. Halaman ini hanya untuk HR/Admin.</h3>";
        return;
    }

    // PENTING: Inisialisasi Event Listener hanya jika Elemen HTML-nya eksis di halaman
    const formKomponen = document.getElementById('form-komponen');
    if (formKomponen) {
        formKomponen.addEventListener('submit', async (e) => {
            e.preventDefault();
            updateCurrentUser();
            const targetOfficeId = currentUser.office_id || currentUser.client_id;
            
            const kode = document.getElementById('kode-komponen')?.value.toUpperCase();
            const nama = document.getElementById('nama-komponen')?.value;
            const jenis = document.getElementById('jenis-komponen')?.value;

            if (!targetOfficeId || targetOfficeId === 'undefined') {
                return alert("Gagal menyimpan: ID Kantor Anda tidak terdeteksi. Silakan coba log out dan log in kembali.");
            }

            const { error } = await supabase.from('payroll_components').insert([{
                office_id: targetOfficeId,
                kode_komponen: kode,
                nama_komponen: nama,
                jenis: jenis
            }]);

            if (error) return alert("Gagal menyimpan komponen: " + error.message);
            formKomponen.reset();
            await loadDataKomponen();
        });
    }

    const formTemplate = document.getElementById('form-template');
    if (formTemplate) {
        formTemplate.addEventListener('submit', async (e) => {
            e.preventDefault();
            updateCurrentUser();
            const targetOfficeId = currentUser.office_id || currentUser.client_id;
            const nama = document.getElementById('nama-template')?.value;

            const { error } = await supabase.from('payroll_templates').insert([{
                office_id: targetOfficeId,
                nama_template: nama
            }]);

            if (error) return alert("Gagal membuat template: " + error.message);
            formTemplate.reset();
            await loadDataTemplate();
        });
    }

    const formDetailTemplate = document.getElementById('form-detail-template');
    if (formDetailTemplate) {
        formDetailTemplate.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tempId = document.getElementById('aktif-template-id')?.value;
            const compId = document.getElementById('pilih-komponen')?.value;
            const nominal = document.getElementById('nominal-komponen')?.value;

            const { error } = await supabase.from('payroll_template_details').insert([{
                template_id: tempId,
                component_id: compId,
                nominal: nominal
            }]);

            if (error) return alert("Gagal menambah rincian: " + error.message);
            const inputNominal = document.getElementById('nominal-komponen');
            if (inputNominal) inputNominal.value = '';
            await loadDetailTemplate(tempId);
        });
    }

    const formPeriode = document.getElementById('form-periode');
    if (formPeriode) {
        formPeriode.addEventListener('submit', async (e) => {
            e.preventDefault();
            updateCurrentUser();
            const targetOfficeId = currentUser.office_id || currentUser.client_id;
            
            const nama = document.getElementById('nama-periode')?.value;
            const mulai = document.getElementById('tgl-mulai')?.value;
            const selesai = document.getElementById('tgl-selesai')?.value;

            const { error } = await supabase.from('payroll_periods').insert([{
                office_id: targetOfficeId,
                nama_periode: nama,
                tanggal_mulai: mulai,
                tanggal_selesai: selesai,
                status: 'Open'
            }]);

            if (error) return alert("Gagal membuat periode: " + error.message);
            formPeriode.reset();
            await loadDataPeriode();
        });
    }

    // Load data awal dari database
    await loadDataKomponen();
    await loadDataTemplate();
    await loadDataPeriode();
});

// --- LOAD DATA FUNCTIONS WITH DEFENSIVE CHECKS ---
async function loadDataKomponen() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    const { data } = await supabase.from('payroll_components').select('*').eq('office_id', targetOfficeId);
    const tbody = document.getElementById('list-komponen-table');
    const select = document.getElementById('pilih-komponen');
    
    if (tbody) tbody.innerHTML = '';
    if (select) select.innerHTML = '<option value="">-- Pilih Komponen --</option>';

    data?.forEach(k => {
        if (tbody) {
            const safeKode = (k.kode_komponen || '').replace(/'/g, '&#39;');
            const safeName = (k.nama_komponen || '').replace(/'/g, '&#39;');
            tbody.innerHTML += `<tr>
                <td>${k.kode_komponen}</td>
                <td>${k.nama_komponen}</td>
                <td><span class="badge ${k.jenis === 'pemasukan' ? 'bg-success' : 'bg-danger'}">${k.jenis}</span></td>
                <td>
                    <button class="btn btn-warning btn-sm py-0 px-2 me-1" onclick="editKomponen('${k.id}', '${safeKode}', '${safeName}', '${k.jenis}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm py-0 px-2" onclick="hapusKomponen('${k.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        }
        if (select) {
            select.innerHTML += `<option value="${k.id}">${k.nama_komponen} (${k.jenis})</option>`;
        }
    });
}

async function loadDataTemplate() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    const { data } = await supabase.from('payroll_templates').select('*').eq('office_id', targetOfficeId);
    const list = document.getElementById('list-template-grup');
    if (list) list.innerHTML = '';

    data?.forEach(t => {
        if (list) {
            const safeName = (t.nama_template || '').replace(/'/g, '&#39;');
            list.innerHTML += `<li class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                <span style="cursor:pointer;" onclick="pilihTemplate('${t.id}', '${safeName}')">${t.nama_template}</span>
                <button class="btn btn-danger btn-sm py-0 px-1 ms-2 flex-shrink-0" onclick="hapusTemplate('${t.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </li>`;
        }
    });
}

window.pilihTemplate = async function(id, nama) {
    const txtNama = document.getElementById('template-terpilih-nama');
    const inputId = document.getElementById('aktif-template-id');
    const formDetail = document.getElementById('form-detail-template');
    
    if (txtNama) txtNama.innerText = nama;
    if (inputId) inputId.value = id;
    if (formDetail) formDetail.style.display = 'flex';
    await loadDetailTemplate(id);
}

async function loadDetailTemplate(templateId) {
    if (!templateId) return;
    const { data } = await supabase
        .from('payroll_template_details')
        .select(`id, nominal, payroll_components ( nama_komponen, jenis )`)
        .eq('template_id', templateId);

    const tbody = document.getElementById('list-detail-template');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Belum ada rincian komponen</td></tr>';
        return;
    }

    data.forEach(d => {
        if (d.payroll_components) {
            const jenisClass = d.payroll_components.jenis === 'pemasukan' ? 'text-success' : 'text-danger';
            tbody.innerHTML += `
                <tr>
                    <td>${d.payroll_components.nama_komponen}</td>
                    <td class="${jenisClass}">${d.payroll_components.jenis}</td>
                    <td>Rp ${parseFloat(d.nominal).toLocaleString('id-ID')}</td>
                    <td>
                        <button class="btn btn-danger btn-sm py-0 px-1" onclick="hapusDetailKomponen('${d.id}', '${templateId}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
        }
    });
}

async function loadDataPeriode() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId || targetOfficeId === 'undefined') return;

    const { data } = await supabase.from('payroll_periods').select('*').eq('office_id', targetOfficeId);
    const tbody = document.getElementById('list-periode-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    data?.forEach(p => {
        const isOpen = p.status === 'Open';
        const badgeColor = isOpen ? 'bg-success' : 'bg-secondary';
        const aksiBtn = isOpen
            ? `<button class="btn btn-secondary btn-sm py-0 px-2" onclick="tutupPeriode('${p.id}')">
                   <i class="fas fa-lock me-1"></i>Tutup
               </button>`
            : `<span class="text-muted small">-</span>`;
        tbody.innerHTML += `
            <tr>
                <td>${p.nama_periode}</td>
                <td>${p.tanggal_mulai} s/d ${p.tanggal_selesai}</td>
                <td><span class="badge ${badgeColor}">${p.status}</span></td>
                <td>${aksiBtn}</td>
            </tr>`;
    });
}

// --- AKSI: HAPUS & EDIT KOMPONEN ---
window.hapusKomponen = async function(id) {
    if (!confirm("Hapus komponen ini? Pastikan tidak sedang digunakan di template.")) return;
    const { error } = await supabase.from('payroll_components').delete().eq('id', id);
    if (error) return alert("Gagal menghapus: " + error.message);
    await loadDataKomponen();
};

window.editKomponen = function(id, kode, nama, jenis) {
    const modalEl = document.getElementById('modalEditKomponen');
    if (!modalEl || typeof bootstrap === 'undefined') {
        return alert("Fitur edit tidak tersedia. Pastikan halaman dimuat ulang.");
    }
    document.getElementById('edit-komponen-id').value = id;
    document.getElementById('edit-kode-komponen').value = kode;
    document.getElementById('edit-nama-komponen').value = nama;
    document.getElementById('edit-jenis-komponen').value = jenis;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
};

window.simpanEditKomponen = async function() {
    const id = document.getElementById('edit-komponen-id').value;
    const kode = document.getElementById('edit-kode-komponen').value.toUpperCase();
    const nama = document.getElementById('edit-nama-komponen').value;
    const jenis = document.getElementById('edit-jenis-komponen').value;
    if (!kode || !nama) return alert("Kode dan Nama komponen tidak boleh kosong.");

    const { error } = await supabase.from('payroll_components').update({
        kode_komponen: kode,
        nama_komponen: nama,
        jenis: jenis
    }).eq('id', id);

    if (error) return alert("Gagal menyimpan: " + error.message);
    bootstrap.Modal.getInstance(document.getElementById('modalEditKomponen'))?.hide();
    await loadDataKomponen();
};

// --- AKSI: HAPUS TEMPLATE & DETAIL ---
window.hapusTemplate = async function(id) {
    if (!confirm("Hapus template ini beserta seluruh rincian komponennya?")) return;
    await supabase.from('payroll_template_details').delete().eq('template_id', id);
    const { error } = await supabase.from('payroll_templates').delete().eq('id', id);
    if (error) return alert("Gagal menghapus template: " + error.message);

    const txtNama = document.getElementById('template-terpilih-nama');
    if (txtNama) txtNama.innerText = '-';
    const formDetail = document.getElementById('form-detail-template');
    if (formDetail) formDetail.style.display = 'none';
    const tbody = document.getElementById('list-detail-template');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Pilih template terlebih dahulu</td></tr>';

    await loadDataTemplate();
};

window.hapusDetailKomponen = async function(detailId, templateId) {
    if (!confirm("Hapus komponen ini dari template?")) return;
    const { error } = await supabase.from('payroll_template_details').delete().eq('id', detailId);
    if (error) return alert("Gagal menghapus: " + error.message);
    await loadDetailTemplate(templateId);
};

// --- AKSI: TUTUP PERIODE ---
window.tutupPeriode = async function(id) {
    if (!confirm("Tutup periode ini? Periode yang ditutup tidak dapat dibuka kembali dan slip tidak bisa di-generate ulang.")) return;
    const { error } = await supabase.from('payroll_periods').update({ status: 'Closed' }).eq('id', id);
    if (error) return alert("Gagal menutup periode: " + error.message);
    await loadDataPeriode();
};
