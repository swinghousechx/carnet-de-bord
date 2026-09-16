-- Carnet de bord : schéma. Ids générés côté client (local-first), sauf exports/journal.
create extension if not exists btree_gist with schema extensions;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create table public.places (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  adresse text not null default '',
  google_place_id text,
  lat double precision,
  lng double precision,
  role text check (role in ('domicile', 'swing_house', 'lmnp')),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vehicles (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null,
  immatriculation text not null default '',
  cv int not null check (cv between 1 and 50),
  energie text not null check (energie in ('thermique', 'electrique')),
  date_debut date not null,
  date_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (date_fin is null or date_fin >= date_debut),
  -- Un seul véhicule actif à une date donnée (historique séquentiel).
  constraint vehicles_sans_chevauchement exclude using gist (
    owner_id with =,
    daterange(date_debut, date_fin, '[]') with &&
  ) where (deleted_at is null)
);

create table public.fiscal_years (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  annee int not null check (annee between 2000 and 2100),
  activite text not null check (activite in ('swing_house', 'lmnp')),
  mode text not null default 'bareme' check (mode in ('bareme', 'frais_reels')),
  inclure_domicile_travail boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index fiscal_years_unique on public.fiscal_years (owner_id, annee, activite) where deleted_at is null;

create table public.bareme_years (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  annee int not null,
  majoration_electrique numeric(5, 4) not null default 0.2,
  source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index bareme_years_unique on public.bareme_years (owner_id, annee) where deleted_at is null;

create table public.bareme_rates (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  annee int not null,
  cv_min int,
  cv_max int,
  km_min numeric(9, 1) not null,
  km_max numeric(9, 1),
  coef numeric(8, 4) not null,
  constante numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activite text not null check (activite in ('swing_house', 'lmnp')),
  mois text not null check (mois ~ '^\d{4}-\d{2}$'),
  version int not null check (version >= 1),
  statut text not null default 'emis' check (statut in ('emis', 'a_rectifier', 'remplace')),
  bareme_annee int,
  bareme_provisoire boolean not null default false,
  totaux jsonb not null,
  trip_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, activite, mois, version)
);

create table public.trips (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  activite text not null check (activite in ('swing_house', 'lmnp')),
  motif text not null default '',
  depart_place_id uuid references public.places (id),
  depart_label text not null default '',
  depart_adresse text not null default '',
  arrivee_place_id uuid references public.places (id),
  arrivee_label text not null default '',
  arrivee_adresse text not null default '',
  km_route numeric(7, 1),
  km_saisi numeric(7, 1),
  justif_km text,
  aller_retour boolean not null default false,
  km_total numeric(7, 1),
  vehicle_id uuid references public.vehicles (id),
  nature text check (nature in ('pro', 'domicile_travail')),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'valide', 'exporte')),
  brouillon_force boolean not null default false,
  doublon_confirme boolean not null default false,
  montant_bareme numeric(10, 2) not null default 0,
  export_id uuid references public.exports (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index trips_owner_date on public.trips (owner_id, date);

create table public.trip_expenses (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id),
  type text not null check (type in ('peage', 'parking', 'autre')),
  montant numeric(8, 2) not null check (montant > 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index trip_expenses_trip on public.trip_expenses (trip_id);

create table public.trip_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id),
  export_id uuid references public.exports (id),
  action text not null check (action in ('export', 'reopen')),
  motif text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- updated_at posé par le serveur (curseur de synchro).
do $$
declare t text;
begin
  foreach t in array array['places', 'vehicles', 'fiscal_years', 'bareme_years', 'bareme_rates',
                           'exports', 'trips', 'trip_expenses', 'trip_events'] loop
    execute format('create trigger set_updated_at before insert or update on public.%I
                    for each row execute function public.set_updated_at()', t);
    execute format('create index %I on public.%I (owner_id, updated_at)', t || '_sync', t);
  end loop;
end $$;
