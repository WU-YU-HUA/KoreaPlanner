import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchCombinedPlaces } from './combinedPlaceSearch';

const { kakaoSearch, googleSearch } = vi.hoisted(() => ({ kakaoSearch: vi.fn(), googleSearch: vi.fn() }));
vi.mock('./kakaoPlaceSearch', () => ({ kakaoPlaceSearchService: { search: kakaoSearch } }));
vi.mock('./googlePlaceSearch', () => ({ searchGooglePlaces: googleSearch }));
const kakao = { name: 'Kakao cafe', address: '', placeId: 'same-id', latitude: 37, longitude: 127, provider: 'kakao' };
const google = { ...kakao, name: 'Google cafe', provider: 'google' };
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());

describe('combined Kakao and Google search', () => {
  it('concatenates both arrays in provider order and passes the Trip/session request context', async () => {
    kakaoSearch.mockResolvedValue([kakao]);
    googleSearch.mockResolvedValue([google]);
    const signal = new AbortController().signal;
    const result = await searchCombinedPlaces('trip', ' cafe ', signal);
    expect(result.places).toEqual([kakao, google]);
    expect(result.errors).toEqual([]);
    expect(kakaoSearch).toHaveBeenCalledWith('cafe');
    expect(googleSearch).toHaveBeenCalledWith('trip', 'cafe', signal);
  });

  it.each(['kakao', 'google'])('preserves the other provider when %s fails', async (provider) => {
    kakaoSearch.mockResolvedValue([kakao]);
    googleSearch.mockResolvedValue([google]);
    (provider === 'kakao' ? kakaoSearch : googleSearch).mockRejectedValue(new Error('offline'));
    const result = await searchCombinedPlaces('trip', 'cafe');
    expect(result.places).toEqual(provider === 'kakao' ? [google] : [kakao]);
    expect(result.errors).toHaveLength(1);
  });

  it('shows completed Google results even if Kakao never settles', async () => {
    vi.useFakeTimers();
    kakaoSearch.mockReturnValue(new Promise(() => {}));
    googleSearch.mockResolvedValue([google]);
    const pending = searchCombinedPlaces('trip', 'cafe');
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toEqual({ places: [google], errors: ['Kakao：Kakao 搜尋逾時，請稍後重試。'] });
  });

  it('reports both errors without rejecting or retrying', async () => {
    kakaoSearch.mockRejectedValue(new Error('offline'));
    googleSearch.mockRejectedValue(new Error('quota'));
    const result = await searchCombinedPlaces('trip', 'cafe');
    expect(result.places).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(googleSearch).toHaveBeenCalledTimes(1);
  });
});
