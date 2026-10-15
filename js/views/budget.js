// The month's budget: the spending plan (a total or a list of items) and the
// income goal. Their progress is shown on the home screen; the editors are
// sub-pages.

import {
  getState,
  getPlan,
  getPlanItems,
  setPlan,
  getCategory,
  categoriesFor,
  transactionsForMonth,
  summarize,
} from '../store.js';
import {
  parseAmount,
  amountToInput,
  formatMoney,
  formatMonth,
  shiftMonth,
  monthPrepositional,
  currentMonth,
  todayISO,
  escapeHtml,
  bindAmountInput,
} from '../format.js';
import { showBackButton, showMainButton, setMainButtonEnabled, haptic } from '../telegram.js';
import { goBack } from '../app.js';
import { getMonth } from '../month.js';
import { CURRENCY_SYMBOLS } from './form.js';

/** Days left in `month` including today, or null if it isn't the current month. */
function daysLeftIn(month) {
  if (month !== currentMonth()) return null;
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate() - Number(todayISO().slice(8)) + 1;
}

const perDayMoney = (amount, days, currency) =>
  formatMoney(Math.floor(amount / days / 100) * 100, currency);

function expenseByCategory(month) {
  const spent = {};
  for (const t of transactionsForMonth(month)) {
    if (t.type === 'expense') spent[t.categoryId] = (spent[t.categoryId] ?? 0) + t.amount;
  }
  return spent;
}

/** Progress of `spent` against the month's spending plan. */
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

/** Progress of `earned` towards the month's income goal. */
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

/**
 * The plan's items. Items tied to a category show what was actually spent in
 * it; items with a custom name show only the planned amount.
 */
export function planItemsHtml(month, currency) {
  const items = getPlanItems(month);
  if (!items) return '';
  const spentBy = expenseByCategory(month);
  const planned = new Set(items.map((i) => i.categoryId).filter(Boolean));
  const other = Object.entries(spentBy)
    .filter(([id]) => !planned.has(id))
    .reduce((sum, [, v]) => sum + v, 0);

  const rows = [...items]
    .sort((a, b) => b.amount - a.amount)
    .map((item) => {
      const cat = item.categoryId ? getCategory(item.categoryId) : null;
      const name = escapeHtml(cat?.name ?? item.name);
      const emoji = cat?.emoji ?? '📝';
      if (!cat) {
        return `
          <li class="limit-row">
            <span class="tx-emoji">${emoji}</span>
            <div class="cat-bar-body cat-bar-label">
              <span>${name}</span>
              <span class="limit-value">${formatMoney(item.amount, currency)}</span>
            </div>
          </li>`;
      }
      const spent = spentBy[item.categoryId] ?? 0;
      const over = spent > item.amount;
      return `
        <li class="limit-row">
          <span class="tx-emoji">${emoji}</span>
          <div class="cat-bar-body">
            <div class="cat-bar-label">
              <span>${name}</span>
              <span class="limit-value ${over ? 'neg' : ''}">
                ${formatMoney(spent, currency)} <span class="plan-of">из ${formatMoney(item.amount, currency)}</span>
              </span>
            </div>
            <div class="meter thin ${over ? 'over' : ''}">
              <div class="meter-fill" style="width:${Math.min(spent / item.amount, 1) * 100}%"></div>
            </div>
          </div>
        </li>`;
    })
    .join('');

  const collapsed = itemsCollapsed();
  return `
    <div class="plan-items ${collapsed ? 'collapsed' : ''}">
      <button class="items-toggle" data-action="toggle-items" aria-expanded="${!collapsed}">
        <span>Пункты плана · ${items.length}</span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>
      <div class="items-body">
        <ul class="limits">${rows}</ul>
        ${other ? `<div class="plan-hint">Траты в других категориях: ${formatMoney(other, currency)}</div>` : ''}
      </div>
    </div>`;
}

// Whether the plan's items are folded away. A per-device preference, so it
// lives in localStorage rather than the synced state.
const COLLAPSED_KEY = 'budget:ui:plan-items-collapsed';

function itemsCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Folds or unfolds the plan's items in place. Returns true if `el` was the toggle. */
export function handleItemsToggle(el) {
  if (el.dataset.action !== 'toggle-items') return false;
  const wrap = el.closest('.plan-items');
  const collapsed = wrap.classList.toggle('collapsed');
  el.setAttribute('aria-expanded', String(!collapsed));
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // Not remembered; the toggle still works for this session.
  }
  return true;
}

// --- Spending plan editor --------------------------------------------------------

export function renderBudgetEdit(root) {
  const { currency } = getState().settings;
  const month = getMonth();
  const savedItems = getPlanItems(month);
  const savedTotal = getPlan(month);
  const categories = categoriesFor('expense');
  const prevMonth = shiftMonth(month, -1);
  const prevSpent = expenseByCategory(prevMonth);

  let mode = savedTotal && !savedItems ? 'total' : 'items';
  let total = savedTotal && !savedItems ? amountToInput(savedTotal) : '';
  // Rows being edited: categoryId (null for a custom item), name, amount as typed.
  let rows = (savedItems ?? []).map((i) => ({
    categoryId: i.categoryId ?? null,
    name: i.name ?? '',
    amount: amountToInput(i.amount),
  }));
  if (!rows.length) rows.push({ categoryId: categories[0].id, name: '', amount: '' });

  root.innerHTML = `
    <header class="form-header">
      <h1>План расходов на ${formatMonth(month).toLowerCase()}</h1>
    </header>

    <div class="segmented" role="tablist">
      <button role="tab" data-mode="total">Общая сумма</button>
      <button role="tab" data-mode="items">По пунктам</button>
    </div>

    <div id="body"></div>

    ${savedTotal ? '<button class="btn btn-danger" id="remove">Убрать план</button>' : ''}
  `;
  const body = root.querySelector('#body');

  const validRows = () =>
    rows
      .map((r) => ({ ...r, value: parseAmount(r.amount) }))
      .filter((r) => r.value !== null && (r.categoryId || r.name.trim()));

  function currentTotal() {
    if (mode === 'total') return parseAmount(total) ?? 0;
    return validRows().reduce((sum, r) => sum + r.value, 0);
  }

  function update() {
    const sum = currentTotal();
    const totalEl = body.querySelector('#items-total');
    if (totalEl) totalEl.textContent = formatMoney(sum, currency);
    setMainButtonEnabled(sum > 0);
  }

  function rowHtml(row, i) {
    // A category can be planned once; the other rows don't offer it again.
    const used = new Set(rows.filter((r, j) => j !== i && r.categoryId).map((r) => r.categoryId));
    const options = categories
      .filter((c) => !used.has(c.id))
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === row.categoryId ? 'selected' : ''}>${c.emoji} ${escapeHtml(c.name)}</option>`,
      )
      .join('');
    return `
      <div class="item-row" data-row="${i}">
        <div class="item-main">
          <select class="item-cat" aria-label="Категория">
            ${options}
            <option value="" ${row.categoryId ? '' : 'selected'}>✏️ Свой пункт</option>
          </select>
          ${
            row.categoryId
              ? ''
              : `<input class="item-name" type="text" maxlength="40" placeholder="Например, подарок маме"
                        value="${escapeHtml(row.name)}">`
          }
        </div>
        <input class="item-amount" inputmode="decimal" autocomplete="off" placeholder="0"
               value="${escapeHtml(row.amount)}" aria-label="Сумма">
        <button class="item-remove" aria-label="Удалить пункт">✕</button>
      </div>`;
  }

  function renderBody() {
    root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));

    if (mode === 'total') {
      body.innerHTML = `
        <p class="hint">Сколько готовы потратить за месяц. План сохранится и на следующие месяцы, пока вы его не измените.</p>
        <label class="amount-field">
          <input id="total" inputmode="decimal" autocomplete="off" placeholder="0"
                 value="${escapeHtml(total)}" aria-label="Сумма плана">
          <span class="currency">${CURRENCY_SYMBOLS[currency] ?? currency}</span>
        </label>`;
      const input = body.querySelector('#total');
      bindAmountInput(input, () => {
        total = input.value;
        update();
      });
    } else {
      body.innerHTML = `
        <p class="hint">
          Распишите, на что пойдут деньги. Пункт с категорией сам покажет, сколько уже потрачено.
          Общий план сложится из пунктов.
        </p>
        <div class="limits-total">Итого <b id="items-total"></b></div>
        ${
          Object.keys(prevSpent).length
            ? `<button class="plan-suggestion" id="fill-prev">Заполнить по тратам в ${monthPrepositional(prevMonth)}</button>`
            : ''
        }
        <div class="card items-card">
          ${rows.map(rowHtml).join('')}
          <button class="item-add" id="add-row">＋ Добавить пункт</button>
        </div>`;
      body.querySelectorAll('.item-amount').forEach((input) => {
        const i = Number(input.closest('[data-row]').dataset.row);
        bindAmountInput(input, () => {
          rows[i].amount = input.value;
          update();
        });
      });
      body.querySelectorAll('.item-name').forEach((input) => {
        const i = Number(input.closest('[data-row]').dataset.row);
        input.addEventListener('input', () => {
          rows[i].name = input.value;
          update();
        });
      });
      body.querySelectorAll('.item-cat').forEach((select) => {
        const i = Number(select.closest('[data-row]').dataset.row);
        select.addEventListener('change', () => {
          rows[i].categoryId = select.value || null;
          renderBody();
        });
      });
    }
    update();
  }

  root.onclick = (e) => {
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn && modeBtn.dataset.mode !== mode) {
      mode = modeBtn.dataset.mode;
      haptic('light');
      return renderBody();
    }
    if (e.target.closest('#add-row')) {
      const used = new Set(rows.map((r) => r.categoryId));
      const next = categories.find((c) => !used.has(c.id));
      rows.push({ categoryId: next?.id ?? null, name: '', amount: '' });
      haptic('light');
      renderBody();
      body.querySelector(`[data-row="${rows.length - 1}"] .item-amount`)?.focus();
      return;
    }
    const remove = e.target.closest('.item-remove');
    if (remove) {
      rows.splice(Number(remove.closest('[data-row]').dataset.row), 1);
      if (!rows.length) rows.push({ categoryId: null, name: '', amount: '' });
      haptic('light');
      return renderBody();
    }
    if (e.target.closest('#fill-prev')) {
      rows = Object.entries(prevSpent)
        .sort((a, b) => b[1] - a[1])
        .map(([categoryId, amount]) => ({
          categoryId,
          name: '',
          amount: amountToInput(Math.ceil(amount / 100) * 100),
        }));
      haptic('light');
      return renderBody();
    }
    if (e.target.closest('#remove')) {
      setPlan(month, null);
      haptic('warning');
      goBack();
    }
  };

  function save() {
    if (mode === 'total') {
      const amount = parseAmount(total);
      if (amount === null) return haptic('error');
      setPlan(month, amount);
    } else {
      const items = validRows().map((r) =>
        r.categoryId ? { categoryId: r.categoryId, amount: r.value } : { name: r.name.trim(), amount: r.value },
      );
      if (!items.length) return haptic('error');
      setPlan(month, { items });
    }
    haptic('success');
    goBack();
  }

  showBackButton(goBack);
  showMainButton('Сохранить', save);
  renderBody();
}

// --- Income goal editor ------------------------------------------------------------

export function renderIncomeGoalEdit(root) {
  const { currency } = getState().settings;
  const month = getMonth();
  const goal = getPlan(month, 'income');
  const prevMonth = shiftMonth(month, -1);
  const prevEarned = summarize(transactionsForMonth(prevMonth)).income;

  root.innerHTML = `
    <header class="form-header">
      <h1>Цель по доходам на ${formatMonth(month).toLowerCase()}</h1>
    </header>
    <p class="hint">Сколько вы хотите заработать за месяц. Цель сохранится и на следующие месяцы, пока вы её не измените.</p>

    <label class="amount-field">
      <input id="amount" inputmode="decimal" autocomplete="off" placeholder="0"
             value="${goal ? amountToInput(goal) : ''}" aria-label="Сумма">
      <span class="currency">${CURRENCY_SYMBOLS[currency] ?? currency}</span>
    </label>

    ${
      prevEarned
        ? `<button class="plan-suggestion" data-amount="${prevEarned}">
             В ${monthPrepositional(prevMonth)} заработано
             <b>${formatMoney(prevEarned, currency)}</b>. Взять эту сумму
           </button>`
        : ''
    }

    ${goal ? '<button class="btn btn-danger" id="remove">Убрать цель</button>' : ''}
  `;

  const amountEl = root.querySelector('#amount');
  const validate = () => setMainButtonEnabled(parseAmount(amountEl.value) !== null);
  bindAmountInput(amountEl, validate);

  root.onclick = (e) => {
    const suggestion = e.target.closest('[data-amount]');
    if (suggestion) {
      amountEl.value = amountToInput(Number(suggestion.dataset.amount));
      haptic('light');
      validate();
      return;
    }
    if (e.target.closest('#remove')) {
      setPlan(month, null, 'income');
      haptic('warning');
      goBack();
    }
  };

  function save() {
    const amount = parseAmount(amountEl.value);
    if (amount === null) return haptic('error');
    setPlan(month, amount, 'income');
    haptic('success');
    goBack();
  }

  showBackButton(goBack);
  showMainButton('Сохранить', save);
  validate();
  if (!goal) amountEl.focus();
}
