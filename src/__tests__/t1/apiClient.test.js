import { describe, it, expect } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../mocks/server.js';
import { API_BASE } from '../../api/config.js';
import { request, ApiError } from '../../api/client.js';
import { getTransaction } from '../../api/transactions.js';

describe('T-1 api/client.js error normalization', () => {
  it('maps a fetch-level failure to ApiError(status:0, code:NETWORK_ERROR)', async () => {
    server.use(http.get(`${API_BASE}/health`, () => HttpResponse.error()));
    await expect(request('/health')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('maps a timed-out request to ApiError(status:0, code:TIMEOUT)', async () => {
    server.use(http.get(`${API_BASE}/health`, async () => {
      await delay(100);
      return HttpResponse.json({ status: 'ok' });
    }));
    const err = await request('/health', { timeoutMs: 10 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe('TIMEOUT');
    expect(err.isNetwork).toBe(true);
  });

  it('maps a 404 error body to ApiError with matching status/code/message', async () => {
    const err = await getTransaction('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });
});
