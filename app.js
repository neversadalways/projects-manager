'use strict';

// ---------- Constants ----------
const STATUSES = [
  { id: 'idea',     label: 'רעיון',          color: '#8b5cf6' },
  { id: 'waiting',  label: 'ממתין להתחלה',   color: '#64748b' },
  { id: 'progress', label: 'בתהליך',         color: '#2563eb' },
  { id: 'review',   label: 'בבדיקה',         color: '#d97706' },
  { id: 'blocked',  label: 'תקוע / ממתין',   color: '#dc2626' },
  { id: 'done',     label: 'הושלם',          color: '#16a34a' },
  { id: 'frozen',   label: 'מוקפא',          color: '#94a3b8' },
];
const PRIORITIES = [
  { id: 1, label: 'דחוף',   color: '#dc2626' },
  { id: 2, label: 'גבוהה',  color: '#ea580c' },
  { id: 3, label: 'בינונית', color: '#2563eb' },
  { id: 4, label: 'נמוכה',  color: '#64748b' },
];
const LS_DATA = 'pm.data.v1';
const LS_SETTINGS = 'pm.settings.v1';

const statusOf = id => STATUSES.find(s => s.id === id) || STATUSES[0];
const priorityOf = id => PRIORITIES.find(p => p.id === Number(id)) || PRIORITIES[2];

// ---------- Helpers ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('he-IL') : '';
const fmtDateTime = d => new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const isLate = p => p.dueDate && p.status !== 'done' && p.status !== 'frozen' && p.dueDate < today();

function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

function safeGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ }
}

// ---------- State ----------
let data = safeGet(LS_DATA, { projects: [], updatedAt: null });
let settings = safeGet(LS_SETTINGS, { token: '', owner: '', repo: '', path: 'projects.json', branch: 'main' });
let ghSha = null;
let editing = null;      // project being edited (working copy)
let statFilter = '';     // quick filter from stats cards

function persist() {
  data.updatedAt = new Date().toISOString();
  safeSet(LS_DATA, data);
  render();
  scheduleSync();
}

// ---------- GitHub sync ----------
const ghEnabled = () => settings.token && settings.owner && settings.repo && settings.path;
const ghUrl = () => `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${settings.path.split('/').map(encodeURIComponent).join('/')}`;
const ghHeaders = () => ({
  'Authorization': `Bearer ${settings.token}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});
const b64encode = str => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decode = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));

function setSync(state, text) {
  const el = $('#syncStatus');
  el.className = 'sync ' + state;
  el.textContent = text;
}

async function ghLoad() {
  if (!ghEnabled()) { setSync('', 'מקומי'); return false; }
  setSync('busy', 'טוען...');
  const res = await fetch(`${ghUrl()}?ref=${encodeURIComponent(settings.branch || 'main')}&t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 404) {
    // File doesn't exist yet – will be created on first save
    ghSha = null;
    setSync('ok', 'מסונכרן');
    await ghSave();
    return true;
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.json().catch(() => ({}))).message || ''}`);
  const json = await res.json();
  ghSha = json.sha;
  const remote = JSON.parse(b64decode(json.content));
  if (remote && Array.isArray(remote.projects)) {
    data = remote;
    safeSet(LS_DATA, data);
  }
  setSync('ok', 'מסונכרן');
  render();
  return true;
}

async function ghSave() {
  if (!ghEnabled()) return;
  setSync('busy', 'שומר...');
  const body = {
    message: `עדכון פרויקטים ${new Date().toLocaleString('he-IL')}`,
    content: b64encode(JSON.stringify(data, null, 2)),
    branch: settings.branch || 'main',
  };
  if (ghSha) body.sha = ghSha;
  const res = await fetch(ghUrl(), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) {
    // Remote changed (e.g. edited from another device) – take remote sha and retry once with local data
    const cur = await fetch(`${ghUrl()}?ref=${encodeURIComponent(body.branch)}&t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
    if (cur.ok) {
      ghSha = (await cur.json()).sha;
      body.sha = ghSha;
      const retry = await fetch(ghUrl(), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
      if (retry.ok) { ghSha = (await retry.json()).content.sha; setSync('ok', 'מסונכרן'); return; }
    }
    throw new Error('התנגשות בסנכרון – רענן את הדף');
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.json().catch(() => ({}))).message || ''}`);
  ghSha = (await res.json()).content.sha;
  setSync('ok', 'מסונכרן');
}

let syncTimer = null;
function scheduleSync() {
  if (!ghEnabled()) return;
  setSync('busy', 'ממתין לשמירה...');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    ghSave().catch(err => { setSync('err', 'שגיאת סנכרון'); toast(err.message, 5000); });
  }, 1200);
}

// ---------- Rendering ----------
function fillSelect(sel, items, keepFirst = false) {
  const first = keepFirst ? sel.options[0].outerHTML : '';
  sel.innerHTML = first + items.map(i => `<option value="${i.id}">${esc(i.label)}</option>`).join('');
}

function requesters() {
  return [...new Set(data.projects.map(p => (p.requester || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
}

function renderStats() {
  const ps = data.projects;
  const cards = [
    { key: '',         num: ps.length,                                                   lbl: 'סה"כ פרויקטים' },
    { key: 'active',   num: ps.filter(p => ['progress', 'review'].includes(p.status)).length, lbl: 'פעילים' },
    { key: 'waiting',  num: ps.filter(p => ['idea', 'waiting', 'blocked'].includes(p.status)).length, lbl: 'ממתינים / תקועים' },
    { key: 'late',     num: ps.filter(isLate).length,                                     lbl: 'באיחור' },
    { key: 'done',     num: ps.filter(p => p.status === 'done').length,                    lbl: 'הושלמו' },
  ];
  $('#stats').innerHTML = cards.map(c =>
    `<div class="stat ${statFilter === c.key ? 'active' : ''}" data-key="${c.key}">
       <div class="num">${c.num}</div><div class="lbl">${c.lbl}</div>
     </div>`).join('');
}

function filtered() {
  const q = $('#search').value.trim().toLowerCase();
  const st = $('#filterStatus').value;
  const rq = $('#filterRequester').value;
  const hideDone = $('#hideDone').checked;
  const sort = $('#sortBy').value;

  let list = data.projects.filter(p => {
    if (st && p.status !== st) return false;
    if (rq && (p.requester || '').trim() !== rq) return false;
    if (hideDone && p.status === 'done') return false;
    if (statFilter === 'active' && !['progress', 'review'].includes(p.status)) return false;
    if (statFilter === 'waiting' && !['idea', 'waiting', 'blocked'].includes(p.status)) return false;
    if (statFilter === 'late' && !isLate(p)) return false;
    if (statFilter === 'done' && p.status !== 'done') return false;
    if (q) {
      const hay = [p.name, p.requester, p.owner, p.spec, (p.tags || []).join(' '), statusOf(p.status).label].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const cmp = {
    updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
    due: (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'),
    priority: (a, b) => (a.priority || 3) - (b.priority || 3),
    progress: (a, b) => (b.progress || 0) - (a.progress || 0),
    name: (a, b) => (a.name || '').localeCompare(b.name || '', 'he'),
  }[sort];
  return list.sort(cmp);
}

function cardHtml(p) {
  const s = statusOf(p.status);
  const pr = priorityOf(p.priority);
  const tasks = p.tasks || [];
  const doneTasks = tasks.filter(t => t.done).length;
  return `
  <article class="card" data-id="${p.id}" style="--status-color:${s.color}">
    <div class="card-top">
      <h3>${esc(p.name)}</h3>
      <span class="badge" style="--c:${s.color}">${esc(s.label)}</span>
    </div>
    <div class="meta">
      ${p.requester ? `<span>👤 ${esc(p.requester)}</span>` : ''}
      <span style="color:${pr.color}">● ${pr.label}</span>
      ${p.dueDate ? `<span class="${isLate(p) ? 'late' : ''}">📅 ${fmtDate(p.dueDate)}${isLate(p) ? ' (באיחור)' : ''}</span>` : ''}
      ${tasks.length ? `<span>✔ ${doneTasks}/${tasks.length}</span>` : ''}
    </div>
    ${p.spec ? `<p class="spec-preview">${esc(p.spec)}</p>` : ''}
    <div class="progress-row">
      <div class="progress"><div style="width:${p.progress || 0}%"></div></div>
      <span>${p.progress || 0}%</span>
    </div>
    ${(p.tags || []).length ? `<div class="tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
  </article>`;
}

function render() {
  renderStats();
  // keep requester filter in sync with data
  const rqSel = $('#filterRequester');
  const cur = rqSel.value;
  const rqs = requesters();
  rqSel.innerHTML = '<option value="">כל המבקשים</option>' + rqs.map(r => `<option>${esc(r)}</option>`).join('');
  rqSel.value = rqs.includes(cur) ? cur : '';
  $('#requesters').innerHTML = rqs.map(r => `<option value="${esc(r)}">`).join('');

  const list = filtered();
  $('#list').innerHTML = list.map(cardHtml).join('');
  $('#empty').hidden = list.length > 0;
}

// ---------- Project editor ----------
const form = $('#formProject');
const dlg = $('#dlgProject');

function openEditor(id) {
  const src = id ? data.projects.find(p => p.id === id) : null;
  editing = src ? structuredClone(src) : {
    id: null, name: '', status: 'waiting', priority: 3, requester: '', owner: '',
    startDate: today(), dueDate: '', spec: '', tags: [], links: [], progress: 0,
    autoProgress: false, tasks: [], notes: [],
  };
  $('#dlgTitle').textContent = src ? 'עריכת פרויקט' : 'פרויקט חדש';
  $('#btnDelete').hidden = !src;
  const f = form.elements;
  f.name.value = editing.name;
  f.status.value = editing.status;
  f.priority.value = editing.priority;
  f.requester.value = editing.requester;
  f.owner.value = editing.owner || '';
  f.startDate.value = editing.startDate || '';
  f.dueDate.value = editing.dueDate || '';
  f.spec.value = editing.spec || '';
  f.tags.value = (editing.tags || []).join(', ');
  f.links.value = (editing.links || []).join('\n');
  f.progress.value = editing.progress || 0;
  f.autoProgress.checked = !!editing.autoProgress;
  renderTasks();
  renderNotes();
  updateProgressUI();
  dlg.showModal();
  if (!src) setTimeout(() => f.name.focus(), 50);
}

function calcAutoProgress() {
  const t = editing.tasks;
  return t.length ? Math.round(t.filter(x => x.done).length / t.length * 100) : 0;
}

function updateProgressUI() {
  const f = form.elements;
  if (f.autoProgress.checked) f.progress.value = calcAutoProgress();
  f.progress.disabled = f.autoProgress.checked;
  $('#progressVal').textContent = f.progress.value + '%';
}

function renderTasks() {
  $('#tasks').innerHTML = editing.tasks.map((t, i) => `
    <li class="${t.done ? 'done' : ''}">
      <input type="checkbox" data-i="${i}" ${t.done ? 'checked' : ''}>
      <span>${esc(t.text)}</span>
      <button type="button" class="x" data-del-task="${i}" title="מחק">✕</button>
    </li>`).join('');
}

function renderNotes() {
  $('#notes').innerHTML = editing.notes.map((n, i) => `
    <li>
      <span class="when">${fmtDateTime(n.at)}</span>
      <span class="txt">${esc(n.text)}</span>
      <button type="button" class="x" data-del-note="${i}" title="מחק">✕</button>
    </li>`).join('');
}

function addTask() {
  const inp = $('#newTask');
  const text = inp.value.trim();
  if (!text) return;
  editing.tasks.push({ id: uid(), text, done: false });
  inp.value = '';
  renderTasks();
  updateProgressUI();
  inp.focus();
}

function addNote() {
  const inp = $('#newNote');
  const text = inp.value.trim();
  if (!text) return;
  editing.notes.unshift({ id: uid(), text, at: new Date().toISOString() });
  inp.value = '';
  renderNotes();
}

function saveEditor() {
  const f = form.elements;
  const name = f.name.value.trim();
  if (!name) { f.name.focus(); return; }
  // Pick up a task/note typed but not yet added
  addTask(); addNote();
  const prevStatus = editing.id ? data.projects.find(p => p.id === editing.id)?.status : null;
  Object.assign(editing, {
    name,
    status: f.status.value,
    priority: Number(f.priority.value),
    requester: f.requester.value.trim(),
    owner: f.owner.value.trim(),
    startDate: f.startDate.value,
    dueDate: f.dueDate.value,
    spec: f.spec.value,
    tags: f.tags.value.split(',').map(s => s.trim()).filter(Boolean),
    links: f.links.value.split('\n').map(s => s.trim()).filter(Boolean),
    autoProgress: f.autoProgress.checked,
    progress: Number(f.progress.value),
    updatedAt: new Date().toISOString(),
  });
  if (prevStatus && prevStatus !== editing.status) {
    editing.notes.unshift({ id: uid(), text: `סטטוס שונה: ${statusOf(prevStatus).label} ← ${statusOf(editing.status).label}`, at: editing.updatedAt });
  }
  if (editing.status === 'done' && !editing.autoProgress) editing.progress = 100;

  if (editing.id) {
    const i = data.projects.findIndex(p => p.id === editing.id);
    data.projects[i] = editing;
  } else {
    editing.id = uid();
    editing.createdAt = editing.updatedAt;
    data.projects.push(editing);
  }
  dlg.close();
  persist();
  toast('נשמר ✓');
}

// ---------- Export / import ----------
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportCsv() {
  const cols = [
    ['שם', p => p.name], ['סטטוס', p => statusOf(p.status).label], ['עדיפות', p => priorityOf(p.priority).label],
    ['מי ביקש', p => p.requester], ['אחראי', p => p.owner], ['התחלה', p => p.startDate], ['יעד', p => p.dueDate],
    ['התקדמות %', p => p.progress], ['אפיון', p => p.spec], ['תגיות', p => (p.tags || []).join(', ')],
    ['משימות', p => (p.tasks || []).map(t => (t.done ? '✔ ' : '☐ ') + t.text).join('\n')],
  ];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [cols.map(c => cell(c[0])).join(',')].concat(data.projects.map(p => cols.map(c => cell(c[1](p))).join(',')));
  download(`projects-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

// ---------- Events ----------
function wire() {
  fillSelect($('#filterStatus'), STATUSES, true);
  fillSelect(form.elements.status, STATUSES);
  fillSelect(form.elements.priority, PRIORITIES);

  $('#btnNew').onclick = () => openEditor(null);
  $('#list').onclick = e => {
    const card = e.target.closest('.card');
    if (card) openEditor(card.dataset.id);
  };
  $('#stats').onclick = e => {
    const s = e.target.closest('.stat');
    if (!s) return;
    statFilter = statFilter === s.dataset.key ? '' : s.dataset.key;
    render();
  };
  ['#search', '#filterStatus', '#filterRequester', '#sortBy', '#hideDone'].forEach(id =>
    $(id).addEventListener('input', render));

  document.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => b.closest('dialog').close()));

  form.onsubmit = e => { e.preventDefault(); saveEditor(); };
  form.elements.progress.oninput = updateProgressUI;
  form.elements.autoProgress.onchange = updateProgressUI;
  $('#btnAddTask').onclick = addTask;
  $('#btnAddNote').onclick = addNote;
  $('#newTask').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } };
  $('#newNote').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } };
  $('#tasks').onclick = e => {
    if (e.target.dataset.delTask !== undefined) {
      editing.tasks.splice(+e.target.dataset.delTask, 1);
    } else if (e.target.type === 'checkbox') {
      editing.tasks[+e.target.dataset.i].done = e.target.checked;
    } else return;
    renderTasks();
    updateProgressUI();
  };
  $('#notes').onclick = e => {
    if (e.target.dataset.delNote === undefined) return;
    editing.notes.splice(+e.target.dataset.delNote, 1);
    renderNotes();
  };
  $('#btnDelete').onclick = () => {
    if (!confirm(`למחוק את הפרויקט "${editing.name}"?`)) return;
    data.projects = data.projects.filter(p => p.id !== editing.id);
    dlg.close();
    persist();
    toast('הפרויקט נמחק');
  };

  // Settings
  const sf = $('#formSettings');
  $('#btnSettings').onclick = () => {
    for (const k of ['token', 'owner', 'repo', 'path', 'branch']) sf.elements[k].value = settings[k] || '';
    $('#dlgSettings').showModal();
  };
  const readSettings = () => {
    for (const k of ['token', 'owner', 'repo', 'path', 'branch']) settings[k] = sf.elements[k].value.trim();
    if (!settings.path) settings.path = 'projects.json';
    if (!settings.branch) settings.branch = 'main';
    safeSet(LS_SETTINGS, settings);
  };
  sf.onsubmit = e => { e.preventDefault(); readSettings(); $('#dlgSettings').close(); syncNow(); };
  $('#btnTestSync').onclick = () => { readSettings(); syncNow(); };
  $('#btnDisconnect').onclick = () => {
    settings = { token: '', owner: '', repo: '', path: 'projects.json', branch: 'main' };
    safeSet(LS_SETTINGS, settings);
    ghSha = null;
    $('#dlgSettings').close();
    setSync('', 'מקומי');
    toast('הסנכרון נותק. הנתונים נשארו בדפדפן.');
  };
  $('#btnExport').onclick = () => download(`projects-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  $('#btnExportCsv').onclick = exportCsv;
  $('#fileImport').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported.projects)) throw new Error();
      if (!confirm(`לייבא ${imported.projects.length} פרויקטים? הנתונים הנוכחיים יוחלפו.`)) return;
      data = imported;
      persist();
      toast('הייבוא הושלם');
    } catch { toast('קובץ לא תקין'); }
    e.target.value = '';
  };

  // Refresh from GitHub when returning to the app (e.g. after editing on another device)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ghEnabled() && !syncTimer && !dlg.open) syncNow(true);
  });
}

async function syncNow(quiet = false) {
  if (!ghEnabled()) { setSync('', 'מקומי'); return; }
  try {
    await ghLoad();
    if (!quiet) toast('מחובר ל-GitHub ✓');
  } catch (err) {
    setSync('err', 'שגיאת סנכרון');
    toast(err.message, 5000);
  }
}

wire();
render();
syncNow(true);
