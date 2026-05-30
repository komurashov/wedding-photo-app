import { NextResponse } from "next/server";
import { getSupabase, TABLE } from "../../../lib/supabase";
import { maxPhotos, isValidDeviceId } from "../../../lib/limits";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// GET /api/my-photos?device_id=...
// -> { count, max, remaining, photos: [{ id, public_id, secure_url, created_at }] }
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("device_id");
    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "bad device_id" }, { status: 400, headers: NO_STORE });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, public_id, secure_url, created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const max = maxPhotos();
    const used = data.length;
    return NextResponse.json(
      {
        count: used,
        max,
        remaining: Math.max(0, max - used),
        photos: data,
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    const msg = (e?.message || "server error").toString().slice(0, 200);
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_STORE });
  }
}
