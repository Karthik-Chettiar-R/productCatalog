const fs = require('node:fs/promises');
const path = require('node:path');
const { faker } = require('@faker-js/faker');
const pool = require('../src/db');

const PRODUCT_COUNT = 600;
const BATCH_SIZE = 100;
const categories = ['electronics', 'clothing', 'books', 'home'];

const categoryDetails = {
  electronics: {
    names: ['Wireless Headphones', 'Smart Speaker', 'Mechanical Keyboard', 'Portable Charger', '4K Monitor'],
    adjectives: ['compact', 'high-performance', 'lightweight', 'durable', 'next-generation'],
    materials: ['aluminum', 'recycled plastic', 'tempered glass', 'premium polymer']
  },
  clothing: {
    names: ['Everyday Hoodie', 'Relaxed Denim Jacket', 'Trail Running Shorts', 'Merino Wool Sweater', 'Canvas Sneakers'],
    adjectives: ['comfortable', 'breathable', 'versatile', 'easy-care', 'well-fitted'],
    materials: ['organic cotton', 'merino wool', 'recycled polyester', 'soft linen']
  },
  books: {
    names: ['The Atlas of Ideas', 'A Practical Guide to Curiosity', 'Stories from the Coast', 'The Quiet Workshop', 'Patterns of Discovery'],
    adjectives: ['thought-provoking', 'beautifully illustrated', 'accessible', 'engaging', 'carefully researched'],
    materials: ['hardcover', 'paperback', 'large-format paperback', 'clothbound cover']
  },
  home: {
    names: ['Ceramic Serving Set', 'Oak Storage Bench', 'Linen Throw Blanket', 'Adjustable Table Lamp', 'Indoor Herb Planter'],
    adjectives: ['timeless', 'space-saving', 'hand-finished', 'functional', 'easy-to-style'],
    materials: ['stoneware', 'solid oak', 'natural linen', 'powder-coated steel']
  }
};

function createProduct() {
  const category = faker.helpers.arrayElement(categories);
  const details = categoryDetails[category];
  const baseName = faker.helpers.arrayElement(details.names);
  const adjective = faker.helpers.arrayElement(details.adjectives);
  const material = faker.helpers.arrayElement(details.materials);

  return {
    name: `${faker.commerce.productAdjective()} ${baseName}`,
    description: `${faker.commerce.productDescription()} This ${adjective} ${category} item features a ${material} finish and is designed for dependable everyday use.`,
    category,
    price: faker.number.float({ min: 8, max: 1499, fractionDigits: 2 }).toFixed(2),
    stock: faker.number.int({ min: 0, max: 250 }),
    rating: faker.number.float({ min: 2.5, max: 5, fractionDigits: 1 }).toFixed(1),
    createdAt: faker.date.between({
      from: new Date('2023-01-01T00:00:00.000Z'),
      to: new Date()
    })
  };
}

async function ensureSchema(client) {
  const schema = await fs.readFile(path.resolve(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  await client.query(schema);
}

async function insertBatch(client, products) {
  const values = [];
  const placeholders = products.map((product, index) => {
    const offset = index * 7;
    values.push(
      product.name,
      product.description,
      product.category,
      product.price,
      product.stock,
      product.rating,
      product.createdAt
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });

  await client.query(
    `INSERT INTO products (name, description, category, price, stock, rating, created_at)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

async function seed({ reset }) {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [314159265]);
    await client.query('BEGIN');
    await ensureSchema(client);

    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM products');
    const existingCount = rows[0].count;

    if (existingCount > 0 && !reset) {
      throw new Error(
        `Seeding stopped: products already contains ${existingCount} record(s). ` +
        'Use "npm run seed:reset" to intentionally replace the dataset.'
      );
    }

    if (reset) {
      await client.query('TRUNCATE TABLE products RESTART IDENTITY');
    }

    for (let start = 0; start < PRODUCT_COUNT; start += BATCH_SIZE) {
      const batch = Array.from(
        { length: Math.min(BATCH_SIZE, PRODUCT_COUNT - start) },
        createProduct
      );
      await insertBatch(client, batch);
    }

    await client.query('COMMIT');
    console.log(`Seeded ${PRODUCT_COUNT} products across ${categories.length} categories.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const reset = process.argv.includes('--reset');

seed({ reset })
  .catch((error) => {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
