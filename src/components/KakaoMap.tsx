import { useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../domain/models';
import { loadKakaoSdk, toKakaoLatLng, type KakaoMapInstance, type KakaoSdk } from '../services/kakaoSdk';

export interface KakaoMapProps {
  center: Coordinates;
  marker?: Coordinates;
  onCenterChange?: (coordinates: Coordinates) => void;
  interactive?: boolean;
}

export default function KakaoMap({ center, marker, onCenterChange, interactive = false }: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const markerRef = useRef<InstanceType<KakaoSdk['maps']['Marker']> | null>(null);
  const callbackRef = useRef(onCenterChange);
  const [sdk, setSdk] = useState<KakaoSdk | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  callbackRef.current = onCenterChange;

  useEffect(() => {
    let mounted = true;
    let listener: ((event: { latLng: { getLat(): number; getLng(): number } }) => void) | undefined;
    let currentSdk: KakaoSdk | undefined;
    let currentMap: KakaoMapInstance | undefined;
    loadKakaoSdk().then((loadedSdk) => {
      if (!mounted || !containerRef.current) return;
      currentSdk = loadedSdk;
      currentMap = new loadedSdk.maps.Map(containerRef.current, {
        center: toKakaoLatLng(loadedSdk, center),
        level: 4,
      });
      mapRef.current = currentMap;
      if (interactive) {
        listener = (event) => callbackRef.current?.({
          latitude: event.latLng.getLat(),
          longitude: event.latLng.getLng(),
        });
        loadedSdk.maps.event.addListener(currentMap, 'click', listener);
      }
      setSdk(loadedSdk);
      setError('');
    }).catch((loadError: unknown) => {
      if (mounted) setError(loadError instanceof Error ? loadError.message : 'Kakao 地圖載入失敗。');
    });

    return () => {
      mounted = false;
      if (currentSdk && currentMap && listener) currentSdk.maps.event.removeListener(currentMap, 'click', listener);
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [interactive, retry]);

  useEffect(() => {
    if (sdk && mapRef.current) mapRef.current.setCenter(toKakaoLatLng(sdk, center));
  }, [center, sdk]);

  useEffect(() => {
    const map = mapRef.current;
    if (!sdk || !map) return;
    if (!marker) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
    } else if (markerRef.current) {
      markerRef.current.setPosition(toKakaoLatLng(sdk, marker));
    } else {
      markerRef.current = new sdk.maps.Marker({ map, position: toKakaoLatLng(sdk, marker) });
    }
  }, [marker, sdk]);

  return (
    <div className="map-frame">
      <div ref={containerRef} className="kakao-map" aria-label="Kakao 地圖" />
      {error && (
        <div className="map-error" role="alert">
          <p>{error}</p>
          <button type="button" className="button button-secondary" onClick={() => setRetry((value) => value + 1)}>
            重試地圖載入
          </button>
        </div>
      )}
      {!error && !sdk && <div className="map-loading" role="status">地圖載入中…</div>}
      {interactive && <span className="map-hint">點擊地圖選擇位置</span>}
    </div>
  );
}