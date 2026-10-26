'use strict';

(() => {
  const state = {
    csrfToken: null,
    user: null,
    files: [],
    benchmarkLoaded: false
  };

  const elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setMessage(target, text, type = '') {
    target.textContent = text || '';
    target.className = `message${type ? ` is-${type}` : ''}`;
  }

  function setBusy(button, busy, label) {
    button.disabled = busy;
    if (label) button.textContent = busy ? 'Memproses…' : label;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KiB', 'MiB', 'GiB'];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function formatMs(value) {
    return Number.isFinite(value) ? `${value.toFixed(3)} ms` : '-';
  }

  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');

    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body === 'object') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && state.csrfToken) {
      headers.set('X-CSRF-Token', state.csrfToken);
    }

    const response = await fetch(path, {
      ...options,
      method,
      headers,
      body,
      credentials: 'same-origin'
    });

    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) {
      payload = await response.json().catch(() => null);
    } else {
      payload = await response.text().catch(() => '');
    }

    if (!response.ok) {
      const message = payload && payload.error && payload.error.message
        ? payload.error.message
        : `Permintaan gagal (${response.status}).`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload && payload.error ? payload.error.code : null;
      throw error;
    }

    return payload;
  }

  function setAuthenticated(user) {
    state.user = user || null;
    elements.userArea.hidden = !state.user;
    elements.userName.textContent = state.user ? state.user.username : '';
    elements.authView.hidden = Boolean(state.user);
    elements.appView.hidden = !state.user;
  }

  function showLoginTab() {
    elements.loginForm.hidden = false;
    elements.registerForm.hidden = true;
    elements.tabLogin.classList.add('is-active');
    elements.tabRegister.classList.remove('is-active');
    elements.tabLogin.setAttribute('aria-selected', 'true');
    elements.tabRegister.setAttribute('aria-selected', 'false');
  }

  function showRegisterTab() {
    elements.loginForm.hidden = true;
    elements.registerForm.hidden = false;
    elements.tabRegister.classList.add('is-active');
    elements.tabLogin.classList.remove('is-active');
    elements.tabRegister.setAttribute('aria-selected', 'true');
    elements.tabLogin.setAttribute('aria-selected', 'false');
  }

  async function bootstrap() {
    try {
      const data = await api('/api/auth/me');
      state.csrfToken = data.csrfToken || state.csrfToken;
      setAuthenticated(data.authenticated ? data.user : null);
      if (data.authenticated) {
        await Promise.all([loadFiles(), loadBenchmark()]);
      }
    } catch {
      setMessage(elements.authMessage, 'Tidak dapat terhubung ke server lokal.', 'error');
      setAuthenticated(null);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setMessage(elements.authMessage, '');
    const username = elements.loginUsername.value.trim();
    const password = elements.loginPassword.value;
    if (!username || !password) {
      setMessage(elements.authMessage, 'Username dan password wajib diisi.', 'error');
      return;
    }

    setBusy(elements.loginSubmit, true);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { username, password }
      });
      state.csrfToken = data.csrfToken;
      state.user = data.user;
      setAuthenticated(data.user);
      elements.loginPassword.value = '';
      setMessage(elements.authMessage, '');
      await Promise.all([loadFiles(), loadBenchmark()]);
    } catch (error) {
      setMessage(elements.authMessage, error.message, 'error');
    } finally {
      setBusy(elements.loginSubmit, false, 'Masuk');
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setMessage(elements.authMessage, '');
    const username = elements.registerUsername.value.trim();
    const password = elements.registerPassword.value;
    const confirmation = elements.registerPasswordConfirm.value;
    if (password !== confirmation) {
      setMessage(elements.authMessage, 'Konfirmasi password tidak sama.', 'error');
      return;
    }

    setBusy(elements.registerSubmit, true);
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: { username, password }
      });
      elements.registerForm.reset();
      showLoginTab();
      elements.loginUsername.value = username;
      setMessage(elements.authMessage, 'Akun dibuat. Silakan masuk.', 'success');
    } catch (error) {
      setMessage(elements.authMessage, error.message, 'error');
    } finally {
      setBusy(elements.registerSubmit, false, 'Buat akun');
    }
  }

  async function handleLogout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      setMessage(elements.authMessage, error.message, 'error');
    } finally {
      state.user = null;
      state.files = [];
      state.benchmarkLoaded = false;
      setAuthenticated(null);
      showLoginTab();
      try {
        const data = await api('/api/auth/me');
        state.csrfToken = data.csrfToken;
      } catch {
        state.csrfToken = null;
      }
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    setMessage(elements.uploadMessage, '');
    const file = elements.fileInput.files[0];
    if (!file) {
      setMessage(elements.uploadMessage, 'Pilih file terlebih dahulu.', 'error');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setMessage(elements.uploadMessage, 'Ukuran file melebihi batas 25 MiB.', 'error');
      return;
    }

    const form = new FormData();
    form.append('file', file);
    form.append('algorithm', elements.algorithmSelect.value);
    setBusy(elements.uploadButton, true);
    try {
      const data = await api('/api/files', { method: 'POST', body: form });
      setMessage(elements.uploadMessage, data.message, 'success');
      elements.uploadForm.reset();
      elements.algorithmNote.textContent = algorithmDescription(elements.algorithmSelect.value);
      await loadFiles();
    } catch (error) {
      setMessage(elements.uploadMessage, error.message, 'error');
    } finally {
      setBusy(elements.uploadButton, false, 'Enkripsi & simpan');
    }
  }

  function algorithmDescription(algorithm) {
    if (algorithm === 'DES') {
      return 'DES-CBC hanya untuk pembelajaran. Kunci 56-bit sudah tidak aman.';
    }
    if (algorithm === 'RC4') {
      return 'RC4 hanya untuk pembelajaran dan perbandingan akademik. RC4 tidak aman untuk data nyata.';
    }
    return 'AES-256-CBC dengan IV acak dan HMAC-SHA-256 adalah pilihan yang disarankan.';
  }

  async function loadFiles() {
    try {
      const data = await api('/api/files');
      state.files = data.files || [];
      renderFiles();
    } catch (error) {
      setMessage(elements.filesMessage, error.message, 'error');
    }
  }

  function renderFiles() {
    elements.fileList.replaceChildren();
    elements.filesEmpty.hidden = state.files.length !== 0;
    elements.filesMessage.textContent = '';

    for (const file of state.files) {
      const item = element('li', 'file-item');
      const main = element('div', 'file-main');
      const name = element('strong', 'file-name', file.original_filename);
      const meta = element(
        'p',
        'file-meta',
        `${file.algorithm}-${file.mode} · ${formatBytes(file.original_size_bytes)} · ${formatDate(file.created_at)}`
      );
      main.append(name, meta);

      const actions = element('div', 'file-actions');
      const download = element('a', 'button button-quiet', 'Unduh');
      download.href = `/api/files/${encodeURIComponent(file.id)}/download`;
      const ciphertext = element('a', 'button button-quiet', 'Ciphertext');
      ciphertext.href = `/api/files/${encodeURIComponent(file.id)}/ciphertext`;
      const remove = element('button', 'button button-danger', 'Hapus');
      remove.type = 'button';
      remove.addEventListener('click', () => deleteFile(file));

      actions.append(download, ciphertext, remove);
      item.append(main, actions);
      elements.fileList.append(item);
    }
  }

  async function deleteFile(file) {
    if (!window.confirm(`Hapus "${file.original_filename}"? Tindakan ini permanen.`)) return;
    try {
      await api(`/api/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
      setMessage(elements.filesMessage, 'File dihapus.', 'success');
      await loadFiles();
    } catch (error) {
      setMessage(elements.filesMessage, error.message, 'error');
    }
  }

  async function loadBenchmark() {
    try {
      const report = await api('/api/benchmark/latest');
      renderBenchmark(report);
    } catch (error) {
      if (error.status === 404) {
        elements.benchmarkContent.replaceChildren(
          element('p', 'empty-state', 'Belum ada hasil benchmark. Jalankan npm run benchmark.')
        );
        return;
      }
      elements.benchmarkContent.replaceChildren(
        element('p', 'empty-state', error.message)
      );
    }
  }

  function renderBenchmark(report) {
    const aggregates = Array.isArray(report.aggregates) ? report.aggregates : [];
    elements.benchmarkContent.replaceChildren();
    if (aggregates.length === 0) {
      elements.benchmarkContent.append(element('p', 'empty-state', 'Tidak ada hasil benchmark.'));
      return;
    }

    const table = element('table', 'benchmark-table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['Fixture', 'Algoritma', 'Enkripsi', 'Dekripsi', 'Total', 'Throughput']) {
      headerRow.append(element('th', null, label));
    }
    thead.append(headerRow);
    const tbody = document.createElement('tbody');
    for (const row of aggregates) {
      const tr = document.createElement('tr');
      tr.append(
        element('td', null, row.fixture_id),
        element('td', null, row.algorithm),
        element('td', null, formatMs(row.encrypt_ms && row.encrypt_ms.mean_ms)),
        element('td', null, formatMs(row.decrypt_ms && row.decrypt_ms.mean_ms)),
        element('td', null, formatMs(row.total_ms && row.total_ms.mean_ms)),
        element('td', null, `${Number(row.throughput_mb_s).toFixed(2)} MiB/s`)
      );
      tbody.append(tr);
    }
    table.append(thead, tbody);
    elements.benchmarkContent.append(table);
    if (report.generated_at) {
      elements.benchmarkContent.append(
        element('p', 'benchmark-note', `Dihasilkan: ${formatDate(report.generated_at)}`)
      );
    }
  }

  function bind() {
    elements.tabLogin.addEventListener('click', showLoginTab);
    elements.tabRegister.addEventListener('click', showRegisterTab);
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.registerForm.addEventListener('submit', handleRegister);
    elements.logoutButton.addEventListener('click', handleLogout);
    elements.uploadForm.addEventListener('submit', handleUpload);
    elements.algorithmSelect.addEventListener('change', () => {
      elements.algorithmNote.textContent = algorithmDescription(elements.algorithmSelect.value);
    });
    elements.filesRefresh.addEventListener('click', loadFiles);
    elements.benchmarkRefresh.addEventListener('click', loadBenchmark);
  }

  function collectElements() {
    elements.authView = byId('auth-view');
    elements.appView = byId('app-view');
    elements.userArea = byId('user-area');
    elements.userName = byId('user-name');
    elements.tabLogin = byId('tab-login');
    elements.tabRegister = byId('tab-register');
    elements.loginForm = byId('login-form');
    elements.registerForm = byId('register-form');
    elements.loginUsername = byId('login-username');
    elements.loginPassword = byId('login-password');
    elements.loginSubmit = elements.loginForm.querySelector('button[type="submit"]');
    elements.registerUsername = byId('register-username');
    elements.registerPassword = byId('register-password');
    elements.registerPasswordConfirm = byId('register-password-confirm');
    elements.registerSubmit = elements.registerForm.querySelector('button[type="submit"]');
    elements.authMessage = byId('auth-message');
    elements.logoutButton = byId('logout-button');
    elements.uploadForm = byId('upload-form');
    elements.fileInput = byId('file-input');
    elements.algorithmSelect = byId('algorithm-select');
    elements.algorithmNote = byId('algorithm-note');
    elements.uploadButton = byId('upload-button');
    elements.uploadMessage = byId('upload-message');
    elements.filesRefresh = byId('files-refresh');
    elements.filesMessage = byId('files-message');
    elements.fileList = byId('file-list');
    elements.filesEmpty = byId('files-empty');
    elements.benchmarkRefresh = byId('benchmark-refresh');
    elements.benchmarkContent = byId('benchmark-content');
  }

  collectElements();
  bind();
  bootstrap();
})();
