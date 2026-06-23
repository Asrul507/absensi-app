export const PACKAGE_DEFINITIONS = Object.freeze({
  basic: Object.freeze({
    key: 'basic',
    label: 'Basic',
    price_label: 'Rp 10.000.000',
    max_employees: 30,
    max_admins: 1,
    max_departments: 1,
    max_locations: 1,
    max_gps_points: 1,
    features: Object.freeze({
      absensi_gps: true,
      shift_management: true,
      jadwal_manual: true,
      jadwal_excel: true,
      pengajuan: true,
      perbaikan_absen: true,
      approval_basic: true,
      approval_absensi_open: false,
      employee_excel_import: false,
      multi_department: false,
      personalia_kontrak: false,
      cuti_tahunan_otomatis: false,
      laporan_keseluruhan: false,
      custom_branding: false,
      priority_support: false,
    }),
  }),
  standard: Object.freeze({
    key: 'standard',
    label: 'Standard',
    price_label: 'Rp 17.500.000',
    max_employees: 100,
    max_admins: 3,
    max_departments: 5,
    max_locations: 1,
    max_gps_points: 3,
    features: Object.freeze({
      absensi_gps: true,
      shift_management: true,
      jadwal_manual: true,
      jadwal_excel: true,
      pengajuan: true,
      perbaikan_absen: true,
      approval_basic: true,
      approval_absensi_open: true,
      employee_excel_import: true,
      multi_department: true,
      personalia_kontrak: false,
      cuti_tahunan_otomatis: false,
      laporan_keseluruhan: false,
      custom_branding: false,
      priority_support: false,
    }),
  }),
  pro: Object.freeze({
    key: 'pro',
    label: 'Pro',
    price_label: 'Rp 30.000.000',
    max_employees: 300,
    max_admins: 10,
    max_departments: 15,
    max_locations: 3,
    max_gps_points: 10,
    features: Object.freeze({
      absensi_gps: true,
      shift_management: true,
      jadwal_manual: true,
      jadwal_excel: true,
      pengajuan: true,
      perbaikan_absen: true,
      approval_basic: true,
      approval_absensi_open: true,
      employee_excel_import: true,
      multi_department: true,
      personalia_kontrak: true,
      cuti_tahunan_otomatis: true,
      laporan_keseluruhan: true,
      custom_branding: true,
      priority_support: true,
    }),
  }),
})

export function normalizePackageType(value) {
  const key = String(value || 'basic').trim().toLowerCase()
  return PACKAGE_DEFINITIONS[key] ? key : 'basic'
}

export function getPackageDefaults(packageType = 'basic') {
  const key = normalizePackageType(packageType)
  const pkg = PACKAGE_DEFINITIONS[key]
  return {
    package_type: pkg.key,
    max_employees: pkg.max_employees,
    max_admins: pkg.max_admins,
    max_departments: pkg.max_departments,
    max_locations: pkg.max_locations,
    max_gps_points: pkg.max_gps_points,
  }
}

export function getPackageLabel(packageType = 'basic') {
  return PACKAGE_DEFINITIONS[normalizePackageType(packageType)].label
}

export function mergeClientPackageConfig(client = {}) {
  const defaults = getPackageDefaults(client.package_type)
  return {
    ...client,
    package_type: defaults.package_type,
    max_employees: Number(client.max_employees || defaults.max_employees),
    max_admins: Number(client.max_admins || defaults.max_admins),
    max_departments: Number(client.max_departments || defaults.max_departments),
    max_locations: Number(client.max_locations || defaults.max_locations),
    max_gps_points: Number(client.max_gps_points || defaults.max_gps_points),
    subscription_status: client.subscription_status || 'active',
    license_type: client.license_type || 'one_time',
  }
}

export function packageHasFeature(clientOrPackageType, featureKey) {
  const packageType = typeof clientOrPackageType === 'string'
    ? clientOrPackageType
    : clientOrPackageType?.package_type
  const pkg = PACKAGE_DEFINITIONS[normalizePackageType(packageType)]
  return Boolean(pkg.features?.[featureKey])
}

export function getPackageOptionsHtml(selected = 'basic') {
  const current = normalizePackageType(selected)
  return Object.values(PACKAGE_DEFINITIONS)
    .map(pkg => `<option value="${pkg.key}" ${pkg.key === current ? 'selected' : ''}>${pkg.label}</option>`)
    .join('')
}

export function buildPackageLimitText(client = {}) {
  const cfg = mergeClientPackageConfig(client)
  return `Max ${cfg.max_employees} karyawan · ${cfg.max_admins} admin · ${cfg.max_departments} department · ${cfg.max_locations} lokasi · ${cfg.max_gps_points} titik GPS`
}