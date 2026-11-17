import React from "react";
import { navigationItems } from "../../data/apps";

function Sidebar({
  theme,
  setTheme,
  activePage,
  onOpenPage,
  time,
  date,
}) {
  function toggleTheme() {
    setTheme((current) =>
      current === "dark" ? "light" : "dark"
    );
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="clock">
          <strong>{time}</strong>
          <span>{date}</span>
        </div>
      </div>

      <nav className="side-nav">
        {navigationItems.map((item) => (
          <button
            key={item.name}
            className={`nav-button ${
              activePage === item.name ? "selected" : ""
            }`}
            onClick={() => onOpenPage(item.name)}
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
          onClick={toggleTheme}
          title="テーマ切り替え"
          aria-label="テーマ切り替え"
        >
          <span>{theme === "dark" ? "☀" : "☾"}</span>
          <small>テーマ</small>
        </button>

        <div className="connection-dot" title="オンライン" />
      </div>
    </aside>
  );
}

export default Sidebar;