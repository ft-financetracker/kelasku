import { api } from '../core/api.js?v=6740forms3';
import { state } from '../core/state.js?v=6740forms3';
import { esc } from '../core/utils.js?v=6740forms3';

export function attendanceEnrollmentHtml(name, approval = false) {
  return `<div id="attendance-enrollment" data-approval="${approval ? '1' : '0'}"><div class="modal-head"><div><div class="eyebrow">PESERTA ABSENSI</div><h2 id="enrollment-title">${approval ? 'Terima & sinkronkan' : 'Sinkron absensi'}</h2><p class="panel-copy">${esc(name || 'Anggota kelas')}</p></div><button type="button" class="icon-btn mini" data-close-modal aria-label="Tutup">×</button></div><div data-enrollment-body role="status">Memuat pilihan mapel…</div></div>`;
}

export function enrollmentPayload(mode, keys, items) {
  if (!['ALL','SELECTED'].includes(mode)) throw new Error('Pilih cakupan mapel.');
  const known = new Set(items.map(item => item.key));
  const selected = [...new Set(keys)].filter(key => known.has(key));
  if (mode === 'SELECTED' && !selected.length) throw new Error('Pilih minimal satu mapel.');
  return { attendance_scope:mode, attendance_subject_keys:mode === 'ALL' ? [] : selected };
}

export async function mountAttendanceEnrollment(root, { classId, userId = '', onSubmit, close }) {
  const owner = state.sessionToken;
  const live = () => root.isConnected && state.sessionToken === owner && String(state.selectedClassId) === String(classId);
  const host = root.querySelector('[data-enrollment-body]');
  const approval = root.dataset.approval === '1';
  const dialog = root.closest('.phase-modal-card');
  if (dialog) { dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-labelledby','enrollment-title'); }
  try {
    const data = await api('getAttendanceEnrollmentOptions', { class_id:classId, ...(userId ? {user_id:userId} : {}) });
    if (!live()) return;
    if (data?.enrollment_supported !== true || String(data.class_id) !== String(classId) || !Array.isArray(data.items)) throw new Error('Perbarui backend ke C9.3 untuk memakai sinkronisasi mapel.');
    const items = data.items;
    const initial = data.scope?.mode === 'SELECTED' ? 'SELECTED' : 'ALL';
    const selected = new Set(data.scope?.subject_keys || []);
    host.removeAttribute('role');
    host.innerHTML = `<form data-enrollment-form><fieldset class="enrollment-modes"><legend>Tambahkan peserta ke</legend><label><input type="radio" name="enrollment-mode" value="ALL" ${initial === 'ALL' ? 'checked' : ''}><span><strong>Semua mapel</strong><small>Termasuk mapel baru yang dibuat nanti.</small></span></label><label><input type="radio" name="enrollment-mode" value="SELECTED" ${initial === 'SELECTED' ? 'checked' : ''} ${items.length ? '' : 'disabled'}><span><strong>Pilih mapel</strong><small>Hanya mapel yang kamu tentukan.</small></span></label></fieldset><div class="enrollment-picker" data-enrollment-picker ${initial === 'ALL' ? 'hidden' : ''}><label class="field">Cari mapel<input class="control" type="search" data-enrollment-search placeholder="Nama mapel…" autocomplete="off"></label><div class="enrollment-count" data-enrollment-count aria-live="polite"></div><div class="enrollment-courses">${items.map(item => `<label class="enrollment-course" data-enrollment-course="${esc(item.key)}"><input type="checkbox" value="${esc(item.key)}" data-enrollment-key ${selected.has(item.key) ? 'checked' : ''}><span><strong>${esc(item.label)}</strong><small>${Number(item.eligible_sessions) || 0} sesi terbuka / mendatang</small></span></label>`).join('')}</div><p data-enrollment-empty hidden>Tidak ada mapel yang cocok.</p></div><p class="enrollment-note">${items.length ? 'Sesi yang masih terbuka dan yang akan datang akan disinkronkan.' : 'Belum ada mapel. Anggota otomatis ikut saat sesi absensi baru dibuat.'} Sesi yang sudah ditutup tidak ditambahkan.${approval ? '' : ' Peserta dan presensi yang sudah ada tetap disimpan. Pilihan ini juga dipakai untuk sesi baru.'}</p><p class="request-status" data-enrollment-status role="status" aria-live="polite"></p><div class="page-actions"><button type="button" class="btn btn-secondary" data-enrollment-cancel>Batal</button><button type="submit" class="btn btn-primary" data-enrollment-submit>${approval ? 'Terima & Sinkronkan' : 'Sinkronkan'}</button></div></form>`;
    const modes = [...root.querySelectorAll('[name="enrollment-mode"]')];
    const boxes = [...root.querySelectorAll('[data-enrollment-key]')];
    const picker = root.querySelector('[data-enrollment-picker]');
    const status = root.querySelector('[data-enrollment-status]');
    const submit = root.querySelector('[data-enrollment-submit]');
    let mode = initial, busy = false;
    const count = () => { root.querySelector('[data-enrollment-count]').textContent = `${boxes.filter(box => box.checked).length} dari ${items.length} mapel dipilih`; };
    modes.forEach(input => input.addEventListener('change', () => { if (input.checked) mode = input.value; picker.hidden = mode !== 'SELECTED'; status.textContent = ''; count(); }));
    boxes.forEach(input => input.addEventListener('change', count)); count();
    root.querySelector('[data-enrollment-search]').addEventListener('input', event => {
      const query = event.target.value.trim().toLowerCase(); let visible = 0;
      root.querySelectorAll('[data-enrollment-course]').forEach(row => { row.hidden = !row.dataset.enrollmentCourse.includes(query); if (!row.hidden) visible++; });
      root.querySelector('[data-enrollment-empty]').hidden = visible > 0;
    });
    root.querySelector('[data-enrollment-cancel]').onclick = () => { if (!busy) close(); };
    root.querySelector('[data-enrollment-form]').addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !live()) return;
      let payload;
      try { payload = enrollmentPayload(mode, boxes.filter(box => box.checked).map(box => box.value), items); }
      catch (error) { status.className = 'request-status error'; status.textContent = error.message; return; }
      busy = true;
      const overlay = root.closest('.overlay'); if (overlay) overlay.dataset.busy = '1';
      const controls = [...root.querySelectorAll('button,input')]; controls.forEach(control => { control.dataset.wasDisabled = control.disabled ? '1' : '0'; control.disabled = true; });
      const label = submit.textContent; submit.textContent = approval ? 'Menerima & menyinkronkan…' : 'Menyinkronkan…';
      status.className = 'request-status progress'; status.textContent = 'Sedang menyimpan. Tunggu sampai selesai.';
      try { await onSubmit(payload); if (overlay) overlay.dataset.busy = '0'; close(); }
      catch (error) { if (live()) { status.className = 'request-status error'; status.textContent = error.message; } }
      finally { busy = false; if (overlay) overlay.dataset.busy = '0'; controls.forEach(control => control.disabled = control.dataset.wasDisabled === '1'); submit.textContent = label; }
    });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const focusable = [...root.querySelectorAll('button,input')].filter(input => !input.disabled && !input.closest('[hidden]'));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    modes[0]?.focus();
  } catch (error) {
    if (!live()) return;
    host.innerHTML = `<p class="request-status error" role="alert">${esc(error.message)}</p><button type="button" class="btn btn-secondary" data-enrollment-retry>Coba Lagi</button>`;
    root.querySelector('[data-enrollment-retry]').onclick = () => { host.textContent = 'Memuat pilihan mapel…'; mountAttendanceEnrollment(root, {classId,userId,onSubmit,close}); };
  }
}
