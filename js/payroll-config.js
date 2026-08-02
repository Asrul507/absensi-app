import { supabase } from './supabase.js';

var currentUser = {};
let activeTemplateId = '';
let activeTemplateName = '';
const PAYROLL_COMPONENT_COLUMN_COUNT = 4;
const TEMPLATE_DETAIL_COLUMN_COUNT = 5;
const PAYROLL_MESSAGES = {
    noTemplateSelected: 'Pilih template terlebih dahulu',
    noComponents: 'Belum ada komponen payroll',
    noTemplateDetails: 'Belum ada rincian komponen',
    noTemplates: 'Belum ada template payroll'
};

// Fungsi internal untuk mengambil session secara aman
function updateCurrentUser() {
    currentUser = window.currentUser || window.parent?.currentUser || {};
    if (!currentUser.office_id && currentUser.user) {
        currentUser = currentUser.user;
    }
}

// Panggil di awal pembacaan skrip
updateCurrentUser();

document.addEventListener("DOMContentLoaded", async () => {
    updateCurrentUser();
    const myOfficeId = currentUser.office_id || currentUser.client_id;
    console.log("Session Terdeteksi di Payroll Config:", currentUser, "Office ID:", myOfficeId);

    // Keamanan Akses Halaman
    if (currentUser.role && ['staff', 'admin_departement'].includes(currentUser.role)) {
        document.body.innerHTML = "<h3 class='text-center mt-5 text-danger'>Akses Ditolak. Halaman ini hanya untuk HR/Admin.</h3>";
        return;
    }

    // Event Listener Form Komponen
    const formKomponen = document.getElementById('form-komponen');
    if (formKomponen) {
        formKomponen.addEventListener('submit', async (e) => {
            e.preventDefault();
            updateCurrentUser();
            const targetOfficeId = currentUser.office_id || currentUser.client_id;
            
            const kode = document.getElementById('kode-komponen')?.value.toUpperCase();
            const nama = document.getElementById('nama-komponen')?.value;
            const jenis = document.getElementById('jenis-komponen')?.value;

            if (!targetOfficeId) {
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

    const komponenTable = document.getElementById('list-komponen-table');
    if (komponenTable) {
        komponenTable.addEventListener('click', (event) => {
            const actionButton = event.target.closest('button[data-action]');
            if (!actionButton) return;

            const { action, id, kode, nama, jenis } = actionButton.dataset;
            if (action === 'edit-komponen') {
                window.editKomponen(id, kode || '', nama || '', jenis || 'pemasukan');
            } else if (action === 'hapus-komponen') {
                window.hapusKomponen(id);
            }
        });
    }

    // Event Listener Form Template
    const formTemplate = document.getElementById('form-template');
    if (formTemplate) {
        formTemplate.addEventListener('submit', async (e) => {
            e.preventDefault();
            updateCurrentUser();
            const targetOfficeId = currentUser.office_id || currentUser.client_id;
            const nama = document.getElementById('nama-template')?.value?.trim();

            if (!targetOfficeId) return alert("Gagal membuat template: ID Kantor tidak terdeteksi.");
            if (!nama) return alert("Nama template tidak boleh kosong.");

            const { data, error } = await supabase
                .from('payroll_templates')
                .insert([{ office_id: targetOfficeId, nama_template: nama }])
                .select('id, nama_template')
                .single();

            if (error) return alert("Gagal membuat template: " + error.message);
            formTemplate.reset();
            await loadDataTemplate();
            if (data?.id) window.pilihTemplate(data.id, data.nama_template);
        });
    }

    const templateList = document.getElementById('list-template-grup');
    if (templateList) {
        templateList.addEventListener('click', (event) => {
            const actionButton = event.target.closest('button[data-action]');
            if (!actionButton) return;

            const { action, id, nama } = actionButton.dataset;
            if (action === 'pilih-template') {
                window.pilihTemplate(id, nama || '');
            } else if (action === 'edit-template') {
                window.editTemplate(id, nama || '');
            } else if (action === 'hapus-template') {
                window.hapusTemplate(id);
            }
        });
    }

    // Event Listener Form Detail Template
    const formDetailTemplate = document.getElementById('form-detail-template');
    if (formDetailTemplate) {
        formDetailTemplate.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tempId = document.getElementById('aktif-template-id')?.value;
            const compId = document.getElementById('pilih-komponen')?.value;
            const nominal = document.getElementById('nominal-komponen')?.value;
            const tipeNilai = document.getElementById('tipe-nilai-komponen')?.value || 'nominal';

            if (!tempId) return alert("Pilih template terlebih dahulu.");
            if (!compId) return alert("Pilih komponen terlebih dahulu.");
            if (nominal === '' || nominal === null) return alert("Nominal komponen wajib diisi.");

            const { data: existingDetail, error: existingError } = await supabase
                .from('payroll_template_details')
                .select('id')
                .eq('template_id', tempId)
                .eq('component_id', compId)
                .maybeSingle();

            if (existingError) return alert("Gagal memeriksa rincian template: " + existingError.message);

            const payload = { template_id: tempId, component_id: compId, nominal: Number(nominal), tipe_nilai: tipeNilai };
            let error = null;
            if (existingDetail?.id) {
                const updateResult = await supabase
                    .from('payroll_template_details')
                    .update({ nominal: payload.nominal, tipe_nilai: payload.tipe_nilai })
                    .eq('id', existingDetail.id);
                error = updateResult.error;
            } else {
                const insertResult = await supabase.from('payroll_template_details').insert([payload]);
                error = insertResult.error;
            }

            if (error) return alert("Gagal menambah rincian: " + error.message);
            document.getElementById('pilih-komponen').value = '';
            document.getElementById('nominal-komponen').value = '';
            document.getElementById('tipe-nilai-komponen').value = 'nominal';
            await loadDetailTemplate(tempId);
        });
    }

    const tipeNilaiInput = document.getElementById('tipe-nilai-komponen');
    const nominalInput = document.getElementById('nominal-komponen');
    const syncLabelTipeNilai = () => {
        if (!tipeNilaiInput || !nominalInput) return;
        if (tipeNilaiInput.value === 'persen') {
            nominalInput.placeholder = 'Persen (%)';
            nominalInput.max = '100';
        } else {
            nominalInput.placeholder = 'Nominal Rp.';
            nominalInput.removeAttribute('max');
        }
    };
    if (tipeNilaiInput) {
        tipeNilaiInput.addEventListener('change', syncLabelTipeNilai);
        syncLabelTipeNilai();
    }

    const detailTable = document.getElementById('list-detail-template');
    if (detailTable) {
        detailTable.addEventListener('click', (event) => {
            const actionButton = event.target.closest('button[data-action]');
            if (!actionButton) return;
            const { action, detailId, templateId } = actionButton.dataset;
            if (action === 'hapus-detail') {
                window.hapusDetailKomponen(detailId, templateId);
            }
        });
    }

    // Event Listener Periode Gaji
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

    // Load data awal saat halaman siap
    await loadDataKomponen();
    await loadDataTemplate();
    await loadDataPeriode();
    if (myOfficeId) {
        await loadPayrollDeductionRules(myOfficeId);
    }
});

// --- LOAD DATA FUNCTIONS ---
async function loadDataKomponen() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId) return;

    const { data } = await supabase.from('payroll_components').select('*').eq('office_id', targetOfficeId);
    const tbody = document.getElementById('list-komponen-table');
    const select = document.getElementById('pilih-komponen');
    
    if (tbody) tbody.innerHTML = '';
    if (select) select.innerHTML = '<option value="">-- Pilih Komponen --</option>';

    let komponenRowsHtml = '';
    let komponenOptionsHtml = '<option value="">-- Pilih Komponen --</option>';
    data?.forEach(k => {
        komponenRowsHtml += `<tr>
            <td>${escapeHtml(k.kode_komponen)}</td>
            <td>${escapeHtml(k.nama_komponen)}</td>
            <td><span class="badge ${k.jenis === 'pemasukan' ? 'bg-success' : 'bg-danger'}">${escapeHtml(k.jenis)}</span></td>
            <td>
                <button class="btn btn-warning btn-sm py-0 px-2 me-1"
                    data-action="edit-komponen"
                    data-id="${escapeHtml(k.id)}"
                    data-kode="${escapeHtml(k.kode_komponen)}"
                    data-nama="${escapeHtml(k.nama_komponen)}"
                    data-jenis="${escapeHtml(k.jenis)}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm py-0 px-2"
                    data-action="hapus-komponen"
                    data-id="${escapeHtml(k.id)}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
        komponenOptionsHtml += `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama_komponen)} (${escapeHtml(k.jenis)})</option>`;
    });

    if (tbody) tbody.innerHTML = komponenRowsHtml || buildEmptyStateRow(PAYROLL_COMPONENT_COLUMN_COUNT, PAYROLL_MESSAGES.noComponents);
    if (select) select.innerHTML = komponenOptionsHtml;
}

async function loadDataTemplate() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId) return;

    const { data } = await supabase
        .from('payroll_templates')
        .select('*')
        .eq('office_id', targetOfficeId)
        .order('nama_template');
    const list = document.getElementById('list-template-grup');
    if (list) list.innerHTML = '';

    let activeTemplateStillExists = false;
    let templateListHtml = '';
    data?.forEach(t => {
        const isActive = String(t.id) === String(activeTemplateId);
        if (isActive) activeTemplateStillExists = true;
        templateListHtml += `<li class="list-group-item d-flex justify-content-between align-items-center ${isActive ? 'active' : ''}">
            <div class="me-2">
                <div class="fw-semibold">${escapeHtml(t.nama_template)}</div>
                <div class="small ${isActive ? 'text-white-50' : 'text-muted'}">Pilih template untuk atur komponen.</div>
            </div>
            <div class="d-flex gap-1 flex-shrink-0">
                <button class="btn btn-sm ${isActive ? 'btn-light text-primary' : 'btn-outline-primary'}"
                    data-action="pilih-template"
                    data-id="${escapeHtml(t.id)}"
                    data-nama="${escapeHtml(t.nama_template)}">
                    ${isActive ? 'Aktif' : 'Pilih'}
                </button>
                <button class="btn btn-outline-warning btn-sm"
                    data-action="edit-template"
                    data-id="${escapeHtml(t.id)}"
                    data-nama="${escapeHtml(t.nama_template)}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm py-0 px-2"
                    data-action="hapus-template"
                    data-id="${escapeHtml(t.id)}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </li>`;
    });

    if (!data || data.length === 0) {
        resetTemplateSelection();
        if (list) list.innerHTML = `<li class="list-group-item text-muted text-center">${escapeHtml(PAYROLL_MESSAGES.noTemplates)}</li>`;
        return;
    }

    if (list) list.innerHTML = templateListHtml;

    if (!activeTemplateStillExists) {
        if (activeTemplateId) resetTemplateSelection();
        return;
    }

    if (activeTemplateId) {
        const selectedTemplate = data.find((item) => String(item.id) === String(activeTemplateId));
        if (selectedTemplate) {
            activeTemplateName = selectedTemplate.nama_template || activeTemplateName;
            const txtNama = document.getElementById('template-terpilih-nama');
            if (txtNama) txtNama.innerText = activeTemplateName;
            await loadDetailTemplate(activeTemplateId);
        }
    }
}

window.pilihTemplate = async function(id, nama) {
    activeTemplateId = id || '';
    activeTemplateName = nama || '';

    const txtNama = document.getElementById('template-terpilih-nama');
    const inputId = document.getElementById('aktif-template-id');
    const formDetail = document.getElementById('form-detail-template');
    
    if (txtNama) txtNama.innerText = activeTemplateName || '-';
    if (inputId) inputId.value = activeTemplateId;
    if (formDetail) formDetail.style.display = activeTemplateId ? 'flex' : 'none';

    await loadDataTemplate();
};

window.editTemplate = function(id, nama) {
    const modalEl = document.getElementById('modalEditTemplate');
    if (!modalEl || typeof bootstrap === 'undefined') {
        return alert("Fitur edit template tidak tersedia. Pastikan halaman dimuat ulang.");
    }

    document.getElementById('edit-template-id').value = id;
    document.getElementById('edit-nama-template').value = nama;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
};

window.simpanEditTemplate = async function() {
    const id = document.getElementById('edit-template-id')?.value;
    const nama = document.getElementById('edit-nama-template')?.value?.trim();

    if (!id) return alert("Template tidak ditemukan.");
    if (!nama) return alert("Nama template tidak boleh kosong.");

    const { error } = await supabase
        .from('payroll_templates')
        .update({ nama_template: nama })
        .eq('id', id);

    if (error) return alert("Gagal menyimpan template: " + error.message);

    bootstrap.Modal.getInstance(document.getElementById('modalEditTemplate'))?.hide();
    if (String(activeTemplateId) === String(id)) {
        activeTemplateName = nama;
        const txtNama = document.getElementById('template-terpilih-nama');
        if (txtNama) txtNama.innerText = nama;
    }
    await loadDataTemplate();
};

async function loadDetailTemplate(templateId) {
    if (!templateId) return;
    const { data } = await supabase
        .from('payroll_template_details')
        .select(`id, nominal, tipe_nilai, payroll_components ( nama_komponen, jenis )`)
        .eq('template_id', templateId);

    const tbody = document.getElementById('list-detail-template');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = buildEmptyStateRow(TEMPLATE_DETAIL_COLUMN_COUNT, PAYROLL_MESSAGES.noTemplateDetails);
        return;
    }

    let detailRowsHtml = '';
    data.forEach(d => {
        if (d.payroll_components) {
            const jenisClass = d.payroll_components.jenis === 'pemasukan' ? 'text-success' : 'text-danger';
            const tipeNilai = d.tipe_nilai === 'persen' ? 'persen' : 'nominal';
            const nilaiFormatted = tipeNilai === 'persen'
                ? `${parseFloat(d.nominal || 0).toLocaleString('id-ID')}%`
                : `Rp ${parseFloat(d.nominal || 0).toLocaleString('id-ID')}`;
            detailRowsHtml += `
            <tr>
                <td>${escapeHtml(d.payroll_components.nama_komponen)}</td>
                <td class="${jenisClass}">${escapeHtml(d.payroll_components.jenis)}</td>
                <td class="text-uppercase">${escapeHtml(tipeNilai)}</td>
                <td>${nilaiFormatted}</td>
                <td>
                    <button class="btn btn-danger btn-sm py-0 px-1"
                        data-action="hapus-detail"
                        data-detail-id="${escapeHtml(d.id)}"
                        data-template-id="${escapeHtml(templateId)}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        }
    });
    tbody.innerHTML = detailRowsHtml || buildEmptyStateRow(TEMPLATE_DETAIL_COLUMN_COUNT, PAYROLL_MESSAGES.noTemplateDetails);
}

async function loadDataPeriode() {
    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId) return;

    const { data } = await supabase.from('payroll_periods').select('*').eq('office_id', targetOfficeId);
    const tbody = document.getElementById('list-periode-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    let periodeRowsHtml = '';
    data?.forEach(p => {
        const isOpen = p.status === 'Open';
        const badgeColor = isOpen ? 'bg-success' : 'bg-secondary';
        const aksiBtn = isOpen
            ? `<button class="btn btn-secondary btn-sm py-0 px-2" onclick="tutupPeriode('${escapeHtml(p.id)}')">
                   <i class="fas fa-lock me-1"></i>Tutup
               </button>`
            : `<span class="text-muted small">-</span>`;
        periodeRowsHtml += `
        <tr>
            <td>${escapeHtml(p.nama_periode)}</td>
            <td>${escapeHtml(p.tanggal_mulai)} s/d ${escapeHtml(p.tanggal_selesai)}</td>
            <td><span class="badge ${badgeColor}">${escapeHtml(p.status)}</span></td>
            <td>${aksiBtn}</td>
        </tr>`;
    });
    tbody.innerHTML = periodeRowsHtml;
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

    if (String(activeTemplateId) === String(id)) resetTemplateSelection();
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

function resetTemplateSelection() {
    activeTemplateId = '';
    activeTemplateName = '';
    const txtNama = document.getElementById('template-terpilih-nama');
    const inputId = document.getElementById('aktif-template-id');
    const formDetail = document.getElementById('form-detail-template');
    const tbody = document.getElementById('list-detail-template');

    if (txtNama) txtNama.innerText = '-';
    if (inputId) inputId.value = '';
    if (formDetail) formDetail.style.display = 'none';
    if (tbody) tbody.innerHTML = buildEmptyStateRow(TEMPLATE_DETAIL_COLUMN_COUNT, PAYROLL_MESSAGES.noTemplateSelected);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildEmptyStateRow(columnCount, message) {
    return `<tr><td colspan="${columnCount}" class="text-center text-muted">${escapeHtml(message)}</td></tr>`;
}

// ============================================================
// LOGIKA PENGATURAN ABSENSI & GAJI HARIAN (CRUD COMPLETE)
// ============================================================

async function loadPayrollDeductionRules(officeId) {
  const tbody = document.getElementById('payrollDeductionRulesBody');
  if (!tbody) return;

  try {
    const { data, error } = await supabase
      .from('payroll_deduction_rules')
      .select('*')
      .eq('office_id', officeId)
      .order('status_absensi', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Belum ada data aturan. Klik "+ Tambah Status Absensi" untuk membuat baru.</td></tr>';
      return;
    }

    const lockedStatuses = ['hadir', 'alpa', 'mangkir'];

    tbody.innerHTML = data.map(rule => {
      const isLocked = lockedStatuses.includes(rule.status_absensi.toLowerCase());
      return `
        <tr>
          <td class="fw-bold text-capitalize align-middle">${escapeHtml(rule.status_absensi)}</td>
          <td class="align-middle">
            <select 
              class="form-select form-select-sm" 
              style="max-width: 220px;"
              ${isLocked ? 'disabled' : ''} 
              onchange="updateDeductionRule('${escapeHtml(rule.id)}', this.value)"
            >
              <option value="dihitung" ${!rule.is_deducted ? 'selected' : ''}>Dihitung (Dibayar)</option>
              <option value="dipotong" ${rule.is_deducted ? 'selected' : ''}>Dipotong (Tidak Dibayar)</option>
            </select>
          </td>
          <td class="text-muted small align-middle">
            ${rule.is_deducted 
              ? '<span class="text-danger"><i class="fas fa-times-circle me-1"></i>Hari ini memotong gaji harian.</span>' 
              : '<span class="text-success"><i class="fas fa-check-circle me-1"></i>Hari ini dihitung mendapat gaji harian.</span>'}
          </td>
          <td class="align-middle text-center">
            ${!isLocked ? `
              <button class="btn btn-danger btn-sm py-0 px-2" onclick="hapusAturanAbsensi('${escapeHtml(rule.id)}', '${escapeHtml(rule.status_absensi)}')">
                <i class="fas fa-trash"></i>
              </button>
            ` : '<span class="text-muted small">Bawaan</span>'}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Gagal memuat aturan potongan:', err);
    tbody.innerHTML = '<tr><td colspan="4" class="text-danger text-center">Gagal memuat aturan dari database.</td></tr>';
  }
}

function bukaModalTambahAturan() {
  const modalEl = document.getElementById('modalTambahAturan');
  if (!modalEl || typeof bootstrap === 'undefined') {
    return alert("Modal tidak ditemukan. Pastikan halaman dimuat ulang.");
  }
  document.getElementById('input-status-absensi').value = '';
  document.getElementById('input-kategori-absensi').value = 'dihitung';
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

async function simpanAturanBaru() {
  updateCurrentUser();
  const targetOfficeId = currentUser.office_id || currentUser.client_id;
  const statusInput = document.getElementById('input-status-absensi')?.value?.trim().toLowerCase();
  const kategoriInput = document.getElementById('input-kategori-absensi')?.value;

  if (!targetOfficeId) return alert("ID Kantor tidak terdeteksi.");
  if (!statusInput) return alert("Nama status absensi tidak boleh kosong.");

  const isDeducted = (kategoriInput === 'dipotong');

  try {
    const { error } = await supabase
      .from('payroll_deduction_rules')
      .insert([{
        office_id: targetOfficeId,
        status_absensi: statusInput,
        is_deducted: isDeducted
      }]);

    if (error) throw error;

    bootstrap.Modal.getInstance(document.getElementById('modalTambahAturan'))?.hide();
    await loadPayrollDeductionRules(targetOfficeId);
  } catch (err) {
    alert("Gagal menambahkan status absensi: " + err.message);
  }
}

async function hapusAturanAbsensi(ruleId, namaStatus) {
  if (!confirm(`Hapus aturan untuk status "${namaStatus}"?`)) return;

  try {
    const { error } = await supabase
      .from('payroll_deduction_rules')
      .delete()
      .eq('id', ruleId);

    if (error) throw error;

    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (targetOfficeId) {
      await loadPayrollDeductionRules(targetOfficeId);
    }
  } catch (err) {
    alert("Gagal menghapus aturan: " + err.message);
  }
}

async function updateDeductionRule(ruleId, selectedValue) {
  const isDeducted = (selectedValue === 'dipotong');

  try {
    const { error } = await supabase
      .from('payroll_deduction_rules')
      .update({ 
        is_deducted: isDeducted, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', ruleId);

    if (error) throw error;

    updateCurrentUser();
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (targetOfficeId) {
      await loadPayrollDeductionRules(targetOfficeId);
    }
  } catch (err) {
    alert('Gagal menyimpan perubahan aturan!');
    console.error('Update error:', err);
  }
}

// Ekspor fungsi ke objek global window agar dapat dipanggil elemen HTML
window.bukaModalTambahAturan = bukaModalTambahAturan;
window.simpanAturanBaru = simpanAturanBaru;
window.hapusAturanAbsensi = hapusAturanAbsensi;
window.updateDeductionRule = updateDeductionRule;
window.loadPayrollDeductionRules = loadPayrollDeductionRules;
