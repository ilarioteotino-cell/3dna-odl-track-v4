-- Da eseguire dopo migration_gest_nc_disposizioni.sql.
-- Una riga di gest_nc rappresenta una singola NC: i vecchi slot RAC/causa/scarto
-- sono già stati riportati nei campi nc_code, causa e quantita_nc.

begin;

-- Ricrea la vista senza le colonne del vecchio modello a cinque slot.
drop view if exists public.gest_nc_view;

create view public.gest_nc_view
with (security_invoker = true)
as
select
  g.id,
  g.item_type,
  g.item_code,
  to_char(g.inserted_at at time zone 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') as inserted_at,
  g.inserted_by_name,
  g.note,
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

-- Mantiene i permessi usati dalla vista esistente.
grant all on table public.gest_nc_view to anon, authenticated, service_role;

alter table public.gest_nc
  drop column if exists rac1,
  drop column if exists rac2,
  drop column if exists rac3,
  drop column if exists rac4,
  drop column if exists rac5,
  drop column if exists causa1,
  drop column if exists causa2,
  drop column if exists causa3,
  drop column if exists causa4,
  drop column if exists causa5,
  drop column if exists scarto1,
  drop column if exists scarto2,
  drop column if exists scarto3,
  drop column if exists scarto4,
  drop column if exists scarto5;

commit;

