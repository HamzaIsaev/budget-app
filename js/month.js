// The month selected on the overview and statistics screens. Shared so both
// screens (and returning from the form) stay on the same month.

import { formatMonth, shiftMonth } from './format.js';
import { haptic } from './telegram.js';
import { currentPeriod, periodRange, getState } from './store.js';

let month = currentPeriod();

export function getMonth() {
  return month;
}

export function setMonth(value) {
  month = value > currentPeriod() ? currentPeriod() : value;
}

/** Back to the current budget month, e.g. after the month start day changes. */
export function resetMonth() {
  month = currentPeriod();
}

// "10 окт – 9 ноя" when months don't start on the 1st.
function rangeLabel() {
  if ((getState().settings.monthStartDay || 1) === 1) return '';
  const fmt = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
      .format(new Date(y, m - 1, d))
      .replace('.', '');
  };
  const { start, end } = periodRange(month);
  return `<div class="month-range">${fmt(start)} – ${fmt(end)}</div>`;
}

export function monthSwitcherHtml() {
  const isCurrent = month === currentPeriod();
  return `
    <header class="month-switcher">
      <button class="icon-btn" data-action="prev-month" aria-label="Предыдущий месяц">‹</button>
      <div class="month-title">
        <h1>${formatMonth(month)}</h1>
        ${rangeLabel()}
      </div>
      <button class="icon-btn" data-action="next-month" aria-label="Следующий месяц" ${isCurrent ? 'disabled' : ''}>›</button>
    </header>`;
}

/** Handles a click on the switcher's arrows. Returns true if the month changed. */
export function handleMonthSwitch(el) {
  const delta = { 'prev-month': -1, 'next-month': 1 }[el.dataset.action];
  if (!delta) return false;
  setMonth(shiftMonth(month, delta));
  haptic('light');
  return true;
}
