import { describe, it, expect } from 'vitest';
import { lastMessageAt } from './lastMessage';
import type { ConsoleMessage } from './slice';

const msg = (id: string): ConsoleMessage => ({ id, direction: 'in', envelope: {} });

describe('lastMessageAt', () => {
  it('reads the epoch prefix of the newest message as a Zulu clock', () => {
    const at = Date.UTC(2026, 8, 3, 11, 18, 52);

    expect(lastMessageAt([msg('1-0'), msg(`${at}-7`)])).toBe('11:18:52');
  });

  it('zero-pads every field', () => {
    const at = Date.UTC(2026, 8, 3, 4, 5, 6);

    expect(lastMessageAt([msg(`${at}-0`)])).toBe('04:05:06');
  });

  it('returns null for an empty feed', () => {
    expect(lastMessageAt([])).toBeNull();
  });

  it('returns null when the id carries no usable epoch', () => {
    expect(lastMessageAt([msg('not-a-time-0')])).toBeNull();
    expect(lastMessageAt([msg('0-0')])).toBeNull();
    expect(lastMessageAt([msg('')])).toBeNull();
  });
});
