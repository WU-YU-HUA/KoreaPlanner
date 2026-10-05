import type { Place } from '../domain/models';

export function getNaverMapUrl(place: Place): string {
  const mapCenter = `${place.longitude},${place.latitude},15,0,0,0,dh`;
  return `https://map.naver.com/p/?c=${mapCenter}`;
}