/**
 * Worker entry point.
 *
 * Static files in public/ are served by the assets binding; anything under
 * /api is handled here. The API modules keep the context-object shape they
 * were written against, so this is the only file that knows about the
 * Worker fetch signature.
 *
 * Bindings (see wrangler.toml):
 *   ASSETS  static assets from public/
 *   DB      D1 database
 */

import { handle as subscribe } from "./api/subscribe.js";
import { handle as exportList } from "./api/export.js";
import { handle as unsubscribe } from "./api/unsubscribe.js";
import { json } from "./shared.js";

const ROUTES = {
  "/api/subscribe": subscribe,
  "/api/export": exportList,
  "/api/unsubscribe": unsubscribe,
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname.replace(/\/+$/, "") || pathname];

    if (!route) {
      // Not an endpoint: hand it to the static assets.
      if (pathname.startsWith("/api/")) {
        return json({ error: "Not found." }, 404);
      }
      return env.ASSETS.fetch(request);
    }

    try {
      return await route({
        request,
        env,
        waitUntil: ctx.waitUntil.bind(ctx),
      });
    } catch (err) {
      // A handler throwing is a bug, not a client error. Log it and answer
      // with something the page can render rather than an empty 500.
      console.error(`unhandled error in ${pathname}:`, err && err.stack);
      return json({ error: "Something went wrong on our end." }, 500);
    }
  },
};
