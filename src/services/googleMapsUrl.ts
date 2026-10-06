import type { Coordinates } from '../domain/models';
import { OpenLocationCode } from 'open-location-code';
import { isValidCoordinates } from '../domain/validation';

const openLocationCode = new OpenLocationCode();

const NUMBER = '(-?\\d+(?:\\.\\d+)?)';
const COORDINATE_PATTERNS = [
  { pattern: new RegExp(`@${NUMBER},${NUMBER}`), reverse: false },
  { pattern: new RegExp(`!3d${NUMBER}!4d${NUMBER}`), reverse: false },
  { pattern: new RegExp(`!4d${NUMBER}!3d${NUMBER}`), reverse: true },
];

function isGoogleMapsHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === 'maps.app.goo.gl'
    || host === 'goo.gl'
    || /(^|\.)google\.[a-z]{2,}(\.[a-z]{2})?$/.test(host);
}

function toCoordinates(latitudeValue: string, longitudeValue: string): Coordinates {
  const coordinates = { latitude: Number(latitudeValue), longitude: Number(longitudeValue) };
  if (!isValidCoordinates(coordinates)) {
    throw new Error('Google Maps 網址中的座標超出有效範圍。');
  }
  return coordinates;
}

export function parseGoogleMapsUrl(value: string): Coordinates {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('請貼上完整的 Google Maps 網址。');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !isGoogleMapsHost(url.hostname)) {
    throw new Error('請貼上來自 Google Maps 的網址。');
  }

  for (const { pattern, reverse } of COORDINATE_PATTERNS) {
    const match = pattern.exec(url.href);
    if (match) {
      return reverse ? toCoordinates(match[2], match[1]) : toCoordinates(match[1], match[2]);
    }
  }

  const urlContent = `${url.href} ${decodeURIComponent(url.href)}`;
  const plusCode = urlContent.match(/[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,7}/i)?.[0];
  if (plusCode && openLocationCode.isFull(plusCode)) {
    const decoded = openLocationCode.decode(plusCode);
    return toCoordinates(String(decoded.latitudeCenter), String(decoded.longitudeCenter));
  }

  for (const key of ['q', 'query', 'll', 'center']) {
    const value = url.searchParams.get(key);
    const match = value?.match(new RegExp(`${NUMBER}[,\\s]+${NUMBER}`));
    if (match) return toCoordinates(match[1], match[2]);
  }

  throw new Error('此網址沒有直接包含座標，可能是 Google Maps 短網址。請從 Google Maps 複製包含 @latitude,longitude 或座標參數的完整網址。');
}