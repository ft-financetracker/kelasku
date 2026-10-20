import { receiveAppConfig } from '../core/configSync.js?v=6742forms1';
import { state } from '../core/state.js?v=6742forms1';
import { api } from '../core/api.js?v=6742forms1';
import { esc, svg } from '../core/utils.js?v=6742forms1';
import { NAVIGATION_MENUS, DEFAULT_NAVIGATION, navigationIds, validateNavigation, moveNavigation, NAVIGATION_MIN, NAVIGATION_MAX } from '../core/navigationConfig.js?v=6742forms1';
import { navigationSurfacePath } from '../core/shellInteractions.js?v=6742forms1';

export function navigationEditorHtml() {
  return '<section id="admin-navigation-editor" class="panel admin-section nav-editor" aria-label="Susun navigasi bawah"></section>';
}

export function navigationPreviewHtml(ids, active = 'dashboard') {
  const items = navigationIds(ids), index = items.indexOf(active);
  const selected = index >= 0 ? active : items[0];
  const center = 12 + 376 * (items.indexOf(selected) + .5) / items.length;
  return `<div class="nav-editor-preview" style="--nav-count:${items.length}" role="group" aria-label="Pratinjau navigasi bawah">
    <svg class="nav-preview-surface" viewBox="0 0 400 72" preserveAspectRatio="none" aria-hidden="true"><path d="${navigationSurfacePath(400,72,center)}"></path></svg>
    ${items.map(id => { const menu = NAVIGATION_MENUS.find(item => item.id === id);
      return `<button type="button" class="nav-preview-item ${id === selected ? 'active' : ''}" data-nav-preview="${id}" aria-label="Coba tampilan ${esc(menu.label)}" aria-pressed="${id === selected}"><span>${svg(menu.icon)}</span><small>${esc(menu.label)}</small></button>`;
    }).join('')}
  </div>`;
}

export function mountNavigationEditor(host, config = {}) {
  if (!host) return;
  const owner = state.sessionToken;
  const supported = Number(config.navigation_config_version) === 1;
  let saved = navigationIds(config.bottom_navigation), draft = [...saved];
  let revision = String(config.bottom_navigation_revision || ''), active = 'dashboard';
  let saving = false, drag = null, status = '', statusKind = '';
  const current = () => state.sessionToken === owner && String(state.user?.global_role) === 'SUPER_ADMIN';
  const dirty = () => JSON.stringify(saved) !== JSON.stringify(draft);
  const arrow = down => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${down ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'}"/></svg>`;
  const grip = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" stroke-width="3" stroke-linecap="round"/></svg>';
  const notice = (message, kind = '') => {
    status = message; statusKind = kind;
    const el = host.querySelector('[data-nav-status]');
    if (el) { el.textContent = status; el.dataset.kind = kind; }
  };
  const resetDrag = () => {
    drag = null;
    host.querySelectorAll('[data-nav-row]').forEach(row => row.classList.remove('is-dragging','is-drop-target'));
  };
  function draw(focusId = '') {
    if (!host.isConnected) return;
    host.innerHTML = `
      <div class="panel-head"><div><div class="panel-title">Susun Navigasi Bawah</div><p class="panel-copy">Pilih menu yang tampil dan atur urutannya untuk seluruh pengguna.</p></div>${svg('i-menu')}</div>
      ${supported ? (config.navigation_sync_supported ? '' : '<p class="nav-editor-compat" role="status">Penyimpanan tersedia. Perbarui Apps Script C9.2 agar akun lain menerima perubahan selama aplikasi terbuka.</p>') : '<p class="nav-editor-compat" role="status">Pratinjau dapat dicoba. Perbarui Apps Script C9.2 untuk mengaktifkan penyimpanan global.</p>'}
      <div class="nav-editor-layout">
        <div class="nav-editor-controls">
          <div class="nav-editor-section-title"><strong>Menu yang ditampilkan</strong><span>${draft.length} / ${NAVIGATION_MAX}</span></div>
          <p class="nav-editor-hint">Geser pegangan atau gunakan panah. Beranda tetap tersedia.</p>
          <ol class="nav-editor-list">${draft.map((id, index) => {
            const menu = NAVIGATION_MENUS.find(item => item.id === id);
            return `<li class="nav-editor-row" data-nav-row="${id}">
              <button type="button" class="nav-editor-grip" data-nav-drag="${id}" aria-label="Geser ${esc(menu.label)}" ${saving ? 'disabled' : ''}>${grip}</button>
              <span class="nav-editor-number">${index + 1}</span><span class="nav-editor-menu-icon">${svg(menu.icon)}</span><strong>${esc(menu.label)}</strong>
              <div class="nav-editor-row-actions">
                <button type="button" class="nav-editor-action" data-nav-up="${id}" aria-label="Naikkan ${esc(menu.label)}" ${saving || index === 0 ? 'disabled' : ''}>${arrow(false)}</button>
                <button type="button" class="nav-editor-action" data-nav-down="${id}" aria-label="Turunkan ${esc(menu.label)}" ${saving || index === draft.length - 1 ? 'disabled' : ''}>${arrow(true)}</button>
                <button type="button" class="nav-editor-action nav-editor-remove" data-nav-remove="${id}" aria-label="Sembunyikan ${esc(menu.label)}" title="${id === 'dashboard' ? 'Beranda wajib tersedia' : draft.length <= NAVIGATION_MIN ? 'Minimal tiga menu' : 'Sembunyikan menu'}" ${saving || id === 'dashboard' || draft.length <= NAVIGATION_MIN ? 'disabled' : ''}>${id === 'dashboard' ? svg('i-shield') : svg('i-close')}</button>
              </div>
            </li>`;
          }).join('')}</ol>
          <div class="nav-editor-section-title"><strong>Menu tersedia</strong><span>${NAVIGATION_MENUS.length - draft.length}</span></div>
          <div class="nav-editor-available">${NAVIGATION_MENUS.filter(item => !draft.includes(item.id)).map(item => `<button type="button" data-nav-add="${item.id}" ${saving ? 'disabled' : ''}>${svg(item.icon)}<span>${esc(item.label)}</span>${svg('i-plus')}</button>`).join('')}</div>
        </div>
        <aside class="nav-editor-preview-panel"><div><span class="eyebrow">Pratinjau</span><h3>Urutan sesuai pilihanmu.</h3><p>Klik ikon untuk mencoba posisi aktif. Perubahan berlaku setelah disimpan.</p></div>
          ${navigationPreviewHtml(draft, active)}
          <p class="nav-editor-hint">Tampilkan 3–5 menu. Menu lainnya tetap dapat dibuka melalui halaman dan akses yang tersedia.</p>
        </aside>
      </div>
      <div class="nav-editor-footer"><p data-nav-status data-kind="${statusKind}" role="status" aria-live="polite">${esc(status || (dirty() ? 'Perubahan belum disimpan.' : 'Susunan saat ini sudah digunakan.'))}</p><div><button type="button" class="btn btn-secondary" data-nav-reset ${saving ? 'disabled' : ''}>Urutan Awal</button><button type="button" class="btn btn-primary" data-nav-save ${saving || !supported || !dirty() ? 'disabled' : ''}>${saving ? '<span class="btn-spinner"></span>Menyimpan…' : 'Simpan Navigasi'}</button></div></div>`;
    bind();
    if (focusId) host.querySelector(`[data-nav-up="${focusId}"]:not(:disabled),[data-nav-down="${focusId}"]:not(:disabled),[data-nav-drag="${focusId}"]`)?.focus({preventScroll:true});
  }
  function change(next, focusId = '') {
    if (saving || !current()) return;
    const error = validateNavigation(next);
    if (error) { notice(error, 'error'); return; }
    draft = [...next]; status = ''; statusKind = '';
    if (!draft.includes(active)) active = 'dashboard';
    draw(focusId);
  }
  async function save() {
    if (saving || !supported || !current() || !dirty()) return;
    const error = validateNavigation(draft);
    if (error) { notice(error, 'error'); return; }
    const submitted = [...draft];
    saving = true; status = 'Menyimpan susunan untuk seluruh pengguna…'; statusKind = '';
    draw();
    try {
      const data = await api('adminUpdateAppConfig', { values:{ BOTTOM_NAVIGATION:JSON.stringify(submitted) }, navigation_revision:revision });
      if (!current()) return;
      const next = data?.config;
      if (Number(next?.navigation_config_version) !== 1 || validateNavigation(next?.bottom_navigation) || JSON.stringify(navigationIds(next.bottom_navigation)) !== JSON.stringify(submitted)) throw new Error('Server belum mengonfirmasi susunan ini. Muat ulang pengaturan sebelum mencoba lagi.');
      saved = submitted; draft = [...submitted]; revision = String(next.bottom_navigation_revision || '');
      receiveAppConfig(next);
      status = 'Navigasi tersimpan. Pengguna aktif menerima pembaruan saat pemeriksaan berikutnya atau saat kembali ke aplikasi.'; statusKind = 'success';
    } catch (error) {
      if (current()) { status = error.message || 'Navigasi belum tersimpan.'; statusKind = 'error'; }
    } finally {
      saving = false;
      if (current() && host.isConnected) draw();
    }
  }
  function bind() {
    host.querySelectorAll('[data-nav-up]').forEach(button => button.onclick = () => change(moveNavigation(draft, button.dataset.navUp, draft.indexOf(button.dataset.navUp) - 1), button.dataset.navUp));
    host.querySelectorAll('[data-nav-down]').forEach(button => button.onclick = () => change(moveNavigation(draft, button.dataset.navDown, draft.indexOf(button.dataset.navDown) + 1), button.dataset.navDown));
    host.querySelectorAll('[data-nav-remove]').forEach(button => button.onclick = () => { if (!button.disabled) change(draft.filter(id => id !== button.dataset.navRemove)); });
    host.querySelectorAll('[data-nav-add]').forEach(button => button.onclick = () => change([...draft, button.dataset.navAdd]));
    host.querySelectorAll('[data-nav-preview]').forEach(button => button.onclick = () => { if (saving || !current()) return; active = button.dataset.navPreview; draw(); });
    host.querySelector('[data-nav-reset]').onclick = () => change([...DEFAULT_NAVIGATION]);
    host.querySelector('[data-nav-save]').onclick = save;
    host.querySelectorAll('[data-nav-drag]').forEach(handle => {
      handle.onpointerdown = event => {
        if (saving || !current() || event.isPrimary === false || event.button > 0) return;
        event.preventDefault(); resetDrag();
        drag = {id:handle.dataset.navDrag, over:handle.dataset.navDrag, pointer:event.pointerId};
        handle.setPointerCapture?.(event.pointerId);
        handle.closest('[data-nav-row]').classList.add('is-dragging');
      };
      handle.onpointermove = event => {
        if (!drag || event.pointerId !== drag.pointer || !current()) { resetDrag(); return; }
        const row = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-nav-row]');
        if (!row || !host.contains(row)) return;
        drag.over = row.dataset.navRow;
        host.querySelectorAll('[data-nav-row]').forEach(item => item.classList.toggle('is-drop-target',item === row && drag.over !== drag.id));
      };
      handle.onpointerup = event => {
        if (!drag || event.pointerId !== drag.pointer) return;
        const {id,over} = drag;
        resetDrag(); handle.releasePointerCapture?.(event.pointerId);
        if (over !== id) change(moveNavigation(draft,id,draft.indexOf(over)),id);
      };
      handle.onpointercancel = resetDrag;
      handle.onlostpointercapture = resetDrag;
      handle.onkeydown = event => { if (event.key === 'Escape') resetDrag(); };
    });
  }
  draw();
  return { isDirty: dirty };
}
