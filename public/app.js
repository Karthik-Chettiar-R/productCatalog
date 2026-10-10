const state = {
  sort: 'created_at',
  order: 'desc',
  limit: 20,
  nextCursor: null,
  prevCursor: null,
  currentCursor: null,
  page: 1,
  requestController: null,
  lastRequestUrl: null,
  searchTimer: null
};

const form = document.querySelector('#filters-form');
const rows = document.querySelector('#product-rows');
const tableWrap = document.querySelector('#table-wrap');
const loading = document.querySelector('#loading');
const empty = document.querySelector('#empty');
const error = document.querySelector('#error');
const resultCount = document.querySelector('#result-count');
const status = document.querySelector('#status');
const pageStatus = document.querySelector('#page-status');
const previousButton = document.querySelector('#previous');
const nextButton = document.querySelector('#next');
const sortSelect = document.querySelector('#sort');
const orderSelect = document.querySelector('#order');
const pageSizeSelect = document.querySelector('#limit');

const allowedSorts = ['name', 'price', 'rating', 'stock', 'created_at'];
const allowedOrders = ['asc', 'desc'];

function resetPagination() {
  state.nextCursor = null;
  state.prevCursor = null;
  state.currentCursor = null;
  state.page = 1;
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category') || '';
  const limit = Number(params.get('limit') || 20);
  const allowedLimits = [10, 20, 50, 100];
  const sort = params.get('sort') || 'created_at';
  const order = params.get('order') || 'desc';

  state.sort = allowedSorts.includes(sort) ? sort : 'created_at';
  state.order = allowedOrders.includes(order) ? order : 'desc';
  state.limit = allowedLimits.includes(limit) ? limit : 20;
  state.currentCursor = params.get('cursor');

  form.elements.search.value = params.get('search') || '';
  form.elements.category.value = ['electronics', 'clothing', 'books', 'home'].includes(category) ? category : '';
  form.elements.priceMin.value = params.get('priceMin') || '';
  form.elements.priceMax.value = params.get('priceMax') || '';
  form.elements.inStock.checked = params.get('inStock') === 'true';
  pageSizeSelect.value = String(state.limit);
  sortSelect.value = state.sort;
  orderSelect.value = state.order;
}

function updateUrl({ cursor = null, replace = false } = {}) {
  const params = new URLSearchParams();
  const values = new FormData(form);
  const search = values.get('search').trim();
  const priceMin = values.get('priceMin');
  const priceMax = values.get('priceMax');

  if (search) params.set('search', search);
  if (values.get('category')) params.set('category', values.get('category'));
  if (priceMin) params.set('priceMin', priceMin);
  if (priceMax) params.set('priceMax', priceMax);
  if (values.get('inStock')) params.set('inStock', 'true');
  params.set('sort', state.sort);
  params.set('order', state.order);
  params.set('limit', String(state.limit));
  if (cursor) params.set('cursor', cursor);

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  const method = replace ? 'replaceState' : 'pushState';
  if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
    window.history[method]({ view: nextUrl }, '', nextUrl);
  }
}

function buildApiUrl() {
  const params = new URLSearchParams(window.location.search);
  return `/api/products?${params.toString()}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function renderProducts(products) {
  rows.replaceChildren();
  products.forEach((product) => {
    const row = document.createElement('tr');
    const values = [
      product.name,
      product.category,
      `$${product.price.toFixed(2)}`,
      product.stock,
      `${product.rating.toFixed(1)} / 5`,
      formatDate(product.created_at)
    ];
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    rows.append(row);
  });
}

function renderSortDirections() {
  document.querySelectorAll('th[data-sort]').forEach((header) => {
    const indicator = header.querySelector('span');
    const active = header.dataset.sort === state.sort;
    header.querySelector('button').setAttribute('aria-label', `${header.textContent.trim()} sort`);
    indicator.textContent = active ? (state.order === 'asc' ? '↑' : '↓') : '';
  });
}

function setLoading(isLoading) {
  loading.hidden = !isLoading;
  if (isLoading) {
    error.hidden = true;
    empty.hidden = true;
    tableWrap.hidden = true;
    status.textContent = '';
  }
}

async function loadProducts() {
  const requestUrl = buildApiUrl();
  if (requestUrl === state.lastRequestUrl && !state.requestController) return;
  if (state.requestController) state.requestController.abort();
  state.requestController = new AbortController();
  state.lastRequestUrl = requestUrl;
  setLoading(true);

  try {
    const response = await fetch(requestUrl, { signal: state.requestController.signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to load products.');

    renderProducts(payload.data);
    state.nextCursor = payload.meta.nextCursor;
    state.prevCursor = payload.meta.prevCursor;
    state.currentCursor = new URLSearchParams(window.location.search).get('cursor');
    loading.hidden = true;
    tableWrap.hidden = payload.data.length === 0;
    empty.hidden = payload.data.length !== 0;
    error.hidden = true;
    resultCount.textContent = `${payload.meta.total} matching product${payload.meta.total === 1 ? '' : 's'}`;
    pageStatus.textContent = `Page ${state.page}`;
    previousButton.disabled = !state.prevCursor;
    nextButton.disabled = !state.nextCursor;
    status.textContent = '';
  } catch (requestError) {
    if (requestError.name === 'AbortError') return;
    loading.hidden = true;
    tableWrap.hidden = true;
    empty.hidden = true;
    error.textContent = requestError.message;
    error.hidden = false;
    previousButton.disabled = true;
    nextButton.disabled = true;
    status.textContent = '';
  } finally {
    state.requestController = null;
  }
}

function applyUrlState({ page = 1 } = {}) {
  readUrlState();
  state.page = page;
  updateUrl({ cursor: state.currentCursor, replace: true });
  renderSortDirections();
  loadProducts();
}

function changedFormState() {
  state.sort = sortSelect.value;
  state.order = orderSelect.value;
  state.limit = Number(pageSizeSelect.value);
  resetPagination();
  updateUrl({ cursor: null });
  renderSortDirections();
  loadProducts();
}

document.querySelectorAll('th[data-sort]').forEach((header) => {
  header.querySelector('button').addEventListener('click', () => {
    const selectedSort = header.dataset.sort;
    if (state.sort === selectedSort) {
      state.order = state.order === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort = selectedSort;
      state.order = 'asc';
    }
    sortSelect.value = state.sort;
    orderSelect.value = state.order;
    changedFormState();
    renderSortDirections();
  });
});

form.addEventListener('input', (event) => {
  if (event.target.id !== 'search') return;
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(changedFormState, 250);
});

form.addEventListener('change', (event) => {
  if (event.target.id !== 'search') changedFormState();
});

pageSizeSelect.addEventListener('change', changedFormState);

form.addEventListener('reset', () => {
  setTimeout(() => {
    state.sort = 'created_at';
    state.order = 'desc';
    state.limit = 20;
    sortSelect.value = state.sort;
    orderSelect.value = state.order;
    pageSizeSelect.value = String(state.limit);
    changedFormState();
    renderSortDirections();
  });
});

nextButton.addEventListener('click', () => {
  if (state.nextCursor) {
    state.page += 1;
    updateUrl({ cursor: state.nextCursor });
    loadProducts();
  }
});

previousButton.addEventListener('click', () => {
  if (state.prevCursor) {
    state.page = Math.max(1, state.page - 1);
    updateUrl({ cursor: state.prevCursor });
    loadProducts();
  }
});

window.addEventListener('popstate', () => {
  applyUrlState();
});

applyUrlState();
