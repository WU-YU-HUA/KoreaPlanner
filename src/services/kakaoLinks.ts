import type { Place } from '../domain/models';

export function getKakaoMapUrl(place: Place): string {
  if (place.provider === 'kakao' && place.placeId) {
    return `https://map.kakao.com/link/map/${encodeURIComponent(place.placeId)}`;
  }
  const name = encodeURIComponent(place.name);
  return `https://map.kakao.com/link/map/${name},${place.latitude},${place.longitude}`;
}
