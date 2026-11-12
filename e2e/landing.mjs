// Landing page, /privacy and /terms. The Steam and Discord buttons are expected only when
// STEAM_STORE_URL / DISCORD_URL are set (environment, .env or .env.example), same as the site.
import { BASE, launch, psql, setting, shot } from "./lib.mjs";

const steam = setting("STEAM_STORE_URL");
const discord = setting("DISCORD_URL");
const newest = psql("select title from miniatures where status='visible' order by created_at desc, id desc limit 1");
const b = await launch();
const r = []; const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const errs = [];
const visibleTiles = (p) => p.locator("main ul.grid > li").evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length);

{
  const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  const res = await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  ok("landing 200, no redirect", res.status() === 200 && new URL(p.url()).pathname === "/", p.url());
  ok("one h1 with the game name", (await p.locator("h1").count()) === 1 && (await p.locator("h1").innerText()) === "Miniature Workshop");
  ok("intro text", (await p.getByText("hobby simulator").count()) === 1);
  ok("12 latest miniatures", (await visibleTiles(p)) === 12, String(await visibleTiles(p)));
  const first = await p.locator("main ul.grid > li img").first().getAttribute("alt");
  ok("newest miniature first", first === newest, `${first} / ${newest}`);
  ok("steam button follows config", (await p.getByRole("link", { name: "Wishlist on Steam" }).count()) === (steam ? 1 : 0), steam ?? "(empty)");
  ok("discord button follows config", (await p.getByRole("link", { name: "Discord" }).count()) === (discord ? 1 : 0), discord ?? "(empty)");
  if (steam) ok("steam href", (await p.getByRole("link", { name: "Wishlist on Steam" }).getAttribute("href")) === steam);
  ok("no horizontal scroll", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  ok("description and og tags", (await p.locator('meta[name="description"]').count()) === 1 && (await p.locator('meta[property="og:title"]').count()) === 1);
  await p.screenshot({ path: shot("landing-phone.png") });
  await p.screenshot({ path: shot("landing-phone-full.png"), fullPage: true });

  await p.getByRole("link", { name: "All miniatures" }).click();
  await p.waitForURL(/\/gallery$/);
  ok("link to the gallery", true);
  await p.goBack();
  await p.locator("main ul.grid > li a").first().click();
  await p.waitForURL(/\/m\//);
  ok("tile opens the miniature", true);
  await p.goto(`${BASE}/gallery`);
  await p.locator("header a", { hasText: "Miniature Workshop" }).click();
  await p.waitForURL((u) => u.pathname === "/");
  ok("header name leads to the landing", true);

  // Language: the landing and both text pages follow the switch.
  await p.locator('footer a[href="/privacy"]').click();
  await p.waitForURL(/\/privacy$/);
  ok("privacy in English", (await p.locator("h1").innerText()) === "Privacy" && (await p.title()) === "Privacy · Miniature Workshop");
  await p.locator('button[name="lang"][value="uk"]').click();
  await p.waitForLoadState("networkidle");
  ok("privacy in Ukrainian, same URL", (await p.locator("h1").innerText()) === "Приватність" && new URL(p.url()).pathname === "/privacy");
  ok("privacy: no horizontal scroll", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: shot("privacy-phone-uk.png"), fullPage: true });
  await p.locator('footer a[href="/terms"]').click();
  await p.waitForURL(/\/terms$/);
  ok("terms in Ukrainian", (await p.locator("h1").innerText()) === "Правила" && (await p.locator("main h2").count()) >= 3);
  await p.locator('main a[href="/privacy"]').click();
  await p.waitForURL(/\/privacy$/);
  ok("terms link to privacy", true);
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  ok("landing in Ukrainian", (await p.getByText("симулятор хобі").count()) === 1 && (await p.getByRole("heading", { name: "Останні мініатюри" }).count()) === 1);
  await p.screenshot({ path: shot("landing-phone-uk.png") });
  await ctx.close();
}
for (const [width, columns, shown] of [[1440, 5, 10], [1920, 6, 12], [1100, 4, 12]]) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const tops = await p.locator("main ul.grid > li").evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.offsetTop));
  const firstRow = tops.filter((t) => t === tops[0]).length;
  ok(`${width}px: ${columns} columns, full rows`, firstRow === columns && tops.length === shown, `${firstRow} columns, ${tops.length} tiles`);
  await p.screenshot({ path: shot(`landing-${width}.png`) });
  await ctx.close();
}
{
  const ctx = await b.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`);
  ok("no-js: landing renders with tiles", (await p.locator("main ul.grid > li").count()) === 12);
  for (const path of ["/privacy", "/terms"]) {
    const res = await p.goto(`${BASE}${path}`);
    ok(`no-js: ${path} renders`, res.status() === 200 && (await p.locator("main h2").count()) >= 3);
  }
  await ctx.close();
}
ok("console clean", errs.length === 0, errs.join(" | "));
await b.close();
console.log(r.join("\n"));
