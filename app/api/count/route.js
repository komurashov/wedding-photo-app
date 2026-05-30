import { NextResponse } from "next/server";
import { getSupabase, TABLE } from "../../../lib/supabase";
import { maxPhotos, isValidDeviceId } from "../../../lib/limits";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// GET /api/count?device_id=...  -> { count, max, remaining }
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("device_id");

    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "bad device_id" }, { status: 400, headers: NO_STORE });
    }

    const supabase = getSupabase();
    const { count, error } = await supabase
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId);

    if (error) throw error;

    const max = maxPhotos();
    const used = count || 0;
    return NextResponse.json(
      { count: used, max, remaining: Math.max(0, max - used) },
      { headers: NO_STORE }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "server error" },
      { status: 500, headers: NO_STORE }
    );
  }
}
