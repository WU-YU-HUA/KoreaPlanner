import type { Place } from '../domain/models';
import type { PlaceSearchService } from './placeSearch';
import { loadKakaoSdk } from './kakaoSdk';

function optionalText(value: string | undefined) {
  return value?.trim() || undefined;
}

export class KakaoPlaceSearchService implements PlaceSearchService {
  async search(query: string): Promise<Place[]> {
    const sdk = await loadKakaoSdk();
    return new Promise((resolve, reject) => {
      new sdk.maps.services.Places().keywordSearch(query.trim(), (records, status) => {
        if (status === sdk.maps.services.Status.ZERO_RESULT) {
          new sdk.maps.services.Geocoder().addressSearch(query.trim(), (addresses, addressStatus) => {
            if (addressStatus === sdk.maps.services.Status.ZERO_RESULT) {
              resolve([]);
              return;
            }
            if (addressStatus !== sdk.maps.services.Status.OK) {
              reject(new Error('Kakao 地址搜尋失敗，請確認網路、key 與網域設定後重試。'));
              return;
            }
            resolve(addresses.flatMap((address) => {
              const longitude = Number(address.x);
              const latitude = Number(address.y);
              if (!address.address_name?.trim() || !Number.isFinite(latitude)
                  || !Number.isFinite(longitude) || latitude < -90 || latitude > 90
                  || longitude < -180 || longitude > 180) return [];
              return [{
                provider: 'kakao' as const,
                name: address.road_address?.address_name?.trim() || address.address_name.trim(),
                latitude,
                longitude,
                address: address.address_name.trim(),
                roadAddress: address.road_address?.address_name?.trim() || undefined,
              }];
            }));
          });
          return;
        }
        if (status !== sdk.maps.services.Status.OK) {
          reject(new Error('Kakao 地點搜尋失敗。請在 Kakao Developers 的 JavaScript SDK 網域加入目前網站 origin（本機例如 http://localhost:5173），再重試。'));
          return;
        }
        resolve(records.flatMap((record) => {
          const longitude = Number(record.x);
          const latitude = Number(record.y);
          if (!record.id || !record.place_name?.trim() || !Number.isFinite(latitude)
              || !Number.isFinite(longitude) || latitude < -90 || latitude > 90
              || longitude < -180 || longitude > 180) return [];
          return [{
            provider: 'kakao' as const,
            placeId: record.id,
            name: record.place_name.trim(),
            latitude,
            longitude,
            address: optionalText(record.address_name),
            roadAddress: optionalText(record.road_address_name),
            category: optionalText(record.category_name),
          }];
        }));
      });
    });
  }
}

export const kakaoPlaceSearchService = new KakaoPlaceSearchService();