-- ============================================================
--  Wedding Photo App — схема Supabase
--  Запустить в Supabase: SQL Editor -> New query -> Run
-- ============================================================

-- Таблица загруженных фото
create table if not exists public.uploads (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,
  guest_name  text,
  public_id   text not null,
  secure_url  text not null,
  bytes       bigint,
  width       int,
  height      int,
  created_at  timestamptz not null default now()
);

create index if not exists uploads_device_id_idx on public.uploads (device_id);
create index if not exists uploads_created_at_idx on public.uploads (created_at desc);

-- Защита от дублей: один и тот же файл (public_id) нельзя записать дважды.
-- Делает confirm идемпотентным (повтор при плохой сети не создаёт дубль).
create unique index if not exists uploads_public_id_key on public.uploads (public_id);

-- Включаем RLS. Доступ к таблице — только через service_role (сервер).
-- Анонимный ключ ничего не видит и не пишет. Никаких политик не добавляем.
alter table public.uploads enable row level security;

-- ============================================================
--  Атомарная вставка с проверкой лимита.
--  Берём advisory-блокировку по device_id, чтобы параллельные
--  запросы одного гостя не пробили лимит.
-- ============================================================
create or replace function public.insert_upload_if_allowed(
  p_device_id  text,
  p_guest_name text,
  p_public_id  text,
  p_secure_url text,
  p_bytes      bigint,
  p_width      int,
  p_height     int,
  p_max        int
)
returns table (allowed boolean, count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count int;
begin
  -- блокировка в рамках транзакции, уникальная для device_id
  perform pg_advisory_xact_lock(hashtext(p_device_id));

  select count(*) into current_count
  from public.uploads
  where device_id = p_device_id;

  if current_count >= p_max then
    return query select false, current_count;
    return;
  end if;

  insert into public.uploads
    (device_id, guest_name, public_id, secure_url, bytes, width, height)
  values
    (p_device_id, p_guest_name, p_public_id, p_secure_url, p_bytes, p_width, p_height);

  return query select true, current_count + 1;
end;
$$;
