import { describe, it, expect } from 'vitest';
import { parseComposerInput } from './schema';

describe('parseComposerInput', () => {
  it('parses a full command envelope (happy)', () => {
    const result = parseComposerInput(
      '{"action":"set_squawk","callsign":"ABC1234","payload":{"code":"2354"},"id":"req-42"}',
    );
    expect(result).toEqual({
      ok: true,
      envelope: {
        action: 'set_squawk',
        callsign: 'ABC1234',
        payload: { code: '2354' },
        id: 'req-42',
      },
    });
  });

  it('drops a user-provided type field — the server forces it (happy)', () => {
    const result = parseComposerInput('{"type":"event","action":"ping"}');
    expect(result).toEqual({ ok: true, envelope: { action: 'ping' } });
  });

  it('flags invalid JSON (invalid)', () => {
    expect(parseComposerInput('{not json')).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('flags a missing action (invalid)', () => {
    expect(parseComposerInput('{"callsign":"ABC1234"}')).toEqual({
      ok: false,
      error: 'invalid-envelope',
    });
  });

  it('flags non-object roots (garbage)', () => {
    expect(parseComposerInput('42')).toEqual({ ok: false, error: 'invalid-envelope' });
    expect(parseComposerInput('"str"')).toEqual({ ok: false, error: 'invalid-envelope' });
    expect(parseComposerInput('[1,2]')).toEqual({ ok: false, error: 'invalid-envelope' });
  });
});
