import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// POST /api/log — диагностический лог с устройства (временный, для отладки загрузок)
export async function POST(request) {
  try {
    const b = await request.json().catch(() => ({}));
    const supabase = getSupabase();
    await supabase.from("logs").insert({
      device_id: String(b.device_id || "").slice(0, 64),
      stage: String(b.stage || "").slice(0, 40),
      ok: b.ok === true,
      detail: b.detail ?? null,
      ua: String(b.ua || "").slice(0, 300),
      conn: String(b.conn || "").slice(0, 20),
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false }, { headers: NO_STORE });
  }
}
