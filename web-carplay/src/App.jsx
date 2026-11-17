import React, { useEffect, useState } from "react";

import "./App.css";

import { apps } from "./data/apps";

import Sidebar from "./components/layout/Sidebar";
import Footer from "./components/layout/Footer";
import AppPlaceholder from "./components/apps/AppPlaceholder";

import Home from "./pages/Home";
import MapApp from "./apps/map/MapPage";

function App() {
  const [theme, setTheme] = useState("dark");
  const [activePage, setActivePage] = useState("ホーム");
  const [activeApp, setActiveApp] = useState(null);
  const [now, setNow] = useState(new Date());

  // 時計
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const date = now.toLocaleDateString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
  });

  const selectedApp = apps.find(
    (app) => app.name === activeApp
  );

  // ページ切り替え
  function openPage(page) {
    setActivePage(page);
    setActiveApp(null);
  }

  // アプリ起動
  function openApp(app) {
    if (app.name === "マップ") {
      openPage("マップ");
    } else {
      setActiveApp(app.name);
    }
  }

  return (
    <main className={`dashboard ${theme}`}>
      <Sidebar
        theme={theme}
        setTheme={setTheme}
        activePage={activePage}
        onOpenPage={openPage}
        time={time}
        date={date}
      />

      <section className="main-content">
        {activePage === "マップ" ? (
          <MapApp />
        ) : activeApp ? (
          <AppPlaceholder
            app={selectedApp}
            title={activeApp}
            onBack={() => setActiveApp(null)}
          />
        ) : activePage === "ホーム" ? (
          <Home
            apps={apps}
            onOpenApp={openApp}
          />
        ) : (
          <AppPlaceholder
            title={activePage}
            onBack={() => openPage("ホーム")}
          />
        )}

        {activePage !== "マップ" && <Footer />}
      </section>
    </main>
  );
}

export default App;