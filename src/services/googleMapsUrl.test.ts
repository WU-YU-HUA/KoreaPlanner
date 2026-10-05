import { describe, expect, it } from 'vitest';
import { parseGoogleMapsUrl } from './googleMapsUrl';

describe('parseGoogleMapsUrl', () => {
  it('reads coordinates from a place URL path', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps/place/Place/@37.5665,126.978,17z'))
      .toEqual({ latitude: 37.5665, longitude: 126.978 });
  });

  it('reads coordinates from a q parameter', () => {
    expect(parseGoogleMapsUrl('https://maps.google.com/?q=37.5665%2C126.978'))
      .toEqual({ latitude: 37.5665, longitude: 126.978 });
  });

  it('reads coordinates from Google place data fields', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps/place/Place/data=!3d37.5665!4d126.978'))
      .toEqual({ latitude: 37.5665, longitude: 126.978 });
  });

  it('decodes a Google Maps Plus Code from a place URL', () => {
    const coordinates = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Place/data=!20s8Q98HX6M%2BGP8V9WF',
    );
    expect(coordinates.latitude).toBeGreaterThan(37);
    expect(coordinates.latitude).toBeLessThan(38);
    expect(coordinates.longitude).toBeGreaterThan(126);
    expect(coordinates.longitude).toBeLessThan(127);
  });

  it('rejects short links without coordinates and non-Google hosts', () => {
    expect(() => parseGoogleMapsUrl('https://maps.app.goo.gl/example'))
      .toThrow('此網址沒有直接包含座標');
    expect(() => parseGoogleMapsUrl('https://example.com/?q=37.5665,126.978'))
      .toThrow('請貼上來自 Google Maps 的網址');
  });
});