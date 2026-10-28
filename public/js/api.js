/*
 * One object, window.API, used by every page.
 * It has a REAL implementation (fetch to your backend) and a MOCK one (localStorage),
 * chosen by OT_CONFIG.USE_MOCK. The pages never know which one they are using.
 *
 * Methods:
 *   register(email, password) / login(email, password) / logout() / me()
 *   listFiles()                      -> { files, quota }
 *   upload(file, minutes, maxDl, onProgress) -> file
 *   revoke(id) / remove(id)
 *   publicInfo(token)                -> file info or throws { code: 'unavailable'|'revoked'|'consumed' }
 *   startDownload(token, name)
 */
(function () {
  const { USE_MOCK, API_BASE } = window.OT_CONFIG;
  const WHERE = API_BASE || location.origin;

  const LIMITS = { maxFileSize: 10 * 1024 * 1024, total: 50 * 1024 * 1024, maxMinutes: 7 * 24 * 60 };
  const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'gif', 'pdf', 'txt', 'zip', 'docx', 'xlsx', 'pptx'];

  function fail(message, code, status) {
    const e = new Error(message);
    e.code = code; e.status = status;
    return e;
  }

  /* ============================ REAL ============================ */
  const real = (() => {
    const tokenKey = 'ot_token';
    const getToken = () => localStorage.getItem(tokenKey);

    async function request(path, { method = 'GET', body, form } = {}) {
      const headers = {};
      if (getToken()) headers.Authorization = 'Bearer ' + getToken();
      if (body) headers['Content-Type'] = 'application/json';

      let res;
      try {
        res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : form });
      } catch {
        throw fail(`Cannot reach the server at ${WHERE}. Is the backend running?`, 'network');
      }
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { /* not JSON */ }
      if (!res.ok) {
        if (res.status === 401) localStorage.removeItem(tokenKey);
        throw fail(data.error || `Request failed (status ${res.status}).`, data.code || (res.status === 401 ? 'auth' : 'error'), res.status);
      }
      return data;
    }

    return {
      async register(email, password) {
        const d = await request('/api/auth/register', { method: 'POST', body: { email, password } });
        if (d.token) localStorage.setItem(tokenKey, d.token);
        return d.user;
      },
      async login(email, password) {
        const d = await request('/api/auth/login', { method: 'POST', body: { email, password } });
        if (d.token) localStorage.setItem(tokenKey, d.token);
        return d.user;
      },
      async logout() { localStorage.removeItem(tokenKey); },
      async me() { return (await request('/api/auth/me')).user; },
      async listFiles() { return request('/api/files'); },
      upload(file, minutes, maxDl, onProgress) {
        return new Promise((resolve, reject) => {
          const form = new FormData();
          form.append('expiresInMinutes', minutes);
          form.append('maxDownloads', maxDl);
          form.append('file', file);
          const xhr = new XMLHttpRequest();
          xhr.open('POST', API_BASE + '/api/files');
          if (getToken()) xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
          xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
          xhr.onerror = () => reject(fail(`Cannot reach the server at ${WHERE}.`, 'network'));
          xhr.onload = () => {
            let d = {};
            try { d = JSON.parse(xhr.responseText); } catch { /* ignore */ }
            if (xhr.status >= 200 && xhr.status < 300) resolve(d.file);
            else reject(fail(d.error || `Upload failed (status ${xhr.status}).`, 'error', xhr.status));
          };
          xhr.send(form);
        });
      },
      async revoke(id) { return (await request(`/api/files/${id}/revoke`, { method: 'POST' })).file; },
      async remove(id) { await request(`/api/files/${id}`, { method: 'DELETE' }); },
      async publicInfo(token) { return (await request(`/api/public/${encodeURIComponent(token)}`)).file; },
      startDownload(token) { window.location.href = `${API_BASE}/d/${encodeURIComponent(token)}/download`; return Promise.resolve(); },
    };
  })();

  /* ============================ MOCK ============================ */
  const mock = (() => {
    const DB = 'ot_mock_db', SESSION = 'ot_mock_session';
    const load = () => JSON.parse(localStorage.getItem(DB) || '{"users":[],"files":[]}');
    const save = (db) => localStorage.setItem(DB, JSON.stringify(db));
    const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));
    const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');

    function sweep(db) {
      const now = Date.now();
      db.files.forEach((f) => { if (f.status === 'active' && new Date(f.expiresAt) <= now) f.status = 'expired'; });
      return db;
    }
    function currentUser(db) {
      const email = localStorage.getItem(SESSION);
      return db.users.find((u) => u.email === email);
    }
    function need(db) {
      const u = currentUser(db);
      if (!u) throw fail('Please log in.', 'auth', 401);
      return u;
    }
    const usedBytes = (db, email) => db.files.filter((f) => f.owner === email && f.status === 'active').reduce((s, f) => s + f.size, 0);
    const dto = (f) => {
      const url = new URL('download.html', location.href); url.search = '?t=' + f.token;
      return { ...f, owner: undefined, link: f.status === 'active' ? url.toString() : null };
    };

    return {
      async register(email, password) {
        await delay();
        email = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Enter a valid email address.');
        if (password.length < 8) throw fail('Password must be at least 8 characters.');
        const db = load();
        if (db.users.some((u) => u.email === email)) throw fail('An account with this email already exists.');
        db.users.push({ email, password });
        save(db);
        localStorage.setItem(SESSION, email);
        return { email };
      },
      async login(email, password) {
        await delay();
        email = email.trim().toLowerCase();
        const u = load().users.find((x) => x.email === email && x.password === password);
        if (!u) throw fail('Incorrect email or password.');
        localStorage.setItem(SESSION, email);
        return { email };
      },
      async logout() { localStorage.removeItem(SESSION); },
      async me() { const u = currentUser(load()); if (!u) throw fail('Please log in.', 'auth', 401); return { email: u.email }; },
      async listFiles() {
        await delay(150);
        const db = sweep(load()); const u = need(db); save(db);
        return {
          files: db.files.filter((f) => f.owner === u.email).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(dto),
          quota: { used: usedBytes(db, u.email), total: LIMITS.total, maxFileSize: LIMITS.maxFileSize },
        };
      },
      async upload(file, minutes, maxDl, onProgress) {
        const db = sweep(load()); const u = need(db);
        // Fake progress so the UI shows the bar
        for (let i = 1; i <= 5; i++) { await delay(120); onProgress && onProgress(i / 5); }
        const ext = extOf(file.name);
        if (!ALLOWED_EXT.includes(ext)) throw fail('This file type is not allowed.', 'error', 415);
        if (file.size > LIMITS.maxFileSize) throw fail('File is too large. Maximum size is 10 MB.', 'error', 413);
        if (minutes < 1 || minutes > LIMITS.maxMinutes) throw fail('Expiry must be between 1 minute and 7 days.');
        if (usedBytes(db, u.email) + file.size > LIMITS.total) throw fail('Storage quota exceeded (50 MB).', 'error', 413);
        const rec = {
          id: crypto.randomUUID(), owner: u.email, token: randomToken(),
          originalName: file.name, size: file.size,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + minutes * 60000).toISOString(),
          maxDownloads: maxDl, downloadCount: 0, lastDownloadedAt: null, status: 'active',
        };
        db.files.push(rec); save(db);
        return dto(rec);
      },
      async revoke(id) {
        await delay(200);
        const db = sweep(load()); const u = need(db);
        const f = db.files.find((x) => x.id === id && x.owner === u.email && x.status === 'active');
        if (!f) throw fail('File not found or already inactive.');
        f.status = 'revoked'; save(db); return dto(f);
      },
      async remove(id) {
        await delay(200);
        const db = load(); const u = need(db);
        db.files = db.files.filter((x) => !(x.id === id && x.owner === u.email)); save(db);
      },
      async publicInfo(token) {
        await delay(300);
        const db = sweep(load()); save(db);
        const f = db.files.find((x) => x.token === token);
        if (!f) throw fail('This link is no longer available.', 'unavailable', 404);
        if (f.status === 'revoked') throw fail('Revoked.', 'revoked', 410);
        if (f.status === 'consumed') throw fail('Limit reached.', 'consumed', 410);
        if (f.status !== 'active') throw fail('This link is no longer available.', 'unavailable', 404);
        return dto(f);
      },
      async startDownload(token, name) {
        await delay(300);
        const db = sweep(load());
        const f = db.files.find((x) => x.token === token && x.status === 'active');
        if (!f) throw fail('This link is no longer available.', 'unavailable', 404);
        f.downloadCount += 1; f.lastDownloadedAt = new Date().toISOString();
        if (f.maxDownloads > 0 && f.downloadCount >= f.maxDownloads) f.status = 'consumed';
        save(db);
        // Demo mode only stores metadata, so hand over a small placeholder file
        const blob = new Blob([`Demo download of "${name}". Connect the backend to transfer the real file.\n`], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name + '.demo.txt';
        document.body.append(a); a.click(); a.remove();
      },
    };
  })();

  window.API = USE_MOCK ? mock : real;
  window.API_LIMITS = LIMITS;
  window.API_ALLOWED_EXT = ALLOWED_EXT;
})();
