import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  searchNominatim,
  searchDrivingRoutes,
  searchDrivingRoute,
} from "./mapServices";
import "./map.css";

maplibregl.setWorkerUrl(workerUrl);

const DEFAULT_MAP_CENTER = [139.7671, 35.6812];

// 推定到着時刻を HH:mm 形式に変換
function formatArrivalTime(timestamp) {
  if (!timestamp) return "--:--";

  return new Date(timestamp).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// 案内種別ごとの表示情報
const MANEUVER_DISPLAY = {
  depart: { label: "出発", icon: "●" },
  arrive: { label: "到着", icon: "⚑" },
  turn: { label: "方向転換", icon: "↱" },
  continue: { label: "直進", icon: "↑" },
  merge: { label: "合流", icon: "⇢" },
  fork: { label: "分岐", icon: "⑂" },
  roundabout: { label: "ロータリー", icon: "⟳" },
  "end of road": { label: "突き当たり", icon: "↰" },
  "new name": { label: "道路変更", icon: "↑" },
  notification: { label: "案内", icon: "ⓘ" },
};

const MODIFIER_LABELS = {
  left: "左折",
  right: "右折",
  straight: "直進",
  "slight left": "やや左",
  "slight right": "やや右",
  "sharp left": "大きく左",
  "sharp right": "大きく右",
  uturn: "Uターン",
};

function getManeuverDisplay(step) {
  const base = MANEUVER_DISPLAY[step.type] || {
    label: "進行",
    icon: "➜",
  };

  return {
    ...base,
    label: MODIFIER_LABELS[step.modifier] || base.label,
  };
}

// 2地点間の距離をメートルで計算
function getDistanceBetweenPoints(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;

  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);

  const deltaLat = toRad(b[1] - a[1]);
  const deltaLon = toRad(b[0] - a[0]);

  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  return 6371000 * 2 *
    Math.atan2(
      Math.sqrt(value),
      Math.sqrt(1 - value)
    );
}

// 現在地に最も近いルート座標を探す
function findNearestRouteIndex(position, coordinates) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  coordinates.forEach((coordinate, index) => {
    const distance = getDistanceBetweenPoints(
      position,
      coordinate
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

// 現在地から次の案内地点までのルート距離
function getDistanceAlongRoute(
  coordinates,
  startIndex,
  endIndex
) {
  let distance = 0;

  for (
    let i = startIndex;
    i < endIndex && i < coordinates.length - 1;
    i++
  ) {
    distance += getDistanceBetweenPoints(
      coordinates[i],
      coordinates[i + 1]
    );
  }

  return distance;
}

// 現在地からルート上の最短距離をメートルで計算
function getDistanceToRoute(position, coordinates) {
  if (!coordinates || coordinates.length < 2) {
    return Infinity;
  }

  const latScale = 111320;
  const lonScale =
    111320 * Math.cos((position[1] * Math.PI) / 180);

  let minDistance = Infinity;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];

    // 現在地を原点とした平面座標に変換
    const ax = (a[0] - position[0]) * lonScale;
    const ay = (a[1] - position[1]) * latScale;
    const bx = (b[0] - position[0]) * lonScale;
    const by = (b[1] - position[1]) * latScale;

    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;

    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              -(ax * dx + ay * dy) / lengthSquared
            )
          );

    const nearestX = ax + t * dx;
    const nearestY = ay + t * dy;

    const distance = Math.hypot(nearestX, nearestY);

    minDistance = Math.min(minDistance, distance);
  }

  return minDistance;
}

function MapApp() {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const currentMarkerRef = useRef(null);

  const [position, setPosition] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
const [startCandidates, setStartCandidates] = useState([]);
const [endCandidates, setEndCandidates] = useState([]);
const [selectedStart, setSelectedStart] = useState(null);
const [selectedEnd, setSelectedEnd] = useState(null);

const [routeData, setRouteData] = useState(null);
const [routeLoading, setRouteLoading] = useState(false);
const [locatingStart, setLocatingStart] = useState(false);
const [routeError, setRouteError] = useState("");

const [routeSteps, setRouteSteps] = useState([]);
const [routeDetails, setRouteDetails] = useState(null);
const [avoidHighways, setAvoidHighways] = useState(false);
const [avoidTolls, setAvoidTolls] = useState(false);
const [avoidFerries, setAvoidFerries] = useState(false);
const [routeOptions, setRouteOptions] = useState([]);
const [selectedRouteId, setSelectedRouteId] = useState(null);

const [isNavigating, setIsNavigating] = useState(false);
// 音声案内
const [speechEnabled, setSpeechEnabled] = useState(true);

const speechEnabledRef = useRef(true);

// 案内ステップごとの読み上げ済み距離
const spokenStepRef = useRef({
  stepIndex: -1,
  thresholds: [],
});

// 到着案内の重複防止
const arrivalAnnouncedRef = useRef(false);

const [navigationStepIndex, setNavigationStepIndex] =
  useState(0);

const [navigationDistance, setNavigationDistance] =
  useState(0);
// 目的地までの残り距離・残り時間
const [remainingDistance, setRemainingDistance] =
  useState(0);

const [remainingDuration, setRemainingDuration] =
  useState(0);
// GPSシミュレーション
const [isGpsSimulation, setIsGpsSimulation] =
  useState(false);

const simulationIndexRef = useRef(0);
const navigationBaseDurationRef = useRef(0);

const routeStartMarkerRef = useRef(null);
const routeEndMarkerRef = useRef(null);

// 自動リルートの監視
const offRouteCountRef = useRef(0);
const isReroutingRef = useRef(false);
const lastRerouteAtRef = useRef(0);
const navigationSessionRef = useRef(0);

  // 地図の初期化
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: DEFAULT_MAP_CENTER,
      zoom: 12,
    });

    map.on("click", (event) => {
      setPosition([event.lngLat.lng, event.lngLat.lat]);
    });

    mapRef.current = map;

    return () => {
      currentMarkerRef.current?.remove();
      currentMarkerRef.current = null;

      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 現在地マーカー
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !currentPosition) return;

    if (!currentMarkerRef.current) {
      const markerElement = document.createElement("div");
      markerElement.className = "current-location-marker";
      markerElement.setAttribute("role", "img");
      markerElement.setAttribute("aria-label", "現在地");

      markerElement.innerHTML = `
        <span class="current-location-pulse"></span>
        <span class="current-location-core"></span>
      `;

      currentMarkerRef.current = new maplibregl.Marker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat(currentPosition)
        .addTo(map);
    } else {
      currentMarkerRef.current.setLngLat(currentPosition);
    }
  }, [currentPosition]);

  // 選択地点のマーカー
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;

    map.flyTo({
      center: position,
      zoom: 15,
      speed: 1.2,
    });

    const addSelectedPoint = () => {
      const pointData = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: position,
        },
      };

      if (!map.getSource("selected-point")) {
        map.addSource("selected-point", {
          type: "geojson",
          data: pointData,
        });

        map.addLayer({
          id: "selected-point",
          type: "circle",
          source: "selected-point",
          paint: {
            "circle-radius": 10,
            "circle-color": "#3985f7",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
            "circle-blur": 0.1,
          },
        });
      } else {
        map.getSource("selected-point").setData(pointData);
      }
    };

    if (map.isStyleLoaded()) {
      addSelectedPoint();
    } else {
      map.once("load", addSelectedPoint);
    }
  }, [position]);

  // 場所検索
  async function searchPlace(event) {
    event.preventDefault();

    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        format: "jsonv2",
        limit: "5",
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`
      );

      if (!response.ok) {
        throw new Error("検索サービスに接続できませんでした。");
      }

      const data = await response.json();

      if (data.length === 0) {
        setError("場所が見つかりませんでした。");
        return;
      }

      setResults(data);
    } catch (err) {
      setError(err.message || "検索に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  function selectResult(place) {
    setPosition([Number(place.lon), Number(place.lat)]);
    setResults([]);
  }

  // 現在地取得
  function locateMe() {
    setError("");

    if (!navigator.geolocation) {
      setError("このブラウザでは位置情報を利用できません。");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (result) => {
        const coords = [
          result.coords.longitude,
          result.coords.latitude,
        ];

        setCurrentPosition(coords);

        mapRef.current?.flyTo({
          center: coords,
          zoom: 16,
          speed: 1.2,
        });
      },
      () => {
        setError("位置情報を取得できませんでした。");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  }


function selectCurrentPositionAsStart() {
  setRouteError("");

  if (!navigator.geolocation) {
    setRouteError("このブラウザでは位置情報を利用できません。");
    return;
  }

  setLocatingStart(true);

  navigator.geolocation.getCurrentPosition(
    (result) => {
      const coords = [
        result.coords.longitude,
        result.coords.latitude,
      ];

      const currentPlace = {
        place_id: "current-location",
        display_name: "現在地",
        lon: String(coords[0]),
        lat: String(coords[1]),
      };

      setCurrentPosition(coords);
      setSelectedStart(currentPlace);
      setStartQuery("現在地");
      setStartCandidates([]);

      setRouteData(null);
      setRouteDetails(null);
      setRouteSteps([]);

      mapRef.current?.flyTo({
        center: coords,
        zoom: 16,
        speed: 1.2,
      });

      setLocatingStart(false);
    },
    () => {
      setRouteError("現在地を取得できませんでした。位置情報の許可を確認してください。");
      setLocatingStart(false);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
    }
  );
}


  function zoomIn() {
    mapRef.current?.zoomIn({ duration: 250 });
  }

  function zoomOut() {
    mapRef.current?.zoomOut({ duration: 250 });
  }

  function resetNorth() {
    mapRef.current?.resetNorth({ duration: 300 });
  }

  function recenterMap() {
    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: position || DEFAULT_MAP_CENTER,
      zoom: 15,
      speed: 1.2,
    });
  }

  //ルート案内
// 出発地・目的地の候補を検索
async function handleRouteSearch(event) {
  event.preventDefault();

  // GPSで選択済みなら検索欄が空でも出発地として認める
  const hasStart = selectedStart || startQuery.trim();
  const hasEnd = selectedEnd || endQuery.trim();

  if (!hasStart || !hasEnd) {
    setRouteError("出発地と目的地を選択してください。");
    return;
  }

  setRouteLoading(true);
  setRouteError("");

  setRouteData(null);
  setRouteSteps([]);
  setRouteDetails(null);

  setStartCandidates([]);
  setEndCandidates([]);

  try {
    let startResults = selectedStart ? [selectedStart] : [];
    let endResults = selectedEnd ? [selectedEnd] : [];

    // 手動入力の場合だけ場所検索を行う
    if (!selectedStart) {
      startResults = await searchNominatim(startQuery, 5);
    }

    if (!selectedEnd) {
      endResults = await searchNominatim(endQuery, 5);
    }

    setStartCandidates(startResults);
    setEndCandidates(endResults);

    if (!startResults.length || !endResults.length) {
      throw new Error(
        !startResults.length
          ? "出発地が見つかりませんでした。"
          : "目的地が見つかりませんでした。"
      );
    }
  } catch (err) {
    setRouteError(
      err.message || "場所の検索に失敗しました。"
    );
  } finally {
    setRouteLoading(false);
  }
}

// 出発地の候補を選択
function selectStartCandidate(place) {
  setSelectedStart(place);
  setRouteError("");
  setRouteData(null);
  setRouteDetails(null);
  setRouteSteps([]);
}

// 目的地の候補を選択
function selectEndCandidate(place) {
  setSelectedEnd(place);
  setRouteError("");
  setRouteData(null);
  setRouteDetails(null);
  setRouteSteps([]);
}

// 選択した候補からルートを計算
// 選択したルートを現在のナビ機能に反映
function applyRouteOption(route) {
  const start = [
    Number(selectedStart.lon),
    Number(selectedStart.lat),
  ];

  const end = [
    Number(selectedEnd.lon),
    Number(selectedEnd.lat),
  ];

  setSelectedRouteId(route.id);

  setRouteData({
    geometry: route.geometry,
    start,
    end,
  });

  setRouteDetails({
    distance: route.distance,
    duration: route.duration,
    startName: selectedStart.display_name,
    endName: selectedEnd.display_name,
    estimatedArrival: Date.now() + route.duration * 1000,
  });

  const steps = (route.legs?.[0]?.steps || []).map((step) => ({
    name: step.name || "名称のない道路",
    distance: step.distance,
    type: step.type,
    modifier: step.modifier,
    instruction: step.instruction || "",
    beginShapeIndex: step.beginShapeIndex,
    endShapeIndex: step.endShapeIndex,
  }));

  setRouteSteps(steps);
}

// 複数ルートを計算
async function calculateSelectedRoute() {
  if (!selectedStart || !selectedEnd) {
    setRouteError("出発地と目的地を選択してください。");
    return;
  }

  setRouteLoading(true);
  setRouteError("");
  setRouteData(null);
  setRouteSteps([]);
  setRouteDetails(null);
  setRouteOptions([]);
  setSelectedRouteId(null);

  try {
    const start = [
      Number(selectedStart.lon),
      Number(selectedStart.lat),
    ];

    const end = [
      Number(selectedEnd.lon),
      Number(selectedEnd.lat),
    ];

    const routes = await searchDrivingRoutes(start, end, {
      avoidHighways,
      avoidTolls,
      avoidFerries,
    });

    if (!routes.length) {
      throw new Error("ルートが見つかりませんでした。");
    }

    setRouteOptions(routes);

    // 最初のルートを初期選択
    applyRouteOption(routes[0]);

  } catch (err) {
    setRouteError(
      err.message || "ルート検索に失敗しました。"
    );
  } finally {
    setRouteLoading(false);
  }
}
  
function clearRoute() {
  // ルート情報を消去
  setRouteData(null);
  setIsNavigating(false);
  setRouteDetails(null);
  setRouteSteps([]);
  setRouteError("");
  setRouteOptions([]);
setSelectedRouteId(null);
navigationSessionRef.current += 1;
setIsGpsSimulation(false);
offRouteCountRef.current = 0;

  // 出発地・目的地の候補一覧を消去
  setStartCandidates([]);
  setEndCandidates([]);

  // 選択済み候補を解除
  setSelectedStart(null);
  setSelectedEnd(null);

  // 地図上のマーカーを削除
  routeStartMarkerRef.current?.remove();
  routeEndMarkerRef.current?.remove();

  routeStartMarkerRef.current = null;
  routeEndMarkerRef.current = null;
}

useEffect(() => {
  const map = mapRef.current;

  if (!map) return;

  const removeRouteLayers = () => {
    if (map.getLayer("planned-route")) {
      map.removeLayer("planned-route");
    }

    if (map.getLayer("planned-route-outline")) {
      map.removeLayer("planned-route-outline");
    }

    if (map.getSource("planned-route")) {
      map.removeSource("planned-route");
    }

    routeStartMarkerRef.current?.remove();
    routeEndMarkerRef.current?.remove();

    routeStartMarkerRef.current = null;
    routeEndMarkerRef.current = null;
  };

  if (!routeData) {
    removeRouteLayers();
    return;
  }

  const drawRoutes = () => {
    // すべての候補ルートをGeoJSONにまとめる
    const routes = routeOptions.length > 0
      ? routeOptions
      : [{
          id: selectedRouteId,
          geometry: routeData.geometry,
        }];

    const routeGeoJSON = {
      type: "FeatureCollection",
      features: routes.map((route) => ({
        type: "Feature",
        properties: {
          routeId: route.id,
          selected: route.id === selectedRouteId,
        },
        geometry: route.geometry,
      })),
    };

    // ルートデータを追加・更新
    if (!map.getSource("planned-route")) {
      map.addSource("planned-route", {
        type: "geojson",
        data: routeGeoJSON,
      });

      // 白い縁取り
      map.addLayer({
        id: "planned-route-outline",
        type: "line",
        source: "planned-route",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#ffffff",
          "line-width": [
            "case",
            ["get", "selected"],
            11,
            7,
          ],
          "line-opacity": 0.9,
        },
      });

      // 選択状態に応じて色と太さを変更
      map.addLayer({
        id: "planned-route",
        type: "line",
        source: "planned-route",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": [
            "case",
            ["get", "selected"],
            "#3985f7",
            "#8793a5",
          ],
          "line-width": [
            "case",
            ["get", "selected"],
            7,
            4,
          ],
          "line-opacity": [
            "case",
            ["get", "selected"],
            1,
            0.7,
          ],
        },
      });
    } else {
      map.getSource("planned-route").setData(routeGeoJSON);
    }

    // 出発地・目的地マーカー
    const startElement = document.createElement("div");
    startElement.className = "route-marker route-marker-start";
    startElement.textContent = "A";

    const endElement = document.createElement("div");
    endElement.className = "route-marker route-marker-end";
    endElement.textContent = "B";

    routeStartMarkerRef.current?.remove();
    routeEndMarkerRef.current?.remove();

    routeStartMarkerRef.current = new maplibregl.Marker({
      element: startElement,
    })
      .setLngLat(routeData.start)
      .addTo(map);

    routeEndMarkerRef.current = new maplibregl.Marker({
      element: endElement,
    })
      .setLngLat(routeData.end)
      .addTo(map);

    // 全候補ルートが画面に収まるようにする
    const bounds = new maplibregl.LngLatBounds();

    routes.forEach((route) => {
      route.geometry.coordinates.forEach((coordinate) => {
        bounds.extend(coordinate);
      });
    });

    map.fitBounds(bounds, {
      padding: 100,
      maxZoom: 15,
      duration: 1000,
    });
  };

  if (map.isStyleLoaded()) {
    drawRoutes();
  } else {
    map.once("load", drawRoutes);
  }

  return () => {
    map.off("load", drawRoutes);
  };
}, [routeData, routeOptions, selectedRouteId]);

// 日本語の音声案内
function speakNavigation(message) {
  if (!speechEnabledRef.current) return;

  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    !("SpeechSynthesisUtterance" in window)
  ) {
    return;
  }

  const synth = window.speechSynthesis;

  const utterance = new SpeechSynthesisUtterance(message);

  utterance.lang = "ja-JP";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // 利用可能なら日本語音声を優先
  const japaneseVoice = synth
    .getVoices()
    .find((voice) =>
      voice.lang.toLowerCase().startsWith("ja")
    );

  if (japaneseVoice) {
    utterance.voice = japaneseVoice;
  }

  // 古い案内が大量に残らないようにする
  synth.cancel();
  synth.speak(utterance);
}

// 音声案内のON/OFF
function toggleSpeech() {
  const nextValue = !speechEnabledRef.current;

  speechEnabledRef.current = nextValue;
  setSpeechEnabled(nextValue);

  if (!nextValue) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } else {
    speakNavigation("音声案内を開始します。");
  }
}

const startNavigation = (useSimulation = false) => {
  if (!routeData || !routeSteps.length) {
    setRouteError("先にルートを計算してください。");
    return;
  }

  navigationSessionRef.current += 1;
offRouteCountRef.current = 0;
isReroutingRef.current = false;
lastRerouteAtRef.current = 0;

  const firstStep = routeSteps.findIndex(
    (step) => step.type !== "depart"
  );

  setNavigationStepIndex(
    firstStep >= 0 ? firstStep : 0
  );

  setNavigationDistance(0);

  setRemainingDistance(routeDetails.distance);
  setRemainingDuration(routeDetails.duration);

  navigationBaseDurationRef.current =
    routeDetails.duration;

  simulationIndexRef.current = 0;
  // 音声案内の状態を初期化
spokenStepRef.current = {
  stepIndex: -1,
  thresholds: [],
};

arrivalAnnouncedRef.current = false;

// ボタン操作中に読み上げを開始しておく
speakNavigation("ナビを開始します。");

  setRouteDetails((current) =>
    current
      ? {
          ...current,
          estimatedArrival:
            Date.now() + current.duration * 1000,
        }
      : current
  );

  setRouteError("");
  setIsGpsSimulation(useSimulation);
  setIsNavigating(true);
};
  
const stopNavigation = () => {
  navigationSessionRef.current += 1;
  setIsNavigating(false);
  setIsGpsSimulation(false);
  offRouteCountRef.current = 0;
};

// 現在地から目的地まで自動でルートを再計算
const rerouteFromPosition = async (currentCoords) => {
  if (!isNavigating || isReroutingRef.current) {
    return;
  }

  const now = Date.now();

  // 再検索の連続実行を防ぐ
  if (now - lastRerouteAtRef.current < 15000) {
    return;
  }

  const destination = routeData?.end;

  if (!destination) return;

  isReroutingRef.current = true;
  lastRerouteAtRef.current = now;

  const sessionId = navigationSessionRef.current;

  try {
    // 現在地から元の目的地まで再検索
    const route = await searchDrivingRoute(
      currentCoords,
      destination,
      {
        avoidHighways,
        avoidTolls,
        avoidFerries,
      }
    );

    // 検索中にナビが終了・変更されていたら反映しない
    if (sessionId !== navigationSessionRef.current) {
      return;
    }

    const routeId = `reroute-${now}`;

    const updatedRoute = {
      ...route,
      id: routeId,
    };

    const endName =
      routeDetails?.endName ||
      selectedEnd?.display_name ||
      "目的地";

    // 新しい案内ステップ
    const newSteps = (
      route.legs?.[0]?.steps || []
    ).map((step) => ({
      name: step.name || "名称のない道路",
      distance: step.distance,
      type: step.type,
      modifier: step.modifier,
      instruction: step.instruction || "",
      beginShapeIndex: step.beginShapeIndex,
      endShapeIndex: step.endShapeIndex,
    }));

    // 新しいルートを地図とナビに反映
    setRouteData({
      geometry: route.geometry,
      start: currentCoords,
      end: destination,
    });

    setRouteOptions([updatedRoute]);
    setSelectedRouteId(routeId);
    setRouteSteps(newSteps);

    setRouteDetails({
      distance: route.distance,
      duration: route.duration,
      startName: "現在地（リルート）",
      endName,
      estimatedArrival:
        Date.now() + route.duration * 1000,
    });

    // 残り距離・時間も新ルートで初期化
    setRemainingDistance(route.distance);
    setRemainingDuration(route.duration);

    navigationBaseDurationRef.current = route.duration;

    const firstStep = newSteps.findIndex(
      (step) => step.type !== "depart"
    );

    setNavigationStepIndex(
      firstStep >= 0 ? firstStep : 0
    );

    setNavigationDistance(0);
    simulationIndexRef.current = 0;

    setRouteError("");

    // 新しいルート用に案内履歴をリセット
spokenStepRef.current = {
  stepIndex: -1,
  thresholds: [],
};

arrivalAnnouncedRef.current = false;

speakNavigation("ルートを変更しました。新しいルートで案内します。");

  } catch (err) {
    // 失敗しても元のルートは残す
    if (sessionId === navigationSessionRef.current) {
      setRouteError(
        `自動リルートに失敗しました。元のルートで案内を続けます。${err.message || ""}`
      );
    }
  } finally {
    if (sessionId === navigationSessionRef.current) {
      isReroutingRef.current = false;
      offRouteCountRef.current = 0;
    }
  }
};

  // 実GPS・シミュレーター共通の位置更新処理
  const processNavigationPosition = (
    currentCoords,
    accuracy = null
  ) => {
    const coordinates = routeData?.geometry?.coordinates;
  
    if (!coordinates || coordinates.length < 2) return;
  
    // GPS測位の精度が十分な場合だけ逸脱判定する
    if (
      !isReroutingRef.current &&
      (accuracy === null || accuracy <= 50)
    ) {
      const distanceFromRoute = getDistanceToRoute(
        currentCoords,
        coordinates
      );
  
      if (distanceFromRoute > 50) {
        offRouteCountRef.current += 1;
  
        // 3回連続で逸脱したら自動リルート
        if (offRouteCountRef.current >= 3) {
          offRouteCountRef.current = 0;
          rerouteFromPosition(currentCoords);
        }
      } else if (distanceFromRoute < 35) {
        // ルート付近に戻ったらカウントをリセット
        offRouteCountRef.current = 0;
      }
    }
  
    // ここから下は既存の処理をそのまま残す

  // 現在地マーカーを更新
  setCurrentPosition(currentCoords);

  // 地図を現在地に追従
  mapRef.current?.easeTo({
    center: currentCoords,
    duration: 500,
  });

  // ルート上の現在位置を判定
  const nearestIndex = findNearestRouteIndex(
    currentCoords,
    coordinates
  );

  // 目的地までの残り距離
  const remaining = getDistanceAlongRoute(
    coordinates,
    nearestIndex,
    coordinates.length - 1
  );

  setRemainingDistance(remaining);

  // 残り時間を距離比率から推定
  const totalRouteDistance = getDistanceAlongRoute(
    coordinates,
    0,
    coordinates.length - 1
  );

  const totalDuration =
    navigationBaseDurationRef.current;

  const remainingTime =
    totalRouteDistance > 0
      ? totalDuration * (remaining / totalRouteDistance)
      : 0;

  setRemainingDuration(remainingTime);

  // 到着予定時刻を更新
  setRouteDetails((current) =>
    current
      ? {
          ...current,
          estimatedArrival:
            Date.now() + remainingTime * 1000,
        }
      : current
  );

  // 次の案内ステップを探す
  let nextIndex = routeSteps.findIndex(
    (step) =>
      step.type !== "depart" &&
      Number.isFinite(step.beginShapeIndex) &&
      step.beginShapeIndex >= nearestIndex
  );

  if (nextIndex === -1) {
    nextIndex = routeSteps.length - 1;
  }

  setNavigationStepIndex(nextIndex);

  // 次の案内地点までの距離
  const targetIndex =
    routeSteps[nextIndex]?.beginShapeIndex;

    if (Number.isFinite(targetIndex)) {
      const distanceToStep = getDistanceAlongRoute(
        coordinates,
        nearestIndex,
        targetIndex
      );
    
      setNavigationDistance(distanceToStep);
    
      const currentStep = routeSteps[nextIndex];
    
      // 案内ステップが変わったら読み上げ履歴をリセット
      if (
        spokenStepRef.current.stepIndex !== nextIndex
      ) {
        spokenStepRef.current = {
          stepIndex: nextIndex,
          thresholds: [],
        };
      }
    
      if (
        currentStep &&
        currentStep.type !== "depart" &&
        currentStep.type !== "arrive"
      ) {
        const display = getManeuverDisplay(currentStep);
    
        let threshold = null;
        let message = "";
    
        if (distanceToStep <= 80) {
          threshold = 80;
          message = `まもなく${display.label}です。`;
        } else if (distanceToStep <= 300) {
          threshold = 300;
          message = `約300メートル先、${display.label}です。`;
        } else if (distanceToStep <= 1000) {
          threshold = 1000;
          message = `約1キロメートル先、${display.label}です。`;
        }
    
        if (
          threshold !== null &&
          !spokenStepRef.current.thresholds.includes(threshold)
        ) {
          spokenStepRef.current.thresholds.push(threshold);
          speakNavigation(message);
        }
      }
    }
    
    // 目的地に十分近づいたら到着案内
    if (
      remaining <= 30 &&
      !arrivalAnnouncedRef.current
    ) {
      arrivalAnnouncedRef.current = true;
    
      speakNavigation("目的地に到着しました。ナビを終了します。");
    
      setIsNavigating(false);
      setIsGpsSimulation(false);
    }
};

  // ナビ中の現在地追従と案内更新
// 実GPSによる位置更新
useEffect(() => {
  if (!isNavigating || !routeData || isGpsSimulation) {
    return;
  }

  if (!navigator.geolocation) {
    setRouteError(
      "このブラウザでは位置情報を利用できません。"
    );
    setIsNavigating(false);
    return;
  }

  const watchId = navigator.geolocation.watchPosition(
    (result) => {
      const currentCoords = [
        result.coords.longitude,
        result.coords.latitude,
      ];

      processNavigationPosition(
        currentCoords,
        result.coords.accuracy
      );
    },

    (error) => {
      setRouteError(
        `現在地を継続取得できませんでした。${error.message || ""}`
      );
      setIsNavigating(false);
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 1000,
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}, [isNavigating, routeData, routeSteps, isGpsSimulation]);

// GPSシミュレーション
useEffect(() => {
  if (!isNavigating || !isGpsSimulation || !routeData) {
    return;
  }

  const coordinates = routeData.geometry.coordinates;

  if (!coordinates || coordinates.length < 2) {
    setRouteError("シミュレーションできるルート座標がありません。");
    setIsNavigating(false);
    setIsGpsSimulation(false);
    return;
  }

  // 出発地点から開始
  let index = 0;
  simulationIndexRef.current = 0;

  processNavigationPosition(coordinates[index]);

  // 700ミリ秒ごとにルート上を1座標ずつ進む
  const timerId = window.setInterval(() => {
    index += 1;

    if (index >= coordinates.length) {
      window.clearInterval(timerId);

      setIsNavigating(false);
      setIsGpsSimulation(false);
      return;
    }

    simulationIndexRef.current = index;

    processNavigationPosition(coordinates[index]);
  }, 700);

  return () => {
    window.clearInterval(timerId);
  };
}, [isNavigating, isGpsSimulation, routeData, routeSteps]);

const navigationStep =
routeSteps[navigationStepIndex] || null;

// その次の案内を取得（出発ステップは除外）
const followingNavigationStep =
  routeSteps
    .slice(navigationStepIndex + 1)
    .find((step) => step.type !== "depart") || null;

  return (
    <section className={`map-page${isNavigating ? " navigating" : ""}`}>

<div className="route-planner">
  <div className="route-planner-heading">
    <div>
      <strong>ルート案内</strong>
      <span>ROUTE PLANNER</span>
    </div>

    {routeData && (
      <button onClick={clearRoute}>
        解除
      </button>
    )}
  </div>

  <form onSubmit={handleRouteSearch}>
    <div className="route-input-group">
      <span className="route-start-dot" />

      <input
        value={startQuery}
        onChange={(event) => {
          setStartQuery(event.target.value);
          setStartCandidates([]);
          setSelectedStart(null);
          setRouteData(null);
          setRouteDetails(null);
          setRouteSteps([]);
          setRouteError("");
        }}
        placeholder="出発地を入力..."
        aria-label="出発地"
      />
    </div>    

    <button
  type="button"
  className="route-search-button"
  onClick={selectCurrentPositionAsStart}
  disabled={locatingStart}
>
  {locatingStart
    ? "現在地を取得中..."
    : "◎ 現在地を出発地にする"}
</button>

    <div className="route-input-group">
      <span className="route-end-dot" />

      <input
  value={endQuery}
  onChange={(event) => {
    setEndQuery(event.target.value);
    setEndCandidates([]);
    setSelectedEnd(null);
    setRouteData(null);
    setRouteDetails(null);
    setRouteSteps([]);
    setRouteError("");
  }}
  placeholder="目的地を入力..."
  aria-label="目的地"
/>
    </div>

    <button
      type="submit"
      disabled={routeLoading}
      className="route-search-button"
    >
      {routeLoading ? "ルート検索中..." : "ルートを検索"}
    </button>
  </form>

  <div className="route-options">
    <strong>ルートオプション</strong>

    <label>
      <input
        type="checkbox"
        checked={avoidHighways}
        onChange={(event) =>
          setAvoidHighways(event.target.checked)
        }
      />
      <span>高速道路をできるだけ避ける</span>
    </label>

    <label>
      <input
        type="checkbox"
        checked={avoidTolls}
        onChange={(event) =>
          setAvoidTolls(event.target.checked)
        }
      />
      <span>有料道路をできるだけ避ける</span>
    </label>

    <label>
      <input
        type="checkbox"
        checked={avoidFerries}
        onChange={(event) =>
          setAvoidFerries(event.target.checked)
        }
      />
      <span>フェリーをできるだけ避ける</span>
    </label>
  </div>

  {/* 出発地の候補 */}
{startCandidates.length > 0 && (
  <div className="route-candidates">
    <strong>出発地の候補を選択</strong>

    {startCandidates.map((place) => (
      <button
        type="button"
        key={place.place_id}
        className={
          selectedStart?.place_id === place.place_id
            ? "route-candidate selected"
            : "route-candidate"
        }
        onClick={() => selectStartCandidate(place)}
      >
        <span>{place.display_name}</span>
        {selectedStart?.place_id === place.place_id && (
          <span>選択済み ✓</span>
        )}
      </button>
    ))}
  </div>
)}

{/* 目的地の候補 */}
{endCandidates.length > 0 && (
  <div className="route-candidates">
    <strong>目的地の候補を選択</strong>

    {endCandidates.map((place) => (
      <button
        type="button"
        key={place.place_id}
        className={
          selectedEnd?.place_id === place.place_id
            ? "route-candidate selected"
            : "route-candidate"
        }
        onClick={() => selectEndCandidate(place)}
      >
        <span>{place.display_name}</span>
        {selectedEnd?.place_id === place.place_id && (
          <span>選択済み ✓</span>
        )}
      </button>
    ))}
  </div>
)}

{/* 両方選択されたらルート計算ボタンを表示 */}
{selectedStart && selectedEnd && (
  <button
    type="button"
    className="route-search-button"
    onClick={calculateSelectedRoute}
    disabled={routeLoading}
  >
    {routeLoading ? "ルート計算中..." : "ルートを計算"}
  </button>
)}
{/* 複数ルートの比較・選択 */}
{routeOptions.length > 0 && (
  <div className="route-candidates">
    <strong>ルート候補を選択</strong>

    {routeOptions.map((route, index) => (
      <button
        type="button"
        key={route.id}
        className={
          selectedRouteId === route.id
            ? "route-candidate selected"
            : "route-candidate"
        }
        disabled={isNavigating}
        onClick={() => applyRouteOption(route)}
      >
        <span>
          <strong>ルート {index + 1}</strong>

          <span>
            {(route.distance / 1000).toFixed(1)} km
            {" / "}
            {Math.ceil(route.duration / 60)} 分
          </span>

          {route.summary?.hasToll && (
            <small>有料道路あり</small>
          )}

          {route.summary?.hasHighway && (
            <small>高速道路あり</small>
          )}

          {route.summary?.hasFerry && (
            <small>フェリーあり</small>
          )}
        </span>

        {selectedRouteId === route.id && (
          <span>選択中 ✓</span>
        )}
      </button>
    ))}
  </div>
)}
  {routeError && (
    <p className="route-error">{routeError}</p>
  )}

  {routeDetails && (
    <div className="route-summary">
      <div className="route-summary-main">
        <div>
          <strong>
            {(routeDetails.distance / 1000).toFixed(1)} km
          </strong>
          <span>走行距離</span>
        </div>

        <div>
          <strong>
            {Math.ceil(routeDetails.duration / 60)} 分
          </strong>
          <span>推定所要時間</span>
        </div>
      </div>

      <div className="route-summary-address">
  <span>出発：{routeDetails.startName}</span>
  <span>到着：{routeDetails.endName}</span>
  <span>
    到着予定：{formatArrivalTime(routeDetails.estimatedArrival)}
  </span>
</div>

      <button
  type="button"
  className="navigation-start-button"
  onClick={startNavigation}
>
  ▶ ナビを開始
</button>

<button
  type="button"
  className="navigation-start-button"
  onClick={() => startNavigation(true)}
>
  ▶ GPSシミュレーション
</button>

      <div className="route-directions">
        <strong>ルート案内</strong>

        {routeSteps.map((step, index) => {
  const display = getManeuverDisplay(step);

  return (
    <div
  className={
    isNavigating && index === navigationStepIndex
      ? "route-step active"
      : "route-step"
  }
  key={index}
>
      <span className="route-step-icon">
        {display.icon}
      </span>

      <div>
        <strong>
          {step.type === "depart"
            ? "出発"
            : step.type === "arrive"
            ? "目的地に到着"
            : display.label}
        </strong>

        <span>{step.name}</span>

        {step.instruction && (
          <span>{step.instruction}</span>
        )}

        <small>
          {step.distance >= 1000
            ? `${(step.distance / 1000).toFixed(1)} km`
            : `${Math.round(step.distance)} m`}
        </small>
      </div>
    </div>
  );
})}
      </div>
    </div>
  )}
</div>

      <div className="map-toolbar">
        <form className="map-search" onSubmit={searchPlace}>
          <span aria-hidden="true">⌕</span>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="場所や住所を検索..."
            aria-label="場所や住所を検索"
          />

          <button type="submit" disabled={loading}>
            {loading ? "検索中..." : "検索"}
          </button>
        </form>
      </div>

      {error && <div className="map-error">{error}</div>}

      {results.length > 0 && (
        <div className="search-results">
          {results.map((place) => (
            <button
              key={place.place_id}
              onClick={() => selectResult(place)}
            >
              <span aria-hidden="true">⌖</span>
              <span>{place.display_name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="map-container">
        <div ref={mapContainerRef} className="leaflet-map" />

        {isNavigating && (
        <div className="navigation-overlay">
        <div className="navigation-top-panel">
        <span className="navigation-status">NAVIGATION</span>
        <strong>ナビゲーション中</strong>

        <button
  type="button"
  className="navigation-start-button"
  onClick={toggleSpeech}
>
  {speechEnabled ? "音声案内 ON" : "音声案内 OFF"}
</button>

        
{navigationStep ? (
  <>
    <div className="navigation-current-label">
      次の案内
    </div>

    <div className="navigation-instruction">
      {navigationStep.instruction || "案内を確認してください"}
    </div>

    <div className="navigation-road-name">
      {navigationStep.name}
    </div>

    <div className="navigation-step-distance">
      次の案内まで：
      {navigationDistance >= 1000
        ? `${(navigationDistance / 1000).toFixed(1)} km`
        : `${Math.round(navigationDistance)} m`}
    </div>

    {followingNavigationStep && (
      <div className="navigation-following">
        <span>その次の案内</span>

        <strong>
          {followingNavigationStep.instruction ||
            getManeuverDisplay(followingNavigationStep).label}
        </strong>

        <small>
          {followingNavigationStep.name}
        </small>
      </div>
    )}
  </>
) : (
  <div className="navigation-instruction">
    案内情報がありません
  </div>
)}

      </div>

      <div className="navigation-bottom-panel">
        <div>
        <span>目的地</span>
        <strong>{routeDetails?.endName || "未設定"}</strong>
        </div>

        <div className="navigation-trip-info">
  <strong>
    {Math.ceil(remainingDuration / 60)} 分
  </strong>

  <span>残り時間（推定）</span>

  <strong>
    {remainingDistance >= 1000
      ? `${(remainingDistance / 1000).toFixed(1)} km`
      : `${Math.round(remainingDistance)} m`}
  </strong>

  <span>目的地までの残り距離</span>

  <span>
    到着予定：
    {formatArrivalTime(routeDetails?.estimatedArrival)}
  </span>
</div>

      <button
        type="button"
        onClick={stopNavigation}
      >
        ナビを終了
      </button>
    </div>
  </div>
)}

        <div className="map-controls">
          <button onClick={zoomIn} title="拡大" aria-label="地図を拡大">
            ＋
          </button>

          <button onClick={zoomOut} title="縮小" aria-label="地図を縮小">
            −
          </button>

          <div className="map-control-divider" />

          <button
            onClick={resetNorth}
            title="北向きに戻す"
            aria-label="北向きに戻す"
          >
            N
          </button>

          <button
            onClick={locateMe}
            title="現在地を取得"
            aria-label="現在地を取得"
          >
            ◎
          </button>

          <button
            onClick={recenterMap}
            title="選択地点へ戻る"
            aria-label="選択地点へ戻る"
          >
            ⌖
          </button>
        </div>

        {position && (
          <div className="map-location-card">
            <div className="map-location-card-icon">⌖</div>

            <div className="map-location-card-info">
              <strong>選択地点</strong>
              <span>
                {position[1].toFixed(5)}, {position[0].toFixed(5)}
              </span>
            </div>

            <button
              onClick={() => setPosition(null)}
              title="選択を解除"
              aria-label="選択を解除"
            >
              ×
            </button>
          </div>
        )}

        <div className="map-hint">
          地図をクリックして地点を選択
        </div>
      </div>

      <div className="map-bottom">
        <div>
          <span className="map-status-dot" />
          <span>MAP ONLINE</span>
        </div>

        <span>MAPLIBRE GL JS</span>
      </div>
    </section>
  );
}

export default MapApp;