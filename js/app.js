import { initTelegram, hideBackButton, hideMainButton } from './telegram.js';
import { renderHome } from './views/home.js';
import { renderForm } from './views/form.js';
import { renderStats } from './views/stats.js';
import { renderMore } from './views/more.js';
import { renderBudgetEdit, renderIncomeGoalEdit } from './views/budget.js';
import { renderDreams, renderGoalEdit, renderGoalAdd } from './views/goals.js';
import { mountTabBar, updateTabBar } from './tabbar.js';
import { subscribe, syncNow } from './store.js';

const SYNC_INTERVAL_MS = 30_000;

const root = document.getElementById('app');

// Tabs (with the tab bar):  #/  #/stats  #/dreams  #/more
// Sub-pages (Telegram back button, no tab bar):
//   #/new/expense — new expense (or /new/income)
//   #/edit/<id>   — edit an existing transaction
//   #/budget/edit   — set the monthly spending plan (a total or items)
//   #/budget/income — set the monthly income goal
//   #/goal/new, #/goal/<id> — create or edit a savings goal
//   #/goal/<id>/add — put money aside for a goal
const TAB_VIEWS = { '': renderHome, stats: renderStats, dreams: renderDreams, more: renderMore };

function route() {
  const [, view = '', param, action] = (location.hash.slice(1) || '/').split('/');

  // Each view sets up its own Telegram buttons; reset whatever the last one left.
  hideBackButton();
  hideMainButton();
  window.scrollTo(0, 0);

  if (view === 'new') {
    renderForm(root, { type: param === 'income' ? 'income' : 'expense' });
  } else if (view === 'edit' && param) {
    renderForm(root, { id: decodeURIComponent(param) });
  } else if (view === 'budget' && param === 'edit') {
    renderBudgetEdit(root);
  } else if (view === 'budget' && param === 'income') {
    renderIncomeGoalEdit(root);
  } else if (view === 'goal' && param) {
    const id = param === 'new' ? null : decodeURIComponent(param);
    if (id && action === 'add') renderGoalAdd(root, id);
    else renderGoalEdit(root, id);
  } else {
    const tab = view in TAB_VIEWS ? view : '';
    TAB_VIEWS[tab](root);
    return updateTabBar(`/${tab}`);
  }
  updateTabBar(null);
}

/** Switches tabs without adding history, so Back never walks through tabs. */
export function switchTab(path) {
  if (location.hash === `#${path}`) return route();
  location.replace(`#${path}`);
}

// True once the user has moved between screens inside the app, so going back
// stays within the app instead of leaving it (e.g. after opening a deep link).
let hasInternalHistory = false;

export function navigate(path) {
  if (location.hash === `#${path}`) return route();
  hasInternalHistory = true;
  location.hash = path;
}

export function goBack() {
  if (hasInternalHistory) history.back();
  else location.replace('#/');
}

initTelegram();
mountTabBar((tab) => (tab.add ? navigate(tab.path) : switchTab(tab.path)));
window.addEventListener('hashchange', route);
route();

// Data from another device: refresh read-only screens, but never a form the
// user may be typing into.
subscribe(() => {
  const [, view = '', param] = location.hash.slice(1).split('/');
  if (view in TAB_VIEWS && !param) route();
});
syncNow();
// Push pending changes before Telegram suspends the app, and pull what other
// devices changed when it comes back: on phones Telegram keeps the app alive in
// the background, so returning to it doesn't restart it.
document.addEventListener('visibilitychange', () => syncNow());
// While open, pick up changes from other devices.
setInterval(() => {
  if (document.visibilityState === 'visible') syncNow();
}, SYNC_INTERVAL_MS);
