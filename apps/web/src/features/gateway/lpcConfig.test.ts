import { describe, it, expect } from 'vitest';
import { lpcConfigLine } from './lpcConfig';

function fromBase64Url(encoded: string): string {
  const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
  return atob(padded.replaceAll('-', '+').replaceAll('_', '/'));
}

describe('lpcConfigLine', () => {
  it('packs the gateway base URL and token into one base64url blob', () => {
    const line = lpcConfigLine('token-123');
    const [, encoded] = line.split('.lpc gateway config ');

    expect(fromBase64Url(encoded)).toMatch(/:token-123$/);
  });

  it('emits only base64url-safe characters EuroScope will accept', () => {
    // `ÿ` repeated forces a byte pattern that standard base64 always
    // renders as `/` (verified: btoa of a run of 0xFF bytes always hits the
    // alphabet's index-63 character). This reproduces the exact bug where
    // plain btoa() output re-introduces the `/` EuroScope's `.lpc` command
    // line rejects — a token like `secret-abc` never exercises this path.
    const slashForcing = 'ÿÿÿ-realistic-jwt-body-1234567890';
    const encoded = lpcConfigLine(slashForcing).split('.lpc gateway config ')[1];

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(encoded)).toMatch(new RegExp(`:${slashForcing}$`));
  });

  it('rejects nothing but still round-trips an empty token', () => {
    expect(fromBase64Url(lpcConfigLine('').split('.lpc gateway config ')[1])).toMatch(/:$/);
  });
});
