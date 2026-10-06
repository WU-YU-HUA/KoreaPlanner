import { describe, expect, it } from 'vitest';
import { parseKakaoAddresses, parseKakaoPlaces } from './kakaoPlaceParser';

describe('Kakao search result parsers', () => {
  const record = { id: '123', place_name: ' Cafe ', x: '127.1', y: '37.5' };

  it('returns precisely six fields, converts coordinates and prefers the road address', () => {
    expect(parseKakaoPlaces([{ ...record, address_name: 'Old address', road_address_name: ' Road address ', category_name: 'unused' }])).toEqual([
      { name: 'Cafe', address: 'Road address', placeId: '123', latitude: 37.5, provider: 'kakao', longitude: 127.1 },
    ]);
    expect(parseKakaoPlaces([record])[0].address).toBe('');
    expect(parseKakaoPlaces([{ ...record, address_name: 'Base address' }])[0].address).toBe('Base address');
  });

  it('does not turn missing or blank coordinates into zero, and rejects invalid records', () => {
    expect(parseKakaoPlaces([null, [], { ...record, x: '' }, { ...record, x: ' ' }, { ...record, x: null }, { ...record, y: '91' }, { ...record, x: 'Infinity' }, { ...record, id: '' }, { ...record, place_name: ' ' }])).toEqual([]);
    expect(parseKakaoPlaces([{ ...record, x: '0', y: '0' }])[0]).toMatchObject({ latitude: 0, longitude: 0 });
  });

  it('normalizes address results with an empty Place ID rather than inventing one', () => {
    expect(parseKakaoAddresses([{ x: '127', y: '37', address_name: ' Base ', road_address: { address_name: ' Road ' } }])).toEqual([
      { name: 'Road', address: 'Road', placeId: '', latitude: 37, provider: 'kakao', longitude: 127 },
    ]);
    expect(parseKakaoAddresses([{ x: '127', y: '37', address_name: ' Base ' }])[0].name).toBe('Base');
    expect(parseKakaoAddresses([{ x: '127', y: '37', address_name: '' }])).toEqual([]);
  });

  it('returns an empty array for empty or invalid lists', () => {
    for (const value of [[], null, {}]) {
      expect(parseKakaoPlaces(value)).toEqual([]);
      expect(parseKakaoAddresses(value)).toEqual([]);
    }
  });
});
