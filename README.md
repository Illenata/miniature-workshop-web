# Miniature Workshop — веб-компаньйон

Сайт показує мініатюри, пофарбовані в грі Miniature Workshop. Гравець ділиться ними одним посиланням, а глядач
переходить до сторінки гри в Steam і в Discord. ТЗ: `WEB_COMPANION_SPEC.md` у проєкті Anton-а.

**Стан:** фаза 1, перший зріз. Уже є база й міграції, `/healthz`, `GET /api/v1/gallery`, віддача файлів і сід на
1000 мініатюр. Сторінок і завантаження з гри ще немає.

## Структура

| Шлях | Що це |
| --- | --- |
| `apps/api` | Сервер на Fastify: API, віддача файлів, міграції (`drizzle/`), сід (`scripts/seed.ts`) |
| `packages/contract` | Zod-схеми контракту (розділи 5, 8 і 14 ТЗ): manifest, елемент мініатюри, коди помилок |
| `docker-compose.yml` | PostgreSQL, RustFS (локальне S3-сховище) і API |
| `.env.example` | Усі змінні з поясненнями |

Стек: Node 24, TypeScript, Fastify, Drizzle ORM, PostgreSQL 17, будь-яке S3-сумісне сховище, sharp, Zod.
Монорепо на npm workspaces і Turborepo.

## Запуск локально

Потрібні Docker Desktop, а для розробки й сіду ще Node 24 (підійде 22.18+).

```bash
# 1. Підняти все: базу, сховище й API. Перший раз збирає образ кілька хвилин.
docker compose up -d --build

# 2. Перевірити: має повернути {"status":"ok","db":"ok","storage":"ok"}
curl http://localhost:3000/healthz

# 3. Наповнити тестовими даними: 1000 мініатюр-плейсхолдерів
npm install
npm run seed

# 4. Подивитися
curl "http://localhost:3000/api/v1/gallery?faction=gilded"
```

`.env` створювати не обов'язково: compose і скрипти беруть значення з `.env.example`, а `.env` лише перекриває
їх. Консоль сховища (RustFS) відкривається на http://localhost:9001 з логіном і паролем із `S3_ACCESS_KEY_ID` і
`S3_SECRET_ACCESS_KEY`. MinIO у 2025 році перестав публікувати образи, тому локально стоїть RustFS; на проді
підійде будь-який S3-сумісний сервіс.

### Розробка

```bash
docker compose up -d postgres storage # лише сервіси
npm install
npm run dev                           # API з автоперезапуском на http://localhost:3000
npm test                              # юніт-тести
npm run typecheck
```

Сід можна перезапускати з параметрами:

```bash
npm run seed -- --count 200     # інша кількість
npm run seed -- --reset         # спершу стерти всі мініатюри, колекції та їхні файли
```

Щоб змінити схему бази, правиш `apps/api/src/db/schema.ts` і запускаєш `npm run db:generate`. У
`apps/api/drizzle/` з'явиться новий SQL-файл міграції, його треба закомітити. Сервер застосовує міграції сам при
старті.

## API (поточне)

| Маршрут | Що повертає |
| --- | --- |
| `GET /healthz` | 200, якщо база й сховище відповідають; інакше 503 |
| `GET /api/v1/gallery?cursor=&faction=painted\|gilded` | `{ items, next_cursor }`, 24 на сторінку, новіші першими |
| `GET /files/collections/<cid>/<mid>/<sha256>.<glb\|png\|webp>` | Файл мініатюри; для схованих і забанених — 404 |

Пагінація курсорна, по `(created_at, id)`. Курсор прив'язаний до фільтра: курсор з `faction=painted` разом з
іншим фільтром дає 400 `invalid_request`.

**Файли** у продакшні віддаються з окремого origin `files.<домен>`, локально з `http://localhost:3000/files`.
Шляхи містять хеш умісту, тому відповідь має `Cache-Control: immutable`. Віддаються лише три типи (glb, png, webp)
з `nosniff`, а журнал мазків не віддається ніколи. Якщо мініатюру сховали, її файли перестають віддаватися
протягом 30 секунд.

## Що далі

1. Сторінка `/gallery` (React Router v7, SSR, mobile-first).
2. Перемикач «Картка / 3D» з model-viewer.
3. `POST /api/v1/uploads` з перевірками з розділу 5, далі сторінки мініатюри й колекції.
4. Caddy з TLS і продакшн-конфіг, скрипт резервної копії бази.
