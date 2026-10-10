const { decodeCursor, encodeCursor } = require('./cursor');

function buildWhere(filters, cursor = null) {
  const conditions = [];
  const values = [];
  const add = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.search !== null) {
    const parameter = add(`%${filters.search}%`);
    conditions.push(`(name ILIKE ${parameter} OR description ILIKE ${parameter})`);
  }
  if (filters.category !== null) {
    conditions.push(`category = ${add(filters.category)}`);
  }
  if (filters.priceMin !== null) {
    conditions.push(`price >= ${add(filters.priceMin)}`);
  }
  if (filters.priceMax !== null) {
    conditions.push(`price <= ${add(filters.priceMax)}`);
  }
  if (filters.inStock !== null) {
    conditions.push(filters.inStock ? 'stock > 0' : 'stock = 0');
  }

  if (cursor) {
    const sortValue = add(cursor.value);
    const id = add(cursor.id);
    const isAscending = filters.order === 'asc';
    const isAfter = cursor.boundary === 'after';
    const useGreater = isAscending === isAfter;
    const operator = useGreater ? '>' : '<';
    conditions.push(`(${filters.column} ${operator} ${sortValue} OR (${filters.column} = ${sortValue} AND id ${operator} ${id}))`);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

function orderClause(filters, cursor) {
  const reverseForPrevious = cursor && cursor.boundary === 'before';
  const direction = reverseForPrevious
    ? (filters.order === 'asc' ? 'DESC' : 'ASC')
    : filters.order.toUpperCase();
  return `ORDER BY ${filters.column} ${direction}, id ${direction}`;
}

function mapProduct(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    category: row.category,
    price: Number(row.price),
    stock: row.stock,
    rating: Number(row.rating),
    created_at: row.created_at
  };
}

async function findProducts(pool, filters) {
  const cursor = filters.cursor
    ? decodeCursor(filters.cursor, { field: filters.field, order: filters.order })
    : null;
  const baseWhere = buildWhere(filters);
  const where = buildWhere(filters, cursor);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM products ${baseWhere.clause}`,
    baseWhere.values
  );

  const dataValues = [...where.values, filters.limit + 1];
  const limitParameter = `$${dataValues.length}`;
  const rowsResult = await pool.query(
    `SELECT id, name, description, category, price, stock, rating, created_at
     FROM products
     ${where.clause}
     ${orderClause(filters, cursor)}
     LIMIT ${limitParameter}`,
    dataValues
  );

  const hasMore = rowsResult.rows.length > filters.limit;
  let rows = rowsResult.rows.slice(0, filters.limit).map(mapProduct);
  if (cursor && cursor.boundary === 'before') {
    rows = rows.reverse();
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  const getSortValue = (product) => {
    const value = product[filters.column === 'created_at' ? 'created_at' : filters.column];
    return value instanceof Date ? value.toISOString() : String(value);
  };
  const getCursor = (product, boundary) => product
    ? encodeCursor({
      field: filters.field,
      order: filters.order,
      value: getSortValue(product),
      id: product.id,
      boundary
    })
    : null;

  return {
    data: rows,
    total: countResult.rows[0].total,
    nextCursor: cursor && cursor.boundary === 'before'
      ? getCursor(last, 'after')
      : (hasMore ? getCursor(last, 'after') : null),
    prevCursor: cursor && cursor.boundary === 'before'
      ? (hasMore ? getCursor(first, 'before') : null)
      : (cursor ? getCursor(first, 'before') : null)
  };
}

module.exports = { findProducts };
