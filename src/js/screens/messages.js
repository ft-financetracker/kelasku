import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, sameData } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { confirmDialog } from '../core/dialog.js';

let activeClassId = '';
let sending = false;
let loadingOlder = false;
let replyTarget = null;
const deletingIds = new Set();
const QUICK_EMOJI = ['😀','😂','😊','👍','🙏','🔥','✅','📚','🎯','❤️','👏','🤝'];
const CONVERSATION_CACHE_PREFIX = 'kelasku_message_cache_';

export function renderMessages() {
  activeClassId = sessionStorage.getItem('kelasku_message_class') || activeClassId || '';
  const content = `
    <div class="page-head message-page-head">
      <div><div class="eyebrow">RUANG KOMUNIKASI</div><h1>Pesan Kelas</h1><p>Chat kelas yang ringkas, cepat, dan fokus untuk koordinasi belajar.</p></div>
      <span class="phase-badge">CLASS CHAT</span>
    </div>
    <section class="message-layout panel">
      <aside class="message-room-list" id="message-room-list">${state.messageRooms?.length ? '' : roomSkeleton()}</aside>
      <div class="message-conversation" id="message-conversation"><div class="message-empty">Pilih kelas untuk membuka percakapan.</div></div>
    </section>`;
  document.getElementById('app').innerHTML = appShell({ active: 'messages', content, hideSearch: true });
  bindAppShell();

  if (state.messageRooms?.length) {
    if (!activeClassId) activeClassId = state.messageRooms[0].class_id;
    drawRooms(state.messageRooms);
  }
  hydrateConversationCache(activeClassId);
  const cachedConversation = activeClassId ? state.messagesByClass[activeClassId] : null;
  if (cachedConversation) drawConversation(cachedConversation);

  hydrateMessagesPage(Boolean(state.messageRooms?.length), Boolean(cachedConversation));
}

async function hydrateMessagesPage(hasRoomCache, hasConversationCache) {
  try {
    const data = await api('getMessageRooms');
    const nextRooms = data.items || [];
    const roomsChanged = !sameData(state.messageRooms || [], nextRooms);
    state.messageRooms = nextRooms;
    localStorage.setItem('kelasku_message_rooms_cache', JSON.stringify(nextRooms));
    if (roomsChanged || !hasRoomCache) drawRooms(nextRooms);

    if (!activeClassId && nextRooms.length) activeClassId = nextRooms[0].class_id;
    if (activeClassId) await openRoom(activeClassId, { silent: hasConversationCache || Boolean(state.messagesByClass[activeClassId]) });
  } catch (err) {
    if (!hasRoomCache) {
      const root = document.getElementById('message-room-list');
      if (root) root.innerHTML = `<div class="alert danger">${esc(err.message)}</div>`;
    }
  }
}

function drawRooms(items) {
  const root = document.getElementById('message-room-list');
  if (!root) return;
  const previousScroll = root.scrollLeft;
  root.innerHTML = `<div class="message-room-head"><strong>Room Kelas</strong><small>${items.length} kelas</small></div>${items.length ? items.map(roomCard).join('') : '<div class="message-empty compact">Belum ada kelas.</div>'}`;
  root.scrollLeft = previousScroll;
  root.querySelectorAll('[data-message-room]').forEach(btn => btn.onclick = () => openRoom(btn.dataset.messageRoom, { silent: Boolean(state.messagesByClass[btn.dataset.messageRoom]) }));
}

function roomCard(item) {
  return `<button type="button" class="message-room-card ${String(item.class_id) === String(activeClassId) ? 'active' : ''}" data-message-room="${esc(item.class_id)}">
    <span class="message-room-icon">${svg('i-class')}</span><span class="message-room-copy"><strong>${esc(item.name)}</strong><small>${esc(item.last_message || 'Belum ada pesan.')}</small></span>
    ${Number(item.unread_count || 0) > 0 ? `<b>${Number(item.unread_count)}</b>` : ''}
  </button>`;
}

async function openRoom(classId, options = {}) {
  const silent = options.silent === true;
  activeClassId = classId;
  replyTarget = null;
  sessionStorage.setItem('kelasku_message_class', classId);
  document.querySelectorAll('[data-message-room]').forEach(x => x.classList.toggle('active', x.dataset.messageRoom === classId));

  hydrateConversationCache(classId);
  const cached = state.messagesByClass[classId];
  const conversationRoot = document.getElementById('message-conversation');
  const renderedClassId = conversationRoot?.dataset.classId || '';
  if (cached && String(renderedClassId) !== String(classId)) drawConversation(cached);
  else if (!cached && !silent) {
    if (conversationRoot) { conversationRoot.dataset.classId = String(classId); conversationRoot.innerHTML = conversationSkeleton(); }
  }

  try {
    const data = await api('getMessages', { class_id: classId, limit: 50 });
    if (String(activeClassId) !== String(classId)) return;
    const previous = state.messagesByClass[classId];
    const changed = !sameData(previous, data);
    state.messagesByClass[classId] = data;
    persistConversationCache(classId, data);

    if (!previous || !document.querySelector('#message-conversation .message-stream')) drawConversation(data);
    else if (changed) syncConversation(data);

    const last = data.items?.[data.items.length - 1];
    if (last) api('markMessagesRead', { class_id: classId, last_message_id: last.message_id }, { onSlow: () => {} }).catch(() => {});
    const room = state.messageRooms.find(x => String(x.class_id) === String(classId));
    if (room && Number(room.unread_count || 0) !== 0) {
      room.unread_count = 0;
      patchRoomUnread(classId, 0);
      localStorage.setItem('kelasku_message_rooms_cache', JSON.stringify(state.messageRooms));
    }
  } catch (err) {
    if (!cached) {
      const root = document.getElementById('message-conversation');
      if (root) root.innerHTML = `<div class="alert danger">${esc(err.message)}</div>`;
    }
  }
}

function drawConversation(data) {
  const root = document.getElementById('message-conversation');
  if (!root) return;
  const room = state.messageRooms.find(x => String(x.class_id) === String(activeClassId)) || {};
  root.dataset.classId = String(activeClassId);
  root.innerHTML = `
    <header class="message-conversation-head">
      <div class="message-conversation-room"><span class="message-room-icon small">${svg('i-class')}</span><div><strong>${esc(room.name || 'Room Kelas')}</strong><small>${esc(room.class_code || '')} · ${esc(roleLabel(room.role))}</small></div></div>
      <span class="material-symbols-rounded message-head-icon" aria-hidden="true">forum</span>
    </header>
    <div class="message-stream" id="message-stream"></div>
    ${composerHtml()}`;
  renderStream(data, { forceBottom: true });
  bindComposer();
}

function syncConversation(data) {
  const stream = document.getElementById('message-stream');
  if (!stream) return drawConversation(data);
  const distanceFromBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight;
  renderStream(data, { forceBottom: distanceFromBottom < 90, preserveBottomDistance: distanceFromBottom });
}

function renderStream(data, options = {}) {
  const stream = document.getElementById('message-stream');
  if (!stream) return;
  const oldScrollHeight = stream.scrollHeight;
  const oldScrollTop = stream.scrollTop;
  const hasMore = data.has_more ? '<button type="button" class="load-older-messages" id="load-older-messages">Muat pesan sebelumnya</button>' : '';
  const body = (data.items || []).length ? (data.items || []).map(messageBubble).join('') : '<div class="message-empty">Belum ada pesan. Mulai percakapan kelas.</div>';
  stream.innerHTML = hasMore + body;
  bindMessageActions();
  document.getElementById('load-older-messages')?.addEventListener('click', loadOlderMessages);

  requestAnimationFrame(() => {
    if (options.forceBottom) stream.scrollTop = stream.scrollHeight;
    else if (Number.isFinite(options.preserveBottomDistance)) stream.scrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight - options.preserveBottomDistance);
    else if (oldScrollHeight) stream.scrollTop = oldScrollTop;
  });
}

function composerHtml() {
  return `<div class="message-composer-shell">
    <div class="message-reply-composer" id="message-reply-composer" hidden></div>
    <form class="message-composer-wa" id="message-composer">
      <div class="emoji-popover" id="emoji-popover" hidden>${QUICK_EMOJI.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>
      <button class="chat-icon-btn" id="emoji-toggle" type="button" aria-label="Pilih emoji" title="Emoji"><span class="material-symbols-rounded">sentiment_satisfied</span></button>
      <div class="message-input-wrap"><textarea id="message-input" maxlength="1600" rows="1" placeholder="Ketik pesan"></textarea></div>
      <button class="message-send-circle" id="message-send" type="submit" aria-label="Kirim pesan" title="Kirim"><span class="material-symbols-rounded">send</span></button>
    </form>
  </div>`;
}

function bindComposer() {
  const form = document.getElementById('message-composer');
  const input = document.getElementById('message-input');
  const toggle = document.getElementById('emoji-toggle');
  const pop = document.getElementById('emoji-popover');
  if (!form || !input) return;
  form.onsubmit = sendMessage;
  const resize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; };
  input.addEventListener('input', resize);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  toggle?.addEventListener('click', () => { if (pop) pop.hidden = !pop.hidden; });
  pop?.querySelectorAll('[data-emoji]').forEach(btn => btn.onclick = () => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + btn.dataset.emoji + input.value.slice(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + btn.dataset.emoji.length;
    resize();
    pop.hidden = true;
  });
  renderReplyComposer();
}

function messageBubble(item) {
  const avatar = item.sender?.avatar_url ? `<img src="${esc(item.sender.avatar_url)}" alt="">` : `<span class="default-avatar-icon">${svg('i-user')}</span>`;
  const badges = chatRoleBadges(item.sender || {});
  const deleted = item.is_deleted === true || String(item.status || '').toUpperCase() === 'DELETED';
  const localPending = String(item.message_id || '').startsWith('LOCAL-');
  const canReply = !deleted && !localPending;
  const canDelete = !deleted && !localPending && item.can_delete === true;
  const reply = item.reply_to ? replyQuoteHtml(item.reply_to, true) : '';
  const actions = (canReply || canDelete) ? `<div class="message-actions" aria-label="Aksi pesan">
      ${canReply ? `<button type="button" data-message-reply="${esc(item.message_id)}" title="Balas"><span class="material-symbols-rounded">reply</span></button>` : ''}
      ${canDelete ? `<button type="button" class="danger" data-message-delete="${esc(item.message_id)}" title="Hapus pesan"><span class="material-symbols-rounded">delete_outline</span></button>` : ''}
    </div>` : '';

  return `<article class="message-bubble ${item.is_mine ? 'mine' : ''} ${deleted ? 'is-deleted' : ''}" data-message-id="${esc(item.message_id)}">
    <span class="message-avatar">${avatar}</span>
    <div class="message-body">
      <div class="message-meta"><div><strong>${esc(item.is_mine ? 'Kamu' : (item.sender?.full_name || item.sender?.username || 'User'))}</strong><span class="message-role-badges">${badges}</span></div><time>${esc(shortTime(item.created_at))}</time></div>
      ${reply}
      ${deleted ? '<p class="message-deleted-text"><span class="material-symbols-rounded">block</span> Pesan telah dihapus</p>' : `<p>${esc(item.body)}</p>`}
      ${actions}
    </div>
  </article>`;
}

function replyQuoteHtml(reply, clickable = false) {
  const label = reply.is_mine ? 'Kamu' : (reply.sender_name || reply.username || 'Pesan');
  const text = reply.is_deleted ? 'Pesan telah dihapus' : String(reply.body || '').slice(0, 180);
  const attrs = clickable && reply.message_id ? ` data-jump-message="${esc(reply.message_id)}" role="button" tabindex="0"` : '';
  return `<div class="message-reply-quote ${reply.is_deleted ? 'deleted' : ''}"${attrs}><strong>${esc(label)}</strong><span>${esc(text)}</span></div>`;
}

function bindMessageActions() {
  document.querySelectorAll('[data-message-reply]').forEach(btn => btn.onclick = () => beginReply(btn.dataset.messageReply));
  document.querySelectorAll('[data-message-delete]').forEach(btn => btn.onclick = () => deleteMessage(btn.dataset.messageDelete, btn));
  document.querySelectorAll('.message-bubble:not(.is-deleted)').forEach(bindSwipeReply);
  document.querySelectorAll('[data-jump-message]').forEach(el => {
    const jump = () => jumpToMessage(el.dataset.jumpMessage);
    el.onclick = jump;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(); } };
  });
}

function bindSwipeReply(el) {
  if (el.dataset.swipeBound === '1' || String(el.dataset.messageId || '').startsWith('LOCAL-')) return;
  el.dataset.swipeBound = '1';
  let startX = 0, startY = 0;
  el.addEventListener('touchstart', event => {
    const t = event.touches?.[0];
    if (!t) return;
    startX = t.clientX; startY = t.clientY;
  }, { passive: true });
  el.addEventListener('touchend', event => {
    const t = event.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (dx > 58 && Math.abs(dy) < 42) {
      el.classList.add('swipe-replied');
      window.setTimeout(() => el.classList.remove('swipe-replied'), 260);
      beginReply(el.dataset.messageId);
    }
  }, { passive: true });
}

function beginReply(messageId) {
  const item = findMessage(messageId);
  if (!item || item.is_deleted || String(item.message_id || '').startsWith('LOCAL-')) return;
  replyTarget = {
    message_id: item.message_id,
    body: item.body,
    is_deleted: false,
    is_mine: item.is_mine,
    sender_name: item.is_mine ? 'Kamu' : (item.sender?.full_name || item.sender?.username || 'User'),
    username: item.sender?.username || ''
  };
  renderReplyComposer();
  document.getElementById('message-input')?.focus();
}

function renderReplyComposer() {
  const root = document.getElementById('message-reply-composer');
  if (!root) return;
  if (!replyTarget) { root.hidden = true; root.innerHTML = ''; return; }
  root.hidden = false;
  root.innerHTML = `<div><span class="material-symbols-rounded">reply</span><div><strong>Membalas ${esc(replyTarget.sender_name || 'pesan')}</strong><small>${esc(String(replyTarget.body || '').slice(0, 140))}</small></div></div><button type="button" id="cancel-message-reply" aria-label="Batalkan balasan"><span class="material-symbols-rounded">close</span></button>`;
  document.getElementById('cancel-message-reply').onclick = () => { replyTarget = null; renderReplyComposer(); };
}

function findMessage(messageId) {
  const data = state.messagesByClass[activeClassId];
  return (data?.items || []).find(x => String(x.message_id) === String(messageId)) || null;
}

function jumpToMessage(messageId) {
  const el = document.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
  if (!el) { toast('Pesan asal belum dimuat. Muat pesan sebelumnya jika diperlukan.'); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('message-highlight');
  requestAnimationFrame(() => el.classList.add('message-highlight'));
  window.setTimeout(() => el.classList.remove('message-highlight'), 1600);
}

function chatRoleBadges(sender) {
  const role = String(sender.class_role || 'MEMBER').toUpperCase();
  const out = [];
  if (role === 'OWNER') out.push('<span>Owner</span>');
  else {
    out.push('<span>Member</span>');
    if (role === 'MODERATOR') out.push('<span>Moderator</span>');
    if (role === 'COORDINATOR') out.push('<span>Koordinator</span>');
  }
  if (sender.is_class_leader) out.push('<span>Ketua Kelas</span>');
  return out.join('');
}

async function loadOlderMessages() {
  if (loadingOlder || !activeClassId) return;
  const current = state.messagesByClass[activeClassId] || { items: [] };
  const before = current.next_before || current.items?.[0]?.created_at || '';
  if (!before) return;
  const btn = document.getElementById('load-older-messages');
  const stream = document.getElementById('message-stream');
  const oldHeight = stream?.scrollHeight || 0;
  loadingOlder = true;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Memuat…'; }
  try {
    const older = await api('getMessages', { class_id: activeClassId, limit: 40, before });
    const seen = new Set((current.items || []).map(x => x.message_id));
    current.items = [...(older.items || []).filter(x => !seen.has(x.message_id)), ...(current.items || [])];
    current.has_more = older.has_more;
    current.next_before = older.next_before;
    state.messagesByClass[activeClassId] = current;
    persistConversationCache(activeClassId, current);
    renderStream(current);
    requestAnimationFrame(() => { if (stream) stream.scrollTop = Math.max(0, stream.scrollHeight - oldHeight); });
  } catch (err) { toast(err.message); }
  finally { loadingOlder = false; }
}

async function sendMessage(event) {
  event.preventDefault();
  if (sending || !activeClassId) return;
  const input = document.getElementById('message-input');
  const btn = document.getElementById('message-send');
  const body = String(input?.value || '').trim();
  if (!body || !input || !btn) return;

  const replySnapshot = replyTarget ? { ...replyTarget } : null;
  sending = true;
  input.value = '';
  input.style.height = 'auto';
  btn.disabled = true;
  btn.classList.add('sending');
  const sendIcon = btn.querySelector('.material-symbols-rounded');
  if (sendIcon) sendIcon.textContent = 'sync';
  replyTarget = null;
  renderReplyComposer();

  const activeRoom = state.messageRooms.find(x => String(x.class_id) === String(activeClassId)) || {};
  const optimistic = {
    message_id: 'LOCAL-' + Date.now(),
    class_id: activeClassId,
    user_id: state.user?.user_id,
    body,
    reply_to_message_id: replySnapshot?.message_id || '',
    reply_to: replySnapshot,
    created_at: new Date().toISOString(),
    is_mine: true,
    is_deleted: false,
    can_delete: false,
    sender: {
      full_name: state.user?.full_name || state.user?.username,
      username: state.user?.username,
      avatar_url: state.user?.avatar_url || '',
      class_role: activeRoom.role || 'MEMBER',
      is_class_leader: false
    }
  };

  const cache = state.messagesByClass[activeClassId] || { items: [] };
  cache.items = [...(cache.items || []), optimistic];
  state.messagesByClass[activeClassId] = cache;
  appendBubble(optimistic);
  scrollBottom();

  try {
    const data = await api('sendMessage', { class_id: activeClassId, body, reply_to_message_id: replySnapshot?.message_id || '' }, { onSlow: () => btn.classList.add('slow') });
    const current = state.messagesByClass[activeClassId] || { items: [] };
    current.items = (current.items || []).map(x => x.message_id === optimistic.message_id ? data.item : x);
    state.messagesByClass[activeClassId] = current;
    persistConversationCache(activeClassId, current);
    const pending = document.querySelector(`[data-message-id="${CSS.escape(optimistic.message_id)}"]`);
    if (pending) pending.outerHTML = messageBubble(data.item);
    bindMessageActions();
    const room = state.messageRooms.find(x => String(x.class_id) === String(activeClassId));
    if (room) {
      room.last_message = body;
      room.last_message_at = data.item.created_at;
      patchRoomPreview(activeClassId, body);
      localStorage.setItem('kelasku_message_rooms_cache', JSON.stringify(state.messageRooms));
    }
  } catch (err) {
    const current = state.messagesByClass[activeClassId] || { items: [] };
    current.items = (current.items || []).filter(x => x.message_id !== optimistic.message_id);
    state.messagesByClass[activeClassId] = current;
    document.querySelector(`[data-message-id="${CSS.escape(optimistic.message_id)}"]`)?.remove();
    const currentInput = document.getElementById('message-input');
    if (currentInput) currentInput.value = body;
    if (replySnapshot) { replyTarget = replySnapshot; renderReplyComposer(); }
    toast('Pesan gagal dikirim: ' + err.message);
  } finally {
    sending = false;
    const currentBtn = document.getElementById('message-send');
    if (currentBtn) {
      currentBtn.disabled = false;
      currentBtn.classList.remove('sending', 'slow');
      const icon = currentBtn.querySelector('.material-symbols-rounded');
      if (icon) icon.textContent = 'send';
    }
    document.getElementById('message-input')?.focus();
  }
}

async function deleteMessage(messageId, button) {
  if (!messageId || deletingIds.has(messageId)) return;
  const item = findMessage(messageId);
  if (!item) return;
  const ok = await confirmDialog({
    title: 'Hapus pesan?',
    message: 'Pesan akan dihapus dari percakapan kelas dan diganti dengan tanda “Pesan telah dihapus”.',
    confirmLabel: 'Hapus Pesan',
    danger: true
  });
  if (!ok) return;

  deletingIds.add(messageId);
  if (button) { button.disabled = true; button.classList.add('is-busy'); button.innerHTML = '<span class="material-symbols-rounded">sync</span>'; }

  const original = { ...item };
  applyDeletedState(messageId);
  try {
    await api('deleteMessage', { class_id: activeClassId, message_id: messageId }, { onSlow: () => button?.classList.add('slow') });
    const data = state.messagesByClass[activeClassId];
    persistConversationCache(activeClassId, data);
    const room = state.messageRooms.find(x => String(x.class_id) === String(activeClassId));
    if (room && String(data?.items?.[data.items.length - 1]?.message_id || '') === String(messageId)) {
      room.last_message = 'Pesan dihapus';
      patchRoomPreview(activeClassId, 'Pesan dihapus');
      localStorage.setItem('kelasku_message_rooms_cache', JSON.stringify(state.messageRooms));
    }
  } catch (err) {
    restoreMessageState(original);
    toast('Pesan gagal dihapus: ' + err.message);
  } finally {
    deletingIds.delete(messageId);
  }
}

function applyDeletedState(messageId) {
  const data = state.messagesByClass[activeClassId];
  if (!data) return;
  data.items = (data.items || []).map(x => String(x.message_id) === String(messageId) ? { ...x, body: '', status: 'DELETED', is_deleted: true, can_delete: false } : x);
  const el = document.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
  const next = findMessage(messageId);
  if (el && next) el.outerHTML = messageBubble(next);
  bindMessageActions();
}

function restoreMessageState(original) {
  const data = state.messagesByClass[activeClassId];
  if (!data) return;
  data.items = (data.items || []).map(x => String(x.message_id) === String(original.message_id) ? original : x);
  const el = document.querySelector(`[data-message-id="${CSS.escape(String(original.message_id))}"]`);
  if (el) el.outerHTML = messageBubble(original);
  bindMessageActions();
}

function appendBubble(item) {
  const stream = document.getElementById('message-stream');
  if (!stream) return;
  stream.querySelector('.message-empty')?.remove();
  stream.insertAdjacentHTML('beforeend', messageBubble(item));
  bindMessageActions();
}

function patchRoomUnread(classId, count) {
  const btn = document.querySelector(`[data-message-room="${CSS.escape(String(classId))}"]`);
  if (!btn) return;
  const badge = btn.querySelector('b');
  if (count > 0) {
    if (badge) badge.textContent = String(count);
    else btn.insertAdjacentHTML('beforeend', `<b>${Number(count)}</b>`);
  } else badge?.remove();
}

function patchRoomPreview(classId, body) {
  const btn = document.querySelector(`[data-message-room="${CSS.escape(String(classId))}"]`);
  const small = btn?.querySelector('.message-room-copy small');
  if (small) small.textContent = body || 'Belum ada pesan.';
}

function persistConversationCache(classId, data) {
  try { sessionStorage.setItem(CONVERSATION_CACHE_PREFIX + classId, JSON.stringify({ at: Date.now(), data })); } catch {}
}

function hydrateConversationCache(classId) {
  if (!classId || state.messagesByClass[classId]) return;
  try {
    const raw = JSON.parse(sessionStorage.getItem(CONVERSATION_CACHE_PREFIX + classId) || 'null');
    if (raw?.data) state.messagesByClass[classId] = raw.data;
  } catch {}
}

function scrollBottom() {
  const stream = document.getElementById('message-stream');
  if (stream) requestAnimationFrame(() => stream.scrollTop = stream.scrollHeight);
}

function roomSkeleton() { return `<div class="message-room-head skeleton" style="height:40px"></div>${[1,2,3].map(() => '<div class="message-room-card skeleton" style="height:68px"></div>').join('')}`; }
function conversationSkeleton() { return `<div class="message-conversation-head skeleton" style="height:58px"></div><div class="message-stream">${[1,2,3].map((_,i) => `<div class="message-bubble skeleton ${i%2?'mine':''}" style="height:66px"></div>`).join('')}</div>`; }
function roleLabel(role) { const x = String(role || 'MEMBER').toUpperCase(); return x === 'OWNER' ? 'Owner' : x === 'COORDINATOR' ? 'Koordinator' : x === 'MODERATOR' ? 'Moderator' : 'Member'; }
function shortTime(value) { try { return new Intl.DateTimeFormat('id-ID', { hour:'2-digit', minute:'2-digit' }).format(new Date(value)); } catch { return ''; } }
