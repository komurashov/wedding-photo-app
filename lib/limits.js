export function maxPhotos() {
  const n = parseInt(process.env.NEXT_PUBLIC_MAX_PHOTOS || "10", 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

// Простая валидация device_id (UUID-подобная строка), чтобы в базу
// не прилетал мусор произвольной длины.
export function isValidDeviceId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(id);
}

export function cleanName(name) {
  if (typeof name !== "string") return "";
  return name.trim().slice(0, 80);
}
