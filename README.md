# 💍 Свадебные фото — веб-приложение (типа Fotify)

Гость сканирует QR-код → открывает страницу → вводит имя → снимает фото или
выбирает из галереи. Лимит — **10 фото на гостя**. Счётчик хранится на сервере
и **не сбрасывается**, если гость закрыл страницу и снова отсканировал QR с того
же устройства. Все фото складываются в **ваш Cloudinary**.

- **Хранилище фото:** Cloudinary (25 ГБ бесплатно, без карты)
- **Счётчик и проверка лимита:** Supabase (Postgres, бесплатно, без карты)
- **Хостинг сайта:** Vercel (бесплатно)

---

## Как это считает «10 фото» правильно

1. У каждого браузера создаётся постоянный `device_id` (хранится в localStorage
   и в cookie на год).
2. Каждое фото регистрируется строкой в базе Supabase с этим `device_id`.
3. Перед загрузкой и при сохранении сервер считает количество фото устройства в
   базе. Вставка идёт через атомарную функцию с блокировкой — лимит нельзя
   пробить, даже отправив несколько фото одновременно.

> Ограничение по технологии: если гость **очистит данные браузера** или зайдёт с
> **другого устройства**, для него начнётся новый счёт. Это компромисс «без
> входа/регистрации», который мы выбрали. 100%-надёжно было бы только через
> SMS-код.

---

## Шаг 1. Cloudinary (хранилище фото)

1. Зарегистрируйтесь на https://cloudinary.com (бесплатно, карта не нужна).
2. На странице **Dashboard** скопируйте: **Cloud name**, **API Key**,
   **API Secret**.

## Шаг 2. Supabase (счётчик)

1. Зарегистрируйтесь на https://supabase.com → **New project**.
2. Когда проект создан: слева **SQL Editor** → **New query** → вставьте всё
   содержимое файла [`supabase-schema.sql`](./supabase-schema.sql) → **Run**.
3. Слева **Project Settings → API** скопируйте:
   - **Project URL** → это `SUPABASE_URL`
   - ключ **`service_role`** (раздел «Project API keys», секретный!) →
     `SUPABASE_SERVICE_ROLE_KEY`

## Шаг 3. Деплой на Vercel

1. Залейте этот проект в репозиторий на GitHub (см. ниже «Git»).
2. На https://vercel.com → **Add New → Project** → импортируйте репозиторий.
3. В разделе **Environment Variables** добавьте переменные из
   [`.env.local.example`](./.env.local.example) со своими значениями:

   | Переменная | Откуда |
   |---|---|
   | `CLOUDINARY_CLOUD_NAME` | Cloudinary Dashboard |
   | `CLOUDINARY_API_KEY` | Cloudinary Dashboard |
   | `CLOUDINARY_API_SECRET` | Cloudinary Dashboard (секрет) |
   | `CLOUDINARY_UPLOAD_FOLDER` | любая, например `wedding` |
   | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | то же, что Cloud name |
   | `NEXT_PUBLIC_CLOUDINARY_API_KEY` | то же, что API Key |
   | `SUPABASE_URL` | Supabase Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role (секрет) |
   | `NEXT_PUBLIC_MAX_PHOTOS` | `10` |
   | `NEXT_PUBLIC_EVENT_TITLE` | заголовок, напр. `Анна & Иван` |
   | `NEXT_PUBLIC_EVENT_SUBTITLE` | подпись под заголовком |

4. Нажмите **Deploy**. Получите ссылку вида `https://ваш-проект.vercel.app`.

## Шаг 4. QR-код

```bash
npm install
npm run qr -- https://ваш-проект.vercel.app
```

Файл `scripts/qr.png` — печатайте на табличке для гостей.

---

## Запуск локально (по желанию, для проверки)

1. Скопируйте `.env.local.example` → `.env.local` и впишите значения.
2. ```bash
   npm install
   npm run dev
   ```
3. Откройте http://localhost:3000

> Камера в браузере работает только по **HTTPS** (или на `localhost`). На
> Vercel HTTPS уже есть, всё работает.

---

## Как поделиться фото с гостями

Все фото лежат в вашем Cloudinary в папке `wedding` (Media Library). Оттуда
можно скачать архивом или собрать общую галерею/альбом и разослать ссылку.

---

## Git (залить на GitHub)

```bash
cd wedding-photo-app
git init
git add .
git commit -m "Wedding photo app"
# создайте пустой репозиторий на GitHub и:
git remote add origin https://github.com/ВАШ_ЛОГИН/wedding-photo-app.git
git push -u origin main
```
