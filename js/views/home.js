import { getState, getCategory, getPlan, transactionsForMonth, summarize } from '../store.js';
import { formatMoney, formatDayHeading, escapeHtml, currentMonth, todayISO } from '../format.js';
import { navigate } from '../app.js';
import { getMonth, monthSwitcherHtml, handleMonthSwitch } from '../month.js';
import { syncStatusHtml, handleSyncClick } from '../sync-status.js';

export function renderHome(root) {
  const { currency } = getState().settings;
  const txs = transactionsForMonth(getMonth());
  const { income, expense, balance } = summarize(txs);

  root.innerHTML = `
    ${monthSwitcherHtml()}

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
      ${renderPlanBlock(expense, currency)}
      <button class="summary-link" data-action="stats">Статистика ›</button>
    </section>

    ${txs.length ? renderList(txs, currency) : renderEmpty()}

    ${syncStatusHtml()}

    <div class="bottom-bar">
      <button class="btn btn-expense" data-action="add-expense">− Расход</button>
      <button class="btn btn-income" data-action="add-income">+ Доход</button>
    </div>
  `;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action], [data-tx]');
    if (!el) return;
    if (el.dataset.tx) return navigate(`/edit/${encodeURIComponent(el.dataset.tx)}`);
    if (handleMonthSwitch(el)) return renderHome(root);
    if (handleSyncClick(el)) return;
    switch (el.dataset.action) {
      case 'stats':
        return navigate('/stats');
      case 'plan':
        return navigate('/plan');
      case 'add-expense':
        return navigate('/new/expense');
      case 'add-income':
        return navigate('/new/income');
    }
  };
}

function renderPlanBlock(spent, currency) {
  const month = getMonth();
  const plan = getPlan(month);
  if (!plan) {
    return `<button class="plan-empty" data-action="plan">＋ Запланировать расходы на месяц</button>`;
  }

  const left = plan - spent;
  const over = left < 0;
  const ratio = Math.min(spent / plan, 1);

  // For the current month, how much can still be spent per day, today included.
  let perDay = '';
  if (month === currentMonth() && !over) {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const daysLeft = daysInMonth - Number(todayISO().slice(8)) + 1;
    perDay = `<div class="plan-hint">≈ ${formatMoney(Math.floor(left / daysLeft / 100) * 100, currency)} в день до конца месяца</div>`;
  }

  return `
    <div class="plan" data-action="plan" role="button" aria-label="Изменить план">
      <div class="plan-row">
        <span>${over ? '⚠️ Перерасход' : 'Осталось'}
          <b class="${over ? 'neg' : ''}">${formatMoney(Math.abs(left), currency)}</b></span>
        <span class="plan-of">из ${formatMoney(plan, currency)}</span>
      </div>
      <div class="meter ${over ? 'over' : ''}" role="meter" aria-valuemin="0" aria-valuemax="${plan}" aria-valuenow="${spent}">
        <div class="meter-fill" style="width:${ratio * 100}%"></div>
      </div>
      ${perDay}
    </div>`;
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
