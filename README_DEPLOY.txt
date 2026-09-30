KelasKu v6.7.39 — Landing Link Cepat Submenu Row-List
Build: 20260930.339
Schema: 17

Scope:
- Baseline aktual: v6.7.38.
- Card kategori Link Cepat tetap 2 per baris (50:50).
- Saat kategori dibuka, daftar link tampil full-width di bawah pasangan kategori.
- Submenu dipadatkan menjadi row-list; tidak lagi menyisakan kolom kanan kosong atau membuat satu card kategori jauh lebih tinggi.
- Data, permission, private-link behavior, dan isi link tidak berubah.

Deploy:
1. Backup v6.7.38.
2. Update Apps Script metadata v6.7.39 dan deploy New Version.
3. Timpa isi ZIP GitHub ke root repo.
4. Tunggu GitHub Pages live.
5. Tutup total PWA/tab KelasKu lalu buka kembali.
6. Pastikan v6.7.39 / build 20260930.339.
7. Jalankan syncKelasKuRelease() satu kali setelah smoke test PASS.

JANGAN jalankan migrateKelasKu() atau setupKelasKu().
