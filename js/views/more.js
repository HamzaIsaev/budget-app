import { getState, setSetting } from '../store.js';
import { currencySymbol } from '../format.js';
import { haptic, confirm } from '../telegram.js';
import { navigate } from '../app.js';
import { resetMonth } from '../month.js';
import { syncStatusHtml, handleSyncClick } from '../sync-status.js';

const CURRENCIES = [
  ['RUB', 'Российский рубль'],
  ['USD', 'Доллар США'],
  ['EUR', 'Евро'],
  ['KZT', 'Казахстанский тенге'],
  ['UAH', 'Украинская гривна'],
  ['BYN', 'Белорусский рубль'],
  ['UZS', 'Узбекский сум'],
  ['KGS', 'Киргизский сом'],
  ['AMD', 'Армянский драм'],
  ['GEL', 'Грузинский лари'],
  ['AZN', 'Азербайджанский манат'],
  ['TRY', 'Турецкая лира'],
  ['AED', 'Дирхам ОАЭ'],
  ['GBP', 'Фунт стерлингов'],
  ['CNY', 'Китайский юань'],
];

// The "More" tab: settings and app info.
export function renderMore(root) {
  const { currency, monthStartDay = 1 } = getState().settings;

  root.innerHTML = `
    <header class="page-header">
      <h1>Ещё</h1>
    </header>

    <div class="field-label">Настройки</div>
    <section class="card fields">
      <label class="field">
        <span>Валюта</span>
        <select id="currency" class="field-select">
          ${CURRENCIES.map(
            ([code, name]) =>
              `<option value="${code}" ${code === currency ? 'selected' : ''}>${currencySymbol(code)} ${name}</option>`,
          ).join('')}
        </select>
      </label>
      <label class="field">
        <span>Начало месяца</span>
        <select id="start-day" class="field-select">
          ${Array.from({ length: 28 }, (_, i) => i + 1)
            .map((d) => `<option value="${d}" ${d === monthStartDay ? 'selected' : ''}>${d}-го числа</option>`)
            .join('')}
        </select>
      </label>
      <button class="field field-link" data-action="categories">
        <span>Категории</span>
        <span class="chevron-right" aria-hidden="true">›</span>
      </button>
    </section>
    <p class="hint more-note-left">
      Начало месяца — например, день зарплаты: тогда бюджет и статистика считаются от него.
    </p>

    <div class="field-label">Синхронизация</div>
    <section class="card more-card">
      ${syncStatusHtml()}
      <p class="hint more-note">
        Записи хранятся в облаке Telegram и одинаковы на всех ваших устройствах.
        Нажмите на статус, чтобы синхронизировать сейчас.
      </p>
    </section>
  `;

  const currencyEl = root.querySelector('#currency');
  currencyEl.addEventListener('change', async () => {
    const ok = await confirm('Суммы не пересчитываются по курсу: меняется только значок валюты. Продолжить?');
    if (!ok) {
      currencyEl.value = getState().settings.currency;
      return;
    }
    setSetting('currency', currencyEl.value);
    haptic('success');
  });

  root.querySelector('#start-day').addEventListener('change', (e) => {
    setSetting('monthStartDay', Number(e.target.value));
    resetMonth();
    haptic('success');
  });

  root.onclick = (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (handleSyncClick(el)) return;
    if (el.dataset.action === 'categories') navigate('/categories');
  };
}
