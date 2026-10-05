import { describe, expect, it } from 'vitest';
import type { Place } from '../domain/models';
import { getNaverMapAndroidIntentUrl, getNaverMapAppUrl, getNaverMapUrl } from './naverMapLinks';

const place: Place = {
  provider: 'manual',
  name: '명동 카페',
  latitude: 37.5636,
  longitude: 126.985,
};

describe('Naver Map links', () => {
  it('opens the coordinate-marked place in the Naver app', () => {
    const url = getNaverMapAppUrl(place, 'https://planner.example/KoreaPlanner/');
    expect(url).toContain('nmap://place?');
    expect(url).toContain('lat=37.5636');
    expect(url).toContain('lng=126.985');
    expect(url).toContain('name=%EB%AA%85%EB%8F%99%20%EC%B9%B4%ED%8E%98');
    expect(url).toContain('appname=https%3A%2F%2Fplanner.example%2FKoreaPlanner%2F');
  });

  it('provides an Android intent fallback and a coordinate-centered web fallback', () => {
    expect(getNaverMapAndroidIntentUrl(place, 'https://planner.example/KoreaPlanner/'))
      .toContain('package=com.nhn.android.nmap;end');
    expect(getNaverMapUrl(place))
      .toBe('https://map.naver.com/p/?c=126.985,37.5636,15,0,0,0,dh');
  });
});