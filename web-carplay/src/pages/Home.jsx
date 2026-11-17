import React from "react";

function Home({ apps, onOpenApp }) {
  return (
    <>
      <section className="welcome" />

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
                onClick={() => onOpenApp(app)}
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
  );
}

export default Home;