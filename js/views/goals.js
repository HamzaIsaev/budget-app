// Savings goals ("dreams"): the Dreams tab, an editor and a screen to put
// money aside. Money put aside is tracked on the goal only; it does not
// change the month's income or expenses.

import { getState, getGoals, getGoal, saveGoal, deleteGoal, addToGoal } from '../store.js';
import {
  parseAmount,
  amountToInput,
  formatMoney,
  escapeHtml,
  bindAmountInput,
  todayISO,
  currencySymbol,
} from '../format.js';
import { showBackButton, showMainButton, setMainButtonEnabled, haptic, confirm } from '../telegram.js';
import { goBack, navigate } from '../app.js';

const EMOJIS = ['🌟', '✈️', '🏖️', '🚗', '🏠', '📱', '💻', '💍', '🎓', '🎁', '🏍️', '🛋️'];

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, d))
    .replace(' г.', '');
}

/** Whole months from now until `iso`, at least 1. */
function monthsUntil(iso) {
  const [y, m] = iso.split('-').map(Number);
  const now = new Date();
  return Math.max((y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()), 1);
}

function goalCardHtml(goal, currency) {
  const left = goal.target - goal.saved;
  const done = left <= 0;
  const pct = Math.min(Math.round((goal.saved / goal.target) * 100), 100);

  let pace = '';
  if (done) {
    pace = '🎉 Мечта накоплена!';
  } else if (goal.deadline) {
    const perMonth = Math.ceil(left / monthsUntil(goal.deadline) / 100) * 100;
    pace = `до ${formatDate(goal.deadline)} · ≈ ${formatMoney(perMonth, currency)} в месяц`;
  }

  return `
    <section class="card goal-card" data-goal="${escapeHtml(goal.id)}">
      <div class="goal-head">
        <span class="goal-emoji">${goal.emoji}</span>
        <div class="goal-title">
          <div class="goal-name">${escapeHtml(goal.name)}</div>
          <div class="plan-of">
            <b class="goal-saved">${formatMoney(goal.saved, currency)}</b> из ${formatMoney(goal.target, currency)} · ${pct}%
          </div>
        </div>
      </div>
      <div class="meter goal">
        <div class="meter-fill" style="width:${pct}%"></div>
      </div>
      <div class="goal-foot">
        <span class="plan-hint">${pace}</span>
        ${done ? '' : `<button class="link-btn" data-goal-add="${escapeHtml(goal.id)}">＋ Отложить</button>`}
      </div>
    </section>`;
}

// The Dreams tab.
export function renderDreams(root) {
  const { currency } = getState().settings;
  const goals = getGoals();
  root.innerHTML = `
    <header class="page-header">
      <h1>Мечты</h1>
    </header>
    ${
      goals.length
        ? goals.map((g) => goalCardHtml(g, currency)).join('')
        : `<section class="card plan-card empty">
             <div class="empty-emoji">🌟</div>
             <p>Здесь будут ваши мечты.</p>
             <p class="hint">Накопите на путешествие, машину или что-то ещё: укажите мечту и сумму,
               и откладывайте понемногу.</p>
           </section>`
    }
    <button class="btn btn-secondary btn-wide" data-action="new-goal">＋ Новая мечта</button>`;

  root.onclick = (e) => {
    const add = e.target.closest('[data-goal-add]');
    if (add) return navigate(`/goal/${encodeURIComponent(add.dataset.goalAdd)}/add`);
    const card = e.target.closest('[data-goal]');
    if (card) return navigate(`/goal/${encodeURIComponent(card.dataset.goal)}`);
    if (e.target.closest('[data-action="new-goal"]')) navigate('/goal/new');
  };
}

export function renderGoalEdit(root, id) {
  const { currency } = getState().settings;
  const existing = id ? getGoal(id) : null;
  if (id && !existing) return goBack();
  const symbol = currencySymbol(currency);
  let emoji = existing?.emoji ?? EMOJIS[0];

  root.innerHTML = `
    <header class="form-header">
      <h1>${existing ? 'Мечта' : 'Новая мечта'}</h1>
    </header>

    <div class="emoji-row" id="emojis">
      ${EMOJIS.map((e) => `<button class="emoji-chip" data-emoji="${e}">${e}</button>`).join('')}
    </div>

    <div class="card fields">
      <label class="field">
        <span>Мечта</span>
        <input id="name" type="text" maxlength="60" placeholder="Например, отпуск в Турции"
               value="${escapeHtml(existing?.name ?? '')}">
      </label>
      <label class="field">
        <span>Нужно, ${symbol}</span>
        <input id="target" inputmode="decimal" autocomplete="off" placeholder="0"
               value="${existing ? amountToInput(existing.target) : ''}">
      </label>
      <label class="field">
        <span>Уже накоплено, ${symbol}</span>
        <input id="saved" inputmode="decimal" autocomplete="off" placeholder="0"
               value="${existing?.saved ? amountToInput(existing.saved) : ''}">
      </label>
      <label class="field">
        <span>Срок</span>
        <input id="deadline" type="date" min="${todayISO()}" value="${existing?.deadline ?? ''}">
      </label>
    </div>
    <p class="hint">Срок необязателен: с ним приложение посчитает, сколько откладывать в месяц.</p>

    ${existing ? '<button class="btn btn-danger" id="delete">Удалить мечту</button>' : ''}
  `;

  const nameEl = root.querySelector('#name');
  const targetEl = root.querySelector('#target');
  const savedEl = root.querySelector('#saved');

  function renderEmojis() {
    root.querySelectorAll('[data-emoji]').forEach((b) => b.classList.toggle('active', b.dataset.emoji === emoji));
  }

  const validate = () =>
    setMainButtonEnabled(nameEl.value.trim() !== '' && parseAmount(targetEl.value) !== null);
  nameEl.addEventListener('input', validate);
  bindAmountInput(targetEl, validate);
  bindAmountInput(savedEl);

  root.onclick = async (e) => {
    const chip = e.target.closest('[data-emoji]');
    if (chip) {
      emoji = chip.dataset.emoji;
      haptic('light');
      renderEmojis();
      return;
    }
    if (e.target.closest('#delete') && (await confirm('Удалить эту мечту?'))) {
      deleteGoal(existing.id);
      haptic('warning');
      goBack();
    }
  };

  function save() {
    const target = parseAmount(targetEl.value);
    const name = nameEl.value.trim();
    if (!name || target === null) return haptic('error');
    saveGoal({
      ...(existing ? { id: existing.id } : {}),
      emoji,
      name,
      target,
      saved: parseAmount(savedEl.value) ?? 0,
      deadline: root.querySelector('#deadline').value || null,
    });
    haptic('success');
    goBack();
  }

  renderEmojis();
  showBackButton(goBack);
  showMainButton('Сохранить', save);
  validate();
  if (!existing) nameEl.focus();
}

export function renderGoalAdd(root, id) {
  const { currency } = getState().settings;
  const goal = getGoal(id);
  if (!goal) return goBack();

  root.innerHTML = `
    <header class="form-header">
      <h1>${goal.emoji} ${escapeHtml(goal.name)}</h1>
    </header>
    <p class="hint">
      Накоплено ${formatMoney(goal.saved, currency)} из ${formatMoney(goal.target, currency)}.
      Сколько отложить сейчас?
    </p>

    <label class="amount-field">
      <input id="amount" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Сумма">
      <span class="currency">${currencySymbol(currency)}</span>
    </label>
  `;

  const amountEl = root.querySelector('#amount');
  bindAmountInput(amountEl, () => setMainButtonEnabled(parseAmount(amountEl.value) !== null));

  function save() {
    const amount = parseAmount(amountEl.value);
    if (amount === null) return haptic('error');
    addToGoal(goal.id, amount);
    haptic('success');
    goBack();
  }

  showBackButton(goBack);
  showMainButton('Отложить', save);
  setMainButtonEnabled(false);
  amountEl.focus();
}
