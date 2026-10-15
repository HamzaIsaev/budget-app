import { initTelegram, hideBackButton, hideMainButton } from './telegram.js';
import { renderHome } from './views/home.js';
import { renderForm } from './views/form.js';

const root = document.getElementById('app');

// Routes: #/            — month overview
//         #/new/expense — new expense (or /new/income)
//         #/edit/<id>   — edit an existing transaction
function route() {
  const [, view, param] = (location.hash.slice(1) || '/').split('/');

  // Each view sets up its own Telegram buttons; reset whatever the last one left.
  hideBackButton();
  hideMainButton();
  window.scrollTo(0, 0);

  if (view === 'new') {
    renderForm(root, { type: param === 'income' ? 'income' : 'expense' });
  } else if (view === 'edit' && param) {
    renderForm(root, { id: decodeURIComponent(param) });
  } else {
    renderHome(root);
  }
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
window.addEventListener('hashchange', route);
route();
