"use client";

import { useEffect, useState, useCallback } from "react";

const TITLE = process.env.NEXT_PUBLIC_EVENT_TITLE || "Наша свадьба";

function thumb(url) {
  if (typeof url !== "string") return url;
  // вставляем трансформацию-превью после /upload/
  return url.replace(
    "/upload/",
    "/upload/c_fill,w_400,h_400,q_auto,f_auto/"
  );
}

function fmtDate(s) {
  try {
    const d = new Date(s);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("wpa_admin_pw");
      if (saved) {
        setPassword(saved);
        load(saved);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (pw) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const d = await r.json();
      if (!r.ok) {
        setAuthed(false);
        setError(d.error === "unauthorized" ? "Неверный пароль" : "Ошибка загрузки");
        try { sessionStorage.removeItem("wpa_admin_pw"); } catch {}
        return;
      }
      try { sessionStorage.setItem("wpa_admin_pw", pw); } catch {}
      setAuthed(true);
      setPhotos(d.photos || []);
      setTotal(d.total || 0);
    } catch {
      setError("Нет соединения");
    } finally {
      setLoading(false);
    }
  }, []);

  async function downloadAll() {
    setDownloading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError("Не удалось собрать архив");
        return;
      }
      window.location.href = d.url;
    } catch {
      setError("Нет соединения");
    } finally {
      setDownloading(false);
    }
  }

  if (!authed) {
    return (
      <div className="wrap">
        <header className="header">
          <h1>Админ-панель</h1>
          <p>{TITLE}</p>
          <div className="divider" />
        </header>
        <div className="card">
          <label htmlFor="pw">Пароль</label>
          <input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(password)}
            placeholder="Введите пароль администратора"
          />
          <button
            className="btn btn-wide"
            style={{ justifyContent: "center" }}
            onClick={() => load(password)}
            disabled={loading || !password}
          >
            {loading ? "Проверяю…" : "Войти"}
          </button>
          {error && <div className="banner err">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 920 }}>
      <header className="header">
        <h1>Все фото</h1>
        <p>{TITLE} · загружено {total}</p>
        <div className="divider" />
      </header>

      <div className="card">
        <button
          className="btn btn-wide"
          style={{ justifyContent: "center" }}
          onClick={downloadAll}
          disabled={downloading || total === 0}
        >
          {downloading ? "Собираю архив…" : `⬇︎ Скачать все (${total}) одним zip`}
        </button>
        {error && <div className="banner err">{error}</div>}

        {total === 0 ? (
          <p className="hint">Пока нет ни одного фото.</p>
        ) : (
          <div className="admin-grid">
            {photos.map((p) => (
              <a
                key={p.id}
                className="admin-thumb"
                href={p.secure_url}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={thumb(p.secure_url)}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    // фото удалено из Cloudinary -> прячем плитку
                    const card = e.currentTarget.closest(".admin-thumb");
                    if (card) card.style.display = "none";
                  }}
                />
                <span className="admin-meta">
                  <b>{p.guest_name || "—"}</b>
                  <i>{fmtDate(p.created_at)}</i>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="footer">
        Совет: «Скачать все» собирает zip прямо из Cloudinary. Можно также зайти в
        Cloudinary → Media Library → папка с фото.
      </div>
    </div>
  );
}
