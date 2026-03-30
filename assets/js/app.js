(function () {
  const ADMIN_EMAIL = 'claytonpetry1@gmail.com';
  const ADMIN_PASSWORD = '123456';
  const SEM_TOM = 'Sem tom';

  const TONS = [SEM_TOM, 'Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

  const LS_USERS = 'louvor_users';
  const LS_SESSION = 'louvor_session';
  const LS_MUSICAS = 'louvor_musicas';
  const LS_MM = 'louvor_ministrante_musicas';

  let currentUser = null;
  let currentProfile = null;
  let allMinhas = [];
  let allGeral = [];
  let allAdminRecords = [];
  let selectedTom = '';
  let selectedTomSalvar = '';
  let editingMusicaId = null;
  let editingMusicaGlobalId = null;
  let geralSelectedMusica = null;
  let isAdmin = false;

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

  function getUsers() {
    return readJson(LS_USERS, []);
  }

  function setUsers(users) {
    writeJson(LS_USERS, users);
  }

  function getMusicas() {
    return readJson(LS_MUSICAS, []);
  }

  function setMusicas(musicas) {
    writeJson(LS_MUSICAS, musicas);
  }

  function getMM() {
    return readJson(LS_MM, []);
  }

  function setMM(mm) {
    writeJson(LS_MM, mm);
  }

  function ensureSeedData() {
    const users = getUsers();
    const hasAdmin = users.some(u => normalize(u.email) === normalize(ADMIN_EMAIL));

    if (!hasAdmin) {
      users.push({
        id: uid(),
        nome: 'Clayton',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'admin',
        created_at: new Date().toISOString()
      });
      setUsers(users);
    }

    if (!localStorage.getItem(LS_MUSICAS)) setMusicas([]);
    if (!localStorage.getItem(LS_MM)) setMM([]);
  }

  function saveSession(user) {
    writeJson(LS_SESSION, { userId: user.id, at: new Date().toISOString() });
  }

  function clearSession() {
    localStorage.removeItem(LS_SESSION);
  }

  function getSessionUser() {
    const sess = readJson(LS_SESSION, null);
    if (!sess?.userId) return null;
    return getUsers().find(u => u.id === sess.userId) || null;
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
    document.getElementById('header-user-name').innerHTML = `${escapeHtml(baseName)}${isAdmin ? '<span class="admin-chip">admin</span>' : ''}`;
    document.getElementById('user-avatar').textContent = baseName.charAt(0).toUpperCase();
  }

  function updateStats() {
    const minhasCount = allMinhas.length;
    const geralCount = allGeral.length;
    const comTom = allGeral.filter(i => i.meuTom).length;

    document.getElementById('stat-minhas').textContent = String(minhasCount);
    document.getElementById('stat-geral').textContent = String(geralCount);
    document.getElementById('stat-com-tom').textContent = String(comTom);
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

  function doLogin() {
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
      const user = getUsers().find(u => normalize(u.email) === normalize(email) && u.password === pass);
      if (!user) {
        showMsg(msg, 'Email ou senha invalidos', 'error');
        return;
      }

      currentProfile = user;
      currentUser = { user: { id: user.id, email: user.email }, mode: 'local' };
      saveSession(user);
      enterApp();
    } finally {
      setBusy(btn, false, 'Entrar', 'Entrando');
    }
  }

  function doRegister() {
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
      const users = getUsers();
      const exists = users.some(u => normalize(u.email) === normalize(email));
      if (exists) {
        showMsg(msg, 'Este email ja esta cadastrado. Use Entrar.', 'error');
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

      showMsg(msg, 'Conta criada com sucesso. Faça login.', 'success');
      document.getElementById('login-email').value = email;
      switchTab('login');
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

  function enterApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';

    updateAdminState();
    updateHeader();
    buildTomGrids();
    attachSearchHandlers();
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

  function loadMinhas() {
    const el = document.getElementById('list-minhas');
    el.innerHTML = '<div class="loading-screen">Carregando...</div>';

    try {
      const musicas = getMusicas();
      const mm = getMM().filter(r => r.ministrante_id === currentProfile.id);

      allMinhas = mm.map(row => ({
        ...row,
        musicas: musicas.find(m => m.id === row.musica_id) || null
      })).filter(r => r.musicas);

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

  function loadGeral(showSuccess = false) {
    const el = document.getElementById('list-geral');
    el.innerHTML = '<div class="loading-screen">Carregando...</div>';

    try {
      const musicas = getMusicas();
      const mm = getMM().filter(r => r.ministrante_id === currentProfile.id);
      const mmMap = new Map(mm.map(r => [r.musica_id, r]));
      const users = getUsers();

      allGeral = musicas.map(m => {
        const my = mmMap.get(m.id);
        const dono = users.find(u => u.id === m.criado_por);
        return {
          ...m,
          meuTom: my?.tom || null,
          minhaObs: my?.observacoes || '',
          profiles: { nome: dono?.nome || 'Desconhecido' }
        };
      }).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));

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

  function loadAdminOverview(showSuccess = false) {
    if (!isAdmin) return;

    const el = document.getElementById('admin-list');
    if (!el) return;

    try {
      const mm = getMM();
      const musicas = getMusicas();
      const users = getUsers();

      allAdminRecords = mm.map(row => {
        const musica = musicas.find(m => m.id === row.musica_id);
        const user = users.find(u => u.id === row.ministrante_id);
        return {
          ...row,
          musicas: { nome: musica?.nome || 'Sem musica' },
          profiles: { nome: user?.nome || 'Sem nome', email: user?.email || '-' }
        };
      }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

      renderAdminOverview();
      if (showSuccess) showToast('Painel admin atualizado', 'success');
    } catch {
      el.innerHTML = '<div class="empty-state">Erro ao carregar visao admin</div>';
    }
  }

  function renderAdminOverview() {
    const el = document.getElementById('admin-list');
    if (!el) return;

    if (!allAdminRecords.length) {
      el.innerHTML = '<div class="empty-state">Sem registros para exibir</div>';
      return;
    }

    el.innerHTML = allAdminRecords.map(row => `
      <article class="admin-item">
        <div class="admin-item-title">${escapeHtml(row.musicas?.nome || 'Sem musica')}</div>
        <div class="admin-item-sub"><strong>Usuario:</strong> ${escapeHtml(row.profiles?.nome || 'Sem nome')} (${escapeHtml(row.profiles?.email || '-')})</div>
        <div class="admin-item-sub"><strong>Tom:</strong> ${escapeHtml(displayTom(row.tom))}</div>
        <div class="admin-item-sub"><strong>Obs:</strong> ${escapeHtml(row.observacoes || '-')}</div>
      </article>
    `).join('');
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
    selectedTom = item.tom || SEM_TOM;

    document.getElementById('modal-minhas-title').textContent = 'Editar musica';
    document.getElementById('m-nome').value = item.musicas?.nome || '';
    document.getElementById('m-nome').disabled = true;
    document.getElementById('m-link').value = item.musicas?.link || '';
    document.getElementById('m-obs').value = item.observacoes || '';
    setTomGrid('tom-grid', selectedTom, t => { selectedTom = t; });

    document.getElementById('modal-minhas').classList.add('open');
  }

  function saveMusica() {
    const nome = document.getElementById('m-nome').value.trim();
    const link = document.getElementById('m-link').value.trim();
    const obs = document.getElementById('m-obs').value.trim();

    if (!nome) return showToast('Informe o nome da musica', 'error');
    if (!validUrl(link)) return showToast('Informe um link valido com http/https', 'error');

    const btn = document.getElementById('btn-save-minhas');
    setBusy(btn, true, 'Salvar', 'Salvando');

    try {
      const tomValue = getTomOrNull(selectedTom);
      const musicas = getMusicas();
      const mm = getMM();
      let musicaId = editingMusicaGlobalId;

      if (!editingMusicaId) {
        const existingMusica = musicas.find(m => normalize(m.nome) === normalize(nome));
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
        }

        const existingAssoc = mm.find(r => r.ministrante_id === currentProfile.id && r.musica_id === musicaId);
        if (existingAssoc) {
          existingAssoc.tom = tomValue;
          existingAssoc.observacoes = obs || null;
          existingAssoc.updated_at = new Date().toISOString();
        } else {
          mm.push({
            id: uid(),
            ministrante_id: currentProfile.id,
            musica_id: musicaId,
            tom: tomValue,
            observacoes: obs || null,
            created_at: new Date().toISOString()
          });
        }
        setMM(mm);
      } else {
        const musica = musicas.find(m => m.id === musicaId);
        if (musica) {
          musica.link = link || null;
          musica.updated_at = new Date().toISOString();
          setMusicas(musicas);
        }

        const assoc = mm.find(r => r.id === editingMusicaId);
        if (assoc) {
          assoc.tom = tomValue;
          assoc.observacoes = obs || null;
          assoc.updated_at = new Date().toISOString();
          setMM(mm);
        }
      }

      closeModalMinhas();
      showToast('Musica salva com sucesso', 'success');
      loadMinhas();
      if (document.getElementById('page-geral').classList.contains('active')) loadGeral();
      if (isAdmin) loadAdminOverview();
    } catch {
      showToast('Erro ao salvar musica', 'error');
    } finally {
      setBusy(btn, false, 'Salvar', 'Salvando');
    }
  }

  function deletarMinhas(e, id) {
    e.stopPropagation();
    if (!window.confirm('Remover esta musica da sua lista?')) return;

    const mm = getMM();
    const idx = mm.findIndex(r => r.id === id);
    if (idx >= 0) {
      mm.splice(idx, 1);
      setMM(mm);
      showToast('Musica removida', 'success');
      loadMinhas();
      if (document.getElementById('page-geral').classList.contains('active')) loadGeral();
      if (isAdmin) loadAdminOverview();
    } else {
      showToast('Registro nao encontrado', 'error');
    }
  }

  function openGeralDetail(id) {
    const item = allGeral.find(i => i.id === id);
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

  function confirmarSalvarTom() {
    const obs = document.getElementById('salvar-obs').value.trim();
    const btn = document.getElementById('btn-salvar-tom');
    setBusy(btn, true, 'Salvar', 'Salvando');

    try {
      const item = geralSelectedMusica;
      const tomValue = getTomOrNull(selectedTomSalvar);
      const mm = getMM();

      const assoc = mm.find(r => r.ministrante_id === currentProfile.id && r.musica_id === item.id);
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
      closeModalSalvarTom();
      showToast('Tom salvo com sucesso', 'success');
      loadGeral();
      loadMinhas();
      if (isAdmin) loadAdminOverview();
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
        displayTom(item.tom),
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

  function adminCreateUser() {
    if (!isAdmin) return showToast('Somente admin pode cadastrar usuario', 'error');

    const nome = document.getElementById('admin-user-name').value.trim();
    const email = document.getElementById('admin-user-email').value.trim();
    const pass = document.getElementById('admin-user-pass').value;

    if (!nome || !validEmail(email) || pass.length < 6) {
      return showToast('Informe nome, email valido e senha minima de 6 chars', 'error');
    }

    const users = getUsers();
    const exists = users.some(u => normalize(u.email) === normalize(email));
    if (exists) {
      return showToast('Este email ja esta cadastrado', 'error');
    }

    users.push({
      id: uid(),
      nome,
      email,
      password: pass,
      role: 'user',
      created_at: new Date().toISOString()
    });

    setUsers(users);
    showToast('Usuario cadastrado com sucesso (modo local).', 'success');
    closeAdminCreateUserModal();
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

  function checkSession() {
    const user = getSessionUser();
    if (!user) return;

    currentProfile = user;
    currentUser = { user: { id: user.id, email: user.email }, mode: 'local' };
    enterApp();
  }

  function bootstrap() {
    ensureSeedData();
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
