import { describe, it, expect } from 'vitest';
import { gatewayApi } from './api';

describe('gatewayApi', () => {
  it('exposes the three gateway endpoints (happy)', () => {
    expect(gatewayApi.endpoints.tokenStatus).toBeDefined();
    expect(gatewayApi.endpoints.rotateToken).toBeDefined();
    expect(gatewayApi.endpoints.sendCommand).toBeDefined();
  });
});
