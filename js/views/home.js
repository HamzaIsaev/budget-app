import { getState, getCategory, getPlan, transactionsForMonth, summarize } from '../store.js';
import { formatMoney, formatDayHeading, escapeHtml } from '../format.js';
import { navigate } from '../app.js';
import { getMonth, monthSwitcherHtml, handleMonthSwitch } from '../month.js';
import { planProgressHtml, goalProgressHtml, planItemsHtml, handleItemsToggle } from './budget.js';

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
    </section>

    ${renderPlanCard(expense, currency)}
    ${renderGoalCard(income, currency)}

    ${txs.length ? renderList(txs, currency) : renderEmpty()}
  `;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action], [data-tx]');
    if (!el) return;
    if (el.dataset.tx) return navigate(`/edit/${encodeURIComponent(el.dataset.tx)}`);
    if (handleMonthSwitch(el)) return renderHome(root);
    if (handleItemsToggle(el)) return;
    switch (el.dataset.action) {
      case 'plan-edit':
        return navigate('/budget/edit');
      case 'goal-edit':
        return navigate('/budget/income');
    }
  };
}

function cardHead(title, action) {
  return `
    <div class="plan-card-head">
      <h2 class="chart-title">${title}</h2>
      <button class="link-btn" data-action="${action}">Изменить</button>
    </div>`;
}

function renderPlanCard(spent, currency) {
  const month = getMonth();
  if (!getPlan(month)) {
    return `
      <section class="card plan-card">
        <button class="link-btn" data-action="plan-edit">＋ Запланировать расходы на месяц</button>
      </section>`;
  }
  return `
    <section class="card plan-card">
      ${cardHead('План расходов', 'plan-edit')}
      ${planProgressHtml(month, spent, currency)}
      ${planItemsHtml(month, currency)}
    </section>`;
}

function renderGoalCard(earned, currency) {
  const month = getMonth();
  if (!getPlan(month, 'income')) {
    return `
      <section class="card plan-card">
        <button class="link-btn" data-action="goal-edit">＋ Поставить цель по доходам</button>
      </section>`;
  }
  return `
    <section class="card plan-card">
      ${cardHead('Цель по доходам', 'goal-edit')}
      ${goalProgressHtml(month, earned, currency)}
    </section>`;
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
