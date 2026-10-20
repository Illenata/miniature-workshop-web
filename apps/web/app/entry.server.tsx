import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { env } from "./lib/env.server";
import { NonceContext } from "./lib/nonce";

export const streamTimeout = 5_000;

/**
 * The <style> block inside model-viewer's shadow DOM (@google/model-viewer 4.3.1).
 * Allowed by hash so style-src needs no 'unsafe-inline'. After upgrading model-viewer,
 * check the browser console in 3D mode: a CSP error prints the new hash to use here.
 */
const MODEL_VIEWER_STYLE_HASH = "'sha256-F7kvx28zBT3UUQL/hTOYst+55RSmqyCY3muSCYmt6A4='";

/**
 * Strict CSP for the pages (spec section 3): scripts only from our origin or with this
 * request's nonce, images and models only from our origin and the files origin.
 * Not applied in development, where Vite injects inline scripts and styles for HMR.
 */
function securityHeaders(headers: Headers, nonce: string) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!env.production) return;
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // 'wasm-unsafe-eval' lets model-viewer compile its bundled meshopt decoder;
      // it allows WebAssembly only, not eval() of JavaScript.
      `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`,
      `style-src 'self' ${MODEL_VIEWER_STYLE_HASH}`,
      // blob: is how three.js hands textures embedded in a glb to the GPU.
      `img-src 'self' data: blob: ${env.filesOrigin}`,
      `connect-src 'self' blob: ${env.filesOrigin}`,
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  const nonce = randomBytes(16).toString("base64");

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");
    // Bots get the complete document; browsers get the shell as soon as it is ready.
    const readyOption =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";

    const { pipe, abort } = renderToPipeableStream(
      <NonceContext.Provider value={nonce}>
        <ServerRouter context={routerContext} url={request.url} nonce={nonce} />
      </NonceContext.Provider>,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html; charset=utf-8");
          securityHeaders(responseHeaders, nonce);
          resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );

    setTimeout(abort, streamTimeout + 1000);
  });
}
