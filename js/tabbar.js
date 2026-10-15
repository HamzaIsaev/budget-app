// Bottom tab bar. Lives outside #app so screens can re-render freely; the
// router shows it on top-level tabs and hides it on sub-pages (forms).

const icon = (paths) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const TABS = [
  {
    path: '/',
    label: 'Главная',
    icon: icon('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h5v-6h4v6h5V9"/>'),
  },
  {
    path: '/stats',
    label: 'Статистика',
    icon: icon('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
  },
  { path: '/new/expense', label: 'Добавить', add: true },
  {
    path: '/dreams',
    label: 'Мечты',
    icon: icon(
      '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    ),
  },
  {
    path: '/more',
    label: 'Ещё',
    icon: icon('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  },
];

const ADD_ICON = icon('<path d="M12 5v14"/><path d="M5 12h14"/>');

let bar = null;

/** Creates the bar; `onSelect(tab)` is called with the tapped tab. */
export function mountTabBar(onSelect) {
  bar = document.createElement('nav');
  bar.className = 'tabbar';
  bar.innerHTML = TABS.map((t, i) =>
    t.add
      ? `<button class="tab tab-add" data-tab="${i}" aria-label="${t.label}"><span>${ADD_ICON}</span></button>`
      : `<button class="tab" data-tab="${i}">${t.icon}<span class="tab-label">${t.label}</span></button>`,
  ).join('');
  bar.addEventListener('click', (e) => {
    const el = e.target.closest('[data-tab]');
    if (el) onSelect(TABS[Number(el.dataset.tab)]);
  });
  document.body.appendChild(bar);
}

/** Shows the bar with `activePath` highlighted, or hides it when null. */
export function updateTabBar(activePath) {
  document.body.classList.toggle('has-tabbar', activePath !== null);
  bar.hidden = activePath === null;
  bar.querySelectorAll('[data-tab]').forEach((el) => {
    const tab = TABS[Number(el.dataset.tab)];
    el.classList.toggle('active', tab.path === activePath);
    if (tab.path === activePath) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}
