import { BASE, API, S3, launch, psql, shot, adminCredentials } from "./lib.mjs";

const { password: PASSWORD, totp } = adminCredentials();
psql("delete from admin_sessions; delete from admin_actions; delete from app_state where key='admin_totp_last_step'; delete from reports; update collections set status='active'");

const b = await launch();
const r = []; const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const errs = [];
const ctx = await b.newContext({ viewport: { width: 360, height: 740 } });
const p = await ctx.newPage();
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));



const M = `${BASE}/admin/miniatures`;
const C = `${BASE}/admin/collections`;
const rows = psql("select id||'|'||collection_id||'|'||title||'|'||(files->'glb'->>'key')||'|'||(files->'thumb400'->>'key') from miniatures order by created_at desc, id desc limit 4").split("\n").map((l) => l.split("|"));
const [A, , , Aglb, Athumb] = rows[0];
const [B] = rows[1];
// A miniature from another collection than A, to ban.
const [D, DC] = psql(`select id||'|'||collection_id from (select * from miniatures order by created_at desc, id desc limit 30) t where collection_id <> '${rows[0][1]}' and collection_id <> '${rows[1][1]}' order by created_at desc limit 1`).split("|");
const TOTAL_C = Number(psql("select count(*) from collections"));
const anon = await b.newContext();
ok("not logged in: collections redirect to login", (await anon.request.get(C, { maxRedirects: 0 })).status() === 302);
const a0 = await anon.request.post(`${M}.data`, { form: { id: A, intent: "remove" }, headers: { Origin: BASE }, maxRedirects: 0 });
ok("not logged in: remove refused", psql(`select status from miniatures where id='${A}'`) === "visible", String(a0.status()));
ok("API without session: 401", (await anon.request.post(`${API}/internal/admin/miniatures/${A}/remove`)).status() === 401 && (await anon.request.post(`${API}/internal/admin/collections/${DC}/ban`)).status() === 401);

await p.goto(`${BASE}/admin/login`);
await p.getByLabel("Пароль").fill(PASSWORD);
await p.getByLabel(/Код із застосунку/).fill(totp());
await p.getByRole("button", { name: "Увійти" }).click();
await p.waitForURL(/\/admin$/);
await p.goto(M);
const rowA = p.locator("main li").first();
ok("storage has the files before", (await anon.request.get(`${S3}/${Aglb}`)).status() === 403);

// Remove: two steps
await rowA.getByRole("button", { name: "Видалити", exact: true }).click();
ok("asks to confirm", (await rowA.innerText()).includes("назавжди"));
await p.screenshot({ path: shot("admin3-confirm.png") });
await rowA.getByRole("button", { name: "Скасувати" }).click();
ok("cancel keeps it", (await rowA.getByRole("button", { name: "Сховати" }).count()) === 1 && psql(`select status from miniatures where id='${A}'`) === "visible");
await rowA.getByRole("button", { name: "Видалити", exact: true }).click();
await rowA.getByRole("button", { name: "Так, видалити" }).click();
await p.getByRole("link", { name: /Видалені 1/ }).waitFor();
ok("row: removed, no buttons, no image", (await rowA.innerText()).includes("Видалена") && (await rowA.locator("button").count()) === 0 && (await rowA.locator("img").count()) === 0);
ok("db: tombstone stays", psql(`select status from miniatures where id='${A}'`) === "removed");
const g = await anon.request.get(`${S3}/${Aglb}`); const t = await anon.request.get(`${S3}/${Athumb}`);
ok("storage: files erased", g.status() === 404 && t.status() === 404, `${g.status()} ${t.status()}`);
ok("other miniature's files untouched", (await anon.request.get(`${S3}/${rows[2][3]}`)).status() === 403);
const pub = await anon.newPage();
ok("public page 404, not in gallery", (await pub.goto(`${BASE}/m/${A}`)).status() === 404 && !(await (await anon.request.get(`${API}/api/v1/gallery`)).json()).items.some((i) => i.id === A));
ok("admin thumb of removed: 404", (await p.request.get(`${M}/${A}/thumb.webp`)).status() === 404);

// Remove one hidden by reports: reports get closed
psql(`insert into reports (miniature_id, reason, ip_hash) values ('${B}','spam','h1'),('${B}','spam','h2'),('${B}','other','h3'); update miniatures set status='hidden', hidden_reason='reports' where id='${B}'`);
await p.goto(`${M}?status=hidden`);
const rowB = p.locator("main li").first();
await rowB.getByRole("button", { name: "Видалити", exact: true }).click();
await rowB.getByRole("button", { name: "Так, видалити" }).click();
await p.getByRole("link", { name: /Видалені 2/ }).waitFor();
ok("hidden one removed, its reports closed", psql(`select status from miniatures where id='${B}'`) === "removed" && psql(`select count(*) from reports where status='open'`) === "0");
const tok = (await ctx.cookies(BASE)).find((c) => c.name === "mw_admin").value;
const H = { Authorization: `Bearer ${tok}` };
ok("API: remove twice 409, unknown 404", (await p.request.post(`${API}/internal/admin/miniatures/${A}/remove`, { headers: H })).status() === 409 && (await p.request.post(`${API}/internal/admin/miniatures/zzzzzzzzzzzz/remove`, { headers: H })).status() === 404);
ok("removed cannot be shown again", (await p.request.post(`${API}/internal/admin/miniatures/${A}/show`, { headers: H })).status() === 409);

// Ban from the miniature row
await p.goto(M);
const titleD = psql(`select title from miniatures where id='${D}'`);
const rowD = p.locator("main li").filter({ has: p.locator(`img[src*="${D}"]`) });
await rowD.getByRole("button", { name: "Забанити колекцію" }).click();
await rowD.getByRole("button", { name: "Розбанити колекцію" }).waitFor();
ok("row shows banned", (await rowD.innerText()).includes("Колекцію забанено"), titleD);
ok("db: banned", psql(`select status from collections where id='${DC}'`) === "banned");
ok("public: collection and miniature 404, gallery without it", (await pub.goto(`${BASE}/c/${DC}`)).status() === 404 && (await pub.goto(`${BASE}/m/${D}`)).status() === 404 && !(await (await anon.request.get(`${API}/api/v1/gallery`)).json()).items.some((i) => i.owner.collection_id === DC));
ok("nothing deleted by the ban", psql(`select count(*) from miniatures where collection_id='${DC}' and status='visible'`) !== "0");
await p.screenshot({ path: shot("admin3-list.png") });

// Collections section
await p.getByRole("link", { name: "Колекції" }).click();
await p.waitForURL(/\/admin\/collections$/);
await p.getByRole("heading", { name: "Колекції" }).waitFor();
const tabs = await p.getByRole("navigation", { name: "Статус" }).innerText();
ok("collections tabs", new RegExp(`Усі ${TOTAL_C}`).test(tabs) && /Забанені 1/.test(tabs), tabs.replace(/\n/g, " | "));
ok("no horizontal scroll at 360", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p.getByRole("link", { name: /Забанені 1/ }).click();
await p.waitForURL(/status=banned/);
ok("banned list has exactly it", (await p.locator("main li").count()) === 1);
ok("row counts its miniatures", (await p.locator("main li").first().innerText()).includes(`Мініатюр: ${psql(`select count(*) from miniatures where collection_id='${DC}' and status<>'removed'`)} `), (await p.locator("main li").first().innerText()).replace(/\n/g, " | "));
await p.screenshot({ path: shot("admin3-banned.png") });
await p.getByRole("button", { name: "Розбанити" }).click();
await p.getByText("Забанених колекцій немає.").waitFor();
ok("unban: everything is back", psql(`select status from collections where id='${DC}'`) === "active" && (await pub.goto(`${BASE}/c/${DC}`)).status() === 200 && (await pub.goto(`${BASE}/m/${D}`)).status() === 200);
await p.goto(C);
const firstC = p.locator("main li").first();
await firstC.getByRole("button", { name: "Забанити" }).click();
await firstC.getByRole("button", { name: "Розбанити" }).waitFor();
ok("ban from the collections list", psql("select count(*) from collections where status='banned'") === "1");
ok("API: ban twice 409, unknown 404", (await p.request.post(`${API}/internal/admin/collections/${psql("select id from collections where status='banned'")}/ban`, { headers: H })).status() === 409 && (await p.request.post(`${API}/internal/admin/collections/zzzzzzzzzzzz/ban`, { headers: H })).status() === 404);
await firstC.getByRole("button", { name: "Розбанити" }).click();
await firstC.getByRole("button", { name: "Забанити" }).waitFor();
const forged = await p.request.post(`${C}.data`, { form: { id: DC, intent: "ban" }, headers: { Origin: "https://evil.example" } });
ok("POST from another origin refused", [400, 403].includes(forged.status()) && psql(`select status from collections where id='${DC}'`) === "active", String(forged.status()));

await p.goto(`${BASE}/admin`);
const j = await p.locator("main").innerText();
ok("journal has all actions", ["Видалено мініатюру", "Забанено колекцію", "Розбанено колекцію", "закрито скарг: 3", A, DC].every((x) => j.includes(x)), j.slice(0, 200).replace(/\n/g, " | "));
ok("console clean", errs.filter((e) => !/40[1349]|429/.test(e)).length === 0, errs.join(" | ").slice(0, 300));
await b.close();
console.log(r.join("\n"));
