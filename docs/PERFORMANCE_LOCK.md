# Performance Lock KelasKu

## 1. Satu form = satu request

Contoh profile mengirim nama, status, institusi, prodi, angkatan, identitas, dan bio dalam **satu action `saveProfile`**.

## 2. Satu record = satu row write

Benar:

```javascript
sheet.getRange(row, 1, 1, values.length).setValues([values]);
```

Hindari:

```javascript
sheet.getRange(row, 1).setValue(a);
sheet.getRange(row, 2).setValue(b);
sheet.getRange(row, 3).setValue(c);
```

## 3. Dashboard compound

Dashboard tidak memanggil profile/classes/tasks/jadwal/pengumuman satu per satu. Frontend memanggil `getDashboard` sekali.

## 4. Cache

- Session cache: singkat.
- Dashboard cache: singkat.
- App config cache: singkat.
- Browser menampilkan data lokal dulu, lalu refresh server.

## 5. Drive

Dashboard tidak membaca folder Drive. Drive hanya disentuh ketika fitur file benar-benar memerlukan upload/download/preview.

## 6. Folder user lazy

Register tidak membuat folder Drive user. Folder dibuat oleh `getOrCreateUserFolder_()` ketika user benar-benar menggunakan file storage.

## 7. Search

Jangan panggil pencarian backend pada setiap ketikan tanpa debounce. Fase search frontend nanti minimal debounce ±300 ms dan minimum 2–3 karakter.
