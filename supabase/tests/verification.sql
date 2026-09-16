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
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.vehicles (id, nom, cv, energie, date_debut) values (veh, 'Test', 5, 'thermique', '2020-01-01');
  insert into public.trips (id, date, activite, motif, km_total, vehicle_id, statut)
  values (t1, '2026-09-10', 'swing_house', 'Recette verrou export', 10, veh, 'valide'),
         (t2, '2026-09-11', 'swing_house', 'Recette second trajet', 20, veh, 'valide');

  begin
    insert into public.trips (id, date, activite, statut) values (gen_random_uuid(), '2026-09-12', 'swing_house', 'exporte');
    v_res := v_res || ' KO:insert_exporte';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:insert_exporte_refuse'; end;

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
