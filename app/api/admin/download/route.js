import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { checkAdminPassword } from "../../../../lib/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// POST /api/admin/download { password } -> { url }
// Возвращает подписанную ссылку на zip-архив всех фото из папки Cloudinary.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
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

    // Архив всех изображений с префиксом папки
    const url = cloudinary.utils.download_archive_url({
      resource_type: "image",
      type: "upload",
      prefixes: [`${folder}/`],
      target_format: "zip",
      flatten_folders: true,
    });

    return NextResponse.json({ url }, { headers: NO_STORE });
  } catch (e) {
    const msg = (e?.message || "server error").toString().slice(0, 200);
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_STORE });
  }
}
