import { BASE, launch, shot } from "./lib.mjs";

const browser = await launch();
const results = [];
const ok = (name, cond, extra = "") => results.push(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);

async function newPage(viewport, dpr) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: dpr > 1, hasTouch: dpr > 1 });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return { ctx, page, problems };
}

// ---- Mobile 360 px ----
{
  const { page, problems } = await newPage({ width: 360, height: 740 }, 3);
  await page.goto(`${BASE}/gallery`, { waitUntil: "networkidle" });
  const tiles = page.locator("main ul.grid > li");
  ok("mobile: 24 tiles SSR", (await tiles.count()) === 24);
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok("mobile: no horizontal scroll", noHScroll);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector("main ul.grid")).gridTemplateColumns.split(" ").length);
  ok("mobile: 2 columns", cols === 2, `cols=${cols}`);
  const firstImg = await page.evaluate(() => {
    const img = document.querySelector("main ul.grid img");
    return { src: img.currentSrc, is800: img.srcset.includes(img.currentSrc + " 800w"), prio: img.getAttribute("fetchpriority"), loading: img.loading, rendered: img.getBoundingClientRect().width };
  });
  ok("mobile: dpr3 picks 800w thumb", firstImg.is800, JSON.stringify(firstImg));
  await page.screenshot({ path: shot("mobile.png") });

  // Show more, then open a tile, then go back.
  await page.getByRole("button", { name: "Show more" }).click();
  await page.waitForFunction(() => document.querySelectorAll("main ul.grid > li").length === 48);
  ok("mobile: show more appends 24", (await tiles.count()) === 48);
  ok("mobile: URL unchanged after show more", page.url() === `${BASE}/gallery`, page.url());
  const target = tiles.nth(40).locator("a");
  await target.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await target.click();
  await page.waitForURL(/\/m\//);
  ok("mobile: tile navigates to /m/<id>", /\/m\/[0-9a-z]{12}$/.test(page.url()), page.url());
  await page.goBack();
  await page.waitForURL(`${BASE}/gallery`);
  await page.waitForTimeout(300);
  const after = await tiles.count();
  const scrollAfter = await page.evaluate(() => window.scrollY);
  ok("mobile: back keeps 48 tiles", after === 48, `count=${after}`);
  ok("mobile: back restores scroll", Math.abs(scrollAfter - scrollBefore) < 5, `${scrollBefore} -> ${scrollAfter}`);

  // Filter
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("link", { name: "Gilded" }).first().click();
  await page.waitForURL(/faction=gilded/);
  await page.waitForTimeout(200);
  const factions = await page.locator("main ul.grid > li").allInnerTexts();
  ok("filter: only gilded", factions.length === 24 && factions.every((t) => t.includes("Gilded")), `n=${factions.length}`);
  ok("filter: aria-current", (await page.getByRole("link", { name: "Gilded" }).first().getAttribute("aria-current")) === "page");
  await page.getByRole("button", { name: "Show more" }).click();
  await page.waitForFunction(() => document.querySelectorAll("main ul.grid > li").length === 48);
  const factions2 = await page.locator("main ul.grid > li").allInnerTexts();
  ok("filter: show more keeps filter", factions2.every((t) => t.includes("Gilded")));

  // Language
  await page.getByRole("button", { name: "uk" }).click();
  await page.waitForTimeout(500);
  ok("lang: switches to uk", (await page.locator("html").getAttribute("lang")) === "uk" && (await page.getByRole("heading", { level: 1 }).innerText()) === "Галерея", page.url());
  ok("lang: stays on filtered url", page.url().includes("faction=gilded"), page.url());
  await page.screenshot({ path: shot("mobile-uk.png") });
  const real = problems.filter((p) => !p.includes("404 (Not Found)"));
  ok("mobile: console clean (except expected 404 of /m page)", real.length === 0, real.join(" | "));
}

// ---- Desktop ----
{
  const { page, problems } = await newPage({ width: 1440, height: 900 }, 1);
  await page.goto(`${BASE}/gallery?faction=painted`, { waitUntil: "networkidle" });
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector("main ul.grid")).gridTemplateColumns.split(" ").length);
  ok("desktop 1440: 5 columns", cols === 5, `cols=${cols}`);
  await page.screenshot({ path: shot("desktop.png") });
  await page.setViewportSize({ width: 1920, height: 1000 });
  const cols2 = await page.evaluate(() => getComputedStyle(document.querySelector("main ul.grid")).gridTemplateColumns.split(" ").length);
  ok("desktop 1920: 6 columns", cols2 === 6, `cols=${cols2}`);
  // Keyboard: Tab reaches the first tile after header controls and filter.
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => document.activeElement?.textContent);
  ok("keyboard: first tab = skip link", skip?.includes("Skip"), skip);
  ok("desktop: console clean", problems.length === 0, problems.join(" | "));
}

// ---- No JS ----
{
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/gallery`);
  await page.getByRole("button", { name: "Show more" }).click();
  await page.waitForURL(/cursor=/);
  ok("no-js: show more navigates to next page", (await page.locator("main ul.grid > li").count()) === 24, page.url().slice(0, 60));
}

await browser.close();
console.log(results.join("\n"));
