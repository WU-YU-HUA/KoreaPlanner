import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as core from './core';

// Execute the actual Deno entrypoint with offline Auth, RPC and Google boundaries.
const compiled = ts.transpileModule(
  readFileSync(new URL('./index.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const tripId = 'a8c2de85-990e-4318-9e42-dc59a18e6f20';

function setup(options: { invalid?: boolean; provider?: string; code?: string; allowed?: boolean; reason?: string; empty?: boolean } = {}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: options.invalid ? null : { id: 'verified-user', identities: [{ provider: options.provider ?? 'google' }] } },
    error: options.invalid ? { message: 'expired' } : null,
  });
  const rpc = vi.fn().mockResolvedValue({
    data: options.empty ? [] : [{ allowed: options.allowed ?? true, reason: options.reason, retry_after_seconds: 60 }],
    error: options.code ? { code: options.code } : null,
  });
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [] })));
  let handler!: (request: Request) => Promise<Response>;
  runInNewContext(compiled, {
    exports: {},
    require: (name: string) => {
      if (name === './core.ts') return core;
      if (name === 'npm:@supabase/supabase-js@2.57.0') return { createClient: () => ({ auth: { getUser }, rpc }) };
      throw new Error(`Unexpected import: ${name}`);
    },
    Deno: { env: { get: (name: string) => name === 'ALLOWED_ORIGINS'
      ? ' https://wu-yu-hua.github.io, http://localhost:5173, http://127.0.0.1:5173, , '
      : 'offline-placeholder' }, serve: (fn: typeof handler) => { handler = fn; } },
    Headers, Response, AbortController, TextEncoder, setTimeout, clearTimeout, fetch,
  });
  const request = (token = 'offline-session', body = JSON.stringify({ tripId, query: 'cafe' }), origin?: string) => handler(new Request('https://example.test/search', {
    method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) },
    body,
  }));
  return { request, getUser, rpc, fetch };
}

describe('search-places handler security boundaries', () => {
  it.each(['https://wu-yu-hua.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173'])('parses comma-separated origins and permits %s', async (origin) => {
    const test = setup();
    const response = await test.request('offline-session', undefined, origin);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
  });

  it.each(['https://wu-yu-hua.github.io.evil.example', 'https://untrusted.example'])('rejects origin %s before Auth, RPC or Google', async (origin) => {
    const test = setup();
    const response = await test.request('offline-session', undefined, origin);
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(test.getUser).not.toHaveBeenCalled();
    expect(test.rpc).not.toHaveBeenCalled();
    expect(test.fetch).not.toHaveBeenCalled();
  });
  it('rejects oversized UTF-8 bodies without Content-Length before quota or Google', async () => {
    const test = setup();
    expect((await test.request('offline-session', JSON.stringify({ tripId, query: '韓'.repeat(3000) }))).status).toBe(413);
    expect(test.rpc).not.toHaveBeenCalled();
    expect(test.fetch).not.toHaveBeenCalled();
  });
  it('rejects missing and expired sessions before quota or Google', async () => {
    for (const invalid of [false, true]) {
      const test = setup({ invalid });
      expect((await test.request(invalid ? 'expired' : '')).status).toBe(401);
      expect(test.rpc).not.toHaveBeenCalled();
      expect(test.fetch).not.toHaveBeenCalled();
    }
  });

  it('rejects non-Google users before quota or Google', async () => {
    const test = setup({ provider: 'email' });
    expect((await test.request()).status).toBe(403);
    expect(test.rpc).not.toHaveBeenCalled();
    expect(test.fetch).not.toHaveBeenCalled();
  });

  it.each([['42501', 403], ['P0002', 404], ['55000', 503]])('fails closed on RPC error %s', async (code, status) => {
    const test = setup({ code });
    expect((await test.request()).status).toBe(status);
    expect(test.fetch).not.toHaveBeenCalled();
  });

  it.each(['user_rate_limit', 'project_monthly_limit'])('never calls Google after %s', async (reason) => {
    const test = setup({ allowed: false, reason });
    const response = await test.request();
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(test.fetch).not.toHaveBeenCalled();
  });

  it('fails closed if RPC returns no reservation', async () => {
    const test = setup({ empty: true });
    expect((await test.request()).status).toBe(429);
    expect(test.fetch).not.toHaveBeenCalled();
  });

  it('uses the Auth user ID and calls Google only after a successful reservation', async () => {
    const test = setup();
    expect((await test.request()).status).toBe(200);
    expect(test.getUser).toHaveBeenCalledWith('offline-session');
    expect(test.rpc).toHaveBeenCalledWith('reserve_google_places_search', { p_user_id: 'verified-user', p_trip_id: tripId });
    expect(test.fetch).toHaveBeenCalledTimes(1);
    expect(test.rpc.mock.invocationCallOrder[0]).toBeLessThan(test.fetch.mock.invocationCallOrder[0]);
  });
});
