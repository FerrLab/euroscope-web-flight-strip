import { describe, it, expect } from 'vitest';
import { recordPingSchema } from './schema';

describe('recordPingSchema', () => {
  it('accepts a valid en+pt note (happy)', () => {
    const r = recordPingSchema.safeParse({ note: { en: 'hi', pt: 'olá' } });
    expect(r.success).toBe(true);
  });

  it('accepts en-only note (happy)', () => {
    const r = recordPingSchema.safeParse({ note: { en: 'hi' } });
    expect(r.success).toBe(true);
  });

  it('rejects empty note (invalid)', () => {
    const r = recordPingSchema.safeParse({ note: {} });
    expect(r.success).toBe(false);
  });

  it('rejects non-string values (garbage)', () => {
    const r = recordPingSchema.safeParse({ note: { en: 123 } });
    expect(r.success).toBe(false);
  });

  it('rejects empty strings (invalid)', () => {
    const r = recordPingSchema.safeParse({ note: { en: '' } });
    expect(r.success).toBe(false);
  });
});
