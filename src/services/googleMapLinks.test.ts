import { describe, expect, it } from 'vitest';
import { getGoogleMapUrl } from './googleMapLinks';
import { parseGoogleMapsUrl } from './googleMapsUrl';

describe('Google Maps coordinate deep links', () => {
  it.each([
    { latitude: 22.729, longitude: 120.406 },
    { latitude: -33.8568, longitude: 151.2153 },
    { latitude: 0, longitude: 0 },
  ])('preserves coordinates %o across URL encoding and parsing', (place) => {
    const url = getGoogleMapUrl(place);
    expect(new URL(url).searchParams.get('api')).toBe('1');
    expect(parseGoogleMapsUrl(url)).toEqual(place);
  });
});
