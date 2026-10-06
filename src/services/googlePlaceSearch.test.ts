import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { searchGooglePlaces } from './googlePlaceSearch';

const { getSession, invoke } = vi.hoisted(() => ({ getSession: vi.fn(), invoke: vi.fn() }));
vi.mock('./supabaseClient', () => ({ requireSupabase: () => ({ auth: { getSession }, functions: { invoke } }) }));

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ data: { session: { access_token: 'offline-session' } }, error: null });
});

describe('Google Places frontend integration', () => {
  it('sends the Trip and current session, and keeps Google results out of the stored Place shape', async () => {
    invoke.mockResolvedValue({ data: { places: [{ placeId: 'google-id', name: 'Cafe', address: 'Seoul', latitude: 37, longitude: 127, googleMapsUrl: 'javascript:alert(1)' }] }, error: null });
    const results = await searchGooglePlaces('trip-id', ' Cafe ');
    expect(invoke).toHaveBeenCalledWith('search-places', expect.objectContaining({ body: { tripId: 'trip-id', query: 'Cafe' }, headers: { Authorization: 'Bearer offline-session' }, timeout: 15000 }));
    expect(results).toHaveLength(1);
    expect(results[0]).not.toHaveProperty('latitude');
    expect(results[0]).not.toHaveProperty('provider');
    const link = new URL(results[0].googleMapsUrl);
    expect(link.origin).toBe('https://www.google.com');
    expect(link.searchParams.get('query_place_id')).toBe('google-id');
  });

  it('does not call the function when signed out', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(searchGooglePlaces('trip-id', 'Cafe')).rejects.toThrow('請先登入');
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([[401, '登入已失效'], [403, '協作者權限'], [429, '過於頻繁'], [502, '暫時無法使用']])('handles HTTP %s without exposing server error details', async (status, message) => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'private server detail', reason: 'user_rate_limit' }), { status })) });
    await expect(searchGooglePlaces('trip-id', 'Cafe')).rejects.toThrow(message);
  });

  it('explains the monthly quota without automatic retries', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ reason: 'project_monthly_limit' }), { status: 429 })) });
    await expect(searchGooglePlaces('trip-id', 'Cafe')).rejects.toThrow('本月搜尋額度');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('accepts zero results and rejects malformed payloads', async () => {
    invoke.mockResolvedValueOnce({ data: { places: [] }, error: null });
    expect(await searchGooglePlaces('trip-id', 'Cafe')).toEqual([]);
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(searchGooglePlaces('trip-id', 'Cafe')).rejects.toThrow('格式錯誤');
  });
});
