import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadKakaoSdk, type KakaoSdk } from './kakaoSdk';
import { kakaoPlaceSearchService } from './kakaoPlaceSearch';

vi.mock('./kakaoSdk', () => ({ loadKakaoSdk: vi.fn() }));
const keywordSearch = vi.fn();
const addressSearch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadKakaoSdk).mockResolvedValue({ maps: { services: {
    Places: class { keywordSearch = keywordSearch; },
    Geocoder: class { addressSearch = addressSearch; },
    Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' },
  } } } as unknown as KakaoSdk);
});

describe('Kakao normalized search integration', () => {
  it('normalizes keyword results without calling the geocoder', async () => {
    keywordSearch.mockImplementation((_query, callback) => callback([{ id: '1', place_name: 'Cafe', x: '127', y: '37' }], 'OK'));
    expect(await kakaoPlaceSearchService.search(' Cafe ')).toEqual([
      { name: 'Cafe', address: '', placeId: '1', latitude: 37, provider: 'kakao', longitude: 127 },
    ]);
    expect(addressSearch).not.toHaveBeenCalled();
  });

  it('uses the same shape for address fallback', async () => {
    keywordSearch.mockImplementation((_query, callback) => callback([], 'ZERO_RESULT'));
    addressSearch.mockImplementation((_query, callback) => callback([{ address_name: 'Seoul', x: '127', y: '37' }], 'OK'));
    expect(await kakaoPlaceSearchService.search('Seoul')).toEqual([
      { name: 'Seoul', address: 'Seoul', placeId: '', latitude: 37, provider: 'kakao', longitude: 127 },
    ]);
  });
});
