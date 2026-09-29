KelasKu v6.7.33 — Live Landing & Hero Stability

Fokus release:
- Hero Room/Landing tidak berkedip kembali ke default setelah custom hero pernah dimuat.
- Gradient hanya melindungi area teks, tidak menggelapkan seluruh gambar.
- Tombol Simpan Tampilan kembali ke alur normal dan tidak menutupi konten.
- Landing publik tidak mendaftarkan manifest/SW aplikasi.
- Link Landing dari Room dibuka sebagai halaman publik di tab baru.

Deploy: Apps Script dulu, kemudian timpa patch frontend di GitHub Pages.
Setelah live tutup total PWA/tab, buka ulang, pastikan v6.7.33, lalu jalankan syncKelasKuRelease() satu kali.
Tidak perlu migrateKelasKu() atau setupKelasKu().
