export const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.googleMapsUri',
].join(',');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SearchPlacesInput {
  tripId: string;
  query: string;
}

export interface GooglePlaceResult {
  placeId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  googleMapsUrl: string | null;
}

export function parseSearchPlacesInput(value: unknown): SearchPlacesInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be a JSON object.');
  }
  const body = value as Record<string, unknown>;
  if (typeof body.tripId !== 'string' || !UUID_PATTERN.test(body.tripId)) {
    throw new Error('tripId must be a valid UUID.');
  }
  if (typeof body.query !== 'string') throw new Error('query must be a string.');
  const query = body.query.trim();
  if (!query || query.length > 200) throw new Error('query must contain 1 to 200 characters.');
  return { tripId: body.tripId, query };
}

export function buildTextSearchRequest(query: string) {
  return {
    textQuery: query,
    languageCode: 'ko',
    regionCode: 'KR',
    maxResultCount: 10,
  };
}

export function mapGooglePlacesResponse(value: unknown): GooglePlaceResult[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const places = (value as Record<string, unknown>).places;
  if (!Array.isArray(places)) return [];

  return places.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const place = item as Record<string, unknown>;
    const displayName = place.displayName;
    const location = place.location;
    if (!location || typeof location !== 'object' || Array.isArray(location)) return [];
    const coordinates = location as Record<string, unknown>;
    const latitude = coordinates.latitude;
    const longitude = coordinates.longitude;
    if (typeof place.id !== 'string' || !place.id
        || !displayName || typeof displayName !== 'object'
        || typeof (displayName as Record<string, unknown>).text !== 'string'
        || typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return [];
    }
    return [{
      placeId: place.id,
      name: (displayName as Record<string, string>).text,
      address: typeof place.formattedAddress === 'string' ? place.formattedAddress : null,
      latitude,
      longitude,
      googleMapsUrl: typeof place.googleMapsUri === 'string' ? place.googleMapsUri : null,
    }];
  });
}