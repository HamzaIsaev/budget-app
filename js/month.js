// The month selected on the overview and statistics screens. Shared so both
// screens (and returning from the form) stay on the same month.

import { currentMonth, formatMonth, shiftMonth } from './format.js';
import { haptic } from './telegram.js';

let month = currentMonth();

export function getMonth() {
  return month;
}

export function setMonth(value) {
  month = value > currentMonth() ? currentMonth() : value;
}

export function monthSwitcherHtml() {
  const isCurrent = month === currentMonth();
  return `
    <header class="month-switcher">
      <button class="icon-btn" data-action="prev-month" aria-label="Предыдущий месяц">‹</button>
      <h1>${formatMonth(month)}</h1>
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
