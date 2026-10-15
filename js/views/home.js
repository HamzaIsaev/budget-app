import { getState, getCategory, transactionsForMonth, summarize } from '../store.js';
import {
  formatMoney,
  formatMonth,
  formatDayHeading,
  currentMonth,
  shiftMonth,
  escapeHtml,
} from '../format.js';
import { haptic } from '../telegram.js';
import { navigate } from '../app.js';

// Remembered across navigation so returning from the form keeps the same month.
let month = currentMonth();

export function renderHome(root) {
  const { currency } = getState().settings;
  const txs = transactionsForMonth(month);
  const { income, expense, balance } = summarize(txs);
  const isCurrent = month === currentMonth();

  root.innerHTML = `
    <header class="month-switcher">
      <button class="icon-btn" data-action="prev" aria-label="Предыдущий месяц">‹</button>
      <h1>${formatMonth(month)}</h1>
      <button class="icon-btn" data-action="next" aria-label="Следующий месяц" ${isCurrent ? 'disabled' : ''}>›</button>
    </header>

    <section class="card summary">
      <div class="summary-label">Баланс за месяц</div>
      <div class="summary-balance ${balance < 0 ? 'neg' : ''}">${formatMoney(balance, currency)}</div>
      <div class="summary-row">
        <div>
          <div class="summary-label">Доходы</div>
          <div class="pos">${formatMoney(income, currency)}</div>
        </div>
        <div>
          <div class="summary-label">Расходы</div>
          <div class="neg">${formatMoney(expense, currency)}</div>
        </div>
      </div>
    </section>

    ${txs.length ? renderList(txs, currency) : renderEmpty()}

    <div class="bottom-bar">
      <button class="btn btn-expense" data-action="add-expense">− Расход</button>
      <button class="btn btn-income" data-action="add-income">+ Доход</button>
    </div>
  `;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action], [data-tx]');
    if (!el) return;
    if (el.dataset.tx) return navigate(`/edit/${encodeURIComponent(el.dataset.tx)}`);
    switch (el.dataset.action) {
      case 'prev':
        month = shiftMonth(month, -1);
        haptic('light');
        return renderHome(root);
      case 'next':
        month = shiftMonth(month, 1);
        haptic('light');
        return renderHome(root);
      case 'add-expense':
        return navigate('/new/expense');
      case 'add-income':
        return navigate('/new/income');
    }
  };
}

function renderList(txs, currency) {
  const byDay = Map.groupBy
    ? Map.groupBy(txs, (t) => t.date)
    : txs.reduce((m, t) => m.set(t.date, [...(m.get(t.date) ?? []), t]), new Map());

  return [...byDay]
    .map(([date, items]) => {
      const dayTotal = summarize(items).balance;
      return `
        <section class="day">
          <div class="day-heading">
            <span>${formatDayHeading(date)}</span>
            <span>${formatMoney(dayTotal, currency, { sign: true })}</span>
          </div>
          <ul class="card tx-list">
            ${items.map((t) => renderRow(t)).join('')}
          </ul>
        </section>`;
    })
    .join('');
}

function renderRow(t) {
  const cat = getCategory(t.categoryId) ?? { name: 'Без категории', emoji: '•' };
  const isIncome = t.type === 'income';
  return `
    <li class="tx" data-tx="${escapeHtml(t.id)}">
      <span class="tx-emoji">${cat.emoji}</span>
      <span class="tx-main">
        <span class="tx-cat">${escapeHtml(cat.name)}</span>
        ${t.note ? `<span class="tx-note">${escapeHtml(t.note)}</span>` : ''}
      </span>
      <span class="tx-amount ${isIncome ? 'pos' : ''}">
        ${formatMoney(isIncome ? t.amount : -t.amount, t.currency, { sign: true })}
      </span>
    </li>`;
}

function renderEmpty() {
  return `
    <div class="empty">
      <div class="empty-emoji">🧾</div>
      <p>В этом месяце пока нет записей.</p>
      <p class="hint">Добавьте первый расход или доход кнопками ниже.</p>
    </div>`;
}
