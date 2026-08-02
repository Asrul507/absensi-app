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

/**
 * Menghitung Total Gaji Harian Karyawan berdasarkan Aturan Potongan Absensi
 * @param {Array} attendanceLogs - Riwayat absensi karyawan dalam periode tersebut
 * @param {Array} deductionRules - Data dari tabel payroll_deduction_rules untuk office_id terkait
 * @param {number} dailyRate - Nominal gaji per hari karyawan
 * @returns {Object} Hasil rincian hari dibayar, hari dipotong, dan total gaji harian
 */
export function hitungGajiHarianKaryawan(attendanceLogs, deductionRules, dailyRate) {
  // 1. Buat Peta Aturan: status_absensi -> is_deducted (true = dipotong, false = dibayar)
  const ruleMap = {};
  if (Array.isArray(deductionRules)) {
    deductionRules.forEach(rule => {
      ruleMap[rule.status_absensi.toLowerCase()] = rule.is_deducted;
    });
  }

  let totalHariDibayar = 0;
  let totalHariDipotong = 0;
  const rincianHari = [];

  // 2. Evaluasi setiap baris absensi karyawan
  if (Array.isArray(attendanceLogs)) {
    attendanceLogs.forEach(log => {
      const status = (log.status_absensi || log.status || '').toLowerCase();
      // Default: jika status tidak terdaftar, dianggap dipotong jika alpa/mangkir, sisanya dibayar
      const defaultDeducted = ['alpa', 'mangkir'].includes(status);
      const isDeducted = ruleMap.hasOwnProperty(status) ? ruleMap[status] : defaultDeducted;

      if (!isDeducted) {
        totalHariDibayar += 1;
        rincianHari.push({ tanggal: log.tanggal, status, dibayar: true });
      } else {
        totalHariDipotong += 1;
        rincianHari.push({ tanggal: log.tanggal, status, dibayar: false });
      }
    });
  }

  // 3. Kalkulasi Total Nominal Gaji Harian
  const totalGajiHarian = totalHariDibayar * Number(dailyRate || 0);

  return {
    totalHariDibayar,
    totalHariDipotong,
    dailyRate: Number(dailyRate || 0),
    totalGajiHarian,
    rincianHari
  };
}
