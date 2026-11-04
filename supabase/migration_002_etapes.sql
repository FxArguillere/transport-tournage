-- À exécuter dans Supabase > SQL Editor (une seule fois) AVANT de publier la nouvelle version
-- Étapes d'un trajet (plusieurs moyens de transport) + transports Taxi et Moto

alter table trips drop constraint if exists trips_transport_check;
alter table trips add constraint trips_transport_check
  check (transport in ('voiture','bus','train','tram','velo','pied','taxi','moto'));

alter table trips add column if not exists leg smallint not null default 1 check (leg between 1 and 4);
alter table trips add column if not exists legs_total smallint not null default 1 check (legs_total between 1 and 4);
