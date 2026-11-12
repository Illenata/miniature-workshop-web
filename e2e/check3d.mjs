import { BASE, launch, shot } from "./lib.mjs";

const browser = await launch({ webgl: true });
const results = [];
const ok = (name, cond, extra = "") => results.push(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);

/** Tiles at least a quarter inside the viewport, and how many of them show a model. */
const visibleStats = (page) =>
  page.evaluate(() => {
    const vh = window.innerHeight;
    const tiles = [...document.querySelectorAll("main ul.grid > li")].filter((li) => {
      const r = li.querySelector("div").getBoundingClientRect();
      const shown = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      return shown >= r.height * 0.25;
    });
    return {
      visible: tiles.length,
      withModel: tiles.filter((li) => li.querySelector("model-viewer")).length,
      totalModels: document.querySelectorAll("model-viewer").length,
      loading: [...document.querySelectorAll("model-viewer")].filter((m) => !m.loaded).length,
    };
  });

async function run(label, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts });
  const page = await ctx.newPage();
  const problems = [];
  const glbs = [];
  let maxConcurrent = 0;
  let inflight = 0;
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("request", (r) => {
    if (r.url().endsWith(".glb")) {
      glbs.push(r.url());
      inflight++;
      maxConcurrent = Math.max(maxConcurrent, inflight);
    }
  });
  const done = (r) => r.url().endsWith(".glb") && inflight--;
  page.on("requestfinished", done);
  page.on("requestfailed", done);

  await page.goto(`${BASE}/gallery`, { waitUntil: "networkidle" });
  ok(`${label}: card mode loads no glb`, glbs.length === 0);
  await page.getByRole("button", { name: "3D" }).click();
  await page.waitForFunction(() => document.querySelectorAll("model-viewer").length > 0, null, { timeout: 30000 });
  const settled = async () => {
    for (let i = 0; i < 120; i++) {
      const st = await visibleStats(page);
      if (st.withModel === st.visible && st.loading === 0) return;
      await page.waitForTimeout(500);
    }
  };
  await settled();
  const s = await visibleStats(page);
  ok(`${label}: every visible tile is 3D`, s.withModel === s.visible, JSON.stringify(s));
  ok(`${label}: glb downloads at most 2 at a time`, maxConcurrent <= 2, `max=${maxConcurrent}`);
  if (label === "desktop") await page.screenshot({ path: shot("desktop-3d.png") });

  let maxModels = 0;
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, viewport.height * 0.9);
    await page.waitForTimeout(500);
    maxModels = Math.max(maxModels, (await visibleStats(page)).totalModels);
  }
  await settled();
  const after = await visibleStats(page);
  const firstHasModel = await page.evaluate(() => !!document.querySelector("main ul.grid > li:first-child model-viewer"));
  ok(`${label}: after scrolling, visible tiles are 3D again`, after.withModel === after.visible, JSON.stringify(after));
  ok(`${label}: top tiles unloaded after scrolling away`, !firstHasModel);
  ok(`${label}: loaded models stay bounded`, maxModels <= (label === "desktop" ? 24 : 6), `max=${maxModels}`);
  ok(`${label}: no console errors`, problems.length === 0, problems.join(" | ").slice(0, 400));
  await ctx.close();
}

await run("phone", { width: 360, height: 740 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await run("desktop", { width: 1440, height: 900 });


await browser.close();
console.log(results.join("\n"));
