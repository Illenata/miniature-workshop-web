import { BASE, API, S3, launch, psql, shot, adminCredentials } from "./lib.mjs";

const { password: PASSWORD, totp } = adminCredentials();
psql("delete from admin_sessions; delete from admin_actions; delete from app_state where key='admin_totp_last_step'; delete from reports; update miniatures set status='visible', hidden_reason=null");

const b = await launch();
const r = []; const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const errs = [];
const ctx = await b.newContext({ viewport: { width: 360, height: 740 } });
const p = await ctx.newPage();
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));


const M = `${BASE}/admin/miniatures`;
await p.goto(M);
ok("not logged in: list redirects to login", p.url().endsWith("/admin/login"), p.url());
const ids = psql("select id from miniatures order by created_at desc, id desc limit 3").split("\n");
const [A, B, C] = ids;
const TOTAL = Number(psql("select count(*) from miniatures"));
const anon = await b.newContext();
const t0 = await anon.request.get(`${M}/${A}/thumb.webp`, { maxRedirects: 0 });
ok("not logged in: thumb is not served", t0.status() === 302, String(t0.status()));
const a0 = await anon.request.post(`${M}.data`, { form: { id: A, intent: "hide" }, headers: { Origin: BASE }, maxRedirects: 0 });
ok("not logged in: hide is refused", a0.status() !== 200 && psql(`select status from miniatures where id='${A}'`) === "visible", String(a0.status()));
ok("API without session: 401", (await anon.request.get(`${API}/internal/admin/miniatures`)).status() === 401);

await p.goto(`${BASE}/admin/login`);
await p.getByLabel("Пароль").fill(PASSWORD);
await p.getByLabel(/Код із застосунку/).fill(totp());
await p.getByRole("button", { name: "Увійти" }).click();
await p.waitForURL(/\/admin$/);
await p.getByRole("link", { name: "Мініатюри" }).click();
await p.waitForURL(/\/admin\/miniatures$/);
const tabs = await p.getByRole("navigation", { name: "Статус" }).innerText();
ok("tabs with counts", new RegExp(`Усі ${TOTAL}`).test(tabs) && new RegExp(`Видимі ${TOTAL}`).test(tabs) && /Сховані 0/.test(tabs) && /Видалені 0/.test(tabs), tabs.replace(/\n/g, " | "));
ok("30 rows per page", (await p.locator("main li").count()) === 30);
const first = p.locator("main li").first();
ok("newest first", (await first.innerText()).includes(psql(`select title from miniatures where id='${A}'`)));
const img = await p.request.get(`${M}/${A}/thumb.webp`);
ok("thumb served to admin, private cache", img.status() === 200 && img.headers()["content-type"] === "image/webp" && img.headers()["cache-control"].startsWith("private"));
ok("no horizontal scroll at 360", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p.screenshot({ path: shot("admin-min-1.png") });

// Hide
await first.getByRole("button", { name: "Сховати" }).click();
await first.getByRole("button", { name: "Показати" }).waitFor();
ok("row switches to hidden by moderator", (await first.innerText()).includes("Схована модератором"));
ok("db: hidden / moderator", psql(`select status||'/'||hidden_reason from miniatures where id='${A}'`) === "hidden/moderator");
const gal = await (await p.request.get(`${API}/api/v1/gallery`)).json();
ok("gone from gallery", !gal.items.some((i) => i.id === A));
const pub = await anon.newPage();
const resp = await pub.goto(`${BASE}/m/${A}`);
ok("public page: 404 hidden", resp.status() === 404);
ok("thumb of hidden still shown to admin", (await p.request.get(`${M}/${A}/thumb.webp`)).status() === 200);
await p.getByRole("link", { name: /Сховані 1/ }).click();
await p.waitForURL(/status=hidden/);
ok("hidden tab lists it", (await p.locator("main li").count()) === 1);
await p.screenshot({ path: shot("admin-min-2.png") });

// Hidden by reports -> Show resolves them
psql(`insert into reports (miniature_id, reason, ip_hash) values ('${B}','spam','h1'),('${B}','spam','h2'),('${B}','other','h3'); update miniatures set status='hidden', hidden_reason='reports' where id='${B}'`);
await p.reload();
const rowB = p.locator("main li").filter({ hasText: psql(`select title from miniatures where id='${B}'`) }).first();
const tb = await rowB.innerText();
ok("hidden by reports shows reason and count", tb.includes("Схована через скарги") && tb.includes("скарг: 3"), tb.replace(/\n/g, " | "));
await rowB.getByRole("button", { name: "Показати" }).click();
await p.getByRole("link", { name: /Сховані 1/ }).waitFor();
ok("show: visible again, reports closed", psql(`select status||'/'||coalesce(hidden_reason::text,'-') from miniatures where id='${B}'`) === "visible/-" && psql(`select count(*) from reports where miniature_id='${B}' and status='open'`) === "0", psql(`select status, count(*) from reports group by 1`));
ok("public page back", (await pub.goto(`${BASE}/m/${B}`)).status() === 200);

// Removed: listed without actions
psql(`update miniatures set status='removed' where id='${C}'`);
await p.goto(`${M}?status=removed`);
ok("removed tab: row without button or image", (await p.locator("main li").count()) === 1 && (await p.locator("main li button").count()) === 0 && (await p.locator("main li img").count()) === 0);
psql(`update miniatures set status='visible' where id='${C}'`);

// Pagination
await p.goto(M);
const seen = new Set(); let pages = 0;
{
  const tok0 = (await ctx.cookies(BASE)).find((c) => c.name === "mw_admin").value;
  let cur = null;
  do {
    pages++;
    const j = await (await p.request.get(`${API}/internal/admin/miniatures${cur ? `?cursor=${cur}` : ""}`, { headers: { Authorization: `Bearer ${tok0}` } })).json();
    for (const i of j.items) seen.add(i.id);
    cur = j.next_cursor;
  } while (cur);
}
await p.getByRole("link", { name: "Старіші" }).click();
await p.waitForURL(/cursor=/);
await p.getByRole("link", { name: "На початок" }).waitFor();
ok("paging walks every miniature once", seen.size === TOTAL && pages === Math.ceil(TOTAL / 30) && (await p.getByRole("link", { name: "На початок" }).count()) === 1, `${seen.size}/${TOTAL} in ${pages} pages`);
ok("bad cursor: not a crash page for wrong tab", [200, 400, 502].includes((await p.request.get(`${M}?status=hidden&cursor=zzz`)).status()));

// API edge cases
const tok = (await ctx.cookies(BASE)).find((c) => c.name === "mw_admin").value;
const H = { Cookie: `mw_admin=${tok}`, Authorization: `Bearer ${tok}` };
const again = await p.request.post(`${API}/internal/admin/miniatures/${A}/hide`, { headers: H });
const nope = await p.request.post(`${API}/internal/admin/miniatures/zzzzzzzzzzzz/hide`, { headers: H });
ok("API: hide twice 409, unknown 404", again.status() === 409 && nope.status() === 404, `${again.status()} ${nope.status()}`);
const forged = await p.request.post(`${M}.data`, { form: { id: B, intent: "hide" }, headers: { Origin: "https://evil.example" } });
ok("POST from another origin refused, nothing changed", [400, 403].includes(forged.status()) && psql(`select status from miniatures where id='${B}'`) === "visible", String(forged.status()));

await p.goto(`${BASE}/admin`);
const j = await p.locator("main").innerText();
ok("journal: hide and show with ids", j.includes("Сховано мініатюру") && j.includes("Показано мініатюру") && j.includes(A) && j.includes("закрито скарг: 3"), j.slice(0, 300).replace(/\n/g, " | "));
await p.screenshot({ path: shot("admin-min-3.png") });
ok("console clean", errs.filter((e) => !/40[1349]|429/.test(e)).length === 0, errs.join(" | ").slice(0, 300));
psql("delete from reports; update miniatures set status='visible', hidden_reason=null");
await b.close();
console.log(r.join("\n"));
