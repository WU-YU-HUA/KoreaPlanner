import { describe, expect, it } from 'vitest';
import { parseSearchPlacesResponse } from './googlePlaceParser';

describe('Google search response parser', () => {
  const place = { name: ' Cafe ', address: null, placeId: ' id ', latitude: 37.5, longitude: 127 };

  it('returns precisely the requested fields and normalizes missing addresses', () => {
    expect(parseSearchPlacesResponse({ places: [{ ...place, provider: 'kakao', googleMapsUrl: 'unused' }] })).toEqual([
      { name: 'Cafe', address: '', placeId: 'id', latitude: 37.5, provider: 'google', longitude: 127 },
    ]);
  });

  it('filters malformed records while preserving valid coordinates and order', () => {
    const invalid = [null, [], { ...place, latitude: 91 }, { ...place, longitude: Infinity }, { ...place, latitude: '37.5' }, { ...place, name: ' ' }, { ...place, placeId: '' }];
    const result = parseSearchPlacesResponse({ places: [place, ...invalid, { ...place, name: 'Second', latitude: -90, longitude: 180 }] });
    expect(result.map(p => p.name)).toEqual(['Cafe', 'Second']);
    expect(result[1].latitude).toBe(-90);
    expect(result[1].longitude).toBe(180);
  });

  it('accepts empty results and rejects an invalid response envelope', () => {
    expect(parseSearchPlacesResponse({ places: [] })).toEqual([]);
    for (const value of [null, [], {}, { places: {} }]) expect(() => parseSearchPlacesResponse(value)).toThrow('格式錯誤');
  });
});
