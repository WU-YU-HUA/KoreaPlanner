export interface ParsedGooglePlace {
  name: string;
  address: string;
  placeId: string;
  latitude: number;
  provider: 'google';
  longitude: number;
}

/** Parse the Edge Function's { places: [...] } response into normalized Google records. */
export function parseSearchPlacesResponse(value: unknown): ParsedGooglePlace[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !Array.isArray((value as Record<string, unknown>).places)) {
    throw new Error('Google 搜尋回應格式錯誤。');
  }
  const places = (value as { places: unknown[] }).places;
  return places.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim()
        || typeof row.placeId !== 'string' || !row.placeId.trim()
        || typeof row.latitude !== 'number' || !Number.isFinite(row.latitude) || row.latitude < -90 || row.latitude > 90
        || typeof row.longitude !== 'number' || !Number.isFinite(row.longitude) || row.longitude < -180 || row.longitude > 180) return [];
    return [{
      name: row.name.trim(),
      address: typeof row.address === 'string' ? row.address.trim() : '',
      placeId: row.placeId.trim(),
      latitude: row.latitude,
      provider: 'google' as const,
      longitude: row.longitude,
    }];
  });
}
