import { db } from './src/database/connection';
import { productsService } from './src/modules/products/products.service';

(async () => {
  try {
    const firstProduct = await db('products').first('school_id');
    if (!firstProduct) {
      console.log('No products in DB');
      process.exit(0);
    }
    
    const res = await productsService.list(firstProduct.school_id, { limit: 1 });
    console.dir(res.data, { depth: null });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
