import { BASE, API, launch, psql, shot } from "./lib.mjs";

const ID = psql("select id from miniatures where status = 'visible' order by created_at desc limit 1 offset 5");
const browser = await launch({ webgl: true });
const r = [];
const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const views = () => Number(psql(`select views from miniatures where id='${ID}'`));

// ---- Phone ----
{
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    // Headless Chromium's default UA is (rightly) treated as a bot and not counted.
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  p.on("pageerror", (e) => errs.push(e.message));
  const before = views();
  await p.goto(`${BASE}/m/${ID}`, { waitUntil: "domcontentloaded" });
  ok("phone: view counted once", views() === before + 1, `${before} -> ${views()}`);
  const ssrImg = await p.locator("main img[fetchpriority=high]").count();
  ok("phone: card image server-rendered (LCP)", ssrImg === 1);
  const box = await p.locator("main article > div").first().boundingBox();
  ok("phone: viewer fills first screen under header", Math.abs(box.height - (740 - 56)) <= 2 && box.width === 360, JSON.stringify(box));
  await p.waitForFunction(() => document.querySelector("model-viewer")?.loaded, null, { timeout: 60000 });
  await p.waitForTimeout(500);
  await p.waitForTimeout(800);
  const posterOpacity = await p.locator("main img[fetchpriority=high]").evaluate((e) => getComputedStyle(e).opacity + " " + e.className.match(/opacity-\d+/)[0]);
  ok("phone: poster hidden once model loaded", posterOpacity.endsWith("opacity-0"), posterOpacity);
  ok("phone: touch-action pan-y (page still scrolls)", (await p.locator("model-viewer").getAttribute("touch-action")) === "pan-y");
  await p.screenshot({ path: shot("m-phone.png") });
  // details below the fold
  const h1Top = await p.locator("h1").evaluate((e) => e.getBoundingClientRect().top);
  ok("phone: details start below the viewer", h1Top > 680, `h1 top ${h1Top}`);
  await p.locator("h1").scrollIntoViewIfNeeded();
  await p.screenshot({ path: shot("m-phone-details.png"), fullPage: false });
  ok("phone: no horizontal scroll", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  ok("phone: console clean", errs.length === 0, errs.join(" | ").slice(0, 600));
  await ctx.close();
}

// ---- Desktop ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${BASE}/m/${ID}`);
  await p.waitForFunction(() => document.querySelector("model-viewer")?.loaded, null, { timeout: 60000 });
  const viewerBox = await p.locator("model-viewer").boundingBox();
  const h1Box = await p.locator("h1").boundingBox();
  ok("desktop: viewer left, details right", viewerBox.x < h1Box.x && h1Box.y < 200, `viewer x=${viewerBox.x} h1 x=${h1Box.x}`);

  // Rotate with the mouse.
  const orbit = () => p.evaluate(() => document.querySelector("model-viewer").getCameraOrbit());
  await p.evaluate(() => document.querySelector("model-viewer").removeAttribute("auto-rotate"));
  const o1 = await orbit();
  const cx = viewerBox.x + viewerBox.width / 2, cy = viewerBox.y + viewerBox.height / 2;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  await p.mouse.move(cx + 200, cy, { steps: 10 });
  await p.mouse.up();
  await p.waitForTimeout(800);
  const o2 = await orbit();
  ok("desktop: drag rotates the model", Math.abs(o2.theta - o1.theta) > 0.3, `theta ${o1.theta.toFixed(2)} -> ${o2.theta.toFixed(2)}`);

  // Zoom in hard: the camera stops at the limit instead of entering the model.
  for (let i = 0; i < 30; i++) await p.mouse.wheel(0, -400);
  await p.waitForTimeout(1500);
  const o3 = await orbit();
  const min = await p.evaluate(() => document.querySelector("model-viewer").getMinimumFieldOfView?.() ?? null);
  await p.screenshot({ path: shot("m-zoomed.png") });
  ok("desktop: zoom is limited (camera stays outside the model)", o3.radius > 0.025, `radius ${o3.radius.toFixed(3)} m`);

  // AR button is hidden where AR is not supported.
  const arVisible = await p.locator("button[slot=ar-button]").isVisible();
  ok("desktop: AR button hidden without AR support", !arVisible);

  // Card mode.
  await p.getByRole("button", { name: "Card", exact: true }).click();
  await p.waitForTimeout(500);
  const cardImg = await p.locator("main img[src$='.png']").count();
  const mvHidden = await p.locator("model-viewer").evaluate((e) => getComputedStyle(e).visibility);
  ok("desktop: Card mode shows the full card", cardImg === 1 && mvHidden === "hidden");
  await p.getByRole("button", { name: "3D", exact: true }).click();

  // Share: no Web Share API on desktop Chromium -> copies the link.
  await p.getByRole("button", { name: "Share" }).click();
  await p.waitForTimeout(300);
  const status = await p.getByText("Link copied").innerText().catch(() => "");
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok("desktop: share copies the link", status === "Link copied" && clip.endsWith(`/m/${ID}`), `${status} ${clip}`);

  ok("desktop: download link", (await p.getByRole("link", { name: "Download glb" }).getAttribute("href")) === `/m/${ID}/model.glb`);
  ok("desktop: report link", (await p.getByRole("link", { name: "Report" }).getAttribute("href")) === `/m/${ID}/report`);
  ok("desktop: Steam/Discord hidden without URLs", (await p.getByRole("link", { name: "Wishlist on Steam" }).count()) === 0);
  await p.screenshot({ path: shot("m-desktop.png") });
  ok("desktop: console clean", errs.length === 0, errs.join(" | ").slice(0, 600));

  // From the gallery: tile -> page, back.
  await p.goto(`${BASE}/gallery`);
  await p.locator("main ul.grid > li a").first().click();
  await p.waitForURL(/\/m\//);
  ok("gallery tile opens the page", (await p.locator("h1").count()) === 1);
  await ctx.close();
}

// ---- Bot is not counted; hidden -> 404 ----
{
  const before = views();
  await fetch(`${BASE}/m/${ID}`, { headers: { "user-agent": "TelegramBot (like TwitterBot)" } });
  ok("bot visit not counted", views() === before);
  psql(`update miniatures set status='hidden' where id='${ID}'`);
  const ctx = await browser.newContext({ locale: "uk-UA" });
  const p = await ctx.newPage();
  const res = await p.goto(`${BASE}/m/${ID}`);
  const h1 = await p.locator("h1").innerText();
  ok("hidden: 404 with 'Мініатюру приховано'", res.status() === 404 && h1 === "Мініатюру приховано", `${res.status()} ${h1}`);
  const qr = await p.request.get(`${BASE}/m/${ID}/qr.png`);
  ok("hidden: qr.png 404", qr.status() === 404);
  psql(`update miniatures set status='visible' where id='${ID}'`);
  await ctx.close();
}

await browser.close();
console.log(r.join("\n"));
