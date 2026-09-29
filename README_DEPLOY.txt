KelasKu v6.7.26 — Appearance Category Patch
Build 20260929.326 | Schema 17 | FRONTEND-ONLY

Fokus patch:
1. Settings > Tampilan dipisah menjadi 3 kategori accordion:
   - Hero Room Class
   - Landing Page
   - Album Tampilan
   Semua default tertutup.
2. Landing Page menjelaskan asset section bawaan existing vs Hero Utama custom.
3. Asset landing bawaan disertakan sebagai static frontend asset (BUKAN upload Google Drive):
   - hero-access.webp (dari hero-info.webp)
   - hero-links.webp
   - hero-showcase.webp
   - campus-landscape-desktop.png
   - campus-landscape-mobile.png
4. Backend appearance v6.7.25 tetap dipakai untuk upload custom + album Google Drive.

Deploy:
- Timpa file/folder dari ZIP ke GitHub Pages.
- Commit + Push.
- Tunggu Pages selesai.
- Tutup total PWA/tab KelasKu.
- Buka ulang dan pastikan v6.7.26.

TIDAK PERLU:
- update Apps Script
- migrateKelasKu()
- setupKelasKu()
- syncKelasKuRelease()
