import type { KakaoMapInstance, KakaoSdk } from './kakaoSdk';

/** Bind a map once, then call the returned function with (longitude, latitude, name). */
export function createKakaoPointParser(map: KakaoMapInstance, sdk: KakaoSdk) {
  return function plotPoint(longitude: number, latitude: number, name: string) {
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('經度須為 -180 至 180 的有效數字。');
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error('緯度須為 -90 至 90 的有效數字。');
    }
    if (typeof name !== 'string' || !name.trim()) throw new Error('請提供地點名稱。');

    // Kakao's constructor takes latitude first, unlike this function's public arguments.
    const position = new sdk.maps.LatLng(latitude, longitude);
    const label = document.createElement('div');
    label.className = 'kakao-point-label';
    label.textContent = name.trim();
    const marker = new sdk.maps.Marker({ map, position });
    let overlay: InstanceType<KakaoSdk['maps']['CustomOverlay']> | undefined;
    try {
      overlay = new sdk.maps.CustomOverlay({ map, position, content: label, yAnchor: 2 });
      map.setCenter(position);
    } catch (error) {
      marker.setMap(null);
      overlay?.setMap(null);
      throw error;
    }
    return {
      longitude, latitude, name: name.trim(),
      remove() {
        marker.setMap(null);
        overlay?.setMap(null);
      },
    };
  };
}
