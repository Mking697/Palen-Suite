/**
 * Where the server listens, and why.
 *
 * This is its own file so it can be tested: `serve.ts` starts listening the
 * moment it is imported, so nothing can import it to ask it a question.
 *
 * The rule, in order:
 *
 *   1. `HOST` stated  -> that, always. An explicit answer is never overridden.
 *   2. `PORT` supplied by the platform -> 0.0.0.0, because a platform that
 *      assigns a port is a platform proxying to you, and binding to localhost
 *      there means the proxy gets a refused connection and the site returns
 *      503 with nothing in any log to say why.
 *   3. Otherwise -> 127.0.0.1. On a desk this is a local tool and the sheets
 *      are job data; it should not appear on the office network by accident.
 *
 * Rule 2 was learnt the hard way on Hostinger, 17 August 2026: its deploy
 * wizard applies environment variables "during the build process", so `HOST`
 * never reached the running app and the first deploy 503'd.
 */

export interface Binding {
  host: string;
  port: number;
  /** why this host was chosen, printed at startup so a 503 is diagnosable */
  reason: string;
}

/** The port a desk uses when nothing supplies one. */
export const DEFAULT_PORT = 5173;

export function binding(env: Record<string, string | undefined>): Binding {
  const port = Number(env.PORT ?? DEFAULT_PORT);

  if (env.HOST) {
    return { host: env.HOST, port, reason: 'HOST is set' };
  }
  if (env.PORT) {
    return {
      host: '0.0.0.0',
      port,
      reason: 'PORT came from the platform, so this is behind a proxy',
    };
  }
  return {
    host: '127.0.0.1',
    port,
    reason: 'nothing was stated, so this is a desk — set HOST to change it',
  };
}
