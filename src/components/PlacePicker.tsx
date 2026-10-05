import { useRef, useState } from 'react';
import type { Coordinates, Place } from '../domain/models';
import { isValidCoordinates } from '../domain/validation';
import { kakaoPlaceSearchService } from '../services/kakaoPlaceSearch';
import { searchWithTranslationFallback } from '../services/placeSearch';
import KakaoMap from './KakaoMap';

type PlaceMode = 'search' | 'manual';

interface PlacePickerProps {
  value: Place | null;
  onConfirm(place: Place | null): void;
  onSearchStateChange(mode: PlaceMode, query: string): void;
}

const SEOUL: Coordinates = { latitude: 37.5665, longitude: 126.978 };

export default function PlacePicker({ value, onConfirm, onSearchStateChange }: PlacePickerProps) {
  const initialCoordinates = value ?? SEOUL;
  const [mode, setMode] = useState<PlaceMode>(value?.provider === 'manual' ? 'manual' : 'search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [center, setCenter] = useState<Coordinates>(initialCoordinates);
  const [manualName, setManualName] = useState(value?.provider === 'manual' ? value.name : '');
  const [latitude, setLatitude] = useState(String(initialCoordinates.latitude));
  const [longitude, setLongitude] = useState(String(initialCoordinates.longitude));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const requestId = useRef(0);

  function changeMode(nextMode: PlaceMode) {
    requestId.current += 1;
    setMode(nextMode);
    setResults([]);
    setSelected(null);
    setBusy(false);
    setError('');
    setHint('');
    onConfirm(null);
    onSearchStateChange(nextMode, query);
  }

  async function search() {
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
    setSelected(null);
    onConfirm(null);
    try {
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

  function updateManualCoordinates(next: Coordinates) {
    setCenter(next);
    setLatitude(String(next.latitude));
    setLongitude(String(next.longitude));
    onConfirm(null);
    setHint('');
  }

  function confirmManual() {
    const coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
    if (!manualName.trim()) {
      setError('請輸入手動地點名稱。');
      return;
    }
    if (!isValidCoordinates(coordinates)) {
      setError('請輸入有效的 latitude / longitude 座標。');
      return;
    }
    setError('');
    onConfirm({ provider: 'manual', name: manualName.trim(), ...coordinates });
    setCenter(coordinates);
    setHint('已確認手動地點。');
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
        <button type="button" aria-pressed={mode === 'manual'} onClick={() => changeMode('manual')}>手動定位</button>
      </div>
      <KakaoMap
        center={center}
        marker={mode === 'manual' ? center : selected ?? undefined}
        interactive={mode === 'manual'}
        onCenterChange={updateManualCoordinates}
      />
      {mode === 'search' ? (
        <div className="place-search-panel">
          <div className="lookup-row">
            <label className="visually-hidden" htmlFor="place-query">搜尋地點</label>
            <input
              id="place-query"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                onSearchStateChange('search', event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void search();
                }
              }}
              placeholder="輸入地點名稱"
            />
            <button type="button" className="button button-secondary" onClick={() => void search()} disabled={busy || !query.trim()}>
              {busy ? '搜尋中…' : '搜尋'}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="place-results" aria-label="地點搜尋結果">
              {results.map((place) => (
                <li key={place.placeId}>
                  <button
                    type="button"
                    className={`place-result${selected?.placeId === place.placeId ? ' is-selected' : ''}`}
                    aria-pressed={selected?.placeId === place.placeId}
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
          <button type="button" className="button button-primary" onClick={confirmSearchResult} disabled={!selected || busy}>
            確認此地點
          </button>
        </div>
      ) : (
        <div className="manual-place-panel">
          <label>地點名稱<input value={manualName} onChange={(event) => {
            setManualName(event.target.value);
            onConfirm(null);
            setHint('');
          }} placeholder="輸入地點名稱" /></label>
          <div className="field-grid">
            <label>Latitude<input inputMode="decimal" value={latitude} onChange={(event) => {
              setLatitude(event.target.value);
              onConfirm(null);
              setHint('');
            }} /></label>
            <label>Longitude<input inputMode="decimal" value={longitude} onChange={(event) => {
              setLongitude(event.target.value);
              onConfirm(null);
              setHint('');
            }} /></label>
          </div>
          <button type="button" className="button button-primary" onClick={confirmManual}>確認手動地點</button>
        </div>
      )}
      {(error || hint) && <p className={error ? 'field-message error-message' : 'field-message'} role={error ? 'alert' : 'status'}>{error || hint}</p>}
      {value && <p className="confirmed-place"><span>已確認地點</span><strong>{value.name}</strong></p>}
    </fieldset>
  );
}