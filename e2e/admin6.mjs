import { BASE, API, launch, psql, shot, adminCredentials } from "./lib.mjs";

const { password: PASSWORD, totp } = adminCredentials();
psql("delete from admin_sessions; delete from admin_actions; delete from app_state where key='admin_totp_last_step'; delete from reports; delete from daily_stats; update collections set status='active'");

const b = await launch();
const r = []; const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const errs = [];
const ctx = await b.newContext({ viewport: { width: 360, height: 740 } });
const p = await ctx.newPage();
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));

const ST = `${BASE}/admin/stats`;
const J = `${BASE}/admin/journal`;
const fmt = (n) => new Intl.NumberFormat("uk-UA").format(Number(n));
const UTC_TODAY = "(now() at time zone 'utc')::date";
const ago = (days) => `(${UTC_TODAY} - ${days})`;

// Known numbers: counters and reports on chosen days, some of them older than 30 days.
const [M1, M2, M3] = psql("select id from miniatures where status='visible' order by created_at desc, id desc limit 3").split("\n");
psql(`
  insert into daily_stats (day, metric, value) values
    (${UTC_TODAY}, 'miniature_views', 7), (${ago(1)}, 'miniature_views', 1205), (${ago(29)}, 'miniature_views', 3), (${ago(30)}, 'miniature_views', 999),
    (${UTC_TODAY}, 'upload_rejected:bad_glb', 3), (${ago(5)}, 'upload_rejected:bad_glb', 2),
    (${ago(2)}, 'upload_rejected:text_rejected', 1), (${ago(3)}, 'upload_rejected:made_up_code', 9),
    (${ago(40)}, 'upload_rejected:too_large', 50);
  insert into reports (miniature_id, reason, ip_hash, created_at, status) values
    ('${M1}','spam','s1', now(), 'open'), ('${M2}','spam','s2', now(), 'resolved'),
    ('${M3}','other','s3', ${ago(3)} + interval '12 hours', 'open'), ('${M3}','other','s4', ${ago(45)} + interval '12 hours', 'resolved');
  update miniatures set created_at = ${ago(2)} + interval '10 hours' where id in ('${M2}','${M3}');
`);
// Expected values, counted here with separate SQL.
const since = `${ago(29)}::timestamp at time zone 'utc'`;
const UPLOADS = psql(`select count(*) from miniatures where created_at >= ${since}`);
const COLLECTIONS = psql(`select count(*) from collections where created_at >= ${since}`);
const UPLOADS_D2 = psql(`select count(*) from miniatures where (created_at at time zone 'utc')::date = ${ago(2)}`);
const day = (n) => psql(`select to_char(${ago(n)}, 'YYYY-MM-DD')`);
const [D0, D2, D3, D29] = [day(0), day(2), day(3), day(29)];

// A journal long enough for three pages: 100 moderation lines, 20 logins.
psql(`
  insert into admin_actions (actor, action, target, created_at)
    select 'admin', case when g % 6 = 0 then 'login' else 'hide_miniature' end, case when g % 6 = 0 then '' else 'row-' || g end, now() - (130 - g) * interval '1 minute'
    from generate_series(1, 120) g
`);

const anon = await b.newContext();
ok("not logged in: stats and journal redirect to login", (await anon.request.get(ST, { maxRedirects: 0 })).status() === 302 && (await anon.request.get(J, { maxRedirects: 0 })).status() === 302);
ok("API without session: 401", (await anon.request.get(`${API}/internal/admin/stats`)).status() === 401 && (await anon.request.get(`${API}/internal/admin/journal`)).status() === 401);

await p.goto(`${BASE}/admin/login`);
await p.getByLabel("Пароль").fill(PASSWORD);
await p.getByLabel(/Код із застосунку/).fill(totp());
await p.getByRole("button", { name: "Увійти" }).click();
await p.waitForURL(/\/admin$/);

// Menu: every section is a link now
const menu = p.getByRole("navigation", { name: "Розділи" });
ok("menu: six links, nothing disabled", (await menu.getByRole("link").count()) === 6 && (await menu.locator("[aria-disabled]").count()) === 0);

// Statistics
await menu.getByRole("link", { name: "Статистика" }).click();
await p.waitForURL(/\/admin\/stats$/);
await p.getByRole("heading", { name: "Статистика за 30 днів" }).waitFor();
const total = async (label) => (await p.locator("dl > div").filter({ hasText: label }).locator("dd").innerText()).trim();
ok("total uploads", (await total("Завантаження")) === fmt(UPLOADS), `${await total("Завантаження")} / ${UPLOADS}`);
ok("total new collections", (await total("Нові колекції")) === fmt(COLLECTIONS), `${await total("Нові колекції")} / ${COLLECTIONS}`);
ok("total views: 30 days only, grouped digits", (await total("Перегляди мініатюр")) === fmt(7 + 1205 + 3), await total("Перегляди мініатюр"));
ok("total reports: open and resolved, 30 days only", (await total("Скарги")) === "3", await total("Скарги"));

const days = p.getByRole("region", { name: "По днях" }).locator("tbody tr");
const rowOf = async (d) => (await days.filter({ has: p.locator(`time[datetime="${d}"]`) }).locator("th, td").allInnerTexts()).map((t) => t.trim());
ok("30 days, today first, the 30th last", (await days.count()) === 30 && (await days.first().locator("time").getAttribute("datetime")) === D0 && (await days.last().locator("time").getAttribute("datetime")) === D29);
const today = await rowOf(D0);
ok("today: views 7, reports 2", today[3] === "7" && today[4] === "2", today.join(" | "));
const d2 = await rowOf(D2);
ok("two days ago: uploads moved there are counted", d2[1] === fmt(UPLOADS_D2) && Number(UPLOADS_D2) >= 2, d2.join(" | "));
const d3 = await rowOf(D3);
ok("three days ago: 1 report", d3[4] === "1", d3.join(" | "));
ok("oldest day in range: views 3", (await rowOf(D29))[3] === "3");
ok("day label: date and weekday", /^[а-яіїє']{2}, \d{2}\.\d{2}$/i.test(today[0]), today[0]);

const rej = p.getByRole("region", { name: "Відмови в завантаженні за кодами" }).locator("tbody tr");
const rejRows = (await rej.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
ok("rejections: summed per code, most frequent first, old ones left out", rejRows.length === 3 && rejRows[0] === "Інший код made_up_code 9" && rejRows[1] === "glb не пройшов перевірку bad_glb 5" && rejRows[2] === "Стоп-слово в тексті text_rejected 1", rejRows.join(" / "));
ok("no horizontal scroll at 360", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p.screenshot({ path: shot("admin6-stats.png"), fullPage: true });

// A real page view lands in today's counter
// With a phone's user agent: preview bots and headless browsers are not counted as views.
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const pub = await (await b.newContext({ userAgent: UA })).newPage();
await pub.goto(`${BASE}/m/${M1}`);
await p.reload();
ok("a page view adds to today", (await rowOf(D0))[3] === "8" && (await total("Перегляди мініатюр")) === fmt(7 + 1205 + 3 + 1));

// No rejections at all
psql("delete from daily_stats where metric like 'upload_rejected:%'");
await p.reload();
ok("no rejections: says so", (await p.getByRole("region", { name: "Відмови в завантаженні за кодами" }).innerText()).includes("відмов не було"));

// Journal
await menu.getByRole("link", { name: "Журнал" }).click();
await p.waitForURL(/\/admin\/journal$/);
await p.getByRole("heading", { name: "Журнал" }).waitFor();
const lines = p.locator("main tbody tr");
const TOTAL = Number(psql("select count(*) from admin_actions"));
ok("journal: 50 per page, newest first (this login)", (await lines.count()) === 50 && (await lines.first().innerText()).includes("Вхід"), `${TOTAL} lines in all`);
ok("journal: action names and targets", (await lines.nth(2).innerText()).includes("Сховано мініатюру") && (await lines.nth(2).innerText()).includes("row-119"));
const firstPage = await lines.allInnerTexts();
await p.getByRole("link", { name: "Старіші" }).click();
await p.waitForURL(/before=/);
await p.locator("main tbody tr").filter({ hasText: "row-119" }).waitFor({ state: "detached" });
const secondPage = await lines.allInnerTexts();
ok("second page: next 50, nothing repeats", secondPage.length === 50 && !secondPage.some((l) => firstPage.includes(l)));
await p.getByRole("link", { name: "Старіші" }).click();
await p.locator("main tbody tr").filter({ hasText: "row-1" }).filter({ hasNotText: /row-1\d/ }).waitFor();
ok("last page: the rest, no link to older", (await lines.count()) === TOTAL - 100 && (await p.getByRole("link", { name: "Старіші" }).count()) === 0, String(await lines.count()));
await p.getByRole("link", { name: "На початок" }).click();
await p.waitForURL(/\/admin\/journal$/);
await p.locator("main tbody tr").filter({ hasText: "row-119" }).waitFor();

await p.getByRole("link", { name: "Входи" }).click();
await p.waitForURL(/filter=logins/);
await p.locator("main tbody tr").filter({ hasText: "row-" }).first().waitFor({ state: "detached" });
ok("filter: logins only", (await lines.count()) === 21 && (await lines.allInnerTexts()).every((l) => l.includes("Вхід")), String(await lines.count()));
await p.getByRole("link", { name: "Модерація" }).click();
await p.waitForURL(/filter=moderation/);
await p.locator("main tbody tr").filter({ hasText: "row-119" }).waitFor();
ok("filter: moderation only, paged", (await lines.count()) === 50 && !(await lines.allInnerTexts()).some((l) => l.includes("Вхід")));
await p.getByRole("link", { name: "Старіші" }).click();
await p.waitForURL(/filter=moderation&before=/);
await p.locator("main tbody tr").filter({ hasText: "row-119" }).waitFor({ state: "detached" });
ok("filter is kept on the next page", (await lines.count()) === 50 && !(await lines.allInnerTexts()).some((l) => l.includes("Вхід")));
ok("no horizontal scroll at 360", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p.goto(J);
await p.screenshot({ path: shot("admin6-journal.png") });

// API
const tok = (await ctx.cookies(BASE)).find((c) => c.name === "mw_admin").value;
const H = { Authorization: `Bearer ${tok}` };
const junk = await p.request.get(`${API}/internal/admin/journal?before=abc&filter=nope`, { headers: H });
ok("API: junk parameters are ignored", junk.status() === 200 && (await junk.json()).items.length === 50);
const stats = await (await p.request.get(`${API}/internal/admin/stats`, { headers: H })).json();
ok("API: 30 days, each with four numbers", stats.days.length === 30 && stats.days.every((d) => [d.uploads, d.new_collections, d.views, d.reports].every(Number.isInteger)));

// Home: last ten and a link to the whole journal
await p.goto(`${BASE}/admin`);
ok("home: ten lines", (await p.locator("main tbody tr").count()) === 10);
await p.getByRole("link", { name: "Увесь журнал" }).click();
await p.waitForURL(/\/admin\/journal$/);
ok("home links to the journal", true);

await p.setViewportSize({ width: 1280, height: 800 });
await p.goto(ST);
await p.screenshot({ path: shot("admin6-desktop.png") });
ok("console clean", errs.filter((e) => !/40[1349]|429/.test(e)).length === 0, errs.join(" | ").slice(0, 300));
await b.close();
console.log(r.join("\n"));
