/**
 * Prints the two settings that turn the admin panel on:
 *
 *   npm run admin:setup
 *
 * Asks for a password (not shown while typing), then prints ADMIN_PASSWORD_HASH and
 * ADMIN_TOTP_SECRET for .env and a QR code to scan with Google Authenticator or any
 * other TOTP app. Nothing is written anywhere: copy the two lines into .env yourself.
 * Run it again to change the password or to move TOTP to another phone.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import QRCode from "qrcode";
import { hashPassword } from "../src/lib/password.ts";
import { newTotpSecret, otpauthUri } from "../src/lib/totp.ts";

const MIN_LENGTH = 12;

// One readline interface for the whole run; typed characters are not echoed.
let muted = false;
const rl = createInterface({
  input: process.stdin,
  output: new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  }),
  terminal: process.stdin.isTTY,
});
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string): Promise<string> {
  process.stdout.write(question);
  muted = true;
  const { value } = await lines.next();
  muted = false;
  process.stdout.write("\n");
  return typeof value === "string" ? value : "";
}

const password = await ask(`Admin password (at least ${MIN_LENGTH} characters): `);
if ([...password].length < MIN_LENGTH) {
  console.error(`Too short: use at least ${MIN_LENGTH} characters.`);
  process.exit(1);
}
const again = await ask("Repeat the password: ");
if (again !== password) {
  console.error("The passwords do not match.");
  process.exit(1);
}

rl.close();

const hash = await hashPassword(password);
const secret = newTotpSecret();
const uri = otpauthUri(secret, "admin", "Miniature Workshop");

console.log("\n1. Scan this with Google Authenticator (or type the secret in by hand):\n");
console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
console.log(`   Secret: ${secret}\n`);
console.log("2. Put these two lines into .env (replace the old ones if they exist):\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log(`ADMIN_TOTP_SECRET=${secret}\n`);
console.log("3. Restart the API (docker compose up -d, or npm run dev) and open /admin.\n");
