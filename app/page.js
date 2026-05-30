"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const MAX = parseInt(process.env.NEXT_PUBLIC_MAX_PHOTOS || "10", 10) || 10;
const TITLE = process.env.NEXT_PUBLIC_EVENT_TITLE || "Наша свадьба";
const SUBTITLE =
  process.env.NEXT_PUBLIC_EVENT_SUBTITLE || "Поделитесь своими фото с нами 💛";

// ---- device id: живёт в localStorage и в cookie (на 1 год) ----
function readCookie(name) {
  const m = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]*)")
  );
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name, value) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; path=/; max-age=${oneYear}; SameSite=Lax`;
}
function genId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function ensureDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem("wpa_device_id");
  } catch {}
  if (!id) id = readCookie("wpa_device_id");
  if (!id) id = genId();
  try {
    localStorage.setItem("wpa_device_id", id);
  } catch {}
  writeCookie("wpa_device_id", id);
  return id;
}

export default function Home() {
  const [deviceId, setDeviceId] = useState(null);
  const [name, setName] = useState("");
  const [count, setCount] = useState(0);
  const [remaining, setRemaining] = useState(MAX);
  const [thumbs, setThumbs] = useState([]); // {key, url, status}
  const [banner, setBanner] = useState(null); // {type, text}
  const [busy, setBusy] = useState(false);

  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const nameRef = useRef(null);

  // ---- init ----
  useEffect(() => {
    const id = ensureDeviceId();
    setDeviceId(id);
    try {
      const savedName = localStorage.getItem("wpa_name");
      if (savedName) setName(savedName);
    } catch {}
    refreshCount(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCount = useCallback(async (id) => {
    try {
      const r = await fetch(`/api/count?device_id=${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const d = await r.json();
      setCount(d.count);
      setRemaining(d.remaining);
    } catch {}
  }, []);

  function onNameChange(e) {
    const v = e.target.value;
    setName(v);
    try {
      localStorage.setItem("wpa_name", v);
    } catch {}
  }

  const limitReached = remaining <= 0;

  function pick(kind) {
    setBanner(null);
    if (!name.trim()) {
      setBanner({ type: "err", text: "Сначала введите ваше имя" });
      nameRef.current?.focus();
      return;
    }
    if (limitReached) return;
    (kind === "camera" ? cameraRef : galleryRef).current?.click();
  }

  async function handleFiles(e) {
    const input = e.target;
    const files = Array.from(input.files || []);
    input.value = ""; // чтобы повторный выбор того же файла тоже сработал
    if (!files.length) return;

    setBanner(null);

    // запрашиваем подпись + актуальный остаток с сервера
    setBusy(true);
    let sign;
    try {
      const r = await fetch("/api/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
      });
      sign = await r.json();
      if (!r.ok) {
        if (sign.error === "limit_reached") {
          setCount(sign.count ?? MAX);
          setRemaining(0);
          setBanner({
            type: "done",
            text: `Лимит достигнут: вы уже загрузили ${MAX} фото. Спасибо! 💛`,
          });
        } else {
          setBanner({ type: "err", text: "Ошибка сервера. Попробуйте ещё раз." });
        }
        setBusy(false);
        return;
      }
    } catch {
      setBanner({ type: "err", text: "Нет соединения. Попробуйте ещё раз." });
      setBusy(false);
      return;
    }

    let slots = sign.remaining;
    setRemaining(slots);
    setCount(sign.count);

    let toUpload = files;
    if (files.length > slots) {
      toUpload = files.slice(0, slots);
      setBanner({
        type: "err",
        text: `Можно загрузить ещё ${slots}. Остальные фото пропущены.`,
      });
    }

    for (const file of toUpload) {
      const key = genId();
      const previewUrl = URL.createObjectURL(file);
      setThumbs((t) => [{ key, url: previewUrl, status: "uploading" }, ...t]);

      try {
        const uploaded = await uploadToCloudinary(file, sign);
        const conf = await fetch("/api/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_id: deviceId,
            name: name.trim(),
            public_id: uploaded.public_id,
            secure_url: uploaded.secure_url,
            bytes: uploaded.bytes,
            width: uploaded.width,
            height: uploaded.height,
          }),
        });
        const cd = await conf.json();

        if (!conf.ok) {
          markThumb(key, "failed");
          if (cd.error === "limit_reached") {
            setCount(cd.count ?? MAX);
            setRemaining(0);
            setBanner({
              type: "done",
              text: `Лимит достигнут: ${MAX} фото. Спасибо! 💛`,
            });
            break;
          }
          continue;
        }

        markThumb(key, "done");
        setCount(cd.count);
        setRemaining(cd.remaining);
        if (cd.remaining <= 0) {
          setBanner({
            type: "done",
            text: `Готово! Вы загрузили все ${MAX} фото. Спасибо! 💛`,
          });
        }
      } catch {
        markThumb(key, "failed");
        setBanner({
          type: "err",
          text: "Часть фото не загрузилась. Попробуйте ещё раз.",
        });
      }
    }

    setBusy(false);
  }

  function markThumb(key, status) {
    setThumbs((t) => t.map((x) => (x.key === key ? { ...x, status } : x)));
  }

  const pct = Math.min(100, Math.round((count / MAX) * 100));

  return (
    <div className="wrap">
      <header className="header">
        <h1>{TITLE}</h1>
        <p>{SUBTITLE}</p>
        <div className="divider" />
      </header>

      <div className="card">
        <label htmlFor="name">Ваше имя</label>
        <input
          id="name"
          ref={nameRef}
          type="text"
          placeholder="Например, Анна"
          value={name}
          onChange={onNameChange}
          autoComplete="name"
        />

        <div className="progress" style={{ marginTop: 18 }}>
          <span style={{ width: pct + "%" }} />
        </div>
        <div className="counter" style={{ marginTop: 10 }}>
          <span className="num">
            Загружено <b>{count}</b> из {MAX}
          </span>
          <span className="num" style={{ color: "var(--muted)" }}>
            {remaining > 0 ? `осталось ${remaining}` : "лимит достигнут"}
          </span>
        </div>

        <div className="buttons">
          <button
            className="btn btn-primary"
            onClick={() => pick("camera")}
            disabled={limitReached || busy}
          >
            <CameraIcon />
            Сделать фото
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => pick("gallery")}
            disabled={limitReached || busy}
          >
            <GalleryIcon />
            Из галереи
          </button>
        </div>

        {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}

        {thumbs.length > 0 && (
          <div className="grid">
            {thumbs.map((t) => (
              <div
                key={t.key}
                className={`thumb ${t.status === "failed" ? "failed" : ""}`}
              >
                <img src={t.url} alt="" />
                {t.status === "uploading" && (
                  <div className="spin">
                    <div className="spinner" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="hint">
          Можно загрузить до {MAX} фото. Счётчик сохраняется, даже если вы
          закроете страницу и снова отсканируете QR-код с этого устройства.
        </p>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFiles}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleFiles}
      />

      <div className="footer">Спасибо, что делитесь моментами с нами ✨</div>
    </div>
  );
}

async function uploadToCloudinary(file, sign) {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sign.apiKey);
  form.append("timestamp", String(sign.timestamp));
  form.append("signature", sign.signature);
  form.append("folder", sign.folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
    { method: "POST", body: form }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("cloudinary upload failed: " + txt);
  }
  return res.json();
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8a2 2 0 0 1 2-2h2l1.2-1.6A2 2 0 0 1 11 3.6h2a2 2 0 0 1 1.6.8L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 16l-5-5L7 20" />
    </svg>
  );
}
