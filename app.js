/**
 * Entry point for a host that wants a .js file to start.
 *
 * It only starts the real server. Node still has to be new enough to run the
 * TypeScript underneath — this wrapper does not change that, it only says so
 * plainly. Without the check the failure is `Unknown file extension ".ts"` in a
 * host's log, which says nothing about what to do next. See DEPLOY.md.
 *
 * The host must also set HOST=0.0.0.0 for the app to be reachable through its
 * proxy; the server binds to localhost otherwise, on purpose.
 */

const [major, minor] = process.versions.node.split('.').map(Number);
const atLeast = (wantMajor, wantMinor) =>
  major > wantMajor || (major === wantMajor && minor >= wantMinor);

/**
 * From 22.18 and on 23+, Node strips types on its own and reports it here.
 * On 22.6–22.17 it needs --experimental-strip-types, and this is undefined.
 */
const stripsTypes = process.features.typescript;

if (!atLeast(22, 6)) {
  console.error(
    `\n  This app runs its TypeScript directly, with no build step, which needs` +
      `\n  Node 22.6 or newer. This is Node ${process.versions.node}.` +
      `\n` +
      `\n  On a host: pick a newer Node in the application's settings.` +
      `\n  See DEPLOY.md — "The Node version is the deal-breaker".\n`,
  );
  process.exit(1);
}

if (!stripsTypes && !atLeast(22, 18)) {
  console.error(
    `\n  Node ${process.versions.node} can run this app, but only with type` +
      `\n  stripping turned on. Set this in the host's environment:` +
      `\n` +
      `\n      NODE_OPTIONS=--experimental-strip-types` +
      `\n` +
      `\n  Node 22.18 and newer need nothing. See DEPLOY.md.\n`,
  );
  process.exit(1);
}

if (process.env.HOST === undefined) {
  // not fatal: it is the right default on a desk, and the wrong one behind a
  // proxy, so it is said rather than decided
  console.warn(
    `  HOST is not set, so this binds to 127.0.0.1 and a host's proxy cannot` +
      ` reach it.\n  Set HOST=0.0.0.0 when deploying.\n`,
  );
}

await import('./server/serve.ts');
