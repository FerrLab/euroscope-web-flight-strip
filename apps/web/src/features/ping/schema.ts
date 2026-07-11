import { z } from 'zod';

export const recordPingSchema = z.object({
  note: z
    .record(z.string().min(1).max(10), z.string().min(1).max(500))
    .refine((m) => Object.keys(m).length > 0, { message: 'note must have at least one locale' }),
});

export type RecordPingPayload = z.infer<typeof recordPingSchema>;
