import { kakaoPlaceSearchService } from './kakaoPlaceSearch';
import { searchGooglePlaces } from './googlePlaceSearch';
import type { ParsedKakaoPlace } from './kakaoPlaceParser';
import type { ParsedGooglePlace } from './googlePlaceParser';

export type CombinedPlace = ParsedKakaoPlace | ParsedGooglePlace;

async function withTimeout<T>(request: Promise<T>, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} 搜尋逾時，請稍後重試。`)), 15_000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function searchCombinedPlaces(tripId: string, query: string, signal?: AbortSignal) {
  const normalized = query.trim();
  if (!normalized) throw new Error('請輸入地點搜尋文字。');
  const [kakao, google] = await Promise.allSettled([
    withTimeout(kakaoPlaceSearchService.search(normalized), 'Kakao'),
    searchGooglePlaces(tripId, normalized, signal),
  ]);
  const kakaoPlaces: CombinedPlace[] = kakao.status === 'fulfilled' ? kakao.value : [];
  const googlePlaces = google.status === 'fulfilled' ? google.value : [];
  const places = kakaoPlaces.concat(googlePlaces);
  const errors = [kakao, google].flatMap((result, index) => result.status === 'rejected'
    ? [`${index === 0 ? 'Kakao' : 'Google'}：${result.reason instanceof Error ? result.reason.message : '搜尋暫時無法使用。'}`]
    : []);
  return { places, errors };
}
