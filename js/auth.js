// ============================================================
// AUTH + PERSISTENCE — talks to /api/auth/* and /api/systems
// ============================================================
// Lives outside app.js so the existing system logic stays untouched.
// On successful login it:
//   1. Stores the JWT in localStorage
//   2. Hides the auth overlay
//   3. Loads the user's systems from the backend → window.systems
//   4. Re-renders the senarai + dashboard
//   5. Installs an auto-save handler that pushes any change back to /api/systems
// ============================================================

(function () {
  const API = (typeof AI_BACKEND_URL === 'string') ? AI_BACKEND_URL : 'http://localhost:3001';
  const TOKEN_KEY = 'fuse_jwt';
  const USER_KEY  = 'fuse_user';

  // ------------------------------------------------------------------
  // Storage helpers
  // ------------------------------------------------------------------
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser()  { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (_) { return null; } }
  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function apiFetch(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    const r = await fetch(API + path, { ...opts, headers });
    let data = null;
    try { data = await r.json(); } catch (_) { /* may be empty */ }
    if (!r.ok) {
      const msg = (data && data.error) || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ------------------------------------------------------------------
  // UI helpers
  // ------------------------------------------------------------------
  function showOverlay(show) {
    const o = document.getElementById('auth-overlay');
    if (!o) return;
    o.classList.toggle('hidden', !show);
  }

  function showError(msg) {
    const e = document.getElementById('auth-error');
    if (!e) return;
    e.textContent = msg;
    e.classList.add('show');
  }
  function clearError() {
    const e = document.getElementById('auth-error');
    if (e) e.classList.remove('show');
  }

  function setUserBadge(user) {
    const el = document.querySelectorAll('.user-profile');
    el.forEach(node => {
      // Replace the whole content but keep the avatar + ≡ glyph
      node.innerHTML = `<span class="user-profile-name">${user ? user.name : 'GUEST'}</span> <span class="user-avatar"></span> ≡`;
    });
  }

  // ------------------------------------------------------------------
  // Persistence — load / save through the API
  // ------------------------------------------------------------------
  let saveTimer = null;
  let saving    = false;
  let pendingSave = false;

  async function loadUserSystems() {
    try {
      const data = await apiFetch('/api/systems');
      // Replace in-memory state with what the server has. We mutate the
      // existing `systems` object in place so the `let systems` binding
      // inside app.js still points to the same reference.
      const target = (window.systems = window.systems || {});
      Object.keys(target).forEach(k => delete target[k]);
      Object.assign(target, data.systems || {});
      window.currentSystemCode = null;
      // Re-render senarai + dashboard. The functions live in app.js.
      if (typeof renderSenaraiTable === 'function') renderSenaraiTable();
      if (typeof renderDashboard    === 'function') renderDashboard();
    } catch (err) {
      console.error('Load systems failed:', err);
      // If the token is invalid (401) → drop back to login.
      if (/401|token/i.test(err.message)) {
        clearAuth();
        showOverlay(true);
      }
    }
  }

  // Bulk push the whole `systems` object. Debounced — frequent edits
  // collapse into one network round-trip.
  function scheduleSave(delayMs = 800) {
    if (!getToken()) return; // not logged in yet
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(runSave, delayMs);
  }

  // skipDomPersist: when true, do NOT serialize the current page's DOM into
  // systems[] first. The AI uses this — it has already written authoritative
  // data straight into systems[], and a DOM-persist could overwrite it with
  // stale rows from whatever page is showing behind the modal.
  async function runSave(skipDomPersist) {
    if (saving) { pendingSave = true; return; }
    saving = true;
    setSaveStatus('Menyimpan…');
    try {
      // Persist whatever's in the DOM into systems[] before we ship it.
      if (!skipDomPersist && typeof persistCurrentSystemState === 'function') {
        try { persistCurrentSystemState(); } catch (_) { /* tolerate */ }
      }
      await apiFetch('/api/systems', {
        method: 'PUT',
        body: JSON.stringify({ systems: window.systems || {} }),
      });
      setSaveStatus('Tersimpan ✓', 1800);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('Gagal simpan', 3000);
    } finally {
      saving = false;
      if (pendingSave) { pendingSave = false; scheduleSave(50); }
    }
  }

  function setSaveStatus(text, autoclear = 0) {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.textContent = text;
    if (autoclear) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, autoclear);
  }

  // Expose for app.js to trigger save on add/edit/delete.
  window.fuseScheduleSave = scheduleSave;
  window.fuseLoadUserSystems = loadUserSystems;
  // Direct save that SKIPS the DOM-persist step. Used by the AI chatbox after
  // it injects a system straight into systems[] — see runSave(skipDomPersist).
  window.fuseSaveSystemsNow = function () {
    if (!getToken()) return;
    runSave(true);
  };

  // ------------------------------------------------------------------
  // Form handlers
  // ------------------------------------------------------------------
  async function handleLogin(e) {
    e.preventDefault();
    clearError();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Log masuk…';
    try {
      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const data = await apiFetch('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      setAuth(data.token, data.user);
      setUserBadge(data.user);
      showOverlay(false);
      await loadUserSystems();
    } catch (err) {
      showError(err.message || 'Log masuk gagal.');
    } finally {
      btn.disabled = false; btn.textContent = 'Log Masuk';
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    clearError();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Mendaftar…';
    try {
      const name     = document.getElementById('reg-name').value.trim();
      const email    = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const data = await apiFetch('/api/auth/register', {
        method: 'POST', body: JSON.stringify({ name, email, password }),
      });
      setAuth(data.token, data.user);
      setUserBadge(data.user);
      showOverlay(false);
      await loadUserSystems();
    } catch (err) {
      showError(err.message || 'Pendaftaran gagal.');
    } finally {
      btn.disabled = false; btn.textContent = 'Daftar';
    }
  }

  function switchTab(which) {
    document.getElementById('auth-tab-login').classList.toggle('active', which === 'login');
    document.getElementById('auth-tab-register').classList.toggle('active', which === 'register');
    document.getElementById('auth-form-login').classList.toggle('active', which === 'login');
    document.getElementById('auth-form-register').classList.toggle('active', which === 'register');
    clearError();
  }

  function handleLogout() {
    if (!confirm('Log Keluar?')) return;
    clearAuth();
    const target = (window.systems = window.systems || {});
    Object.keys(target).forEach(k => delete target[k]);
    window.currentSystemCode = null;
    if (typeof renderSenaraiTable === 'function') renderSenaraiTable();
    if (typeof renderDashboard    === 'function') renderDashboard();
    setUserBadge(null);
    showOverlay(true);
    switchTab('login');
  }
  window.fuseLogout = handleLogout;

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  function wireForms() {
    document.getElementById('auth-tab-login')   .addEventListener('click', () => switchTab('login'));
    document.getElementById('auth-tab-register').addEventListener('click', () => switchTab('register'));
    document.getElementById('auth-form-login')   .addEventListener('submit', handleLogin);
    document.getElementById('auth-form-register').addEventListener('submit', handleRegister);
  }

  async function boot() {
    wireForms();
    const tok = getToken();
    const user = getUser();
    if (tok && user) {
      // Optimistic — show the app and try to load. If the token is dead,
      // loadUserSystems() will pop the overlay back up.
      setUserBadge(user);
      showOverlay(false);
      await loadUserSystems();
    } else {
      showOverlay(true);
      switchTab('login');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
