import { getState, getPlan, setPlan, transactionsForMonth, summarize } from '../store.js';
import {
  parseAmount,
  amountToInput,
  formatMoney,
  formatMonth,
  shiftMonth,
  monthPrepositional,
  currentMonth,
  todayISO,
} from '../format.js';
import { showBackButton, showMainButton, setMainButtonEnabled, haptic } from '../telegram.js';
import { goBack, navigate } from '../app.js';
import { getMonth, monthSwitcherHtml, handleMonthSwitch } from '../month.js';
import { CURRENCY_SYMBOLS } from './form.js';

// Texts for the two kinds of plan: spending limit and earnings goal.
const KINDS = {
  expense: {
    title: 'План расходов',
    hint: 'Сколько вы готовы потратить за месяц. План сохранится и на следующие месяцы, пока вы его не измените.',
    prevVerb: 'потрачено',
    empty: 'Задайте, сколько готовы потратить за месяц, и следите за остатком.',
    set: 'Задать план',
    edit: 'Изменить',
    remove: 'Убрать план',
    route: '/plan/edit',
  },
  income: {
    title: 'Цель по доходам',
    hint: 'Сколько вы хотите заработать за месяц. Цель сохранится и на следующие месяцы, пока вы её не измените.',
    prevVerb: 'заработано',
    empty: 'Задайте, сколько хотите заработать за месяц, и следите за прогрессом.',
    set: 'Задать цель',
    edit: 'Изменить',
    remove: 'Убрать цель',
    route: '/plan/income',
  },
};

/** Days left in `month` including today, or null if it isn't the current month. */
function daysLeftIn(month) {
  if (month !== currentMonth()) return null;
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate() - Number(todayISO().slice(8)) + 1;
}

const perDayMoney = (amount, days, currency) =>
  formatMoney(Math.floor(amount / days / 100) * 100, currency);

/** Progress of `spent` against the month's spending plan; also used on the home screen. */
export function planProgressHtml(month, spent, currency) {
  const plan = getPlan(month);
  const left = plan - spent;
  const over = left < 0;
  const days = daysLeftIn(month);

  return `
    <div class="plan-row">
      <span>${over ? '⚠️ Перерасход' : 'Осталось'}
        <b class="${over ? 'neg' : ''}">${formatMoney(Math.abs(left), currency)}</b></span>
      <span class="plan-of">из ${formatMoney(plan, currency)}</span>
    </div>
    <div class="meter ${over ? 'over' : ''}" role="meter" aria-valuemin="0" aria-valuemax="${plan}" aria-valuenow="${spent}">
      <div class="meter-fill" style="width:${Math.min(spent / plan, 1) * 100}%"></div>
    </div>
    ${days && !over ? `<div class="plan-hint">≈ ${perDayMoney(left, days, currency)} в день до конца месяца</div>` : ''}`;
}

/** Progress of `earned` towards the month's income goal; also used on the home screen. */
export function goalProgressHtml(month, earned, currency) {
  const goal = getPlan(month, 'income');
  const left = goal - earned;
  const reached = left <= 0;
  const days = daysLeftIn(month);

  return `
    <div class="plan-row">
      ${
        reached
          ? `<span>🎉 Цель достигнута${left < 0 ? ` <b class="pos">+${formatMoney(-left, currency)}</b>` : ''}</span>`
          : `<span>До цели <b>${formatMoney(left, currency)}</b></span>`
      }
      <span class="plan-of">из ${formatMoney(goal, currency)}</span>
    </div>
    <div class="meter income" role="meter" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${earned}">
      <div class="meter-fill" style="width:${Math.min(earned / goal, 1) * 100}%"></div>
    </div>
    ${days && !reached ? `<div class="plan-hint">≈ ${perDayMoney(left, days, currency)} в день, чтобы успеть</div>` : ''}`;
}

function planCardHtml(kind, month, amount, currency) {
  const k = KINDS[kind];
  const plan = getPlan(month, kind);
  if (!plan) {
    return `
      <section class="card plan-card">
        <h2 class="chart-title">${k.title}</h2>
        <p class="hint plan-empty-text">${k.empty}</p>
        <button class="btn btn-income btn-wide" data-edit="${kind}">${k.set}</button>
      </section>`;
  }
  const pct = Math.round((amount / plan) * 100);
  return `
    <section class="card plan-card">
      <div class="plan-card-head">
        <h2 class="chart-title">${k.title}</h2>
        <button class="link-btn" data-edit="${kind}">${k.edit}</button>
      </div>
      <div class="plan-spent">
        ${kind === 'income' ? 'Получено' : 'Потрачено'} <b>${formatMoney(amount, currency)}</b> · ${pct}%
      </div>
      ${kind === 'income' ? goalProgressHtml(month, amount, currency) : planProgressHtml(month, amount, currency)}
    </section>`;
}

// The Plan tab: the month's spending plan and income goal side by side.
export function renderPlan(root) {
  const { currency } = getState().settings;
  const month = getMonth();
  const { income, expense } = summarize(transactionsForMonth(month));

  root.innerHTML = `
    ${monthSwitcherHtml()}
    ${planCardHtml('expense', month, expense, currency)}
    ${planCardHtml('income', month, income, currency)}
  `;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action], [data-edit]');
    if (!el) return;
    if (el.dataset.edit) return navigate(KINDS[el.dataset.edit].route);
    if (handleMonthSwitch(el)) renderPlan(root);
  };
}

export function renderPlanEdit(root, kind = 'expense') {
  const k = KINDS[kind];
  const { currency } = getState().settings;
  const month = getMonth();
  const plan = getPlan(month, kind);
  const prevMonth = shiftMonth(month, -1);
  const prevAmount = summarize(transactionsForMonth(prevMonth))[kind];

  root.innerHTML = `
    <header class="form-header">
      <h1>${k.title} на ${formatMonth(month).toLowerCase()}</h1>
    </header>
    <p class="hint">${k.hint}</p>

    <label class="amount-field">
      <input id="amount" inputmode="decimal" autocomplete="off" placeholder="0"
             value="${plan ? amountToInput(plan) : ''}" aria-label="Сумма">
      <span class="currency">${CURRENCY_SYMBOLS[currency] ?? currency}</span>
    </label>

    ${
      prevAmount
        ? `<button class="plan-suggestion" data-amount="${prevAmount}">
             В ${monthPrepositional(prevMonth)} ${k.prevVerb}
             <b>${formatMoney(prevAmount, currency)}</b>. Взять эту сумму
           </button>`
        : ''
    }

    ${plan ? `<button class="btn btn-danger" id="remove">${k.remove}</button>` : ''}
  `;

  const amountEl = root.querySelector('#amount');
  const validate = () => setMainButtonEnabled(parseAmount(amountEl.value) !== null);

  amountEl.addEventListener('input', () => {
    const cleaned = amountEl.value
      .replace(/[^\d.,]/g, '')
      .replace(/\./g, ',')
      .replace(/,(?=.*,)/g, '')
      .replace(/(,\d{2})\d+$/, '$1');
    if (cleaned !== amountEl.value) amountEl.value = cleaned;
    validate();
  });

  root.onclick = (e) => {
    const suggestion = e.target.closest('[data-amount]');
    if (suggestion) {
      amountEl.value = amountToInput(Number(suggestion.dataset.amount));
      haptic('light');
      validate();
      return;
    }
    if (e.target.closest('#remove')) {
      setPlan(month, null, kind);
      haptic('warning');
      goBack();
    }
  };

  function save() {
    const amount = parseAmount(amountEl.value);
    if (amount === null) return haptic('error');
    setPlan(month, amount, kind);
    haptic('success');
    goBack();
  }

  showBackButton(goBack);
  showMainButton('Сохранить', save);
  validate();
  if (!plan) amountEl.focus();
}
