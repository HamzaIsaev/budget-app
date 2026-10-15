import { getState, getPlan, setPlan, transactionsForMonth, summarize } from '../store.js';
import { parseAmount, amountToInput, formatMoney, formatMonth, shiftMonth, monthPrepositional } from '../format.js';
import { showBackButton, showMainButton, setMainButtonEnabled, haptic } from '../telegram.js';
import { goBack } from '../app.js';
import { getMonth } from '../month.js';
import { CURRENCY_SYMBOLS } from './form.js';

export function renderPlan(root) {
  const { currency } = getState().settings;
  const month = getMonth();
  const plan = getPlan(month);
  const prevMonth = shiftMonth(month, -1);
  const prevSpent = summarize(transactionsForMonth(prevMonth)).expense;

  root.innerHTML = `
    <header class="form-header">
      <h1>План на ${formatMonth(month).toLowerCase()}</h1>
    </header>
    <p class="hint">Сколько вы готовы потратить за месяц. План сохранится и на следующие месяцы, пока вы его не измените.</p>

    <label class="amount-field">
      <input id="amount" inputmode="decimal" autocomplete="off" placeholder="0"
             value="${plan ? amountToInput(plan) : ''}" aria-label="Сумма плана">
      <span class="currency">${CURRENCY_SYMBOLS[currency] ?? currency}</span>
    </label>

    ${
      prevSpent
        ? `<button class="plan-suggestion" data-amount="${prevSpent}">
             В ${monthPrepositional(prevMonth)} потрачено
             <b>${formatMoney(prevSpent, currency)}</b>. Взять эту сумму
           </button>`
        : ''
    }

    ${plan ? '<button class="btn btn-danger" id="remove">Убрать план</button>' : ''}
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
      setPlan(month, null);
      haptic('warning');
      goBack();
    }
  };

  function save() {
    const amount = parseAmount(amountEl.value);
    if (amount === null) return haptic('error');
    setPlan(month, amount);
    haptic('success');
    goBack();
  }

  showBackButton(goBack);
  showMainButton('Сохранить', save);
  validate();
  if (!plan) amountEl.focus();
}
