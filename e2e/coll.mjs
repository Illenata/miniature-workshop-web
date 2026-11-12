import { BASE, launch, psql, shot } from "./lib.mjs";
const CID = psql("select collection_id from miniatures group by 1 order by count(*) desc limit 1");
const total = Number(psql(`select count(*) from miniatures where collection_id='${CID}' and status='visible'`));
const b = await launch();
const r = []; const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const errs = [];

{
  const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(`${BASE}/c/${CID}`, { waitUntil: "networkidle" });
  const head = await p.locator("header").last().innerText();
  ok("header: name, count, since", head.includes("Workshop") && head.includes(`${total} miniatures`), head.replace(/\n/g, " | ").slice(0, 120));
  const tiles = p.locator("main ul.grid > li");
  ok("first page 24 tiles", (await tiles.count()) === Math.min(24, total), String(await tiles.count()));
  const tileText = await tiles.first().innerText();
  ok("tiles do not repeat the workshop name", !tileText.includes("Workshop"), tileText.replace(/\n/g, " | "));
  ok("no horizontal scroll", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: shot("coll-phone.png") });
  if (total > 24) {
    await p.getByRole("button", { name: "Show more" }).click();
    await p.waitForFunction((n) => document.querySelectorAll("main ul.grid > li").length === n, total);
    ok("show more loads the rest", (await tiles.count()) === total);
    ok("end of list shown", (await p.getByText("That's all for now.").count()) === 1);
  }
  // QR disclosure
  await p.getByText("QR code").click();
  await p.waitForTimeout(300);
  const qr = await p.locator("details img").evaluate((i) => ({ w: i.naturalWidth, alt: i.alt }));
  ok("QR opens", qr.w === 512, JSON.stringify(qr));
  await p.screenshot({ path: shot("coll-qr.png") });
  // tile -> miniature -> workshop link back
  await tiles.first().locator("a").click();
  await p.waitForURL(/\/m\//);
  await p.getByRole("link", { name: /^Workshop / }).first().click();
  await p.waitForURL(new RegExp(`/c/${CID}$`));
  ok("miniature page links back to the collection", true);
  await ctx.close();
}
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(`${BASE}/c/${CID}`);
  await p.getByRole("button", { name: "Share collection" }).click();
  await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok("share copies the collection link", clip.endsWith(`/c/${CID}`), clip);
  await p.screenshot({ path: shot("coll-desktop.png") });
  const res = await p.goto(`${BASE}/c/zzzzzzzzzzzz`);
  ok("missing collection 404", res.status() === 404);
  psql(`update collections set status='banned' where id='${CID}'`);
  const res2 = await p.goto(`${BASE}/c/${CID}`);
  ok("banned collection 404", res2.status() === 404);
  psql(`update collections set status='active' where id='${CID}'`);
  await ctx.close();
}
{
  const ctx = await b.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/c/${CID}`);
  if (total > 24) {
    await p.getByRole("button", { name: "Show more" }).click();
    await p.waitForURL(/cursor=/);
    ok("no-js: next page renders with header", (await p.locator("h1").count()) === 1 && (await p.locator("main ul.grid > li").count()) === total - 24);
  }
}
const real = errs.filter((e) => !e.includes("404"));
ok("console clean", real.length === 0, real.join(" | "));
await b.close();
console.log(r.join("\n"));
