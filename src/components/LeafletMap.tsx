import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Place } from '../domain/models';
import { isValidCoordinates } from '../domain/validation';

interface Props { marker?: Place; scheduledPlaces?: Place[] }
const NO_PLACES: Place[] = [];

export default function LeafletMap({ marker, scheduledPlaces = NO_PLACES }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;
    let map: L.Map | undefined;
    let observer: ResizeObserver | undefined;
    const resize = () => map?.invalidateSize({ pan: false });
    try {
      // Disable zoom transitions so switching tabs cannot leave callbacks after remove().
      map = L.map(containerRef.current, { zoomAnimation: false }).setView([37.5665, 126.978], 13);
      mapRef.current = map;
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);
      tiles.on('tileerror', () => setError('地圖圖磚載入失敗；仍可選取及確認地點。'));
      tiles.on('tileload', () => setError(''));
      observer = new ResizeObserver(resize);
      observer.observe(containerRef.current);
      document.addEventListener('visibilitychange', resize);
      setReady(true);
    } catch { setError('地圖載入失敗；仍可選取及確認地點。'); }
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', resize);
      map?.stop();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const group = L.layerGroup().addTo(map);
    for (const place of scheduledPlaces.filter(isValidCoordinates)) {
      const name = document.createElement('span');
      name.textContent = place.name;
      const icon = L.divIcon({ className: 'leaflet-place-marker leaflet-schedule-marker', html: '', iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker([place.latitude, place.longitude], { icon, title: place.name }).bindPopup(name).addTo(group);
    }
    return () => { group.remove(); };
  }, [scheduledPlaces, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const places = [...scheduledPlaces, ...(marker ? [marker] : [])].filter(isValidCoordinates);
    if (places.length > 1) map.fitBounds(L.latLngBounds(places.map(place => [place.latitude, place.longitude])), { padding: [30, 30], maxZoom: 15, animate: false });
    else if (places.length === 1) map.setView([places[0].latitude, places[0].longitude], 15, { animate: false });
    else map.setView([37.5665, 126.978], 13, { animate: false });
  }, [scheduledPlaces, marker, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !marker || !isValidCoordinates(marker)) return;
    try {
      const name = document.createElement('span');
      name.textContent = marker.name;
      const dot = L.divIcon({ className: 'leaflet-place-marker leaflet-search-marker', html: '', iconSize: [24, 24], iconAnchor: [12, 12] });
      const point = L.marker([marker.latitude, marker.longitude], { icon: dot, title: marker.name, zIndexOffset: 1000 }).bindPopup(name, { autoPan: false }).addTo(map);
      point.openPopup();
      return () => { point.remove(); };
    } catch { setError('地圖標記顯示失敗；仍可選取及確認地點。'); }
  }, [marker, ready]);

  return <div className="map-frame leaflet-map-frame">
    <div ref={containerRef} className="leaflet-map" aria-label="OpenStreetMap 地圖" />
    {error && <p className="leaflet-map-status" role="alert">{error}</p>}
  </div>;
}
