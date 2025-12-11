import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

/**
 * Middleware factory for validating request data with Zod schemas
 */
export function validate(schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

// Common validation schemas
export const schemas = {
  id: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),

  videoId: z.object({
    videoId: z.string().length(11),
  }),

  pagination: z.object({
    limit: z.string().optional().transform((val) =>
      val ? Math.min(parseInt(val), 100) : 20
    ),
    offset: z.string().optional().transform((val) =>
      val ? parseInt(val) : 0
    ),
  }),

  searchQuery: z.object({
    q: z.string().min(1).max(200),
  }),
};
