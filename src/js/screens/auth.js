import { state, setSession } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, logo, svg } from '../core/utils.js';
import { go } from '../core/router.js';
import { shouldShowAppSetup } from '../core/pwa.js';

export function renderAuth() {
  const app = document.getElementById('app');
  const register = state.authMode === 'register';

  app.innerHTML = `
    <section class="screen">
      <div class="form-card glass">
        ${logo()}
        <div class="eyebrow" style="margin-top:28px">03 • ${register ? 'Buat Akun' : 'Login'}</div>
        <h1 style="margin:7px 0 4px">${register ? 'Mulai dengan KelasKu' : 'Selamat Datang Kembali 👋'}</h1>
        <p class="copy">${register ? 'Buat username sendiri. Tidak perlu email.' : 'Masuk menggunakan Username atau KelasKu ID.'}</p>

        <div class="auth-tabs">
          <button class="auth-tab ${register ? '' : 'active'}" data-mode="login">Masuk</button>
          <button class="auth-tab ${register ? 'active' : ''}" data-mode="register">Buat Akun</button>
        </div>

        <form id="auth-form">
          <div class="field">
            <label>${register ? 'Username' : 'Username / KelasKu ID'}</label>
            <input class="control" id="auth-login" autocomplete="username" placeholder="${register ? 'contoh: adhitya' : 'adhitya atau KK-A7M4Q2'}" required>
            ${register ? '<div class="input-hint">4–24 karakter: huruf, angka, titik, _ atau -</div>' : ''}
          </div>

          <div class="field">
            <label>Password</label>
            <input class="control" id="auth-password" type="password" ${register ? 'autocomplete="new-password"' : 'autocomplete="current-password"'} placeholder="Minimal 8 karakter" required>
          </div>

          ${register ? `
            <div class="field">
              <label>Konfirmasi Password</label>
              <input class="control" id="auth-confirm" type="password" autocomplete="new-password" placeholder="Ulangi password" required>
            </div>` : ''}

          <div id="auth-status" class="request-status"></div>
          <button id="auth-submit" class="btn btn-primary btn-block" type="submit">${register ? 'Buat Akun' : 'Masuk'} ${svg('i-arrow')}</button>
        </form>

        <div class="fast-note">${svg('i-check')}<div><strong>Fast path.</strong> Satu submit mengirim seluruh data sekaligus ke backend. Tidak ada input per kolom satu-satu.</div></div>
      </div>
    </section>`;

  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.onclick = () => {
      state.authMode = btn.dataset.mode;
      renderAuth();
    };
  });

  document.getElementById('auth-form').onsubmit = submitAuth;
}

async function submitAuth(event) {
  event.preventDefault();

  const register = state.authMode === 'register';
  const login = document.getElementById('auth-login').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirm = document.getElementById('auth-confirm')?.value || '';
  const status = document.getElementById('auth-status');
  const button = document.getElementById('auth-submit');

  if (register && password !== confirm) {
    status.className = 'request-status error';
    status.textContent = 'Konfirmasi password tidak sama.';
    return;
  }

  const originalButtonHtml = button.innerHTML;
  button.disabled = true;
  button.classList.add('is-loading');
  button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${register ? 'Membuat akun…' : 'Masuk…'}</span>`;
  status.className = 'request-status progress';
  status.innerHTML = `<span class="status-dot"></span>${register ? 'Membuat akun dan menyiapkan session…' : 'Memeriksa akun dan menyiapkan session…'}`;

  try {
    const data = await api(
      register ? 'register' : 'login',
      register ? { username: login, password } : { login, password },
      {
        auth: false,
        onSlow: () => {
          status.className = 'request-status slow';
          status.innerHTML = `<span class="status-dot"></span>Server sedang menyelesaikan proses. Jangan klik dua kali.`;
        }
      }
    );

    setSession(data.session_token, data.user);
    status.className = 'request-status ok';
    status.textContent = data.recovered ? 'Akun ditemukan. Session dipulihkan.' : 'Berhasil.';
    if (!data.user.profile_complete) go('profile');
    else go(shouldShowAppSetup() ? 'setup' : 'dashboard');
  } catch (err) {
    status.className = 'request-status error';
    status.textContent = esc(err.message);
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.innerHTML = originalButtonHtml;
  }
}
