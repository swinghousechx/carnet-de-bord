-- RLS : chaque ligne appartient à son propriétaire. exports/trip_events : lecture seule côté client.
do $$
declare t text;
begin
  foreach t in array array['places', 'vehicles', 'fiscal_years', 'bareme_years', 'bareme_rates',
                           'trips', 'trip_expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy proprietaire on public.%I for all to authenticated
                    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
  foreach t in array array['exports', 'trip_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lecture_proprietaire on public.%I for select to authenticated
                    using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Verrou des trajets exportés. Seules export_month/reopen_trip lèvent le verrou (variable de transaction).
create or replace function public.trips_verrou() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('carnet.bypass_verrou', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.statut = 'exporte' then
    raise exception 'Trajet exporté : verrouillé (le rouvrir d''abord)' using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (new.statut = 'exporte' or new.export_id is not null or new.montant_bareme <> 0) then
    raise exception 'Statut exporté réservé à l''export' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger trips_verrou before insert or update or delete on public.trips
  for each row execute function public.trips_verrou();

create or replace function public.expenses_verrou() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('carnet.bypass_verrou', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE')
     and exists (select 1 from public.trips where id = old.trip_id and statut = 'exporte') then
    raise exception 'Frais d''un trajet exporté : verrouillés' using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and exists (select 1 from public.trips where id = new.trip_id and statut = 'exporte') then
    raise exception 'Frais d''un trajet exporté : verrouillés' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger expenses_verrou before insert or update or delete on public.trip_expenses
  for each row execute function public.expenses_verrou();

-- Choix fiscal figé dès qu'un trajet de l'année/activité est exporté.
create or replace function public.annee_exportee(p_owner uuid, p_annee int, p_activite text) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.trips t
    where t.owner_id = p_owner and t.activite = p_activite and t.statut = 'exporte'
      and t.deleted_at is null and extract(year from t.date)::int = p_annee
  )
$$;

create or replace function public.fiscal_years_verrou() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.mode = old.mode and new.annee = old.annee and new.activite = old.activite
       and new.inclure_domicile_travail = old.inclure_domicile_travail
       and new.deleted_at is not distinct from old.deleted_at then
      return new; -- simple ré-envoi sans changement
    end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    if public.annee_exportee(old.owner_id, old.annee, old.activite) then
      raise exception 'Choix fiscal verrouillé : un export existe déjà pour % / %', old.annee, old.activite
        using errcode = 'P0001';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if public.annee_exportee(new.owner_id, new.annee, new.activite) then
      raise exception 'Choix fiscal verrouillé : un export existe déjà pour % / %', new.annee, new.activite
        using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger fiscal_years_verrou before insert or update or delete on public.fiscal_years
  for each row execute function public.fiscal_years_verrou();
