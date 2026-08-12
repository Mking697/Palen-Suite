/**
 * Entry point for a host that wants a .js file to start.
 *
 * It only starts the real server. Node still has to be new enough to run the
 * TypeScript underneath (>= 22.6, and on 22.6–22.17 with
 * --experimental-strip-types) — this wrapper does not change that. See
 * DEPLOY.md.
 *
 * The host must set HOST=0.0.0.0 for the app to be reachable through its
 * proxy; the server binds to localhost otherwise, on purpose.
 */

import './server/serve.ts';
