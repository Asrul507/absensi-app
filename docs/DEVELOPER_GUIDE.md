# Developer Guide - GenPro / Absensi App

Dokumen ini hanya untuk developer atau owner aplikasi.

## Role Sistem

- super_admin
- admin_all
- admin_hr
- admin
- staff

## Struktur Hak Akses

### super_admin

- Mengelola seluruh office.
- Mengelola seluruh department.
- Mengelola konfigurasi tenant.
- Mengelola Office & Department.

### admin_all

- Mengelola seluruh department dalam satu office.

### admin_hr

- Mengelola seluruh data HR dalam satu office.

### admin

- Mengelola data pada department yang sama.

### staff

- Hanya data pribadi.

---

## Struktur Utama Aplikasi

### Absensi

- Check In
- Check Out
- Shift malam lintas hari
- Radius GPS

### Pengajuan

- Cuti
- Sakit
- Izin

### Approval

- Pengajuan
- Perbaikan Absen
- Approval Absensi OPEN

### Personalia

- Data Karyawan
- Masa Kerja
- Kontrak
- Cuti Tahunan

---

## Multi Tenant

Konsep utama:

Office (Client)
  └── Department
       └── User

Field utama:

- client_id
- department_id
- user_id

---

## Audit Berkala

Developer disarankan memeriksa:

- Approval Absensi
- Perbaikan Absen
- Perhitungan Cuti
- Masa Kerja
- Shift Malam
- Rekap Bulanan
- RLS Supabase

---

## File Penting

- js/app.js
- js/access-control.js
- js/attendance-approval.js
- js/perbaikan-absen.js
- js/pengajuan.js
- js/shift.js
- js/jadwal.js
- js/rekap.js
- js/services/leave-service.js

---

## Checklist Sebelum Release

- Uji login.
- Uji absen masuk.
- Uji absen pulang.
- Uji shift malam.
- Uji pengajuan.
- Uji approval.
- Uji rekap.
- Uji multi-office.
- Uji department scope.
- Uji cuti tahunan.
- Uji kontrak kerja.