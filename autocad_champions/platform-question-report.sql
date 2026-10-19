-- Relatório somente de campeonatos encerrados, inclusive históricos arquivados.
begin;
create or replace function public.cp_question_report(p_edition uuid,p_stage text default 'all') returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.cp_editions%rowtype;v_phase text;v_result jsonb;
begin
 select * into e from public.cp_editions where id=p_edition for share;
 if e.id is null then raise exception 'Campeonato não encontrado';end if;
 if not public.cp_can_manage(e.discipline_id) then raise exception 'Sem acesso ao campeonato';end if;
 if p_stage is null or p_stage not in ('all','leveling','knockout') then raise exception 'Etapa inválida';end if;
 execute format('select phase from %I.ac_settings where id=1',e.engine_schema) into v_phase;
 if v_phase<>'finished' then raise exception 'O relatório estará disponível quando o campeonato terminar';end if;
 execute format($report$
 with responses as (
  select a.*,r.player_id from %1$I.ac_responses a
  join %1$I.ac_runs r on r.id=a.run_id join %1$I.ac_players p on p.id=r.player_id
  where not p.disqualified and ($1='all' or r.stage=$1)
 ), stats as (
  select question_id,count(*)::int attempts,count(distinct player_id)::int students,
  count(*) filter(where correct)::int correct,
  count(*) filter(where not correct and not timed_out)::int wrong,
  count(*) filter(where timed_out)::int timed_out
  from responses group by question_id
 ), ranked as (
  select q.id,q.statement,q.options,q.correct correct_choice,s.attempts,s.students,s.correct,s.wrong,s.timed_out,
  s.wrong+s.timed_out misses,round(100.0*(s.wrong+s.timed_out)/s.attempts,1) miss_rate
  from stats s join %1$I.ac_questions q on q.id=s.question_id where s.wrong+s.timed_out>0
 )
 select jsonb_build_object('stage',$1,'attempts',(select count(*) from responses),
 'correct',(select count(*) from responses where correct),
 'wrong',(select count(*) from responses where not correct and not timed_out),
 'timed_out',(select count(*) from responses where timed_out),
 'questions',coalesce((select jsonb_agg(to_jsonb(r) order by misses desc,miss_rate desc,id) from ranked r),'[]'::jsonb))
 $report$,e.engine_schema) into v_result using p_stage;
 return v_result||jsonb_build_object('edition',e.name,'archived',e.archived_at is not null);
end $$;
revoke all on function public.cp_question_report(uuid,text) from public,anon;
grant execute on function public.cp_question_report(uuid,text) to authenticated;
commit;
