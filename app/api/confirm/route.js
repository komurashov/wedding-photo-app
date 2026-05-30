import { NextResponse } from "next/server";
import { getSupabase, TABLE } from "../../../lib/supabase";
import { maxPhotos, isValidDeviceId, cleanName } from "../../../lib/limits";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// POST /api/confirm  { device_id, name, public_id, secure_url, bytes, width, height }
// Серверная проверка лимита + вставка фото. Считаем фото устройства в базе
// и вставляем строку только если лимит не превышен.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const deviceId = body.device_id;
    const name = cleanName(body.name);
    const publicId = body.public_id;
    const secureUrl = body.secure_url;

    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "bad device_id" }, { status: 400, headers: NO_STORE });
    }
    if (!publicId || !secureUrl) {
      return NextResponse.json({ error: "missing photo data" }, { status: 400, headers: NO_STORE });
    }

    const supabase = getSupabase();
    const max = maxPhotos();

    // 1) сколько уже загружено этим устройством
    const { count, error: countErr } = await supabase
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId);
    if (countErr) throw countErr;

    const used = count || 0;
    if (used >= max) {
      return NextResponse.json(
        { error: "limit_reached", count: used, max, remaining: 0 },
        { status: 403, headers: NO_STORE }
      );
    }

    // 2) вставляем фото
    const { error: insertErr } = await supabase.from(TABLE).insert({
      device_id: deviceId,
      guest_name: name,
      public_id: publicId,
      secure_url: secureUrl,
      bytes: Number.isFinite(body.bytes) ? body.bytes : null,
      width: Number.isFinite(body.width) ? body.width : null,
      height: Number.isFinite(body.height) ? body.height : null,
    });
    if (insertErr) throw insertErr;

    const newCount = used + 1;
    return NextResponse.json(
      { ok: true, count: newCount, max, remaining: Math.max(0, max - newCount) },
      { headers: NO_STORE }
    );
  } catch (e) {
    const msg = (e?.message || "server error").toString().slice(0, 200);
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_STORE });
  }
}
