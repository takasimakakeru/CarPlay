
import { useEffect, useState } from "react";
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
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  function openPage(page) {
    setActivePage(page);
    setActiveApp(null);
  }

  return (
    <main className={`dashboard ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">W</div>
          <span>DRIVE</span>
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
        <header className="topbar">
          <div className="topbar-date">{date}</div>
          <div className="topbar-status">
            <span>● オンライン</span>
            <span>Wi-Fi</span>
            <span>▰ 100%</span>
          </div>
        </header>

        {activeApp ? (
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
              <div>
                <p className="eyebrow">YOUR DRIVE SPACE</p>
                <h1>おかえりなさい。</h1>
                <p className="subheading">今日も快適なドライブを。</p>
              </div>
              <div className="clock">
                <strong>{time}</strong>
                <span>{date}</span>
              </div>
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
                      onClick={() => setActiveApp(app.name)}
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

        <footer className="footer">
          <span>DRIVE SYSTEM</span>
          <span>WEB INTERFACE · v0.1</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
