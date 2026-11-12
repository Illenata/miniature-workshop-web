import { BASE, API, S3, launch, psql, shot, adminCredentials } from "./lib.mjs";

const { password: PASSWORD, totp } = adminCredentials();
psql("delete from admin_sessions; delete from admin_actions; delete from app_state where key='admin_totp_last_step'");

const b = await launch();
const r = []; const ok = (n, c, x = "") => r.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const errs = [];
const ctx = await b.newContext({ viewport: { width: 360, height: 740 } });
const p = await ctx.newPage();
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));

// Not logged in: /admin sends to the login page.
await p.goto(`${BASE}/admin`);
ok("/admin redirects to login", p.url().endsWith("/admin/login"), p.url());
const hdr = (await p.request.get(`${BASE}/admin/login`)).headers();
ok("login page: no-store, noindex", hdr["cache-control"] === "no-store" && (await p.locator('meta[name=robots]').getAttribute("content")).includes("noindex"));
ok("login page has no public site header", (await p.getByRole("link", { name: "Gallery" }).count()) === 0);
await p.screenshot({ path: shot("admin-login.png") });

const login = async (pw, code) => {
  await p.goto(`${BASE}/admin/login`);
  await p.getByLabel("Пароль").fill(pw);
  await p.getByLabel(/Код із застосунку/).fill(code);
  await p.getByRole("button", { name: "Увійти" }).click();
  await p.waitForLoadState("networkidle");
};

await login("wrong-password", totp());
ok("wrong password: same generic error", (await p.getByRole("alert").innerText()) === "Неправильний пароль або код.");
// Wait for a fresh step so the next valid code was not burned by the failed attempt.
await login(PASSWORD, "000000");
ok("wrong code: same generic error", (await p.getByRole("alert").innerText()) === "Неправильний пароль або код.");

await login(PASSWORD, totp(1));
ok("right password + code logs in", p.url().endsWith("/admin"), p.url());
const cookie = (await ctx.cookies(`${BASE}/admin`)).find((c) => c.name === "mw_admin");
ok("cookie: HttpOnly, SameSite=Strict", cookie?.httpOnly && cookie.sameSite === "Strict", JSON.stringify({ h: cookie?.httpOnly, s: cookie?.sameSite, p: cookie?.path }));
const ttlH = (cookie.expires - Date.now() / 1000) / 3600;
ok("session lasts 12 hours", ttlH > 11.9 && ttlH <= 12, ttlH.toFixed(2));
ok("cookie invisible to page scripts", !(await p.evaluate(() => document.cookie)).includes("mw_admin"));
ok("token stored only as a hash", psql("select count(*) from admin_sessions where token_hash = '" + cookie.value.replace(/'/g, "") + "'") === "0" && psql("select count(*) from admin_sessions") === "1");
const body = await p.locator("main").innerText();
ok("journal shows the login and the failures", body.includes("Вхід") && body.includes("Невдала спроба входу"));
await p.screenshot({ path: shot("admin-home.png") });

// The same code cannot be used twice (another browser).
{
  const ctx2 = await b.newContext(); const q = await ctx2.newPage();
  await q.goto(`${BASE}/admin/login`);
  await q.getByLabel("Пароль").fill(PASSWORD);
  await q.getByLabel(/Код із застосунку/).fill(totp(1));
  await q.getByRole("button", { name: "Увійти" }).click();
  await q.waitForLoadState("networkidle");
  ok("a used code is rejected", q.url().endsWith("/admin/login") && (await q.getByRole("alert").count()) === 1);
  await ctx2.close();
}

// Cross-site POST is refused.
const forged = await p.request.post(`${BASE}/admin/logout`, { headers: { Origin: "https://evil.example" } });
ok("POST from another origin: 403", forged.status() === 403);
ok("still logged in after the forged POST", (await p.goto(`${BASE}/admin`)).status() === 200 && p.url().endsWith("/admin"));

// Logout.
await p.getByRole("button", { name: "Вийти" }).click();
await p.waitForURL(/\/admin\/login$/);
ok("logout ends the session", psql("select count(*) from admin_sessions") === "0");
await p.goto(`${BASE}/admin`);
ok("after logout /admin asks to log in again", p.url().endsWith("/admin/login"));

// Expired session.
psql("delete from app_state where key='admin_totp_last_step'");
await login(PASSWORD, totp());
psql("update admin_sessions set expires_at = now() - interval '1 minute'");
await p.goto(`${BASE}/admin`);
ok("expired session is refused", p.url().endsWith("/admin/login"));

// Rate limit: 5 failures, then locked even with the right credentials.
psql("delete from app_state where key='admin_totp_last_step'");
for (let i = 0; i < 5; i++) await login("nope", "111111");
await login(PASSWORD, totp());
const lim = await p.getByRole("alert").innerText();
ok("after 5 failures: locked for 15 min", lim.startsWith("Забагато невдалих спроб"), lim);

ok("public pages unaffected", (await p.goto(`${BASE}/gallery`)).status() === 200 && (await p.getByRole("link", { name: "Gallery" }).count()) === 1);
ok("console clean", errs.filter((e) => !/40[139]|429/.test(e)).length === 0, errs.join(" | ").slice(0, 300));
await b.close();
console.log(r.join("\n"));
