'use strict';

const APP_VERSION = '1.0.0';
const STORAGE_KEY = 'fixed-expenses:v1';

/* ───────── 데이터 ─────────
 * items:    [{ id, name, amount, cycle: 'monthly'|'yearly', month, day, category, method,
 *              start: 'YYYY-MM', end: 'YYYY-MM'|'', memo, auto, active, createdAt }]
 * payments: { 'YYYY-MM': { [itemId]: { paidAt?: ISO 문자열, amount?: 이번 달만 바뀐 금액 } } }
 */
let state = load();

function emptyState() {
  return { version: 1, items: [], payments: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    return isValidState(data) ? data : emptyState();
  } catch {
    return emptyState();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('저장에 실패했어요. 저장 공간을 확인해 주세요.');
  }
}

function isValidState(d) {
  return d && typeof d === 'object' && Array.isArray(d.items) &&
    d.payments && typeof d.payments === 'object' && !Array.isArray(d.payments);
}

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

/* ───────── 날짜 ───────── */
const pad = (n) => String(n).padStart(2, '0');
const ymOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const parseYm = (ym) => { const [y, m] = ym.split('-').map(Number); return { y, m }; };
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

function addMonths(ym, delta) {
  const { y, m } = parseYm(ym);
  return ymOf(new Date(y, m - 1 + delta, 1));
}

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 결제일이 그 달의 일수보다 크면 말일로 맞춤 (예: 31일 → 2월 28일)
function dueDate(item, ym) {
  const { y, m } = parseYm(ym);
  return new Date(y, m - 1, Math.min(item.day, daysInMonth(y, m)));
}

const dayLabel = (day) => (day >= 31 ? '말일' : `${day}일`);

/* ───────── 계산 ───────── */
function isInRange(item, ym) {
  if (item.start && ym < item.start) return false;
  if (item.end && ym > item.end) return false;
  return true;
}

function isDueIn(item, ym) {
  if (!isInRange(item, ym)) return false;
  if (item.cycle === 'yearly') return parseYm(ym).m === Number(item.month);
  return true;
}

function paymentOf(ym, id) {
  return state.payments[ym]?.[id];
}

function amountFor(item, ym) {
  const p = paymentOf(ym, item.id);
  return p && typeof p.amount === 'number' ? p.amount : item.amount;
}

// 그 달에 표시할 항목: 사용 중이면서 해당 월에 결제되는 항목 + (사용 중지됐어도) 이미 기록이 있는 항목
function itemsForMonth(ym) {
  return state.items
    .filter((it) => isDueIn(it, ym) && (it.active || paymentOf(ym, it.id)))
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, 'ko'));
}

// 월 환산 금액 (연간 결제는 12로 나눔)
function monthlyEquivalent(item) {
  return item.cycle === 'yearly' ? item.amount / 12 : item.amount;
}

/* ───────── 포맷 ───────── */
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const digitsOnly = (s) => String(s).replace(/[^\d]/g, '');
const formatNumberInput = (s) => { const d = digitsOnly(s); return d ? Number(d).toLocaleString('ko-KR') : ''; };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ───────── 화면 ───────── */
const $ = (sel) => document.querySelector(sel);
const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';
const VIEW_TITLES = { month: '이번 달', items: '고정지출 항목', settings: '설정' };

let currentView = 'month';
let viewYm = ymOf(new Date());

function render() {
  renderMonth();
  renderItems();
  refreshDatalists();
}

function statusBadge(item, ym, paid) {
  if (paid) return '';
  const nowYm = ymOf(new Date());
  if (ym < nowYm) return '<span class="badge overdue">미납</span>';
  if (ym > nowYm) return '';
  const diff = Math.round((dueDate(item, ym) - today()) / 86400000);
  if (diff < 0) return `<span class="badge overdue">${-diff}일 지남</span>`;
  if (diff === 0) return '<span class="badge today">오늘</span>';
  if (diff <= 3) return `<span class="badge soon">D-${diff}</span>`;
  return '';
}

function monthRow(item, ym) {
  const p = paymentOf(ym, item.id);
  const paid = !!p?.paidAt;
  const amount = amountFor(item, ym);
  const due = dueDate(item, ym);
  const changed = p && typeof p.amount === 'number' && p.amount !== item.amount;
  const sub = [item.category, item.method].filter(Boolean).map(escapeHtml).join(' · ');
  const when = paid
    ? `${new Date(p.paidAt).getMonth() + 1}/${new Date(p.paidAt).getDate()} 완료`
    : `${due.getMonth() + 1}/${due.getDate()}${item.day >= 31 ? ' (말일)' : ''}`;

  return `
    <li class="row ${paid ? 'paid' : ''}" data-id="${item.id}">
      <button class="check ${paid ? 'on' : ''}" data-act="toggle" aria-label="${escapeHtml(item.name)} ${paid ? '완료 취소' : '완료로 표시'}" aria-pressed="${paid}">${CHECK_SVG}</button>
      <button class="row-main" data-act="pay">
        <div class="row-text">
          <div class="row-title">${escapeHtml(item.name)}${statusBadge(item, ym, paid)}${item.cycle === 'yearly' ? '<span class="badge yearly">연</span>' : ''}${item.auto ? '<span class="badge auto">자동</span>' : ''}</div>
          ${sub ? `<div class="row-sub">${sub}</div>` : ''}
        </div>
        <div class="row-right">
          <div class="row-amount">${won(amount)}${changed ? '<span class="changed">변경</span>' : ''}</div>
          <div class="row-when">${when}</div>
        </div>
      </button>
    </li>`;
}

function renderMonth() {
  const { y, m } = parseYm(viewYm);
  const isNow = viewYm === ymOf(new Date());
  $('#month-label').textContent = `${y}년 ${m}월${isNow ? '' : ' ↺'}`;
  $('#page-title').textContent = currentView === 'month' ? (isNow ? '이번 달' : `${m}월`) : VIEW_TITLES[currentView];

  const items = itemsForMonth(viewYm);
  const isPaid = (it) => !!paymentOf(viewYm, it.id)?.paidAt;
  const unpaid = items.filter((it) => !isPaid(it));
  const paid = items.filter(isPaid);

  const total = items.reduce((s, it) => s + amountFor(it, viewYm), 0);
  const paidSum = paid.reduce((s, it) => s + amountFor(it, viewYm), 0);
  $('#sum-total').textContent = won(total);
  $('#sum-paid').textContent = `${won(paidSum)} (${paid.length}/${items.length})`;
  $('#sum-left').textContent = won(total - paidSum);
  $('#progress-bar').style.width = total ? `${(paidSum / total) * 100}%` : '0';

  let html = '';
  if (unpaid.length) html += unpaid.map((it) => monthRow(it, viewYm)).join('');
  if (paid.length) {
    if (unpaid.length) html += `</ul><div class="section-label">완료 ${paid.length}건</div><ul class="list">`;
    html += paid.map((it) => monthRow(it, viewYm)).join('');
  }
  // 섹션 구분을 위해 컨테이너를 통째로 교체
  const wrap = document.createElement('div');
  wrap.id = 'month-list-wrap';
  wrap.innerHTML = `<ul class="list" id="month-list">${html}</ul>`;
  const old = $('#month-list-wrap') || $('#month-list');
  old.replaceWith(wrap);

  $('#month-empty').hidden = items.length > 0;
}

function renderItems() {
  const nowYm = ymOf(new Date());
  const current = state.items.filter((it) => it.active && isInRange(it, nowYm));
  const avg = current.reduce((s, it) => s + monthlyEquivalent(it), 0);
  $('#avg-monthly').textContent = won(avg);
  $('#sum-yearly').textContent = won(avg * 12);

  // 분류별 (월 환산)
  const byCat = new Map();
  for (const it of current) {
    const k = it.category || '미분류';
    byCat.set(k, (byCat.get(k) || 0) + monthlyEquivalent(it));
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  $('#category-breakdown').innerHTML = cats.length > 1 ? `
    <div class="card">
      <h2>분류별 <small class="muted">(월 환산)</small></h2>
      <div class="breakdown">
        ${cats.map(([name, v]) => `
          <div class="breakdown-row">
            <span>${escapeHtml(name)} <span class="muted small">${Math.round((v / avg) * 100)}%</span></span>
            <b>${won(v)}</b>
            <div class="bar"><i style="width:${(v / cats[0][1]) * 100}%"></i></div>
          </div>`).join('')}
      </div>
    </div>` : '';

  const sorted = [...state.items].sort((a, b) => {
    const aOn = a.active && (!a.end || a.end >= nowYm);
    const bOn = b.active && (!b.end || b.end >= nowYm);
    return (bOn - aOn) || a.day - b.day || a.name.localeCompare(b.name, 'ko');
  });

  $('#item-list').innerHTML = sorted.map((it) => {
    const ended = it.end && it.end < nowYm;
    const off = !it.active || ended;
    const schedule = it.cycle === 'yearly' ? `매년 ${it.month}월 ${dayLabel(it.day)}` : `매월 ${dayLabel(it.day)}`;
    const sub = [schedule, it.category, it.method].filter(Boolean).map(escapeHtml).join(' · ');
    let note = '';
    if (!it.active) note = '사용 안 함';
    else if (ended) note = '종료됨';
    else if (it.end) note = `~${it.end.replace('-', '.')}`;
    else if (it.start && it.start > nowYm) note = `${it.start.replace('-', '.')}~`;
    return `
      <li class="row ${off ? 'inactive' : ''}" data-id="${it.id}">
        <button class="row-main" data-act="edit">
          <div class="day-chip">${it.day >= 31 ? '말일' : it.day}</div>
          <div class="row-text">
            <div class="row-title">${escapeHtml(it.name)}${it.auto ? '<span class="badge auto">자동</span>' : ''}</div>
            <div class="row-sub">${sub}</div>
          </div>
          <div class="row-right">
            <div class="row-amount">${won(it.amount)}</div>
            ${note ? `<div class="row-when">${note}</div>` : ''}
          </div>
        </button>
      </li>`;
  }).join('');

  $('#items-empty').hidden = state.items.length > 0;
}

function refreshDatalists() {
  const uniq = (key) => [...new Set(state.items.map((it) => it[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const defaults = ['주거', '통신', '구독', '보험', '대출', '공과금', '교통', '저축'];
  const cats = [...new Set([...uniq('category'), ...defaults])];
  $('#category-options').innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join('');
  $('#method-options').innerHTML = uniq('method').map((c) => `<option value="${escapeHtml(c)}">`).join('');
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${view}`));
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  document.body.className = `view-${view}`;
  renderMonth();
  window.scrollTo(0, 0);
}

/* ───────── 완료 체크 ───────── */
function togglePaid(id) {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;
  const month = (state.payments[viewYm] ||= {});
  const prev = month[id] ? { ...month[id] } : undefined;
  const p = (month[id] ||= {});

  if (p.paidAt) {
    delete p.paidAt;
  } else {
    // 지난 달을 나중에 체크하면 결제일 날짜로 기록, 이번 달이면 오늘로 기록
    const due = dueDate(item, viewYm);
    p.paidAt = (viewYm < ymOf(new Date()) ? due : new Date()).toISOString();
  }
  cleanupPayment(viewYm, id);
  save();
  renderMonth();

  if (navigator.vibrate) navigator.vibrate(10);
  const nowPaid = !!paymentOf(viewYm, id)?.paidAt;
  const ym = viewYm;
  toast(`${item.name} ${nowPaid ? '완료' : '완료 취소'}`, () => {
    const m = (state.payments[ym] ||= {});
    if (prev) m[id] = prev; else delete m[id];
    cleanupPayment(ym, id);
    save();
    renderMonth();
  });
}

function cleanupPayment(ym, id) {
  const month = state.payments[ym];
  if (!month) return;
  const p = month[id];
  if (p && !p.paidAt && typeof p.amount !== 'number') delete month[id];
  if (!Object.keys(month).length) delete state.payments[ym];
}

/* ───────── 항목 추가/수정 ───────── */
const itemDialog = $('#item-dialog');
const itemForm = $('#item-form');
let editingId = null;

function fillSelectOptions() {
  itemForm.month.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('');
  itemForm.day.innerHTML = Array.from({ length: 31 }, (_, i) =>
    `<option value="${i + 1}">${i + 1 === 31 ? '말일 (31일)' : `${i + 1}일`}</option>`).join('');
}

function syncCycleUI() {
  $('#month-field').hidden = itemForm.cycle.value !== 'yearly';
}

function openItemDialog(id = null) {
  editingId = id;
  const it = id ? state.items.find((x) => x.id === id) : null;
  $('#dialog-title').textContent = it ? '고정지출 수정' : '고정지출 추가';
  $('#delete-btn').hidden = !it;

  const now = new Date();
  itemForm.name.value = it?.name ?? '';
  itemForm.amount.value = it ? formatNumberInput(it.amount) : '';
  itemForm.cycle.value = it?.cycle ?? 'monthly';
  itemForm.month.value = String(it?.month ?? now.getMonth() + 1);
  itemForm.day.value = String(it?.day ?? now.getDate());
  itemForm.category.value = it?.category ?? '';
  itemForm.method.value = it?.method ?? '';
  itemForm.start.value = it?.start ?? ymOf(now);
  itemForm.end.value = it?.end ?? '';
  itemForm.memo.value = it?.memo ?? '';
  itemForm.auto.checked = it?.auto ?? false;
  itemForm.active.checked = it?.active ?? true;
  syncCycleUI();

  itemDialog.showModal();
  itemDialog.scrollTop = 0;
  if (!it) setTimeout(() => itemForm.name.focus(), 50);
}

itemForm.amount.addEventListener('input', (e) => { e.target.value = formatNumberInput(e.target.value); });
itemForm.querySelectorAll('input[name="cycle"]').forEach((el) => el.addEventListener('change', syncCycleUI));

itemForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = itemForm.name.value.trim();
  const amount = Number(digitsOnly(itemForm.amount.value));
  if (!name) return itemForm.name.focus();
  if (!amount) { toast('금액을 입력해 주세요'); return itemForm.amount.focus(); }
  const start = itemForm.start.value;
  const end = itemForm.end.value;
  if (start && end && end < start) { toast('종료 월이 시작 월보다 빨라요'); return itemForm.end.focus(); }

  const data = {
    name,
    amount,
    cycle: itemForm.cycle.value,
    month: Number(itemForm.month.value),
    day: Number(itemForm.day.value),
    category: itemForm.category.value.trim(),
    method: itemForm.method.value.trim(),
    start,
    end,
    memo: itemForm.memo.value.trim(),
    auto: itemForm.auto.checked,
    active: itemForm.active.checked,
  };

  if (editingId) {
    Object.assign(state.items.find((x) => x.id === editingId), data);
  } else {
    state.items.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
  }
  save();
  itemDialog.close();
  render();
  toast(editingId ? '수정했어요' : '추가했어요');
});

$('#delete-btn').addEventListener('click', () => {
  const it = state.items.find((x) => x.id === editingId);
  if (!it || !confirm(`'${it.name}'을(를) 삭제할까요?\n지난 납부 기록도 함께 삭제돼요.`)) return;
  state.items = state.items.filter((x) => x.id !== editingId);
  for (const ym of Object.keys(state.payments)) {
    delete state.payments[ym][editingId];
    if (!Object.keys(state.payments[ym]).length) delete state.payments[ym];
  }
  save();
  itemDialog.close();
  render();
  toast('삭제했어요');
});

/* ───────── 이번 달 금액 변경 ───────── */
const payDialog = $('#pay-dialog');
const payForm = $('#pay-form');
let payingId = null;

function openPayDialog(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  payingId = id;
  const { m } = parseYm(viewYm);
  $('#pay-title').textContent = it.name;
  $('#pay-desc').textContent = `${m}월에만 적용돼요. 기본 금액은 ${won(it.amount)}이에요.${it.memo ? `\n메모: ${it.memo}` : ''}`;
  payForm.amount.value = formatNumberInput(amountFor(it, viewYm));
  payDialog.showModal();
}

payForm.amount.addEventListener('input', (e) => { e.target.value = formatNumberInput(e.target.value); });

payForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const it = state.items.find((x) => x.id === payingId);
  if (!it) return payDialog.close();
  const amount = Number(digitsOnly(payForm.amount.value));
  const month = (state.payments[viewYm] ||= {});
  const p = (month[payingId] ||= {});
  if (amount === it.amount || !payForm.amount.value) delete p.amount; else p.amount = amount;
  cleanupPayment(viewYm, payingId);
  save();
  payDialog.close();
  renderMonth();
});

$('#pay-edit-item').addEventListener('click', () => {
  payDialog.close();
  openItemDialog(payingId);
});

// 시트 공통: 취소 버튼, 바깥 영역 탭하면 닫기
document.querySelectorAll('dialog').forEach((dlg) => {
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
});

/* ───────── 백업 ───────── */
$('#export-btn').addEventListener('click', async () => {
  const d = new Date();
  const filename = `fixed-expenses-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
  const blob = new Blob([JSON.stringify({ ...state, exportedAt: d.toISOString() }, null, 2)], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });

  // 모바일에서는 공유 시트로 (파일 앱, 카톡 나에게 보내기 등)
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '고정지출 백업' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!isValidState(data)) throw new Error('invalid');
    if (!confirm(`항목 ${data.items.length}개를 불러올까요?\n지금 데이터는 모두 바뀌어요.`)) return;
    delete data.exportedAt;
    state = { ...emptyState(), ...data };
    save();
    render();
    toast('불러왔어요');
  } catch {
    toast('올바른 백업 파일이 아니에요');
  }
});

$('#reset-btn').addEventListener('click', () => {
  if (!confirm('모든 항목과 납부 기록을 삭제할까요?\n되돌릴 수 없어요.')) return;
  state = emptyState();
  save();
  render();
  toast('모두 삭제했어요');
});

/* ───────── 토스트 ───────── */
let toastTimer;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${escapeHtml(msg)}</span>${undo ? '<button type="button">실행 취소</button>' : ''}`;
  if (undo) el.querySelector('button').addEventListener('click', () => { undo(); el.classList.remove('show'); });
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 4000 : 2000);
}

/* ───────── 이벤트 ───────── */
document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-action="add"]');
  if (add) return openItemDialog();

  const tab = e.target.closest('.tab');
  if (tab) return switchView(tab.dataset.view);

  const act = e.target.closest('[data-act]');
  if (!act) return;
  const id = act.closest('[data-id]')?.dataset.id;
  if (act.dataset.act === 'toggle') togglePaid(id);
  else if (act.dataset.act === 'pay') openPayDialog(id);
  else if (act.dataset.act === 'edit') openItemDialog(id);
});

$('#prev-month').addEventListener('click', () => { viewYm = addMonths(viewYm, -1); renderMonth(); });
$('#next-month').addEventListener('click', () => { viewYm = addMonths(viewYm, 1); renderMonth(); });
$('#month-label').addEventListener('click', () => { viewYm = ymOf(new Date()); renderMonth(); });

// 앱을 다시 열었을 때 날짜가 바뀌었으면 D-day 갱신
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { state = load(); render(); }
});

/* ───────── 시작 ───────── */
fillSelectOptions();
document.body.className = 'view-month';
$('#app-version').textContent = `v${APP_VERSION}`;
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
