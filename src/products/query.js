const SORTABLE_FIELDS = {
  id: 'id',
  name: 'name',
  category: 'category',
  price: 'price',
  stock: 'stock',
  rating: 'rating',
  created_at: 'created_at',
  createdAt: 'created_at'
};

const CATEGORIES = new Set(['electronics', 'clothing', 'books', 'home']);
const MAX_LIMIT = 100;

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseNumber(value, name, { integer = false } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalid(`${name} must be a number.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < 0) {
    throw invalid(`${name} must be a non-negative ${integer ? 'integer' : 'number'}.`);
  }
  return parsed;
}

function parseQuery(query) {
  const allowedParams = new Set([
    'search', 'category', 'priceMin', 'priceMax', 'inStock',
    'sort', 'order', 'limit', 'cursor'
  ]);
  const unknown = Object.keys(query).find((key) => !allowedParams.has(key));
  if (unknown) {
    throw invalid(`Unknown query parameter: ${unknown}.`);
  }
  const repeated = Object.keys(query).find((key) => Array.isArray(query[key]));
  if (repeated) {
    throw invalid(`${repeated} must be specified only once.`);
  }

  const search = query.search === undefined ? null : query.search.trim();
  if (search !== null && (search.length === 0 || search.length > 200)) {
    throw invalid('search must contain between 1 and 200 characters.');
  }

  const category = query.category === undefined ? null : query.category.toLowerCase();
  if (category !== null && !CATEGORIES.has(category)) {
    throw invalid(`category must be one of: ${[...CATEGORIES].join(', ')}.`);
  }

  const priceMin = query.priceMin === undefined ? null : parseNumber(query.priceMin, 'priceMin');
  const priceMax = query.priceMax === undefined ? null : parseNumber(query.priceMax, 'priceMax');
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    throw invalid('priceMin must be less than or equal to priceMax.');
  }

  let inStock = null;
  if (query.inStock !== undefined) {
    if (query.inStock !== 'true' && query.inStock !== 'false') {
      throw invalid('inStock must be true or false.');
    }
    inStock = query.inStock === 'true';
  }

  const field = query.sort || 'created_at';
  if (!Object.prototype.hasOwnProperty.call(SORTABLE_FIELDS, field)) {
    throw invalid(`sort must be one of: ${Object.keys(SORTABLE_FIELDS).join(', ')}.`);
  }

  const order = query.order || 'desc';
  if (order !== 'asc' && order !== 'desc') {
    throw invalid('order must be asc or desc.');
  }

  const limit = query.limit === undefined ? 20 : parseNumber(query.limit, 'limit', { integer: true });
  if (limit < 1 || limit > MAX_LIMIT) {
    throw invalid(`limit must be between 1 and ${MAX_LIMIT}.`);
  }

  return {
    search,
    category,
    priceMin,
    priceMax,
    inStock,
    field,
    column: SORTABLE_FIELDS[field],
    order,
    limit,
    cursor: query.cursor || null
  };
}

module.exports = { parseQuery };
