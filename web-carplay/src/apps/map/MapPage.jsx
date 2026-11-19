import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
    searchNominatim,
    searchDrivingRoute,
  } from "./mapServices";
import "./map.css";

maplibregl.setWorkerUrl(workerUrl);

const DEFAULT_MAP_CENTER = [139.7671, 35.6812];

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

const [isNavigating, setIsNavigating] = useState(false);

const routeStartMarkerRef = useRef(null);
const routeEndMarkerRef = useRef(null);

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

  try {
    const start = [
      Number(selectedStart.lon),
      Number(selectedStart.lat),
    ];

    const end = [
      Number(selectedEnd.lon),
      Number(selectedEnd.lat),
    ];

    const route = await searchDrivingRoute(start, end);

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
    });

    // mapServices.js の返却形式に合わせる
    const steps = route.legs[0].steps.map((step) => ({
      name: step.name || "名称のない道路",
      distance: step.distance,
      type: step.type,
      modifier: step.modifier,
      instruction: step.instruction || "",
    }));

    setRouteSteps(steps);
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
  
    const removeRoute = () => {
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
      removeRoute();
      return;
    }
  
    const drawRoute = () => {
      if (!map.getSource("planned-route")) {
        map.addSource("planned-route", {
          type: "geojson",
          data: routeData.geometry,
        });
  
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
            "line-width": 10,
            "line-opacity": 0.9,
          },
        });
  
        map.addLayer({
          id: "planned-route",
          type: "line",
          source: "planned-route",
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#3985f7",
            "line-width": 6,
          },
        });
      } else {
        map.getSource("planned-route").setData(routeData.geometry);
      }
  
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
  
      const bounds = new maplibregl.LngLatBounds();
  
      routeData.geometry.coordinates.forEach((coordinate) => {
        bounds.extend(coordinate);
      });
  
      map.fitBounds(bounds, {
        padding: 100,
        maxZoom: 15,
        duration: 1000,
      });
    };
  
    if (map.isStyleLoaded()) {
      drawRoute();
    } else {
      map.once("load", drawRoute);
    }
  
    return () => {
      map.off("load", drawRoute);
    };
  }, [routeData]);  

  const startNavigation = () => {
    if (!routeData || !routeSteps.length) {
      setRouteError("先にルートを計算してください。");
      return;
    }
  
    setIsNavigating(true);
  };
  
  const stopNavigation = () => {
    setIsNavigating(false);
  };

  const navigationStep =
  routeSteps.find((step) => step.type !== "depart") || null;

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
      </div>

      <button
  type="button"
  className="navigation-start-button"
  onClick={startNavigation}
>
  ▶ ナビを開始
</button>

      <div className="route-directions">
        <strong>ルート案内</strong>

        {routeSteps.map((step, index) => {
          const maneuverLabels = {
            depart: "出発",
            arrive: "到着",
            turn: "曲がる",
            continue: "直進",
            merge: "合流",
            fork: "分岐",
            roundabout: "ロータリー",
            "end of road": "突き当たり",
            "new name": "道路変更",
            notification: "案内",
          };

          const modifierLabels = {
            left: "左折",
            right: "右折",
            straight: "直進",
            "slight left": "やや左",
            "slight right": "やや右",
            "sharp left": "大きく左",
            "sharp right": "大きく右",
            uturn: "Uターン",
          };

          const instruction =
            modifierLabels[step.modifier] ||
            maneuverLabels[step.type] ||
            "進む";

          return (
            <div className="route-step" key={index}>
              <span className="route-step-icon">
                {step.type === "arrive" ? "⚑" : "➜"}
              </span>

              <div>
                <strong>
                  {step.type === "depart"
                    ? "出発"
                    : step.type === "arrive"
                    ? "目的地に到着"
                    : instruction}
                </strong>

                <span>{step.name}</span>
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

        {navigationStep ? (
        <>
          <div className="navigation-instruction">
            {navigationStep.instruction || "案内を確認してください"}
          </div>

          <div className="navigation-road-name">
            {navigationStep.name}
          </div>

          <div className="navigation-step-distance">
            次の案内まで：
            {navigationStep.distance >= 1000
              ? `${(navigationStep.distance / 1000).toFixed(1)} km`
              : `${Math.round(navigationStep.distance)} m`}
          </div>
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
          {routeDetails
            ? `${Math.ceil(routeDetails.duration / 60)} 分`
            : "--"}
        </strong>
        <span>当初の推定所要時間</span>
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