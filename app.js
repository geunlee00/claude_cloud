'use strict';

const APP_VERSION = '1.2.0';
const STORAGE_KEY = 'fixed-expenses:v1';

/* ───────── 데이터 ─────────
 * items:    [{ id, name, amount, cycle: 'monthly'|'yearly', month, day, category, method,
 *              start: 'YYYY-MM', end: 'YYYY-MM'|'', memo, auto, active, icon, color, createdAt }]
 * payments: { 'YYYY-MM': { [itemId]: { amount: 그 달에만 바뀐 금액 } } }
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
    return isValidState(data) ? migrate(data) : emptyState();
  } catch {
    return emptyState();
  }
}

// 예전 버전의 완료 체크 기록(paidAt)은 더 이상 쓰지 않으므로 정리
function migrate(data) {
  for (const [ym, month] of Object.entries(data.payments)) {
    for (const [id, p] of Object.entries(month)) {
      if (typeof p?.amount === 'number') month[id] = { amount: p.amount };
      else delete month[id];
    }
    if (!Object.keys(month).length) delete data.payments[ym];
  }
  return data;
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

/* ───────── 아이콘 · 색 ───────── */
const EMOJIS = ['🏠', '🏢', '💡', '💧', '🔥', '📱', '🌐', '📺', '🎬', '🎵', '▶️', '☁️', '🎮', '📚', '🚗', '🚌',
  '⛽', '🛡️', '🏥', '💊', '🏦', '💳', '💰', '📈', '🏋️', '🐶', '👶', '🎓', '☕', '📦', '🎁', '⭐'];
const COLORS = ['#3182f6', '#14b8b8', '#12b886', '#ffc342', '#ff8a3d', '#f04452', '#f45fa8', '#8b5cf6', '#8b95a1'];
const CATEGORY_PRESETS = ['주거', '통신', '구독', '보험', '대출', '공과금', '교통', '저축', '건강', '교육'];

const KEYWORD_ICONS = [
  [/넷플릭스|netflix|티빙|웨이브|왓챠|디즈니|쿠팡플레이|영화/i, '🎬', '#f04452'],
  [/유튜브|youtube/i, '▶️', '#f04452'],
  [/멜론|스포티파이|spotify|지니|벅스|애플\s?뮤직|플로|음악/i, '🎵', '#12b886'],
  [/월세|전세|관리비|집/, '🏠', '#3182f6'],
  [/휴대폰|핸드폰|폰|통신|알뜰/, '📱', '#14b8b8'],
  [/인터넷|와이파이|wifi/i, '🌐', '#14b8b8'],
  [/전기/, '💡', '#ffc342'],
  [/수도/, '💧', '#3182f6'],
  [/가스|난방/, '🔥', '#ff8a3d'],
  [/보험/, '🛡️', '#12b886'],
  [/대출|이자|할부|카드값/, '🏦', '#ff8a3d'],
  [/적금|저축|청약|투자|연금/, '💰', '#12b886'],
  [/헬스|필라테스|요가|pt|운동/i, '🏋️', '#f04452'],
  [/icloud|클라우드|구글\s?원|google\s?one|드롭박스|dropbox/i, '☁️', '#3182f6'],
  [/게임|닌텐도|플스|playstation|xbox/i, '🎮', '#8b5cf6'],
  [/주유|자동차|차량|주차/, '🚗', '#3182f6'],
  [/교통|지하철|버스|기후동행/, '🚌', '#14b8b8'],
  [/쿠팡|네이버|배민|멤버십|와우/, '📦', '#ff8a3d'],
  [/학원|강의|교육|학습|책|밀리/, '📚', '#ff8a3d'],
  [/병원|약|영양제/, '💊', '#f45fa8'],
  [/gpt|claude|제미나이|gemini|노션|notion/i, '⭐', '#8b5cf6'],
];
const CATEGORY_ICONS = {
  주거: ['🏠', '#3182f6'], 통신: ['📱', '#14b8b8'], 구독: ['📺', '#8b5cf6'], 보험: ['🛡️', '#12b886'],
  대출: ['🏦', '#ff8a3d'], 공과금: ['💡', '#ffc342'], 교통: ['🚌', '#14b8b8'], 저축: ['💰', '#12b886'],
  건강: ['🏋️', '#f04452'], 교육: ['📚', '#ff8a3d'],
};

function suggestIcon(name = '', category = '') {
  for (const [re, icon, color] of KEYWORD_ICONS) if (re.test(name)) return { icon, color };
  if (CATEGORY_ICONS[category]) return { icon: CATEGORY_ICONS[category][0], color: CATEGORY_ICONS[category][1] };
  return { icon: '💳', color: '#8b95a1' };
}

function looksOf(item) {
  const s = suggestIcon(item.name, item.category);
  return { icon: item.icon || s.icon, color: item.color || s.color };
}

function avatarHtml(item, cls = '') {
  const { icon, color } = looksOf(item);
  return `<span class="avatar ${cls}" style="--c:${color}">${icon}</span>`;
}

/* ───────── 날짜 ───────── */
const pad = (n) => String(n).padStart(2, '0');
const ymOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const parseYm = (ym) => { const [y, m] = ym.split('-').map(Number); return { y, m }; };
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

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

const daysUntil = (date) => Math.round((date - today()) / 86400000);
const dayLabel = (day) => (day >= 31 ? '말일' : `${day}일`);
const dateLabel = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;

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

// 그 달에 표시할 항목: 사용 중이면서 해당 월에 결제되는 항목
function itemsForMonth(ym) {
  return state.items
    .filter((it) => it.active && isDueIn(it, ym))
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

const icon = (name) => `<svg><use href="#i-${name}"/></svg>`;

/* ───────── 화면 ───────── */
const $ = (sel) => document.querySelector(sel);

let viewYm = ymOf(new Date());
let selectedDay = null;

function render() {
  renderMonth();
  renderItems();
  renderSettings();
}

const monthTotal = (ym) => itemsForMonth(ym).reduce((s, it) => s + amountFor(it, ym), 0);

// 이번 달이면 오늘 이후(오늘 포함) 결제, 미래 달이면 전부, 지난 달이면 없음
function isUpcoming(item, ym) {
  const nowYm = ymOf(new Date());
  if (ym !== nowYm) return ym > nowYm;
  return daysUntil(dueDate(item, ym)) >= 0;
}

function badgeFor(item, ym) {
  if (ym !== ymOf(new Date())) return '';
  const diff = daysUntil(dueDate(item, ym));
  if (diff === 0) return '<span class="badge blue">오늘</span>';
  if (diff === 1) return '<span class="badge orange">내일</span>';
  if (diff > 1 && diff <= 3) return `<span class="badge orange">D-${diff}</span>`;
  return '';
}

function monthRow(item, ym) {
  const p = paymentOf(ym, item.id);
  const changed = p && typeof p.amount === 'number' && p.amount !== item.amount;
  const sub = [item.method, item.auto && '자동이체', item.cycle === 'yearly' && '연 1회'].filter(Boolean).map(escapeHtml).join(' · ');
  const due = dueDate(item, ym);
  const past = !isUpcoming(item, ym) && ym === ymOf(new Date());

  return `
    <li class="row ${past ? 'past' : ''}" data-id="${item.id}" data-act="amount">
      ${avatarHtml(item)}
      <div class="row-text">
        <div class="row-title"><span class="t">${escapeHtml(item.name)}</span></div>
        <div class="row-sub">${badgeFor(item, ym)}<span>${sub || escapeHtml(item.category) || '&nbsp;'}</span></div>
      </div>
      <div class="row-right">
        <div class="row-amount ${changed ? 'changed' : ''}">${won(amountFor(item, ym))}</div>
        <div class="row-meta">${due.getMonth() + 1}/${due.getDate()} (${WEEKDAYS[due.getDay()]})</div>
      </div>
    </li>`;
}

function groupHtml(title, items, ym) {
  const sum = items.reduce((s, it) => s + amountFor(it, ym), 0);
  return `
    <section class="group">
      <div class="group-head"><h3>${title}</h3><span>${won(sum)}</span></div>
      <ul class="list">${items.map((it) => monthRow(it, ym)).join('')}</ul>
    </section>`;
}

function renderMonth() {
  const { y, m } = parseYm(viewYm);
  const nowYm = ymOf(new Date());
  const isNow = viewYm === nowYm;
  $('#month-label').innerHTML = `${m}월<small>${y}</small>`;
  $('#hero-label').textContent = isNow ? '이번 달 고정지출' : `${m}월 고정지출`;

  const items = itemsForMonth(viewYm);
  const total = items.reduce((s, it) => s + amountFor(it, viewYm), 0);
  const upcoming = items.filter((it) => isUpcoming(it, viewYm));
  const past = items.filter((it) => !upcoming.includes(it));
  const upcomingSum = upcoming.reduce((s, it) => s + amountFor(it, viewYm), 0);

  // 요약
  $('#sum-total').textContent = won(total);
  const prevTotal = monthTotal(addMonths(viewYm, -1));
  const diff = total - prevTotal;
  let compare = '';
  if (items.length && prevTotal) {
    compare = diff === 0
      ? '<span class="pill">지난달과 같아요</span>'
      : `<span class="pill ${diff > 0 ? 'up' : 'down'}">지난달보다 ${won(Math.abs(diff))} ${diff > 0 ? '많아요' : '적어요'}</span>`;
  }
  const info = !items.length ? '등록된 고정지출이 없어요'
    : isNow ? `${items.length}건 · 남은 결제 ${won(upcomingSum)}`
    : `${items.length}건`;
  $('#hero-sub').innerHTML = `<span>${info}</span>${compare}`;

  // 다음 결제 (이번 달·미래 달만)
  const next = $('#next-pay');
  const it = upcoming[0];
  next.hidden = !it;
  if (it) {
    const due = dueDate(it, viewYm);
    const d = daysUntil(due);
    const label = !isNow ? `첫 결제 · ${dateLabel(due)}`
      : d === 0 ? '오늘 결제'
      : `다음 결제 · ${d === 1 ? '내일' : `${d}일 후`} (${due.getMonth() + 1}/${due.getDate()})`;
    next.dataset.id = it.id;
    next.innerHTML = `
      ${avatarHtml(it)}
      <span class="np-text"><span class="np-label">${label}</span><span class="np-name">${escapeHtml(it.name)}</span></span>
      <span class="np-amount">${won(amountFor(it, viewYm))}</span>
      <svg class="chev"><use href="#i-right"/></svg>`;
  }

  renderCalendar(items);
  $('#view-month .hero').hidden = !state.items.length;
  $('.calendar').hidden = !items.length;

  // 날짜 필터
  if (selectedDay && !items.some((x) => dueDate(x, viewYm).getDate() === selectedDay)) selectedDay = null;
  const filtered = selectedDay ? items.filter((x) => dueDate(x, viewYm).getDate() === selectedDay) : null;
  const chip = $('#day-filter');
  chip.hidden = !filtered;
  if (filtered) {
    chip.innerHTML = `<span>${m}월 ${selectedDay}일 결제 ${filtered.length}건 · ${won(filtered.reduce((s, x) => s + amountFor(x, viewYm), 0))}</span>
      <button data-act="clear-day" aria-label="필터 해제">${icon('x')}</button>`;
  }

  // 목록
  let html = '';
  if (filtered) {
    html = `<ul class="list" style="margin-top:12px">${filtered.map((x) => monthRow(x, viewYm)).join('')}</ul>`;
  } else if (isNow) {
    if (upcoming.length) html += groupHtml(`다가오는 결제 ${upcoming.length}건`, upcoming, viewYm);
    if (past.length) html += groupHtml(`지난 결제 ${past.length}건`, past, viewYm);
  } else if (items.length) {
    html = groupHtml(`결제 ${items.length}건`, items, viewYm);
  }
  $('#month-groups').innerHTML = html;
  $('#month-empty').hidden = items.length > 0;
}

function renderCalendar(items) {
  const { y, m } = parseYm(viewYm);
  const first = new Date(y, m - 1, 1).getDay();
  const days = daysInMonth(y, m);
  const t = today();
  const nowYm = ymOf(t);

  const byDay = new Map();
  for (const it of items) {
    const d = dueDate(it, viewYm).getDate();
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(it);
  }

  let html = '<span class="cal-day blank"></span>'.repeat(first);
  for (let d = 1; d <= days; d++) {
    const dow = (first + d - 1) % 7;
    const list = byDay.get(d) || [];
    const isToday = viewYm === nowYm && d === t.getDate();
    const isPast = viewYm < nowYm || (viewYm === nowYm && d < t.getDate());
    const dots = list.slice(0, 3).map((it) => `<i class="dot" style="background:${looksOf(it).color}"></i>`).join('');
    const cls = ['cal-day', dow === 0 && 'sun', dow === 6 && 'sat', isToday && 'today', isPast && 'past',
      list.length && 'has', selectedDay === d && 'selected'].filter(Boolean).join(' ');
    html += list.length
      ? `<button class="${cls}" data-act="day" data-day="${d}" aria-label="${m}월 ${d}일 결제 ${list.length}건"><span class="num">${d}</span><span class="dots">${dots}</span></button>`
      : `<span class="${cls}"><span class="num">${d}</span></span>`;
  }
  $('#cal-grid').innerHTML = html;
}

function itemRow(it, nowYm) {
  const ended = it.end && it.end < nowYm;
  const schedule = it.cycle === 'yearly' ? `매년 ${it.month}월 ${dayLabel(it.day)}` : `매월 ${dayLabel(it.day)}`;
  const sub = [schedule, it.method].filter(Boolean).map(escapeHtml).join(' · ');
  let meta = '';
  if (!it.active) meta = '사용 안 함';
  else if (ended) meta = `${it.end.replace('-', '.')} 종료`;
  else if (it.start && it.start > nowYm) meta = `${it.start.replace('-', '.')}부터`;
  else if (it.cycle === 'yearly') meta = `월 ${won(it.amount / 12)}`;
  else if (it.end) meta = `~${it.end.replace('-', '.')}`;
  return `
    <li class="row ${!it.active || ended ? 'off' : ''}" data-id="${it.id}" data-act="edit">
      ${avatarHtml(it)}
      <div class="row-text">
        <div class="row-title"><span class="t">${escapeHtml(it.name)}</span></div>
        <div class="row-sub"><span>${sub}</span></div>
      </div>
      <div class="row-right">
        <div class="row-amount">${won(it.amount)}</div>
        ${meta ? `<div class="row-meta">${meta}</div>` : ''}
      </div>
    </li>`;
}

function renderItems() {
  const nowYm = ymOf(new Date());
  const current = state.items.filter((it) => it.active && isInRange(it, nowYm));
  const avg = current.reduce((s, it) => s + monthlyEquivalent(it), 0);
  $('#avg-monthly').textContent = won(avg);
  $('#sum-yearly').textContent = current.length ? `1년이면 ${won(avg * 12)} · ${current.length}개 항목` : '사용 중인 항목이 없어요';

  // 분류별 (월 환산)
  const byCat = new Map();
  for (const it of current) {
    const k = it.category || '미분류';
    byCat.set(k, (byCat.get(k) || 0) + monthlyEquivalent(it));
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const colorOf = (i) => COLORS[i % COLORS.length];
  $('#stack-bar').innerHTML = cats.map(([, v], i) => `<i style="flex:${v};background:${colorOf(i)}"></i>`).join('');
  $('#legend').innerHTML = cats.map(([name, v], i) => `
    <div><span class="sw" style="background:${colorOf(i)}"></span><span class="nm">${escapeHtml(name)}</span>
    <span class="pc">${Math.round((v / avg) * 100)}%</span></div>`).join('');

  const sorter = (a, b) => a.day - b.day || a.name.localeCompare(b.name, 'ko');
  const on = state.items.filter((it) => it.active && !(it.end && it.end < nowYm)).sort(sorter);
  const off = state.items.filter((it) => !on.includes(it)).sort(sorter);

  let html = '';
  if (on.length) html += `<section class="group"><div class="group-head"><h3>사용 중 ${on.length}개</h3></div><ul class="list">${on.map((it) => itemRow(it, nowYm)).join('')}</ul></section>`;
  if (off.length) html += `<section class="group"><div class="group-head"><h3>종료 · 사용 안 함 ${off.length}개</h3></div><ul class="list">${off.map((it) => itemRow(it, nowYm)).join('')}</ul></section>`;
  $('#item-groups').innerHTML = html;
  $('#items-hero').hidden = !state.items.length;
  $('#items-empty').hidden = state.items.length > 0;
}

// 큰 금액을 좁은 칸에 맞게 줄여 표시 (예: 1,801,300 → 180만)
function shortWon(n) {
  n = Math.round(n);
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}억`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
  return n.toLocaleString('ko-KR');
}

function renderSettings() {
  const nowYm = ymOf(new Date());
  const avg = state.items.filter((it) => it.active && isInRange(it, nowYm)).reduce((s, it) => s + monthlyEquivalent(it), 0);
  $('#stats').innerHTML = `
    <div><b>${state.items.filter((it) => it.active).length}</b><span>사용 중 항목</span></div>
    <div><b>${shortWon(monthTotal(nowYm))}</b><span>이번 달</span></div>
    <div><b>${shortWon(avg * 12)}</b><span>1년 합계</span></div>`;
}

function switchView(view) {
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${view}`));
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  document.body.className = `view-${view}`;
  window.scrollTo(0, 0);
}

/* ───────── 이번 달만 바뀐 금액 ───────── */
function setMonthAmount(ym, id, amount) {
  const item = state.items.find((it) => it.id === id);
  const month = (state.payments[ym] ||= {});
  if (amount == null || amount === item.amount) delete month[id];
  else month[id] = { amount };
  if (!Object.keys(month).length) delete state.payments[ym];
}

/* ───────── 바텀 시트 공통 ───────── */
function openSheet(dlg) {
  dlg.showModal();
  dlg.scrollTop = 0;
}

document.querySelectorAll('dialog').forEach((dlg) => {
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
});

/* ───────── 항목 추가/수정 ───────── */
const itemDialog = $('#item-dialog');
const itemForm = $('#item-form');
let editingId = null;
let pickedIcon = null; // 사용자가 직접 고른 아이콘/색 (없으면 이름·분류로 자동 추천)
let pickedColor = null;

function fillSelectOptions() {
  itemForm.month.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('');
  itemForm.day.innerHTML = Array.from({ length: 31 }, (_, i) =>
    `<option value="${i + 1}">${i + 1 === 31 ? '말일' : `${i + 1}일`}</option>`).join('');
}

function syncCycleUI() {
  $('#month-field').hidden = itemForm.cycle.value !== 'yearly';
}

function currentLooks() {
  const s = suggestIcon(itemForm.name.value, itemForm.category.value.trim());
  return { icon: pickedIcon || s.icon, color: pickedColor || s.color };
}

function syncIconUI() {
  const { icon: ic, color } = currentLooks();
  const btn = $('#icon-toggle');
  btn.textContent = ic;
  btn.style.setProperty('--c', color);
  $('#emoji-grid').innerHTML = EMOJIS.map((e) => `<button type="button" class="${e === ic ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('');
  $('#color-row').innerHTML = COLORS.map((c) => `<button type="button" class="${c === color ? 'on' : ''}" style="--c:${c}" data-color="${c}" aria-label="색 ${c}"></button>`).join('');
}

function chipsHtml(values, current) {
  return values.map((v) => `<button type="button" class="chip ${v === current ? 'on' : ''}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
}

function syncChips() {
  const uniq = (key) => [...new Set(state.items.map((it) => it[key]).filter(Boolean))];
  const cats = [...new Set([...uniq('category'), ...CATEGORY_PRESETS])];
  $('#category-chips').innerHTML = chipsHtml(cats, itemForm.category.value.trim());
  $('#method-chips').innerHTML = chipsHtml(uniq('method'), itemForm.method.value.trim());
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
  pickedIcon = it?.icon ?? null;
  pickedColor = it?.color ?? null;
  $('#icon-picker').hidden = true;
  syncCycleUI();
  syncIconUI();
  syncChips();

  openSheet(itemDialog);
  if (!it) setTimeout(() => itemForm.name.focus(), 350);
}

itemForm.amount.addEventListener('input', (e) => { e.target.value = formatNumberInput(e.target.value); });
itemForm.querySelectorAll('input[name="cycle"]').forEach((el) => el.addEventListener('change', syncCycleUI));
itemForm.name.addEventListener('input', syncIconUI);
itemForm.category.addEventListener('input', () => { syncIconUI(); syncChips(); });
itemForm.method.addEventListener('input', syncChips);

$('#icon-toggle').addEventListener('click', () => { $('#icon-picker').hidden = !$('#icon-picker').hidden; });
$('#emoji-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-emoji]');
  if (b) { pickedIcon = b.dataset.emoji; syncIconUI(); }
});
$('#color-row').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (b) { pickedColor = b.dataset.color; syncIconUI(); }
});
$('#category-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-value]');
  if (!b) return;
  itemForm.category.value = itemForm.category.value === b.dataset.value ? '' : b.dataset.value;
  syncChips();
  syncIconUI();
});
$('#method-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-value]');
  if (!b) return;
  itemForm.method.value = itemForm.method.value === b.dataset.value ? '' : b.dataset.value;
  syncChips();
});

itemForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = itemForm.name.value.trim();
  const amount = Number(digitsOnly(itemForm.amount.value));
  if (!name) { toast('이름을 입력해 주세요'); return itemForm.name.focus(); }
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
    icon: pickedIcon || '',
    color: pickedColor || '',
  };

  if (editingId) {
    Object.assign(state.items.find((x) => x.id === editingId), data);
  } else {
    state.items.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
  }
  save();
  itemDialog.close();
  render();
  toast(editingId ? '수정했어요' : `${name} 추가했어요`);
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

/* ───────── 이번 달 금액 시트 ───────── */
const payDialog = $('#pay-dialog');
const payForm = $('#pay-form');
let payingId = null;

function syncPayHint() {
  const it = state.items.find((x) => x.id === payingId);
  if (!it) return;
  const typed = Number(digitsOnly(payForm.amount.value));
  $('#pay-hint').innerHTML = `<span>기본 금액 ${won(it.amount)}</span>` +
    (payForm.amount.value && typed !== it.amount ? '<button type="button" data-act="reset-amount">기본 금액으로</button>' : '');
}

function openPayDialog(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  payingId = id;
  const { m } = parseYm(viewYm);
  const due = dueDate(it, viewYm);
  const { icon: ic, color } = looksOf(it);
  const av = $('#pay-avatar');
  av.textContent = ic;
  av.style.setProperty('--c', color);
  $('#pay-title').textContent = it.name;
  $('#pay-desc').textContent = [dateLabel(due), it.method, it.auto && '자동이체'].filter(Boolean).join(' · ');
  $('#pay-amount-label').textContent = `${m}월 금액`;
  payForm.amount.value = formatNumberInput(amountFor(it, viewYm));
  const memo = $('#pay-memo');
  memo.hidden = !it.memo;
  memo.textContent = it.memo ? `📝 ${it.memo}` : '';
  syncPayHint();
  openSheet(payDialog);
}

payForm.amount.addEventListener('input', (e) => { e.target.value = formatNumberInput(e.target.value); syncPayHint(); });

payForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const it = state.items.find((x) => x.id === payingId);
  if (!it) return payDialog.close();
  const before = amountFor(it, viewYm);
  const typed = payForm.amount.value ? Number(digitsOnly(payForm.amount.value)) : null;
  setMonthAmount(viewYm, payingId, typed);
  save();
  payDialog.close();
  render();
  if (amountFor(it, viewYm) !== before) toast(`${parseYm(viewYm).m}월 ${it.name} 금액을 바꿨어요`);
});

$('#pay-hint').addEventListener('click', (e) => {
  if (!e.target.closest('[data-act="reset-amount"]')) return;
  const it = state.items.find((x) => x.id === payingId);
  payForm.amount.value = formatNumberInput(it.amount);
  syncPayHint();
});

$('#pay-edit-item').addEventListener('click', () => {
  payDialog.close();
  openItemDialog(payingId);
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
    state = migrate({ ...emptyState(), ...data });
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
  el.innerHTML = `<span>${escapeHtml(msg)}</span>${undo ? '<button type="button">되돌리기</button>' : ''}`;
  if (undo) el.querySelector('button').addEventListener('click', () => { undo(); el.classList.remove('show'); });
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 4000 : 2000);
}

/* ───────── 이벤트 ───────── */
document.addEventListener('click', (e) => {
  if (e.target.closest('dialog')) return;

  if (e.target.closest('[data-action="add"]')) return openItemDialog();

  const tab = e.target.closest('.tab');
  if (tab) return switchView(tab.dataset.view);

  const next = e.target.closest('#next-pay');
  if (next) return openPayDialog(next.dataset.id);

  const act = e.target.closest('[data-act]');
  if (!act) return;
  const id = act.closest('[data-id]')?.dataset.id;
  switch (act.dataset.act) {
    case 'amount': openPayDialog(id); break;
    case 'edit': openItemDialog(id); break;
    case 'day': {
      const d = Number(act.dataset.day);
      selectedDay = selectedDay === d ? null : d;
      renderMonth();
      break;
    }
    case 'clear-day': selectedDay = null; renderMonth(); break;
  }
});

function goMonth(ym) {
  viewYm = ym;
  selectedDay = null;
  renderMonth();
}

$('#prev-month').addEventListener('click', () => goMonth(addMonths(viewYm, -1)));
$('#next-month').addEventListener('click', () => goMonth(addMonths(viewYm, 1)));
$('#month-label').addEventListener('click', () => goMonth(ymOf(new Date())));

// 앱을 다시 열었을 때 날짜가 바뀌었으면 D-day 갱신
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) { state = load(); render(); }
});

/* ───────── 시작 ───────── */
fillSelectOptions();
$('#app-version').textContent = `고정지출 체크 v${APP_VERSION}`;
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
