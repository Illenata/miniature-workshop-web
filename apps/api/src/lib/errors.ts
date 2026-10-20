import { ERROR_STATUS, type ApiError, type ErrorCode } from "@mw/contract";

/** Thrown anywhere in a handler; the error handler turns it into the spec's error body. */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly field: string;
  readonly retryAfter: number | undefined;

  constructor(code: ErrorCode, message: string, opts: { field?: string; retryAfter?: number } = {}) {
    super(message);
    this.code = code;
    this.field = opts.field ?? "";
    this.retryAfter = opts.retryAfter;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  toBody(): ApiError {
    const body: ApiError = { error: this.code, message: this.message, field: this.field };
    if (this.retryAfter !== undefined) body.retry_after = this.retryAfter;
    return body;
  }
}
