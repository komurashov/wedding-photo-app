import { NextResponse } from "next/server";
import { getSupabase, TABLE } from "../../../lib/supabase";
import { maxPhotos, isValidDeviceId, cleanName } from "../../../lib/limits";

export const dynamic = "force-dynamic";

// POST /api/confirm  { device_id, name, public_id, secure_url, bytes, width, height }
// Серверная проверка лимита + вставка фото. Вставку делаем "сырым" fetch'ем
// к PostgREST, чтобы точно контролировать URL/заголовки и видеть статус.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const deviceId = body.device_id;
    const name = cleanName(body.name);
    const publicId = body.public_id;
    const secureUrl = body.secure_url;

    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "bad device_id" }, { status: 400 });
    }
    if (!publicId || !secureUrl) {
      return NextResponse.json({ error: "missing photo data" }, { status: 400 });
    }

    const supabase = getSupabase();
    const max = maxPhotos();

    // 1) сколько уже загружено этим устройством (через supabase-js, это работает)
    const { count, error: countErr } = await supabase
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId);
    if (countErr) throw countErr;

    const used = count || 0;
    if (used >= max) {
      return NextResponse.json(
        { error: "limit_reached", count: used, max, remaining: 0 },
        { status: 403 }
      );
    }

    // 2) вставляем фото "сырым" fetch'ем к PostgREST
    const baseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const endpoint = `${baseUrl}/rest/v1/${TABLE}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        device_id: deviceId,
        guest_name: name,
        public_id: publicId,
        secure_url: secureUrl,
        bytes: Number.isFinite(body.bytes) ? body.bytes : null,
        width: Number.isFinite(body.width) ? body.width : null,
        height: Number.isFinite(body.height) ? body.height : null,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Диагностика: статус, итоговый URL (после редиректов), сниппет тела
      return NextResponse.json(
        {
          error: "insert_failed",
          status: res.status,
          requested: endpoint,
          finalUrl: res.url,
          redirected: res.redirected,
          bodySnippet: text.slice(0, 160),
        },
        { status: 500 }
      );
    }

    const newCount = used + 1;
    return NextResponse.json({
      ok: true,
      count: newCount,
      max,
      remaining: Math.max(0, max - newCount),
    });
  } catch (e) {
    const msg = (e?.message || "server error").toString().slice(0, 300);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
