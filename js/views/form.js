import {
  categoriesFor,
  getTransaction,
  saveTransaction,
  deleteTransaction,
  getState,
} from '../store.js';
import { parseAmount, amountToInput, todayISO, escapeHtml } from '../format.js';
import {
  showBackButton,
  showMainButton,
  setMainButtonEnabled,
  haptic,
  confirm,
} from '../telegram.js';
import { goBack, navigate } from '../app.js';

const CURRENCY_SYMBOLS = { RUB: '₽', USD: '$', EUR: '€' };

export function renderForm(root, { id, type }) {
  const existing = id ? getTransaction(id) : null;
  if (id && !existing) return navigate('/');

  const draft = existing
    ? { ...existing, amountInput: amountToInput(existing.amount) }
    : { type, amountInput: '', categoryId: null, date: todayISO(), note: '' };

  const { currency } = getState().settings;

  root.innerHTML = `
    <header class="form-header">
      <h1>${existing ? 'Редактирование' : 'Новая запись'}</h1>
    </header>

    <div class="segmented" role="tablist">
      <button role="tab" data-type="expense">Расход</button>
      <button role="tab" data-type="income">Доход</button>
    </div>

    <label class="amount-field">
      <input id="amount" inputmode="decimal" autocomplete="off" placeholder="0"
             value="${escapeHtml(draft.amountInput)}" aria-label="Сумма">
      <span class="currency">${CURRENCY_SYMBOLS[currency] ?? currency}</span>
    </label>

    <div class="field-label">Категория</div>
    <div class="categories" id="categories"></div>

    <div class="card fields">
      <label class="field">
        <span>Дата</span>
        <input id="date" type="date" value="${draft.date}" max="${todayISO()}">
      </label>
      <label class="field">
        <span>Комментарий</span>
        <input id="note" type="text" maxlength="120" placeholder="Необязательно"
               value="${escapeHtml(draft.note ?? '')}">
      </label>
    </div>

    ${existing ? '<button class="btn btn-danger" id="delete">Удалить запись</button>' : ''}
  `;

  const amountEl = root.querySelector('#amount');
  const categoriesEl = root.querySelector('#categories');

  function renderTypeAndCategories() {
    root.querySelectorAll('[data-type]').forEach((b) => {
      b.classList.toggle('active', b.dataset.type === draft.type);
    });
    const cats = categoriesFor(draft.type);
    if (!cats.some((c) => c.id === draft.categoryId)) draft.categoryId = null;
    categoriesEl.innerHTML = cats
      .map(
        (c) => `
        <button class="chip ${c.id === draft.categoryId ? 'active' : ''}" data-cat="${c.id}">
          <span class="chip-emoji">${c.emoji}</span>
          <span>${escapeHtml(c.name)}</span>
        </button>`,
      )
      .join('');
    validate();
  }

  function validate() {
    setMainButtonEnabled(parseAmount(amountEl.value) !== null && Boolean(draft.categoryId));
  }

  root.onclick = async (e) => {
    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn && typeBtn.dataset.type !== draft.type) {
      draft.type = typeBtn.dataset.type;
      haptic('light');
      renderTypeAndCategories();
      return;
    }
    const catBtn = e.target.closest('[data-cat]');
    if (catBtn) {
      draft.categoryId = catBtn.dataset.cat;
      haptic('light');
      renderTypeAndCategories();
      return;
    }
    if (e.target.closest('#delete')) {
      if (await confirm('Удалить эту запись?')) {
        deleteTransaction(existing.id);
        haptic('warning');
        goBack();
      }
    }
  };

  amountEl.addEventListener('input', () => {
    // Keep only digits and a single decimal separator with up to 2 digits.
    const cleaned = amountEl.value
      .replace(/[^\d.,]/g, '')
      .replace(/\./g, ',')
      .replace(/,(?=.*,)/g, '')
      .replace(/(,\d{2})\d+$/, '$1');
    if (cleaned !== amountEl.value) amountEl.value = cleaned;
    validate();
  });

  function save() {
    const amount = parseAmount(amountEl.value);
    if (amount === null || !draft.categoryId) {
      haptic('error');
      return;
    }
    saveTransaction({
      ...(existing ? { id: existing.id } : {}),
      type: draft.type,
      amount,
      categoryId: draft.categoryId,
      date: root.querySelector('#date').value || todayISO(),
      note: root.querySelector('#note').value.trim(),
    });
    haptic('success');
    goBack();
  }

  showBackButton(goBack);
  showMainButton('Сохранить', save);
  renderTypeAndCategories();
  if (!existing) amountEl.focus();
}
