const { db } = require('./dist/database/connection');
const productsService = require('./dist/modules/products/products.service').productsService;

(async () => {
  try {
    const schoolId = 'dummy'; // the service doesn't care if it's correct or it just returns empty if wrong. We need the real school_id!
    
    // Let's get the first product's school_id to use
    const firstProduct = await db('products').first('school_id');
    if (!firstProduct) {
      console.log('No products found in DB at all.');
      process.exit(0);
    }
    
    console.log('Using school_id:', firstProduct.school_id);
    const result = await productsService.list(firstProduct.school_id, { limit: 2 });
    console.log(JSON.stringify(result.data, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
