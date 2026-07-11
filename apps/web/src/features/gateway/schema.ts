import { z } from 'zod';

export const commandEnvelopeSchema = z.object({
  action: z.string().min(1),
  callsign: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  id: z.union([z.string(), z.number().int()]).optional(),
});

export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

export type ComposerResult =
  | { ok: true; envelope: CommandEnvelope }
  | { ok: false; error: 'invalid-json' | 'invalid-envelope' };

/**
 * Validate raw composer input into a sendable envelope. `type` is stripped —
 * the backend forces `type: "command"` on everything sent from the console.
 */
export function parseComposerInput(raw: string): ComposerResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    delete (parsed as Record<string, unknown>).type;
  }

  const result = commandEnvelopeSchema.safeParse(parsed);
  return result.success
    ? { ok: true, envelope: result.data }
    : { ok: false, error: 'invalid-envelope' };
}
