KelasKu v6.7.36 — Live Academic UX Fix
Build: 20260929.336
Schema: 17 (TIDAK BERUBAH)

FOKUS RELEASE
- Perbaikan foto/cover kelas yang tampil sebagai broken image: cover hanya dipasang setelah benar-benar berhasil dimuat, jika gagal otomatis kembali ke icon kelas.
- Kalender Akademik 30 Hari memakai jendela 7 hari terakhir + 23 hari ke depan dan memberi stamp SELESAI / LEWAT / BATAL.
- Agenda Mendatang dipadatkan: 8 item per halaman, dua baris informasi utama, lalu pill metadata di bawah separator.
- Presensi dari menu Absensi global dibuka sebagai modal di halaman yang sama, tidak berpindah ke halaman Presensi Kelas.
- Owner/Koordinator yang juga peserta dapat mengisi Presensi Saya langsung dari Ruang Kelas, termasuk pilihan Zoom / YouTube / Offline.
- Detail sesi absensi backend sekarang mengirim my_record + can_self_checkin agar tampilan Owner/Koordinator tidak ambigu.
- Release metadata diperbaiki ke v6.7.36 dan syncKelasKuRelease() juga membersihkan cache App Config.
- Seluruh mekanisme v6.7.34 (batch jadwal, anti-duplikat, pagination, preview lampiran, multi-lampiran) tetap dipertahankan.

FILE FRONTEND YANG BERUBAH
- index.html (cache-buster 6735)
- links.html (cache-buster 6735)
- config.js
- service-worker.js
- app-version.json
- changelog.json
- src/js/app.js (cache-buster import)
- src/js/screens/classes.js
- src/js/screens/classRoom.js
- src/js/screens/academic.js
- src/js/screens/publicLinks.js (cache-buster asset)
- src/css/app.css

BACKEND / APPS SCRIPT
- Version/build: 6.7.36 / 20260929.336
- Schema tetap 17.
- Tidak perlu migrasi schema.
- Patch utama: getAttendanceSessionDetail_ + release metadata.

URUTAN DEPLOY YANG AMAN
1. Update Apps Script v6.7.36 lebih dulu.
2. Deploy Web App sebagai versi baru.
3. Timpa frontend v6.7.36 ke GitHub Pages.
4. Commit + push, tunggu Pages live.
5. Tutup total tab/PWA KelasKu, lalu buka kembali.
6. Pastikan versi v6.7.36 / build 20260929.336.
7. Smoke test: Daftar Kelas → Jadwal → Absensi global → Absensi dalam kelas.
8. Setelah semua PASS, jalankan syncKelasKuRelease() SATU KALI agar metadata release + notifikasi update dibuat.

JANGAN JALANKAN
- migrateKelasKu()
- setupKelasKu()
