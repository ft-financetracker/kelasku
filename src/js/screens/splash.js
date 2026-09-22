import { C, esc } from '../core/utils.js';

export function renderSplash(status = 'Menyiapkan KelasKu…') {
  const app = document.getElementById('app');
  app.innerHTML = `
    <section class="screen">
      <div class="splash-card glass">
        <div class="splash-inner">
          <img class="logo-hero" src="assets/brand/logo-mark.svg" alt="KelasKu">
          <div class="splash-word">Kelas<span class="ku">Ku</span></div>
          <div class="splash-tag">Belajar Bersama <span class="accent"><strong>Lebih Mudah</strong></span></div>
          <div class="loader"></div>
          <div class="request-status">${esc(status)}</div>
          <div class="version">v${C.APP_VERSION} • ${C.BUILD}</div>
        </div>
      </div>
    </section>`;
}
