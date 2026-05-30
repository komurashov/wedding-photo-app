"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const MAX = parseInt(process.env.NEXT_PUBLIC_MAX_PHOTOS || "10", 10) || 10;
const TITLE = process.env.NEXT_PUBLIC_EVENT_TITLE || "Наша свадьба";
const SUBTITLE =
  process.env.NEXT_PUBLIC_EVENT_SUBTITLE || "Поделитесь своими фото с нами 💛";

// ---- device id: живёт в localStorage и в cookie (на 1 год) ----
function readCookie(name) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name, value) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; SameSite=Lax`;
}
function genId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function ensureDeviceId() {
  let id = null;
  try { id = localStorage.getItem("wpa_device_id"); } catch {}
  if (!id) id = readCookie("wpa_device_id");
  if (!id) id = genId();
  try { localStorage.setItem("wpa_device_id", id); } catch {}
  writeCookie("wpa_device_id", id);
  return id;
}

// небольшое превью из Cloudinary
function thumb(url) {
  if (typeof url !== "string") return url;
  return url.replace("/upload/", "/upload/c_fill,w_400,h_400,q_auto,f_auto/");
}

export default function Home() {
  const [deviceId, setDeviceId] = useState(null);
  const [name, setName] = useState("");
  const [count, setCount] = useState(0);
  const [remaining, setRemaining] = useState(MAX);
  const [items, setItems] = useState([]); // {key,status,preview,file?,id?,publicId?}
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);

  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    const id = ensureDeviceId();
    setDeviceId(id);
    try {
      const savedName = localStorage.getItem("wpa_name");
      if (savedName) setName(savedName);
    } catch {}
    loadMine(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // подгрузить счётчик и ранее загруженные фото
  const loadMine = useCallback(async (id) => {
    try {
      const r = await fetch(`/api/my-photos?device_id=${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const d = await r.json();
      setCount(d.count);
      setRemaining(d.remaining);
      setItems(
        (d.photos || []).map((p) => ({
          key: "srv-" + p.id,
          status: "done",
          preview: thumb(p.secure_url),
          id: p.id,
          publicId: p.public_id,
        }))
      );
    } catch {}
  }, []);

  function onNameChange(e) {
    const v = e.target.value;
    setName(v);
    try { localStorage.setItem("wpa_name", v); } catch {}
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

  function patchItem(key, patch) {
    setItems((arr) => arr.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  // загрузка одного файла: подпись -> Cloudinary -> confirm
  async function uploadOne(key, file) {
    patchItem(key, { status: "uploading" });
    try {
      // 1) подпись + проверка лимита
      const sr = await fetch("/api/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
      });
      const sign = await sr.json();
      if (!sr.ok) {
        if (sign.error === "limit_reached") {
          setCount(sign.count ?? MAX);
          setRemaining(0);
          setBanner({ type: "done", text: `Лимит достигнут: ${MAX} фото. Спасибо! 💛` });
        }
        patchItem(key, { status: "failed" });
        return sign.error === "limit_reached" ? "limit" : "fail";
      }

      // 2) загрузка в Cloudinary
      const uploaded = await uploadToCloudinary(file, sign);

      // 3) подтверждение/запись
      const cr = await fetch("/api/confirm", {
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
      const cd = await cr.json();
      if (!cr.ok) {
        patchItem(key, { status: "failed" });
        if (cd.error === "limit_reached") {
          setCount(cd.count ?? MAX);
          setRemaining(0);
          setBanner({ type: "done", text: `Лимит достигнут: ${MAX} фото. Спасибо! 💛` });
          return "limit";
        }
        return "fail";
      }

      patchItem(key, {
        status: "done",
        id: cd.id,
        publicId: cd.public_id,
        preview: uploaded.secure_url ? thumb(uploaded.secure_url) : undefined,
      });
      setCount(cd.count);
      setRemaining(cd.remaining);
      if (cd.remaining <= 0) {
        setBanner({ type: "done", text: `Готово! Загружено все ${MAX} фото. Спасибо! 💛` });
        return "limit";
      }
      return "ok";
    } catch {
      patchItem(key, { status: "failed" });
      setBanner({ type: "err", text: "Не удалось загрузить фото. Можно повторить." });
      return "fail";
    }
  }

  async function handleFiles(e) {
    const input = e.target;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    setBanner(null);

    const available = remaining;
    let toUpload = files;
    if (files.length > available) {
      toUpload = files.slice(0, available);
      setBanner({
        type: "err",
        text: `Можно загрузить ещё ${available}. Остальные фото пропущены.`,
      });
    }
    if (toUpload.length === 0) return;

    setBusy(true);
    const newItems = toUpload.map((file) => ({
      key: genId(),
      status: "uploading",
      preview: URL.createObjectURL(file),
      file,
    }));
    setItems((arr) => [...newItems, ...arr]);
    let ok = 0;
    let limit = false;
    for (const it of newItems) {
      const res = await uploadOne(it.key, it.file);
      if (res === "ok") ok++;
      else if (res === "limit") limit = true;
    }
    setBusy(false);
    if (!limit && ok > 0) {
      setBanner({
        type: "ok",
        text:
          ok === newItems.length
            ? `Готово, ${ok === 1 ? "фото загружено" : "фото загружены"} ✓`
            : `Загружено ${ok} из ${newItems.length} ✓`,
      });
    }
  }

  function retry(item) {
    if (!item.file) return;
    setBanner(null);
    uploadOne(item.key, item.file);
  }

  async function removePhoto(item) {
    if (!item.id) return;
    if (!window.confirm("Удалить это фото?")) return;
    patchItem(item.key, { status: "deleting" });
    try {
      const r = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, id: item.id }),
      });
      const d = await r.json();
      if (!r.ok) {
        patchItem(item.key, { status: "done" });
        setBanner({ type: "err", text: "Не удалось удалить. Попробуйте ещё раз." });
        return;
      }
      setItems((arr) => arr.filter((x) => x.key !== item.key));
      setCount(d.count);
      setRemaining(d.remaining);
      setBanner(null);
    } catch {
      patchItem(item.key, { status: "done" });
      setBanner({ type: "err", text: "Нет соединения." });
    }
  }

  const uploadingCount = items.filter((i) => i.status === "uploading").length;

  // пока идёт загрузка — предупреждаем при попытке закрыть/уйти со страницы
  useEffect(() => {
    if (uploadingCount === 0) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploadingCount]);

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
          <button className="btn btn-primary" onClick={() => pick("camera")} disabled={limitReached || busy}>
            <CameraIcon />
            Сделать фото
          </button>
          <button className="btn btn-secondary" onClick={() => pick("gallery")} disabled={limitReached || busy}>
            <GalleryIcon />
            Из галереи
          </button>
        </div>

        {uploadingCount > 0 && (
          <div className="banner warn">
            <span className="mini-spinner" /> Загружается {uploadingCount}{" "}
            {uploadingCount === 1 ? "фото" : "фото"}… Не закрывайте страницу до завершения.
          </div>
        )}

        {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}

        {items.length > 0 && (
          <div className="grid">
            {items.map((t) => (
              <div key={t.key} className={`thumb ${t.status === "failed" ? "failed" : ""}`}>
                <img src={t.preview} alt="" />

                {(t.status === "uploading" || t.status === "deleting") && (
                  <div className="spin"><div className="spinner" /></div>
                )}

                {t.status === "failed" && (
                  <button className="retry-btn" onClick={() => retry(t)}>
                    ↻ Повторить
                  </button>
                )}

                {t.status === "done" && (
                  <button className="del-btn" onClick={() => removePhoto(t)} aria-label="Удалить">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="hint">
          Можно загрузить до {MAX} фото. Счётчик и ваши фото сохраняются, даже если
          вы закроете страницу и снова отсканируете QR-код с этого устройства.
        </p>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFiles} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />

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
