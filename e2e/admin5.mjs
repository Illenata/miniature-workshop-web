import { BASE, API, launch, psql, shot, adminCredentials } from "./lib.mjs";

const { password: PASSWORD, totp } = adminCredentials();
psql("delete from admin_sessions; delete from admin_actions; delete from app_state where key='admin_totp_last_step'; delete from stop_words");

const b = await launch();
const r = []; const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const errs = [];
const ctx = await b.newContext({ viewport: { width: 360, height: 740 } });
const p = await ctx.newPage();
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));

const S = `${BASE}/admin/stop-words`;
const words = () => psql("select word||'/'||match from stop_words order by normalized").split("\n").filter(Boolean);

const anon = await b.newContext();
ok("not logged in: page redirects to login", (await anon.request.get(S, { maxRedirects: 0 })).status() === 302);
await anon.request.post(`${S}.data`, { form: { intent: "add", words: "spam", match: "word" }, headers: { Origin: BASE }, maxRedirects: 0 });
ok("not logged in: add refused", words().length === 0);
ok("API without session: 401", (await anon.request.get(`${API}/internal/admin/stop-words`)).status() === 401 && (await anon.request.post(`${API}/internal/admin/stop-words/check`, { data: { text: "x" } })).status() === 401);

await p.goto(`${BASE}/admin/login`);
await p.getByLabel("Пароль").fill(PASSWORD);
await p.getByLabel(/Код із застосунку/).fill(totp());
await p.getByRole("button", { name: "Увійти" }).click();
await p.waitForURL(/\/admin$/);

await p.getByRole("navigation", { name: "Розділи" }).getByRole("link", { name: "Стоп-слова" }).click();
await p.waitForURL(/\/admin\/stop-words$/);
await p.getByRole("heading", { name: "Стоп-слова", level: 1 }).waitFor();
ok("empty list says so", (await p.locator("main").innerText()).includes("Список порожній"));
const list = p.getByRole("region", { name: /Список/ }).locator("ul > li");

// Add a batch: whole words, with a duplicate spelling inside the batch and two invalid lines
const add = p.getByRole("region", { name: "Додати" });
await add.getByLabel(/Нові стоп-слова/).fill(["fuck", "  Fück  ", "хуй", "kill yourself", "...", "x".repeat(65), ""].join("\n"));
await add.getByRole("button", { name: "Додати" }).click();
await add.getByRole("status").waitFor();
const status1 = await add.getByRole("status").innerText();
ok("batch: 3 added, 1 duplicate, 2 refused", status1.includes("Додано: 3") && status1.includes("Уже є в списку: Fück") && status1.includes("Не прийнято") && status1.includes("..."), status1.replace(/\n/g, " | "));
ok("db: stored as typed, whole word", words().join() === "fuck/word,kill yourself/word,хуй/word", words().join());
ok("form is emptied after adding", (await add.getByLabel(/Нові стоп-слова/).inputValue()) === "");
await p.getByRole("heading", { name: "Список · 3" }).waitFor();
ok("list shows them with the mode", (await list.count()) === 3 && (await list.first().innerText()).includes("ціле слово"));

// Substring entry
await add.getByLabel(/Нові стоп-слова/).fill("ass");
await add.getByLabel(/Підрядок/).check();
await add.getByRole("button", { name: "Додати" }).click();
await p.getByRole("heading", { name: "Список · 4" }).waitFor();
ok("substring entry stored", words().includes("ass/substring"));

// Adding the same word again
await add.getByLabel(/Нові стоп-слова/).fill("FUCK");
await add.getByRole("button", { name: "Додати" }).click();
await add.getByText("Додано: 0").waitFor();
ok("existing word is not added twice", (await add.getByRole("status").innerText()).includes("Уже є в списку: FUCK") && words().length === 4);

// Check a text
const check = p.getByRole("region", { name: "Перевірити текст" });
async function checkText(text) {
  await check.getByLabel("Текст для перевірки").fill(text);
  // Wait for this check's own answer: the previous one is still on the page until it comes.
  const answered = p.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/admin/stop-words.data"));
  await check.getByRole("button", { name: "Перевірити" }).click();
  await answered;
  await check.getByRole("button", { name: "Перевірити" }).and(p.locator(":enabled")).waitFor();
  return check.getByRole("status").innerText();
}
const c1 = await checkText("Лучник степу, перша спроба металіку");
ok("check: clean text passes", c1.includes("Збігів немає"), c1.replace(/\n/g, " | "));
const c2 = await checkText("f.u.c.k this");
ok("check: dotted word found, normalised form shown", c2.includes("Збіги: fuck (ціле слово)") && c2.includes("Після нормалізації: f u c k this"), c2.replace(/\n/g, " | "));
const c3 = await checkText("Мій х у й і first class");
ok("check: spaced Cyrillic + substring inside a word", c3.includes("хуй (ціле слово)") && c3.includes("ass (підрядок)"), c3.replace(/\n/g, " | "));
const c4 = await checkText("skill yourselves, classic");
ok("check: no false phrase match", c4.includes("ass (підрядок)") && !c4.includes("kill yourself"), c4.replace(/\n/g, " | "));
ok("no horizontal scroll at 360", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p.screenshot({ path: shot("admin5-page.png"), fullPage: true });

// Filter the list on the page
await p.getByPlaceholder("Знайти в списку").fill("ki");
ok("filter narrows the list", (await list.count()) === 1 && (await list.first().innerText()).includes("kill yourself"));
await p.getByPlaceholder("Знайти в списку").fill("zzz");
ok("filter with nothing found", (await p.locator("main").innerText()).includes("Нічого не знайдено."));
await p.getByPlaceholder("Знайти в списку").fill("");

// Remove
await p.getByRole("button", { name: "Видалити «ass»" }).click();
await p.getByRole("heading", { name: "Список · 3" }).waitFor();
ok("remove: gone from the list and the db", !words().some((w) => w.startsWith("ass/")));
const c5 = await checkText("first class");
ok("check right after removing: no stale list", c5.includes("Збігів немає"), c5.replace(/\n/g, " | "));

// API answers and forged requests
const tok = (await ctx.cookies(BASE)).find((c) => c.name === "mw_admin").value;
const H = { Authorization: `Bearer ${tok}` };
const id = psql("select id from stop_words order by id limit 1");
ok("API: remove unknown 404, bad id 404", (await p.request.delete(`${API}/internal/admin/stop-words/999999`, { headers: H })).status() === 404 && (await p.request.delete(`${API}/internal/admin/stop-words/abc`, { headers: H })).status() === 404);
const many = Array.from({ length: 501 }, (_, i) => `w${i}`).join("\n");
ok("API: more than 500 lines refused", (await p.request.post(`${API}/internal/admin/stop-words`, { headers: H, data: { words: many, match: "word" } })).status() === 400 && words().length === 3);
ok("API: bad match flag refused", (await p.request.post(`${API}/internal/admin/stop-words`, { headers: H, data: { words: "x", match: "regex" } })).status() === 400);
const forged = await p.request.post(`${S}.data`, { form: { intent: "remove", id }, headers: { Origin: "https://evil.example" } });
ok("POST from another origin refused", [400, 403].includes(forged.status()) && words().length === 3, String(forged.status()));
const html = await p.request.post(`${API}/internal/admin/stop-words/check`, { headers: H, data: { text: "<img src=x onerror=alert(1)>" } });
ok("API: check answers JSON", html.status() === 200 && (await html.json()).normalized === "img src x onerror alert i");

// A word that only becomes a word after normalisation is shown as typed and escaped
await add.getByLabel(/Нові стоп-слова/).fill("<b>bad</b>");
await add.getByLabel(/Ціле слово/).check();
await add.getByRole("button", { name: "Додати" }).click();
await p.getByRole("heading", { name: "Список · 4" }).waitFor();
ok("markup in a word is shown as text", (await list.filter({ hasText: "<b>bad</b>" }).count()) === 1 && (await p.locator("main b").count()) === 0);

await p.setViewportSize({ width: 1280, height: 800 });
await p.screenshot({ path: shot("admin5-desktop.png"), fullPage: true });

await p.goto(`${BASE}/admin`);
const j = await p.locator("main").innerText();
ok("journal has the actions", ["Додано стоп-слова", "3: fuck, хуй, kill yourself", "Видалено стоп-слово"].every((x) => j.includes(x)), j.slice(0, 240).replace(/\n/g, " | "));
ok("console clean", errs.filter((e) => !/40[1349]|429/.test(e)).length === 0, errs.join(" | ").slice(0, 300));
await b.close();
console.log(r.join("\n"));
