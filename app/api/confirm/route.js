import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";
import { maxPhotos, isValidDeviceId, cleanName } from "../../../lib/limits";

export const dynamic = "force-dynamic";

// POST /api/confirm  { device_id, name, public_id, secure_url, bytes, width, height }
// Главная серверная проверка лимита: вставка идёт через RPC, которая
// атомарно считает кол-во фото устройства и отклоняет вставку при превышении.
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

    const { data, error } = await supabase.rpc("insert_upload_if_allowed", {
      p_device_id: deviceId,
      p_guest_name: name,
      p_public_id: publicId,
      p_secure_url: secureUrl,
      p_bytes: Number.isFinite(body.bytes) ? body.bytes : null,
      p_width: Number.isFinite(body.width) ? body.width : null,
      p_height: Number.isFinite(body.height) ? body.height : null,
      p_max: max,
    });

    if (error) throw error;

    // RPC возвращает { allowed, count }
    const row = Array.isArray(data) ? data[0] : data;
    const allowed = row?.allowed;
    const used = row?.count ?? 0;

    if (!allowed) {
      return NextResponse.json(
        { error: "limit_reached", count: used, max, remaining: 0 },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: used,
      max,
      remaining: Math.max(0, max - used),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "server error" },
      { status: 500 }
    );
  }
}
