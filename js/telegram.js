// Thin wrapper over Telegram.WebApp. Every call degrades gracefully when the
// app is opened in a regular browser (for local development).

const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg?.initData);

export function initTelegram() {
  if (!inTelegram) {
    document.documentElement.dataset.env = 'browser';
    return;
  }
  tg.ready();
  tg.expand();
  applyTheme();
  tg.onEvent('themeChanged', applyTheme);
}

function applyTheme() {
  document.documentElement.dataset.scheme = tg.colorScheme;
  tg.setHeaderColor?.('secondary_bg_color');
  tg.setBackgroundColor?.('secondary_bg_color');
}

export function userId() {
  return tg?.initDataUnsafe?.user?.id ?? null;
}

export function userFirstName() {
  return tg?.initDataUnsafe?.user?.first_name ?? null;
}

export function haptic(kind = 'light') {
  if (!inTelegram) return;
  if (kind === 'success' || kind === 'error' || kind === 'warning') {
    tg.HapticFeedback?.notificationOccurred(kind);
  } else {
    tg.HapticFeedback?.impactOccurred(kind);
  }
}

// --- Back button -----------------------------------------------------------

let backHandler = null;

export function showBackButton(onClick) {
  if (!inTelegram) return;
  hideBackButton();
  backHandler = onClick;
  tg.BackButton.onClick(backHandler);
  tg.BackButton.show();
}

export function hideBackButton() {
  if (!inTelegram) return;
  if (backHandler) tg.BackButton.offClick(backHandler);
  backHandler = null;
  tg.BackButton.hide();
}

// --- Main button -------------------------------------------------------------
// Inside Telegram we use the native bottom button; in a browser we fall back to
// an in-page button so the flow is identical during development.

let mainHandler = null;

export function showMainButton(text, onClick) {
  hideMainButton();
  mainHandler = onClick;
  if (inTelegram) {
    tg.MainButton.setText(text);
    tg.MainButton.onClick(mainHandler);
    tg.MainButton.show();
    return;
  }
  const btn = document.createElement('button');
  btn.id = 'fallback-main-button';
  btn.className = 'main-button';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  document.body.appendChild(btn);
}

export function setMainButtonEnabled(enabled) {
  if (inTelegram) {
    enabled ? tg.MainButton.enable() : tg.MainButton.disable();
    tg.MainButton.setParams({
      color: enabled ? tg.themeParams.button_color : tg.themeParams.hint_color,
    });
    return;
  }
  const btn = document.getElementById('fallback-main-button');
  if (btn) btn.disabled = !enabled;
}

export function hideMainButton() {
  if (inTelegram) {
    if (mainHandler) tg.MainButton.offClick(mainHandler);
    tg.MainButton.hide();
  } else {
    document.getElementById('fallback-main-button')?.remove();
  }
  mainHandler = null;
}

export async function confirm(message) {
  if (!inTelegram) return window.confirm(message);
  return new Promise((resolve) => tg.showConfirm(message, resolve));
}
