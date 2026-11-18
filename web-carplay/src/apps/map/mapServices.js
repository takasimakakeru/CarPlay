
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const VALHALLA_URL = "https://valhalla1.openstreetmap.de/route";

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

// Valhallaのencoded polylineを座標配列に変換
function decodePolyline(encoded, precision = 6) {
  const coordinates = [];

  let index = 0;
  let lat = 0;
  let lon = 0;

  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      if (index >= encoded.length) {
        throw new Error("ルート形状のデータが不正です。");
      }

      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat =
      result & 1 ? ~(result >> 1) : result >> 1;

    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      if (index >= encoded.length) {
        throw new Error("ルート形状のデータが不正です。");
      }

      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLon =
      result & 1 ? ~(result >> 1) : result >> 1;

    lon += deltaLon;

    // MapLibreは [経度, 緯度] の順番
    coordinates.push([
      lon / factor,
      lat / factor,
    ]);
  }

  return coordinates;
}

// Valhallaの案内番号を既存UI用に変換
function normalizeManeuverType(type) {
  if ([1, 2, 3].includes(type)) {
    return { type: "depart", modifier: null };
  }

  if ([4, 5, 6].includes(type)) {
    return { type: "arrive", modifier: null };
  }

  const modifiers = {
    9: "slight right",
    10: "right",
    11: "sharp right",
    12: "uturn",
    13: "uturn",
    14: "sharp left",
    15: "left",
    16: "slight left",
    18: "right",
    19: "left",
    20: "right",
    21: "left",
    23: "right",
    24: "left",
    37: "right",
    38: "left",
  };

  if (type === 25 || type === 37 || type === 38) {
    return { type: "merge", modifier: modifiers[type] || null };
  }

  if (type === 23 || type === 24) {
    return { type: "fork", modifier: modifiers[type] };
  }

  if (type === 26 || type === 27) {
    return { type: "roundabout", modifier: null };
  }

  if (type === 7) {
    return { type: "new name", modifier: null };
  }

  if ([8, 17, 22].includes(type)) {
    return { type: "continue", modifier: "straight" };
  }

  return {
    type: "turn",
    modifier: modifiers[type] || null,
  };
}

// Valhallaの案内データを既存UI用に変換
function normalizeManeuvers(maneuvers) {
  return maneuvers.map((maneuver) => {
    const normalized = normalizeManeuverType(
      maneuver.type
    );

    return {
      name:
        maneuver.street_names?.join(" / ") ||
        "名称のない道路",

      distance: (maneuver.length || 0) * 1000,

      type: normalized.type,
      modifier: normalized.modifier,

      // Valhallaが生成した日本語の案内文
      instruction: maneuver.instruction || "",
    };
  });
}

// 道路に沿った自動車ルートを検索
export async function searchDrivingRoute(start, end) {
  const requestBody = {
    locations: [
      {
        lat: start[1],
        lon: start[0],
      },
      {
        lat: end[1],
        lon: end[0],
      },
    ],
    costing: "auto",
    units: "km",
    language: "ja-JP",
  };

  const response = await fetch(VALHALLA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(
      "Valhallaのルート検索サービスに接続できませんでした。"
    );
  }

  const data = await response.json();

  if (
    data.status !== 0 ||
    !data.trip?.legs?.length
  ) {
    throw new Error(
      data.status_message ||
      "この2地点間のルートが見つかりませんでした。"
    );
  }

  const trip = data.trip;
  const leg = trip.legs[0];
  const summary = trip.summary;

  if (!leg.shape || !summary) {
    throw new Error("ルート情報が不完全です。");
  }

  const coordinates = decodePolyline(leg.shape, 6);

  if (coordinates.length < 2) {
    throw new Error("ルートの座標を取得できませんでした。");
  }

  return {
    geometry: {
      type: "LineString",
      coordinates,
    },

    distance: summary.length * 1000,
    duration: summary.time,

    legs: [
      {
        steps: normalizeManeuvers(
          leg.maneuvers || []
        ),
      },
    ],

    summary: {
      hasToll: summary.has_toll,
      hasHighway: summary.has_highway,
      hasFerry: summary.has_ferry,
    },
  };
}
