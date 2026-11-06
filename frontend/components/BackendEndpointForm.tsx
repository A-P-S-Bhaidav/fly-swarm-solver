'use client';

import React, { useState, useSyncExternalStore } from 'react';
import {
  BACKEND_STORAGE_KEY,
  getEnvApiBaseUrl,
  normalizeBackendUrl,
  setBackendOverride,
} from '@/lib/endpoints';

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(BACKEND_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): string {
  return '';
}

/**
 * Lets the operator point the deployed Vercel frontend at any backend URL
 * (e.g. a fresh Cloudflare Tunnel or Codespaces address) without a redeploy.
 */
export default function BackendEndpointForm() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [feedback, setFeedback] = useState<string | null>(null);
  const envDefault = getEnvApiBaseUrl();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('backend') ?? '');
    if (value.trim() && !normalizeBackendUrl(value)) {
      setFeedback('Invalid URL. Use https://your-backend-host');
      return;
    }
    setBackendOverride(value);
    window.location.reload();
  };

  const handleReset = () => {
    setBackendOverride(null);
    window.location.reload();
  };

  return (
    <section className="rounded-[2px] border border-[#262B31] bg-[#0B0C0E] p-3">
      <div className="flex items-center justify-between">
        <label
          htmlFor="backend-url"
          className="font-mono text-[10px] tracking-wider text-[#9AA1A9] uppercase"
        >
          Backend Endpoint
        </label>
        <span
          className={`font-mono text-[10px] font-semibold uppercase ${
            stored ? 'text-[#52B788]' : 'text-[#636B74]'
          }`}
        >
          {stored ? 'RUNTIME OVERRIDE' : 'BUILD DEFAULT'}
        </span>
      </div>

      <form key={stored} onSubmit={handleSubmit} className="mt-2 flex gap-1.5">
        <input
          id="backend-url"
          name="backend"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          defaultValue={stored}
          placeholder={envDefault}
          className="min-w-0 flex-1 rounded-[2px] border border-[#262B31] bg-[#121417] px-2 py-1.5 font-mono text-[11px] text-[#ECEEF0] placeholder:text-[#636B74] focus:border-[#52B788] focus:outline-none"
        />
        <button
          type="submit"
          className="brutal-cta px-2.5 font-mono text-[10px] font-semibold tracking-wider uppercase cursor-pointer"
        >
          Apply
        </button>
      </form>

      <div className="mt-1.5 flex items-center justify-between font-mono text-[10px]">
        <span className={feedback ? 'text-[#F87171]' : 'text-[#636B74]'}>
          {feedback ?? 'Saved in this browser. Also settable via ?backend=URL'}
        </span>
        {stored && (
          <button
            type="button"
            onClick={handleReset}
            className="text-[#9AA1A9] underline-offset-2 hover:text-[#FCA5A5] hover:underline cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>
    </section>
  );
}
