// The small cloud-sync line at the bottom of the home screen. It shows the app
// version too, which tells whether a device is running a stale cached build.

import { getSyncStatus, onSyncStatus, syncNow } from './store.js';
import { escapeHtml } from './format.js';

// Set by scripts/bump_version.py through the import map, e.g. ?v=20261015203015.
const VERSION = new URL(import.meta.url).searchParams.get('v') ?? 'dev';

function text({ state, at, error }) {
  const time = at ? new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null;
  switch (state) {
    case 'off':
      return `☁️ Облако выключено: ${error}`;
    case 'syncing':
      return '☁️ Синхронизация…';
    case 'ok':
      return `☁️ Синхронизировано в ${time}`;
    case 'error':
      return `⚠️ Ошибка синхронизации: ${error}. Нажмите, чтобы повторить`;
    default:
      return '☁️ Ожидает синхронизации';
  }
}

export function syncStatusHtml() {
  return `
    <button class="sync-status" data-action="sync">
      <span id="sync-text">${escapeHtml(text(getSyncStatus()))}</span>
      <span class="sync-version">версия ${VERSION}</span>
    </button>`;
}

export function handleSyncClick(el) {
  if (el.dataset.action !== 'sync') return false;
  syncNow();
  return true;
}

onSyncStatus((status) => {
  const el = document.getElementById('sync-text');
  if (el) el.textContent = text(status);
});
