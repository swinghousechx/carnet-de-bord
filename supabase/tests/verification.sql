do $$
declare
  v_uid uuid := '__UID__';
  v_autre uuid := gen_random_uuid();
  v_res text := '';
  v_exp public.exports;
  v_n int;
  veh uuid := gen_random_uuid();
  t1 uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid();
  t3 uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.vehicles (id, nom, cv, energie, date_debut) values (veh, 'Test', 5, 'thermique', '2020-01-01');
  insert into public.trips (id, date, activite, motif, km_total, vehicle_id, statut)
  values (t1, '2026-09-10', 'swing_house', 'Recette verrou export', 10, veh, 'valide'),
         (t2, '2026-09-11', 'swing_house', 'Recette second trajet', 20, veh, 'valide'),
         (t3, '2026-10-02', 'swing_house', 'Recette trajet du mois suivant', 5, veh, 'valide');

  begin
    insert into public.trips (id, date, activite, statut) values (gen_random_uuid(), '2026-09-12', 'swing_house', 'exporte');
    v_res := v_res || ' KO:insert_exporte';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:insert_exporte_refuse'; end;

  begin
    perform public.export_month('swing_house', '2026-09', 1, jsonb_build_array(jsonb_build_object('id', t1, 'montant_bareme', 6.36)),
                                '{"km":10,"bareme":999.99,"frais":0,"total":999.99,"nb_trajets":1}', 2026, false);
    v_res := v_res || ' KO:total_incoherent';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:total_incoherent_refuse'; end;

  -- 0005 : version null refusée explicitement (auparavant, la comparaison valait null et passait).
  begin
    perform public.export_month('swing_house', '2026-09', null, jsonb_build_array(jsonb_build_object('id', t1, 'montant_bareme', 6.36)),
                                '{"km":10,"bareme":6.36,"frais":0,"total":6.36,"nb_trajets":1}', 2026, false);
    v_res := v_res || ' KO:version_null';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:version_null_refusee'; end;

  -- 0005 : autres paramètres obligatoires null refusés.
  begin
    perform public.export_month('swing_house', '2026-09', 1, null, '{"km":0,"bareme":0,"frais":0,"total":0,"nb_trajets":0}', 2026, false);
    v_res := v_res || ' KO:trajets_null';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:trajets_null_refuses'; end;

  begin
    perform public.export_month('swing_house', '2026-09', 1, jsonb_build_array(jsonb_build_object('id', t1, 'montant_bareme', 6.36)),
                                '{"km":10,"bareme":6.36,"frais":0,"total":6.36,"nb_trajets":1}', 2026, null);
    v_res := v_res || ' KO:provisoire_null';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:provisoire_null_refuse'; end;

  begin
    perform public.export_month('swing_house', '2026-13', 1, jsonb_build_array(jsonb_build_object('id', t1, 'montant_bareme', 6.36)),
                                '{"km":10,"bareme":6.36,"frais":0,"total":6.36,"nb_trajets":1}', 2026, false);
    v_res := v_res || ' KO:mois_invalide';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:mois_invalide_refuse'; end;

  -- 0005 : trajet daté après la fin du mois exporté refusé (rien n'est verrouillé).
  begin
    perform public.export_month('swing_house', '2026-09', 1,
      jsonb_build_array(jsonb_build_object('id', t1, 'montant_bareme', 6.36), jsonb_build_object('id', t3, 'montant_bareme', 3.18)),
      '{"km":15,"bareme":9.54,"frais":0,"total":9.54,"nb_trajets":2}', 2026, false);
    v_res := v_res || ' KO:hors_mois';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:hors_mois_refuse'; end;
  select count(*) into v_n from public.trips where id in (t1, t3) and statut = 'exporte';
  v_res := v_res || ' ok:hors_mois_rien_verrouille=' || v_n;

  v_exp := public.export_month('swing_house', '2026-09', 1, jsonb_build_array(jsonb_build_object('id', t1, 'montant_bareme', 6.36)),
                               '{"km":10,"bareme":6.36,"frais":0,"total":6.36,"nb_trajets":1}', 2026, false);
  v_res := v_res || ' ok:export_v' || v_exp.version;

  begin
    update public.trips set motif = 'Modification interdite' where id = t1;
    v_res := v_res || ' KO:update_verrou';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:update_refuse'; end;

  begin
    update public.trips set deleted_at = now() where id = t1;
    v_res := v_res || ' KO:suppression';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:suppression_refusee'; end;

  begin
    insert into public.trip_expenses (id, trip_id, type, montant) values (gen_random_uuid(), t1, 'peage', 3);
    v_res := v_res || ' KO:frais';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:frais_refuses'; end;

  begin
    perform public.export_month('swing_house', '2026-09', 2, jsonb_build_array(jsonb_build_object('id', t2, 'montant_bareme', 12.72)),
                                '{}', 2026, false);
    v_res := v_res || ' KO:double_export';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:double_export_refuse'; end;

  begin
    insert into public.fiscal_years (id, annee, activite, mode) values (gen_random_uuid(), 2026, 'swing_house', 'frais_reels');
    v_res := v_res || ' KO:fiscal';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:fiscal_verrouille'; end;

  perform public.reopen_trip(t1, 'Erreur de motif');
  select count(*) into v_n from public.trip_events where trip_id = t1;
  v_res := v_res || ' ok:reouverture_events=' || v_n;

  v_exp := public.export_month('swing_house', '2026-09', 2,
    jsonb_build_array(jsonb_build_object('id', t1, 'montant_bareme', 6.36), jsonb_build_object('id', t2, 'montant_bareme', 12.72)),
    '{"km":30,"bareme":19.08,"frais":0,"total":19.08,"nb_trajets":2}', 2026, false);
  select count(*) into v_n from public.exports where mois = '2026-09' and statut = 'remplace';
  v_res := v_res || ' ok:rectificatif_v' || v_exp.version || '_remplaces=' || v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', v_autre, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.trips;
  v_res := v_res || ' ok:rls_autre_voit=' || v_n;

  raise exception 'RECETTE%', v_res;
end $$;
