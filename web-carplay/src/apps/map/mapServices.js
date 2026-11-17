
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

let requestQueue = Promise.resolve();
let lastRequestTime = 0;

const geocodeCache = new Map();

// 地名・住所から座標を検索
export function searchNominatim(query, limit = 5) {
  const key = `${query.trim().toLowerCase()}_${limit}`;

  if (geocodeCache.has(key)) {
    return Promise.resolve(geocodeCache.get(key));
  }

  const request = async () => {
    // 公開Nominatimへの連続リクエストを抑制
    const wait = Math.max(
      0,
      1100 - (Date.now() - lastRequestTime)
    );

    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }

    lastRequestTime = Date.now();

    const params = new URLSearchParams({
      q: query.trim(),
      format: "jsonv2",
      limit: String(limit),
      "accept-language": "ja",
    });

    const response = await fetch(
      `${NOMINATIM_URL}?${params}`
    );

    if (!response.ok) {
      throw new Error("場所の検索に失敗しました。");
    }

    const data = await response.json();

    geocodeCache.set(key, data);

    return data;
  };

  const result = requestQueue.then(request, request);

  requestQueue = result.catch(() => {});

  return result;
}

// 道路に沿った自動車ルートを検索
export async function searchDrivingRoute(start, end) {
  const coordinates = [
    `${start[0]},${start[1]}`,
    `${end[0]},${end[1]}`,
  ].join(";");

  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "true",
    alternatives: "false",
  });

  const response = await fetch(
    `${OSRM_URL}/${coordinates}?${params}`
  );

  if (!response.ok) {
    throw new Error("ルート検索サービスに接続できませんでした。");
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("この2地点間のルートが見つかりませんでした。");
  }

  return data.routes[0];
}
