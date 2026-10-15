import { syncStatusHtml, handleSyncClick } from '../sync-status.js';

// The "More" tab: settings and app info. Currency and export will live here too.
export function renderMore(root) {
  root.innerHTML = `
    <header class="page-header">
      <h1>Ещё</h1>
    </header>

    <div class="field-label">Синхронизация</div>
    <section class="card more-card">
      ${syncStatusHtml()}
      <p class="hint more-note">
        Записи хранятся в облаке Telegram и одинаковы на всех ваших устройствах.
        Нажмите на статус, чтобы синхронизировать сейчас.
      </p>
    </section>
  `;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action]');
    if (el) handleSyncClick(el);
  };
}
