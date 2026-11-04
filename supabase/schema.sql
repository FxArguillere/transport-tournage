-- À exécuter dans Supabase > SQL Editor

create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 120)
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  lat double precision not null,
  lon double precision not null,
  start_date date not null,
  end_date date not null,
  check (end_date >= start_date)
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_name text not null check (char_length(member_name) between 1 and 120),
  trip_date date not null,
  start_address text not null check (char_length(start_address) <= 300),
  end_address text not null check (char_length(end_address) <= 300),
  km_total numeric(8,2) not null check (km_total >= 0 and km_total < 2000),
  round_trip boolean not null,
  transport text not null check (transport in ('voiture','bus','train','tram','velo','pied','taxi','moto')),
  engine text check (engine in ('thermique_hybride','essence','diesel')),
  carpool boolean not null default false,
  driver_name text check (char_length(driver_name) <= 120),
  location_id uuid references locations(id) on delete set null,
  leg smallint not null default 1 check (leg between 1 and 4),
  legs_total smallint not null default 1 check (legs_total between 1 and 4)
);
create index trips_date_idx on trips (trip_date);

alter table members enable row level security;
alter table locations enable row level security;
alter table trips enable row level security;

-- Public (QR code) : lecture équipe + lieux, insertion de trajets uniquement
create policy "public read members" on members for select to anon, authenticated using (true);
create policy "public read locations" on locations for select to anon, authenticated using (true);
create policy "public insert trips" on trips for insert to anon, authenticated with check (true);

-- Admin (utilisateur authentifié) : tout le reste
create policy "admin members" on members for all to authenticated using (true) with check (true);
create policy "admin locations" on locations for all to authenticated using (true) with check (true);
create policy "admin read trips" on trips for select to authenticated using (true);
create policy "admin delete trips" on trips for delete to authenticated using (true);
