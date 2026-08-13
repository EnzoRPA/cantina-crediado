import { Request, Response, NextFunction } from 'express';
import { categoriesService, productsService } from './products.service';
import { logger } from '../../shared/utils/logger';

export class ProductsController {
  // ---- Categories ----

  /** GET /api/categories */
  async listCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await categoriesService.list(req.user!.schoolId, req.query as any);
      res.json({ success: true, data: { categories } });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/categories/:id */
  async getCategoryById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = await categoriesService.getById(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: { category } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/categories */
  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = await categoriesService.create(req.user!.schoolId, req.body);
      res.status(201).json({ success: true, data: { category } });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/categories/:id */
  async updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = await categoriesService.update(req.user!.schoolId, req.params.id, req.body);
      res.json({ success: true, data: { category } });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/categories/:id */
  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await categoriesService.delete(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: { message: 'Categoria excluída com sucesso' } });
    } catch (error) {
      next(error);
    }
  }

  // ---- Products ----

  /** GET /api/products */
  async listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await productsService.list(req.user!.schoolId, req.query as any);
      console.log('📡 [API] Enviando produtos:', result.data.length, 'itens');
      if (result.data.length > 0) {
        console.log('📡 [API] Primeiro produto ID:', result.data[0].id);
      }
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/products/:id */
  async getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productsService.getById(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: { product } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/products */
  async createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productsService.create(req.user!.schoolId, req.body);
      res.status(201).json({ success: true, data: { product } });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/products/:id */
  async updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productsService.update(req.user!.schoolId, req.params.id, req.body);
      res.json({ success: true, data: { product } });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/products/:id */
  async deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await productsService.delete(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: { message: 'Produto excluído com sucesso' } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/products/:id/promotion */
  async setPromotion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productsService.setPromotion(req.user!.schoolId, req.params.id, req.body);
      res.json({ success: true, data: { product } });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/products/:id/promotion */
  async removePromotion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productsService.removePromotion(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: { product } });
    } catch (error) {
      next(error);
    }
  }
  /** POST /api/products/:id/image */
  async uploadImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.info({ productId: req.params.id }, 'Uploading product image (base64)');

      if (!req.file) {
        res.status(400).json({ success: false, error: { message: 'Nenhuma imagem enviada' } });
        return;
      }

      // Convert buffer directly to base64 Data URL — survives ephemeral filesystem
      const mime = req.file.mimetype;
      const base64 = req.file.buffer.toString('base64');
      const imageUrl = `data:${mime};base64,${base64}`;

      const product = await productsService.update(req.user!.schoolId, req.params.id, { imageUrl });

      res.json({ success: true, data: { product, imageUrl } });
    } catch (error) {
      next(error);
    }
  }
}

export const productsController = new ProductsController();
