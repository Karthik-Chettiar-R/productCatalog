const app = require('./app');

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`Product Catalog API listening on http://localhost:${port}`);
});
