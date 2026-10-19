-- Arquivar também encerra formalmente a edição, sem atribuir vencedores pendentes.
begin;
create or replace function public.cp_archive(p_edition uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.cp_editions%rowtype;v_state jsonb;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro';end if;
 select * into e from public.cp_editions where id=p_edition for update;
 if e.id is null then raise exception 'Campeonato não encontrado';end if;
 if not public.cp_can_manage(e.discipline_id) then raise exception 'Sem acesso ao campeonato';end if;
 if e.archived_at is not null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(e.engine_schema,0));
 execute format('select %I.ac_state()',e.engine_schema) into v_state;
 execute format('update %I.ac_settings set phase=''finished'' where id=1',e.engine_schema);
 v_state:=v_state||jsonb_build_object('phase','finished','active',null,'review',null);
 insert into public.cp_frozen(edition_id,snapshot) values(e.id,v_state);
 update public.cp_editions set archived_at=clock_timestamp() where id=e.id;
end $$;
revoke all on function public.cp_archive(uuid) from public,anon;
grant execute on function public.cp_archive(uuid) to authenticated;
-- Alinha as edições já arquivadas, preservando partidas, pontuações e respostas.
do $$
declare e record;
begin
 for e in select id,engine_schema from public.cp_editions where archived_at is not null for update loop
  perform pg_advisory_xact_lock(hashtextextended(e.engine_schema,0));
  execute format('update %I.ac_settings set phase=''finished'' where id=1',e.engine_schema);
  update public.cp_frozen set snapshot=snapshot||jsonb_build_object('phase','finished','active',null,'review',null) where edition_id=e.id;
 end loop;
end $$;
commit;
