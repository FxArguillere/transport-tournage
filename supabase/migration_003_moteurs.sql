-- À exécuter dans Supabase > SQL Editor (une seule fois) AVANT de publier la nouvelle version
-- Moteurs : ajout de « hybride » et « electrique ». L'ancienne valeur « thermique_hybride »
-- est conservée pour que les trajets déjà enregistrés restent valides et lisibles.

alter table trips drop constraint if exists trips_engine_check;
alter table trips add constraint trips_engine_check
  check (engine in ('thermique_hybride','hybride','essence','diesel','electrique'));
