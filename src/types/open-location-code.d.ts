declare module 'open-location-code' {
  export class OpenLocationCode {
    isFull(code: string): boolean;
    decode(code: string): {
      latitudeCenter: number;
      longitudeCenter: number;
    };
  }
}