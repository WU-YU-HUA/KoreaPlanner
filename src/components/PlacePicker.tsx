import { useEffect, useRef, useState } from 'react';
import type { Coordinates, Place } from '../domain/models';
import { isValidCoordinates } from '../domain/validation';
import { parseGoogleMapsUrl } from '../services/googleMapsUrl';
import { kakaoPlaceSearchService } from '../services/kakaoPlaceSearch';
import { searchWithTranslationFallback } from '../services/placeSearch';
import { searchGooglePlaces, type GoogleSearchResult } from '../services/googlePlaceSearch';
import KakaoMap from './KakaoMap';

type PlaceMode = 'search' | 'googleMaps';

interface PlacePickerProps {
  tripId: string;
  value: Place | null;
  onConfirm(place: Place | null): void;
  onSearchStateChange(mode: PlaceMode, query: string): void;
}

const SEOUL: Coordinates = { latitude: 37.5665, longitude: 126.978 };

export default function PlacePicker({ tripId, value, onConfirm, onSearchStateChange }: PlacePickerProps) {
  const initialCoordinates = value ?? SEOUL;
  const [mode, setMode] = useState<PlaceMode>(value?.provider === 'manual' ? 'googleMaps' : 'search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searchProvider, setSearchProvider] = useState<'kakao' | 'google'>('kakao');
  const [googleResults, setGoogleResults] = useState<GoogleSearchResult[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [center, setCenter] = useState<Coordinates>(initialCoordinates);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [googlePlaceName, setGooglePlaceName] = useState(value?.provider === 'manual' ? value.name : '');
  const [googleCoordinates, setGoogleCoordinates] = useState<Coordinates | null>(
    value?.provider === 'manual' ? { latitude: value.latitude, longitude: value.longitude } : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const requestId = useRef(0);
  const googleRequest = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestId.current += 1;
    googleRequest.current?.abort();
  }, []);

  function resetSearch() {
    requestId.current += 1;
    googleRequest.current?.abort();
    setResults([]);
    setGoogleResults([]);
    setSelected(null);
    setBusy(false);
    setError('');
    setHint('');
  }

  function changeProvider(provider: 'kakao' | 'google') {
    if (provider === searchProvider) return;
    resetSearch();
    setSearchProvider(provider);
    onConfirm(null);
  }

  function changeMode(nextMode: PlaceMode) {
    resetSearch();
    setMode(nextMode);
    onConfirm(null);
    onSearchStateChange(nextMode, query);
  }

  async function search() {
    if (busy) return;
    const normalized = query.trim();
    if (!normalized) {
      setError('請輸入地點搜尋文字。');
      return;
    }
    const request = ++requestId.current;
    setBusy(true);
    setError('');
    setHint('');
    setResults([]);
    setGoogleResults([]);
    setSelected(null);
    onConfirm(null);
    try {
      if (searchProvider === 'google') {
        const controller = new AbortController();
        googleRequest.current = controller;
        const places = await searchGooglePlaces(tripId, normalized, controller.signal);
        if (request !== requestId.current) return;
        setGoogleResults(places);
        setHint(places.length ? `找到 ${places.length} 筆 Google 結果，可在 Google Maps 查看。` : 'Google 找不到搜尋結果，可換個關鍵字或切換 Kakao。');
        return;
      }
      const result = await searchWithTranslationFallback(normalized, kakaoPlaceSearchService);
      if (request !== requestId.current) return;
      setResults(result.places);
      if (result.places.length) {
        setSelected(result.places[0]);
        setCenter(result.places[0]);
        setHint(`${result.places.length} 筆結果，已預選第一筆；確認後才會加入行程。`);
      } else {
        setHint('找不到搜尋結果；尚未設定翻譯服務，可改用韓文搜尋或手動定位。');
      }
    } catch (searchError) {
      if (request === requestId.current) {
        setError(searchError instanceof Error ? searchError.message : '地點搜尋失敗，請重試。');
      }
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  }

  function selectPlace(place: Place) {
    setSelected(place);
    setCenter(place);
    onConfirm(null);
  }

  function placeKey(place: Place) {
    return place.placeId ?? `${place.provider}:${place.latitude},${place.longitude}:${place.name}`;
  }

  function isSelected(place: Place) {
    if (!selected) return false;
    if (place.placeId && selected.placeId) return place.placeId === selected.placeId;
    return place.latitude === selected.latitude && place.longitude === selected.longitude;
  }

  function parseGoogleLocation() {
    try {
      const coordinates = parseGoogleMapsUrl(googleMapsUrl);
      setGoogleCoordinates(coordinates);
      setCenter(coordinates);
      onConfirm(null);
      setError('');
      setHint('已讀取座標。確認地點名稱後，才會加入行程。');
    } catch (parseError) {
      setGoogleCoordinates(null);
      onConfirm(null);
      setError(parseError instanceof Error ? parseError.message : '無法讀取 Google Maps 座標。');
      setHint('');
    }
  }

  function confirmGoogleLocation() {
    if (!googleCoordinates) {
      setError('請先貼上 Google Maps 完整網址並讀取座標。');
      return;
    }
    if (!googlePlaceName.trim()) {
      setError('請輸入地點名稱。');
      return;
    }
    if (!isValidCoordinates(googleCoordinates)) {
      setError('Google Maps 網址中的座標超出有效範圍。');
      return;
    }
    setError('');
    onConfirm({ provider: 'manual', name: googlePlaceName.trim(), ...googleCoordinates });
    setHint('已確認 Google Maps 座標地點。');
  }

  function confirmSearchResult() {
    if (!selected || busy) return;
    onConfirm(selected);
    setHint(`已確認：${selected.name}`);
  }

  return (
    <fieldset className="place-picker">
      <legend>地點確認</legend>
      <div className="segmented-control" role="group" aria-label="地點選擇方式">
        <button type="button" aria-pressed={mode === 'search'} onClick={() => changeMode('search')}>搜尋地點</button>
        <button type="button" aria-pressed={mode === 'googleMaps'} onClick={() => changeMode('googleMaps')}>Google Maps</button>
      </div>
      {(mode !== 'search' || searchProvider === 'kakao') && <KakaoMap
        center={center}
        marker={mode === 'googleMaps' ? googleCoordinates ?? (value?.provider === 'manual' ? value : undefined) : selected ?? undefined}
        interactive={false}
      />}
      {mode === 'search' ? (
        <div className="place-search-panel">
          <div className="segmented-control" role="group" aria-label="搜尋來源">
            <button type="button" aria-pressed={searchProvider === 'kakao'} onClick={() => changeProvider('kakao')}>Kakao</button>
            <button type="button" aria-pressed={searchProvider === 'google'} onClick={() => changeProvider('google')}>Google</button>
          </div>
          <div className="lookup-row">
            <label className="visually-hidden" htmlFor="place-query">搜尋地點</label>
            <input
              id="place-query"
              value={query}
              onChange={(event) => {
                resetSearch();
                onConfirm(null);
                setQuery(event.target.value);
                onSearchStateChange('search', event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void search();
                }
              }}
              placeholder={searchProvider === 'google' ? '輸入地點名稱（Google 搜尋）' : '輸入地點名稱（Kakao 搜尋）'}
            />
            <button type="button" className="button button-secondary" onClick={() => void search()} disabled={busy || !query.trim()}>
              {busy ? '搜尋中…' : '搜尋'}
            </button>
          </div>
          {searchProvider === 'google' && (
            <section className="google-place-results" aria-label="Google 搜尋結果">
              <span className="google-maps-attribution" translate="no">Google Maps</span>
              <p className="field-message">Google 結果可在 Google Maps 查看；要加入目前行程，請使用 Kakao 搜尋或 Google Maps 網址定位。</p>
              {googleResults.length > 0 && <ul className="place-results">
                {googleResults.map((place) => <li key={place.placeId}>
                  <a className="place-result google-place-link" href={place.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                    <strong>{place.name}</strong>
                    {place.address && <span>{place.address}</span>}
                    <span>在 Google Maps 開啟 ↗</span>
                  </a>
                </li>)}
              </ul>}
            </section>
          )}
          {searchProvider === 'kakao' && results.length > 0 && (
            <ul className="place-results" aria-label="地點搜尋結果">
              {results.map((place) => (
                <li key={placeKey(place)}>
                  <button
                    type="button"
                    className={`place-result${isSelected(place) ? ' is-selected' : ''}`}
                    aria-pressed={isSelected(place)}
                    onClick={() => selectPlace(place)}
                  >
                    <strong>{place.name}</strong>
                    <span>{place.roadAddress || place.address || place.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && <p className="selected-place">已選擇：{selected.name}</p>}
          {searchProvider === 'kakao' && <button type="button" className="button button-primary" onClick={confirmSearchResult} disabled={!selected || busy}>
            確認此地點
          </button>}
        </div>
      ) : (
        <div className="manual-place-panel">
          <label>Google Maps 網址<input
            type="url"
            value={googleMapsUrl}
            onChange={(event) => {
              setGoogleMapsUrl(event.target.value);
              setGoogleCoordinates(null);
              onConfirm(null);
              setError('');
              setHint('');
            }}
            placeholder="https://www.google.com/maps/..."
          /></label>
          <button type="button" className="button button-secondary" onClick={parseGoogleLocation} disabled={!googleMapsUrl.trim()}>
            讀取座標
          </button>
          {googleCoordinates && <p className="selected-place">座標：{googleCoordinates.latitude}, {googleCoordinates.longitude}</p>}
          <label>地點名稱<input value={googlePlaceName} onChange={(event) => {
            setGooglePlaceName(event.target.value);
            onConfirm(null);
            setHint('');
          }} placeholder="輸入行程中要顯示的地點名稱" /></label>
          <button type="button" className="button button-primary" onClick={confirmGoogleLocation} disabled={!googleCoordinates || !googlePlaceName.trim()}>
            確認地點
          </button>
        </div>
      )}
      {(error || hint) && <p className={error ? 'field-message error-message' : 'field-message'} role={error ? 'alert' : 'status'}>{error || hint}</p>}
      {value && <p className="confirmed-place"><span>已確認地點</span><strong>{value.name}</strong></p>}
    </fieldset>
  );
}
