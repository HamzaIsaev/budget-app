// Local persistence. Amounts are stored as integers in minor units (kopecks/cents)
// to avoid floating-point errors. The shape is versioned so we can migrate later
// when a backend and investment assets are added.

import { userId } from './telegram.js';

const SCHEMA_VERSION = 1;
const STORAGE_KEY = `budget:v${SCHEMA_VERSION}:${userId() ?? 'local'}`;

export const DEFAULT_CATEGORIES = [
  { id: 'food', type: 'expense', name: 'Продукты', emoji: '🛒' },
  { id: 'fastfood', type: 'expense', name: 'Фастфуд', emoji: '🍔' },
  { id: 'cafe', type: 'expense', name: 'Кафе', emoji: '☕' },
  { id: 'transport', type: 'expense', name: 'Транспорт', emoji: '🚕' },
  { id: 'auto', type: 'expense', name: 'Авто', emoji: '🚗' },
  { id: 'home', type: 'expense', name: 'Жильё', emoji: '🏠' },
  { id: 'subs', type: 'expense', name: 'Подписки', emoji: '📱' },
  { id: 'health', type: 'expense', name: 'Здоровье', emoji: '💊' },
  { id: 'beauty', type: 'expense', name: 'Красота', emoji: '💅' },
  { id: 'clothes', type: 'expense', name: 'Одежда', emoji: '👕' },
  { id: 'shopping', type: 'expense', name: 'Покупки', emoji: '🛍️' },
  { id: 'fun', type: 'expense', name: 'Развлечения', emoji: '🎮' },
  { id: 'travel', type: 'expense', name: 'Путешествия', emoji: '✈️' },
  { id: 'education', type: 'expense', name: 'Образование', emoji: '📚' },
  { id: 'other-exp', type: 'expense', name: 'Другое', emoji: '📦' },
  { id: 'salary', type: 'income', name: 'Зарплата', emoji: '💼' },
  { id: 'freelance', type: 'income', name: 'Подработка', emoji: '🧑‍💻' },
  { id: 'gift', type: 'income', name: 'Подарки', emoji: '🎁' },
  { id: 'other-inc', type: 'income', name: 'Другое', emoji: '💰' },
];

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: { currency: 'RUB' },
    categories: DEFAULT_CATEGORIES,
    transactions: [],
    // Planned monthly spending, keyed by the month it starts from (`YYYY-MM`).
    plans: {},
  };
}

// Built-in categories always come from DEFAULT_CATEGORIES, so new or renamed
// defaults reach users who already have saved data. Anything stored that isn't
// a default (future user-created categories) is kept after them.
function mergeCategories(stored = []) {
  const defaultIds = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  return [...DEFAULT_CATEGORIES, ...stored.filter((c) => !defaultIds.has(c.id))];
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    return { ...emptyState(), ...data, categories: mergeCategories(data.categories) };
  } catch {
    return emptyState();
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save', e);
  }
  listeners.forEach((fn) => fn(state));
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function categoriesFor(type) {
  return state.categories.filter((c) => c.type === type);
}

export function getCategory(id) {
  return state.categories.find((c) => c.id === id);
}

export function getTransaction(id) {
  return state.transactions.find((t) => t.id === id);
}

function newId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** @param {{type:'income'|'expense', amount:number, categoryId:string, date:string, note?:string}} tx */
export function saveTransaction(tx) {
  if (tx.id) {
    state.transactions = state.transactions.map((t) => (t.id === tx.id ? { ...t, ...tx } : t));
  } else {
    state.transactions = [
      ...state.transactions,
      { ...tx, id: newId(), currency: state.settings.currency, createdAt: Date.now() },
    ];
  }
  persist();
}

export function deleteTransaction(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  persist();
}

/** Transactions whose date falls in the given month (`YYYY-MM`), newest first. */
export function transactionsForMonth(month) {
  return state.transactions
    .filter((t) => t.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function summarize(transactions) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

/**
 * Planned spending for a month, in minor units, or null. A plan carries forward
 * to later months until a new one is set, so changing it never rewrites the past.
 */
export function getPlan(month) {
  const from = Object.keys(state.plans)
    .filter((m) => m <= month)
    .sort()
    .pop();
  return from ? state.plans[from] : null;
}

/** Sets the plan from `month` onward; `null` removes it from that month on. */
export function setPlan(month, amount) {
  state.plans = Object.fromEntries(Object.entries(state.plans).filter(([m]) => m < month));
  state.plans[month] = amount;
  persist();
}
