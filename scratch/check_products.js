const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'backend', 'dev.sqlite3');
const db = new Database(dbPath);

const products = db.prepare('SELECT id, name, image_url FROM products WHERE image_url IS NOT NULL').all();
console.log(JSON.stringify(products, null, 2));
db.close();
