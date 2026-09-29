KelasKu v6.7.24 — Room Academic Signal Precision
Build 20260929.324 | Schema 17 | Frontend-only

Scope:
1. Badge Jadwal/Absensi hanya menghitung sesi absensi yang sedang OPEN dan status user masih UNMARKED.
2. Sesi future/belum dibuka tidak menambah badge.
3. Setelah presensi tersimpan dan academic cache refresh, badge hilang otomatis.
4. Icon toga hero room diperbesar; divider hero aktif di desktop + mobile.
5. Ringkasan details tetap default tertutup, tetapi summary bisa dibuka juga di desktop.
6. Status "Belum dibuka" pada row Jadwal/Absensi dipadatkan menjadi icon jam dengan tooltip/aria-label.

Deploy:
- Timpa file sesuai struktur folder ke frontend GitHub Pages.
- Tidak ada Apps Script/schema change.
- Tunggu Pages selesai deploy.
- Tutup total PWA/tab, lalu buka ulang.
- Pastikan v6.7.24 / build 20260929.324.
