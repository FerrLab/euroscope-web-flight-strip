import { describe, it, expect } from 'vitest';
import { baseApi } from './baseApi';

describe('baseApi', () => {
  it('uses /api/proxy/api as the base URL (Decision #6 — Next.js proxy)', () => {
    expect(baseApi.reducerPath).toBe('api');
  });
});
