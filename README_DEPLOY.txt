KelasKu v6.7.40 — Landing Academic Resilience
Build: 20260930.340
Schema: 17

Scope:
- Baseline aktual: v6.7.39.
- Memperbaiki Landing Page ketika getClassAcademic anggota gagal/timeout sementara.
- Jadwal publik 7 hari tidak lagi ditimpa menjadi empty state.
- Presensi fallback tetap aman: direct check-in hanya aktif setelah payload anggota lengkap tersedia.
- Retry getClassAcademic dilakukan satu kali dengan timeout 20 detik.
- Tidak mengubah data, schema, role/permission, Jadwal Room Class, Absensi Room Class, atau lifecycle notification.

Deploy:
1. Backup v6.7.39.
2. Update Apps Script v6.7.40 (metadata release saja) dan deploy New Version.
3. Timpa isi ZIP GITHUB_READY ke root repo.
4. Tunggu GitHub Pages live.
5. Tutup total PWA/tab KelasKu lalu buka kembali.
6. Pastikan v6.7.40 / build 20260930.340.
7. Jalankan syncKelasKuRelease() satu kali setelah backend deploy.
8. Smoke test Landing: 5 jadwal pekan ini harus muncul; tab Presensi tidak boleh kosong karena kegagalan fetch anggota.

JANGAN jalankan migrateKelasKu() atau setupKelasKu().
