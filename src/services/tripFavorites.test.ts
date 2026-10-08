import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseTripFavoriteRepository } from './repositories';

function setup(body: unknown = [], status = 200) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
  const client = createClient('http://localhost:54321', 'test-only-key', {
    global: { fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { repository: new SupabaseTripFavoriteRepository(client), fetch };
}

describe('Trip favorites repository', () => {
  it('loads the current user’s trip IDs by newest favorite first with a stable tie order', async () => {
    const { repository, fetch } = setup([{ trip_id: 'trip-a' }, { trip_id: 'trip-b' }]);
    expect(await repository.getTripIds('user-a')).toEqual(['trip-a', 'trip-b']);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/rest/v1/trip_favorites');
    expect(url.searchParams.get('user_id')).toBe('eq.user-a');
    expect(url.searchParams.get('select')).toBe('trip_id');
    expect(url.searchParams.get('order')).toBe('created_at.desc,trip_id.asc');
  });

  it('adds a favorite without duplicating an existing mapping', async () => {
    const { repository, fetch } = setup();
    await repository.add('user-a', 'trip-a');
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('on_conflict')).toBe('user_id,trip_id');
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({ user_id: 'user-a', trip_id: 'trip-a' });
    expect(new Headers(options.headers).get('Prefer')).toContain('resolution=ignore-duplicates');
  });

  it('removes only the selected user and trip mapping', async () => {
    const { repository, fetch } = setup();
    await repository.remove('user-a', 'trip-a');
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(options.method).toBe('DELETE');
    expect(new URL(url).pathname).toBe('/rest/v1/trip_favorites');
    expect(new URL(url).searchParams.get('user_id')).toBe('eq.user-a');
    expect(new URL(url).searchParams.get('trip_id')).toBe('eq.trip-a');
  });

  it('reports a failed load instead of presenting it as an empty collection', async () => {
    const { repository } = setup({ code: '42P01', message: 'Favorites table is unavailable' }, 400);
    await expect(repository.getTripIds('user-a')).rejects.toThrow('Favorites table is unavailable');
  });

  it('reports denied writes and deleted trips', async () => {
    const denied = setup({ code: '42501', message: 'Denied' }, 403);
    await expect(denied.repository.add('user-a', 'trip-a')).rejects.toThrow('沒有此操作的權限');
    await expect(denied.repository.remove('user-a', 'trip-a')).rejects.toThrow('沒有此操作的權限');
    const missing = setup({ code: '23503', message: 'Trip no longer exists' }, 409);
    await expect(missing.repository.add('user-a', 'trip-a')).rejects.toThrow('Trip no longer exists');
  });
});
