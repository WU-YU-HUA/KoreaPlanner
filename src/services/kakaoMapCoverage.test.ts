import { describe, expect, it } from 'vitest';
import { canDisplayOnKakaoMap } from './kakaoMapCoverage';
import { parsePlace } from './repositories';
import { getKakaoMapUrl } from './kakaoLinks';

describe('selectable places outside the Kakao display area', () => {
  it.each(['manual', 'kakao', 'naver', 'google'])('accepts saved places from %s', (provider) => {
    expect(parsePlace({ provider, name: 'Test', latitude: 37, longitude: 127 }).provider).toBe(provider);
  });
  it('accepts a Taiwan Google place for storage while skipping its map marker', () => {
    const place = parsePlace({ provider: 'google', name: '義大世界', placeId: 'google-id', latitude: 22.729, longitude: 120.406, address: '高雄' });
    expect(place.provider).toBe('google');
    expect(canDisplayOnKakaoMap(place)).toBe(false);
    expect(getKakaoMapUrl(place)).not.toContain('/google-id');
  });

  it('shows Korea coordinates and rejects invalid map coordinates', () => {
    expect(canDisplayOnKakaoMap({ latitude: 37.5665, longitude: 126.978 })).toBe(true);
    expect(canDisplayOnKakaoMap({ latitude: 91, longitude: 126 })).toBe(false);
    expect(canDisplayOnKakaoMap({ latitude: NaN, longitude: 126 })).toBe(false);
  });

  it('preserves validation for truly invalid saved coordinates', () => {
    expect(() => parsePlace({ provider: 'google', name: 'Test', latitude: 91, longitude: 120 })).toThrow();
  });
});
