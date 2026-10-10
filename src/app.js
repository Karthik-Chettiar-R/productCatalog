const express = require('express');
const path = require('node:path');
const pool = require('./db');
const createProductsRouter = require('./products/route');

const app = express();

app.use(express.json());
app.use(express.static(path.resolve(__dirname, '..', 'public')));
app.use('/api/products', createProductsRouter(pool));

app.use((request, response) => {
  response.status(404).json({ error: 'Route not found.' });
});

module.exports = app;
