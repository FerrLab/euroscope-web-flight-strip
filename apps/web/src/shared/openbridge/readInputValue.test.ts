import { describe, it, expect } from 'vitest';
import { readInputValue } from './readInputValue';

describe('readInputValue', () => {
  it('reads the value off the event currentTarget (happy)', () => {
    const event = { currentTarget: { value: 'FL350' } } as unknown as Event;

    expect(readInputValue(event)).toBe('FL350');
  });

  it('returns an empty string when currentTarget.value is empty (invalid)', () => {
    const event = { currentTarget: { value: '' } } as unknown as Event;

    expect(readInputValue(event)).toBe('');
  });

  it('returns undefined when currentTarget has no value property (garbage)', () => {
    const event = { currentTarget: {} } as unknown as Event;

    expect(readInputValue(event)).toBeUndefined();
  });
});
