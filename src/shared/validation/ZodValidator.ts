import { z } from 'zod';
import { ValidationException } from '../errors/Exceptions';

export class ZodValidator {
  static validate<T>(schema: z.ZodSchema<T>, data: any): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }));
      throw new ValidationException('Validation failed', errors);
    }
    return result.data;
  }
}
