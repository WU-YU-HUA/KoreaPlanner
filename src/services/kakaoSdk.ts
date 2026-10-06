import type { Coordinates } from '../domain/models';

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoMapInstance {
  setCenter(position: KakaoLatLng): void;
}

interface KakaoMarkerInstance {
  setMap(map: KakaoMapInstance | null): void;
  setPosition(position: KakaoLatLng): void;
}

export interface KakaoPlaceRecord {
  id: string;
  place_name: string;
  address_name?: string;
  road_address_name?: string;
  category_name?: string;
  x: string;
  y: string;
}

export interface KakaoAddressRecord {
  address_name: string;
  x: string;
  y: string;
  road_address?: { address_name: string } | null;
}

interface KakaoPlaces {
  keywordSearch(query: string, callback: (records: KakaoPlaceRecord[], status: string) => void): void;
}

interface KakaoGeocoder {
  addressSearch(query: string, callback: (records: KakaoAddressRecord[], status: string) => void): void;
}

export interface KakaoSdk {
  maps: {
    LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
    Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance;
    Marker: new (options: { map: KakaoMapInstance; position: KakaoLatLng }) => KakaoMarkerInstance;
    CustomOverlay: new (options: { map: KakaoMapInstance; position: KakaoLatLng; content: HTMLElement; yAnchor: number }) => { setMap(map: KakaoMapInstance | null): void };
    event: {
      addListener(target: KakaoMapInstance, event: string, listener: (event: { latLng: KakaoLatLng }) => void): void;
      removeListener(target: KakaoMapInstance, event: string, listener: (event: { latLng: KakaoLatLng }) => void): void;
    };
    load(callback: () => void): void;
    services: {
      Places: new () => KakaoPlaces;
      Geocoder: new () => KakaoGeocoder;
      Status: { OK: string; ZERO_RESULT: string };
    };
  };
}

declare global {
  interface Window {
    kakao?: KakaoSdk;
  }
}

let sdkPromise: Promise<KakaoSdk> | null = null;

export function loadKakaoSdk(): Promise<KakaoSdk> {
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao);
  if (sdkPromise) return sdkPromise;
  const key = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY?.trim();
  if (!key) return Promise.reject(new Error('尚未設定 VITE_KAKAO_JAVASCRIPT_KEY。'));

  sdkPromise = new Promise<KakaoSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps) {
        script.remove();
        sdkPromise = null;
        reject(new Error('Kakao Maps SDK 未正確載入，請檢查 JavaScript key 與允許網域。'));
        return;
      }
      maps.load(() => {
        if (!window.kakao?.maps?.services) {
          script.remove();
          sdkPromise = null;
          reject(new Error('Kakao 地點搜尋服務無法載入，請稍後重試。'));
          return;
        }
        resolve(window.kakao);
      });
    };
    script.onerror = () => {
      script.remove();
      sdkPromise = null;
      reject(new Error('Kakao Maps SDK 載入失敗，請檢查網路與 JavaScript key 設定。'));
    };
    document.head.append(script);
  });
  return sdkPromise;
}

export function toKakaoLatLng(sdk: KakaoSdk, coordinates: Coordinates) {
  return new sdk.maps.LatLng(coordinates.latitude, coordinates.longitude);
}
