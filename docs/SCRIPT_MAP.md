# Peta Script KelasKu — Urutan Belajar

Baca file dari atas ke bawah. Penomoran dibuat agar pemula tidak bingung.

| File | Fungsi | Kapan biasanya diubah |
|---|---|---|
| `00_Config.gs` | Konstanta, sheet, header | Saat schema/versi berubah |
| `01_Setup.gs` | Setup database + Drive | Hampir tidak pernah setelah instalasi |
| `02_Migrations.gs` | Upgrade schema aman | Saat versi backend baru |
| `03_Database.gs` | Baca/tulis Spreadsheet | Bila engine database berubah |
| `04_Security.gs` | Hash, token, rate limit | Sangat jarang |
| `05_Auth.gs` | Register/login/session | Saat auth berubah |
| `06_User.gs` | Profile + NIM/NIS/NISN + search | Saat fitur user berkembang |
| `07_Dashboard.gs` | Compound dashboard API | Saat widget dashboard berkembang |
| `08_Notifications.gs` | Notification Center | Saat notifikasi berkembang |
| `09_FileStorage.gs` | Pondasi Drive lazy | Saat upload/file mulai dibuat |
| `10_AppConfig.gs` | Versi/update info | Jarang; value harian dari Spreadsheet |
| `11_ApiRouter.gs` | Daftar action API | Saat endpoint baru ditambah |
| `12_ApiTransport.gs` | doGet/doPost bridge | Sangat jarang |
| `13_AdminTools.gs` | Tool manual admin | Saat admin tool bertambah |
| `14_Utils.gs` | Helper umum + error log | Jarang |

## Prinsip membaca function

Cari komentar `PURPOSE`. Setiap module hanya memegang satu tanggung jawab utama.

## Rule penting

1. Jangan menaruh semua logic di `Code.gs`.
2. Jangan mengubah nama sheet/header tanpa migration.
3. Jangan memakai `setValue()` berulang untuk satu row.
4. Jangan membuat satu API call untuk setiap field.
5. Jangan scan Drive hanya untuk menampilkan dashboard.
