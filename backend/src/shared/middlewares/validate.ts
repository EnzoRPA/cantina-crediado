import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Creates a middleware that validates the request body against a Zod schema.
 * On success, replaces req.body with the parsed (and potentially transformed) data.
 * On failure, throws ZodError which is caught by errorHandler.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Let the error handler format ZodError
      next(result.error);
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Validates query parameters.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      next(result.error);
      return;
    }

    req.query = result.data;
    next();
  };
}

/**
 * Validates route params.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      next(result.error);
      return;
    }

    req.params = result.data;
    next();
  };
}
