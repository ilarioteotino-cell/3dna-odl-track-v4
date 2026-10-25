-- Migrazione incrementale per Gestione NC v4.
-- Conserva lo storico legacy e lo normalizza in una riga per ogni NC.

begin;

alter table public.gest_nc
  add column if not exists nc_number integer,
  add column if not exists nc_code text,
  add column if not exists causa text,
  add column if not exists quantita_nc integer,
  add column if not exists disposizione_tipo text,
  add column if not exists disposizione_nota text,
  add column if not exists disposizione_at timestamptz,
  add column if not exists disposizione_by uuid references public.profiles(id),
  add column if not exists disposizione_by_name text,
  add column if not exists legacy_source_id uuid,
  add column if not exists legacy_slot smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gest_nc_disposizione_tipo_check'
      and conrelid = 'public.gest_nc'::regclass
  ) then
    alter table public.gest_nc
      add constraint gest_nc_disposizione_tipo_check
      check (disposizione_tipo is null or disposizione_tipo in ('scartare', 'usare_cosi_com_e', 'rilavorare'));
  end if;
end;
$$;

-- Per ogni vecchia riga, mantiene l'ID originale per il primo slot popolato.
with first_slot as (
  select g.id, s.nc_code, s.causa, s.quantita_nc, s.slot
  from public.gest_nc g
  cross join lateral (
    select v.slot, v.nc_code, v.causa, v.quantita_nc
    from (values
      (1, g.rac1, g.causa1, g.scarto1),
      (2, g.rac2, g.causa2, g.scarto2),
      (3, g.rac3, g.causa3, g.scarto3),
      (4, g.rac4, g.causa4, g.scarto4),
      (5, g.rac5, g.causa5, g.scarto5)
    ) as v(slot, nc_code, causa, quantita_nc)
    where v.nc_code is not null or v.causa is not null
    order by v.slot
    limit 1
  ) s
)
update public.gest_nc g
set nc_code = coalesce(g.nc_code, s.nc_code),
    causa = coalesce(g.causa, s.causa),
    quantita_nc = coalesce(g.quantita_nc, s.quantita_nc),
    legacy_source_id = coalesce(g.legacy_source_id, g.id),
    legacy_slot = coalesce(g.legacy_slot, s.slot)
from first_slot s
where g.id = s.id;

-- Gli slot legacy successivi diventano righe NC autonome, mantenendo autore,
-- data, ordine e note originarie. legacy_source_id/legacy_slot rendono il backfill ripetibile.
insert into public.gest_nc (
  order_id, item_type, item_code, inserted_at, inserted_by, inserted_by_name,
  note, nc_code, causa, quantita_nc, legacy_source_id, legacy_slot
)
select
  g.order_id, g.item_type, g.item_code, g.inserted_at, g.inserted_by,
  g.inserted_by_name, g.note, v.nc_code, v.causa, v.quantita_nc, g.id, v.slot
from public.gest_nc g
cross join lateral (values
  (1, g.rac1, g.causa1, g.scarto1),
  (2, g.rac2, g.causa2, g.scarto2),
  (3, g.rac3, g.causa3, g.scarto3),
  (4, g.rac4, g.causa4, g.scarto4),
  (5, g.rac5, g.causa5, g.scarto5)
) as v(slot, nc_code, causa, quantita_nc)
where (v.nc_code is not null or v.causa is not null)
  and coalesce(g.legacy_slot, 0) <> v.slot
  and not exists (
    select 1 from public.gest_nc existing
    where existing.legacy_source_id = g.id
      and existing.legacy_slot = v.slot
  );

-- I record che non avevano una RAC/codice ma esistono come righe legacy ricevono
-- una descrizione di ripiego, così rimangono visibili nello storico normalizzato.
update public.gest_nc
set nc_code = 'NC legacy ' || left(id::text, 8)
where nc_code is null;

with numbered as (
  select id,
         coalesce(max(nc_number) over (partition by item_type, item_code), 0)
           + row_number() over (partition by item_type, item_code order by inserted_at, id) as assigned_number
  from public.gest_nc
  where nc_number is null
)
update public.gest_nc g
set nc_number = numbered.assigned_number
from numbered
where g.id = numbered.id;

create unique index if not exists idx_gest_nc_item_progressivo
  on public.gest_nc(item_type, item_code, nc_number);
create unique index if not exists idx_gest_nc_legacy_slot
  on public.gest_nc(legacy_source_id, legacy_slot)
  where legacy_source_id is not null and legacy_slot is not null;

create or replace function public.gest_nc_assign_progressivo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.nc_number is null then
    perform pg_advisory_xact_lock(hashtextextended(new.item_type || ':' || new.item_code, 0));
    select coalesce(max(nc_number), 0) + 1
      into new.nc_number
      from public.gest_nc
      where item_type = new.item_type and item_code = new.item_code;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gest_nc_assign_progressivo on public.gest_nc;
create trigger trg_gest_nc_assign_progressivo
before insert on public.gest_nc
for each row execute function public.gest_nc_assign_progressivo();

create or replace function public.gest_nc_set_disposizione_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.disposizione_at is null and new.disposizione_tipo is not null then
    new.disposizione_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gest_nc_set_disposizione_at on public.gest_nc;
create trigger trg_gest_nc_set_disposizione_at
before update on public.gest_nc
for each row execute function public.gest_nc_set_disposizione_at();

create or replace view public.gest_nc_view
with (security_invoker = true)
as
select
  g.id,
  g.item_type,
  g.item_code,
  to_char(g.inserted_at at time zone 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') as inserted_at,
  g.inserted_by_name,
  g.note,
  g.rac1, g.rac2, g.rac3, g.rac4, g.rac5,
  g.causa1, g.causa2, g.causa3, g.causa4, g.causa5,
  g.scarto1, g.scarto2, g.scarto3, g.scarto4, g.scarto5,
  g.order_id,
  g.nc_number,
  g.nc_code,
  g.causa,
  g.quantita_nc,
  g.inserted_by,
  g.disposizione_at,
  g.disposizione_by,
  g.disposizione_by_name,
  g.disposizione_tipo,
  g.disposizione_nota
from public.gest_nc g
order by g.inserted_at desc;

commit;

