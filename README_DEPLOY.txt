KelasKu v6.7.27 — Frontend Unified Class Appearance
Build 20260929.327 | Schema 17

BASELINE: frontend v6.7.26 + backend appearance v6.7.25.

Fokus release:
- HERO_DESKTOP + HERO_MOBILE dipakai bersama oleh Room Class dan Landing Page kelas yang sama.
- CARD_SQUARE untuk Foto Card Room pada Daftar Kelas + pict/icon Hero Room.
- Crop/reposition client-side saat upload (drag + zoom); hasil final yang diupload sehingga tidak menambah beban runtime.
- Album tetap per-class.
- Tombol hapus permanen dari KelasKu dengan confirmation alert.
- Legacy ROOM/LANDING media tetap kompatibel dan tetap ada di album.

DEPLOY ORDER:
1) Deploy Apps Script v6.7.27 dahulu.
2) Timpa file frontend dari ZIP ini ke GitHub Pages.
3) Tunggu GitHub Pages deploy selesai.
4) Tutup total tab/PWA lalu buka kembali.
5) Pastikan v6.7.27 / build 20260929.327.
6) Test Tampilan: Hero Desktop, Hero Mobile, Card Room, Album, delete.
7) Setelah semuanya live dan lolos test, jalankan syncKelasKuRelease() SATU KALI.

TIDAK PERLU:
- migrateKelasKu()
- setupKelasKu()

Schema tetap 17.
