import { createClient } from "@supabase/supabase-js";

// Серверный клиент Supabase. Использует service_role key —
// поэтому НИКОГДА не импортировать этот файл в клиентские компоненты.
let _client = null;

export function getSupabase() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Не заданы SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в переменных окружения"
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const TABLE = "uploads";
