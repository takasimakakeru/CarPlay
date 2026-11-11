
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  CircleMarker,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const apps = [
  { name: "マップ", icon: "⌖", color: "#3985f7" },
  { name: "ミュージック", icon: "♫", color: "#ed477e" },
  { name: "電話", icon: "☎", color: "#32b96c" },
  { name: "カレンダー", icon: "▦", color: "#e75c54" },
  { name: "メッセージ", icon: "●", color: "#35b878" },
  { name: "設定", icon: "⚙", color: "#777d89" },
  { name: "天気", icon: "☀", color: "#e9a43b" },
  { name: "写真", icon: "◈", color: "#9a70e8" },
];

const DEFAULT_POSITION = [35.6812, 139.7671];

function MapController({ target }) {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.flyTo(target, 15, { duration: 1.2 });
    }
  }, [target, map]);

  return null;
}

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect([
        event.latlng.lat,
        event.latlng.lng,
      ]);
    },
  });

  return null;
}

function MapPage() {
  const [position, setPosition] = useState(null);
  const [target, setTarget] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function searchPlace(event) {
    event.preventDefault();

    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const params = new URLSearchParams({
        q: query,
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
    const coords = [
      Number(place.lat),
      Number(place.lon),
    ];

    setPosition(coords);
    setTarget(coords);
    setResults([]);
  }

  function locateMe() {
    setError("");

    if (!navigator.geolocation) {
      setError("このブラウザでは位置情報を利用できません。");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (result) => {
        const coords = [
          result.coords.latitude,
          result.coords.longitude,
        ];

        setPosition(coords);
        setTarget(coords);
      },
      () => {
        setError("位置情報を取得できませんでした。ブラウザの許可設定を確認してね。");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  }

  function selectMapPoint(coords) {
    setPosition(coords);
    setResults([]);
  }

  return (
    <section className="map-page">
      <div className="map-toolbar">
        <div className="map-title">
          <span className="map-title-icon">⌖</span>
          <div>
            <h1>マップ</h1>
            <p>EXPLORE YOUR WORLD</p>
          </div>
        </div>

        <form className="map-search" onSubmit={searchPlace}>
          <span>⌕</span>
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
              <span>⌖</span>
              <span>{place.display_name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="map-container">
        <MapContainer
          center={DEFAULT_POSITION}
          zoom={13}
          scrollWheelZoom={true}
          className="leaflet-map"
        >
          
<TileLayer
  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
/>


          <MapController target={target} />
          <MapClickHandler onSelect={selectMapPoint} />

          {position && (
            <CircleMarker
              center={position}
              radius={10}
              pathOptions={{
                color: "#ffffff",
                fillColor: "#3985f7",
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Popup>選択した地点</Popup>
            </CircleMarker>
          )}
        </MapContainer>

        <div className="map-controls">
          <button onClick={locateMe} title="現在地へ移動">
            ◎
          </button>
        </div>

        <div className="map-hint">
          地図をクリックして地点を選択
        </div>
      </div>

      <div className="map-bottom">
        <div>
          <span className="map-status-dot" />
          <span>MAP ONLINE</span>
        </div>
        <span>© OpenStreetMap contributors</span>
      </div>
    </section>
  );
}

function App() {
  const [theme, setTheme] = useState("dark");
  const [activePage, setActivePage] = useState("ホーム");
  const [activeApp, setActiveApp] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const date = now.toLocaleDateString("ja-JP", {
  month: "2-digit", // 常に2桁（例: 05月）にする場合は "2-digit"、1桁を許容するなら "numeric"
  day: "2-digit",   // 常に2桁にする場合は "2-digit"、1桁を許容するなら "numeric"
});

  function openPage(page) {
    setActivePage(page);
    setActiveApp(null);
  }

  return (
    <main className={`dashboard ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
         <div className="clock">
                <strong>{time}</strong>
                <span>{date}</span>
              </div>
        </div>
        <nav className="side-nav">
          {[
            { name: "ホーム", icon: "⌂" },
            { name: "マップ", icon: "⌖" },
            { name: "ミュージック", icon: "♫" },
          ].map((item) => (
            <button
              key={item.name}
              className={`nav-button ${
                activePage === item.name ? "selected" : ""
              }`}
              onClick={() => openPage(item.name)}
              aria-label={item.name}
              title={item.name}
            >
              <span>{item.icon}</span>
              <small>{item.name}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            className="nav-button"
            onClick={() =>
              setTheme(theme === "dark" ? "light" : "dark")
            }
            title="テーマ切り替え"
          >
            <span>{theme === "dark" ? "☀" : "☾"}</span>
            <small>テーマ</small>
          </button>
          <div className="connection-dot" title="オンライン" />
        </div>
      </aside>

      <section className="main-content">
        {activePage === "マップ" ? (
          <MapPage />
        ) : activeApp ? (
          <section className="app-placeholder">
            <button
              className="back-button"
              onClick={() => setActiveApp(null)}
            >
              ← ホームに戻る
            </button>
            <div
              className="large-app-icon"
              style={{
                background: apps.find((a) => a.name === activeApp)?.color,
              }}
            >
              {apps.find((a) => a.name === activeApp)?.icon}
            </div>
            <h1>{activeApp}</h1>
            <p>このアプリの機能はこれから実装していくよ。</p>
          </section>
        ) : activePage === "ホーム" ? (
          <>
            <section className="welcome">
              
            </section>

            <section className="content-grid">
              <div className="apps-panel">
                <div className="section-heading">
                  <h2>アプリ</h2>
                  <span>ALL APPS</span>
                </div>

                <div className="app-grid">
                  {apps.map((app) => (
                    <button
                      className="app-item"
                      key={app.name}
                      onClick={() => {
                        if (app.name === "マップ") {
                          openPage("マップ");
                        } else {
                          setActiveApp(app.name);
                        }
                      }}
                    >
                      <span
                        className="app-icon"
                        style={{ background: app.color }}
                      >
                        {app.icon}
                      </span>
                      <span className="app-name">{app.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="right-panel">
                <section className="widget music-widget">
                  <div className="section-heading">
                    <h2>再生中</h2>
                    <span>NOW PLAYING</span>
                  </div>
                  <div className="music-content">
                    <div className="album-art">♫</div>
                    <div className="track-info">
                      <strong>Music Player</strong>
                      <span>お気に入りの音楽を再生</span>
                    </div>
                  </div>
                  <div className="music-controls">
                    <button aria-label="前の曲">◀◀</button>
                    <button className="play-button" aria-label="再生">▶</button>
                    <button aria-label="次の曲">▶▶</button>
                  </div>
                  <p className="music-note">
                    ※ 音楽再生機能は今後追加予定
                  </p>
                </section>

                <section className="widget weather-widget">
                  <div className="section-heading">
                    <h2>天気</h2>
                    <span>WEATHER</span>
                  </div>
                  <div className="weather-content">
                    <span className="weather-icon">☀</span>
                    <div>
                      <strong>--°</strong>
                      <span>天気情報は未接続</span>
                    </div>
                  </div>
                </section>
                
              </div>
            </section>
          </>
        ) : (
          <section className="app-placeholder">
            <button
              className="back-button"
              onClick={() => openPage("ホーム")}
            >
              ← ホームに戻る
            </button>
            <h1>{activePage}</h1>
            <p>この画面はこれから実装していくよ。</p>
          </section>
        )}

        {activePage !== "マップ" && (
          <footer className="footer">
            <span>DRIVE SYSTEM</span>
            <span>WEB INTERFACE · v0.2</span>
          </footer>
        )}
      </section>
    </main>
  );
}

export default App;