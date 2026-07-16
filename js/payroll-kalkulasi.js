import { supabase } from './supabase.js';

var currentUser = window.currentUser || window.parent?.currentUser || {};

function updateCurrentUser() {
    currentUser = window.currentUser || window.parent?.currentUser || {};
    if (!currentUser.office_id && currentUser.user) {
        currentUser = currentUser.user;
    }
}

// Fungsi utama untuk menarik data absensi dan jadwal tanpa error 400
async function ambilDataKehadiranKaryawan(tanggalMulai, tanggalSelesai) {
    updateCurrentUser();
    
    // targetOfficeId menampung ID kantor user yang sedang aktif
    const targetOfficeId = currentUser.office_id || currentUser.client_id;
    if (!targetOfficeId) {
        console.error("🚨 ID Kantor tidak ditemukan pada session aktif.");
        return { absensi: [], jadwal: [] };
    }

    console.log(`Mengambil data untuk Office ID: ${targetOfficeId} dari ${tanggalMulai} s/d ${tanggalSelesai}`);

    // 1. TARIK DATA DARI TABEL ABSENSI (Menggunakan office_id)
    const { data: dataAbsensi, error: errAbsensi } = await supabase
        .from('absensi')
        .select(`
            user_id,
            tanggal,
            status_masuk,
            status_absensi,
            status_kehadiran,
            waktu_masuk,
            waktu_pulang,
            menit_pulang_cepat,
            office_id,
            department_id,
            departemen
        `)
        .gte('tanggal', tanggalMulai)
        .lte('tanggal', tanggalSelesai)
        .eq('office_id', targetOfficeId); // FIXED: office_id, bukan client_id

    if (errAbsensi) {
        console.error("🚨 ERROR AMBIL TABEL ABSENSI:", errAbsensi.message);
    }

    // 2. TARIK DATA DARI TABEL JADWAL (Menggunakan office_id)
    const { data: dataJadwal, error: errJadwal } = await supabase
        .from('jadwal')
        .select(`
            user_id,
            tanggal,
            shift_code,
            status_override,
            office_id,
            department_id,
            departemen
        `) // FIXED: Menghapus client_id dari select string
        .gte('tanggal', tanggalMulai)
        .lte('tanggal', tanggalSelesai)
        .eq('office_id', targetOfficeId); // FIXED: office_id, bukan client_id

    if (errJadwal) {
        console.error("🚨 ERROR AMBIL TABEL JADWAL:", errJadwal.message);
    }

    return {
        absensi: dataAbsensi || [],
        jadwal: dataJadwal || []
    };
}

// Ekspor fungsi ke objek global window
window.ambilDataKehadiranKaryawan = ambilDataKehadiranKaryawan;
