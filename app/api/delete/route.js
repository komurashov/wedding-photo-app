import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getSupabase, TABLE } from "../../../lib/supabase";
import { maxPhotos, isValidDeviceId } from "../../../lib/limits";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// POST /api/delete { device_id, id }
// Удаляет фото гостя: только своё (проверка по device_id + id),
// сносит из Cloudinary и из базы. Возвращает обновлённый счётчик.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const deviceId = body.device_id;
    const id = body.id;

    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "bad device_id" }, { status: 400, headers: NO_STORE });
    }
    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400, headers: NO_STORE });
    }

    const supabase = getSupabase();

    // 1) находим строку и проверяем, что она принадлежит этому устройству
    const { data: row, error: selErr } = await supabase
      .from(TABLE)
      .select("id, public_id, device_id")
      .eq("id", id)
      .single();
    if (selErr || !row) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    if (row.device_id !== deviceId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
    }

    // 2) удаляем из Cloudinary (не критично, если уже нет)
    try {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      if (cloudName && apiKey && apiSecret && row.public_id) {
        cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
        await cloudinary.uploader.destroy(row.public_id, { invalidate: true });
      }
    } catch (_) {
      // игнорируем — главное убрать запись из базы
    }

    // 3) удаляем строку из базы
    const { error: delErr } = await supabase.from(TABLE).delete().eq("id", id);
    if (delErr) throw delErr;

    // 4) новый счётчик
    const { count } = await supabase
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId);
    const max = maxPhotos();
    const used = count || 0;
    return NextResponse.json(
      { ok: true, count: used, max, remaining: Math.max(0, max - used) },
      { headers: NO_STORE }
    );
  } catch (e) {
    const msg = (e?.message || "server error").toString().slice(0, 200);
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_STORE });
  }
}
