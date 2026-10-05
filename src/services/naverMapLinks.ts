import type { Place } from '../domain/models';

export function getNaverMapUrl(place: Place): string {
  const mapCenter = `${place.longitude},${place.latitude},15,0,0,0,dh`;
  return `https://map.naver.com/p/?c=${mapCenter}`;
}

export function getNaverMapAppUrl(place: Place, appName: string): string {
  const parameters = new URLSearchParams({
    lat: String(place.latitude),
    lng: String(place.longitude),
    name: place.name,
    appname: appName,
  });
  return `nmap://place?${parameters.toString().replace(/\+/g, '%20')}`;
}

export function getNaverMapAndroidIntentUrl(place: Place, appName: string): string {
  const appUrl = getNaverMapAppUrl(place, appName);
  const appParameters = appUrl.slice('nmap://place?'.length);
  return `intent://place?${appParameters}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`;
}