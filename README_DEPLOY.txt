KelasKu v6.7.20 — RECOVERY PATCH

PRIORITAS: gunakan PATCH ini jika repo GitHub saat ini sama dengan backup kelasku-main (2).zip.

Overwrite file sesuai path:
- config.js
- app-version.json
- service-worker.js
- index.html
- links.html
- changelog.json
- src/js/app.js
- src/js/screens/classRoom.js
- src/css/app.css

Tidak ada Apps Script. Tidak ada migration. Schema tetap 17.

Setelah GitHub Pages selesai deploy:
1. Buka https://klasku.my.id/update-recovery.html?v=6.7.20&b=20260929.320
   ATAU tekan Update dari aplikasi lama.
2. Tunggu recovery membersihkan service worker/cache.
3. Pastikan footer/app info menjadi v6.7.20.
4. Smoke test: Dashboard -> Daftar Kelas -> Room Kelas -> Akademik -> Jadwal.

JANGAN menjalankan setupKelasKu() / migrateKelasKu().
