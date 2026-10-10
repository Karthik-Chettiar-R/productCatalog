const express = require('express');
const { parseQuery } = require('./query');
const { findProducts } = require('./repository');

function createProductsRouter(pool) {
  const router = express.Router();

  router.get('/', async (request, response) => {
    try {
      const filters = parseQuery(request.query);
      const result = await findProducts(pool, filters);

      response.json({
        data: result.data,
        meta: {
          total: result.total,
          nextCursor: result.nextCursor,
          prevCursor: result.prevCursor,
          appliedFilters: {
            search: filters.search,
            category: filters.category,
            priceMin: filters.priceMin,
            priceMax: filters.priceMax,
            inStock: filters.inStock,
            sort: filters.field,
            order: filters.order,
            limit: filters.limit
          }
        }
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode === 500) {
        console.error('Product query failed:', error);
      }
      response.status(statusCode).json({
        error: statusCode === 500 ? 'Unable to retrieve products.' : error.message
      });
    }
  });

  return router;
}

module.exports = createProductsRouter;
