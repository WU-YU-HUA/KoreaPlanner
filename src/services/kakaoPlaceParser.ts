export interface ParsedKakaoPlace {
  name: string;
  address: string;
  placeId: string;
  latitude: number;
  provider: 'kakao';
  longitude: number;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function coordinates(row: Record<string, unknown>) {
  if (!text(row.x) || !text(row.y)) return null;
  const longitude = Number(row.x);
  const latitude = Number(row.y);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  return { longitude, latitude };
}

/** Normalize Kakao keywordSearch records into the same six fields as Google. */
export function parseKakaoPlaces(value: unknown): ParsedKakaoPlace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const position = coordinates(row);
    const name = text(row.place_name);
    const placeId = text(row.id);
    if (!position || !name || !placeId) return [];
    return [{ name, address: text(row.road_address_name) || text(row.address_name), placeId,
      latitude: position.latitude, provider: 'kakao' as const, longitude: position.longitude }];
  });
}

/** Kakao addressSearch returns no Place ID, so placeId is an empty string. */
export function parseKakaoAddresses(value: unknown): ParsedKakaoPlace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const position = coordinates(row);
    const baseAddress = text(row.address_name);
    if (!position || !baseAddress) return [];
    const road = row.road_address;
    const address = road && typeof road === 'object' && !Array.isArray(road)
      ? text((road as Record<string, unknown>).address_name) || baseAddress : baseAddress;
    return [{ name: address, address, placeId: '', latitude: position.latitude,
      provider: 'kakao' as const, longitude: position.longitude }];
  });
}
