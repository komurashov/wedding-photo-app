import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// Временный токен для чтения логов отладки. После отладки роут удалим.
const DEBUG_TOKEN = "dbg-9f4k2m7q8w1z6x";

// GET /api/debug-logs?key=...&device_id=...&limit=...
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("key") !== DEBUG_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
    }
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10) || 200, 1000);
    const supabase = getSupabase();
    let q = supabase
      .from("logs")
      .select("created_at, device_id, stage, ok, detail, ua, conn")
      .order("created_at", { ascending: false })
      .limit(limit);
    const dev = searchParams.get("device_id");
    if (dev) q = q.eq("device_id", dev);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ count: data.length, logs: data }, { headers: NO_STORE });
  } catch (e) {
    const msg = (e?.message || "server error").toString().slice(0, 200);
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_STORE });
  }
}
