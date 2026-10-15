# Budget: Telegram Mini App

Учёт доходов и расходов внутри Telegram. В планах: бюджеты, плановые траты и портфель активов (паи, крипта).

## Структура

```
index.html          точка входа, подключает telegram-web-app.js
styles.css          стили на переменных темы Telegram (--tg-theme-*)
js/app.js           роутер на hash (#/, #/new/expense, #/edit/<id>)
js/store.js         данные + сохранение в localStorage (суммы в копейках)
js/telegram.js      обёртка над Telegram.WebApp с фолбэком для браузера
js/format.js        форматирование денег и дат
js/views/home.js    обзор месяца и список операций
js/views/form.js    добавление и редактирование операции
js/views/stats.js   статистика: категории и динамика по месяцам
js/views/plan.js    план расходов на месяц
js/month.js         выбранный месяц, общий для экранов
scripts/bump_version.py  версии файлов в index.html против смешанного кэша
```

Сборка не нужна: это статические файлы на ES-модулях.

## Локальный запуск

```bash
python3 -m http.server 5173
```

Откройте http://localhost:5173. Вне Telegram нативная кнопка «Сохранить» заменяется обычной кнопкой на странице.

## Публикация

```bash
python3 scripts/bump_version.py && git add -A && git commit -m "…" && git push
```

GitHub Pages обновляется примерно за минуту. Скрипт версий нужен обязательно: без него телефон может
собрать новые и старые файлы из кэша вперемешку, и приложение не запустится.

## Подключение к Telegram

1. Выложите папку на любой HTTPS-хостинг (GitHub Pages, Vercel, Netlify, Cloudflare Pages).
2. В [@BotFather](https://t.me/BotFather): `/newbot`, затем `/newapp` (или Bot Settings → Menu Button), и укажите URL.
3. Откройте бота и запустите мини-апп.

Для теста без деплоя можно пробросить локальный сервер через `cloudflared tunnel --url http://localhost:5173` или ngrok.

## Данные

Пока всё хранится в `localStorage` под ключом `budget:v1:<telegram user id>`, то есть только на этом устройстве. Синхронизация между устройствами появится вместе с бэкендом.
