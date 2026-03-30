(function () {
  const cfg = window.APP_CONFIG || {};
  const SUPA_URL = cfg.SUPA_URL || '';
  const SUPA_KEY = cfg.SUPA_KEY || '';
  const ADMIN_FALLBACK_EMAIL = 'claytonpetry1@gmail.com';
  const SEM_TOM = 'Sem tom';

  const TONS = [SEM_TOM, 'Do','Do#','Re','Re#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];

  let currentUser = null;
  let currentProfile = null;
  let allMinhas = [];
  let allGeral = [];
  let selectedTom = '';
  let selectedTomSalvar = '';
  let editingMusicaId = null;
  let editingMusicaGlobalId = null;
  let geralSelectedMusica = null;
  let isAdmin = false;
  let allAdminRecords = [];

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

  async function supa(path, options = {}, retry = true) {
    const headers = {
      apikey: SUPA_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (currentUser?.access_token) headers.Authorization = `Bearer ${currentUser.access_token}`;

    const res = await fetch(SUPA_URL + path, { ...options, headers });

    if (res.status === 401 && retry && currentUser?.refresh_token) {
      const refreshed = await refreshSession();
      if (refreshed) return supa(path, options, false);
    }

    if (!res.ok) {
      let err = {};
      try { err = await res.json(); } catch {}
      throw new Error(err.message || err.error_description || 'Erro na requisicao');
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function supaAuth(path, body) {
    const res = await fetch(`${SUPA_URL}/auth/v1${path}`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Erro de autenticacao');
    return data;
  }

  async function invokeEdgeFunction(functionName, body, retry = true) {
    const headers = {
      apikey: SUPA_KEY,
      'Content-Type': 'application/json'
    };

    if (currentUser?.access_token) {
      headers.Authorization = `Bearer ${currentUser.access_token}`;
    }

    let res;
    try {
      res = await fetch(`${SUPA_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body || {})
      });
    } catch {
      throw new Error('Falha de conexao com Edge Function. Verifique se admin-create-user esta ativa/deployada no Supabase.');
    }

    let data = {};
    let rawText = '';
    try {
      rawText = await res.text();
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = rawText ? { error: rawText } : {};
    }

    if (!res.ok) {
      if (res.status === 401 && retry && currentUser?.refresh_token) {
        const refreshed = await refreshSession();
        if (refreshed) {
          return invokeEdgeFunction(functionName, body, false);
        }
      }
      if (res.status === 404) {
        throw new Error('Edge Function admin-create-user nao encontrada (404). Faça o deploy/publicacao da funcao no Supabase.');
      }
      if (res.status === 401) {
        throw new Error('Sessao invalida para chamar a Edge Function. Faça login novamente.');
      }
      if (res.status === 403) {
        throw new Error('Usuario sem permissao de admin para cadastrar novos usuarios.');
      }
      throw new Error(data.error || data.message || `Erro ${res.status} ao executar acao administrativa`);
    }

    return data;
  }

  async function refreshSession() {
    try {
      const data = await supaAuth('/token?grant_type=refresh_token', {
        refresh_token: currentUser.refresh_token
      });
      currentUser = data;
      localStorage.setItem('supa_session', JSON.stringify(data));
      return true;
    } catch {
      doLogout();
      return false;
    }
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

  function showMsg(el, text, type) {
    el.style.display = 'block';
    el.className = `auth-msg ${type}`;
    el.textContent = text;
  }

  function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast show ${type}`;
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  function setBusy(btn, busy, labelIdle, labelBusy) {
    btn.disabled = busy;
    btn.innerHTML = busy ? `<span class="spinner"></span>${labelBusy}` : labelIdle;
  }

  function getTomOrNull(value) {
    if (!value || value === SEM_TOM) return null;
    return value;
  }

  function displayTom(value) {
    return value || SEM_TOM;
  }

  function updateAdminState() {
    const email = (currentUser?.user?.email || '').toLowerCase();
    const role = (currentProfile?.role || '').toLowerCase();
    isAdmin = role === 'admin' || email === ADMIN_FALLBACK_EMAIL;
    const adminBtn = document.getElementById('btn-admin-create');
    const adminPanel = document.getElementById('admin-panel');
    if (adminBtn) adminBtn.classList.toggle('hidden', !isAdmin);
    if (adminPanel) adminPanel.classList.toggle('hidden', !isAdmin);
  }

  function mapAuthError(message, flow) {
    const raw = String(message || '').toLowerCase();

    if (raw.includes('email rate limit exceeded') || raw.includes('rate limit')) {
      if (flow === 'register') {
        return 'Limite temporario de cadastro do Supabase. Aguarde alguns minutos ou entre como admin e use "Novo usuario".';
      }
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
    }

    if (raw.includes('forbidden') || raw.includes('not admin')) {
      return 'Acao permitida apenas para administrador.';
    }

    if (raw.includes('email not confirmed') || raw.includes('not confirmed')) {
      return 'Seu e-mail ainda nao foi confirmado. Abra sua caixa de entrada e confirme antes de entrar.';
    }

    if (raw.includes('invalid login credentials')) {
      return 'E-mail ou senha invalidos. Se acabou de cadastrar, confirme o e-mail antes de entrar.';
    }

    if (raw.includes('user already registered') || raw.includes('already been registered')) {
      return 'Este e-mail ja esta cadastrado. Use a aba Entrar.';
    }

    if (flow === 'login') {
      const detail = String(message || '').trim();
      if (detail) {
        return `Nao foi possivel entrar. Detalhe: ${detail}`;
      }
      return 'Nao foi possivel entrar. Verifique e-mail/senha e confirmacao de e-mail.';
    }

    if (flow === 'register') {
      const detail = String(message || '').trim();
      if (detail) {
        return `Nao foi possivel concluir cadastro. Detalhe: ${detail}`;
      }
      return 'Nao foi possivel concluir cadastro agora. Tente novamente em instantes.';
    }

    return 'Erro de autenticacao.';
  }

  async function loadProfile() {
    const data = await supa(`/rest/v1/profiles?id=eq.${currentUser.user.id}&select=*`);
    currentProfile = data?.[0] || null;
  }

  function updateHeader() {
    const baseName = currentProfile?.nome || currentUser?.user?.email || 'Usuario';
    document.getElementById('header-user-name').innerHTML = `${escapeHtml(baseName)}${isAdmin ? '<span class="admin-chip">admin</span>' : ''}`;
    document.getElementById('user-avatar').textContent = baseName.charAt(0).toUpperCase();
  }

  function updateStats() {
    const minhasCount = allMinhas.length;
    const geralCount = allGeral.length;
    const comTom = allGeral.filter(i => i.meuTom).length;
    document.getElementById('stat-minhas').textContent = minhasCount;
    document.getElementById('stat-geral').textContent = geralCount;
    document.getElementById('stat-com-tom').textContent = comTom;
  }

  function buildTomGrid(containerId, onSelect) {
    const grid = document.getElementById(containerId);
    grid.innerHTML = '';
    TONS.forEach(tom => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tom-btn';
      btn.textContent = tom;
      btn.onclick = () => {
        grid.querySelectorAll('.tom-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        onSelect(tom);
      };
      grid.appendChild(btn);
    });
  }

  function setTomGrid(containerId, tom, onSelect) {
    const grid = document.getElementById(containerId);
    grid.querySelectorAll('.tom-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.textContent === tom);
    });
    if (tom && onSelect) onSelect(tom);
  }

  function buildTomGrids() {
    buildTomGrid('tom-grid', t => { selectedTom = t; });
    buildTomGrid('tom-grid-salvar', t => { selectedTomSalvar = t; });
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

    setBusy(btn, true, 'Entrar', 'Entrando');

    try {
      const data = await supaAuth('/token?grant_type=password', { email, password: pass });
      currentUser = data;
      localStorage.setItem('supa_session', JSON.stringify(data));
      await loadProfile();
      enterApp();
    } catch (e) {
      showMsg(msg, mapAuthError(e.message, 'login'), 'error');
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

    setBusy(btn, true, 'Criar conta', 'Criando');

    try {
      const data = await supaAuth('/signup', { email, password: pass, data: { nome } });
      if (data.access_token) {
        currentUser = data;
        localStorage.setItem('supa_session', JSON.stringify(data));
        await loadProfile();
        enterApp();
      } else {
        showMsg(msg, 'Conta criada. Confira seu e-mail para confirmar a conta e depois entre.', 'success');
        document.getElementById('login-email').value = email;
        switchTab('login');
      }
    } catch (e) {
      showMsg(msg, mapAuthError(e.message, 'register'), 'error');
    } finally {
      setBusy(btn, false, 'Criar conta', 'Criando');
    }
  }

  async function doLogout() {
    try {
      await supa('/auth/v1/logout', { method: 'POST' });
    } catch {}

    currentUser = null;
    currentProfile = null;
    allMinhas = [];
    allGeral = [];
    allAdminRecords = [];
    isAdmin = false;
    localStorage.removeItem('supa_session');

    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
  }

  function enterApp() {
    if (!SUPA_URL || !SUPA_KEY) {
      showToast('Config do Supabase ausente em assets/js/config.js', 'error');
      return;
    }

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';

    updateHeader();
    buildTomGrids();
    attachSearchHandlers();
    updateAdminState();
    loadMinhas();
    if (isAdmin) loadAdminOverview();
  }

  function showPage(name) {
    document.getElementById('page-minhas').classList.toggle('active', name === 'minhas');
    document.getElementById('page-geral').classList.toggle('active', name === 'geral');
    document.querySelectorAll('.nav-tab')[0].classList.toggle('active', name === 'minhas');
    document.querySelectorAll('.nav-tab')[1].classList.toggle('active', name === 'geral');
    if (name === 'geral') loadGeral();
  }

  async function loadMinhas() {
    const el = document.getElementById('list-minhas');
    el.innerHTML = '<div class="loading-screen">Carregando...</div>';

    try {
      const data = await supa(
        `/rest/v1/ministrante_musicas?ministrante_id=eq.${currentUser.user.id}&select=*,musicas(*)&order=created_at.desc`
      );
      allMinhas = data || [];
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

    el.innerHTML = list.map(item => {
      const nome = item.musicas?.nome || 'Sem nome';
      const link = item.musicas?.link || '';
      const obs = item.observacoes || '';
      return `
        <article class="music-card">
          <div>
            <div class="card-title">${escapeHtml(nome)}</div>
            <div class="card-sub">
              <span class="tom-badge ${item.tom ? 'mine' : 'none'}">${escapeHtml(displayTom(item.tom))}</span>
              ${obs ? ` <span>· ${escapeHtml(obs)}</span>` : ''}
            </div>
          </div>
          <div class="card-actions">
            ${link ? `<button class="btn-icon" onclick="abrirLink(event,'${escapeAttr(link)}')">Ouvir</button>` : ''}
            <button class="btn-icon" onclick="editarMinhas(event,'${item.id}')">Editar</button>
            <button class="btn-icon" onclick="deletarMinhas(event,'${item.id}')">Excluir</button>
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadGeral(showSuccess = false) {
    const el = document.getElementById('list-geral');
    el.innerHTML = '<div class="loading-screen">Carregando...</div>';

    try {
      const musicas = await supa('/rest/v1/musicas?select=*,profiles(nome)&order=nome.asc');
      const minhas = await supa(`/rest/v1/ministrante_musicas?ministrante_id=eq.${currentUser.user.id}&select=musica_id,tom,observacoes`);

      const minhasMap = {};
      (minhas || []).forEach(m => {
        minhasMap[m.musica_id] = {
          tom: m.tom,
          observacoes: m.observacoes || ''
        };
      });

      allGeral = (musicas || []).map(m => ({
        ...m,
        meuTom: minhasMap[m.id]?.tom || null,
        minhaObs: minhasMap[m.id]?.observacoes || ''
      }));

      renderGeral(allGeral);
      updateStats();
      if (showSuccess) showToast('Lista geral atualizada', 'success');
    } catch {
      el.innerHTML = '<div class="empty-state">Erro ao carregar lista geral</div>';
    }
  }

  function renderGeral(list) {
    const el = document.getElementById('list-geral');
    if (!list.length) {
      el.innerHTML = '<div class="empty-state">Nenhuma musica na lista geral</div>';
      return;
    }

    el.innerHTML = list.map(item => `
      <article class="list-item" onclick="openGeralDetail('${item.id}')">
        <div>
          <div class="card-title">${escapeHtml(item.nome)}</div>
          <div class="card-sub">Meu tom: ${escapeHtml(displayTom(item.meuTom))}</div>
        </div>
        <div>${item.meuTom ? '<span class="tom-badge mine">Com tom</span>' : '<span class="tom-badge none">Sem tom</span>'}</div>
      </article>
    `).join('');
  }

  async function loadAdminOverview(showSuccess = false) {
    if (!isAdmin) return;

    const el = document.getElementById('admin-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-screen">Carregando visao admin...</div>';

    try {
      const rows = await supa('/rest/v1/ministrante_musicas?select=tom,observacoes,profiles(nome,email),musicas(nome)&order=created_at.desc');
      allAdminRecords = rows || [];
      renderAdminOverview();
      if (showSuccess) showToast('Painel admin atualizado', 'success');
    } catch {
      el.innerHTML = '<div class="empty-state">Sem permissao para ver tudo ainda. Ajuste as politicas RLS para admin.</div>';
    }
  }

  function renderAdminOverview() {
    const el = document.getElementById('admin-list');
    if (!el) return;

    if (!allAdminRecords.length) {
      el.innerHTML = '<div class="empty-state">Sem registros para exibir</div>';
      return;
    }

    el.innerHTML = allAdminRecords.map(row => {
      const nomeMusica = row.musicas?.nome || 'Sem musica';
      const nomeUser = row.profiles?.nome || 'Sem nome';
      const emailUser = row.profiles?.email || '-';
      const tom = displayTom(row.tom);
      const obs = row.observacoes || '-';

      return `
        <article class="admin-item">
          <div class="admin-item-title">${escapeHtml(nomeMusica)}</div>
          <div class="admin-item-sub"><strong>Usuario:</strong> ${escapeHtml(nomeUser)} (${escapeHtml(emailUser)})</div>
          <div class="admin-item-sub"><strong>Tom:</strong> ${escapeHtml(tom)}</div>
          <div class="admin-item-sub"><strong>Obs:</strong> ${escapeHtml(obs)}</div>
        </article>
      `;
    }).join('');
  }

  function attachSearchHandlers() {
    const sMinhas = document.getElementById('search-minhas');
    const sGeral = document.getElementById('search-geral');

    if (!sMinhas.dataset.bound) {
      sMinhas.addEventListener('input', () => {
        const q = normalize(sMinhas.value);
        renderMinhas(allMinhas.filter(i => normalize(i.musicas?.nome).includes(q)));
      });
      sMinhas.dataset.bound = '1';
    }

    if (!sGeral.dataset.bound) {
      sGeral.addEventListener('input', () => {
        const q = normalize(sGeral.value);
        renderGeral(allGeral.filter(i => normalize(i.nome).includes(q)));
      });
      sGeral.dataset.bound = '1';
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
    setTomGrid('tom-grid', SEM_TOM, t => { selectedTom = t; });

    document.getElementById('modal-minhas').classList.add('open');
  }

  function closeModalMinhas() {
    document.getElementById('modal-minhas').classList.remove('open');
  }

  function editarMinhas(e, id) {
    e.stopPropagation();
    const item = allMinhas.find(i => i.id === id);
    if (!item) return;

    editingMusicaId = item.id;
    editingMusicaGlobalId = item.musica_id;
    selectedTom = item.tom || '';

    document.getElementById('modal-minhas-title').textContent = 'Editar musica';
    document.getElementById('m-nome').value = item.musicas?.nome || '';
    document.getElementById('m-nome').disabled = true;
    document.getElementById('m-link').value = item.musicas?.link || '';
    document.getElementById('m-obs').value = item.observacoes || '';
    setTomGrid('tom-grid', selectedTom, t => { selectedTom = t; });

    document.getElementById('modal-minhas').classList.add('open');
  }

  async function saveMusica() {
    const nome = document.getElementById('m-nome').value.trim();
    const link = document.getElementById('m-link').value.trim();
    const obs = document.getElementById('m-obs').value.trim();

    if (!nome) return showToast('Informe o nome da musica', 'error');
    if (!validUrl(link)) return showToast('Informe um link valido com http/https', 'error');

    const btn = document.getElementById('btn-save-minhas');
    setBusy(btn, true, 'Salvar', 'Salvando');

    try {
      let musicaId = editingMusicaGlobalId;

      const tomValue = getTomOrNull(selectedTom);

      if (!editingMusicaId) {
        const existing = await supa(`/rest/v1/musicas?nome=eq.${encodeURIComponent(nome)}&select=id`);
        if (existing && existing.length) {
          musicaId = existing[0].id;
        } else {
          const created = await supa('/rest/v1/musicas', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ nome, link: link || null, criado_por: currentUser.user.id })
          });
          musicaId = created[0].id;
        }

        await supa('/rest/v1/ministrante_musicas', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            ministrante_id: currentUser.user.id,
            musica_id: musicaId,
            tom: tomValue,
            observacoes: obs || null
          })
        });
      } else {
        await supa(`/rest/v1/musicas?id=eq.${musicaId}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ link: link || null })
        });

        await supa(`/rest/v1/ministrante_musicas?id=eq.${editingMusicaId}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ tom: tomValue, observacoes: obs || null })
        });
      }

      closeModalMinhas();
      showToast('Musica salva com sucesso', 'success');
      await loadMinhas();
      if (document.getElementById('page-geral').classList.contains('active')) await loadGeral();
    } catch (e) {
      if (e.message.toLowerCase().includes('unique')) {
        showToast('Voce ja tem essa musica', 'error');
      } else {
        showToast('Erro ao salvar musica', 'error');
      }
    } finally {
      setBusy(btn, false, 'Salvar', 'Salvando');
    }
  }

  async function deletarMinhas(e, id) {
    e.stopPropagation();
    if (!window.confirm('Remover esta musica da sua lista?')) return;

    try {
      await supa(`/rest/v1/ministrante_musicas?id=eq.${id}`, { method: 'DELETE' });
      showToast('Musica removida', 'success');
      await loadMinhas();
      if (document.getElementById('page-geral').classList.contains('active')) await loadGeral();
    } catch {
      showToast('Erro ao remover', 'error');
    }
  }

  function openGeralDetail(id) {
    const item = allGeral.find(i => i.id === id);
    if (!item) return;
    geralSelectedMusica = item;

    const criadoPor = item.profiles?.nome || 'Desconhecido';
    const link = item.link ? `<a href="${escapeAttr(item.link)}" target="_blank" rel="noopener" class="btn-ghost">Ouvir musica</a>` : '<span class="muted">Sem link cadastrado</span>';

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
    const item = allGeral.find(i => i.id === id);
    if (!item) return;

    geralSelectedMusica = item;
    selectedTomSalvar = item.meuTom || SEM_TOM;

    document.getElementById('salvar-tom-nome').textContent = `Definir tom para "${item.nome}"`;
    document.getElementById('salvar-obs').value = item.minhaObs || '';
    setTomGrid('tom-grid-salvar', selectedTomSalvar, t => { selectedTomSalvar = t; });
    document.getElementById('modal-salvar-tom').classList.add('open');
  }

  function closeModalSalvarTom() {
    document.getElementById('modal-salvar-tom').classList.remove('open');
  }

  async function confirmarSalvarTom() {
    const obs = document.getElementById('salvar-obs').value.trim();
    const btn = document.getElementById('btn-salvar-tom');
    setBusy(btn, true, 'Salvar', 'Salvando');

    try {
      const item = geralSelectedMusica;
      const tomValue = getTomOrNull(selectedTomSalvar);
      if (item.meuTom) {
        await supa(`/rest/v1/ministrante_musicas?ministrante_id=eq.${currentUser.user.id}&musica_id=eq.${item.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ tom: tomValue, observacoes: obs || null })
        });
      } else {
        await supa('/rest/v1/ministrante_musicas', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            ministrante_id: currentUser.user.id,
            musica_id: item.id,
            tom: tomValue,
            observacoes: obs || null
          })
        });
      }

      closeModalSalvarTom();
      showToast('Tom salvo com sucesso', 'success');
      await loadGeral();
      await loadMinhas();
    } catch {
      showToast('Erro ao salvar tom', 'error');
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
    allMinhas.forEach(item => {
      rows.push([
        item.musicas?.nome || '',
        item.tom || '',
        item.musicas?.link || '',
        item.observacoes || ''
      ]);
    });

    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'minhas-musicas.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado', 'success');
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

  async function adminCreateUser() {
    if (!isAdmin) return showToast('Somente admin pode cadastrar usuario', 'error');

    const nome = document.getElementById('admin-user-name').value.trim();
    const email = document.getElementById('admin-user-email').value.trim();
    const pass = document.getElementById('admin-user-pass').value;

    if (!nome || !validEmail(email) || pass.length < 6) {
      return showToast('Informe nome, email valido e senha minima de 6 chars', 'error');
    }

    const btn = document.getElementById('btn-admin-create-user');
    setBusy(btn, true, 'Cadastrar', 'Cadastrando');

    try {
      await invokeEdgeFunction('admin-create-user', {
        nome,
        email,
        password: pass
      });
      showToast('Usuario cadastrado com sucesso pelo admin.', 'success');
      closeAdminCreateUserModal();
    } catch (e) {
      showToast(mapAuthError(e.message, 'register'), 'error');
    } finally {
      setBusy(btn, false, 'Cadastrar', 'Cadastrando');
    }
  }

  function bindModalClose() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open'));
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
  }

  async function checkSession() {
    const stored = localStorage.getItem('supa_session');
    if (!stored) return;

    try {
      currentUser = JSON.parse(stored);
      await loadProfile();
      enterApp();
    } catch {
      localStorage.removeItem('supa_session');
    }
  }

  function bootstrap() {
    bindModalClose();
    bindNetworkBadge();
    checkSession();
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
    openAdminCreateUserModal,
    closeAdminCreateUserModal,
    adminCreateUser
  });

  bootstrap();
})();
