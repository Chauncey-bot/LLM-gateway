// First-party purchase price presentation. The upstream purchase page remains unchanged.
(function () {
  if (!location.pathname.endsWith('/purchase')) return;

  const token = localStorage.getItem('auth_token') || sessionStorage.getItem('pay_embedded_token') || '';
  const state = { discountPercent: 0, items: [], loaded: false };
  let observer = null;
  let redrawQueued = false;
  let rendering = false;

  async function api(path) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(path, { headers });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) throw new Error(data.error || text || ('HTTP ' + response.status));
    return data;
  }

  function formatAmount(amountCents) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amountCents) / 100);
  }

  function discountedAmount(amountCents) {
    return Math.max(0, Math.round(Number(amountCents) * (1 - state.discountPercent / 100)));
  }

  function findCard(code) {
    return [...document.querySelectorAll('article.card-hover, article')]
      .find(card => [...card.querySelectorAll('*')]
        .some(element => !element.children.length && element.textContent.trim() === code));
  }

  function findPriceElement(card) {
    return card?.querySelector('[class*="text-3xl"]');
  }

  function renderCard(item) {
    const card = findCard(item.code);
    const price = findPriceElement(card);
    if (!price) return;

    const originalAmount = Number(item.amountCents);
    const discounted = discountedAmount(originalAmount);
    const marker = `${originalAmount}:${discounted}:${state.discountPercent}`;
    if (price.dataset.discountPriceRendered === marker) return;

    price.replaceChildren();
    const current = document.createElement('span');
    current.textContent = formatAmount(discounted);
    const market = document.createElement('span');
    market.className = 'mt-1 block text-sm font-normal text-gray-400 line-through dark:text-dark-500';
    market.textContent = `市场价 ${formatAmount(originalAmount)}`;
    price.append(current, market);
    price.dataset.discountPriceRendered = marker;
  }

  function redraw() {
    if (rendering || !state.loaded || state.discountPercent <= 0) return;
    rendering = true;
    observer?.disconnect();
    try {
      state.items.forEach(renderCard);
    } finally {
      rendering = false;
      observer?.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  async function load() {
    try {
      const [session, catalog] = await Promise.all([
        api('/pay-api/session'),
        api('/pay-api/catalog'),
      ]);
      state.discountPercent = Math.min(100, Math.max(0, Number(session.discountPercent || 0)));
      state.items = [
        ...(catalog.subscriptions || []),
        ...(catalog.balancePacks || []),
        ...(catalog.trafficPacks || []),
      ];
      state.loaded = true;
      redraw();
    } catch (_) {
      // The native page remains available if discount presentation cannot load.
    }
  }

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
  load();
})();
