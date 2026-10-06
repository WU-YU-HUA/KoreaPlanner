import { describe, expect, it } from 'vitest';
import {
  buildTextSearchRequest,
  GOOGLE_PLACES_FIELD_MASK,
  mapGooglePlacesResponse,
  parseSearchPlacesInput,
} from './core';

describe('search-places core', () => {
  it('validates and trims the input query', () => {
    expect(parseSearchPlacesInput({
      tripId: 'a8c2de85-990e-4318-9e42-dc59a18e6f20',
      query: '  명동 카페  ',
    })).toEqual({ tripId: 'a8c2de85-990e-4318-9e42-dc59a18e6f20', query: '명동 카페' });
    expect(() => parseSearchPlacesInput({ tripId: 'bad-id', query: 'cafe' })).toThrow('tripId');
    expect(() => parseSearchPlacesInput({
      tripId: 'a8c2de85-990e-4318-9e42-dc59a18e6f20', query: ' '.repeat(2),
    })).toThrow('1 to 200');
  });

  it('uses Korean results and an explicit minimal FieldMask', () => {
    expect(buildTextSearchRequest('카페')).toEqual({
      textQuery: '카페', languageCode: 'ko', regionCode: 'KR', maxResultCount: 10,
    });
    expect(GOOGLE_PLACES_FIELD_MASK.split(',')).toEqual([
      'places.id', 'places.displayName', 'places.formattedAddress',
      'places.location', 'places.googleMapsUri',
    ]);
  });

  it('maps only allowed place fields and discards malformed records', () => {
    const places = mapGooglePlacesResponse({
      places: [{
        id: 'ChIJ1',
        displayName: { text: '명동 카페', languageCode: 'ko' },
        formattedAddress: '서울 중구 명동',
        location: { latitude: 37.56, longitude: 126.98 },
        googleMapsUri: 'https://maps.google.com/?cid=1',
        rating: 4.9,
        photos: [{ name: 'not-requested' }],
      }, { id: 'bad', displayName: { text: 'Bad' }, location: { latitude: 91, longitude: 0 } }],
    });
    expect(places).toEqual([{
      placeId: 'ChIJ1',
      name: '명동 카페',
      address: '서울 중구 명동',
      latitude: 37.56,
      longitude: 126.98,
      googleMapsUrl: 'https://maps.google.com/?cid=1',
    }]);
  });
});