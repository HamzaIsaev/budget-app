// Persistence. Amounts are stored as integers in minor units (kopecks/cents) to
// avoid floating-point errors. The state lives in localStorage for instant
// startup and is synced to Telegram CloudStorage so it survives reinstalls and
// is shared between the user's devices.

import { userId } from './telegram.js';
import { cloudAvailable, cloudUnavailableReason, loadFromCloud, saveToCloud } from './cloud.js';

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
    plansUpdatedAt: 0,
    // Monthly income goals, same shape as `plans`.
    incomeGoals: {},
    incomeGoalsUpdatedAt: 0,
    // Savings goals ("dreams"): { id, emoji, name, target, saved, deadline?, createdAt, updatedAt }.
    goals: [],
    // Deleted transaction ids → deletion time, so a deletion on one device
    // isn't undone by another device that still has the transaction.
    deleted: {},
    updatedAt: 0,
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

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save', e);
  }
}

function persist() {
  state.updatedAt = Date.now();
  saveLocal();
  scheduleSync();
}

export function getState() {
  return state;
}

/** Called with the new state when data arrives from another device. */
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
  const now = Date.now();
  if (tx.id) {
    state.transactions = state.transactions.map((t) =>
      t.id === tx.id ? { ...t, ...tx, updatedAt: now } : t,
    );
  } else {
    state.transactions = [
      ...state.transactions,
      { ...tx, id: newId(), currency: state.settings.currency, createdAt: now, updatedAt: now },
    ];
  }
  persist();
}

export function deleteTransaction(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  state.deleted = { ...state.deleted, [id]: Date.now() };
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

// Where each kind of plan lives: 'expense' is planned spending, 'income' is
// the earnings goal.
const PLAN_FIELDS = {
  expense: { plans: 'plans', updatedAt: 'plansUpdatedAt' },
  income: { plans: 'incomeGoals', updatedAt: 'incomeGoalsUpdatedAt' },
};

// The stored plan in effect for a month: plans carry forward to later months
// until a new one is set, so changing a plan never rewrites the past.
function planEntry(month, kind) {
  const plans = state[PLAN_FIELDS[kind].plans];
  const from = Object.keys(plans)
    .filter((m) => m <= month)
    .sort()
    .pop();
  return from ? plans[from] : null;
}

/**
 * The month's plan total in minor units, or null. A spending plan is stored
 * either as a single number or as itemized { items: [{ name, amount,
 * categoryId? }] }, whose total is the sum of the items.
 */
export function getPlan(month, kind = 'expense') {
  const entry = planEntry(month, kind);
  if (entry?.items) return entry.items.reduce((sum, i) => sum + i.amount, 0) || null;
  return entry;
}

/** The spending plan's items for the month, or null if it is a plain total. */
export function getPlanItems(month) {
  return planEntry(month, 'expense')?.items ?? null;
}

/**
 * Sets the plan from `month` onward: a number, `{ items }` for an itemized
 * spending plan, or `null` to remove it from that month on.
 */
export function setPlan(month, value, kind = 'expense') {
  const fields = PLAN_FIELDS[kind];
  const plans = Object.fromEntries(Object.entries(state[fields.plans]).filter(([m]) => m < month));
  plans[month] = value;
  state[fields.plans] = plans;
  state[fields.updatedAt] = Date.now();
  persist();
}

// --- Savings goals ("dreams") ---------------------------------------------------

export function getGoals() {
  return [...state.goals].sort((a, b) => a.createdAt - b.createdAt);
}

export function getGoal(id) {
  return state.goals.find((g) => g.id === id);
}

/** Creates a goal (no `id`) or updates one. Returns its id. */
export function saveGoal(goal) {
  const now = Date.now();
  if (goal.id) {
    state.goals = state.goals.map((g) => (g.id === goal.id ? { ...g, ...goal, updatedAt: now } : g));
  } else {
    goal = { saved: 0, ...goal, id: newId(), createdAt: now, updatedAt: now };
    state.goals = [...state.goals, goal];
  }
  persist();
  return goal.id;
}

/** Puts money aside for a goal. */
export function addToGoal(id, amount) {
  const goal = getGoal(id);
  if (goal) saveGoal({ id, saved: goal.saved + amount });
}

export function deleteGoal(id) {
  state.goals = state.goals.filter((g) => g.id !== id);
  state.deleted = { ...state.deleted, [id]: Date.now() };
  persist();
}

// --- Cloud sync -----------------------------------------------------------------

// What goes to the cloud. Categories are left out: built-in ones come from code.
function cloudData(s) {
  const { version, settings, transactions, goals, deleted, updatedAt } = s;
  const { plans, plansUpdatedAt, incomeGoals, incomeGoalsUpdatedAt } = s;
  return {
    version,
    settings,
    transactions,
    goals,
    plans,
    plansUpdatedAt,
    incomeGoals,
    incomeGoalsUpdatedAt,
    deleted,
    updatedAt,
  };
}

const itemTime = (t) => t.updatedAt ?? t.createdAt ?? 0;

// Union of two lists of records by id: the latest edit wins, and a deletion
// wins over edits made before it.
function mergeById(a = [], b = [], deleted) {
  const byId = new Map();
  for (const item of [...a, ...b]) {
    const current = byId.get(item.id);
    if (!current || itemTime(item) > itemTime(current)) byId.set(item.id, item);
  }
  return [...byId.values()].filter((item) => !(deleted[item.id] >= itemTime(item)));
}

/**
 * Combines two copies of the data, e.g. this device's and the cloud's, so that
 * changes made on either side while the other was out of date are kept.
 * Per transaction and goal the latest edit wins; a deletion wins over older edits.
 */
function merge(a, b) {
  const deleted = { ...a.deleted };
  for (const [id, at] of Object.entries(b.deleted ?? {})) deleted[id] = Math.max(deleted[id] ?? 0, at);

  const transactions = mergeById(a.transactions, b.transactions, deleted);
  const goals = mergeById(a.goals, b.goals, deleted);

  const newer = (b.updatedAt ?? 0) > a.updatedAt ? b : a;
  return {
    ...a,
    settings: { ...a.settings, ...newer.settings },
    transactions,
    goals,
    // Each kind of plan comes whole from whichever side changed it last.
    ...Object.fromEntries(
      Object.values(PLAN_FIELDS).flatMap((f) => {
        const from = (b[f.updatedAt] ?? 0) > (a[f.updatedAt] ?? 0) ? b : a;
        return [
          [f.plans, from[f.plans] ?? {}],
          [f.updatedAt, from[f.updatedAt] ?? 0],
        ];
      }),
    ),
    deleted,
    updatedAt: Math.max(a.updatedAt, b.updatedAt ?? 0),
  };
}

const sameData = (x, y) => JSON.stringify(cloudData(x)) === JSON.stringify(cloudData(y));

let syncing = Promise.resolve();
let syncTimer = null;

// Shown on the home screen so problems on a device are visible, not just logged.
let syncStatus = cloudAvailable()
  ? { state: 'idle' }
  : { state: 'off', error: cloudUnavailableReason() };
const statusListeners = new Set();

export function getSyncStatus() {
  return syncStatus;
}

export function onSyncStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

function setSyncStatus(next) {
  syncStatus = next;
  statusListeners.forEach((fn) => fn(syncStatus));
}

function scheduleSync() {
  if (!cloudAvailable()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 800);
}

/**
 * Pulls the cloud copy, merges it with this device's data and pushes the result
 * back if anything differs. Runs on startup, after changes and when the app is
 * hidden. Calls never overlap. Failures keep the local copy and retry later.
 */
export function syncNow() {
  clearTimeout(syncTimer);
  if (!cloudAvailable()) return Promise.resolve();
  syncing = syncing.then(async () => {
    setSyncStatus({ ...syncStatus, state: 'syncing' });
    try {
      const remote = await loadFromCloud();
      const merged = remote ? merge(state, remote) : state;
      if (!sameData(merged, state)) {
        state = merged;
        saveLocal();
        listeners.forEach((fn) => fn(state));
      }
      if (!remote || !sameData(merged, remote)) await saveToCloud(cloudData(merged));
      setSyncStatus({ state: 'ok', at: Date.now() });
    } catch (e) {
      console.error('Cloud sync failed', e);
      setSyncStatus({ state: 'error', error: e.message || String(e), at: syncStatus.at });
    }
  });
  return syncing;
}
