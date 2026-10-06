import type { PlaceSearchService } from './placeSearch';
import { loadKakaoSdk } from './kakaoSdk';
import { parseKakaoAddresses, parseKakaoPlaces, type ParsedKakaoPlace } from './kakaoPlaceParser';

export class KakaoPlaceSearchService implements PlaceSearchService {
  async search(query: string): Promise<ParsedKakaoPlace[]> {
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
            resolve(parseKakaoAddresses(addresses));
          });
          return;
        }
        if (status !== sdk.maps.services.Status.OK) {
          reject(new Error('Kakao 地點搜尋失敗。請在 Kakao Developers 的 JavaScript SDK 網域加入目前網站 origin（本機例如 http://localhost:5173），再重試。'));
          return;
        }
        resolve(parseKakaoPlaces(records));
      });
    });
  }
}

export const kakaoPlaceSearchService = new KakaoPlaceSearchService();
