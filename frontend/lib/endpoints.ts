/**
 * Centralized endpoint resolution for REST and WebSocket connections.
 *
 * Resolution order (first match wins):
 *   1. `?backend=https://host` query parameter (persisted to localStorage)
 *   2. Backend URL saved in localStorage via the in-app Console
 *   3. `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` build-time env vars
 *   4. http://localhost:8000
 *
 * This lets free tunnel-based backends (Cloudflare Tunnel, Codespaces) change
 * URL without requiring a Vercel redeploy.
 */

export const BACKEND_STORAGE_KEY = 'flyswarm.backendUrl';

function stripEndpointSuffix(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/ws\/(infer|train)$/i, '');
}

export function normalizeBackendUrl(raw: string): string | null {
  const cleaned = stripEndpointSuffix(raw);
  if (!cleaned) return null;
  const withScheme = /^[a-z]+:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol === 'ws:') url.protocol = 'http:';
    if (url.protocol === 'wss:') url.protocol = 'https:';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

function httpToWs(httpBase: string): string {
  if (httpBase.startsWith('https://')) return `wss://${httpBase.slice('https://'.length)}`;
  if (httpBase.startsWith('http://')) return `ws://${httpBase.slice('http://'.length)}`;
  return httpBase;
}

function readRuntimeOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const param = new URLSearchParams(window.location.search).get('backend');
    if (param) {
      const normalized = normalizeBackendUrl(param);
      if (normalized) {
        window.localStorage.setItem(BACKEND_STORAGE_KEY, normalized);
        return normalized;
      }
    }
    const stored = window.localStorage.getItem(BACKEND_STORAGE_KEY);
    return stored ? normalizeBackendUrl(stored) : null;
  } catch {
    return null;
  }
}

export function getEnvApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw && raw.trim().length > 0) {
    return normalizeBackendUrl(raw) ?? 'http://localhost:8000';
  }
  return 'http://localhost:8000';
}

export function getApiBaseUrl(): string {
  return readRuntimeOverride() ?? getEnvApiBaseUrl();
}

export function getWsBaseUrl(): string {
  const override = readRuntimeOverride();
  if (override) return httpToWs(override);
  const rawWs = process.env.NEXT_PUBLIC_WS_URL;
  if (rawWs && rawWs.trim().length > 0) {
    return stripEndpointSuffix(rawWs);
  }
  return httpToWs(getEnvApiBaseUrl());
}

export function getWsInferUrl(): string {
  return `${getWsBaseUrl()}/ws/infer`;
}

export function getWsTrainUrl(): string {
  return `${getWsBaseUrl()}/ws/train`;
}

export function getModelsUrl(): string {
  return `${getApiBaseUrl()}/models`;
}

export function setBackendOverride(raw: string | null): string | null {
  if (typeof window === 'undefined') return null;
  if (!raw || !raw.trim()) {
    window.localStorage.removeItem(BACKEND_STORAGE_KEY);
    return null;
  }
  const normalized = normalizeBackendUrl(raw);
  if (normalized) {
    window.localStorage.setItem(BACKEND_STORAGE_KEY, normalized);
  }
  return normalized;
}

export function hasBackendOverride(): boolean {
  return readRuntimeOverride() !== null;
}
