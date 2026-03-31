(function () {
  const ADMIN_EMAIL = 'claytonpetry1@gmail.com';
  const ADMIN_PASSWORD = '123456';
  const SEM_TOM = 'Sem tom';
  const TONS = [SEM_TOM, 'Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

  const LS_USERS = 'louvor_users';
  const LS_SESSION = 'louvor_session';
  const LS_MUSICAS = 'louvor_musicas';
  const LS_MM = 'louvor_ministrante_musicas';
  const LS_SETLISTS = 'louvor_setlists';
  const LS_HISTORY = 'louvor_history';
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
  const DATA_KEYS = [LS_USERS, LS_SESSION, LS_MUSICAS, LS_MM, LS_SETLISTS, LS_HISTORY];

  const cfg = window.APP_CONFIG || {};
  const SUPA_URL = (cfg.SUPA_URL || '').trim();
  const SUPA_KEY = (cfg.SUPA_KEY || '').trim();
  const DB_ENABLED = Boolean(SUPA_URL && SUPA_KEY);

  const GERAL_PER_PAGE = 8;

  let currentUser = null;
  let currentProfile = null;
  let isAdmin = false;

  let allMinhas = [];
  let allGeral = [];
  let allAdminRecords = [];

  let geralFiltered = [];
  let geralPage = 1;
  let geralFilterTom = '';
  let geralSort = 'nome_asc';

  let selectedTom = SEM_TOM;
  let selectedTomSalvar = SEM_TOM;
  let editingMusicaId = null;
  let editingMusicaGlobalId = null;
  let geralSelectedMusica = null;

  let editingSetlistId = null;
  let selectedSetlistId = null;
  let pendingAddCultoSongId = null;

  let confirmResolver = null;
  let deferredPrompt = null;
  let dbSyncQueue = Promise.resolve();
  let dbHydrating = false;

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function readJson(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function queueDbSync(task) {
    if (!DB_ENABLED || dbHydrating) return;
    dbSyncQueue = dbSyncQueue.then(task).catch((error) => {
      const msg = error?.message ? `: ${String(error.message).slice(0, 140)}` : '';
      showToast(`Falha ao sincronizar com o banco${msg}`, 'error');
    });
  }

  function mapHistoryDbToLocal(item) {
    return {
      id: item.id,
      action: item.action,
      details: item.details || null,
      targetType: item.targetType || item.target_type || null,
      targetId: item.targetId || item.target_id || null,
      userId: item.userId || item.user_id || null,
      userEmail: item.userEmail || item.user_email || '-',
      created_at: item.created_at || new Date().toISOString()
    };
  }

  function mapHistoryLocalToDb(item) {
    return {
      id: item.id,
      action: item.action,
      details: item.details || null,
      target_type: item.target_type || item.targetType || null,
      target_id: item.target_id || item.targetId || null,
      user_id: item.user_id || item.userId || null,
      user_email: item.user_email || item.userEmail || '-',
      created_at: item.created_at || new Date().toISOString()
    };
  }

  async function dbRequest(path, options) {
    if (!DB_ENABLED) return null;
    const headers = {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    };

    const res = await fetch(`${SUPA_URL}${path}`, { ...options, headers });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `Erro DB ${res.status}`);
    }

    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  async function dbSelect(table, select) {
    const query = encodeURIComponent(select || '*');
    return dbRequest(`/rest/v1/${table}?select=${query}`, { method: 'GET' });
  }

  function normalizeRowsForPostgrest(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];

    const keys = new Set();
    rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      Object.keys(row).forEach((k) => keys.add(k));
    });

    const allKeys = Array.from(keys);
    return rows.map((row) => {
      const obj = row && typeof row === 'object' ? row : {};
      const normalized = {};
      allKeys.forEach((k) => {
        const value = obj[k];
        normalized[k] = value === undefined ? null : value;
      });
      return normalized;
    });
  }

  async function dbDeleteByMissingIds(table, ids) {
    if (!ids.length) {
      await dbRequest(`/rest/v1/${table}?id=not.is.null`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      return;
    }

    const list = ids.join(',');
    await dbRequest(`/rest/v1/${table}?id=not.in.(${list})`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
  }

  async function dbReplaceAll(table, rows) {
    const normalizedRows = normalizeRowsForPostgrest(rows);

    if (!normalizedRows.length) {
      await dbDeleteByMissingIds(table, []);
      return;
    }

    // Primeiro faz upsert; so depois remove os ausentes.
    // Isso evita apagar toda a tabela e falhar na reinsercao.
    await dbRequest(`/rest/v1/${table}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(normalizedRows)
    });

    const ids = normalizedRows
      .map((r) => r.id)
      .filter((id) => typeof id === 'string' && id.trim());
    await dbDeleteByMissingIds(table, ids);
  }

  async function hydrateFromDatabase() {
    if (!DB_ENABLED) return;

    dbHydrating = true;
    try {
      const [profiles, musicas, mm, cultos, auditoria] = await Promise.all([
        dbSelect('profiles', '*'),
        dbSelect('musicas', '*'),
        dbSelect('ministrante_musicas', '*'),
        dbSelect('cultos', '*'),
        dbSelect('auditoria', '*')
      ]);

      if (Array.isArray(profiles)) writeJson(LS_USERS, profiles);
      if (Array.isArray(musicas)) writeJson(LS_MUSICAS, musicas);
      if (Array.isArray(mm)) writeJson(LS_MM, mm);
      if (Array.isArray(cultos)) {
        const mapped = cultos.map((c) => ({
          ...c,
          reminderAt: c.reminder_at || null,
          items: Array.isArray(c.items) ? c.items : []
        }));
        writeJson(LS_SETLISTS, mapped);
      }
      if (Array.isArray(auditoria)) writeJson(LS_HISTORY, auditoria.map(mapHistoryDbToLocal));
    } finally {
      dbHydrating = false;
    }
  }

  function normalize(value) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validUrl(url) {
    if (!url) return true;
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function appError(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
  }

  function messageForError(error) {
    const map = {
      E401: 'Sessao invalida. Faça login novamente.',
      E409: 'Conflito de dados: item duplicado.',
      E404: 'Registro nao encontrado.',
      E500: 'Erro inesperado. Tente novamente.'
    };
    if (!error) return map.E500;
    if (error.code && map[error.code]) return map[error.code];
    return error.message || map.E500;
  }

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast show ${type || ''}`;
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  function showMsg(el, text, type) {
    el.style.display = 'block';
    el.className = `auth-msg ${type}`;
    el.textContent = text;
  }

  function setBusy(btn, busy, labelIdle, labelBusy) {
    btn.disabled = busy;
    btn.innerHTML = busy ? `<span class="spinner"></span>${labelBusy}` : labelIdle;
  }

  function getTomOrNull(value) {
    return !value || value === SEM_TOM ? null : value;
  }

  function displayTom(value) {
    return value || SEM_TOM;
  }

  function formatDateBR(dateIso) {
    if (!dateIso) return 'Nunca tocada';
    const d = new Date(dateIso.includes('T') ? dateIso : `${dateIso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 'Data invalida';
    return d.toLocaleDateString('pt-BR');
  }

  function formatDateTimeBR(dateIso) {
    if (!dateIso) return '-';
    const d = new Date(dateIso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR');
  }

  function parseSetlistDateToTs(setlist) {
    const raw = setlist?.date ? `${setlist.date}T00:00:00` : setlist?.created_at;
    const d = raw ? new Date(raw) : null;
    return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  }

  function buildLastPlayedIndexes() {
    const any = new Map();
    const mine = new Map();
    const usersById = new Map(getUsers().map((u) => [u.id, u]));

    getSetlists().forEach((setlist) => {
      const ts = parseSetlistDateToTs(setlist);
      (setlist.items || []).forEach((item) => {
        const ministerId = item.added_by || setlist.created_by || null;
        const payload = {
          ts,
          date: setlist.date || setlist.created_at || null,
          ministerId,
          ministerName: usersById.get(ministerId)?.nome || usersById.get(ministerId)?.email || 'Ministrante'
        };

        const oldAny = any.get(item.musica_id);
        if (!oldAny || payload.ts > oldAny.ts) any.set(item.musica_id, payload);

        if (ministerId && currentProfile?.id && ministerId === currentProfile.id) {
          const oldMine = mine.get(item.musica_id);
          if (!oldMine || payload.ts > oldMine.ts) mine.set(item.musica_id, payload);
        }
      });
    });

    return { any, mine };
  }

  function buildRecencyByCultos() {
    const recentCultos = getSetlists()
      .slice()
      .sort((a, b) => parseSetlistDateToTs(b) - parseSetlistDateToTs(a))
      .slice(0, 9);

    const map = new Map();
    recentCultos.forEach((culto, idx) => {
      const rank = idx + 1;
      (culto.items || []).forEach((item) => {
        const prev = map.get(item.musica_id);
        if (!prev || rank < prev.rank) {
          map.set(item.musica_id, { rank });
        }
      });
    });
    return map;
  }

  function recencySignal(rank) {
    if (!rank) return null;
    if (rank <= 3) return { cls: 'red', label: 'Muito recente' };
    if (rank <= 6) return { cls: 'yellow', label: 'Recente' };
    if (rank <= 9) return { cls: 'green', label: 'Menos recente' };
    return null;
  }

  function updateMusicSuggestions() {
    const datalist = document.getElementById('musica-suggestions');
    if (!datalist) return;
    datalist.innerHTML = getMusicas()
      .slice()
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
      .map((m) => `<option value="${escapeAttr(m.nome)}"></option>`)
      .join('');
  }

  function bindMusicNameSuggestionHint() {
    const input = document.getElementById('m-nome');
    const hint = document.getElementById('m-nome-hint');
    if (!input || !hint || input.dataset.bound) return;

    input.addEventListener('input', () => {
      const nome = input.value.trim();
      if (!nome || editingMusicaId) {
        hint.classList.add('hidden');
        hint.textContent = '';
        return;
      }

      const exists = getMusicas().find((m) => normalize(m.nome) === normalize(nome));
      if (exists) {
        hint.classList.remove('hidden');
        hint.textContent = 'Musica ja cadastrada. Ao salvar, ela sera reutilizada para evitar duplicacao.';
      } else {
        hint.classList.add('hidden');
        hint.textContent = '';
      }
    });

    input.dataset.bound = '1';
  }

  function getUsers() {
    return readJson(LS_USERS, []);
  }

  function setUsers(users) {
    writeJson(LS_USERS, users);
    queueDbSync(async () => {
      try {
        await dbReplaceAll('profiles', users);
      } catch (error) {
        const msg = String(error?.message || '');
        if (msg.includes('23503') && msg.includes('profiles')) {
          // FK violada em profiles - remover ids orphaos se houver
          const match = msg.match(/Key \(id\)=\(([0-9a-fA-F-]{36})\)/);
          if (match) {
            const orphanId = match[1];
            const cleaned = users.filter((u) => u.id !== orphanId);
            writeJson(LS_USERS, cleaned);
            await dbReplaceAll('profiles', cleaned);
            return;
          }
        }
        throw error;
      }
    });
  }

  function getMusicas() {
    return readJson(LS_MUSICAS, []);
  }

  function setMusicas(musicas) {
    writeJson(LS_MUSICAS, musicas);
    queueDbSync(async () => {
      await dbReplaceAll('musicas', musicas);
    });
  }

  function getMM() {
    return readJson(LS_MM, []);
  }

  function sanitizeMMRows(mm) {
    const users = getUsers();
    const musicas = getMusicas();
    const userIds = new Set(users.map((u) => u.id));
    const musicaIds = new Set(musicas.map((m) => m.id));

    return (Array.isArray(mm) ? mm : []).filter((row) => {
      if (!row || !row.id) return false;
      if (!row.ministrante_id || !row.musica_id) return false;
      return userIds.has(row.ministrante_id) && musicaIds.has(row.musica_id);
    });
  }

  async function sanitizeMMRowsWithDatabase(mm) {
    const localCleaned = sanitizeMMRows(mm);
    if (!DB_ENABLED || !localCleaned.length) return localCleaned;

    try {
      const [profiles, musicas] = await Promise.all([
        dbSelect('profiles', 'id'),
        dbSelect('musicas', 'id')
      ]);

      const profileIds = new Set((profiles || []).map((p) => p.id));
      const musicaIds = new Set((musicas || []).map((m) => m.id));

      return localCleaned.filter((row) => (
        profileIds.has(row.ministrante_id) && musicaIds.has(row.musica_id)
      ));
    } catch {
      return localCleaned;
    }
  }

  function setMM(mm) {
    const cleaned = sanitizeMMRows(mm);
    writeJson(LS_MM, cleaned);
    queueDbSync(async () => {
      try {
        const dbCleaned = await sanitizeMMRowsWithDatabase(cleaned);
        if (dbCleaned.length !== cleaned.length) writeJson(LS_MM, dbCleaned);
        await dbReplaceAll('ministrante_musicas', dbCleaned);
      } catch (error) {
        const msg = String(error?.message || '');
        if (msg.includes('23503') && (msg.includes('ministrante_id') || msg.includes('musica_id'))) {
          const retryBase = await sanitizeMMRowsWithDatabase(getMM());

          // Remove o id orfao explicitamente indicado pelo Postgres, quando presente.
          const match = msg.match(/Key \((ministrante_id|musica_id)\)=\(([0-9a-fA-F-]{36})\)/);
          let retryCleaned = retryBase;
          if (match) {
            const field = match[1];
            const missingId = match[2];
            retryCleaned = retryBase.filter((row) => row[field] !== missingId);
          }

          writeJson(LS_MM, retryCleaned);
          await dbReplaceAll('ministrante_musicas', retryCleaned);
          return;
        }
        throw error;
      }
    });
  }

  function getSetlists() {
    return readJson(LS_SETLISTS, []);
  }

  function setSetlists(setlists) {
    writeJson(LS_SETLISTS, setlists);
    queueDbSync(async () => {
      const mapped = setlists.map((s) => ({
        id: s.id,
        title: s.title,
        date: s.date,
        reminder_at: s.reminderAt || null,
        created_by: s.created_by || null,
        created_at: s.created_at || new Date().toISOString(),
        updated_at: s.updated_at || null,
        items: Array.isArray(s.items) ? s.items : []
      }));
      await dbReplaceAll('cultos', mapped);
    });
  }

  function getHistory() {
    return readJson(LS_HISTORY, []);
  }

  function setHistory(list) {
    writeJson(LS_HISTORY, list);
    queueDbSync(async () => {
      const rows = list.map(mapHistoryLocalToDb);
      try {
        await dbReplaceAll('auditoria', rows);
      } catch (error) {
        const msg = String(error?.message || '');
        if (msg.includes('23503') && msg.includes('user_id')) {
          const fallback = rows.map((r) => ({ ...r, user_id: null }));
          await dbReplaceAll('auditoria', fallback);
          return;
        }
        throw error;
      }
    });
  }

  function logHistory(action, details, targetType, targetId) {
    const list = getHistory();
    list.unshift({
      id: uid(),
      action,
      details,
      targetType,
      targetId,
      userId: currentProfile?.id || null,
      userEmail: currentProfile?.email || '-',
      created_at: new Date().toISOString()
    });
    setHistory(list.slice(0, 800));
  }

  // Removed ensureSeedData() - app is now client-only for Supabase.
  // All data must come from database. No local seed data.

  function saveSession(user) {
    writeJson(LS_SESSION, { userId: user.id, at: new Date().toISOString() });
  }

  function clearSession() {
    localStorage.removeItem(LS_SESSION);
  }

  function getSessionMeta() {
    const sess = readJson(LS_SESSION, null);
    if (!sess?.userId || !sess?.at) return null;

    const createdAt = new Date(sess.at).getTime();
    if (!Number.isFinite(createdAt)) {
      clearSession();
      return null;
    }

    if (Date.now() - createdAt > SESSION_TTL_MS) {
      clearSession();
      return null;
    }

    return sess;
  }

  function updateAdminState() {
    const email = (currentProfile?.email || '').toLowerCase();
    const role = (currentProfile?.role || '').toLowerCase();
    isAdmin = role === 'admin' || email === ADMIN_EMAIL;

    const adminBtn = document.getElementById('btn-admin-create');
    const adminPanel = document.getElementById('admin-panel');
    if (adminBtn) adminBtn.classList.toggle('hidden', !isAdmin);
    if (adminPanel) adminPanel.classList.toggle('hidden', !isAdmin);
  }

  function updateHeader() {
    const baseName = currentProfile?.nome || currentProfile?.email || 'Usuario';
    const nameEl = document.getElementById('header-user-name');
    const avatar = document.getElementById('user-avatar');
    if (nameEl) {
      nameEl.innerHTML = `${escapeHtml(baseName)}${isAdmin ? '<span class="admin-chip">admin</span>' : ''}`;
    }
    if (avatar) {
      avatar.textContent = baseName.charAt(0).toUpperCase();
    }
  }

  function updateStats() {
    const minhasCount = allMinhas.length;
    const geralCount = allGeral.length;
    const comTom = allGeral.filter((i) => i.meuTom).length;
    document.getElementById('stat-minhas').textContent = String(minhasCount);
    document.getElementById('stat-geral').textContent = String(geralCount);
    document.getElementById('stat-com-tom').textContent = String(comTom);
  }

  function switchTab(tab) {
    const login = tab === 'login';
    document.querySelectorAll('.auth-tab')[0].classList.toggle('active', login);
    document.querySelectorAll('.auth-tab')[1].classList.toggle('active', !login);
    document.getElementById('form-login').classList.toggle('hidden', !login);
    document.getElementById('form-register').classList.toggle('hidden', login);
  }

  function togglePass(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  async function doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;
    const msg = document.getElementById('login-msg');
    const btn = document.getElementById('btn-login');

    if (!validEmail(email) || !pass) {
      showMsg(msg, 'Preencha email valido e senha', 'error');
      return;
    }

    if (!DB_ENABLED) {
      showMsg(msg, 'Banco de dados nao configurado', 'error');
      return;
    }

    setBusy(btn, true, 'Entrar', 'Entrando');
    try {
      // Busca usuario diretamente no Supabase, nao no cache
      const results = await dbSelect('profiles', '*');
      const profiles = Array.isArray(results) ? results : [];
      const user = profiles.find(
        (u) => normalize(u.email) === normalize(email) && u.password === pass
      );
      if (!user) throw appError('E401', 'Email ou senha invalidos');

      currentProfile = user;
      currentUser = { user: { id: user.id, email: user.email }, mode: 'supabase' };
      saveSession(user);
      setUsers(profiles);
      enterApp();
      logHistory('user_login', `Login realizado: ${email}`, 'user', user.id);
    } catch (error) {
      showMsg(msg, messageForError(error), 'error');
    } finally {
      setBusy(btn, false, 'Entrar', 'Entrando');
    }
  }

  async function doRegister() {
    const nome = document.getElementById('reg-nome').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const msg = document.getElementById('reg-msg');
    const btn = document.getElementById('btn-register');

    if (!nome || !validEmail(email) || pass.length < 6) {
      showMsg(msg, 'Valide nome, email e senha minima de 6 chars', 'error');
      return;
    }

    if (!DB_ENABLED) {
      showMsg(msg, 'Banco de dados nao configurado', 'error');
      return;
    }

    setBusy(btn, true, 'Criar conta', 'Criando');
    try {
      // Busca todos os usuarios no Supabase
      const results = await dbSelect('profiles', '*');
      const users = Array.isArray(results) ? results : [];
      const exists = users.some((u) => normalize(u.email) === normalize(email));
      if (exists) throw appError('E409', 'Este email ja esta cadastrado. Use Entrar.');

      const created = {
        id: uid(),
        nome,
        email,
        password: pass,
        role: 'user',
        created_at: new Date().toISOString()
      };

      // Insere no Supabase primeiro
      await dbRequest('/rest/v1/profiles', {
        method: 'POST',
        body: JSON.stringify(created)
      });

      users.push(created);
      setUsers(users);
      logHistory('user_created', `Usuario criado: ${email}`, 'user', created.id);

      showMsg(msg, 'Conta criada com sucesso. Faça login.', 'success');
      document.getElementById('login-email').value = email;
      switchTab('login');
    } catch (error) {
      showMsg(msg, messageForError(error), 'error');
    } finally {
      setBusy(btn, false, 'Criar conta', 'Criando');
    }
  }

  function doLogout() {
    currentUser = null;
    currentProfile = null;
    allMinhas = [];
    allGeral = [];
    allAdminRecords = [];
    isAdmin = false;

    clearSession();
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
  }

  function buildTomGrid(containerId, onSelect) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';
    TONS.forEach((tom) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tom-btn';
      btn.textContent = tom;
      btn.onclick = () => {
        grid.querySelectorAll('.tom-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        onSelect(tom);
      };
      grid.appendChild(btn);
    });
  }

  function setTomGrid(containerId, tom, onSelect) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.querySelectorAll('.tom-btn').forEach((btn) => {
      btn.classList.toggle('selected', btn.textContent === tom);
    });
    if (tom && onSelect) onSelect(tom);
  }

  function buildTomGrids() {
    buildTomGrid('tom-grid', (t) => {
      selectedTom = t;
    });
    buildTomGrid('tom-grid-salvar', (t) => {
      selectedTomSalvar = t;
    });

    const filterTom = document.getElementById('filter-tom-geral');
    if (filterTom && !filterTom.dataset.bound) {
      TONS.forEach((tom) => {
        const op = document.createElement('option');
        op.value = tom;
        op.textContent = tom;
        filterTom.appendChild(op);
      });
      filterTom.dataset.bound = '1';
    }
  }

  function showPage(name) {
    const pages = ['minhas', 'geral', 'setlists', 'historico'];
    pages.forEach((p) => {
      document.getElementById(`page-${p}`).classList.toggle('active', p === name);
    });
    document.querySelectorAll('.nav-tab').forEach((tab, idx) => {
      tab.classList.toggle('active', pages[idx] === name);
    });

    if (name === 'geral') loadGeral();
    if (name === 'setlists') loadSetlists();
    if (name === 'historico') loadHistory();
  }

  function enterApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';

    updateAdminState();
    updateHeader();
    buildTomGrids();
    attachSearchHandlers();
    attachGeralControls();
    loadMinhas();
    loadSetlists();
    loadHistory();
    if (isAdmin) loadAdminOverview();
  }

  function applyGeralFilterAndSort() {
    const q = normalize(document.getElementById('search-geral').value);
    let list = allGeral.filter((i) => normalize(i.nome).includes(q));

    if (geralFilterTom) {
      if (geralFilterTom === SEM_TOM) {
        list = list.filter((i) => !i.meuTom);
      } else {
        list = list.filter((i) => i.meuTom === geralFilterTom);
      }
    }

    if (geralSort === 'nome_asc') {
      list.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
    } else if (geralSort === 'nome_desc') {
      list.sort((a, b) => String(b.nome || '').localeCompare(String(a.nome || '')));
    } else if (geralSort === 'recente') {
      list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    } else if (geralSort === 'com_tom') {
      list.sort((a, b) => Number(Boolean(b.meuTom)) - Number(Boolean(a.meuTom)) || String(a.nome).localeCompare(String(b.nome)));
    }

    geralFiltered = list;
  }

  function renderGeralPagination() {
    const box = document.getElementById('geral-pagination');
    const prev = document.getElementById('geral-prev');
    const next = document.getElementById('geral-next');
    const indicator = document.getElementById('geral-page-indicator');
    if (!box || !prev || !next || !indicator) return;

    const totalPages = Math.max(1, Math.ceil(geralFiltered.length / GERAL_PER_PAGE));
    if (geralPage > totalPages) geralPage = totalPages;

    box.classList.toggle('hidden', geralFiltered.length <= GERAL_PER_PAGE);
    prev.disabled = geralPage <= 1;
    next.disabled = geralPage >= totalPages;
    indicator.textContent = `Pagina ${geralPage} de ${totalPages}`;
  }

  function renderGeralFromState() {
    const start = (geralPage - 1) * GERAL_PER_PAGE;
    const pageItems = geralFiltered.slice(start, start + GERAL_PER_PAGE);
    renderGeral(pageItems);
    renderGeralPagination();
  }

  function loadMinhas() {
    const el = document.getElementById('list-minhas');
    el.innerHTML = '<div class="loading-screen skeleton"></div>';
    try {
      const musicas = getMusicas();
      const mm = getMM().filter((r) => r.ministrante_id === currentProfile.id);
      const lastPlayed = buildLastPlayedIndexes();
      const recency = buildRecencyByCultos();

      allMinhas = mm
        .map((row) => ({
          ...row,
          musicas: musicas.find((m) => m.id === row.musica_id) || null,
          ultimaMinha: lastPlayed.mine.get(row.musica_id) || null,
          recency: recency.get(row.musica_id) || null
        }))
        .filter((r) => r.musicas);

      allMinhas.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      renderMinhas(allMinhas);
      updateStats();
    } catch {
      el.innerHTML = '<div class="empty-state">Erro ao carregar suas musicas</div>';
    }
  }

  function renderMinhas(list) {
    const el = document.getElementById('list-minhas');
    if (!list.length) {
      el.innerHTML = '<div class="empty-state">Nenhuma musica adicionada ainda</div>';
      return;
    }

    el.innerHTML = list
      .map((item) => {
        const nome = item.musicas?.nome || 'Sem nome';
        const link = item.musicas?.link || '';
        const obs = item.observacoes || '';
        const ultimaMinha = item.ultimaMinha?.date ? formatDateBR(item.ultimaMinha.date) : 'Ainda nao cantada em culto';
        const rec = recencySignal(item.recency?.rank);
        return `
        <article class="music-card">
          <div>
            <div class="card-title">${escapeHtml(nome)}</div>
            <div class="card-sub">
              <span class="tom-badge ${item.tom ? 'mine' : 'none'}">${escapeHtml(displayTom(item.tom))}</span>
              ${rec ? `<span class="recency-pill recency-tag ${rec.cls}" title="Tocada entre os ultimos cultos">${rec.label}</span>` : ''}
              ${obs ? ` <span>· ${escapeHtml(obs)}</span>` : ''}
            </div>
            <div class="last-played">Minha ultima vez: ${escapeHtml(ultimaMinha)}</div>
          </div>
          <div class="card-actions">
            ${link ? `<button class="btn-icon" onclick="abrirLink(event,'${escapeAttr(link)}')">Ouvir</button>` : ''}
            <button class="btn-icon" onclick="openAddToCultoModal(event,'${item.musica_id}')">Adicionar ao culto</button>
            <button class="btn-icon" onclick="editarMinhas(event,'${item.id}')">Editar</button>
            <button class="btn-icon" onclick="deletarMinhas(event,'${item.id}')">Excluir</button>
          </div>
        </article>
      `;
      })
      .join('');
  }

  function loadGeral(showSuccess) {
    const el = document.getElementById('list-geral');
    el.innerHTML = '<div class="loading-screen skeleton"></div>';

    try {
      const musicas = getMusicas();
      const mm = getMM().filter((r) => r.ministrante_id === currentProfile.id);
      const mmMap = new Map(mm.map((r) => [r.musica_id, r]));
      const users = getUsers();
      const lastPlayed = buildLastPlayedIndexes();
      const recency = buildRecencyByCultos();

      allGeral = musicas.map((m) => {
        const my = mmMap.get(m.id);
        const dono = users.find((u) => u.id === m.criado_por);
        const ultima = lastPlayed.any.get(m.id) || null;
        return {
          ...m,
          meuTom: my?.tom || null,
          minhaObs: my?.observacoes || '',
          profiles: { nome: dono?.nome || 'Desconhecido' },
          ultimaGeral: ultima,
          recency: recency.get(m.id) || null
        };
      });

      applyGeralFilterAndSort();
      renderGeralFromState();
      updateStats();
      if (showSuccess) showToast('Lista geral atualizada', 'success');
    } catch {
      el.innerHTML = '<div class="empty-state">Erro ao carregar lista geral</div>';
    }
  }

  function renderGeral(list) {
    const el = document.getElementById('list-geral');
    if (!list.length) {
      el.innerHTML = '<div class="empty-state">Nenhuma musica para os filtros atuais</div>';
      return;
    }

    el.innerHTML = list
      .map(
        (item) => {
          const rec = recencySignal(item.recency?.rank);
          return `
      <article class="list-item" onclick="openGeralDetail('${item.id}')">
        <div>
          <div class="card-title">${escapeHtml(item.nome)}</div>
          <div class="card-sub">Meu tom: ${escapeHtml(displayTom(item.meuTom))}</div>
          <div class="last-played">Ultima vez no culto: ${escapeHtml(item.ultimaGeral?.date ? formatDateBR(item.ultimaGeral.date) : 'Ainda nao tocada')} · ${escapeHtml(item.ultimaGeral?.ministerName || '-')}</div>
        </div>
        <div class="card-actions">
          ${item.meuTom ? '<span class="tom-badge mine">Com tom</span>' : '<span class="tom-badge none">Sem tom</span>'}
          ${rec ? `<span class="recency-pill ${rec.cls}" title="Tocada entre os ultimos cultos">${rec.label}</span>` : ''}
          <button class="btn-icon" onclick="openAddToCultoModal(event,'${item.id}')">Adicionar ao culto</button>
        </div>
      </article>
    `;
        }
      )
      .join('');
  }

  function openAddToCultoModal(e, musicaId) {
    if (e) e.stopPropagation();
    pendingAddCultoSongId = musicaId;

    const song = getMusicas().find((m) => m.id === musicaId);
    const picker = document.getElementById('add-culto-picker');
    const cultos = getSetlists().slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    document.getElementById('add-culto-song-name').textContent = song ? `Musica: ${song.nome}` : 'Selecione o culto';
    if (!cultos.length) {
      picker.innerHTML = '<option value="">Nenhum culto cadastrado</option>';
    } else {
      picker.innerHTML = cultos.map((c) => `<option value="${c.id}">${escapeHtml(c.title)} (${escapeHtml(c.date || '-')})</option>`).join('');
    }

    document.getElementById('modal-add-culto').classList.add('open');
  }

  function closeAddToCultoModal() {
    document.getElementById('modal-add-culto').classList.remove('open');
    pendingAddCultoSongId = null;
  }

  function confirmAddToCultoModal() {
    const cultoId = document.getElementById('add-culto-picker').value;
    if (!cultoId || !pendingAddCultoSongId) {
      showToast('Escolha um culto valido', 'error');
      return;
    }

    const ok = addSongToCulto(cultoId, pendingAddCultoSongId);
    if (ok) closeAddToCultoModal();
  }

  function addSongToCulto(cultoId, musicaId) {
    const setlists = getSetlists();
    const setlist = setlists.find((s) => s.id === cultoId);
    if (!setlist) {
      showToast('Culto nao encontrado', 'error');
      return false;
    }

    setlist.items = setlist.items || [];
    const exists = setlist.items.some((i) => i.musica_id === musicaId);
    if (exists) {
      showToast('Essa musica ja esta neste culto', 'error');
      return false;
    }

    setlist.items.push({
      musica_id: musicaId,
      added_at: new Date().toISOString(),
      added_by: currentProfile.id
    });
    setSetlists(setlists);

    const songs = getMusicas();
    const songName = songs.find((s) => s.id === musicaId)?.nome || 'musica';
    logHistory('setlist_song_added', `Adicionou ${songName} em ${setlist.title}`, 'setlist', setlist.id);

    const alert = detectRecentRepetition(musicaId, setlist.id, 30);
    if (alert) {
      showToast(`Atencao: ${songName} ja foi usada recentemente em ${alert}`, 'error');
    } else {
      showToast('Musica adicionada ao culto', 'success');
    }

    if (selectedSetlistId === cultoId) renderSetlistSongs(setlist);
    loadSetlists();
    loadMinhas();
    loadGeral();
    return true;
  }

  function attachSearchHandlers() {
    const sMinhas = document.getElementById('search-minhas');
    const sGeral = document.getElementById('search-geral');

    if (!sMinhas.dataset.bound) {
      sMinhas.addEventListener('input', () => {
        const q = normalize(sMinhas.value);
        renderMinhas(allMinhas.filter((i) => normalize(i.musicas?.nome).includes(q)));
      });
      sMinhas.dataset.bound = '1';
    }

    if (!sGeral.dataset.bound) {
      sGeral.addEventListener('input', () => {
        geralPage = 1;
        applyGeralFilterAndSort();
        renderGeralFromState();
      });
      sGeral.dataset.bound = '1';
    }
  }

  function attachGeralControls() {
    const filter = document.getElementById('filter-tom-geral');
    const sort = document.getElementById('sort-geral');
    const prev = document.getElementById('geral-prev');
    const next = document.getElementById('geral-next');

    if (filter && !filter.dataset.bound) {
      filter.addEventListener('change', () => {
        geralFilterTom = filter.value;
        geralPage = 1;
        applyGeralFilterAndSort();
        renderGeralFromState();
      });
      filter.dataset.bound = '1';
    }

    if (sort && !sort.dataset.bound) {
      sort.addEventListener('change', () => {
        geralSort = sort.value;
        geralPage = 1;
        applyGeralFilterAndSort();
        renderGeralFromState();
      });
      sort.dataset.bound = '1';
    }

    if (prev && !prev.dataset.bound) {
      prev.addEventListener('click', () => {
        if (geralPage > 1) geralPage -= 1;
        renderGeralFromState();
      });
      prev.dataset.bound = '1';
    }

    if (next && !next.dataset.bound) {
      next.addEventListener('click', () => {
        const total = Math.max(1, Math.ceil(geralFiltered.length / GERAL_PER_PAGE));
        if (geralPage < total) geralPage += 1;
        renderGeralFromState();
      });
      next.dataset.bound = '1';
    }
  }

  function openModalMinhas() {
    editingMusicaId = null;
    editingMusicaGlobalId = null;
    selectedTom = SEM_TOM;

    document.getElementById('modal-minhas-title').textContent = 'Adicionar musica';
    document.getElementById('m-nome').value = '';
    document.getElementById('m-nome').disabled = false;
    document.getElementById('m-link').value = '';
    document.getElementById('m-obs').value = '';
    const hint = document.getElementById('m-nome-hint');
    if (hint) {
      hint.classList.add('hidden');
      hint.textContent = '';
    }
    updateMusicSuggestions();
    setTomGrid('tom-grid', SEM_TOM, (t) => {
      selectedTom = t;
    });

    document.getElementById('modal-minhas').classList.add('open');
  }

  function closeModalMinhas() {
    document.getElementById('modal-minhas').classList.remove('open');
  }

  function editarMinhas(e, id) {
    e.stopPropagation();
    const item = allMinhas.find((i) => i.id === id);
    if (!item) return;

    editingMusicaId = item.id;
    editingMusicaGlobalId = item.musica_id;
    selectedTom = item.tom || SEM_TOM;

    document.getElementById('modal-minhas-title').textContent = 'Editar musica';
    document.getElementById('m-nome').value = item.musicas?.nome || '';
    document.getElementById('m-nome').disabled = false;
    document.getElementById('m-link').value = item.musicas?.link || '';
    document.getElementById('m-obs').value = item.observacoes || '';
    const hint = document.getElementById('m-nome-hint');
    if (hint) {
      hint.classList.add('hidden');
      hint.textContent = '';
    }
    updateMusicSuggestions();
    setTomGrid('tom-grid', selectedTom, (t) => {
      selectedTom = t;
    });

    document.getElementById('modal-minhas').classList.add('open');
  }

  function saveMusica() {
    const nome = document.getElementById('m-nome').value.trim();
    const link = document.getElementById('m-link').value.trim();
    const obs = document.getElementById('m-obs').value.trim();
    const btn = document.getElementById('btn-save-minhas');

    if (!nome) {
      showToast('Informe o nome da musica', 'error');
      return;
    }
    if (!validUrl(link)) {
      showToast('Informe um link valido com http/https', 'error');
      return;
    }

    setBusy(btn, true, 'Salvar', 'Salvando');
    try {
      const tomValue = getTomOrNull(selectedTom);
      const musicas = getMusicas();
      const mm = getMM();
      let musicaId = editingMusicaGlobalId;

      if (!editingMusicaId) {
        const existingMusica = musicas.find((m) => normalize(m.nome) === normalize(nome));
        if (existingMusica) {
          musicaId = existingMusica.id;
        } else {
          const createdMusica = {
            id: uid(),
            nome,
            link: link || null,
            criado_por: currentProfile.id,
            created_at: new Date().toISOString()
          };
          musicas.push(createdMusica);
          setMusicas(musicas);
          musicaId = createdMusica.id;
          logHistory('song_created', `Musica criada: ${nome}`, 'song', createdMusica.id);
        }

        const existingAssoc = mm.find((r) => r.ministrante_id === currentProfile.id && r.musica_id === musicaId);
        if (existingAssoc) {
          existingAssoc.tom = tomValue;
          existingAssoc.observacoes = obs || null;
          existingAssoc.updated_at = new Date().toISOString();
          logHistory('song_linked', `Atualizou associacao para ${nome}`, 'association', existingAssoc.id);
        } else {
          const assoc = {
            id: uid(),
            ministrante_id: currentProfile.id,
            musica_id: musicaId,
            tom: tomValue,
            observacoes: obs || null,
            created_at: new Date().toISOString()
          };
          mm.push(assoc);
          logHistory('song_linked', `Adicionou musica em Minhas: ${nome}`, 'association', assoc.id);
        }
        setMM(mm);
      } else {
        const assoc = mm.find((r) => r.id === editingMusicaId);
        if (!assoc) throw appError('E404', 'Associacao nao encontrada');

        const currentMusica = musicas.find((m) => m.id === musicaId);
        if (!currentMusica) throw appError('E404', 'Musica nao encontrada');

        const duplicateByName = musicas.find((m) => m.id !== currentMusica.id && normalize(m.nome) === normalize(nome));
        if (duplicateByName) {
          assoc.musica_id = duplicateByName.id;
          musicaId = duplicateByName.id;
        } else {
          currentMusica.nome = nome;
          currentMusica.link = link || null;
          currentMusica.updated_at = new Date().toISOString();
        }

        assoc.tom = tomValue;
        assoc.observacoes = obs || null;
        assoc.updated_at = new Date().toISOString();

        setMusicas(musicas);
        setMM(mm);
        logHistory('song_updated', `Atualizou musica: ${nome}`, 'song', musicaId);
      }

      closeModalMinhas();
      showToast('Musica salva com sucesso', 'success');
      loadMinhas();
      if (document.getElementById('page-geral').classList.contains('active')) loadGeral();
      if (isAdmin) loadAdminOverview();
      loadSetlists();
    } catch (error) {
      showToast(messageForError(error), 'error');
    } finally {
      setBusy(btn, false, 'Salvar', 'Salvando');
    }
  }

  async function askConfirm(title, message) {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = message;
    modal.classList.add('open');
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function closeConfirmModal(result) {
    document.getElementById('modal-confirm').classList.remove('open');
    if (confirmResolver) {
      confirmResolver(Boolean(result));
      confirmResolver = null;
    }
  }

  async function deletarMinhas(e, id) {
    e.stopPropagation();
    const ok = await askConfirm('Remover musica', 'Remover esta musica da sua lista?');
    if (!ok) return;

    const mm = getMM();
    const idx = mm.findIndex((r) => r.id === id);
    if (idx < 0) {
      showToast(messageForError(appError('E404', 'Registro nao encontrado')), 'error');
      return;
    }

    const removed = mm[idx];
    mm.splice(idx, 1);
    setMM(mm);
    logHistory('song_unlinked', 'Removeu musica da lista pessoal', 'association', removed.id);

    showToast('Musica removida', 'success');
    loadMinhas();
    if (document.getElementById('page-geral').classList.contains('active')) loadGeral();
    if (isAdmin) loadAdminOverview();
  }

  function openGeralDetail(id) {
    const item = allGeral.find((i) => i.id === id);
    if (!item) return;
    geralSelectedMusica = item;

    const criadoPor = item.profiles?.nome || 'Desconhecido';
    const link = item.link
      ? `<a href="${escapeAttr(item.link)}" target="_blank" rel="noopener" class="btn-ghost">Ouvir musica</a>`
      : '<span class="muted">Sem link cadastrado</span>';

    document.getElementById('geral-detail-content').innerHTML = `
      <h3 class="modal-title">${escapeHtml(item.nome)}</h3>
      <div class="field-group">${link}</div>
      <div class="field-group"><strong>Adicionada por:</strong> ${escapeHtml(criadoPor)}</div>
      <div class="field-group"><strong>Meu tom:</strong> ${item.meuTom ? `<span class="tom-badge mine">${escapeHtml(item.meuTom)}</span>` : `<span class="tom-badge none">${SEM_TOM}</span>`}</div>
    `;

    document.getElementById('geral-detail-actions').innerHTML = `
      <button class="btn-cancel" onclick="closeModalGeral()">Fechar</button>
      <button class="btn-save" onclick="abrirSalvarTomGeral('${item.id}')">${item.meuTom ? 'Editar tom' : 'Salvar meu tom'}</button>
    `;

    document.getElementById('modal-geral').classList.add('open');
  }

  function closeModalGeral() {
    document.getElementById('modal-geral').classList.remove('open');
  }

  function abrirSalvarTomGeral(id) {
    closeModalGeral();
    const item = allGeral.find((i) => i.id === id);
    if (!item) return;

    geralSelectedMusica = item;
    selectedTomSalvar = item.meuTom || SEM_TOM;

    document.getElementById('salvar-tom-nome').textContent = `Definir tom para "${item.nome}"`;
    document.getElementById('salvar-obs').value = item.minhaObs || '';
    setTomGrid('tom-grid-salvar', selectedTomSalvar, (t) => {
      selectedTomSalvar = t;
    });
    document.getElementById('modal-salvar-tom').classList.add('open');
  }

  function closeModalSalvarTom() {
    document.getElementById('modal-salvar-tom').classList.remove('open');
  }

  function confirmarSalvarTom() {
    const obs = document.getElementById('salvar-obs').value.trim();
    const btn = document.getElementById('btn-salvar-tom');
    setBusy(btn, true, 'Salvar', 'Salvando');

    try {
      const item = geralSelectedMusica;
      if (!item) throw appError('E404', 'Musica nao encontrada');
      const tomValue = getTomOrNull(selectedTomSalvar);
      const mm = getMM();

      const assoc = mm.find((r) => r.ministrante_id === currentProfile.id && r.musica_id === item.id);
      if (assoc) {
        assoc.tom = tomValue;
        assoc.observacoes = obs || null;
        assoc.updated_at = new Date().toISOString();
      } else {
        mm.push({
          id: uid(),
          ministrante_id: currentProfile.id,
          musica_id: item.id,
          tom: tomValue,
          observacoes: obs || null,
          created_at: new Date().toISOString()
        });
      }

      setMM(mm);
      logHistory('tom_saved', `Salvou tom em ${item.nome}: ${displayTom(tomValue)}`, 'song', item.id);

      closeModalSalvarTom();
      showToast('Tom salvo com sucesso', 'success');
      loadGeral();
      loadMinhas();
      if (isAdmin) loadAdminOverview();
    } catch (error) {
      showToast(messageForError(error), 'error');
    } finally {
      setBusy(btn, false, 'Salvar', 'Salvando');
    }
  }

  function abrirLink(e, url) {
    e.stopPropagation();
    window.open(url, '_blank', 'noopener');
  }

  function exportarMinhasCsv() {
    if (!allMinhas.length) {
      showToast('Sem musicas para exportar', 'error');
      return;
    }

    const rows = [['nome', 'tom', 'link', 'observacoes']];
    allMinhas.forEach((item) => {
      rows.push([item.musicas?.nome || '', displayTom(item.tom), item.musicas?.link || '', item.observacoes || '']);
    });

    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'minhas-musicas.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado', 'success');
  }

  function loadAdminOverview(showSuccess) {
    if (!isAdmin) return;

    const el = document.getElementById('admin-list');
    if (!el) return;

    try {
      const mm = getMM();
      const musicas = getMusicas();
      const users = getUsers();

      allAdminRecords = mm
        .map((row) => {
          const musica = musicas.find((m) => m.id === row.musica_id);
          const user = users.find((u) => u.id === row.ministrante_id);
          return {
            ...row,
            musicas: { nome: musica?.nome || 'Sem musica' },
            profiles: { nome: user?.nome || 'Sem nome', email: user?.email || '-' }
          };
        })
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

      renderAdminOverview();
      if (showSuccess) showToast('Painel admin atualizado', 'success');
    } catch {
      el.innerHTML = '<div class="empty-state">Erro ao carregar visao admin</div>';
    }
  }

  function renderAdminOverview() {
    const el = document.getElementById('admin-list');
    if (!el) return;

    const users = getUsers();
    const songs = getMusicas();
    const historyCount = getHistory().length;

    const top = `
      <article class="admin-item">
        <div class="admin-item-title">Resumo de governanca</div>
        <div class="admin-item-sub"><strong>Usuarios:</strong> ${users.length}</div>
        <div class="admin-item-sub"><strong>Musicas:</strong> ${songs.length}</div>
        <div class="admin-item-sub"><strong>Eventos de auditoria:</strong> ${historyCount}</div>
      </article>
    `;

    if (!allAdminRecords.length) {
      el.innerHTML = `${top}<div class="empty-state">Sem registros para exibir</div>`;
      return;
    }

    el.innerHTML = `${top}${allAdminRecords
      .map(
        (row) => `
      <article class="admin-item">
        <div class="admin-item-title">${escapeHtml(row.musicas?.nome || 'Sem musica')}</div>
        <div class="admin-item-sub"><strong>Usuario:</strong> ${escapeHtml(row.profiles?.nome || 'Sem nome')} (${escapeHtml(row.profiles?.email || '-')})</div>
        <div class="admin-item-sub"><strong>Tom:</strong> ${escapeHtml(displayTom(row.tom))}</div>
        <div class="admin-item-sub"><strong>Obs:</strong> ${escapeHtml(row.observacoes || '-')}</div>
      </article>
    `
      )
      .join('')}`;
  }

  async function mergeDuplicateSongs() {
    if (!isAdmin) return;
    const ok = await askConfirm('Mesclar duplicadas', 'Deseja mesclar musicas com o mesmo nome normalizado?');
    if (!ok) return;

    const songs = getMusicas();
    const mm = getMM();
    const map = new Map();
    const toDelete = new Set();
    let merged = 0;

    songs.forEach((song) => {
      const key = normalize(song.nome);
      if (!map.has(key)) {
        map.set(key, song.id);
      } else {
        const keeperId = map.get(key);
        mm.forEach((r) => {
          if (r.musica_id === song.id) {
            r.musica_id = keeperId;
            merged += 1;
          }
        });
        toDelete.add(song.id);
      }
    });

    if (toDelete.size > 0) {
      const filtered = songs.filter((s) => !toDelete.has(s.id));
      setMusicas(filtered);
      setMM(mm);
      logHistory('admin_merge_duplicates', `Mesclou ${toDelete.size} musicas duplicadas`, 'song', null);
      showToast(`Mesclagem concluida: ${toDelete.size} duplicadas`, 'success');
      loadMinhas();
      loadGeral();
      loadSetlists();
      loadAdminOverview();
    } else {
      showToast('Nenhuma duplicada encontrada', 'success');
    }
  }

  function openAdminCreateUserModal() {
    if (!isAdmin) return;
    document.getElementById('admin-user-name').value = '';
    document.getElementById('admin-user-email').value = '';
    document.getElementById('admin-user-pass').value = '';
    document.getElementById('modal-admin-user').classList.add('open');
  }

  function closeAdminCreateUserModal() {
    document.getElementById('modal-admin-user').classList.remove('open');
  }

  function adminCreateUser() {
    if (!isAdmin) {
      showToast('Somente admin pode cadastrar usuario', 'error');
      return;
    }

    const nome = document.getElementById('admin-user-name').value.trim();
    const email = document.getElementById('admin-user-email').value.trim();
    const pass = document.getElementById('admin-user-pass').value;

    if (!nome || !validEmail(email) || pass.length < 6) {
      showToast('Informe nome, email valido e senha minima de 6 chars', 'error');
      return;
    }

    const users = getUsers();
    const exists = users.some((u) => normalize(u.email) === normalize(email));
    if (exists) {
      showToast('Este email ja esta cadastrado', 'error');
      return;
    }

    const created = {
      id: uid(),
      nome,
      email,
      password: pass,
      role: 'user',
      created_at: new Date().toISOString()
    };
    users.push(created);
    setUsers(users);
    logHistory('admin_user_created', `Admin criou usuario: ${email}`, 'user', created.id);

    showToast('Usuario cadastrado com sucesso (modo local)', 'success');
    closeAdminCreateUserModal();
    loadAdminOverview();
  }

  function canEditSetlist(setlistId) {
    const setlist = getSetlists().find((s) => s.id === setlistId);
    if (!setlist) return false;
    return currentProfile && currentProfile.id === setlist.created_by;
  }

  function loadSetlists() {
    const el = document.getElementById('setlist-list');
    if (!el) return;

    const list = getSetlists().slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    if (!list.length) {
      el.innerHTML = '<div class="empty-state">Nenhum culto cadastrado</div>';
      return;
    }

    const songs = getMusicas();
    const users = getUsers();
    el.innerHTML = list
      .map((s) => {
        const count = (s.items || []).length;
        const nextSongs = (s.items || [])
          .slice(0, 3)
          .map((it) => songs.find((m) => m.id === it.musica_id)?.nome)
          .filter(Boolean)
          .join(', ');
        const owner = users.find((u) => u.id === s.created_by);
        const ownerName = owner?.nome || owner?.email || '-';
        const previewList = (s.items || [])
          .slice(0, 4)
          .map((it, idx) => {
            const songName = songs.find((m) => m.id === it.musica_id)?.nome || 'Musica removida';
            return `<div class="setlist-preview-item">${idx + 1}. ${escapeHtml(songName)}</div>`;
          })
          .join('');
        const isOwner = canEditSetlist(s.id);
        const editDeleteButtons = isOwner
          ? `<button class="btn-icon btn-setlist-action" onclick="openSetlistModal('${s.id}')">Editar</button>
              <button class="btn-icon btn-setlist-action danger" onclick="deleteSetlist('${s.id}')">Excluir</button>`
          : '';

        return `
          <article class="setlist-card">
            <div class="setlist-title">${escapeHtml(s.title)}</div>
            <div class="setlist-sub">Data: ${escapeHtml(s.date)} · Musicas: ${count}</div>
            <div class="setlist-sub">Responsavel: ${escapeHtml(ownerName)}</div>
            ${previewList ? `<div class="setlist-preview-list">${previewList}</div>` : `<div class="setlist-sub">${escapeHtml(nextSongs || 'Sem musicas')}</div>`}
            <div class="setlist-actions">
              <button class="btn-icon btn-setlist-action" onclick="openSetlistDetail('${s.id}')">Abrir</button>
              ${editDeleteButtons}
            </div>
          </article>
        `;
      })
      .join('');
  }

  function openSetlistModal(id) {
    editingSetlistId = id || null;
    const modal = document.getElementById('modal-setlist');
    const title = document.getElementById('setlist-modal-title');
    const inputTitle = document.getElementById('setlist-title');
    const inputDate = document.getElementById('setlist-date');
    const inputReminder = document.getElementById('setlist-reminder');

    if (!editingSetlistId) {
      title.textContent = 'Novo culto';
      inputTitle.value = '';
      inputDate.value = '';
      inputReminder.value = '';
    } else {
      const setlist = getSetlists().find((s) => s.id === editingSetlistId);
      if (!setlist) return;
      if (!canEditSetlist(editingSetlistId)) {
        showToast('Voce nao pode editar culto de outro ministrante', 'error');
        return;
      }
      title.textContent = 'Editar culto';
      inputTitle.value = setlist.title || '';
      inputDate.value = setlist.date || '';
      inputReminder.value = setlist.reminderAt || '';
    }

    modal.classList.add('open');
  }

  function closeSetlistModal() {
    document.getElementById('modal-setlist').classList.remove('open');
  }

  async function saveSetlist() {
    const title = document.getElementById('setlist-title').value.trim();
    const date = document.getElementById('setlist-date').value;
    const reminderAt = document.getElementById('setlist-reminder').value;
    if (!title || !date) {
      showToast('Informe nome e data do culto', 'error');
      return;
    }

    const setlists = getSetlists();
    if (!editingSetlistId) {
      const created = {
        id: uid(),
        title,
        date,
        reminderAt: reminderAt || null,
        created_by: currentProfile.id,
        created_at: new Date().toISOString(),
        items: []
      };
      setlists.push(created);
      logHistory('setlist_created', `Culto criado: ${title}`, 'setlist', created.id);
      scheduleReminder(created);
    } else {
      const s = setlists.find((x) => x.id === editingSetlistId);
      if (!s) {
        showToast(messageForError(appError('E404', 'Culto nao encontrado')), 'error');
        return;
      }
      s.title = title;
      s.date = date;
      s.reminderAt = reminderAt || null;
      s.updated_at = new Date().toISOString();
      logHistory('setlist_updated', `Culto atualizado: ${title}`, 'setlist', s.id);
      scheduleReminder(s);
    }

    setSetlists(setlists);
    closeSetlistModal();
    loadSetlists();
    showToast('Culto salvo com sucesso', 'success');
  }

  async function deleteSetlist(id) {
    if (!canEditSetlist(id)) {
      showToast('Voce nao pode excluir culto de outro ministrante', 'error');
      return;
    }
    const ok = await askConfirm('Excluir culto', 'Deseja realmente excluir este culto?');
    if (!ok) return;

    const setlists = getSetlists();
    const idx = setlists.findIndex((s) => s.id === id);
    if (idx < 0) {
      showToast(messageForError(appError('E404', 'Culto nao encontrado')), 'error');
      return;
    }
    const removed = setlists[idx];
    setlists.splice(idx, 1);
    setSetlists(setlists);
    logHistory('setlist_deleted', `Culto removido: ${removed.title}`, 'setlist', id);
    loadSetlists();
    showToast('Culto removido', 'success');
  }

  function openSetlistDetail(id) {
    selectedSetlistId = id;
    const setlist = getSetlists().find((s) => s.id === id);
    if (!setlist) return;

    const isOwner = canEditSetlist(id);
    document.getElementById('setlist-detail-title').textContent = `${setlist.title} (${setlist.date})`;

    const picker = document.getElementById('setlist-song-picker');
    const songs = getMusicas().slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    picker.innerHTML = songs.map((s) => `<option value="${s.id}">${escapeHtml(s.nome)}</option>`).join('');
    picker.disabled = !isOwner;

    const modalActions = document.getElementById('modal-setlist-detail').querySelector('.modal-actions');
    if (modalActions) {
      const addBtn = modalActions.querySelector('[onclick="addSongToSetlist()"]');
      if (addBtn) addBtn.style.display = isOwner ? 'block' : 'none';
    }

    renderSetlistSongs(setlist, isOwner);
    document.getElementById('modal-setlist-detail').classList.add('open');
  }

  function closeSetlistDetailModal() {
    document.getElementById('modal-setlist-detail').classList.remove('open');
  }

  function renderSetlistSongs(setlist, isOwner = false) {
    const el = document.getElementById('setlist-song-list');
    const songs = getMusicas();
    const items = setlist.items || [];

    if (!items.length) {
      el.innerHTML = '<div class="empty-state">Sem musicas neste culto</div>';
      return;
    }

    el.innerHTML = items
      .map((it, idx) => {
        const song = songs.find((s) => s.id === it.musica_id);
        const minister = getUsers().find((u) => u.id === (it.added_by || setlist.created_by));
        const ministerName = minister?.nome || minister?.email || 'Ministrante';
        const removeBtn = isOwner ? `<button class="btn-icon btn-setlist-action danger" onclick="removeSongFromSetlist('${it.musica_id}')">Remover</button>` : '';
        return `
          <div class="setlist-song-item">
            <div class="setlist-song-main">
              <div class="setlist-song-name">${idx + 1}. ${escapeHtml(song?.nome || 'Musica removida')}</div>
              <div class="setlist-song-meta">Incluida por ${escapeHtml(ministerName)} em ${escapeHtml(formatDateTimeBR(it.added_at))}</div>
            </div>
            ${removeBtn}
          </div>
        `;
      })
      .join('');
  }

  function addSongToSetlist() {
    if (!canEditSetlist(selectedSetlistId)) {
      showToast('Voce nao pode adicionar musicas a culto de outro ministrante', 'error');
      return;
    }
    const setlists = getSetlists();
    const setlist = setlists.find((s) => s.id === selectedSetlistId);
    if (!setlist) return;

    const musicaId = document.getElementById('setlist-song-picker').value;
    if (!musicaId) return;

    addSongToCulto(setlist.id, musicaId);
  }

  function removeSongFromSetlist(musicaId) {
    if (!canEditSetlist(selectedSetlistId)) {
      showToast('Voce nao pode remover musicas de culto de outro ministrante', 'error');
      return;
    }
    const setlists = getSetlists();
    const setlist = setlists.find((s) => s.id === selectedSetlistId);
    if (!setlist) return;

    setlist.items = (setlist.items || []).filter((i) => i.musica_id !== musicaId);
    setSetlists(setlists);
    logHistory('setlist_song_removed', `Removeu musica de ${setlist.title}`, 'setlist', setlist.id);
    renderSetlistSongs(setlist, true);
    loadSetlists();
  }

  function detectRecentRepetition(musicaId, currentSetlistId, daysWindow) {
    const now = new Date();
    const minDate = new Date(now.getTime() - daysWindow * 24 * 60 * 60 * 1000);

    const repeated = getSetlists().find((s) => {
      if (s.id === currentSetlistId) return false;
      if (!s.date) return false;
      const d = new Date(s.date + 'T00:00:00');
      if (d < minDate || d > now) return false;
      return (s.items || []).some((i) => i.musica_id === musicaId);
    });

    return repeated ? `${repeated.title} (${repeated.date})` : null;
  }

  function exportSetlistPdf() {
    const setlist = getSetlists().find((s) => s.id === selectedSetlistId);
    if (!setlist) return;
    const songs = getMusicas();
    const users = getUsers();
    const lines = (setlist.items || []).map((it, i) => {
      const nome = songs.find((s) => s.id === it.musica_id)?.nome || 'Musica removida';
      const minister = users.find((u) => u.id === (it.added_by || setlist.created_by));
      const ministerName = minister?.nome || minister?.email || 'Ministrante';
      return {
        index: i + 1,
        nome,
        ministerName,
        addedAt: formatDateTimeBR(it.added_at)
      };
    });

    const w = window.open('', '_blank');
    if (!w) {
      showToast('Nao foi possivel abrir impressao', 'error');
      return;
    }

    w.document.write(`
      <html><head><title>Culto ${escapeHtml(setlist.title)}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @page { size: auto; margin: 10mm; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 12px; color: #1f1f1f; }
        .wrap { max-width: 420px; margin: 0 auto; }
        h1 { margin: 0 0 6px; font-size: 24px; }
        p { margin: 0 0 12px; color: #666; font-size: 14px; }
        .item { border: 1px solid #ddd; border-radius: 10px; padding: 10px; margin-bottom: 8px; }
        .item-title { font-weight: 700; font-size: 16px; }
        .item-meta { margin-top: 4px; font-size: 13px; color: #666; }
      </style>
      </head><body>
      <div class="wrap">
      <h1>${escapeHtml(setlist.title)}</h1>
      <p>Data: ${escapeHtml(setlist.date)} · Total: ${lines.length} musicas</p>
      ${lines.map((l) => `<div class="item"><div class="item-title">${l.index}. ${escapeHtml(l.nome)}</div><div class="item-meta">Incluida por ${escapeHtml(l.ministerName)} em ${escapeHtml(l.addedAt)}</div></div>`).join('')}
      </div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
    logHistory('setlist_exported', `Exportou culto ${setlist.title}`, 'setlist', setlist.id);
  }

  function loadHistory() {
    const el = document.getElementById('history-list');
    if (!el) return;

    const list = getHistory().filter((h) => isAdmin || h.userId === currentProfile.id);
    if (!list.length) {
      el.innerHTML = '<div class="empty-state">Sem eventos de historico</div>';
      return;
    }

    const users = getUsers();
    const labels = {
      user_created: 'Nova conta criada',
      admin_user_created: 'Administrador criou um usuario',
      song_created: 'Musica cadastrada',
      song_linked: 'Musica adicionada em Minhas musicas',
      song_updated: 'Musica atualizada',
      song_unlinked: 'Musica removida de Minhas musicas',
      tom_saved: 'Tom da musica atualizado',
      setlist_created: 'Culto criado',
      setlist_updated: 'Culto atualizado',
      setlist_deleted: 'Culto removido',
      setlist_song_added: 'Musica adicionada ao culto',
      setlist_song_removed: 'Musica removida do culto',
      setlist_exported: 'Culto exportado para PDF',
      admin_merge_duplicates: 'Duplicidades de musicas mescladas'
    };

    el.innerHTML = list
      .slice(0, 150)
      .map((h) => {
        const person = users.find((u) => u.id === h.userId);
        const personName = person?.nome || h.userEmail || 'Usuario';
        const friendlyAction = labels[h.action] || 'Acao realizada no sistema';
        const when = new Date(h.created_at).toLocaleString('pt-BR');
        return `
          <article class="history-item">
            <div class="history-title">${escapeHtml(friendlyAction)}</div>
            <div class="history-sub">${escapeHtml(h.details || '-')}</div>
            <div class="history-sub">Por ${escapeHtml(personName)} · ${escapeHtml(when)}</div>
          </article>
        `;
      })
      .join('');
  }

  async function clearMyHistory() {
    const ok = await askConfirm('Limpar historico', 'Deseja limpar os eventos visiveis para voce?');
    if (!ok) return;

    if (isAdmin) {
      setHistory([]);
      showToast('Historico limpo', 'success');
      loadHistory();
      return;
    }

    const remaining = getHistory().filter((h) => h.userId !== currentProfile.id);
    setHistory(remaining);
    showToast('Seu historico foi limpo', 'success');
    loadHistory();
  }

  function scheduleReminder(setlist) {
    if (!setlist?.reminderAt) return;
    if (!('Notification' in window)) return;

    const target = new Date(setlist.reminderAt).getTime();
    const delay = target - Date.now();
    if (delay <= 0 || delay > 2147483647) return;

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification('Lembrete de culto', {
          body: `${setlist.title} - ${setlist.date}`
        });
      }
    }, delay);
  }

  function bindModalClose() {
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach((o) => o.classList.remove('open'));
      }
    });
  }

  function bindNetworkBadge() {
    const badge = document.getElementById('network-badge');
    function sync() {
      const online = navigator.onLine;
      badge.textContent = online ? 'Online' : 'Offline';
      badge.style.background = online ? '#27ae60' : '#c0392b';
      badge.classList.add('show');
      setTimeout(() => badge.classList.remove('show'), 1500);
    }
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
  }

  async function checkSession() {
    const sess = getSessionMeta();
    if (!sess) return;

    try {
      const userId = encodeURIComponent(sess.userId);
      const rows = await dbRequest(`/rest/v1/profiles?id=eq.${userId}&select=*`, { method: 'GET' });
      const user = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (!user) {
        clearSession();
        return;
      }

      currentProfile = user;
      currentUser = { user: { id: user.id, email: user.email }, mode: 'supabase' };

      const users = getUsers();
      if (!users.some((u) => u.id === user.id)) {
        users.push(user);
        setUsers(users);
      }

      enterApp();
    } catch {
      // Se nao conseguir validar sessao no banco, evita login fantasma.
      clearSession();
    }
  }

  function registerPwa() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        showToast('Falha ao ativar cache offline', 'error');
      });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      document.getElementById('btn-install').classList.remove('hidden');
    });

    const installBtn = document.getElementById('btn-install');
    if (installBtn && !installBtn.dataset.bound) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.classList.add('hidden');
      });
      installBtn.dataset.bound = '1';
    }

    if (!window.__sessionStorageBound) {
      window.addEventListener('storage', (e) => {
        if (e.key !== LS_SESSION || e.newValue) return;
        if (currentProfile) doLogout();
      });
      window.__sessionStorageBound = true;
    }
  }

  function openDataToolsModal() {
    document.getElementById('modal-data-tools').classList.add('open');
  }

  function closeDataToolsModal() {
    document.getElementById('modal-data-tools').classList.remove('open');
  }

  function exportBackupJson() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        [LS_USERS]: getUsers(),
        [LS_MUSICAS]: getMusicas(),
        [LS_MM]: getMM(),
        [LS_SETLISTS]: getSetlists(),
        [LS_HISTORY]: getHistory()
      }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-louvor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exportado', 'success');
  }

  function triggerImportBackup() {
    const input = document.getElementById('backup-file-input');
    input.value = '';
    input.click();
  }

  async function importBackupFromFile(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !parsed.data) {
        throw appError('E500', 'Arquivo de backup invalido');
      }

      const required = [LS_USERS, LS_MUSICAS, LS_MM, LS_SETLISTS, LS_HISTORY];
      const missing = required.find((k) => !Array.isArray(parsed.data[k]));
      if (missing) {
        throw appError('E500', 'Backup incompleto ou corrompido');
      }

      setUsers(parsed.data[LS_USERS]);
      setMusicas(parsed.data[LS_MUSICAS]);
      setMM(parsed.data[LS_MM]);
      setSetlists(parsed.data[LS_SETLISTS]);
      setHistory(parsed.data[LS_HISTORY]);

      const currentEmail = currentProfile?.email;
      if (currentEmail) {
        const refreshedUser = getUsers().find((u) => normalize(u.email) === normalize(currentEmail));
        if (refreshedUser) {
          currentProfile = refreshedUser;
          saveSession(refreshedUser);
        } else {
          clearSession();
          doLogout();
          showToast('Backup importado. Faça login novamente.', 'success');
          closeDataToolsModal();
          return;
        }
      }

      closeDataToolsModal();
      showToast('Backup importado com sucesso', 'success');
      updateAdminState();
      updateHeader();
      loadMinhas();
      loadGeral();
      loadSetlists();
      loadHistory();
      if (isAdmin) loadAdminOverview();
    } catch (error) {
      showToast(messageForError(error), 'error');
    }
  }

  async function clearAllAppData() {
    const ok = await askConfirm('Resetar app', 'Isso vai apagar todos os dados locais deste navegador. Continuar?');
    if (!ok) return;

    DATA_KEYS.forEach((k) => localStorage.removeItem(k));
    ensureSeedData();
    clearSession();
    closeDataToolsModal();
    doLogout();
    showToast('Dados locais resetados', 'success');
  }

  function bindBackupInput() {
    const input = document.getElementById('backup-file-input');
    if (!input || input.dataset.bound) return;
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      await importBackupFromFile(file);
    });
    input.dataset.bound = '1';
  }

  function escapeHtml(v) {
    return String(v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapeAttr(v) {
    return String(v).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  async function bootstrap() {
    bindModalClose();
    bindNetworkBadge();
    registerPwa();
    bindBackupInput();
    bindMusicNameSuggestionHint();

    if (!DB_ENABLED) {
      showToast('Banco de dados nao configurado. Defina SUPA_URL e SUPA_KEY no config.js', 'error');
      return;
    }

    try {
      await hydrateFromDatabase();
    } catch (error) {
      showToast('Falha ao carregar dados do banco. Verifique a conexao e as credenciais.', 'error');
      return;
    }

    await checkSession();
  }

  Object.assign(window, {
    switchTab,
    togglePass,
    doLogin,
    doRegister,
    doLogout,
    showPage,
    openModalMinhas,
    closeModalMinhas,
    saveMusica,
    editarMinhas,
    deletarMinhas,
    openGeralDetail,
    closeModalGeral,
    abrirSalvarTomGeral,
    closeModalSalvarTom,
    confirmarSalvarTom,
    abrirLink,
    loadGeral,
    exportarMinhasCsv,
    loadAdminOverview,
    mergeDuplicateSongs,
    openAdminCreateUserModal,
    closeAdminCreateUserModal,
    adminCreateUser,
    closeConfirmModal,
    openSetlistModal,
    closeSetlistModal,
    saveSetlist,
    deleteSetlist,
    openSetlistDetail,
    closeSetlistDetailModal,
    addSongToSetlist,
    removeSongFromSetlist,
    exportSetlistPdf,
    clearMyHistory,
    openDataToolsModal,
    closeDataToolsModal,
    exportBackupJson,
    triggerImportBackup,
    clearAllAppData,
    openAddToCultoModal,
    closeAddToCultoModal,
    confirmAddToCultoModal
  });

  bootstrap();
})();
