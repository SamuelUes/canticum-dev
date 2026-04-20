import { z } from 'zod';

export const subscriptionStatusSchema = z.object({
  platform: z.enum(['android', 'ios', 'web']).optional(),
  plan: z.string(),
  status: z.enum(['active', 'inactive', 'expired'])
});
