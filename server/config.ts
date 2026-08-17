/**
 * Where the server listens, and why.
 *
 * This is its own file so it can be tested: `serve.ts` starts listening the
 * moment it is imported, so nothing can import it to ask it a question.
 *
 * The rule, in order:
 *
 *   1. `--local` on the command line -> 127.0.0.1. This is how `npm run dev`
 *      starts, so a desk stays a desk.
 *   2. `HOST` stated -> that, always. An explicit answer is never overridden.
 *   3. Otherwise -> 0.0.0.0.
 *
 * Rule 3 used to be the other way round, and it cost two failed deploys on
 * Hostinger (17 August 2026). Its wizard applies environment variables
 * "during the build process", so `HOST` never reached the running app, it
 * bound to localhost, and the proxy returned 503 with nothing anywhere to say
 * why. Guessing whether we are on a host from the environment does not work —
 * the environment is exactly what cannot be relied on. So the default is what
 * is right for a server, and the one case we do control, our own dev script,
 * says so on the command line.
 *
 * What was given up: a stray `node server/serve.ts` on a laptop now listens on
 * the network. That is a smaller harm than a deploy that fails silently, and
 * `npm run dev` — which is what `GUIDE.md` tells an estimator to run — passes
 * `--local`.
 */

export interface Binding {
  host: string;
  port: number;
  /** why this host was chosen, printed at startup so a 503 is diagnosable */
  reason: string;
}

/** The port a desk uses when nothing supplies one. */
export const DEFAULT_PORT = 5173;

export function binding(
  env: Record<string, string | undefined>,
  argv: readonly string[] = [],
): Binding {
  const port = Number(env.PORT ?? DEFAULT_PORT);

  if (argv.includes('--local')) {
    return { host: '127.0.0.1', port, reason: '--local, so this is a desk' };
  }
  if (env.HOST) {
    return { host: env.HOST, port, reason: 'HOST is set' };
  }
  return {
    host: '0.0.0.0',
    port,
    reason: 'nothing stated — a server should be reachable; use --local for a desk',
  };
}

/**
 * What the environment actually gave us, for the startup log.
 *
 * A host that returns 503 tells you nothing, and its own panel tells you what
 * it *meant* to set rather than what arrived. This prints what arrived. There
 * are no secrets in the app yet; when there are, this must never print values
 * for anything but the names listed here.
 */
export function environmentReport(env: Record<string, string | undefined>): string[] {
  const shown = ['PORT', 'HOST', 'NODE_ENV', 'NODE_OPTIONS'];
  const lines = shown.map((k) => `    ${k} = ${env[k] ?? '(not set)'}`);

  // anything else the platform may be using to say "listen here" — names only
  // for the values, since these are not ours to print
  const others = Object.keys(env)
    .filter((k) => !shown.includes(k) && /PORT|LISTEN|SOCKET|BIND/i.test(k))
    .sort();
  if (others.length) {
    lines.push(`    other port-like names present: ${others.join(', ')}`);
  }
  return lines;
}
