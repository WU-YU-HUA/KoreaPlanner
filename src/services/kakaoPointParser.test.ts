import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KakaoSdk } from './kakaoSdk';
import { createKakaoPointParser } from './kakaoPointParser';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const label = { className: '', textContent: '' };
  vi.stubGlobal('document', { createElement: () => label });
  const markerRemove = vi.fn();
  const overlayRemove = vi.fn();
  const LatLng = vi.fn(function (latitude: number, longitude: number) { return { latitude, longitude }; });
  const Marker = vi.fn(function () { return { setMap: markerRemove }; });
  const CustomOverlay = vi.fn(function () { return { setMap: overlayRemove }; });
  const sdk = { maps: { LatLng, Marker, CustomOverlay } } as unknown as KakaoSdk;
  const map = { setCenter: vi.fn() };
  return { plotPoint: createKakaoPointParser(map, sdk), map, LatLng, Marker, CustomOverlay, label, markerRemove, overlayRemove };
}

describe('Kakao coordinate point parser', () => {
  it('accepts longitude first, draws a marker/name and supports removing both', () => {
    const test = setup();
    const point = test.plotPoint(126.978, 37.5665, '  My place  ');
    expect(test.LatLng).toHaveBeenCalledWith(37.5665, 126.978);
    expect(test.Marker).toHaveBeenCalledWith({ map: test.map, position: { latitude: 37.5665, longitude: 126.978 } });
    expect(test.CustomOverlay).toHaveBeenCalledWith(expect.objectContaining({ content: test.label }));
    expect(test.label.textContent).toBe('My place');
    expect(test.map.setCenter).toHaveBeenCalled();
    point.remove();
    expect(test.markerRemove).toHaveBeenCalledWith(null);
    expect(test.overlayRemove).toHaveBeenCalledWith(null);
  });

  it.each([[181, 0], [0, -91], [NaN, 0], [0, Infinity]])('rejects invalid coordinates (%s, %s) before touching the map', (longitude, latitude) => {
    const test = setup();
    expect(() => test.plotPoint(longitude, latitude, 'Place')).toThrow();
    expect(test.Marker).not.toHaveBeenCalled();
    expect(test.map.setCenter).not.toHaveBeenCalled();
  });

  it('renders names as text rather than interpreting HTML', () => {
    const test = setup();
    test.plotPoint(0, 0, '<img src=x onerror=alert(1)>');
    expect(test.label.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(test.label).not.toHaveProperty('innerHTML');
    expect(() => test.plotPoint(0, 0, ' ')).toThrow('地點名稱');
  });
});
