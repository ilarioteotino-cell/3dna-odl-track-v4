begin;

create table if not exists public.registro_consumi_slm_entries (
  id uuid primary key default gen_random_uuid(),
  job_number text not null check (job_number ~ '^[A-Z][0-9]{6}$'),
  technology text not null default 'SLM' check (technology = 'SLM'),
  printer text not null,
  launch_date date,
  powder_recycle_number integer check (powder_recycle_number is null or powder_recycle_number >= 0),
  layer_thickness_um numeric check (layer_thickness_um is null or layer_thickness_um >= 0),
  job_height_mm numeric check (job_height_mm is null or job_height_mm >= 0),
  job_duration_hr numeric check (job_duration_hr is null or job_duration_hr >= 0),
  job_volume_cc numeric check (job_volume_cc is null or job_volume_cc >= 0),
  tank_pre_launch_kg numeric check (tank_pre_launch_kg is null or tank_pre_launch_kg >= 0),
  tank_end_print_kg numeric check (tank_end_print_kg is null or tank_end_print_kg >= 0),
  tank_post_unpack_kg numeric check (tank_post_unpack_kg is null or tank_post_unpack_kg >= 0),
  plate_marked_number text check (plate_marked_number is null or plate_marked_number ~ '^[0-9]+$'),
  plate_weight_kg numeric check (plate_weight_kg is null or plate_weight_kg >= 0),
  plate_height_mm numeric check (plate_height_mm is null or plate_height_mm >= 0),
  plate_with_job_weight_kg numeric check (plate_with_job_weight_kg is null or plate_with_job_weight_kg >= 0),
  overflow_psv_net_kg numeric check (overflow_psv_net_kg is null or overflow_psv_net_kg >= 0),
  overflow_front_net_kg numeric check (overflow_front_net_kg is null or overflow_front_net_kg >= 0),
  pfm_pre_launch_kg numeric check (pfm_pre_launch_kg is null or pfm_pre_launch_kg >= 0),
  pfm_end_print_kg numeric check (pfm_end_print_kg is null or pfm_end_print_kg >= 0),
  bucket_net_kg numeric check (bucket_net_kg is null or bucket_net_kg >= 0),
  notes text,
  saved_at timestamptz not null default now(),
  saved_by uuid not null references public.profiles(id),
  saved_by_name text not null,
  constraint registro_consumi_slm_printer_fkey
    foreign key (technology, printer)
    references public.technology_printers (technology, printer)
);

create index if not exists idx_registro_consumi_slm_job_saved
  on public.registro_consumi_slm_entries (job_number, saved_at desc);
create index if not exists idx_registro_consumi_slm_saved_by
  on public.registro_consumi_slm_entries (saved_by);
create index if not exists idx_registro_consumi_slm_printer
  on public.registro_consumi_slm_entries (technology, printer);

alter table public.registro_consumi_slm_entries enable row level security;
revoke all on table public.registro_consumi_slm_entries from anon, authenticated;
grant select, insert on table public.registro_consumi_slm_entries to anon, authenticated, service_role;

drop policy if exists "Read SLM consumption records" on public.registro_consumi_slm_entries;
create policy "Read SLM consumption records"
  on public.registro_consumi_slm_entries
  for select to anon, authenticated
  using (true);

drop policy if exists "Add SLM consumption record versions" on public.registro_consumi_slm_entries;
create policy "Add SLM consumption record versions"
  on public.registro_consumi_slm_entries
  for insert to anon, authenticated
  with check (true);

create or replace view public.registro_consumi_slm
with (security_invoker = true)
as
with ranked as (
  select e.*,
         row_number() over (
           partition by e.job_number
           order by e.saved_at desc, e.id desc
         ) as version_rank
  from public.registro_consumi_slm_entries e
), latest as (
  select * from ranked where version_rank = 1
)
select
  e.id,
  e.job_number,
  e.technology,
  e.printer,
  e.launch_date,
  e.powder_recycle_number,
  e.layer_thickness_um,
  e.job_height_mm,
  e.job_duration_hr,
  e.job_volume_cc,
  e.tank_pre_launch_kg,
  e.tank_end_print_kg,
  e.tank_post_unpack_kg,
  e.plate_marked_number,
  e.plate_weight_kg,
  e.plate_height_mm,
  e.plate_with_job_weight_kg,
  e.overflow_psv_net_kg,
  e.overflow_front_net_kg,
  e.pfm_pre_launch_kg,
  e.pfm_end_print_kg,
  e.bucket_net_kg,
  e.notes,
  e.saved_at as last_modified_at,
  e.saved_by as last_modified_by,
  e.saved_by_name as last_modified_by_name,
  (cardinality(m.missing_fields) = 0) as is_complete,
  m.missing_fields
from latest e
cross join lateral (
  select array_remove(array[
    case when e.launch_date is null then 'Data lancio Job' end,
    case when e.powder_recycle_number is null then 'Numero riciclo polvere' end,
    case when e.layer_thickness_um is null then 'Spessore layer [µm]' end,
    case when e.job_height_mm is null then 'Altezza Job [mm]' end,
    case when e.job_duration_hr is null then 'Durata Job [hr]' end,
    case when e.job_volume_cc is null then 'Volume totale Job [cc]' end,
    case when e.tank_pre_launch_kg is null then 'QT. TANK PRE-LANCIO [Kg]' end,
    case when e.tank_end_print_kg is null then 'QT. TANK FINE-STAMPA [Kg]' end,
    case when e.tank_post_unpack_kg is null then 'QT. TANK POST-UNPACK [Kg]' end,
    case when e.plate_marked_number is null or e.plate_marked_number = '' then 'Numero Piastra stampigliato' end,
    case when e.plate_weight_kg is null then 'Peso Piastra [Kg]' end,
    case when e.plate_height_mm is null then 'Altezza piastra [mm]' end,
    case when e.plate_with_job_weight_kg is null then 'Peso Piastra con Job [Kg]' end,
    case when e.overflow_psv_net_kg is null then 'Peso netto OVERFLOW PSV [Kg]' end,
    case when e.overflow_front_net_kg is null then 'Peso netto OVERFLOW Ant. [Kg]' end,
    case when e.pfm_pre_launch_kg is null then 'QT. PFM PRE-LANCIO [Kg]' end,
    case when e.pfm_end_print_kg is null then 'QT. PFM FINE-STAMPA [Kg]' end,
    case when e.bucket_net_kg is null then 'Peso netto BUCKET [Kg]' end
  ]::text[], null) as missing_fields
) m
order by e.launch_date desc nulls last, e.saved_at desc;

grant select on table public.registro_consumi_slm to anon, authenticated, service_role;

comment on table public.registro_consumi_slm_entries is
  'Registro append-only: una nuova versione viene aggiunta per ogni salvataggio del JOB.';
comment on view public.registro_consumi_slm is
  'Ultima versione salvata per JOB, con completezza e campi mancanti.';

notify pgrst, 'reload schema';

commit;

