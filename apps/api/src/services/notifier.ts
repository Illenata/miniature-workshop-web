import { and, asc, eq, gt, sql } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.ts";
import type { Db } from "../db/client.ts";
import { appState, miniatures, reports } from "../db/schema.ts";

const STATE_KEY = "moderator_mail";
const MIN_INTERVAL_MS = 60 * 60_000; // spec section 7: not more than one email an hour
const MAX_LISTED = 50;

type MailState = { lastSentAt: string; coveredUntil: string };

const REASONS: Record<string, string> = {
  offensive: "образливий вміст",
  spam: "спам",
  stolen: "чужа робота",
  other: "інше",
};

/**
 * Emails the moderator about new reports (spec section 7). The first report triggers an
 * email at once; reports within the next hour are collected and sent together when the
 * hour is up. When the email went out is kept in the database, so restarts do not
 * resend or skip anything.
 */
export class ModeratorNotifier {
  private readonly transport: Transporter | null;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private log: Pick<FastifyBaseLogger, "info" | "warn" | "error"> = console;

  constructor(
    private readonly db: Db,
    private readonly config: Pick<Config, "SMTP_URL" | "MAIL_FROM" | "MODERATOR_EMAIL" | "PUBLIC_BASE_URL">,
    transport?: Transporter,
  ) {
    const configured = Boolean(config.SMTP_URL && config.MODERATOR_EMAIL);
    this.transport = transport ?? (configured ? nodemailer.createTransport(config.SMTP_URL) : null);
  }

  /** Uses the app's structured logger once it exists. */
  useLogger(log: Pick<FastifyBaseLogger, "info" | "warn" | "error">) {
    this.log = log;
    if (!this.transport) log.warn("SMTP_URL or MODERATOR_EMAIL not set: report emails are disabled");
  }

  /** Called after a new report is stored; never throws. */
  reportCreated(): void {
    void this.flush().catch((err) => this.log.error({ err }, "moderator email failed"));
  }

  /** Sends pending reports now or schedules the send for when the hour is up. */
  flush(now = new Date()): Promise<void> {
    if (!this.transport) return Promise.resolve();
    // One run at a time: concurrent reports must not produce two emails.
    this.running ??= this.run(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(now: Date) {
    const [row] = await this.db.select().from(appState).where(eq(appState.key, STATE_KEY));
    const state = row?.value as MailState | undefined;

    if (state) {
      const wait = new Date(state.lastSentAt).getTime() + MIN_INTERVAL_MS - now.getTime();
      if (wait > 0) {
        this.schedule(wait);
        return;
      }
    }

    // First run ever: only the last day, not the whole history.
    const since = state ? new Date(state.coveredUntil) : new Date(now.getTime() - 86_400_000);
    const pending = await this.db
      .select({
        createdAt: reports.createdAt,
        reason: reports.reason,
        text: reports.text,
        miniatureId: reports.miniatureId,
        title: miniatures.title,
        status: miniatures.status,
        hiddenReason: miniatures.hiddenReason,
      })
      .from(reports)
      .innerJoin(miniatures, eq(miniatures.id, reports.miniatureId))
      .where(and(gt(reports.createdAt, since), sql`${reports.createdAt} <= ${now.toISOString()}::timestamptz`))
      .orderBy(asc(reports.createdAt));
    if (pending.length === 0) return;

    const coveredUntil = pending.at(-1)!.createdAt.toISOString();
    const lines = pending.slice(0, MAX_LISTED).map((r) => {
      const hidden = r.status === "hidden" && r.hiddenReason === "reports" ? " [автоматично приховано]" : "";
      const text = r.text ? ` — «${r.text.replace(/\s+/g, " ")}»` : "";
      return `• ${r.title} — ${REASONS[r.reason] ?? r.reason}${text}${hidden}\n  ${this.config.PUBLIC_BASE_URL}/m/${r.miniatureId}`;
    });
    if (pending.length > MAX_LISTED) lines.push(`…і ще ${pending.length - MAX_LISTED}`);
    const autoHidden = new Set(
      pending.filter((r) => r.status === "hidden" && r.hiddenReason === "reports").map((r) => r.miniatureId),
    ).size;

    await this.transport!.sendMail({
      from: this.config.MAIL_FROM,
      to: this.config.MODERATOR_EMAIL,
      subject:
        `Нові скарги: ${pending.length}` + (autoHidden ? `, автоматично приховано мініатюр: ${autoHidden}` : ""),
      text: `Нові скарги на мініатюри:\n\n${lines.join("\n\n")}\n`,
    });

    const value: MailState = { lastSentAt: now.toISOString(), coveredUntil };
    await this.db
      .insert(appState)
      .values({ key: STATE_KEY, value, updatedAt: now })
      .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: now } });
    this.log.info({ reports: pending.length }, "moderator email sent");
  }

  private schedule(ms: number) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.reportCreated();
    }, ms);
    this.timer.unref();
  }
}
