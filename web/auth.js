/* Accounts, and each estimator's own saved jobs.
   Loaded before app.js and shared through `window.Auth`, so both files stay
   plain scripts that `core/verify/web.test.ts` can run in one vm context.

   The browser now talks to our own server (`/api/auth/*`, `/api/jobs/saved`)
   rather than to Supabase. The server holds the database connection and the
   session table; this file never sees a database credential of any kind —
   only the bearer token it is handed back after signing in.

   Everything here is `fetch`. No dependency, the same rule as the rest. */

(function () {
  'use strict';

  /** Where the session lives between page loads. */
  const STORE = 'panelcalc.session';

  const state = {
    /** true once /api/config says accounts are available */
    available: false,
    /** why accounts are unavailable, shown rather than left a mystery */
    reason: '',
    /** { accessToken, expiresAt, user: { id, email, isAdmin } } */
    session: null,
    /** the signed-in user's own profile row, once fetched */
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

  /** The server says what went wrong; show that rather than a generic failure. */
  const messageOf = (body, fallback) => (body && body.error) || fallback;

  async function api(path, options) {
    const opts = options || {};
    const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
    if (state.session) headers.Authorization = `Bearer ${state.session.accessToken}`;
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(messageOf(body, `Request failed (${res.status})`));
    return body;
  }

  /** A session past its expiry is no session — the server has already forgotten it too. */
  function liveSession() {
    const s = state.session;
    if (!s) return null;
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) {
      store(null);
      return null;
    }
    return s;
  }

  const Auth = {
    /** True once the server has said accounts are set up here. */
    get available() {
      return state.available;
    },
    get reason() {
      return state.reason;
    },
    get user() {
      const s = liveSession();
      return s ? s.user : null;
    },
    get email() {
      const s = liveSession();
      return s ? s.user.email : '';
    },

    /** The live session, or null when it has expired. Kept for callers that used to await a refresh. */
    async session() {
      return liveSession();
    },

    /** Ask the server whether accounts are set up, and pick up any stored session. */
    async boot() {
      try {
        const cfg = await (await fetch('/api/config')).json();
        state.available = !!cfg.accounts;
        state.reason = cfg.accountsReason || '';
      } catch {
        state.available = false;
        state.reason = 'The server did not answer /api/config.';
      }
      state.session = readStored();
      return liveSession();
    },

    /**
     * Sign up. The server requires a confirmed email, so this returns with no
     * session — a six digit code goes to the address instead, and `verifyOtp`
     * is the next step. Saying that plainly is the whole point; a silent
     * "nothing happened" is what makes people try again three times.
     */
    async signUp(email, password) {
      await api('/api/auth/signup', { method: 'POST', body: { email, password } });
      return { verified: false };
    },

    /** The code from the signup email. */
    async verifyOtp(email, token) {
      const body = await api('/api/auth/verify', {
        method: 'POST',
        body: { email, token: token.trim() },
      });
      store(body);
      return state.session;
    },

    async signIn(email, password) {
      const body = await api('/api/auth/signin', { method: 'POST', body: { email, password } });
      store(body);
      return state.session;
    },

    /** Send the confirmation email again, for the one that never arrived. */
    async resendConfirmation(email) {
      await api('/api/auth/resend', { method: 'POST', body: { email } });
    },

    async signOut() {
      try {
        await api('/api/auth/signout', { method: 'POST' });
      } catch {
        /* the token may already be gone server-side; signing out locally still matters */
      }
      store(null);
    },

    /* ---------- who this is, and until when ---------- */

    /**
     * The signed-in user's own profile row: when their access runs out, and
     * whether they are an admin.
     *
     * **This is read, not trusted.** The server is what enforces both — every
     * saved-job route checks `hasAccess` again itself, so an expired account
     * is refused by the server whatever this screen decides to show. What is
     * fetched here only decides what to *say*.
     */
    async profile() {
      const session = liveSession();
      if (!session) return null;
      try {
        const body = await api('/api/auth/profile');
        state.profile = body.profile;
        state.profileError = '';
      } catch (err) {
        state.profile = null;
        state.profileError = err.message;
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
     * Where this estimator's paperwork goes: the Drive folder, the Sheet, and
     * the address their email is sent from.
     *
     * Read off the profile row that `profile()` already fetched, so opening
     * the settings screen costs no second request. `''` rather than `null`
     * because these go straight into text inputs.
     */
    get settings() {
      const p = state.profile || {};
      return {
        displayName: p.display_name || '',
        driveFolderUrl: p.drive_folder_url || '',
        sheetUrl: p.sheet_url || '',
        mailFrom: p.mail_from || '',
      };
    },

    /**
     * Save the four the screen shows, and read the row back rather than
     * assume it took.
     *
     * The server is what decides here as everywhere else: `/api/auth/profile`
     * writes exactly these four columns and no others — `access_until` and
     * `is_admin` can never be reached through this call, the same guarantee
     * `profiles_guard_privileges` used to give in Postgres, now made by the
     * server's own column list instead of a database trigger.
     */
    async saveSettings(fields) {
      const body = await api('/api/auth/profile', { method: 'PATCH', body: fields });
      state.profile = body.profile;
      return state.profile;
    },

    /* ---------- admin ---------- */

    /** Everyone, for the admin screen. The server refuses this to a non-admin. */
    async listUsers() {
      const body = await api('/api/admin/users');
      return body.users;
    },

    /** Give this account access until `until`, or null to stop it now. */
    async setAccess(id, until) {
      await api('/api/admin/access', { method: 'PATCH', body: { id, until } });
    },

    /**
     * Remove an account for good, with everything it saved.
     *
     * The server checks that the caller really is an admin before deleting
     * anything, against the database rather than against what the request
     * claims about itself.
     */
    async deleteUser(id) {
      await api('/api/admin/user', { method: 'DELETE', body: { id } });
    },

    /* ---------- the estimator's own jobs ---------- */

    /** Every saved job, newest first — job numbers and dates only, not specs. */
    async listJobs() {
      const body = await api('/api/jobs/saved');
      return body.jobs;
    },

    /** One saved job's spec, or null when there is no such job of theirs. */
    async loadJob(jobNo) {
      try {
        const body = await api(`/api/jobs/saved/${encodeURIComponent(jobNo)}`);
        return body.spec;
      } catch {
        return null;
      }
    },

    /**
     * Save under this job number, replacing what was there.
     *
     * The server upserts on `(user_id, job_no)`, so *Save* always replaces
     * exactly this estimator's own copy of this job number. Only the spec is
     * stored — the BOQ is generated, and storing a generated figure is how a
     * saved job and a fresh one start to disagree.
     */
    async saveJob(jobNo, spec) {
      await api('/api/jobs/saved', { method: 'POST', body: { jobNo, spec } });
    },

    async deleteJob(jobNo) {
      await api(`/api/jobs/saved/${encodeURIComponent(jobNo)}`, { method: 'DELETE' });
    },
  };

  window.Auth = Auth;
})();
