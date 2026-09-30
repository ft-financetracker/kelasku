KelasKu v6.7.42 — Landing Academic Resilience
Build: 20260930.342
Schema: 17

Patch fokus:
- Landing tidak lagi kosong ketika getClassAcademic member gagal/timeout sementara.
- Jadwal ±7 hari tetap memakai public academic preview sebagai fallback aman.
- Presensi fallback diarahkan ke Ruang Kelas; direct check-in hanya memakai payload member lengkap.
- getClassAcademic diretry satu kali sebelum fallback dibiarkan aktif.
- Tidak mengubah schema, permission, data existing, engine Jadwal/Absensi, atau notifikasi lifecycle.

Lihat README_DEPLOY.txt untuk urutan deploy.
