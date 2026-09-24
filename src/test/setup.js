import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server.js';
import { store } from '../mocks/store.js';

if (!globalThis.crypto?.randomUUID) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => store.reset({ autoProgress: false }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
