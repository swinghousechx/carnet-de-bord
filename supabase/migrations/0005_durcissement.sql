-- Durcissement (revue finale). Ne modifie pas 0001–0004 : redéclare ce qui change.
--
-- 1. annee_exportee : plus exécutable par anon ni public. Reste accordée à authenticated, car le
--    trigger fiscal_years_verrou (security invoker) l'appelle avec les droits de l'utilisateur.
--
-- 2. export_month : corps repris à l'identique de 0004, avec en plus
--    - refus explicite des paramètres obligatoires null (p_version null passait le contrôle de
--      version, la comparaison valant null) et d'un mois ou d'une liste de trajets mal formés ;
--    - verrou FOR UPDATE des trajets visés avant contrôle et gel des montants ;
--    - refus de tout trajet daté après la fin du mois exporté.
--
-- 3. vehicles_sans_chevauchement reste NON différable, volontairement : le client pousse chaque
--    ligne (ou chaque lot) dans une instruction et une transaction séparées, donc une contrainte
--    différée ne serait vérifiée qu'à la fin de cette même instruction et n'aiderait pas l'envoi
--    ligne à ligne. La vraie correction est l'ordre d'envoi côté client (src/sync/push.ts :
--    suppressions, puis véhicules clôturés, puis véhicule sans date de fin), qui fonctionne en lot
--    comme ligne à ligne. Recréer la contrainte sur des données réelles n'apporterait qu'un risque.

revoke execute on function public.annee_exportee(uuid, int, text) from public, anon;
grant execute on function public.annee_exportee(uuid, int, text) to authenticated;

-- Export d'un mois pour une activité : crée l'export, fige les montants, verrouille, journalise.
-- Contrôle de cohérence interne des totaux annoncés (0004) + durcissement des paramètres (0005).
create or replace function public.export_month(
  p_activite text, p_mois text, p_version int, p_trips jsonb,
  p_totaux jsonb, p_bareme_annee int, p_bareme_provisoire boolean
) returns public.exports
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_last public.exports;
  v_new public.exports;
  v_ids uuid[];
  v_ok int;
  v_som_lignes numeric;
  v_bareme_annonce numeric;
  v_frais_annonce numeric;
  v_total_annonce numeric;
  v_fin date;
  v_hors_mois int;
begin
  if v_uid is null then
    raise exception 'Non authentifié' using errcode = 'P0001';
  end if;

  -- Durcissement 0005 : paramètres obligatoires (p_bareme_annee peut être null : mode frais réels).
  if p_activite is null or p_mois is null or p_version is null or p_trips is null
     or p_totaux is null or p_bareme_provisoire is null then
    raise exception 'Paramètres d''export incomplets' using errcode = 'P0001';
  end if;
  if p_mois !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mois invalide : %', p_mois using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_trips) <> 'array' then
    raise exception 'Liste de trajets invalide' using errcode = 'P0001';
  end if;
  v_fin := (to_date(p_mois || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;

  select * into v_last from public.exports
  where owner_id = v_uid and activite = p_activite and mois = p_mois and deleted_at is null
  order by version desc limit 1;

  if found and v_last.statut = 'emis' then
    raise exception 'Mois déjà exporté (v%)', v_last.version using errcode = 'P0001';
  end if;
  if coalesce(v_last.version, 0) + 1 <> p_version then
    raise exception 'Version attendue % (reçue %)', coalesce(v_last.version, 0) + 1, p_version using errcode = 'P0001';
  end if;

  select array_agg((e ->> 'id')::uuid) into v_ids from jsonb_array_elements(p_trips) e;
  if v_ids is null then
    raise exception 'Aucun trajet à exporter' using errcode = 'P0001';
  end if;

  -- Durcissement 0005 : verrouille les trajets visés jusqu'à la fin de la transaction (aucune
  -- modification ni réouverture concurrente entre le contrôle et le gel des montants).
  perform 1 from public.trips t
  where t.id = any (v_ids) and t.owner_id = v_uid
  for update;

  select count(*) into v_ok from public.trips t
  where t.id = any (v_ids) and t.owner_id = v_uid and t.activite = p_activite and t.deleted_at is null
    and ((t.statut = 'valide' and t.export_id is null)
         or (v_last.id is not null and t.statut = 'exporte' and t.export_id = v_last.id));
  if v_ok <> array_length(v_ids, 1) then
    raise exception 'Trajets invalides ou pas encore synchronisés' using errcode = 'P0001';
  end if;

  -- Durcissement 0005 : aucun trajet daté après la fin du mois exporté.
  select count(*) into v_hors_mois from public.trips t
  where t.id = any (v_ids) and t.owner_id = v_uid and t.date > v_fin;
  if v_hors_mois > 0 then
    raise exception '% trajet(s) daté(s) après la fin du mois %', v_hors_mois, p_mois using errcode = 'P0001';
  end if;

  -- Contrôle de cohérence interne : on ne recalcule pas le barème, on vérifie que ce que le
  -- client nous demande de figer est cohérent en interne (aucune donnée de confiance côté serveur).
  begin
    v_bareme_annonce := (p_totaux ->> 'bareme')::numeric;
    v_frais_annonce := (p_totaux ->> 'frais')::numeric;
    v_total_annonce := (p_totaux ->> 'total')::numeric;
  exception when others then
    raise exception 'Totaux invalides ou incomplets' using errcode = 'P0001';
  end;
  if v_bareme_annonce is null or v_frais_annonce is null or v_total_annonce is null then
    raise exception 'Totaux invalides ou incomplets' using errcode = 'P0001';
  end if;

  select coalesce(sum((e ->> 'montant_bareme')::numeric), 0) into v_som_lignes
  from jsonb_array_elements(p_trips) e;

  if abs(v_som_lignes - v_bareme_annonce) > 0.01 then
    raise exception 'Incohérence : total barème annoncé % € pour % € de lignes', v_bareme_annonce, v_som_lignes
      using errcode = 'P0001';
  end if;

  if abs(v_total_annonce - (v_bareme_annonce + v_frais_annonce)) > 0.01 then
    raise exception 'Incohérence : total annoncé % € pour % € (barème + frais)', v_total_annonce,
      (v_bareme_annonce + v_frais_annonce) using errcode = 'P0001';
  end if;

  insert into public.exports (owner_id, activite, mois, version, statut, bareme_annee, bareme_provisoire, totaux, trip_ids)
  values (v_uid, p_activite, p_mois, p_version, 'emis', p_bareme_annee, p_bareme_provisoire, p_totaux, v_ids)
  returning * into v_new;

  if v_last.id is not null then
    update public.exports set statut = 'remplace' where id = v_last.id;
  end if;

  perform set_config('carnet.bypass_verrou', 'on', true);
  update public.trips t
     set statut = 'exporte', export_id = v_new.id, montant_bareme = (e ->> 'montant_bareme')::numeric
    from jsonb_array_elements(p_trips) e
   where t.id = (e ->> 'id')::uuid;
  perform set_config('carnet.bypass_verrou', 'off', true);

  insert into public.trip_events (owner_id, trip_id, export_id, action)
  select v_uid, unnest(v_ids), v_new.id, 'export';

  return v_new;
end $$;

revoke execute on function public.export_month(text, text, int, jsonb, jsonb, int, boolean) from public, anon;
grant execute on function public.export_month(text, text, int, jsonb, jsonb, int, boolean) to authenticated;
