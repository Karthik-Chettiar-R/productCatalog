# Product Catalog Codebase Explanation

## 1. What this project is

This is a small product catalog application built with:

- Node.js for the runtime
- Express for HTTP routing and static-file serving
- PostgreSQL for persistent product data
- `pg` for PostgreSQL access
- `@faker-js/faker` for development seed data
- Plain HTML, CSS, and JavaScript for the browser UI

The application intentionally does not use React or another frontend framework. The frontend calls one REST endpoint, `GET /api/products`, and the URL stores the current search/filter/sort/pagination state.

The main design goals are:

1. Keep database, API, and browser responsibilities separate.
2. Use parameterized SQL for user-provided values.
3. Whitelist SQL identifiers such as sortable columns.
4. Use cursor pagination instead of offset pagination.
5. Make the browser view shareable and refreshable by storing its state in the query string.
6. Keep the API and frontend on the same origin so no CORS configuration is needed.

---

## 2. Directory structure

```text
iris/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── scripts/
│   └── seed.js
├── sql/
│   └── schema.sql
├── src/
│   ├── app.js
│   ├── db.js
│   ├── server.js
│   └── products/
│       ├── cursor.js
│       ├── query.js
│       ├── repository.js
│       └── route.js
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── CODEBASE_EXPLANATION.md
```

## 3. What each file does

### `package.json`

Defines project metadata, dependencies, and commands:

```powershell
npm run seed
npm run seed:reset
npm start
```

Dependencies:

- `express`: HTTP server and routing
- `pg`: PostgreSQL connection pool and queries
- `dotenv`: loading local configuration from `.env`
- `@faker-js/faker`: generating development products

`package-lock.json` pins the installed dependency tree so another installation is reproducible.

### `.env`

Contains local PostgreSQL credentials. It is intentionally ignored by Git and must not be committed.

Typical configuration:

```text
PGHOST=localhost
PGPORT=5432
PGDATABASE=productdb
PGUSER=postgres
PGPASSWORD=your_password
```

The current connection module also supports the existing lowercase keys in the local `.env`:

```text
database_name
username
password
```

### `.env.example`

Documents the required environment variables without containing real credentials.

### `.gitignore`

Protects local-only files:

```text
node_modules/
.env
npm-debug.log*
```

### `README.md`

Provides quick-start instructions for PostgreSQL, installation, seeding, starting the server, API usage, and verification.

### `CODEBASE_EXPLANATION.md`

This file. It explains the architecture and the reasoning behind the implementation in detail.

---

## 4. Database layer

### `sql/schema.sql`

The schema creates the `products` table:

```sql
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  rating NUMERIC(2, 1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

The fields represent the data displayed in the catalog:

| Column | Meaning |
|---|---|
| `id` | Stable unique identifier |
| `name` | Product name |
| `description` | Searchable product description |
| `category` | One of the seeded product categories |
| `price` | Non-negative monetary value |
| `stock` | Non-negative inventory quantity |
| `rating` | Rating between 0 and 5 |
| `created_at` | Timestamp used for date sorting |

### Why constraints are in the database

Validation in JavaScript improves API feedback, but the database is the final authority for stored data. The `CHECK` constraints prevent invalid prices, stock values, and ratings even if data is inserted by another tool.

### Indexes

The schema creates indexes for common filters and sort fields:

```sql
products_category_idx
products_price_idx
products_stock_idx
products_rating_idx
products_created_at_idx
```

It also enables `pg_trgm` and creates GIN trigram indexes for `name` and `description`.

The API must use `ILIKE` because the requirement is case-insensitive substring-style search. Trigram indexes give PostgreSQL an opportunity to optimize these searches, especially as the table grows.

---

## 5. PostgreSQL connection

### `src/db.js`

This module creates one `pg.Pool` and exports it:

```js
const pool = new Pool({
  host,
  port,
  database,
  user,
  password,
  max: 10
});
```

The pool is shared by API requests. A pool is preferable to opening a new PostgreSQL connection for every HTTP request because it reuses a bounded number of connections.

Important settings:

- `max: 10`: prevents unlimited connection growth
- `idleTimeoutMillis`: releases idle connections
- `connectionTimeoutMillis`: fails quickly when PostgreSQL is unavailable

The seed script borrows a client with `pool.connect()`, performs its transaction, releases that client, and finally closes the pool.

---

## 6. Product seeding

### `scripts/seed.js`

The seed script is for local development and evaluation. It inserts 600 records across:

```text
electronics
clothing
books
home
```

Each product gets:

- A varied name
- A description
- A category
- A price between 8 and 1499.99
- Stock between 0 and 250
- A rating between 2.5 and 5.0
- A creation date between January 1, 2023 and the current date

### Batch insertion

The script uses batches of 100:

```text
600 products / 100 products per batch = 6 INSERT statements
```

This is more efficient than sending 600 separate database requests.

The batch SQL is generated with placeholders:

```sql
INSERT INTO products
  (name, description, category, price, stock, rating, created_at)
VALUES
  ($1, $2, $3, $4, $5, $6, $7),
  ...
```

The product values are passed separately to `client.query()`. They are not interpolated into SQL.

### Transaction and duplicate protection

Seeding uses:

```sql
BEGIN
...
COMMIT
```

If an error occurs, it executes `ROLLBACK`.

Before inserting, the script checks whether the table already contains records. Normal seeding refuses to append a second dataset:

```powershell
npm run seed
```

To intentionally replace the dataset:

```powershell
npm run seed:reset
```

Reset performs:

```sql
TRUNCATE TABLE products RESTART IDENTITY
```

and then inserts a fresh 600 records.

An advisory transaction lock prevents two seed processes from modifying the dataset at the same time.

---

## 7. Express application startup

### `src/server.js`

This is the process entry point:

```js
const app = require('./app');
const port = Number(process.env.PORT || 3000);
app.listen(port, ...);
```

The `PORT` environment variable can override the default port:

```powershell
$env:PORT=4000
npm start
```

### `src/app.js`

This builds the Express app:

```js
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '..', 'public')));
app.use('/api/products', createProductsRouter(pool));
```

The order matters:

1. Express parses JSON request bodies.
2. Static files under `public/` are served.
3. Product API routes are mounted.
4. Unknown routes receive a JSON 404 response.

The frontend and API share the same origin:

```text
http://localhost:3000/
http://localhost:3000/api/products
```

That avoids a separate CORS setup.

---

## 8. API architecture

The product endpoint is deliberately split into three responsibilities:

```text
route.js       HTTP request/response handling
query.js       validation and normalization
repository.js  SQL construction and database access
cursor.js      cursor encoding and validation
```

This is preferable to placing validation, SQL, and response formatting in one large route handler.

---

## 9. API endpoint

### `GET /api/products`

This is the only application API endpoint currently implemented.

Basic request:

```http
GET /api/products
```

The default behavior is equivalent to:

```text
sort=created_at
order=desc
limit=20
```

### Supported query parameters

| Parameter | Meaning | Valid values/default |
|---|---|---|
| `search` | Searches name and description | 1-200 characters |
| `category` | Category filter | `electronics`, `clothing`, `books`, `home` |
| `priceMin` | Minimum price | Non-negative number |
| `priceMax` | Maximum price | Non-negative number |
| `inStock` | Stock filter | `true` or `false` |
| `sort` | Sort column | `name`, `price`, `rating`, `stock`, `created_at` for the main UI |
| `order` | Sort direction | `asc` or `desc` |
| `limit` | Page size | Default 20, API maximum 100 |
| `cursor` | Cursor page position | Opaque API-generated value |

The backend also accepts `id`, `category`, and the alias `createdAt` in its sortable-field whitelist. The frontend exposes the fields requested for the catalog UI and maps Created Date to the exact API value `created_at`.

---

## 10. Query validation

### `src/products/query.js`

The validator first rejects unknown or repeated parameters. This prevents accidental typos from silently changing behavior.

For example:

```http
GET /api/products?limt=50
```

returns:

```http
400 Bad Request
```

```json
{
  "error": "Unknown query parameter: limt."
}
```

The validator also checks:

- Empty or overlong searches
- Unsupported categories
- Negative prices
- `priceMin > priceMax`
- Invalid stock values
- Unsupported sort fields
- Invalid order values
- Limits outside the allowed range

### Why sortable fields are whitelisted

Normal values can be safely passed as PostgreSQL parameters:

```sql
WHERE category = $1
```

SQL identifiers such as a column name cannot be passed as `$1`. Therefore, this is unsafe:

```js
`ORDER BY ${request.query.sort}`
```

Instead, the backend maps known public names to known SQL identifiers:

```js
const SORTABLE_FIELDS = {
  name: 'name',
  price: 'price',
  rating: 'rating',
  stock: 'stock',
  created_at: 'created_at'
};
```

Only a value present in this map can reach the `ORDER BY` clause.

---

## 11. SQL construction and parameterization

### `src/products/repository.js`

`buildWhere()` creates:

1. A SQL `WHERE` clause
2. An array of parameter values

For example, this request:

```text
GET /api/products?search=wireless&category=electronics&priceMin=20
```

produces logic equivalent to:

```sql
WHERE
  (name ILIKE $1 OR description ILIKE $1)
  AND category = $2
  AND price >= $3
```

with values:

```text
%wireless%
electronics
20
```

The user values never become SQL source text.

The static SQL fragments are controlled by application code. The dynamic values are parameterized.

---

## 12. Complete API examples

### Request 1: default page

```http
GET /api/products
```

Equivalent API behavior:

```text
sort=created_at
order=desc
limit=20
```

### Request 2: text search

```http
GET /api/products?search=wireless
```

Searches:

```sql
name ILIKE '%wireless%'
OR description ILIKE '%wireless%'
```

### Request 3: category and price filters

```http
GET /api/products?category=electronics&priceMin=50&priceMax=500
```

### Request 4: only products with inventory

```http
GET /api/products?inStock=true
```

SQL condition:

```sql
stock > 0
```

### Request 5: descending price sort

```http
GET /api/products?sort=price&order=desc&limit=10
```

SQL ordering:

```sql
ORDER BY price DESC, id DESC
```

### Request 6: all filters together

```http
GET /api/products?search=wireless&category=electronics&priceMin=20&priceMax=500&inStock=true&sort=price&order=desc&limit=10
```

This is the kind of request generated by the frontend when all of those controls are active.

---

## 13. API response format

Every successful response has this shape:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "nextCursor": null,
    "prevCursor": null,
    "appliedFilters": {}
  }
}
```

Example:

```json
{
  "data": [
    {
      "id": 100,
      "name": "Small Wireless Headphones",
      "description": "A product description...",
      "category": "electronics",
      "price": 21.33,
      "stock": 207,
      "rating": 4.7,
      "created_at": "2023-04-12T08:33:32.207Z"
    }
  ],
  "meta": {
    "total": 11,
    "nextCursor": "eyJ2Ijox...",
    "prevCursor": null,
    "appliedFilters": {
      "search": "wireless",
      "category": "electronics",
      "priceMin": 20,
      "priceMax": 500,
      "inStock": true,
      "sort": "price",
      "order": "desc",
      "limit": 10
    }
  }
}
```

### `data`

Contains only the current page of products.

### `meta.total`

The total number of rows matching the filters before pagination.

If:

```json
"total": 600
```

and:

```json
"limit": 20
```

then 600 rows match, but only 20 are in the current `data` array.

### `meta.nextCursor`

Present when another page exists. It is `null` on the final page.

### `meta.prevCursor`

Present when the current page can move backward. It is `null` on the first page.

### `meta.appliedFilters`

Echoes the normalized options used by the backend. This makes the response self-describing and useful for debugging.

---

## 14. Why the API runs two database queries

The repository first runs:

```sql
SELECT COUNT(*)::int AS total
FROM products
WHERE <filters>;
```

This count intentionally does not include the cursor condition. It answers:

> How many products match the current filters in total?

Then it fetches the current page:

```sql
SELECT id, name, description, category, price, stock, rating, created_at
FROM products
WHERE <filters and cursor boundary>
ORDER BY <whitelisted column> <direction>, id <direction>
LIMIT <requested limit + 1>;
```

The extra row is used to detect whether another page exists. It is removed before the response is returned.

This is why the response can contain both:

```json
"total": 600
```

and only:

```json
"data": [20 products]
```

---

## 15. Cursor pagination

### Why cursor pagination is used

Offset pagination would look like:

```sql
LIMIT 20 OFFSET 100
```

Offset pagination becomes less efficient for deep pages and can become unstable when rows are inserted or deleted between requests.

This project uses a cursor based on the current sort position.

### `src/products/cursor.js`

The cursor contains:

```json
{
  "v": 1,
  "field": "price",
  "order": "desc",
  "value": "1055.94",
  "id": 523,
  "boundary": "after"
}
```

It is serialized as JSON and encoded as base64url. The frontend treats it as opaque.

### Unique tie-breaking

Sorting only by price is not enough because several products may have the same price. The API always adds `id`:

```sql
ORDER BY price DESC, id DESC
```

For a descending next-page request, the boundary becomes conceptually:

```sql
WHERE
  price < $1
  OR (price = $1 AND id < $2)
```

For ascending order:

```sql
WHERE
  price > $1
  OR (price = $1 AND id > $2)
```

This prevents skipped or duplicated rows when sort values are equal.

### Previous-page requests

For a previous cursor, the repository:

1. Reverses the comparison operator.
2. Reverses the SQL `ORDER BY`.
3. Fetches the previous rows.
4. Reverses the result array before returning it.

The user still sees the same logical ordering in the table.

### Cursor validation

A cursor is only valid for the same sort field and order that created it. For example, a price-descending cursor cannot be reused with rating-ascending sorting.

Invalid cursors return:

```http
400 Bad Request
```

```json
{
  "error": "Cursor is not valid base64url JSON."
}
```

or:

```json
{
  "error": "Cursor does not match the requested sort or contains invalid data."
}
```

---

## 16. Route handling

### `src/products/route.js`

The route handler coordinates the request:

1. Reads `request.query`.
2. Calls `parseQuery()`.
3. Passes normalized filters to `findProducts()`.
4. Formats the required response.
5. Converts validation errors to HTTP 400.
6. Logs unexpected database errors and returns HTTP 500 without leaking database details.

Validation error:

```json
{
  "error": "limit must be between 1 and 100."
}
```

Unexpected failure:

```json
{
  "error": "Unable to retrieve products."
}
```

---

## 17. Frontend structure

### `public/index.html`

Defines the semantic UI:

- Page heading
- Search input
- In-stock checkbox
- Category dropdown
- Minimum and maximum price inputs
- Sort-by dropdown
- Ascending/Descending dropdown
- Clear filters button
- Product table
- Loading, empty, and error message containers
- Previous and Next buttons
- Products-per-page dropdown

The current layout is:

```text
Top filter row:
  Search | In stock only

Second filter row:
  Category | Minimum price | Maximum price | Sort by | Order | Clear filters

Results table

Bottom navigation row:
  Previous | Page number | Next                  Products per page
```

The table headers are also clickable sort controls. The visible dropdowns are the primary sorting controls, while the headers provide a convenient secondary interaction.

### `public/styles.css`

Provides:

- Responsive layout
- Desktop grid rows
- Mobile stacking
- Table overflow on narrow screens
- Button and form styling
- Sort direction indicators
- Loading, empty, and error message styles

The CSS uses no framework. The design is based on CSS grid, flexbox, custom properties, and media queries.

### `public/app.js`

Owns browser state and API interaction.

Important state:

```js
{
  sort: 'created_at',
  order: 'desc',
  limit: 20,
  nextCursor: null,
  prevCursor: null,
  currentCursor: null,
  page: 1
}
```

It also tracks:

- An active `AbortController`
- The last requested URL
- A debounce timer for text search

---

## 18. Frontend URL state

The browser URL stores:

```text
search
category
priceMin
priceMax
inStock
sort
order
limit
cursor
```

Example:

```text
http://localhost:3000/?search=wireless&category=electronics&priceMin=20&priceMax=500&inStock=true&sort=price&order=desc&limit=10
```

### Initial page load

`readUrlState()` reads `window.location.search` and restores all controls.

For example:

```text
?category=books&sort=name&order=asc&limit=50
```

restores:

- Books selected
- Name sorting selected
- Ascending selected
- Page size 50 selected

Then `loadProducts()` requests the same state from the API.

### Filter or sort changes

When a filter, search, page size, or sort option changes:

1. The cursor is cleared.
2. The page number is reset to 1.
3. The URL is updated with `history.pushState()`.
4. The API is requested again.

The other active controls are preserved.

For example:

```text
Before:
/?search=wireless&sort=created_at&order=desc&limit=20&cursor=...

After selecting price descending:
/?search=wireless&sort=price&order=desc&limit=20
```

The cursor is removed because changing sorting changes the meaning of the old cursor.

### Next and Previous

The frontend receives cursors from the API. It never computes offsets.

Next:

```text
current URL + cursor=meta.nextCursor
```

Previous:

```text
current URL + cursor=meta.prevCursor
```

The URL is updated first, then `loadProducts()` uses the URL to construct the API request.

### Browser Back and Forward

The frontend listens for:

```js
window.addEventListener('popstate', ...)
```

When the browser navigates through history:

1. The URL is reread.
2. Controls are restored.
3. Sort indicators are restored.
4. The cursor is restored.
5. The corresponding API request is made.

This makes refresh and browser navigation preserve the current catalog view.

### Avoiding unnecessary requests

`loadProducts()` builds the API URL from the current browser URL. If it is identical to the previous request and no request is active, it returns early.

If a new request starts while another is running, the previous request is aborted with `AbortController`. This is especially useful while typing in the search field.

Search input is debounced for 250 milliseconds so the API is not called for every individual keystroke.

---

## 19. Frontend API request construction

The frontend uses the same query-string values for the browser URL and API request.

Example browser URL:

```text
/?search=wireless&category=electronics&sort=price&order=desc&limit=10
```

API request:

```http
GET /api/products?search=wireless&category=electronics&sort=price&order=desc&limit=10
```

When a cursor is present:

```http
GET /api/products?search=wireless&category=electronics&sort=price&order=desc&limit=10&cursor=eyJ2Ijox...
```

The frontend does not manually rebuild SQL or interpret the cursor.

---

## 20. Frontend response handling

After `fetch()` returns:

1. Non-2xx responses become visible errors.
2. `data` is rendered into table rows.
3. `meta.total` is shown as the matching product count.
4. `meta.nextCursor` controls the Next button.
5. `meta.prevCursor` controls the Previous button.
6. The table is hidden for an empty result.

Product values are inserted with `textContent`, not `innerHTML`. This means product names and descriptions cannot become executable HTML through the rendering code.

The table displays:

```text
Name
Category
Price
Stock
Rating
Created
```

Descriptions are searchable through the API but are not displayed as a table column to keep the table compact.

---

## 21. Error and empty states

### Loading

While a request is active:

```text
Loading products...
```

The old table is hidden so the user does not mistake stale results for the new request.

### Empty result

If `data` is empty:

```text
No products match your filters.
```

### API error

The frontend displays the API's safe error message. Database implementation details are intentionally not sent to the browser.

---

## 22. End-to-end request lifecycle

For this request:

```text
GET /api/products?search=wireless&category=electronics&priceMin=20&priceMax=500&inStock=true&sort=price&order=desc&limit=10
```

the lifecycle is:

1. The browser constructs the URL from the controls.
2. Express receives the request.
3. `route.js` calls `parseQuery()`.
4. `query.js` validates and normalizes the values.
5. `repository.js` builds parameterized filters:
   - `name/description ILIKE`
   - category equality
   - price lower bound
   - price upper bound
   - `stock > 0`
6. The repository counts all matching rows.
7. The repository fetches up to 11 rows for a requested limit of 10.
8. The extra row determines whether `nextCursor` is needed.
9. Products are mapped into JSON-safe response values.
10. Express sends `data` and `meta`.
11. The frontend renders the rows and enables/disables pagination.

---

## 23. Running the project

### Prerequisites

- Node.js 18 or newer
- PostgreSQL running locally

### Create the database

From `psql` or pgAdmin:

```sql
CREATE DATABASE productdb;
```

### Configure credentials

Copy `.env.example` to `.env` and update the password:

```powershell
Copy-Item .env.example .env
```

### Install

```powershell
npm install
```

### Seed

```powershell
npm run seed
```

Verify:

```sql
SELECT COUNT(*) FROM products;
```

Expected:

```text
600
```

### Start

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

### Reset and reseed

Only when the existing data may be discarded:

```powershell
npm run seed:reset
```

---

## 24. Useful API tests

Basic:

```powershell
curl.exe "http://localhost:3000/api/products"
```

Search:

```powershell
curl.exe "http://localhost:3000/api/products?search=wireless"
```

Combined filters:

```powershell
curl.exe "http://localhost:3000/api/products?search=wireless&category=electronics&priceMin=20&priceMax=500&inStock=true&sort=price&order=desc&limit=10"
```

Ascending rating:

```powershell
curl.exe "http://localhost:3000/api/products?sort=rating&order=asc&limit=10"
```

Maximum page size:

```powershell
curl.exe "http://localhost:3000/api/products?sort=created_at&order=desc&limit=100"
```

Invalid parameter:

```powershell
curl.exe "http://localhost:3000/api/products?limit=101"
```

Expected response status:

```text
400
```

Cursor testing requires copying `meta.nextCursor` from one response into the next request:

```powershell
curl.exe "http://localhost:3000/api/products?sort=price&order=desc&limit=10&cursor=PASTE_CURSOR_HERE"
```

---

## 25. Important implementation decisions

### Why the API has a repository layer

The route should handle HTTP concerns, not SQL construction. Keeping SQL in `repository.js` makes the query behavior easier to inspect and test.

### Why validation happens before the database call

Invalid input should produce a predictable 400 response instead of a database error. It also ensures only known sort identifiers reach SQL.

### Why cursors include the sort field and order

A cursor is meaningful only in the ordering that produced it. Including those values allows the backend to reject incompatible cursor reuse instead of returning incorrect data.

### Why `id` is a tie-breaker

Prices, ratings, stock quantities, names, and dates are not guaranteed to be unique. A stable unique ID makes the ordering total and makes cursor boundaries deterministic.

### Why the frontend stores state in the URL

It gives the user:

- Refresh persistence
- Shareable filtered views
- Browser Back/Forward support
- A clear relationship between visible controls and API requests

### Why the frontend uses same-origin requests

Serving static files and API routes from Express keeps deployment simple and avoids cross-origin configuration for this challenge.

---

## 26. Current scope and intentional omissions

Implemented:

- Database setup
- Product seeding
- Product listing API
- Search
- Category filter
- Price filters
- Stock filter
- Sorting
- Cursor pagination
- Configurable page size
- URL synchronization
- Responsive catalog frontend

Not implemented:

- Product creation
- Product editing
- Product deletion
- Authentication
- User accounts
- Shopping cart
- Checkout
- Product detail pages
- React or another frontend framework

