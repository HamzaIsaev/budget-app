import { getState, getCategory, getPlan, transactionsForMonth, summarize } from '../store.js';
import { formatMoney, formatDayHeading, escapeHtml } from '../format.js';
import { navigate, switchTab } from '../app.js';
import { getMonth, monthSwitcherHtml, handleMonthSwitch } from '../month.js';
import { planProgressHtml, goalProgressHtml } from './plan.js';

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
      ${renderGoalBlock(income, currency)}
    </section>

    ${txs.length ? renderList(txs, currency) : renderEmpty()}
  `;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action], [data-tx]');
    if (!el) return;
    if (el.dataset.tx) return navigate(`/edit/${encodeURIComponent(el.dataset.tx)}`);
    if (handleMonthSwitch(el)) return renderHome(root);
    switch (el.dataset.action) {
      case 'plan':
        return switchTab('/plan');
      case 'plan-edit':
        return navigate('/plan/edit');
      case 'goal-edit':
        return navigate('/plan/income');
    }
  };
}

function renderPlanBlock(spent, currency) {
  const month = getMonth();
  if (!getPlan(month)) {
    return `<button class="plan-empty" data-action="plan-edit">＋ Запланировать расходы на месяц</button>`;
  }
  return `
    <div class="plan" data-action="plan" role="button" aria-label="Открыть план">
      <div class="plan-label">План расходов</div>
      ${planProgressHtml(month, spent, currency)}
    </div>`;
}

function renderGoalBlock(earned, currency) {
  const month = getMonth();
  if (!getPlan(month, 'income')) {
    return `<button class="plan-empty" data-action="goal-edit">＋ Поставить цель по доходам</button>`;
  }
  return `
    <div class="plan" data-action="plan" role="button" aria-label="Открыть план">
      <div class="plan-label">Цель по доходам</div>
      ${goalProgressHtml(month, earned, currency)}
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
      <p class="hint">Нажмите ＋ внизу, чтобы добавить расход или доход.</p>
    </div>`;
}
