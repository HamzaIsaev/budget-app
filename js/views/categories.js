// Managing categories: rename, change the emoji, hide built-in ones, and add
// one's own. Categories are never deleted, only hidden, so past records keep
// showing their category.

import { categoriesFor, getCategory, saveCategory } from '../store.js';
import { escapeHtml } from '../format.js';
import { showBackButton, showMainButton, setMainButtonEnabled, haptic } from '../telegram.js';
import { goBack, navigate } from '../app.js';

const SUGGESTED_EMOJIS = [
  '🛒', '🍔', '☕', '🍕', '🍺', '🚕', '🚗', '⛽', '🏠', '💡', '📱', '💊',
  '💅', '👕', '🛍️', '🎮', '🎬', '✈️', '📚', '🐶', '👶', '🎁', '💼', '💰',
];

// Remembered so returning from an editor keeps the same list.
let listType = 'expense';

export function renderCategories(root) {
  const cats = categoriesFor(listType, { includeHidden: true });

  root.innerHTML = `
    <header class="form-header">
      <h1>Категории</h1>
    </header>

    <div class="segmented" role="tablist">
      <button role="tab" data-type="expense" class="${listType === 'expense' ? 'active' : ''}">Расходы</button>
      <button role="tab" data-type="income" class="${listType === 'income' ? 'active' : ''}">Доходы</button>
    </div>

    <ul class="card cat-list">
      ${cats
        .map(
          (c) => `
        <li class="cat-item ${c.hidden ? 'is-hidden' : ''}" data-cat="${escapeHtml(c.id)}">
          <span class="tx-emoji">${c.emoji}</span>
          <span class="cat-item-name">${escapeHtml(c.name)}</span>
          ${c.hidden ? '<span class="cat-item-tag">скрыта</span>' : ''}
          <span class="chevron-right" aria-hidden="true">›</span>
        </li>`,
        )
        .join('')}
    </ul>

    <button class="btn btn-secondary btn-wide" data-action="new">＋ Новая категория</button>
  `;

  root.onclick = (e) => {
    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn && typeBtn.dataset.type !== listType) {
      listType = typeBtn.dataset.type;
      haptic('light');
      return renderCategories(root);
    }
    const item = e.target.closest('[data-cat]');
    if (item) return navigate(`/category/${encodeURIComponent(item.dataset.cat)}`);
    if (e.target.closest('[data-action="new"]')) navigate(`/category/new/${listType}`);
  };

  showBackButton(goBack);
}

/** The first emoji (grapheme) of `text`, so a pasted sequence stays one symbol. */
function firstGrapheme(text) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (Intl.Segmenter) {
    return new Intl.Segmenter().segment(trimmed)[Symbol.iterator]().next().value.segment;
  }
  return Array.from(trimmed)[0];
}

export function renderCategoryEdit(root, id, newType) {
  const existing = id ? getCategory(id) : null;
  if (id && !existing) return goBack();
  const type = existing?.type ?? (newType === 'income' ? 'income' : 'expense');
  let emoji = existing?.emoji ?? '📌';

  root.innerHTML = `
    <header class="form-header">
      <h1>${existing ? 'Категория' : type === 'income' ? 'Новая категория дохода' : 'Новая категория расхода'}</h1>
    </header>

    <div class="cat-edit-head">
      <input id="emoji" class="emoji-input" value="${escapeHtml(emoji)}" aria-label="Эмодзи" autocomplete="off">
      <input id="name" class="name-input" type="text" maxlength="30" placeholder="Название"
             value="${escapeHtml(existing?.name ?? '')}">
    </div>
    <p class="hint">Нажмите на значок, чтобы ввести свой эмодзи, или выберите ниже.</p>

    <div class="emoji-grid">
      ${SUGGESTED_EMOJIS.map((e) => `<button class="emoji-chip" data-emoji="${e}">${e}</button>`).join('')}
    </div>

    ${
      existing
        ? `<button class="btn btn-secondary btn-wide" id="toggle-hidden">
             ${existing.hidden ? 'Показать категорию' : 'Скрыть категорию'}
           </button>
           <p class="hint">Скрытая категория не предлагается при добавлении записей, но старые записи с ней сохраняются.</p>`
        : ''
    }
  `;

  const emojiEl = root.querySelector('#emoji');
  const nameEl = root.querySelector('#name');
  const validate = () => setMainButtonEnabled(nameEl.value.trim() !== '' && emoji !== '');

  function markEmoji() {
    root.querySelectorAll('[data-emoji]').forEach((b) => b.classList.toggle('active', b.dataset.emoji === emoji));
  }

  emojiEl.addEventListener('focus', () => emojiEl.select());
  emojiEl.addEventListener('input', () => {
    emoji = firstGrapheme(emojiEl.value);
    emojiEl.value = emoji;
    markEmoji();
    validate();
  });
  nameEl.addEventListener('input', validate);

  root.onclick = (e) => {
    const chip = e.target.closest('[data-emoji]');
    if (chip) {
      emoji = chip.dataset.emoji;
      emojiEl.value = emoji;
      haptic('light');
      markEmoji();
      validate();
      return;
    }
    if (e.target.closest('#toggle-hidden')) {
      saveCategory({ id: existing.id, hidden: !existing.hidden });
      haptic('success');
      goBack();
    }
  };

  function save() {
    const name = nameEl.value.trim();
    if (!name || !emoji) return haptic('error');
    saveCategory({ ...(existing ? { id: existing.id } : { type }), name, emoji });
    haptic('success');
    goBack();
  }

  markEmoji();
  showBackButton(goBack);
  showMainButton('Сохранить', save);
  validate();
  if (!existing) nameEl.focus();
}
