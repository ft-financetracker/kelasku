# Deployment KelasKu v1.2.1 LTS

## A. Backend

1. Buat Spreadsheet `KelasKu_DB`.
2. `Extensions > Apps Script`.
3. Copy file `.gs` sesuai urutan di folder `apps-script/`.
4. Jalankan `setupKelasKu()` sekali.
5. Jalankan `selfTestKelasKu()`.
6. `Deploy > New deployment > Web app`.
7. Execute as: **Me**.
8. Access: **Anyone**.
9. Copy URL `/exec`.
10. Tes `URL_EXEC?action=health`.

## B. Frontend

1. Edit `frontend/config.js`.
2. Ganti `API_URL` dengan URL `/exec`.
3. Upload **isi folder `frontend/`** ke root repo GitHub.
4. `Settings > Pages > main > /(root)`.
5. Buka URL GitHub Pages.

## C. Hardening origin (opsional direkomendasikan)

Setelah domain GitHub Pages final diketahui, jalankan:

```javascript
setFrontendOrigin('https://USERNAME.github.io')
```

## D. Update backend di masa depan

Jangan membuat deployment baru tanpa alasan.

1. Update file `.gs`.
2. Jalankan `migrateKelasKu()` bila schema berubah.
3. `Deploy > Manage deployments > Edit`.
4. Pilih **New version**.
5. Deploy.

URL `/exec` tetap sama sehingga `frontend/config.js` tidak perlu diubah.
