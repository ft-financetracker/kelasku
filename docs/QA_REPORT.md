# QA Report — KelasKu Foundation v1.2.1 LTS

Pemeriksaan package sebelum ZIP dibuat:

- JavaScript frontend: syntax check lulus.
- Apps Script modules: syntax check lulus dengan parser JavaScript V8-compatible.
- `ALL_IN_ONE.gs`: syntax check lulus.
- `manifest.json`: JSON valid.
- `appsscript.json`: JSON valid.
- Tidak ada penggunaan `.setValue()` per field pada backend.
- Tidak ada Google OAuth Client ID / email-login dependency.
- Session cache menyimpan row session + device ID sehingga logout dapat menginaktivasi session yang benar.
- Password reset menginaktivasi seluruh session aktif user dan membersihkan cache session terkait.
- Profile save memakai Script Lock untuk mencegah race pada identitas NIM/NIS/NISN.
- NIK tidak ikut public identity search.
- Dashboard user baru short-circuit tanpa membaca sheet aktivitas yang tidak perlu.
- Response API frontend hanya diterima dari iframe request yang dibuat oleh request tersebut.
- Optional `FRONTEND_ORIGIN` tersedia untuk membatasi target `postMessage` setelah domain GitHub Pages final.

## Yang tetap harus diuji setelah deploy

Lingkungan ini tidak dapat melakukan deployment langsung ke akun Google pengguna. Karena itu smoke test runtime berikut wajib dilakukan setelah pemasangan:

1. `setupKelasKu()`.
2. `selfTestKelasKu()`.
3. `URL_EXEC?action=health`.
4. Register user.
5. Login username.
6. Logout lalu login ulang.
7. Save profile + NIM/NIS.
8. Install PWA.
9. Izinkan notifikasi.
10. `sendTestNotification(username)` lalu cek Notification Center.

## Batas Phase 1

Notification Center dan browser notification berjalan ketika aplikasi/PWA aktif. Push yang dapat masuk ketika PWA ditutup total memerlukan push provider tambahan dan belum dinyatakan sebagai fitur aktif pada package ini.
