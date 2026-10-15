const LOCALE = 'ru-RU';

export function formatMoney(minor, currency, { sign = false } = {}) {
  const value = minor / 100;
  const formatted = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(value);
  // Use a real minus sign rather than a hyphen.
  return formatted.replace('-', '−');
}

/** Parses user input like "1 250,50" into minor units. Returns null if invalid. */
export function parseAmount(input) {
  const normalized = String(input).replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const minor = Math.round(parseFloat(normalized) * 100);
  return minor > 0 ? minor : null;
}

export function amountToInput(minor) {
  const value = minor / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

export function todayISO() {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentMonth() {
  return todayISO().slice(0, 7);
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toISODate(d).slice(0, 7);
}

export function formatMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1).replace(' г.', '');
}

export function formatDayHeading(iso) {
  const today = todayISO();
  const yesterday = toISODate(new Date(Date.now() - 86400000));
  if (iso === today) return 'Сегодня';
  if (iso === yesterday) return 'Вчера';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', weekday: 'short' }).format(
    new Date(y, m - 1, d),
  );
}

export function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

const MONTHS_PREPOSITIONAL = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
];

/** "в сентябре" — month name for use after the preposition «в». */
export function monthPrepositional(month) {
  return MONTHS_PREPOSITIONAL[Number(month.slice(5, 7)) - 1];
}

/**
 * Keeps an amount input to digits with one decimal comma and up to two decimals
 * as the user types, then calls `onChange`.
 */
export function bindAmountInput(input, onChange = () => {}) {
  input.addEventListener('input', () => {
    const cleaned = input.value
      .replace(/[^\d.,]/g, '')
      .replace(/\./g, ',')
      .replace(/,(?=.*,)/g, '')
      .replace(/(,\d{2})\d+$/, '$1');
    if (cleaned !== input.value) input.value = cleaned;
    onChange();
  });
}
