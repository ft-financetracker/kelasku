import { esc, svg, logo } from '../core/utils.js';
import { writeBool } from '../core/storage.js';
import { go } from '../core/router.js';

const slides = [
  { icon: 'i-mega', eyebrow: 'Informasi', title: 'Semua Informasi dalam <span class="accent">Satu Tempat</span>', copy: 'Jadwal, pengumuman, materi, dan informasi kelas lebih mudah ditemukan.' },
  { icon: 'i-chat', eyebrow: 'Koordinasi', title: 'Kelas Lebih <span class="accent">Terhubung</span>', copy: 'Tetap terhubung dengan teman, koordinator, dan aktivitas kelas.' },
  { icon: 'i-task', eyebrow: 'Produktivitas', title: 'Belajar Lebih <span class="accent">Teratur</span>', copy: 'Pantau tugas, jadwal, materi, dan informasi penting tanpa tercecer.' }
];

let index = 0;

export function renderOnboarding() {
  const app = document.getElementById('app');
  const s = slides[index];
  app.innerHTML = `
    <section class="screen">
      <div class="shell two-col">
        <div class="intro-panel">
          ${logo()}
          <div class="eyebrow" style="margin-top:34px">02 • Onboarding</div>
          <h1 class="title">Langkah Awal Menuju Kelas yang <span class="accent">Lebih Teratur</span></h1>
          <p class="copy">KelasKu dibuat untuk mahasiswa dan pelajar: cepat, rapi, mobile-friendly, dan tidak terasa seperti portal kampus lama.</p>
        </div>

        <div class="content-panel glass">
          <div class="onboard-art"><div class="orb">${svg(s.icon)}</div></div>
          <div class="eyebrow" style="margin-top:24px">${esc(s.eyebrow)}</div>
          <h2 style="font-size:30px;margin:8px 0 10px;line-height:1.12">${s.title}</h2>
          <p class="copy">${esc(s.copy)}</p>
          <div class="progress">${slides.map((_, i) => `<span class="dot ${i === index ? 'active' : ''}"></span>`).join('')}</div>
          <div class="inline-row">
            <button class="btn btn-ghost" id="skip-onboarding">Lewati</button>
            <button class="btn btn-primary" id="next-onboarding">${index === slides.length - 1 ? 'Mulai KelasKu' : 'Lanjut'} ${svg('i-arrow')}</button>
          </div>
        </div>
      </div>
    </section>`;

  document.getElementById('skip-onboarding').onclick = finish;
  document.getElementById('next-onboarding').onclick = () => {
    if (index < slides.length - 1) {
      index++;
      renderOnboarding();
    } else {
      finish();
    }
  };
}

function finish() {
  writeBool('kelasku_onboarding_completed', true);
  go('auth');
}
