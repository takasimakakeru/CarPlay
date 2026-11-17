import React from "react";

function AppPlaceholder({ app, title, onBack }) {
  return (
    <section className="app-placeholder">
      <button className="back-button" onClick={onBack}>
        ← ホームに戻る
      </button>

      {app && (
        <div
          className="large-app-icon"
          style={{ background: app.color }}
        >
          {app.icon}
        </div>
      )}

      <h1>{title}</h1>
      <p>このアプリの機能はこれから実装していくよ。</p>
    </section>
  );
}

export default AppPlaceholder;