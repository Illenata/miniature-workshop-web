import { BASE, API, launch, psql, shot } from "./lib.mjs";
const ids = (await (await fetch(`${API}/api/v1/gallery`)).json()).items.map((i) => i.id);
const ID = ids[3];
const b = await launch();
const r = []; const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const errs = [];

async function report(ip, reason, text, label) {
  // X-Forwarded-For stands in for the reverse proxy in front of the page server.
  const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, userAgent: UA, extraHTTPHeaders: { "x-forwarded-for": ip } });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(`${BASE}/m/${ID}`);
  await p.getByRole("link", { name: "Report" }).click();
  await p.waitForURL(/\/report$/);
  if (label === "first") await p.screenshot({ path: shot("report-form.png"), fullPage: true });
  await p.getByLabel(reason).check();
  if (text) await p.getByLabel("Details (optional)").fill(text);
  await p.getByRole("button", { name: "Send report" }).click();
  await p.waitForLoadState("networkidle");
  const res = { url: p.url(), text: await p.locator("main").innerText() };
  await ctx.close();
  return res;
}

const a = await report("203.0.113.21", "Spam", "Це реклама", "first");
ok("report 1: back on the page with thanks", a.url.endsWith(`/m/${ID}?reported=1`) && a.text.includes("Thank you"), a.url);
const b2 = await report("203.0.113.22", "Offensive content", "");
ok("report 2 accepted", b2.url.endsWith("?reported=1"));
const st = psql(`select status from miniatures where id='${ID}'`);
ok("still visible after 2 reports", st === "visible", st);
const c = await report("203.0.113.23", "Someone else's work", "Моя робота");
const st2 = psql(`select status||'/'||hidden_reason from miniatures where id='${ID}'`);
ok("3 reports from different IPs hide it", st2 === "hidden/reports", st2);
ok("after the 3rd report the page says it is hidden", c.text.includes("This miniature was hidden"), c.text.slice(0, 80));
const gal = await (await fetch(`${API}/api/v1/gallery`)).text();
ok("hidden miniature gone from the gallery", !gal.includes(ID));

// Rate limit: 10 a day per address.
for (const id of ids.slice(5, 15)) {
  await fetch(`${API}/api/v1/reports`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.30" }, body: JSON.stringify({ miniature_id: id, reason: "spam" }) });
}
const ctx = await b.newContext({ userAgent: UA, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.30" } });
const p = await ctx.newPage();
await p.goto(`${BASE}/m/${ids[16]}/report`);
await p.getByLabel("Spam").check();
await p.getByRole("button", { name: "Send report" }).click();
await p.waitForLoadState("networkidle");
ok("11th report from one address: friendly limit message", (await p.getByRole("alert").innerText()).includes("Too many reports"));
// No-JS
const nj = await b.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.40" } });
const q = await nj.newPage();
await q.goto(`${BASE}/m/${ids[17]}/report`);
await q.getByLabel("Other", { exact: false }).first().check().catch(async () => q.getByLabel("Something else").check());
await q.getByRole("button", { name: "Send report" }).click();
await q.waitForURL(/reported=1/);
ok("no-js: report works", q.url().includes("reported=1"));
ok("console clean", errs.length === 0, errs.join(" | "));
await b.close();
console.log(r.join("\n"));
