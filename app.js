/**
 * Entry point for a host that wants a .js file to start.
 *
 * It only starts the real server. Node still has to be new enough to run the
 * TypeScript underneath — this wrapper does not change that, it only says so
 * plainly. Without the check the failure is `Unknown file extension ".ts"` in a
 * host's log, which says nothing about what to do next. See DEPLOY.md.
 *
 * Started this way the app binds every interface, which is what a host behind
 * a proxy needs; `npm run dev` passes `--local` to stay on this machine. See
 * server/config.ts for the rule and what two failed deploys taught it.
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

// Where it listens is server/config.ts's decision, and it prints that decision
// together with the environment it actually received. Nothing to warn about
// here: started this way, without --local, it binds where a proxy can reach it.

await import('./server/serve.ts');
