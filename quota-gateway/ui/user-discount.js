// First-party extension for the stock admin users page.
// The upstream frontend bundle remains unchanged.
(function () {
  if (!location.pathname.endsWith('/admin/users')) return;

  const state = { users: [], byEmail: new Map(), selectedUserId: null, loading: false };
  const token = localStorage.getItem('auth_token') || sessionStorage.getItem('pay_admin_token') || '';

  async function api(path, options) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(path, Object.assign({}, options || {}, { headers }));
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) throw new Error(data.error || text || ('HTTP ' + response.status));
    return data;
  }

  function textOf(element) { return (element && element.textContent || '').replace(/\s+/g, ' ').trim(); }
  function isUserTableHeader(element) { return /^(用户|User)$/i.test(textOf(element)) || /^(邮箱|Email)$/i.test(textOf(element)); }
  function findUserEmail(row) {
    for (const email of state.byEmail.keys()) if (textOf(row).includes(email)) return email;
    return '';
  }

  function formatDiscountPercent(user) {
    if (!user) return '-';
    return `-${Number(user.discountPercent || 0).toFixed(1)}%`;
  }

  async function loadUsers() {
    if (state.loading) return;
    state.loading = true;
    try {
      const data = await api('/pay-api/admin/users?page=1&page_size=200');
      state.users = data.users || [];
      state.byEmail = new Map(state.users.filter(user => user.email).map(user => [String(user.email), user]));
      redraw();
    } catch (_) {
      // The extension stays invisible when the payment service is unavailable.
    } finally {
      state.loading = false;
    }
  }

  function addListColumn() {
    const table = [...document.querySelectorAll('table')].find(candidate =>
      [...candidate.querySelectorAll('th')].some(isUserTableHeader));
    if (!table) return;
    const headers = [...table.querySelectorAll('thead th')];
    const balanceHeader = headers.find(header => /^(余额|Balance)$/i.test(textOf(header)));
    if (!balanceHeader) return;
    if (!headers.some(header => header.dataset.userDiscountColumn === 'true')) {
      const discountHeader = document.createElement('th');
      discountHeader.dataset.userDiscountColumn = 'true';
      discountHeader.textContent = '用户折扣';
      balanceHeader.insertAdjacentElement('afterend', discountHeader);
    }
    const balanceIndex = headers.indexOf(balanceHeader);
    for (const row of table.querySelectorAll('tbody tr')) {
      const email = findUserEmail(row);
      const user = state.byEmail.get(email);
      const cell = row.querySelector('[data-user-discount-cell="true"]') || document.createElement('td');
      cell.dataset.userDiscountCell = 'true';
      if (cell.className !== 'text-sm') cell.className = 'text-sm';
      const nextText = formatDiscountPercent(user);
      if (cell.textContent !== nextText) cell.textContent = nextText;
      const anchor = row.children[balanceIndex];
      if (anchor && !cell.parentElement) anchor.insertAdjacentElement('afterend', cell);
    }
  }

  function captureEditUser() {
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !/^(编辑|Edit)$/i.test(textOf(button))) return;
      const row = button.closest('tr');
      const email = findUserEmail(row);
      state.selectedUserId = state.byEmail.get(email)?.id || null;
    }, true);
  }

  function addEditField() {
    if (!state.selectedUserId) return;
    const dialogs = [...document.querySelectorAll('form')].filter(form => /编辑用户|Edit User/i.test(textOf(form.closest('[role="dialog"]') || form)));
    const form = dialogs[0];
    if (!form || form.querySelector('[data-user-discount-field="true"]')) return;
    const labels = [...form.querySelectorAll('label')];
    const anchor = labels.find(label => /并发数|Concurrency/i.test(textOf(label)))?.closest('div');
    if (!anchor) return;
    const wrapper = document.createElement('div');
    wrapper.dataset.userDiscountField = 'true';
    wrapper.innerHTML = '<label class="input-label">用户折扣（%）</label><input class="input" type="number" min="0" max="100" step="0.1" value="0"><p class="input-hint">仅管理员可见，范围 0–100%</p>';
    const input = wrapper.querySelector('input');
    const user = state.users.find(item => Number(item.id) === Number(state.selectedUserId));
    input.value = String(user?.discountPercent ?? 0);
    anchor.insertAdjacentElement('afterend', wrapper);
    form.addEventListener('submit', () => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0 || value > 100) return;
      setTimeout(async () => {
        try {
          await api(`/pay-api/admin/users/${state.selectedUserId}/discount`, { method: 'PUT', body: JSON.stringify({ discountPercent: value }) });
          const current = state.users.find(item => Number(item.id) === Number(state.selectedUserId));
          if (current) current.discountPercent = value;
          redraw();
        } catch (_) {}
      }, 50);
    }, { once: true });
  }

  let observer = null;
  let redrawQueued = false;
  let rendering = false;

  function redraw() {
    if (rendering) return;
    rendering = true;
    observer?.disconnect();
    try {
      addListColumn();
      addEditField();
    } finally {
      rendering = false;
      if (!observer || !document.documentElement) return;
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  captureEditUser();
  loadUsers();
  observer = new MutationObserver(() => {
    if (rendering || redrawQueued) return;
    redrawQueued = true;
    queueMicrotask(() => {
      redrawQueued = false;
      redraw();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();
