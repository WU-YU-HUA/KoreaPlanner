import { FunctionsHttpError } from '@supabase/supabase-js';
import { requireSupabase } from './supabaseClient';
import { parseSearchPlacesResponse, type ParsedGooglePlace } from './googlePlaceParser';

// Google search content stays transient and is never converted to a persisted Kakao Place.
export type { ParsedGooglePlace as GoogleSearchResult } from './googlePlaceParser';

export function getGoogleMapsUrl(place: ParsedGooglePlace) {
  const link = new URL('https://www.google.com/maps/search/');
  link.searchParams.set('api', '1');
  link.searchParams.set('query', place.name);
  link.searchParams.set('query_place_id', place.placeId);
  return link.toString();
}

export async function searchGooglePlaces(tripId: string, query: string, signal?: AbortSignal): Promise<ParsedGooglePlace[]> {
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
  return parseSearchPlacesResponse(data);
}
