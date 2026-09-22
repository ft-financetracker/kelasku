# Update Policy — Jangan Sering Menyentuh Apps Script

## Cukup GitHub
- Warna / CSS
- Layout desktop/mobile
- Komponen UI
- Teks onboarding
- Animasi
- Responsiveness
- Tampilan dashboard
- PWA shell frontend

## Apps Script perlu update hanya jika
- API action baru
- Business logic berubah
- Schema Spreadsheet berubah
- Security/auth berubah
- Storage logic berubah

## Jika Apps Script di-update
Gunakan deployment lama → Edit → New Version. Jangan membuat URL baru setiap update.

## Config harian
Versi, release note, maintenance, dan update required disimpan di `01_APP_CONFIG`, sehingga perubahan config tidak memerlukan edit source code.
