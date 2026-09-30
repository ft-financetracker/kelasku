KelasKu v6.7.38 — Landing Link Cepat 2-Kolom
Build: 20260930.338
Schema: 17

Scope:
- Layout Link Cepat Landing Page saja.
- 2 kategori per baris (50:50) pada desktop dan mobile.
- Tinggi card tetap seperti baseline v6.7.37.
- Judul maksimal 2 baris.
- Tidak mengubah data, permission, accordion, atau isi link.

Deploy:
1. Backup v6.7.37.
2. Update Apps Script metadata v6.7.38 dan deploy New Version.
3. Timpa isi ZIP GitHub ke root repo.
4. Tunggu GitHub Pages live.
5. Tutup total PWA/tab KelasKu lalu buka kembali.
6. Pastikan v6.7.38 / build 20260930.338.
7. Jalankan syncKelasKuRelease() satu kali setelah smoke test PASS.

JANGAN jalankan migrateKelasKu() atau setupKelasKu().
