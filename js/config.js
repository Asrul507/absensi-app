/* ===============================================================
   ATTENDANCE CONFIGURATION
   
   Edit file ini untuk ubah kebijakan absensi perusahaan
   (Dari halaman admin, akan bisa di-config via UI nanti)
=============================================================== */

export const ATTENDANCE_CONFIG = {
  /* ===== GRACE PERIOD / TOLERANSI KETERLAMBATAN ===== */
  // Jika karyawan masuk <= grace period, tetap dianggap "Tepat Waktu"
  // Contoh: grace_period = 5, jam masuk 07:00
  // - masuk 07:05 → Tepat Waktu
  // - masuk 07:06 → Terlambat 1 menit
  GRACE_PERIOD_MINUTES: 5,

  /* ===== THRESHOLD TERLAMBAT ===== */
  // Jika terlambat > threshold, dianggap tidak masuk
  // (Gunakan untuk absensi yang bukan incomplete shift)
  MAX_ALLOWED_LATE_MINUTES: 60,

  /* ===== NOTIFIKASI RULES ===== */
  // Notify karyawan jika lupa absen pulang
  NOTIFY_FORGOT_PULANG: true,

  // Notify admin jika karyawan tidak absen X hari berturut-turut
  NOTIFY_ABSENT_DAYS: 3,

  /* ===== VALIDATION RULES ===== */
  // Require geolocation saat absen
  REQUIRE_GEOLOCATION: false, // Sudah ada validasi radius terpisah

  // Require foto saat absen
  REQUIRE_PHOTO: true,

  /* ===== CUTI & LEAVE ===== */
  // Jatah cuti per tahun (hari)
  ANNUAL_LEAVE_DAYS: 12,

  // Minimal masa kerja untuk eligible cuti (bulan)
  MIN_TENURE_FOR_LEAVE: 6,

  /* ===== EARLY CHECKOUT ===== */
  // Toleransi pulang lebih awal (menit)
  // Jika pulang <= grace period sebelum jam pulang resmi, tetap valid
  EARLY_CHECKOUT_GRACE_MINUTES: 5,
}

/* ===============================================================
   SHIFT TEMPLATES
   
   Jika ingin centralize shift definition, bisa pakai ini
   (Sekarang masih pakai di jadwal.shift_code)
=============================================================== */
export const SHIFT_TEMPLATES = {
  '2': {
    name: 'Shift Pagi',
    start_time: '07:00',
    end_time: '15:00',
    break_duration: 60, // menit
  },
  '3': {
    name: 'Shift Sore',
    start_time: '15:00',
    end_time: '23:00',
    break_duration: 60,
  },
  '4': {
    name: 'Shift Malam',
    start_time: '23:00',
    end_time: '07:00',
    break_duration: 60,
  },
  '8': {
    name: 'OFF',
    start_time: '-',
    end_time: '-',
    break_duration: 0,
  },
}

/* ===============================================================
   LEAVE TYPES
=============================================================== */
export const LEAVE_TYPES = {
  cuti: {
    label: 'Cuti',
    color: '#8b5cf6',
    icon: 'fa-umbrella-beach',
    require_approval: true,
    max_days_per_request: 14,
  },
  sakit: {
    label: 'Sakit',
    color: '#ef4444',
    icon: 'fa-heartbeat',
    require_approval: false, // bisa auto-approve kalau ada surat dokter
    max_days_per_request: 365,
  },
  izin: {
    label: 'Izin',
    color: '#06b6d4',
    icon: 'fa-hand-paper',
    require_approval: true,
    max_days_per_request: 5,
  },
}

/* ===============================================================
   NOTIFICATION MESSAGES
=============================================================== */
export const NOTIFICATIONS = {
  FORGOT_CHECKOUT: 'Kamu lupa absen pulang kemarin. Update sekarang!',
  ABSENT_STREAK: (days) => `Kamu tidak absen selama ${days} hari. Mohon hubungi HR jika ada masalah.`,
  LEAVE_APPROVED: 'Pengajuan cuti/sakit/izin kamu sudah disetujui.',
  LEAVE_REJECTED: 'Pengajuan cuti/sakit/izin kamu ditolak. Hubungi HR untuk info lebih lanjut.',
  LATE_WARNING: (minutes) => `Kamu terlambat ${minutes} menit. Pastikan informasi yang tercatat benar.`,
}
