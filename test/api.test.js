const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../src/app');
const pool = require('../src/db');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function getProducts(query = '') {
  const response = await fetch(`${baseUrl}/api/products${query}`);
  return { response, body: await response.json() };
}

test('has at least 500 seeded products', async () => {
  const { response, body } = await getProducts('?limit=1');
  assert.equal(response.status, 200);
  assert.ok(body.meta.total >= 500);
});

test('returns the required envelope and combines filters', async () => {
  const { response, body } = await getProducts(
    '?search=wireless&category=electronics&priceMin=20&priceMax=500&inStock=true&sort=price&order=asc&limit=10'
  );

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.data));
  assert.deepEqual(Object.keys(body.meta).sort(), [
    'appliedFilters',
    'nextCursor',
    'prevCursor',
    'total'
  ]);
  assert.ok(body.data.length <= 10);
  assert.equal(body.meta.appliedFilters.sort, 'price');
  assert.equal(body.meta.appliedFilters.order, 'asc');
  assert.ok(body.data.every((product) =>
    product.category === 'electronics' &&
    product.stock > 0 &&
    product.price >= 20 &&
    product.price <= 500 &&
    /wireless/i.test(`${product.name} ${product.description}`)
  ));
});

test('rejects unsafe or unsupported query options', async () => {
  const invalidSort = await getProducts('?sort=price%3BDROP%20TABLE%20products');
  assert.equal(invalidSort.response.status, 400);

  const injectionSearch = await getProducts('?search=%27%20OR%201%3D1%20--');
  assert.equal(injectionSearch.response.status, 200);
  assert.ok(injectionSearch.body.meta.total < 600);
});

test('sorts deterministically and paginates forward and backward', async () => {
  const query = '?sort=rating&order=desc&limit=17';
  const first = await getProducts(query);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.length, 17);

  const firstKeys = first.body.data.map((product) => `${product.rating}:${product.id}`);
  const second = await getProducts(`${query}&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.data.length, 17);

  const secondKeys = second.body.data.map((product) => `${product.rating}:${product.id}`);
  assert.equal(new Set([...firstKeys, ...secondKeys]).size, 34);
  for (let index = 1; index < second.body.data.length; index += 1) {
    const previous = second.body.data[index - 1];
    const current = second.body.data[index];
    assert.ok(
      previous.rating > current.rating ||
      (previous.rating === current.rating && previous.id > current.id)
    );
  }

  const previous = await getProducts(
    `${query}&cursor=${encodeURIComponent(second.body.meta.prevCursor)}`
  );
  assert.deepEqual(
    previous.body.data.map((product) => product.id),
    first.body.data.map((product) => product.id)
  );
});

test('supports every user-facing sort field in both directions', async () => {
  for (const field of ['name', 'price', 'rating', 'stock', 'created_at']) {
    for (const order of ['asc', 'desc']) {
      const { response, body } = await getProducts(`?sort=${field}&order=${order}&limit=8`);
      assert.equal(response.status, 200, `${field} ${order} should be valid`);
      assert.equal(body.data.length, 8);

      for (let index = 1; index < body.data.length; index += 1) {
        const previous = body.data[index - 1][field];
        const current = body.data[index][field];
        const previousKey = field === 'created_at' ? Date.parse(previous) : previous;
        const currentKey = field === 'created_at' ? Date.parse(current) : current;
        const followsOrder = order === 'asc'
          ? previousKey <= currentKey
          : previousKey >= currentKey;
        assert.ok(followsOrder, `${field} ${order} is not ordered`);
      }
    }
  }
});

test('validates page limits and cursor sort compatibility', async () => {
  const invalidLimit = await getProducts('?limit=101');
  assert.equal(invalidLimit.response.status, 400);

  const first = await getProducts('?sort=price&order=asc&limit=5');
  const incompatible = await getProducts(
    `?sort=rating&order=asc&limit=5&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`
  );
  assert.equal(incompatible.response.status, 400);
});
