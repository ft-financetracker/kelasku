KelasKu v6.7.42 — Academic Stability & Landing Flow Recovery
Build: 20260930.342
Schema: 17

Baseline live sebelum patch:
- v6.7.40.

Scope:
- Root fix backend: getClassAcademic/getAcademicHub tidak gagal hanya karena CacheService menolak payload besar.
- Hapus retry otomatis Landing yang pada v6.7.40 menggandakan request getClassAcademic.
- Status member Landing dirender segera setelah getClassDetail selesai.
- Presensi Landing = hanya sesi OPEN/LATE yang belum diisi.
- Buka Landing dari Ringkasan = same tab.
- Deep-link Landing -> Ruang Kelas mempertahankan tab tujuan walau cache kelas tersedia.
- Hentikan warmup seluruh Academic Hub ketika user hanya membuka Ringkasan.
- Tidak mengubah schema, data existing, role/permission, atau lifecycle notification.

Deploy:
1. Backup v6.7.40.
2. Apps Script: replace 00_Config.gs, 01_Setup.gs, 18_Academic.gs.
3. Save -> Manage Deployments -> New Version -> Deploy.
4. Jalankan syncKelasKuRelease() satu kali.
5. JANGAN jalankan setupKelasKu() atau migrateKelasKu().
6. Timpa isi GITHUB_READY ke root repo lalu commit/push.
7. Tunggu GitHub Pages live.
8. Tutup total tab/PWA lama lalu buka kembali.
9. Verifikasi v6.7.42 / build 20260930.342.
10. Smoke test: Ringkasan, Buka Landing, role member, Jadwal 7 hari, Presensi aktif, quick attendance, Room Class -> Absensi, dan 98_ERROR_LOG.
