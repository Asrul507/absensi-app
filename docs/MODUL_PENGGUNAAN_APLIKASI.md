# Modul Penggunaan Aplikasi GenPro / Absensi App

Dokumen ini berisi panduan penggunaan aplikasi absensi dan HR untuk pengguna **Staff**, **Admin/Supervisor**, **HR/Admin All**, dan **Super Admin**.

> Nama aplikasi pada tampilan sidebar: **GenPro**  
> Backend: **Supabase**  
> Deployment: **Static frontend / Netlify-ready**

---

## 1. Tujuan Aplikasi

Aplikasi GenPro / Absensi App digunakan untuk membantu operasional HR dan absensi karyawan, meliputi:

- Absensi masuk dan pulang kerja.
- Pengajuan cuti, sakit, izin, dan kebutuhan HR lainnya.
- Perbaikan absen jika ada data masuk/pulang yang keliru atau terlupa.
- Approval pengajuan dan approval absensi.
- Pengaturan shift, jadwal kerja, lokasi radius GPS, dan data karyawan.
- Rekap absensi harian, bulanan, dan laporan keseluruhan.
- Pengelolaan multi-office dan department.

---

## 2. Hak Akses Pengguna

Aplikasi menggunakan role untuk membatasi menu dan data yang dapat diakses.

| Role | Fungsi Utama | Lingkup Akses |
|---|---|---|
| `staff` | Absensi, pengajuan, perbaikan absen, lihat riwayat pribadi | Data pribadi sendiri |
| `admin` | Supervisor / admin departemen | Data dalam department yang sama |
| `admin_hr` | HR dalam satu office/client | Data semua department pada office/client terkait |
| `admin_all` | Admin semua department dalam satu office/client | Data semua department pada office/client terkait |
| `super_admin` | Pengelola seluruh office dan department | Global / semua office |

Catatan:

- Role lama seperti `hr`, `spv`, dan `supervisor` akan dinormalisasi ke role baru.
- Akun yang statusnya bukan **Aktif** tidak dapat masuk ke aplikasi.
- Super admin dapat mengelola lintas office.
- Staff hanya melihat dan mengelola data miliknya sendiri.

---

## 3. Cara Login

1. Buka URL aplikasi.
2. Isi **Username / Email**.
3. Isi **Password**.
4. Isi **Kode Office** jika akun bukan super admin dan sistem belum otomatis mendeteksi office.
5. Klik tombol **Login**.

Jika login berhasil, sistem akan membuka halaman utama dan menampilkan dashboard sesuai hak akses pengguna.

### Kendala Login yang Sering Terjadi

| Kendala | Penyebab Kemungkinan | Solusi |
|---|---|---|
| Akun tidak bisa login | Email/password salah | Cek kembali username/email dan password |
| Profil tidak ditemukan | Akun auth ada tetapi data `profiles` belum dibuat | Hubungi HR/Admin |
| Akun tidak aktif | `status_akun` bukan `Aktif` | Hubungi HR/Admin untuk aktivasi |
| Office tidak terdeteksi | Username ada di beberapa office atau kode office belum diisi | Isi kode office secara manual |

---

## 4. Panduan Pengguna Staff

Menu staff terdiri dari:

- Dashboard
- Absensi Kerja
- Perbaikan Absen
- Pengajuan Cuti/Sakit
- Kalender Kerja
- Log Kehadiran
- Rekap In/Out
- Laporan Statistik
- Profil Saya

### 4.1 Dashboard

Dashboard digunakan untuk melihat ringkasan informasi pribadi seperti status absensi, data pengajuan, dan informasi kehadiran.

Langkah penggunaan:

1. Login ke aplikasi.
2. Pilih menu **Dashboard**.
3. Periksa ringkasan absensi dan notifikasi jika tersedia.

---

### 4.2 Absensi Kerja

Menu **Absensi Kerja** digunakan untuk melakukan absen masuk dan absen pulang.

Langkah absen masuk:

1. Pilih menu **Absensi Kerja**.
2. Pastikan GPS/lokasi perangkat aktif.
3. Tunggu sistem membaca koordinat dan radius lokasi.
4. Klik tombol absen masuk.
5. Pastikan muncul notifikasi berhasil.

Langkah absen pulang:

1. Buka kembali menu **Absensi Kerja**.
2. Pastikan shift kerja hari itu sudah berjalan.
3. Klik tombol absen pulang.
4. Pastikan status absensi berubah menjadi selesai/complete.

Catatan penting:

- Absensi bergantung pada titik radius GPS yang diatur admin.
- Jika radius tidak terbaca, aktifkan izin lokasi browser dan pastikan koneksi internet stabil.
- Untuk shift malam, sistem dapat membaca jadwal lintas hari sesuai logic aplikasi.

---

### 4.3 Perbaikan Absen

Menu **Perbaikan Absen** digunakan jika karyawan:

- Lupa absen masuk.
- Lupa absen pulang.
- Salah jam absen.
- Ada data absensi yang perlu dikoreksi.

Langkah pengajuan perbaikan:

1. Pilih menu **Perbaikan Absen**.
2. Pilih tanggal absensi yang ingin diperbaiki.
3. Pilih jenis perbaikan.
4. Isi jam yang benar.
5. Tambahkan keterangan yang jelas.
6. Kirim pengajuan.
7. Tunggu approval dari admin/HR.

Catatan:

- Pengajuan perbaikan tidak otomatis mengubah rekap sebelum disetujui.
- Setelah disetujui, data akan masuk ke rekap sesuai logic approval.
- Pengajuan sebaiknya dilakukan pada tanggal yang valid dan tidak melebihi kebijakan perusahaan.

---

### 4.4 Pengajuan Cuti/Sakit/Izin

Menu **Pengajuan Cuti/Sakit** digunakan untuk mengajukan:

- Cuti tahunan.
- Sakit.
- Izin.
- Jenis pengajuan lain yang tersedia di aplikasi.

Langkah pengajuan:

1. Pilih menu **Pengajuan Cuti/Sakit**.
2. Pilih jenis pengajuan.
3. Isi tanggal mulai dan tanggal selesai.
4. Isi alasan/keterangan.
5. Lampirkan bukti jika diperlukan.
6. Klik kirim pengajuan.
7. Tunggu approval admin/HR.

Catatan:

- Untuk cuti tahunan, pastikan sisa cuti masih tersedia.
- Pengajuan yang masih pending dapat dicek melalui menu yang sama atau notifikasi.
- Status pengajuan biasanya berupa **pending**, **approved**, atau **rejected**.

---

### 4.5 Kalender Kerja

Menu **Kalender Kerja** digunakan untuk melihat jadwal kerja, hari masuk, off, cuti, sakit, atau izin.

Langkah penggunaan:

1. Pilih menu **Kalender Kerja**.
2. Lihat jadwal berdasarkan tanggal.
3. Periksa status kerja pada kalender.

---

### 4.6 Log Kehadiran

Menu **Log Kehadiran** digunakan untuk melihat daftar absensi pribadi secara ringkas.

Yang dapat dicek:

- Tanggal absensi.
- Jam masuk.
- Jam pulang.
- Status absensi.
- Keterangan jika ada.

---

### 4.7 Rekap In/Out

Menu **Rekap In/Out** digunakan untuk melihat rekap jam masuk dan jam pulang secara bulanan.

Gunakan menu ini untuk:

- Mengecek keterlambatan.
- Mengecek absen pulang.
- Mengecek data masuk/pulang yang belum lengkap.

---

### 4.8 Laporan Statistik

Menu **Laporan Statistik** digunakan untuk melihat rangkuman absensi dalam bentuk laporan/statistik.

Staff hanya melihat data miliknya sendiri.

---

### 4.9 Profil Saya

Menu **Profil Saya** digunakan untuk melihat data akun pribadi.

Data yang biasanya tersedia:

- Nama lengkap.
- Jabatan/departemen.
- Status akun.
- Foto profil.
- Informasi cuti atau masa kerja jika tersedia.

---

## 5. Panduan Admin / Supervisor / HR

Menu admin terdiri dari:

- Dashboard Admin
- Menu Absen
- Kalender HRD
- Cuti Tahunan & Pengajuan
- Perbaikan Absen
- Approval Absensi
- Atur Jadwal Kerja
- Kelola Shift
- Data Karyawan
- HR Personalia / Kontrak
- Titik Radius GPS
- Log Kehadiran Ringkas
- Rekap Bulanan In/Out
- Laporan Rekap Absensi
- Laporan Keseluruhan

---

### 5.1 Dashboard Admin

Dashboard admin digunakan untuk melihat ringkasan operasional absensi dan HR.

Admin dapat menggunakan dashboard untuk:

- Melihat status absensi karyawan.
- Memantau pengajuan pending.
- Memantau perbaikan absen pending.
- Melihat status approval absensi yang masih open.

---

### 5.2 Menu Absen

Admin juga dapat menggunakan menu absen jika admin tersebut ikut melakukan absensi sebagai karyawan.

Langkahnya sama seperti staff:

1. Buka **Menu Absen**.
2. Aktifkan GPS.
3. Lakukan absen masuk atau absen pulang.

---

### 5.3 Kalender HRD

Menu **Kalender HRD** digunakan untuk melihat jadwal kerja karyawan.

Admin/HR dapat memeriksa:

- Jadwal masuk.
- Off.
- Cuti.
- Sakit.
- Izin.
- Shift yang berlaku.

---

### 5.4 Cuti Tahunan & Pengajuan

Menu ini digunakan untuk mengelola pengajuan cuti, sakit, izin, dan pengajuan HR lainnya.

Langkah approval pengajuan:

1. Buka menu **Cuti Tahunan & Pengajuan**.
2. Cek daftar pengajuan dengan status **pending**.
3. Buka detail pengajuan.
4. Periksa tanggal, jenis pengajuan, alasan, dan bukti jika ada.
5. Pilih **Approve** jika disetujui.
6. Pilih **Reject** jika ditolak, lalu isi alasan penolakan.
7. Pastikan status berubah setelah diproses.

Catatan:

- Approval cuti harus memperhatikan sisa cuti karyawan.
- Data cuti yang disetujui dapat memengaruhi jadwal dan rekap absensi.
- Admin harus memastikan tanggal pengajuan sesuai kebijakan perusahaan.

---

### 5.5 Perbaikan Absen

Admin/HR menggunakan menu ini untuk memproses permintaan koreksi absensi dari staff.

Langkah approval perbaikan:

1. Buka menu **Perbaikan Absen**.
2. Filter atau cek data dengan status **pending**.
3. Buka detail pengajuan.
4. Bandingkan tanggal, jam yang diajukan, dan alasan karyawan.
5. Klik **Approve** jika data valid.
6. Klik **Reject** jika data tidak valid.
7. Cek ulang rekap absensi setelah approval.

Catatan:

- Jika kasusnya lupa absen pulang, pastikan jam pulang yang diinput benar.
- Jika perbaikan disetujui, status absensi sebaiknya menjadi complete sesuai aturan aplikasi.
- Hindari approval tanpa keterangan yang jelas.

---

### 5.6 Approval Absensi

Menu **Approval Absensi** digunakan untuk memproses data absensi yang masih berstatus **OPEN**.

Digunakan untuk kasus seperti:

- Absensi belum complete.
- Lupa absen pulang.
- Data absensi membutuhkan validasi admin.

Langkah penggunaan:

1. Buka menu **Approval Absensi**.
2. Cek daftar absensi dengan status **OPEN**.
3. Periksa nama, tanggal, jam masuk, jam pulang, dan keterangan.
4. Lakukan approval sesuai kondisi sebenarnya.
5. Cek hasilnya di rekap absensi.

---

### 5.7 Atur Jadwal Kerja

Menu **Atur Jadwal Kerja** digunakan untuk membuat atau mengubah jadwal kerja karyawan.

Langkah umum:

1. Buka menu **Atur Jadwal Kerja**.
2. Pilih karyawan atau department.
3. Pilih tanggal.
4. Pilih shift atau status jadwal.
5. Simpan perubahan.

Contoh status jadwal:

- Masuk.
- Off.
- Cuti.
- Sakit.
- Izin.
- Shift tertentu.

Catatan:

- Pastikan shift sudah dibuat lebih dulu di menu **Kelola Shift**.
- Perubahan jadwal dapat memengaruhi validasi absensi.

---

### 5.8 Kelola Shift

Menu **Kelola Shift** digunakan untuk membuat dan mengatur shift kerja.

Data yang biasanya diatur:

- Nama shift.
- Jam masuk.
- Jam pulang.
- Toleransi keterlambatan jika tersedia.
- Status shift aktif/tidak aktif.

Langkah penggunaan:

1. Buka menu **Kelola Shift**.
2. Tambahkan shift baru atau edit shift lama.
3. Isi jam masuk dan jam pulang.
4. Simpan.
5. Gunakan shift tersebut pada menu jadwal.

Catatan:

- Untuk shift malam, pastikan jam masuk dan jam pulang lintas hari diset dengan benar.
- Jangan menghapus shift yang masih digunakan jadwal aktif kecuali sudah dipastikan aman.

---

### 5.9 Data Karyawan

Menu **Data Karyawan** digunakan untuk mengelola data akun dan profil karyawan.

Admin dapat melakukan:

- Menambah karyawan baru.
- Mengubah data karyawan.
- Mengatur role.
- Mengatur department.
- Mengatur status akun.
- Mengelola foto profil jika tersedia.
- Membuat akun login karyawan.

Langkah tambah karyawan:

1. Buka menu **Data Karyawan**.
2. Klik tambah karyawan.
3. Isi nama lengkap, username/email, role, department, dan data lain yang diperlukan.
4. Buat akun login jika fitur tersedia.
5. Pastikan status akun **Aktif**.
6. Simpan data.

Catatan:

- Data `tanggal_bergabung` penting untuk perhitungan masa kerja dan cuti.
- Pastikan client/office dan department benar agar akses data tidak salah.
- Role menentukan menu yang muncul pada akun karyawan.

---

### 5.10 HR Personalia / Kontrak

Menu **HR Personalia / Kontrak** digunakan untuk mengelola data personalia, masa kerja, kontrak, dan cuti tahunan.

Fungsi utama:

- Melihat masa kerja.
- Mengelola tanggal bergabung.
- Mengelola masa kontrak.
- Mengecek status kontrak.
- Mengecek atau sinkronisasi cuti tahunan.

Catatan:

- Data tanggal bergabung harus benar agar masa kerja dan hak cuti valid.
- Untuk karyawan baru, cek apakah cuti sudah eligible atau belum sesuai aturan perusahaan.

---

### 5.11 Titik Radius GPS

Menu **Titik Radius GPS** digunakan untuk mengatur lokasi absensi.

Data yang diatur:

- Nama lokasi.
- Koordinat latitude.
- Koordinat longitude.
- Radius absensi.
- Status lokasi aktif.

Langkah penggunaan:

1. Buka menu **Titik Radius GPS**.
2. Tambahkan lokasi baru atau edit lokasi lama.
3. Isi latitude dan longitude dengan benar.
4. Tentukan radius yang diperbolehkan.
5. Simpan.
6. Uji absen menggunakan perangkat karyawan.

Catatan:

- Radius terlalu kecil dapat membuat karyawan sulit absen.
- Radius terlalu besar dapat mengurangi akurasi kontrol lokasi.
- Pastikan browser karyawan mengizinkan akses lokasi.

---

### 5.12 Log Kehadiran Ringkas

Menu ini digunakan untuk melihat daftar absensi karyawan secara ringkas.

Data yang dapat dicek:

- Nama karyawan.
- Tanggal.
- Jam masuk.
- Jam pulang.
- Status absensi.
- Keterangan.

---

### 5.13 Rekap Bulanan In/Out

Menu ini digunakan untuk melihat rekap masuk dan pulang karyawan dalam periode bulanan.

Gunakan untuk:

- Audit jam masuk.
- Audit jam pulang.
- Mengecek keterlambatan.
- Mengecek lupa absen pulang.
- Mengecek data yang belum complete.

---

### 5.14 Laporan Rekap Absensi

Menu ini digunakan untuk melihat laporan statistik absensi karyawan.

Admin dapat menggunakan laporan ini untuk:

- Rekap kehadiran.
- Rekap izin/sakit/cuti.
- Monitoring keterlambatan.
- Evaluasi disiplin kehadiran.

---

### 5.15 Laporan Keseluruhan

Menu **Laporan Keseluruhan** digunakan untuk melihat rekap lebih lengkap dari data absensi dan HR.

Gunakan menu ini untuk kebutuhan:

- Laporan bulanan HR.
- Laporan manajemen.
- Pemeriksaan data lintas menu.
- Evaluasi operasional.

---

## 6. Panduan Super Admin

Super admin memiliki akses global untuk mengelola multi-office dan department.

Menu tambahan super admin:

- **Office & Department**

### 6.1 Office & Department

Menu ini digunakan untuk mengatur struktur multi-tenant aplikasi.

Fungsi utama:

- Membuat office/client baru.
- Mengubah nama office/client.
- Mengatur kode office/domain login.
- Membuat department.
- Mengatur status office dan department.

Langkah penggunaan:

1. Login sebagai super admin.
2. Buka menu **Office & Department**.
3. Buat atau pilih office/client.
4. Tambahkan department yang diperlukan.
5. Pastikan status office dan department aktif.
6. Atur akun admin/HR pada office yang benar.

Catatan:

- Super admin dapat memilih konteks office aktif.
- Pastikan karyawan memiliki `client_id` dan `department_id` yang sesuai.
- Kesalahan mapping office/department dapat menyebabkan data tidak muncul pada admin terkait.

---

## 7. Alur Kerja Harian yang Disarankan

### 7.1 Alur Staff

1. Login.
2. Cek dashboard.
3. Absen masuk.
4. Bekerja sesuai jadwal.
5. Absen pulang.
6. Cek log kehadiran jika perlu.
7. Ajukan perbaikan jika ada kesalahan absensi.
8. Ajukan cuti/sakit/izin jika diperlukan.

### 7.2 Alur Admin / HR

1. Login.
2. Cek dashboard dan badge notifikasi.
3. Cek pengajuan pending.
4. Cek perbaikan absen pending.
5. Cek approval absensi OPEN.
6. Update jadwal/shift jika ada perubahan.
7. Cek rekap absensi harian/bulanan.
8. Perbaiki data karyawan jika ditemukan data tidak lengkap.

### 7.3 Alur Super Admin

1. Login.
2. Pilih office aktif jika diperlukan.
3. Cek struktur office dan department.
4. Pastikan admin/HR berada pada office yang benar.
5. Audit akses role jika ada kendala data tidak muncul.

---

## 8. Notifikasi

Aplikasi memiliki notifikasi untuk membantu pengguna melihat data yang perlu ditindaklanjuti.

Untuk staff, notifikasi dapat mencakup:

- Pengajuan yang masih pending.
- Perbaikan absen yang masih pending.

Untuk admin/HR, notifikasi dapat mencakup:

- Pengajuan pending.
- Perbaikan absen pending.
- Approval absensi dengan status OPEN.

Admin disarankan mengecek notifikasi setiap hari sebelum membuat laporan.

---

## 9. Troubleshooting Umum

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Menu tidak muncul | Role akun tidak sesuai | Cek role pada Data Karyawan / table `profiles` |
| Data karyawan tidak muncul | Beda office/department | Cek `client_id`, `department_id`, dan role admin |
| Tidak bisa absen | GPS mati / lokasi tidak diizinkan | Aktifkan GPS dan izinkan lokasi browser |
| Radius tidak sesuai | Titik GPS atau radius salah | Cek menu Titik Radius GPS |
| Pengajuan tidak muncul di admin | Scope role/admin tidak sesuai | Pastikan admin berada di office/department yang benar |
| Rekap tidak complete | Jam masuk/pulang belum lengkap atau approval belum selesai | Cek Approval Absensi dan Perbaikan Absen |
| Karyawan baru tidak punya cuti | Tanggal bergabung atau sinkronisasi cuti belum benar | Cek HR Personalia / Kontrak dan data tanggal bergabung |
| Login gagal karena akun tidak aktif | Status akun bukan Aktif | Aktifkan akun melalui admin/HR |

---

## 10. Standar Penggunaan Data

Agar aplikasi berjalan rapi, admin wajib menjaga data berikut:

1. **Nama karyawan** ditulis konsisten.
2. **Role** sesuai jabatan dan kebutuhan akses.
3. **Client/Office** tidak boleh kosong untuk user selain super admin.
4. **Department** harus sesuai lokasi kerja/struktur organisasi.
5. **Tanggal bergabung** wajib diisi untuk perhitungan masa kerja dan cuti.
6. **Status akun** harus Aktif jika karyawan masih bekerja.
7. **Shift** harus dibuat sebelum jadwal disusun.
8. **Radius GPS** harus diuji sebelum aplikasi digunakan massal.

---

## 11. Rekomendasi SOP Approval

### 11.1 Approval Cuti/Sakit/Izin

Sebelum approve:

- Cek jenis pengajuan.
- Cek tanggal pengajuan.
- Cek alasan.
- Cek sisa cuti jika jenisnya cuti tahunan.
- Cek bukti jika sakit/izin membutuhkan dokumen.

Approve hanya jika data valid.

### 11.2 Approval Perbaikan Absen

Sebelum approve:

- Cek tanggal.
- Cek jam yang diajukan.
- Cek alasan karyawan.
- Cocokkan dengan jadwal kerja.
- Pastikan tidak ada duplikasi data.

### 11.3 Approval Absensi OPEN

Sebelum approve:

- Pastikan status OPEN memang perlu ditutup.
- Pastikan jam pulang/masuk sesuai kondisi sebenarnya.
- Setelah approve, cek laporan rekap.

---

## 12. Catatan untuk Developer

Beberapa file penting yang berkaitan dengan penggunaan aplikasi:

| File | Fungsi |
|---|---|
| `js/app.js` | Entry point aplikasi, login, render menu, navigasi, notifikasi |
| `js/access-control.js` | Role, scope akses, tenant filter, department access |
| `js/ui.js` | Tampilan/menu absensi |
| `js/pengajuan.js` | Pengajuan cuti/sakit/izin |
| `js/perbaikan-absen.js` | Pengajuan dan approval perbaikan absen |
| `js/attendance-approval.js` | Approval absensi OPEN |
| `js/jadwal.js` | Pengaturan jadwal kerja |
| `js/shift.js` | Pengaturan shift |
| `js/rekap.js` | Laporan rekap absensi |
| `js/rekap-inout.js` | Rekap jam masuk/pulang |
| `js/daftar-absensi.js` | Log kehadiran |
| `js/laporan-keseluruhan.js` | Laporan keseluruhan |
| `js/admin_lokasi.js` | Titik radius GPS |
| `js/settings-app.js` | Office & department |
| `js/services/leave-service.js` | Logic masa kerja, kontrak, dan cuti tahunan |

---

## 13. Checklist Sebelum Go-Live

Gunakan checklist berikut sebelum aplikasi dipakai operasional penuh:

- [ ] Semua karyawan sudah dibuat di Data Karyawan.
- [ ] Semua akun memiliki role yang benar.
- [ ] Status akun aktif untuk karyawan aktif.
- [ ] Office/client sudah benar.
- [ ] Department sudah benar.
- [ ] Shift kerja sudah dibuat.
- [ ] Jadwal kerja sudah diinput.
- [ ] Titik radius GPS sudah diuji.
- [ ] Staff sudah tes login.
- [ ] Staff sudah tes absen masuk dan pulang.
- [ ] Admin sudah tes approval pengajuan.
- [ ] Admin sudah tes approval perbaikan absen.
- [ ] Admin sudah tes approval absensi OPEN.
- [ ] Rekap absensi sudah dicek setelah testing.
- [ ] Backup database atau export data penting sudah disiapkan.

---

## 14. Penutup

Modul ini dibuat sebagai panduan dasar penggunaan aplikasi GenPro / Absensi App. Jika ada perubahan menu, role, atau alur approval, dokumen ini perlu diperbarui agar tetap sesuai dengan versi aplikasi terbaru.
