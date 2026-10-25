begin;

create table if not exists public.technology_printers (
  technology text not null,
  printer text not null,
  constraint technology_printers_pkey primary key (technology, printer)
);

alter table public.technology_printers enable row level security;

revoke all on table public.technology_printers from anon, authenticated;
grant select on table public.technology_printers to anon, authenticated;

drop policy if exists "Read technology printers" on public.technology_printers;
create policy "Read technology printers"
  on public.technology_printers
  for select
  to anon, authenticated
  using (true);

insert into public.technology_printers (technology, printer)
values
  ('SLM', 'SLM280'),
  ('SLM', 'SLM800'),
  ('SLM', 'SLM500_1'),
  ('SLM', 'SLM500_2'),
  ('SLM', 'AM400'),
  ('MJF', 'HP5210'),
  ('MJF', 'HP4210'),
  ('FDM', 'Fortus900_1'),
  ('FDM', 'Fortus900_2'),
  ('FDM', 'Fortus450'),
  ('FFF', 'Bambulab H2D'),
  ('FFF', 'Bambulab X1C_1'),
  ('FFF', 'Bambulab X1C_2'),
  ('FFF', 'Bambulab P1S_1'),
  ('FFF', 'Bambulab P1S_2'),
  ('FFF', 'Superfast'),
  ('FFF', 'Elegoo_1'),
  ('FFF', 'Elegoo_2'),
  ('CFF', 'Mark II-X7')
on conflict (technology, printer) do nothing;

commit;

