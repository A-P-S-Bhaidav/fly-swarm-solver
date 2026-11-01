/**
 * Centralized endpoint normalization for REST and WebSocket connections.
 * Safely strips trailing slashes or accidentally appended `/ws/infer` / `/ws/train`
 * suffixes from environment variables and derives WS origins from HTTP origins.
 */

function stripEndpointSuffix(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/ws\/(infer|train)$/i, '');
}

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw && raw.trim().length > 0) {
    return stripEndpointSuffix(raw);
  }
  return 'http://localhost:8000';
}

export function getWsBaseUrl(): string {
  const rawWs = process.env.NEXT_PUBLIC_WS_URL;
  if (rawWs && rawWs.trim().length > 0) {
    return stripEndpointSuffix(rawWs);
  }
  const api = getApiBaseUrl();
  if (api.startsWith('https://')) {
    return `wss://${api.slice('https://'.length)}`;
  }
  if (api.startsWith('http://')) {
    return `ws://${api.slice('http://'.length)}`;
  }
  return 'ws://localhost:8000';
}

export const API_BASE_URL = getApiBaseUrl();
export const WS_INFER_URL = `${getWsBaseUrl()}/ws/infer`;
export const WS_TRAIN_URL = `${getWsBaseUrl()}/ws/train`;
export const MODELS_URL = `${API_BASE_URL}/models`;
