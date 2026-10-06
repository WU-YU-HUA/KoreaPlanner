import type { Coordinates } from '../domain/models';

export function getGoogleMapUrl(place: Coordinates): string {
  const parameters = new URLSearchParams({
    api: '1',
    query: `${place.latitude},${place.longitude}`,
  });
  return `https://www.google.com/maps/search/?${parameters.toString()}`;
}
