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
  const STORE = 'panelcalc.session';

  const state = {
    /** { url, anonKey } once /api/config answers, null when accounts are off */
    config: null,
    /** why accounts are unavailable, shown rather than left a mystery */
    reason: '',
    /** { access_token, refresh_token, expires_at, user } */
    session: null,
    /** the signed-in user's own profiles row, once fetched */
    profile: null,
    /** why there is no profile row, when there is none */
    profileError: '',
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
    if (!session) state.profile = null; //  signed out: whose profile would it be
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

    /**
     * The live session, refreshed if it is about to expire.
     *
     * Exposed because two things now need the access token to talk to our own
     * server rather than to Supabase: deleting a user, and sending an email.
     * Both endpoints work out who is calling from this token instead of
     * believing what the request says about itself.
     */
    async session() {
      return fresh();
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
     * with no session — a six digit code goes to the address instead, and
     * `verifyOtp` is the next step. Saying that plainly is the whole point; a
     * silent "nothing happened" is what makes people try again three times.
     */
    async signUp(email, password) {
      const body = await authCall('signup', { email, password });
      if (body.access_token) {
        store({ ...body, expires_at: Math.floor(Date.now() / 1000) + (body.expires_in || 3600) });
        return { verified: true };
      }
      return { verified: false };
    },

    /**
     * The code from the signup email. Supabase sends both a link and a token;
     * the template prints the token, and this is the half that uses it.
     *
     * A code beats a link here for a reason worth keeping: a link only works if
     * Supabase's Site URL is right, and that setting is invisible, defaults to
     * localhost, and broke this three times. A code depends on no URL at all.
     */
    async verifyOtp(email, token) {
      const body = await authCall('verify', { type: 'signup', email, token: token.trim() });
      store({ ...body, expires_at: Math.floor(Date.now() / 1000) + (body.expires_in || 3600) });
      return state.session;
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

    /* ---------- who this is, and until when ---------- */

    /**
     * The signed-in user's own profile row: when their access runs out, and
     * whether they are an admin.
     *
     * **This is read, not trusted.** The database is what enforces both — the
     * `jobs` policy carries `has_access()`, so an expired account is refused by
     * Postgres whatever this screen decides to show. What is fetched here only
     * decides what to *say*.
     */
    async profile() {
      const session = await fresh();
      if (!session) return null;
      try {
        /*
         * Asked for by id, not with `limit=1`.
         *
         * An ordinary user can only read their own row, so "give me one row"
         * looked equivalent — until the admin policy widened the read to every
         * row, and then the administrator was handed somebody else's profile:
         * not an admin, and with the wrong expiry date. The screen dutifully
         * showed it. Widening a policy can quietly break an assumption the app
         * did not know it was making, so this asks for the row it means.
         */
        const rows = await db(
          `profiles?id=eq.${encodeURIComponent(session.user.id)}` +
            '&select=id,email,access_until,is_admin' +
            ',display_name,drive_script_url,sheet_script_url,mail_from' +
            ',drive_folder_url,sheet_url&limit=1',
        );
        state.profile = rows && rows.length ? rows[0] : null;
        state.profileError = '';
      } catch (err) {
        /*
         * A database that has not had the access columns added yet answers
         * "column profiles.access_until does not exist". Kept apart from an
         * account that simply has no time left: one is a setup step nobody has
         * run, the other is a decision an administrator made, and showing the
         * second for the first sends people looking in the wrong place. It
         * cost a round of that before this told them apart.
         */
        state.profile = null;
        state.profileError = /does not exist/i.test(err.message)
          ? 'The database is missing columns the app needs — not all of the setup SQL in sql/ has been run yet.'
          : err.message;
      }
      return state.profile;
    },

    /** Why there is no profile, when there is none. */
    get profileError() {
      return state.profileError;
    },

    get isAdmin() {
      return !!(state.profile && state.profile.is_admin);
    },

    /** Access runs to this moment, or null when nobody has granted any. */
    get accessUntil() {
      return state.profile ? state.profile.access_until : null;
    },

    get hasAccess() {
      if (!state.profile) return false;
      if (state.profile.is_admin) return true;
      const until = state.profile.access_until;
      return !!until && new Date(until).getTime() > Date.now();
    },

    /* ---------- the estimator's own settings ---------- */

    /**
     * Where this estimator's paperwork goes: the Apps Script Web App that files
     * the drawing and workbook into their Drive folder, the one that appends a
     * row to their Google Sheet — often the same script — and the address their
     * email is sent from.
     *
     * Read off the profile row that `profile()` already fetched, so opening the
     * settings screen costs no second request. `''` rather than `null` because
     * these go straight into text inputs.
     */
    get settings() {
      const p = state.profile || {};
      return {
        displayName: p.display_name || '',
        driveFolderUrl: p.drive_folder_url || '',
        sheetUrl: p.sheet_url || '',
        driveScriptUrl: p.drive_script_url || '',
        sheetScriptUrl: p.sheet_script_url || '',
        mailFrom: p.mail_from || '',
      };
    },

    /**
     * Save the four the screen shows, and read the row back rather than assume
     * it took.
     *
     * The database is what decides here as everywhere else: `change own profile`
     * limits this to the caller's own row, and the `profiles_guard_privileges`
     * trigger from `sql/04-profile-fields.sql` refuses any attempt to reach
     * `access_until` or `is_admin` through the same call. This method sends four
     * columns and no others, but that is not what makes it safe — the trigger
     * is, because the request can be written by hand.
     */
    async saveSettings(fields) {
      const session = await fresh();
      if (!session) throw new Error('Not signed in.');
      const trim = (v) => String(v ?? '').trim();
      await db(`profiles?id=eq.${encodeURIComponent(session.user.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        /*
         * The two `_script_url` columns are deliberately not written. Phase 11
         * stopped being "an Apps Script each estimator deploys" on 18 August —
         * see DESIGN.md — so the screen no longer offers them, and a PATCH that
         * named them would blank whatever an early tester had already typed.
         * A column this screen does not show is a column it does not touch.
         */
        body: {
          display_name: trim(fields.displayName) || null,
          drive_folder_url: trim(fields.driveFolderUrl) || null,
          sheet_url: trim(fields.sheetUrl) || null,
          mail_from: trim(fields.mailFrom) || null,
        },
      });
      return Auth.profile();
    },

    /* ---------- admin ---------- */

    /**
     * Everyone, for the admin screen. An ordinary user asking for this gets
     * their own row back and nothing else — the policy sees to that, so the
     * list cannot leak by the screen forgetting to filter.
     */
    async listUsers() {
      return db('profiles?select=id,email,access_until,is_admin&order=access_until.desc');
    },

    /** Give this account access until `until`, or null to stop it now. */
    async setAccess(id, until) {
      await db(`profiles?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { access_until: until },
      });
    },

    /**
     * Remove an account for good, with everything it saved.
     *
     * This one goes through our own server, and it is the only thing here that
     * does. Deleting a user needs Supabase's service key, which bypasses every
     * policy — so it can never be in a browser. The server holds it, checks
     * that the caller really is an admin before using it, and that check is
     * made against the database rather than taken from the request.
     */
    async deleteUser(id) {
      const session = await fresh();
      if (!session) throw new Error('Not signed in.');
      const res = await fetch('/api/admin/user', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Could not delete (${res.status})`);
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
