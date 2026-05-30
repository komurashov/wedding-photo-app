import { NextResponse } from "next/server";
import { getSupabase, TABLE } from "../../../../lib/supabase";
import { checkAdminPassword } from "../../../../lib/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// POST /api/admin/photos { password } -> { total, photos: [...] }
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, guest_name, public_id, secure_url, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;

    return NextResponse.json(
      { total: data.length, photos: data },
      { headers: NO_STORE }
    );
  } catch (e) {
    const msg = (e?.message || "server error").toString().slice(0, 200);
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_STORE });
  }
}
