KelasKu v6.7.37 — Pre-Live Notification & Schedule Polish
Build: 20260929.337
Schema: 17 (TIDAK BERUBAH)

FOKUS RELEASE
- Kalender Akademik 30 Hari di mobile menjadi horizontal-scroll, bukan deretan panjang ke bawah.
- Agenda Mendatang tetap compact: 2 baris informasi utama + separator + pill metadata + pagination.
- Siklus Jadwal: notifikasi 30 menit sebelum mulai + saat sedang berlangsung.
- Siklus Absensi: notifikasi sebelum dibuka + saat berlangsung + setelah ditutup.
- Notifikasi sistem HP memakai registry ID terpisah sehingga item yang sudah masuk cache aplikasi tetap dapat memicu notifikasi sistem satu kali.
- Lifecycle notification diproses oleh trigger Apps Script 5-menit, dengan fallback saat client meminta Notification Center.
- Role monitoring (Pengajar/Pengamat) tidak menerima notifikasi Absensi peserta.
- Semua fitur v6.7.36 tetap dipertahankan.

CATATAN NOTIFIKASI HP
- Jika izin notifikasi browser/PWA = Allow dan PWA masih aktif / dibangunkan browser, notifikasi sistem akan muncul.
- Push yang benar-benar dapat membangunkan aplikasi yang di-force-stop membutuhkan Web Push/FCM provider; release ini tidak mengubah arsitektur ke provider eksternal.

URUTAN DEPLOY
1. Update Apps Script v6.7.37.
2. Deploy Web App sebagai versi baru.
3. Timpa frontend v6.7.37 ke GitHub Pages.
4. Tunggu GitHub Pages live.
5. Tutup total tab/PWA KelasKu, lalu buka kembali.
6. Pastikan versi 6.7.37 / build 20260929.337.
7. Jalankan syncKelasKuRelease() SATU KALI. Fungsi ini sekaligus memastikan trigger processAcademicLifecycleNotifications aktif setiap 5 menit.
8. Tes Notifikasi + Jadwal pada 1 akun Member.

JANGAN JALANKAN
- migrateKelasKu()
- setupKelasKu()
