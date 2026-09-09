'use strict';

/* ==========================================================================
   Data layer
   ========================================================================== */

const STORAGE_KEY = 'habitTrackerData';
const HABIT_COLORS = ['teal', 'blue', 'green', 'amber', 'pink'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function defaultData() {
  return {
    habits: [
      { id: 'h1', name: 'Wake Up Early', color: 'teal' },
      { id: 'h2', name: 'Drink Water', color: 'blue' },
      { id: 'h3', name: 'Study', color: 'green' },
      { id: 'h4', name: 'Coding', color: 'amber' },
      { id: 'h5', name: 'Exercise', color: 'pink' },
      { id: 'h6', name: 'Read', color: 'teal' },
      { id: 'h7', name: 'Sleep Early', color: 'blue' }
    ],
    months: {},
    theme: 'light'
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.habits) && typeof parsed.months === 'object') {
        return parsed;
      }
    }
  } catch (e) { /* fall through to defaults */ }
  return defaultData();
}

let data = loadData();
let viewYear, viewMonth; // month is 0-indexed
let savedTimeout = null;
let modalConfirmHandler = null;

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable / full — fail silently */ }
  pulseSaved();
}

/* ==========================================================================
   Date helpers
   ========================================================================== */

function monthKey(year, month0) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

function daysInMonth(year, month0) {
  return new Date(year, month0 + 1, 0).getDate();
}

function isFutureDay(year, month0, day) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cell = new Date(year, month0, day); cell.setHours(0, 0, 0, 0);
  return cell.getTime() > today.getTime();
}

function isTodayCell(year, month0, day) {
  const t = new Date();
  return year === t.getFullYear() && month0 === t.getMonth() && day === t.getDate();
}

function isDayCompleted(habitId, year, month0, day) {
  const mk = monthKey(year, month0);
  return !!(data.months[mk] && data.months[mk][habitId] && data.months[mk][habitId][day]);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ==========================================================================
   Calculations
   ========================================================================== */

function getMonthTotals(year, month0) {
  const total = daysInMonth(year, month0);
  const mk = monthKey(year, month0);
  const monthData = data.months[mk] || {};
  let completed = 0, countable = 0;
  data.habits.forEach(h => {
    const hd = monthData[h.id] || {};
    for (let d = 1; d <= total; d++) {
      if (isFutureDay(year, month0, d)) continue;
      countable++;
      if (hd[d]) completed++;
    }
  });
  return { completed, countable };
}

function getHabitMonthPct(habitId, year, month0) {
  const total = daysInMonth(year, month0);
  const mk = monthKey(year, month0);
  const hd = (data.months[mk] && data.months[mk][habitId]) || {};
  let completed = 0, countable = 0;
  for (let d = 1; d <= total; d++) {
    if (isFutureDay(year, month0, d)) continue;
    countable++;
    if (hd[d]) completed++;
  }
  return countable > 0 ? Math.round((completed / countable) * 100) : 0;
}

function getHabitStreak(habitId) {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  if (!isDayCompleted(habitId, cursor.getFullYear(), cursor.getMonth(), cursor.getDate())) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let safety = 0;
  while (isDayCompleted(habitId, cursor.getFullYear(), cursor.getMonth(), cursor.getDate()) && safety < 3650) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
    safety++;
  }
  return streak;
}

function getBestStreak() {
  if (data.habits.length === 0) return 0;
  return Math.max(...data.habits.map(h => getHabitStreak(h.id)));
}

function getWeekChunks(year, month0) {
  const total = daysInMonth(year, month0);
  const weeks = [];
  for (let start = 1; start <= total; start += 7) {
    weeks.push({ start, end: Math.min(start + 6, total) });
  }
  return weeks;
}

/* ==========================================================================
   Rendering — nav
   ========================================================================== */

function populateSelects() {
  monthSelect.innerHTML = MONTH_NAMES.map((m, i) => `<option value="${i}">${m}</option>`).join('');
  const nowYear = new Date().getFullYear();
  const years = [];
  for (let y = nowYear - 4; y <= nowYear + 4; y++) years.push(y);
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
}

function syncNavSelects() {
  monthSelect.value = String(viewMonth);
  yearSelect.value = String(viewYear);
}

function changeMonth(delta) {
  let m = viewMonth + delta;
  let y = viewYear;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  viewMonth = m; viewYear = y;
  syncNavSelects();
  animateMonthChange();
  render();
}

function animateMonthChange() {
  trackerCard.classList.remove('month-anim');
  void trackerCard.offsetWidth; // restart animation
  trackerCard.classList.add('month-anim');
}

/* ==========================================================================
   Rendering — tracker head
   ========================================================================== */

function renderTrackerHead() {
  const total = daysInMonth(viewYear, viewMonth);
  const weeks = getWeekChunks(viewYear, viewMonth);

  let weekRowHtml = `<th class="corner-cell" rowspan="2">Habit</th>`;
  weeks.forEach((w, i) => {
    weekRowHtml += `<th class="week-group-cell week-${i % 5}" colspan="${w.end - w.start + 1}">Week ${i + 1}</th>`;
  });
  weekRowHtml += `<th class="progress-corner-cell" rowspan="2">Progress</th>`;

  let dateRowHtml = '';
  for (let d = 1; d <= total; d++) {
    const dow = new Date(viewYear, viewMonth, d).getDay();
    const weekend = dow === 0 || dow === 6;
    const today = isTodayCell(viewYear, viewMonth, d);
    const future = isFutureDay(viewYear, viewMonth, d);
    const weekStart = (d - 1) % 7 === 0;
    dateRowHtml += `<th class="date-cell${weekend ? ' weekend' : ''}${today ? ' is-today' : ''}${future ? ' is-future' : ''}${weekStart ? ' week-start' : ''}">
        <span class="date-num">${d}</span>
        <span class="date-dow">${DOW_LABELS[dow]}</span>
      </th>`;
  }

  trackerHead.innerHTML = `<tr class="week-row">${weekRowHtml}</tr><tr class="date-row">${dateRowHtml}</tr>`;
}

/* ==========================================================================
   Rendering — tracker body
   ========================================================================== */

function renderTrackerBody() {
  const total = daysInMonth(viewYear, viewMonth);
  const mk = monthKey(viewYear, viewMonth);
  const monthData = data.months[mk] || {};

  if (data.habits.length === 0) {
    trackerBody.innerHTML = `<tr><td class="empty-state-cell" colspan="${total + 2}">
        <div class="empty-state">
          <p>No habits yet</p>
          <p class="empty-state-sub">Add your first habit to start tracking.</p>
        </div>
      </td></tr>`;
    return;
  }

  trackerBody.innerHTML = data.habits.map(habit => {
    const hd = monthData[habit.id] || {};
    let completed = 0, countable = 0;
    let cells = '';

    for (let d = 1; d <= total; d++) {
      const future = isFutureDay(viewYear, viewMonth, d);
      const done = !!hd[d];
      if (!future) { countable++; if (done) completed++; }

      const dow = new Date(viewYear, viewMonth, d).getDay();
      const weekend = dow === 0 || dow === 6;
      const today = isTodayCell(viewYear, viewMonth, d);
      const weekStart = (d - 1) % 7 === 0;
      const monthAbbrev = MONTH_NAMES[viewMonth].slice(0, 3);

      cells += `<td class="day-cell habit-color-${habit.color}${done ? ' completed' : ''}${future ? ' is-future' : ''}${today ? ' is-today' : ''}${weekend ? ' weekend' : ''}${weekStart ? ' week-start' : ''}"
          data-habit="${habit.id}" data-day="${d}"
          ${future ? '' : `role="button" tabindex="0" data-tooltip="${escapeHtml(habit.name)}, ${monthAbbrev} ${d}"`}>
          <span class="check-icon">✓</span>
        </td>`;
    }

    const pct = countable > 0 ? Math.round((completed / countable) * 100) : 0;

    return `<tr data-habit-row="${habit.id}">
        <td class="habit-name-cell">
          <span class="habit-swatch habit-color-${habit.color}"></span>
          <span class="habit-name" title="${escapeHtml(habit.name)}">${escapeHtml(habit.name)}</span>
          <span class="habit-row-actions">
            <button class="habit-icon-btn rename-btn" data-habit="${habit.id}" aria-label="Rename ${escapeHtml(habit.name)}">✎</button>
            <button class="habit-icon-btn delete-btn" data-habit="${habit.id}" aria-label="Delete ${escapeHtml(habit.name)}">🗑</button>
          </span>
        </td>
        ${cells}
        <td class="progress-cell habit-color-${habit.color}">
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span class="progress-pct">${pct}%</span>
        </td>
      </tr>`;
  }).join('');

  trackerBody.querySelectorAll('.day-cell:not(.is-future)').forEach(cell => {
    cell.addEventListener('click', onCellClick);
    cell.addEventListener('keydown', onCellKeydown);
  });
  trackerBody.querySelectorAll('.rename-btn').forEach(btn => btn.addEventListener('click', onRenameClick));
  trackerBody.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', onDeleteClick));
}

function onCellKeydown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onCellClick.call(this);
  }
}

function onCellClick() {
  const cell = this;
  const habitId = cell.dataset.habit;
  const day = cell.dataset.day;
  const mk = monthKey(viewYear, viewMonth);

  if (!data.months[mk]) data.months[mk] = {};
  if (!data.months[mk][habitId]) data.months[mk][habitId] = {};

  const newState = !data.months[mk][habitId][day];
  data.months[mk][habitId][day] = newState;

  cell.classList.toggle('completed', newState);
  cell.classList.remove('pop');
  void cell.offsetWidth;
  cell.classList.add('pop');

  updateHabitRowProgress(habitId);
  saveData();
  renderStats();
  renderAnalytics();
}

function updateHabitRowProgress(habitId) {
  const row = trackerBody.querySelector(`tr[data-habit-row="${habitId}"]`);
  if (!row) return;
  const pct = getHabitMonthPct(habitId, viewYear, viewMonth);
  const fill = row.querySelector('.progress-fill');
  const label = row.querySelector('.progress-pct');
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `${pct}%`;
}

/* ==========================================================================
   Rendering — stats strip
   ========================================================================== */

function renderStats() {
  const t = new Date();
  const totalHabits = data.habits.length;

  let todayCompleted = 0;
  data.habits.forEach(h => { if (isDayCompleted(h.id, t.getFullYear(), t.getMonth(), t.getDate())) todayCompleted++; });
  const todayPct = totalHabits > 0 ? Math.round((todayCompleted / totalHabits) * 100) : 0;

  const { completed: monthCompleted, countable: monthCountable } = getMonthTotals(viewYear, viewMonth);
  const monthPct = monthCountable > 0 ? Math.round((monthCompleted / monthCountable) * 100) : 0;

  statToday.textContent = `${todayPct}%`;
  statMonth.textContent = `${monthPct}%`;
  statStreak.textContent = `${getBestStreak()}`;
  statTotal.textContent = `${monthCompleted}`;
}

/* ==========================================================================
   Rendering — analytics
   ========================================================================== */

function setDonut(circleEl, pct) {
  const r = 52;
  const c = 2 * Math.PI * r;
  circleEl.style.strokeDasharray = `${c}`;
  circleEl.style.strokeDashoffset = `${c * (1 - pct / 100)}`;
}

function renderAnalytics() {
  const t = new Date();
  const totalHabits = data.habits.length;

  let todayCompleted = 0;
  data.habits.forEach(h => { if (isDayCompleted(h.id, t.getFullYear(), t.getMonth(), t.getDate())) todayCompleted++; });
  const todayPct = totalHabits > 0 ? Math.round((todayCompleted / totalHabits) * 100) : 0;
  setDonut(todayDonutFill, todayPct);
  todayDonutValue.textContent = `${todayPct}%`;
  todaySub.textContent = `${todayCompleted} of ${totalHabits} habit${totalHabits === 1 ? '' : 's'}`;

  const { completed: monthCompleted, countable: monthCountable } = getMonthTotals(viewYear, viewMonth);
  const monthPct = monthCountable > 0 ? Math.round((monthCompleted / monthCountable) * 100) : 0;
  setDonut(monthDonutFill, monthPct);
  monthDonutValue.textContent = `${monthPct}%`;
  monthSub.textContent = `${monthCompleted} completion${monthCompleted === 1 ? '' : 's'}`;

  renderWeeklyBars();
  renderBestHabit();

  const bestStreak = getBestStreak();
  streakNumber.textContent = bestStreak;
  streakSub.textContent = bestStreak > 0 ? 'Keep it going' : 'Start today';
}

function renderWeeklyBars() {
  const weeks = getWeekChunks(viewYear, viewMonth);
  const mk = monthKey(viewYear, viewMonth);
  const monthData = data.months[mk] || {};
  const habits = data.habits;

  if (habits.length === 0) {
    weeklyBars.innerHTML = `<p class="empty-inline">Add a habit to see weekly progress.</p>`;
    return;
  }

  const html = weeks.map((w, i) => {
    let completed = 0, countable = 0;
    for (let d = w.start; d <= w.end; d++) {
      if (isFutureDay(viewYear, viewMonth, d)) continue;
      habits.forEach(h => {
        countable++;
        const hd = monthData[h.id] || {};
        if (hd[d]) completed++;
      });
    }
    const pct = countable > 0 ? Math.round((completed / countable) * 100) : 0;
    return `<div class="week-bar-item">
        <div class="week-bar-track"><div class="week-bar-fill week-${i % 5}" style="height:${pct}%"></div></div>
        <span class="week-bar-pct">${pct}%</span>
        <span class="week-bar-label">W${i + 1}</span>
      </div>`;
  }).join('');

  weeklyBars.innerHTML = html;
}

function renderBestHabit() {
  if (data.habits.length === 0) {
    bestHabitName.textContent = '—';
    bestHabitPct.textContent = '0%';
    bestHabitBarFill.style.width = '0%';
    bestHabitBarFill.className = 'best-habit-bar-fill';
    return;
  }

  let best = null;
  data.habits.forEach(h => {
    const pct = getHabitMonthPct(h.id, viewYear, viewMonth);
    if (!best || pct > best.pct) best = { habit: h, pct };
  });

  bestHabitName.textContent = best.habit.name;
  bestHabitPct.textContent = `${best.pct}%`;
  bestHabitBarFill.style.width = `${best.pct}%`;
  bestHabitBarFill.className = `best-habit-bar-fill habit-color-${best.habit.color}`;
}

/* ==========================================================================
   Habit management — add / rename / delete
   ========================================================================== */

function nextHabitColor() {
  return HABIT_COLORS[data.habits.length % HABIT_COLORS.length];
}

function generateHabitId() {
  return 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function onAddHabitClick() {
  openModal({
    title: 'Add habit',
    showInput: true,
    inputValue: '',
    placeholder: 'e.g. Morning walk',
    confirmText: 'Add habit',
    onConfirm: (val) => {
      if (!val) { showToast('Please enter a habit name.'); return; }
      data.habits.push({ id: generateHabitId(), name: val, color: nextHabitColor() });
      saveData();
      renderTrackerBody();
      renderStats();
      renderAnalytics();
      showToast('Habit added ✓');
    }
  });
}

function onRenameClick(e) {
  e.stopPropagation();
  const habitId = this.dataset.habit;
  const habit = data.habits.find(h => h.id === habitId);
  if (!habit) return;

  openModal({
    title: 'Rename habit',
    showInput: true,
    inputValue: habit.name,
    placeholder: 'Habit name',
    confirmText: 'Save',
    onConfirm: (val) => {
      if (!val) { showToast("Habit name can't be empty."); return; }
      habit.name = val;
      saveData();
      renderTrackerBody();
      renderAnalytics();
      showToast('Habit renamed ✓');
    }
  });
}

function onDeleteClick(e) {
  e.stopPropagation();
  const habitId = this.dataset.habit;
  const habit = data.habits.find(h => h.id === habitId);
  if (!habit) return;

  openModal({
    title: 'Delete habit',
    message: `Delete "${habit.name}"? This removes all of its tracked history and can't be undone.`,
    confirmText: 'Delete',
    danger: true,
    onConfirm: () => {
      data.habits = data.habits.filter(h => h.id !== habitId);
      Object.keys(data.months).forEach(mk => { delete data.months[mk][habitId]; });
      saveData();
      renderTrackerBody();
      renderStats();
      renderAnalytics();
      showToast('Habit deleted');
    }
  });
}

/* ==========================================================================
   Modal
   ========================================================================== */

function openModal({ title, message = '', showInput = false, inputValue = '', placeholder = '', confirmText = 'Confirm', danger = false, onConfirm }) {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalInput.style.display = showInput ? 'block' : 'none';
  modalInput.value = inputValue;
  modalInput.placeholder = placeholder;
  modalConfirmBtn.textContent = confirmText;
  modalConfirmBtn.classList.toggle('modal-btn-danger', danger);
  modalConfirmHandler = onConfirm;

  modalOverlay.classList.add('open');
  if (showInput) {
    setTimeout(() => { modalInput.focus(); modalInput.select(); }, 60);
  }
}

function closeModal() {
  modalOverlay.classList.remove('open');
  modalConfirmHandler = null;
}

function confirmModal() {
  if (modalConfirmHandler) {
    const val = modalInput.style.display !== 'none' ? modalInput.value.trim() : null;
    modalConfirmHandler(val);
  }
  closeModal();
}

/* ==========================================================================
   Toasts
   ========================================================================== */

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2400);
}

/* ==========================================================================
   Saved status
   ========================================================================== */

function pulseSaved() {
  savedStatus.classList.remove('pulse');
  void savedStatus.offsetWidth;
  savedStatus.classList.add('pulse');
  clearTimeout(savedTimeout);
  savedTimeout = setTimeout(() => savedStatus.classList.remove('pulse'), 700);
}

/* ==========================================================================
   Theme
   ========================================================================== */

function applyTheme() {
  document.documentElement.classList.toggle('dark', data.theme === 'dark');
}

function toggleTheme() {
  data.theme = data.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveData();
}

/* ==========================================================================
   Full render
   ========================================================================== */

function render() {
  renderTrackerHead();
  renderTrackerBody();
  renderStats();
  renderAnalytics();
}

/* ==========================================================================
   DOM refs
   ========================================================================== */

const trackerCard = document.getElementById('trackerCard');
const trackerHead = document.getElementById('trackerHead');
const trackerBody = document.getElementById('trackerBody');

const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const todayBtn = document.getElementById('todayBtn');
const monthSelect = document.getElementById('monthSelect');
const yearSelect = document.getElementById('yearSelect');

const statToday = document.getElementById('statToday');
const statMonth = document.getElementById('statMonth');
const statStreak = document.getElementById('statStreak');
const statTotal = document.getElementById('statTotal');

const savedStatus = document.getElementById('savedStatus');
const themeToggle = document.getElementById('themeToggle');

const addHabitBtn = document.getElementById('addHabitBtn');

const todayDonutFill = document.getElementById('todayDonutFill');
const todayDonutValue = document.getElementById('todayDonutValue');
const todaySub = document.getElementById('todaySub');
const monthDonutFill = document.getElementById('monthDonutFill');
const monthDonutValue = document.getElementById('monthDonutValue');
const monthSub = document.getElementById('monthSub');
const weeklyBars = document.getElementById('weeklyBars');
const bestHabitName = document.getElementById('bestHabitName');
const bestHabitPct = document.getElementById('bestHabitPct');
const bestHabitBarFill = document.getElementById('bestHabitBarFill');
const streakNumber = document.getElementById('streakNumber');
const streakSub = document.getElementById('streakSub');

const toastContainer = document.getElementById('toastContainer');

const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalInput = document.getElementById('modalInput');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

/* ==========================================================================
   Events
   ========================================================================== */

function bindEvents() {
  prevMonthBtn.addEventListener('click', () => changeMonth(-1));
  nextMonthBtn.addEventListener('click', () => changeMonth(1));
  todayBtn.addEventListener('click', () => {
    const t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth();
    syncNavSelects();
    animateMonthChange();
    render();
  });
  monthSelect.addEventListener('change', () => {
    viewMonth = parseInt(monthSelect.value, 10);
    animateMonthChange();
    render();
  });
  yearSelect.addEventListener('change', () => {
    viewYear = parseInt(yearSelect.value, 10);
    animateMonthChange();
    render();
  });

  themeToggle.addEventListener('click', toggleTheme);
  addHabitBtn.addEventListener('click', onAddHabitClick);

  modalCancelBtn.addEventListener('click', closeModal);
  modalConfirmBtn.addEventListener('click', confirmModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmModal(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
  });
}

/* ==========================================================================
   Init
   ========================================================================== */

function init() {
  const t = new Date();
  viewYear = t.getFullYear();
  viewMonth = t.getMonth();

  applyTheme();
  populateSelects();
  syncNavSelects();
  bindEvents();
  render();
}

init();
