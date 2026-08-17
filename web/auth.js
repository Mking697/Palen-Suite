/* Accounts, and each estimator's own saved jobs.
   Loaded before app.js and shared through `window.Auth`, so both files stay
   plain scripts that `core/verify/web.test.ts` can run in one vm context.

   The browser talks to Supabase directly — signing in and reading rows need no
   secret, only the project's anon key, and **row level security in the database
   is what keeps one estimator's jobs out of another's**. That is enforced by
   Postgres, not promised by this file: a request without a session is refused
   by the database, whatever this code asks for.

   Everything here is `fetch`. No dependency, the same rule as the rest. */

(function () {
  'use strict';

  /** Where the session lives between page loads. */
  const STORE = 'hikom.session';

  const state = {
    /** { url, anonKey } once /api/config answers, null when accounts are off */
    config: null,
    /** why accounts are unavailable, shown rather than left a mystery */
    reason: '',
    /** { access_token, refresh_token, expires_at, user } */
    session: null,
  };

  const readStored = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE) || 'null');
    } catch {
      return null;
    }
  };

  const store = (session) => {
    state.session = session;
    try {
      if (session) localStorage.setItem(STORE, JSON.stringify(session));
      else localStorage.removeItem(STORE);
    } catch {
      /* a browser with storage turned off still works, just not across loads */
    }
  };

  /** Supabase says what went wrong; show that rather than a generic failure. */
  const messageOf = (body, fallback) =>
    (body && (body.error_description || body.msg || body.message || body.error)) || fallback;

  async function authCall(path, payload) {
    if (!state.config) throw new Error(state.reason || 'Accounts are not set up on this server.');
    const res = await fetch(`${state.config.url}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: state.config.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(messageOf(body, `Sign in failed (${res.status})`));
    return body;
  }

  /**
   * A session that is about to expire is no session. Refresh a minute early so
   * a long edit does not end with a save that is turned away.
   */
  async function fresh() {
    const s = state.session;
    if (!s) return null;
    if (s.expires_at && s.expires_at - 60 > Date.now() / 1000) return s;
    try {
      const body = await authCall('token?grant_type=refresh_token', {
        refresh_token: s.refresh_token,
      });
      const next = { ...body, expires_at: Math.floor(Date.now() / 1000) + (body.expires_in || 3600) };
      store(next);
      return next;
    } catch {
      store(null); //  refresh refused: the session is gone, say so by having none
      return null;
    }
  }

  /** A REST call as the signed-in user. The database decides what they may see. */
  async function db(path, options) {
    const opts = options || {};
    const session = await fresh();
    if (!session) throw new Error('Not signed in.');
    const res = await fetch(`${state.config.url}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: {
        apikey: state.config.anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'content-type': 'application/json',
        ...(opts.prefer ? { Prefer: opts.prefer } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(messageOf(body, `Request failed (${res.status})`));
    return body;
  }

  const Auth = {
    /** True once the server has handed over a project to talk to. */
    get available() {
      return !!state.config;
    },
    get reason() {
      return state.reason;
    },
    get user() {
      return state.session ? state.session.user : null;
    },
    get email() {
      return state.session && state.session.user ? state.session.user.email : '';
    },

    /** Ask the server which project to use, and pick up any stored session. */
    async boot() {
      try {
        const cfg = await (await fetch('/api/config')).json();
        state.config = cfg.supabase;
        state.reason = cfg.accountsReason || '';
      } catch {
        state.reason = 'The server did not answer /api/config.';
      }
      if (!state.config) return null;
      state.session = readStored();
      return fresh();
    },

    /**
     * Sign up. Supabase is set to require a confirmed email, so this returns
     * with no session — the estimator has to click the link first. Saying that
     * plainly is the whole point; a silent "nothing happened" is what makes
     * people try again three times.
     */
    async signUp(email, password) {
      const body = await authCall('signup', { email, password });
      if (body.access_token) {
        store({ ...body, expires_at: Math.floor(Date.now() / 1000) + (body.expires_in || 3600) });
        return { verified: true };
      }
      return { verified: false };
    },

    async signIn(email, password) {
      const body = await authCall('token?grant_type=password', { email, password });
      store({ ...body, expires_at: Math.floor(Date.now() / 1000) + (body.expires_in || 3600) });
      return state.session;
    },

    /** Send the confirmation email again, for the one that never arrived. */
    async resendConfirmation(email) {
      await authCall('resend', { type: 'signup', email });
    },

    async signOut() {
      store(null);
    },

    /* ---------- the estimator's own jobs ---------- */

    /** Every saved job, newest first — job numbers and dates only, not specs. */
    async listJobs() {
      return db('jobs?select=job_no,updated_at&order=updated_at.desc');
    },

    /** One saved job's spec, or null when there is no such job of theirs. */
    async loadJob(jobNo) {
      const rows = await db(`jobs?job_no=eq.${encodeURIComponent(jobNo)}&select=spec&limit=1`);
      return rows && rows.length ? rows[0].spec : null;
    },

    /**
     * Save under this job number, replacing what was there.
     *
     * `unique (user_id, job_no)` is what makes this one row per job per user,
     * so *Save* is an upsert and two estimators may each have their own
     * HI-15191. Only the spec is stored — the BOQ is generated, and storing a
     * generated figure is how a saved job and a fresh one start to disagree.
     */
    async saveJob(jobNo, spec) {
      const session = await fresh();
      if (!session) throw new Error('Not signed in.');
      await db('jobs?on_conflict=user_id,job_no', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: [
          {
            user_id: session.user.id,
            job_no: jobNo,
            spec,
            updated_at: new Date().toISOString(),
          },
        ],
      });
    },

    async deleteJob(jobNo) {
      await db(`jobs?job_no=eq.${encodeURIComponent(jobNo)}`, { method: 'DELETE' });
    },
  };

  window.Auth = Auth;
})();
