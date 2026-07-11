import { describe, it, expect } from 'vitest';
import { pingApi } from './api';

describe('pingApi', () => {
  it('exposes listPings + recordPing endpoints (happy)', () => {
    expect(pingApi.endpoints.listPings).toBeDefined();
    expect(pingApi.endpoints.recordPing).toBeDefined();
  });
});
