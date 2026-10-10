# Product Catalog

Node.js, Express, PostgreSQL, and plain HTML/CSS/JavaScript product catalog with:

- 600 seeded products
- Search across product name and description
- Category, price, and stock filters
- Whitelisted deterministic sorting
- Cursor-based forward/backward pagination
- URL-synchronized frontend state

## Requirements

- Node.js 18+
- PostgreSQL running locally

## Install

```powershell
npm install
```

Create a PostgreSQL database:

```sql
CREATE DATABASE productdb;
```

Copy [.env.example](./.env.example) to `.env` and set your local credentials:

```powershell
Copy-Item .env.example .env
```

`.env` is ignored by Git. Never commit it.

## Seed the database

```powershell
npm run seed
```

The command creates the schema and inserts 600 products in batches. It refuses to append to a non-empty table. To intentionally replace the dataset:

```powershell
npm run seed:reset
```

Verify:

```sql
SELECT COUNT(*) FROM products;
```

Expected result: `600`.

## Start

```powershell
npm start
```

Open the frontend at:

```text
http://localhost:3000
```

The same server hosts the API and `public/` frontend. No React or CORS setup is required.

## API

### Endpoint

```http
GET /api/products
```

Query parameters:

| Parameter | Values |
|---|---|
| `search` | Case-insensitive `name`/`description` search |
| `category` | `electronics`, `clothing`, `books`, `home` |
| `priceMin`, `priceMax` | Non-negative numbers |
| `inStock` | `true` or `false` |
| `sort` | `id`, `name`, `category`, `price`, `stock`, `rating`, `created_at` |
| `order` | `asc` or `desc` |
| `limit` | 1-100; frontend options are 10, 20, 50, 100 |
| `cursor` | Opaque cursor returned by the API |

Example:

```powershell
curl.exe "http://localhost:3000/api/products?search=wireless&category=electronics&priceMin=20&priceMax=500&inStock=true&sort=price&order=desc&limit=10"
```

Successful responses use:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Product name",
      "description": "Product description",
      "category": "electronics",
      "price": 99.99,
      "stock": 12,
      "rating": 4.5,
      "created_at": "2025-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 600,
    "nextCursor": "opaque-cursor-or-null",
    "prevCursor": null,
    "appliedFilters": {
      "search": null,
      "category": null,
      "priceMin": null,
      "priceMax": null,
      "inStock": null,
      "sort": "created_at",
      "order": "desc",
      "limit": 20
    }
  }
}
```

`total` is counted before pagination. Pass `nextCursor` or `prevCursor` back as `cursor`; do not calculate offsets. Cursors include the sort value and unique ID tie-breaker and are valid only with the same sort field and direction.

Invalid query parameters and cursors return HTTP 400. Database failures return HTTP 500 without exposing database details. User values use PostgreSQL parameters, and sortable SQL identifiers are whitelisted.

## Tests

The API tests use Node's built-in test runner and the configured local database:

```powershell
npm test
```

They cover:

- Required response envelope
- Combined search and filters
- SQL-injection-style search input
- Unsupported sort and page limits
- Deterministic duplicate-value sorting
- Forward cursor pagination
- Backward cursor pagination
- Cursor/sort compatibility

## Frontend behavior

The frontend is in [public/](./public/). It stores `search`, `category`, `priceMin`, `priceMax`, `inStock`, `sort`, `order`, `limit`, and `cursor` in the URL. Refresh and browser Back/Forward restore the view. Changing a filter, sort, or page size clears the cursor and starts at the first page.

## Scope limitations

This project currently supports product listing only. It does not implement authentication, product creation/editing/deletion, product detail pages, cart behavior, or checkout.
