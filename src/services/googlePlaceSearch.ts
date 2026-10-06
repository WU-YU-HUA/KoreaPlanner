import { FunctionsHttpError } from '@supabase/supabase-js';
import { requireSupabase } from './supabaseClient';

// Google search content stays transient and is never converted to a persisted Kakao Place.
export interface GoogleSearchResult {
  placeId: string;
  name: string;
  address: string | null;
  googleMapsUrl: string;
}

export async function searchGooglePlaces(tripId: string, query: string, signal?: AbortSignal): Promise<GoogleSearchResult[]> {
  const normalized = query.trim();
  if (!normalized || normalized.length > 200) throw new Error('Google 搜尋文字須為 1 至 200 個字元。');
  const client = requireSupabase();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError || !session) throw new Error('請先登入 Google 帳號，再使用 Google 搜尋。');
  const { data, error } = await client.functions.invoke('search-places', {
    body: { tripId, query: normalized },
    headers: { Authorization: `Bearer ${session.access_token}` },
    signal, timeout: 15_000,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response;
      if (response.status === 401) throw new Error('Google 登入已失效，請重新登入。');
      if (response.status === 403) throw new Error('Google 搜尋需要 Google 登入及此旅程的擁有者或協作者權限。');
      if (response.status === 429) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.reason === 'project_monthly_limit'
          ? 'Google 本月搜尋額度已用完，仍可使用 Kakao 搜尋。'
          : 'Google 搜尋過於頻繁，請稍後重試；仍可使用 Kakao 搜尋。');
      }
    }
    throw new Error('Google 搜尋暫時無法使用，請稍後重試；仍可使用 Kakao 搜尋。');
  }
  if (!data || !Array.isArray(data.places)) throw new Error('Google 搜尋回應格式錯誤。');
  return data.places.flatMap((place: unknown) => {
    if (!place || typeof place !== 'object') return [];
    const row = place as Record<string, unknown>;
    if (typeof row.placeId !== 'string' || !row.placeId || typeof row.name !== 'string' || !row.name.trim()) return [];
    const link = new URL('https://www.google.com/maps/search/');
    link.searchParams.set('api', '1');
    link.searchParams.set('query', row.name);
    link.searchParams.set('query_place_id', row.placeId);
    return [{ placeId: row.placeId, name: row.name, address: typeof row.address === 'string' ? row.address : null, googleMapsUrl: link.toString() }];
  });
}
