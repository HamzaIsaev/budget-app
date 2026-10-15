import { getState, getCategory, transactionsForMonth, summarize } from '../store.js';
import { formatMoney, formatMonth, shiftMonth, escapeHtml, monthPrepositional } from '../format.js';
import { haptic } from '../telegram.js';
import { getMonth, setMonth, monthSwitcherHtml, handleMonthSwitch } from '../month.js';

const TREND_MONTHS = 6;
// Tallest column; the plot is a bit taller to leave room for the value label.
const BAR_MAX_PX = 116;

// Remembered so switching months keeps the same tab.
let type = 'expense';

export function renderStats(root) {
  const { currency } = getState().settings;
  const month = getMonth();
  const txs = transactionsForMonth(month).filter((t) => t.type === type);
  const total = txs.reduce((sum, t) => sum + t.amount, 0);
  const prevTotal = totalFor(shiftMonth(month, -1));

  root.innerHTML = `
    ${monthSwitcherHtml()}

    <div class="segmented" role="tablist">
      <button role="tab" data-type="expense" class="${type === 'expense' ? 'active' : ''}">Расходы</button>
      <button role="tab" data-type="income" class="${type === 'income' ? 'active' : ''}">Доходы</button>
    </div>

    <section class="stats-hero">
      <div class="summary-label">${type === 'expense' ? 'Потрачено' : 'Получено'} за месяц</div>
      <div class="hero-value">${formatMoney(total, currency)}</div>
      ${renderDelta(total, prevTotal, month)}
    </section>

    <section class="card chart-card">
      <h2 class="chart-title">По категориям</h2>
      ${total ? renderCategories(txs, total, currency) : '<p class="hint chart-empty">Нет записей за этот месяц</p>'}
    </section>

    <section class="card chart-card">
      <h2 class="chart-title">По месяцам</h2>
      ${renderTrend(month, currency)}
    </section>
  `;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action], [data-type], [data-month]');
    if (!el) return;
    if (handleMonthSwitch(el)) return renderStats(root);
    if (el.dataset.type && el.dataset.type !== type) {
      type = el.dataset.type;
      haptic('light');
      return renderStats(root);
    }
    if (el.dataset.month && el.dataset.month !== month) {
      setMonth(el.dataset.month);
      haptic('light');
      return renderStats(root);
    }
  };

}

function totalFor(month) {
  return transactionsForMonth(month)
    .filter((t) => t.type === type)
    .reduce((sum, t) => sum + t.amount, 0);
}

// Change vs the previous month, spelled out in words so it never relies on color.
function renderDelta(total, prevTotal, month) {
  if (!prevTotal) return '';
  const prevName = monthPrepositional(shiftMonth(month, -1));
  const pct = Math.round(((total - prevTotal) / prevTotal) * 100);
  if (pct === 0) return `<div class="hint">Столько же, сколько в ${prevName}</div>`;
  const more = pct > 0;
  // Spending more is bad, earning more is good.
  const good = type === 'expense' ? !more : more;
  return `
    <div class="delta ${good ? 'pos' : 'neg'}">
      ${more ? '▲' : '▼'} на ${Math.abs(pct)}% ${more ? 'больше' : 'меньше'}, чем в ${prevName}
    </div>`;
}

// Ranked horizontal bars, one hue: the job is comparing amounts between
// categories, and there are too many categories to give each its own color.
function renderCategories(txs, total, currency) {
  const byCategory = new Map();
  for (const t of txs) byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.amount);
  const rows = [...byCategory].sort((a, b) => b[1] - a[1]);
  const max = rows[0][1];

  return `
    <ul class="cat-bars">
      ${rows
        .map(([id, amount]) => {
          const cat = getCategory(id) ?? { name: 'Без категории', emoji: '•' };
          const pct = (amount / total) * 100;
          return `
            <li class="cat-bar">
              <span class="tx-emoji">${cat.emoji}</span>
              <div class="cat-bar-body">
                <div class="cat-bar-label">
                  <span>${escapeHtml(cat.name)}</span>
                  <span class="cat-bar-value">
                    ${formatMoney(amount, currency)}
                    <span class="cat-bar-pct">${pct < 1 ? '<1' : Math.round(pct)}%</span>
                  </span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${Math.max((amount / max) * 100, 2)}%"></div>
                </div>
              </div>
            </li>`;
        })
        .join('')}
    </ul>`;
}

// Columns for the last months up to the selected one. The selected month is in
// the accent color, the rest are muted context; only it carries a value label.
function renderTrend(month, currency) {
  const months = Array.from({ length: TREND_MONTHS }, (_, i) =>
    shiftMonth(month, i - TREND_MONTHS + 1),
  );
  const totals = months.map(totalFor);
  const max = Math.max(...totals);
  if (!max) return '<p class="hint chart-empty">Пока нет данных</p>';

  return `
    <div class="trend" role="list">
      ${months
        .map((m, i) => {
          const selected = m === month;
          const label = formatMonth(m).slice(0, 3);
          const value = formatMoney(totals[i], currency);
          return `
            <button class="trend-col ${selected ? 'selected' : ''}" data-month="${m}" role="listitem"
                    aria-label="${formatMonth(m)}: ${value}">
              <span class="trend-plot">
                <span class="trend-value">${selected ? compactMoney(totals[i], currency) : ''}</span>
                <span class="trend-bar" style="height:${totals[i] ? Math.max((totals[i] / max) * BAR_MAX_PX, 3) : 0}px"></span>
              </span>
              <span class="trend-label">${label}</span>
            </button>`;
        })
        .join('')}
    </div>`;
}

function compactMoney(minor, currency) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(minor / 100);
}
