import { API_BASE } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

function buildUrl(path, query) {
  const url = new URL(API_BASE + path);
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, value);
    }
    const qs = params.toString();
    if (qs) url.search = qs;
  }
  return url.toString();
}

export async function request(path, { method = 'GET', body, query, signal, timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      ctrl.abort();
    } else {
      signal.addEventListener('abort', () => ctrl.abort());
    }
  }

  const headers = { Accept: 'application/json' };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  try {
    let res;
    try {
      res = await fetch(buildUrl(path, query), {
        method,
        headers,
        body: payload,
        signal: ctrl.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        if (timedOut) {
          throw new ApiError(0, 'TIMEOUT', 'The API did not respond within 10s');
        }
        throw err;
      }
      throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API server');
    }

    if (!res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (data && data.error) {
        const { code, message, details } = data.error;
        throw new ApiError(res.status, code, message, details ?? null);
      }
      throw new ApiError(res.status, 'HTTP_' + res.status, res.statusText || 'Request failed', null);
    }

    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}
