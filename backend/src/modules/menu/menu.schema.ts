import { z } from 'zod';

export const updateMenuAvailabilitySchema = z.object({
  productIds: z.array(z.string().uuid()).min(1),
  available: z.boolean(),
});

export type UpdateMenuAvailabilityInput = z.infer<typeof updateMenuAvailabilitySchema>;
