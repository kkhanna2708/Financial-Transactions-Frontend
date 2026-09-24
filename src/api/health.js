import { request } from './client.js';

export function getHealth({ signal } = {}) {
  return request('/health', { signal });
}
