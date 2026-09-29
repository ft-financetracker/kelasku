KelasKu v6.7.34 — Academic Live Stability
Build: 20260929.334
Schema: 17

FOKUS RELEASE
- Pembuatan seri jadwal + absensi otomatis dibatch dan diberi request-key anti duplikat.
- Notice proses jadwal dibuat kontekstual; tidak lagi memakai pesan timeout "pendaftaran".
- Hasil create akademik langsung dimasukkan ke UI lalu disinkronkan diam-diam.
- Pagination 12 item: Jadwal, Tugas, Materi, Pengumuman.
- Landing Page hanya menampilkan jadwal hari ini sampai 7 hari ke depan.
- Card Materi dipadatkan dan file dibuka melalui preview di KelasKu.
- Pengumpulan tugas mendukung multi-lampiran sampai 12 file.
- Preview attachment mendukung image/video dan Google Drive viewer untuk PDF/XLSX/DOCX/PPTX dkk.
- Batas file dokumen frontend/backend disinkronkan ke sekitar 4 MB.
- Data lama tetap kompatibel; single image submission lama tetap terbaca.

FILE YANG DITIMPA
- index.html
- links.html
- config.js
- service-worker.js
- app-version.json
- changelog.json
- src/js/app.js
- src/js/core/api.js
- src/js/screens/classRoom.js
- src/js/screens/academic.js
- src/js/screens/publicLinks.js
- src/css/app.css

URUTAN
1. Update/deploy Apps Script v6.7.34 lebih dulu.
2. Timpa file frontend ini ke GitHub Pages.
3. Commit + push dan tunggu Pages live.
4. Tutup total tab/PWA KelasKu, lalu buka kembali.
5. Pastikan versi v6.7.34.
6. Smoke test jadwal series, absensi auto, tugas, materi, pengumuman, file preview, dan Landing.
7. Jika semua PASS, jalankan syncKelasKuRelease() satu kali.

JANGAN JALANKAN
- migrateKelasKu()
- setupKelasKu()
