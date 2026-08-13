import { Router, type IRouter } from 'express';
import { productsController } from './products.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate, validateQuery, validateParams } from '../../shared/middlewares/validate';
import {
  listCategoriesSchema,
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  listProductsSchema,
  createProductSchema,
  updateProductSchema,
  setPromotionSchema,
  productIdParamSchema,
} from './products.schema';
import { upload, memoryUpload } from '../../shared/middlewares/upload';

// ---- Categories routes ----
const categoriesRouter: IRouter = Router();

categoriesRouter.use(authGuard);

categoriesRouter.get(
  '/',
  roleGuard('admin', 'manager', 'operator'),
  validateQuery(listCategoriesSchema),
  productsController.listCategories.bind(productsController)
);

categoriesRouter.get(
  '/:id',
  roleGuard('admin', 'manager', 'operator'),
  validateParams(categoryIdParamSchema),
  productsController.getCategoryById.bind(productsController)
);

categoriesRouter.post(
  '/',
  roleGuard('admin', 'manager'),
  validate(createCategorySchema),
  productsController.createCategory.bind(productsController)
);

categoriesRouter.put(
  '/:id',
  roleGuard('admin', 'manager'),
  validateParams(categoryIdParamSchema),
  validate(updateCategorySchema),
  productsController.updateCategory.bind(productsController)
);

categoriesRouter.delete(
  '/:id',
  roleGuard('admin', 'manager'),
  validateParams(categoryIdParamSchema),
  productsController.deleteCategory.bind(productsController)
);

// ---- Products routes ----
const productsRouter: IRouter = Router();

productsRouter.use(authGuard);

productsRouter.get(
  '/',
  roleGuard('admin', 'manager', 'operator'),
  validateQuery(listProductsSchema),
  productsController.listProducts.bind(productsController)
);

productsRouter.get(
  '/:id',
  roleGuard('admin', 'manager', 'operator'),
  validateParams(productIdParamSchema),
  productsController.getProductById.bind(productsController)
);

productsRouter.post(
  '/',
  roleGuard('admin', 'manager'),
  validate(createProductSchema),
  productsController.createProduct.bind(productsController)
);

productsRouter.put(
  '/:id',
  roleGuard('admin', 'manager'),
  validateParams(productIdParamSchema),
  validate(updateProductSchema),
  productsController.updateProduct.bind(productsController)
);

productsRouter.post(
  '/:id/promotion',
  roleGuard('admin', 'manager'),
  validateParams(productIdParamSchema),
  validate(setPromotionSchema),
  productsController.setPromotion.bind(productsController)
);

productsRouter.delete(
  '/:id/promotion',
  roleGuard('admin', 'manager'),
  validateParams(productIdParamSchema),
  productsController.removePromotion.bind(productsController)
);

productsRouter.delete(
  '/:id',
  roleGuard('admin', 'manager'),
  validateParams(productIdParamSchema),
  productsController.deleteProduct.bind(productsController)
);

productsRouter.post(
  '/:id/image',
  roleGuard('admin', 'manager'),
  validateParams(productIdParamSchema),
  memoryUpload.single('image'),
  productsController.uploadImage.bind(productsController)
);


export { categoriesRouter as categoriesRoutes, productsRouter as productsRoutes };
