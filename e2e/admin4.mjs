import { BASE, API, launch, psql, shot, adminCredentials } from "./lib.mjs";

const { password: PASSWORD, totp } = adminCredentials();
psql("delete from admin_sessions; delete from admin_actions; delete from app_state where key='admin_totp_last_step'; delete from reports; update collections set status='active'");

const b = await launch();
const r = []; const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const errs = [];
const ctx = await b.newContext({ viewport: { width: 360, height: 740 } });
const p = await ctx.newPage();
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));

const Q = `${BASE}/admin/reports`;
// 40 visible miniatures: six for the buttons (A–F) and 34 more to fill a second page.
const rows = psql("select id||'|'||collection_id||'|'||title from miniatures where status='visible' order by created_at desc, id desc limit 40").split("\n").map((l) => l.split("|"));
const [A, , titleA] = rows[0];
const [B] = rows[1];
const [C] = rows[2];
const [D] = rows[3];
const [E, EC] = rows.find((x) => ![rows[0][1], rows[1][1], rows[2][1], rows[3][1]].includes(x[1]));
const F = rows.find((x) => ![A, B, C, D, E].includes(x[0]))[0];
const rest = rows.map((x) => x[0]).filter((id) => ![A, B, C, D, E, F].includes(id)).slice(0, 34);

// Reports straight into the base, with known times: A is the freshest, then B, C, D, E, F, then the rest.
const ago = (min) => `now() - interval '${min} minutes'`;
psql(`
  insert into reports (miniature_id, reason, text, ip_hash, created_at) values
    ('${A}','spam','Це реклама','a1',${ago(1)}), ('${A}','spam','','a2',${ago(2)}), ('${A}','other','<b>жирний</b> текст','a3',${ago(3)}),
    ('${B}','offensive','Образа','b1',${ago(11)}), ('${B}','stolen','Моя робота','b2',${ago(12)}), ('${B}','spam','','b3',${ago(13)}),
    ('${C}','stolen','','c1',${ago(21)}),
    ('${D}','offensive','','d1',${ago(31)}), ('${D}','offensive','','d2',${ago(32)}),
    ('${E}','other','Щось не так','e1',${ago(41)}),
    ('${F}','spam','','f1',${ago(51)});
  update miniatures set status='hidden', hidden_reason='reports' where id='${B}';
  update miniatures set status='hidden', hidden_reason='moderator' where id='${F}';
  ${rest.map((id, i) => `insert into reports (miniature_id, reason, ip_hash, created_at) values ('${id}','spam','r${i}',${ago(100 + i)});`).join("\n")}
`);
const TOTAL_M = 6 + rest.length;
const TOTAL_R = 11 + rest.length;
const open = (id) => psql(`select count(*) from reports where miniature_id='${id}' and status='open'`);
const state = (id) => psql(`select status||'/'||coalesce(hidden_reason::text,'-') from miniatures where id='${id}'`);

const anon = await b.newContext();
ok("not logged in: queue redirects to login", (await anon.request.get(Q, { maxRedirects: 0 })).status() === 302);
const a0 = await anon.request.post(`${Q}.data`, { form: { id: A, intent: "dismiss" }, headers: { Origin: BASE }, maxRedirects: 0 });
ok("not logged in: dismiss refused", open(A) === "3", String(a0.status()));
ok("API without session: 401", (await anon.request.get(`${API}/internal/admin/reports`)).status() === 401 && (await anon.request.post(`${API}/internal/admin/miniatures/${A}/dismiss-reports`)).status() === 401);

await p.goto(`${BASE}/admin/login`);
await p.getByLabel("Пароль").fill(PASSWORD);
await p.getByLabel(/Код із застосунку/).fill(totp());
await p.getByRole("button", { name: "Увійти" }).click();
await p.waitForURL(/\/admin$/);

// The menu item is live now
await p.getByRole("navigation", { name: "Розділи" }).getByRole("link", { name: "Скарги" }).click();
await p.waitForURL(/\/admin\/reports$/);
await p.getByRole("heading", { name: "Скарги" }).waitFor();
const main = () => p.locator("main").innerText();
ok("totals", (await main()).includes(`Мініатюр у черзі: ${TOTAL_M} · відкритих скарг: ${TOTAL_R}`));
const items = p.locator("main > ul > li");
const row = (id) => items.filter({ has: p.locator(`img[src*="${id}"]`) });
ok("30 per page", (await items.count()) === 30);
const order = await items.evaluateAll((els) => els.slice(0, 6).map((li) => li.querySelector("img").getAttribute("src").split("/")[3]));
ok("freshest report first", order.join() === [A, B, C, D, E, F].join(), order.join());

const textA = await row(A).innerText();
ok("row A: title, status, count", textA.includes(titleA) && textA.includes("Видима") && textA.includes("скарг: 3"), textA.slice(0, 120).replace(/\n/g, " | "));
ok("row A: reasons summed up", textA.includes("Причини: Спам ×2, Інше"));
ok("row A: texts, and a note where there is none", textA.includes("Це реклама") && textA.includes("Без тексту."));
ok("report text is shown as text, not as markup", textA.includes("<b>жирний</b> текст") && (await row(A).locator("b").count()) === 0);
ok("row A: three reports with dates", (await row(A).locator("ul time").count()) === 3);
ok("row B: hidden by reports", (await row(B).innerText()).includes("Схована через скарги") && (await row(B).innerText()).includes("Образливий вміст, Чужа робота, Спам"));
ok("row A: same buttons plus dismiss", (await row(A).getByRole("button").allInnerTexts()).join() === "Відхилити скарги,Сховати,Видалити,Забанити колекцію");
ok("hidden thumb is shown to the admin", await row(B).locator("img").evaluate((img) => img.decode().then(() => img.naturalWidth > 0, () => false)));
ok("no horizontal scroll at 360", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p.screenshot({ path: shot("admin4-queue.png") });
await row(A).screenshot({ path: shot("admin4-row.png") });

// Dismiss: a visible miniature stays as it was, its reports are closed
await row(A).getByRole("button", { name: "Відхилити скарги" }).click();
await row(A).waitFor({ state: "detached" });
ok("dismiss: gone from the queue, reports closed, still visible", open(A) === "0" && state(A) === "visible/-");
ok("totals follow", (await main()).includes(`Мініатюр у черзі: ${TOTAL_M - 1} · відкритих скарг: ${TOTAL_R - 3}`));
ok("the page is topped up from the next one", (await items.count()) === 30);

// Dismiss: one hidden by the reports comes back
const pub = await anon.newPage();
ok("B is 404 for the public before", (await pub.goto(`${BASE}/m/${B}`)).status() === 404);
await row(B).getByRole("button", { name: "Відхилити скарги" }).click();
await row(B).waitFor({ state: "detached" });
ok("dismiss: auto-hidden miniature is visible again", open(B) === "0" && state(B) === "visible/-" && (await pub.goto(`${BASE}/m/${B}`)).status() === 200);

// The same buttons work from the queue
await row(C).getByRole("button", { name: "Сховати" }).click();
await row(C).getByRole("button", { name: "Показати" }).waitFor();
ok("hide: stays in the queue as hidden by the moderator", (await row(C).innerText()).includes("Схована модератором") && open(C) === "1" && state(C) === "hidden/moderator");
await row(C).getByRole("button", { name: "Показати" }).click();
await row(C).waitFor({ state: "detached" });
ok("show: visible, reports closed, gone from the queue", open(C) === "0" && state(C) === "visible/-");

await row(D).getByRole("button", { name: "Видалити", exact: true }).click();
ok("remove asks to confirm", (await row(D).innerText()).includes("назавжди") && (await row(D).getByRole("button", { name: "Відхилити скарги" }).count()) === 0);
await row(D).getByRole("button", { name: "Так, видалити" }).click();
await row(D).waitFor({ state: "detached" });
ok("remove: tombstone, reports closed, gone from the queue", open(D) === "0" && state(D) === "removed/-");

await row(E).getByRole("button", { name: "Забанити колекцію" }).click();
await row(E).getByRole("button", { name: "Розбанити колекцію" }).waitFor();
ok("ban: row stays and says so", (await row(E).innerText()).includes("Колекцію забанено") && open(E) === "1" && psql(`select status from collections where id='${EC}'`) === "banned");
await row(E).getByRole("button", { name: "Розбанити колекцію" }).click();
await row(E).getByRole("button", { name: "Забанити колекцію" }).waitFor();
ok("unban from the queue", psql(`select status from collections where id='${EC}'`) === "active");

// One hidden by the moderator stays hidden when its reports are dismissed
await row(F).getByRole("button", { name: "Відхилити скарги" }).click();
await row(F).waitFor({ state: "detached" });
ok("dismiss: hidden by the moderator stays hidden", open(F) === "0" && state(F) === "hidden/moderator");

// Pages
ok("first page: 30 of 35, link to older", (await items.count()) === 30 && (await p.getByRole("link", { name: "Старіші" }).count()) === 1);
await p.getByRole("link", { name: "Старіші" }).click();
await p.waitForURL(/cursor=/);
await row(E).waitFor({ state: "detached" });
ok("second page: the other 5, nothing repeats", (await items.count()) === 5 && (await row(E).count()) === 0);
await p.getByRole("link", { name: "На початок" }).click();
await p.waitForURL(/\/admin\/reports$/);
await row(E).waitFor();
ok("back to the start", (await items.count()) === 30);
// Let the router finish its background requests, or the reloads below cut them off and log an error.
await p.waitForLoadState("networkidle");
ok("foreign cursor is ignored", (await (await p.request.get(`${Q}?cursor=garbage`)).text()).includes(`thumb.webp`));

// API answers and a forged request
const tok = (await ctx.cookies(BASE)).find((c) => c.name === "mw_admin").value;
const H = { Authorization: `Bearer ${tok}` };
ok("API: dismiss with nothing open 409, unknown 404", (await p.request.post(`${API}/internal/admin/miniatures/${A}/dismiss-reports`, { headers: H })).status() === 409 && (await p.request.post(`${API}/internal/admin/miniatures/zzzzzzzzzzzz/dismiss-reports`, { headers: H })).status() === 404);
const forged = await p.request.post(`${Q}.data`, { form: { id: E, intent: "dismiss" }, headers: { Origin: "https://evil.example" } });
ok("POST from another origin refused", [400, 403].includes(forged.status()) && open(E) === "1", String(forged.status()));
const api = await (await p.request.get(`${API}/internal/admin/reports`, { headers: H })).json();
ok("API: no IP hashes in the answer", !JSON.stringify(api).includes("ip_hash") && !JSON.stringify(api).includes('"e1"'));

// A new report from the site lands on top
const rep = await anon.request.post(`${API}/api/v1/reports`, { data: { miniature_id: A, reason: "stolen", text: "Нова скарга" }, headers: { "x-forwarded-for": "203.0.113.77" } });
await p.reload();
ok("a new report puts the miniature back on top", rep.status() === 201 && (await items.first().innerText()).includes("Нова скарга"));

// Desktop
await p.setViewportSize({ width: 1280, height: 800 });
await p.screenshot({ path: shot("admin4-desktop.png") });
await p.setViewportSize({ width: 360, height: 740 });

// Empty queue
psql("update reports set status='resolved' where status='open'");
await p.reload();
ok("empty queue", (await main()).includes("Відкритих скарг немає.") && (await main()).includes("Мініатюр у черзі: 0 · відкритих скарг: 0"));

await p.goto(`${BASE}/admin`);
const j = await p.locator("main").innerText();
ok("journal has the actions", ["Відхилено скарги", `${A} ${titleA} (скарг: 3)`, "(скарг: 3, мініатюру показано)", "Показано мініатюру", "Видалено мініатюру", "Забанено колекцію"].every((x) => j.includes(x)), j.slice(0, 200).replace(/\n/g, " | "));
ok("console clean", errs.filter((e) => !/40[1349]|429/.test(e)).length === 0, errs.join(" | ").slice(0, 300));
await b.close();
console.log(r.join("\n"));
