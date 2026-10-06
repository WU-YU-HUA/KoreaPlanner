import type { Place } from '../domain/models';

export interface PlaceSearchService {
  search(query: string): Promise<Place[]>;
}

export interface TranslationService {
  translateToKorean(query: string): Promise<string>;
}

export type PlaceSearchResult = {
  places: Place[];
  translatedQuery?: string;
  translationUnavailable?: boolean;
};

export async function searchWithTranslationFallback(
  query: string,
  placeSearch: PlaceSearchService,
  translation?: TranslationService,
): Promise<PlaceSearchResult> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('請輸入地點搜尋文字。');
  const places = await placeSearch.search(normalizedQuery);
  if (places.length) return { places };
  if (!translation) return { places, translationUnavailable: true };
  const translatedQuery = (await translation.translateToKorean(normalizedQuery)).trim();
  if (!translatedQuery) return { places: [], translatedQuery };
  return { places: await placeSearch.search(translatedQuery), translatedQuery };
}