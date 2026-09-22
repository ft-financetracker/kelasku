# Test Checklist — KelasKu Foundation v1.2.1

## Backend
- [ ] `setupKelasKu()` selesai tanpa error
- [ ] `selfTestKelasKu()` database=online
- [ ] `selfTestKelasKu()` storage=online
- [ ] `URL_EXEC?action=health` menghasilkan `ok:true`
- [ ] Semua sheet sesuai schema

## Auth
- [ ] Register username baru berhasil
- [ ] Username duplikat ditolak
- [ ] Password < 8 karakter ditolak
- [ ] Login username berhasil
- [ ] Login KelasKu ID berhasil
- [ ] Password salah ditolak
- [ ] Logout membuat session tidak dapat dipakai lagi

## Profile
- [ ] Profile tersimpan dalam satu submit
- [ ] NIM/NIS/NISN tersimpan ke `11_USER_IDENTITIES`
- [ ] Identitas yang sama pada institusi yang sama ditolak untuk user lain
- [ ] Nomor yang sama di institusi berbeda tidak otomatis bentrok

## PWA
- [ ] GitHub Pages aktif
- [ ] Manifest terbaca
- [ ] Service Worker aktif
- [ ] Install PWA tersedia di browser yang mendukung
- [ ] App bisa dibuka standalone

## Notification
- [ ] Permission notification dapat diminta
- [ ] `sendTestNotification(username)` tampil di Notification Center setelah polling
- [ ] Badge unread bertambah
- [ ] Mark read bekerja

## Performance
- [ ] Submit button disable saat request agar tidak double input
- [ ] Dashboard cache lokal tampil sebelum refresh server bila tersedia
- [ ] Tidak ada `setValue()` per field di backend
- [ ] Drive tidak discan saat dashboard
