import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// JSDOM polyfills for Radix UI primitives (Select, Dialog, etc.)
// JSDOM doesn't implement Pointer Events or scrollIntoView; Radix listens for them.
if (typeof window !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// Patch Request to resolve relative URLs against jsdom's origin so that
// RTK Query's fetchBaseQuery (which constructs `new Request(url)` internally)
// works with relative `baseUrl`s like `/api/proxy/api`. Node's undici Request
// rejects relative URLs; the browser does not.
const OriginalRequest = globalThis.Request;
class PatchedRequest extends OriginalRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string' && input.startsWith('/')) {
      super(new URL(input, 'http://localhost').toString(), init);
      return;
    }
    super(input, init);
  }
}
globalThis.Request = PatchedRequest as unknown as typeof Request;

afterEach(() => {
  cleanup();
});
