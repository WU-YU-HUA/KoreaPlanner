import type { Coordinates } from '../domain/models';
import { isValidCoordinates } from '../domain/validation';

// Conservative application display bounds around Korea, not the current viewport.
export function canDisplayOnKakaoMap(point: Coordinates): boolean {
  return isValidCoordinates(point)
    && point.latitude >= 32 && point.latitude <= 39
    && point.longitude >= 124 && point.longitude <= 132;
}
