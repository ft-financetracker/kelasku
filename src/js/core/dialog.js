import { esc, svg } from './utils.js';

export function confirmDialog(options = {}) {
  const title = options.title || 'Konfirmasi';
  const message = options.message || 'Lanjutkan tindakan ini?';
  const confirmLabel = options.confirmLabel || options.confirmText || 'Lanjutkan';
  const cancelLabel = options.cancelLabel || 'Batal';
  const danger = options.danger === true;

  return new Promise(resolve => {
    document.getElementById('global-confirm-dialog')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'global-confirm-dialog';
    wrap.className = 'app-dialog-backdrop';
    wrap.innerHTML = `
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="global-dialog-title">
        <div class="app-dialog-icon ${danger ? 'danger' : ''}">${svg(danger ? 'i-info' : 'i-shield')}</div>
        <div class="app-dialog-copy">
          <h2 id="global-dialog-title">${esc(title)}</h2>
          <p>${esc(message)}</p>
        </div>
        <div class="app-dialog-actions">
          <button type="button" class="btn btn-secondary" data-dialog-cancel>${esc(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-dialog-confirm>${esc(confirmLabel)}</button>
        </div>
      </section>`;

    const finish = value => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      resolve(value);
    };
    const onKey = event => {
      if (event.key === 'Escape') finish(false);
      if (event.key === 'Enter') finish(true);
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', event => { if (event.target === wrap) finish(false); });
    wrap.querySelector('[data-dialog-cancel]').onclick = () => finish(false);
    wrap.querySelector('[data-dialog-confirm]').onclick = () => finish(true);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-dialog-confirm]').focus();
  });
}
