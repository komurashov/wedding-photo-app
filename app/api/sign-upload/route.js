import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getSupabase, TABLE } from "../../../lib/supabase";
import { maxPhotos, isValidDeviceId } from "../../../lib/limits";

export const dynamic = "force-dynamic";

// POST /api/sign-upload  { device_id }
// Проверяет лимит по базе и, если есть место, возвращает подпись Cloudinary.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const deviceId = body.device_id;

    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "bad device_id" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { count, error } = await supabase
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId);
    if (error) throw error;

    const max = maxPhotos();
    const used = count || 0;
    const remaining = Math.max(0, max - used);

    if (remaining <= 0) {
      return NextResponse.json(
        { error: "limit_reached", count: used, max, remaining: 0 },
        { status: 403 }
      );
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const folder = process.env.CLOUDINARY_UPLOAD_FOLDER || "wedding";

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Не заданы переменные Cloudinary");
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = { folder, timestamp };
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret
    );

    return NextResponse.json({
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder,
      remaining,
      max,
      count: used,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "server error" },
      { status: 500 }
    );
  }
}
