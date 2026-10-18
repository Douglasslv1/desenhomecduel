-- Aplicar após platform-learning-update.sql, sem campeonatos em andamento.
begin;
select pg_advisory_xact_lock(200020);
create table if not exists public.cp_review_engine(id int primary key check(id=1),sql_patch text not null);
alter table public.cp_review_engine enable row level security;
revoke all on public.cp_review_engine from public,anon,authenticated;
insert into public.cp_review_engine values(1,$review$alter table __EDITION__.ac_runs add column if not exists review_pending boolean not null default false;
alter table __EDITION__.ac_runs add column if not exists review_started_at timestamptz;
alter table __EDITION__.ac_runs add column if not exists review_elapsed interval not null default interval '0 seconds';
create or replace function __EDITION__.ac_feedback(p_run uuid,p_question int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 select jsonb_build_object('run_id',r.id,'question_id',q.id,'statement',q.statement,'options',q.options,
 'correct',a.correct,'timed_out',a.timed_out,'choice',a.choice,'correct_choice',q.correct,
 'correct_option',q.options->>q.correct,'answered_at',a.answered_at) into v_result
 from __EDITION__.ac_runs r join __EDITION__.ac_players p on p.id=r.player_id
 join __EDITION__.ac_responses a on a.run_id=r.id and a.question_id=p_question
 join __EDITION__.ac_questions q on q.id=a.question_id
 where r.id=p_run and p.user_id=auth.uid() and not p.disqualified;
 return v_result;
end $$;create or replace function __EDITION__.ac_tick() returns void
language plpgsql security definer set search_path='' as $$
declare r record; m record; a __EDITION__.ac_runs%rowtype; b __EDITION__.ac_runs%rowtype;
 v_now timestamptz:=clock_timestamp(); v_deadline timestamptz; v_winner uuid;
begin
 -- Expira a pergunta atual e aguarda a revisão antes de iniciar a seguinte.
 for r in select x.* from __EDITION__.ac_runs x join __EDITION__.ac_players p on p.id=x.player_id
  where x.finished_at is null and not x.review_pending and not p.disqualified order by x.id loop
  if r.position<=array_length(r.questions,1) and r.question_started_at+interval '90 seconds'<=v_now then
   v_deadline:=r.question_started_at+interval '90 seconds';
   insert into __EDITION__.ac_responses(run_id,question_id,choice,correct,timed_out,opened_at,answered_at)
    values(r.id,r.questions[r.position],null,false,true,r.question_started_at,v_deadline);
   r.position:=r.position+1; r.question_started_at:=v_deadline; r.review_pending:=true; r.review_started_at:=v_now;
  end if;
  update __EDITION__.ac_runs set position=r.position,question_started_at=r.question_started_at,review_pending=r.review_pending,review_started_at=r.review_started_at,
   finished_at=case when not r.review_pending and r.position>array_length(r.questions,1) then r.question_started_at else null end where id=r.id;
 end loop;
 if (select phase from __EDITION__.ac_settings where id=1)<>'knockout' then return; end if;
 for m in select * from __EDITION__.ac_matches where winner is null and p1 is not null and p2 is not null and status='waiting' loop
  select * into a from __EDITION__.ac_runs where match_id=m.id and player_id=m.p1;
  select * into b from __EDITION__.ac_runs where match_id=m.id and player_id=m.p2;
  if a.id is null or b.id is null then continue; end if;
  update __EDITION__.ac_matches set s1=a.score,s2=b.score,done1=a.finished_at is not null,done2=b.finished_at is not null where id=m.id;
  if a.finished_at is not null and b.finished_at is not null then
   v_winner:=case when a.score>b.score then m.p1 when b.score>a.score then m.p2
    when a.finished_at-a.started_at-a.review_elapsed<b.finished_at-b.started_at-b.review_elapsed then m.p1
    when b.finished_at-b.started_at-b.review_elapsed<a.finished_at-a.started_at-a.review_elapsed then m.p2
    when a.tie_order<b.tie_order then m.p1 else m.p2 end;
   update __EDITION__.ac_matches set winner=v_winner,status='finished' where id=m.id;
  end if;
 end loop;
 perform __EDITION__.ac_advance();
 -- Só começa o relógio quando os dois adversários já estão definidos.
 insert into __EDITION__.ac_runs(player_id,match_id,stage,questions,started_at,question_started_at)
 select p.id,mat.id,'knockout',mat.questions,v_now,v_now
 from __EDITION__.ac_matches mat join __EDITION__.ac_players p on p.id in(mat.p1,mat.p2)
 where mat.winner is null and mat.status='waiting' and mat.p1 is not null and mat.p2 is not null
 and not p.disqualified on conflict(match_id,player_id) do nothing;
 if not exists(select 1 from __EDITION__.ac_matches where status not in ('advanced','empty')) then
  update __EDITION__.ac_settings set phase='finished' where id=1;
 end if;
end $$;create or replace function __EDITION__.ac_submit(p_run uuid,p_question int,p_choice int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r __EDITION__.ac_runs%rowtype; v_correct boolean; v_now timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 if not exists(select 1 from __EDITION__.ac_runs x join __EDITION__.ac_players p on p.id=x.player_id
  where x.id=p_run and p.user_id=auth.uid() and not p.disqualified) then raise exception 'Etapa indisponível'; end if;
 perform __EDITION__.ac_tick();
 select * into r from __EDITION__.ac_runs where id=p_run;
 -- Não levantar erro aqui: precisamos confirmar os timeouts calculados pelo tick.
 if r.review_pending or r.finished_at is not null or p_question is distinct from r.questions[r.position] then
  return jsonb_build_object('accepted',false,'expired',true);
 end if;
 if p_choice is null or not exists(select 1 from __EDITION__.ac_questions where id=p_question and p_choice between 0 and jsonb_array_length(options)-1) then raise exception 'Alternativa inválida'; end if;
 v_now:=clock_timestamp();
 if v_now>=r.question_started_at+interval '90 seconds' then
  perform __EDITION__.ac_tick();return jsonb_build_object('accepted',false,'expired',true);
 end if;
 select p_choice=correct into v_correct from __EDITION__.ac_questions where id=p_question;
 insert into __EDITION__.ac_responses(run_id,question_id,choice,correct,opened_at,answered_at)
 values(r.id,p_question,p_choice,v_correct,r.question_started_at,v_now);
 update __EDITION__.ac_runs set score=score+case when v_correct then 1 else 0 end,position=position+1,
  review_pending=true,review_started_at=v_now,finished_at=null where id=r.id;
 perform __EDITION__.ac_tick();
 return jsonb_build_object('accepted',true,'correct',v_correct,'feedback',__EDITION__.ac_feedback(r.id,p_question));
end $$;create or replace function __EDITION__.ac_continue(p_run uuid,p_question int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r __EDITION__.ac_runs%rowtype;v_now timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 select x.* into r from __EDITION__.ac_runs x join __EDITION__.ac_players p on p.id=x.player_id
 where x.id=p_run and p.user_id=auth.uid() and not p.disqualified;
 if r.id is null then raise exception 'Etapa indisponível';end if;
 if not r.review_pending or p_question is distinct from r.questions[r.position-1] then return jsonb_build_object('accepted',false);end if;
 update __EDITION__.ac_runs set review_pending=false,review_started_at=null,
 review_elapsed=review_elapsed+greatest(interval '0 seconds',v_now-r.review_started_at),
 question_started_at=v_now,finished_at=case when position>array_length(questions,1) then v_now else null end where id=r.id;
 perform __EDITION__.ac_tick();return jsonb_build_object('accepted',true);
end $$;
create or replace function __EDITION__.ac_state() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_player uuid; v_admin boolean; v_phase text; v_matches jsonb; v_players jsonb;
 r __EDITION__.ac_runs%rowtype; v_questions jsonb:='[]'; v_answers jsonb:='[]'; v_disqualified boolean;
 v_total int; v_done int; v_last jsonb; v_feedback_run uuid; v_feedback_question int;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 v_admin:=__EDITION__.ac_is_admin();
 select id,disqualified into v_player,v_disqualified from __EDITION__.ac_players where user_id=auth.uid();
 if not v_admin and v_player is null then return jsonb_build_object('started',(select started from __EDITION__.ac_settings where id=1),'registered',false); end if;
 perform __EDITION__.ac_tick();
 select phase into v_phase from __EDITION__.ac_settings where id=1;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'round',m.round,'slot',m.slot,'third',m.is_third,
  'p1',a.name,'p2',b.name,'p1_id',m.p1,'p2_id',m.p2,'winner',w.name,'winner_id',m.winner,
  'dq1',coalesce(a.disqualified,false),'dq2',coalesce(b.disqualified,false),
  's1',case when m.done1 then m.s1 else null end,'s2',case when m.done2 then m.s2 else null end,
  'done1',m.done1,'done2',m.done2,'status',m.status) order by m.round,m.is_third,m.slot),'[]'::jsonb) into v_matches
 from __EDITION__.ac_matches m left join __EDITION__.ac_players a on a.id=m.p1 left join __EDITION__.ac_players b on b.id=m.p2 left join __EDITION__.ac_players w on w.id=m.winner;
 if v_admin then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'disqualified',p.disqualified,
   'reason',p.disqualification_reason,'level_score',l.score,'level_done',l.finished_at is not null,
   'level_answered',coalesce(l.position-1,0),
   'can_disqualify',not p.disqualified and v_phase<>'finished' and (v_phase in ('registration','leveling') or
    exists(select 1 from __EDITION__.ac_matches m where m.winner is null and m.status='waiting' and p.id in(m.p1,m.p2))))
   order by p.created_at,p.id),'[]'::jsonb) into v_players
  from __EDITION__.ac_players p left join __EDITION__.ac_runs l on l.player_id=p.id and l.stage='leveling';
 end if;
 select count(*),count(*) filter(where x.finished_at is not null) into v_total,v_done
 from __EDITION__.ac_runs x join __EDITION__.ac_players p on p.id=x.player_id where x.stage='leveling' and not p.disqualified;
 if not coalesce(v_disqualified,false) then
  select * into r from __EDITION__.ac_runs where player_id=v_player and finished_at is null order by started_at desc limit 1;
 end if;
 if r.id is not null and not r.review_pending then
  select jsonb_build_array(jsonb_build_object('id',q.id,'q',q.statement,'op',q.options)) into v_questions
   from __EDITION__.ac_questions q where q.id=r.questions[r.position];
  select coalesce(jsonb_agg(jsonb_build_object('id',question_id,'correct',correct,'timed_out',timed_out)),'[]'::jsonb)
   into v_answers from __EDITION__.ac_responses where run_id=r.id;
 end if;
 select x.run_id,x.question_id into v_feedback_run,v_feedback_question
 from __EDITION__.ac_responses x join __EDITION__.ac_runs z on z.id=x.run_id
 where z.player_id=v_player order by x.answered_at desc,x.question_id limit 1;
 if v_feedback_run is not null then v_last:=__EDITION__.ac_feedback(v_feedback_run,v_feedback_question);end if;
 return jsonb_build_object('api_version',2,'leveling_question_count',coalesce((select array_length(questions,1) from __EDITION__.ac_runs where stage='leveling' limit 1),20),'knockout_question_count',10,'feedback',v_last,'review',case when r.review_pending then __EDITION__.ac_feedback(r.id,r.questions[r.position-1]) else null end,'registered',v_player is not null,'admin',v_admin,'phase',v_phase,
  'started',(select started from __EDITION__.ac_settings where id=1),'player_id',v_player,'disqualified',coalesce(v_disqualified,false),
  'players',coalesce(v_players,'[]'::jsonb),'matches',v_matches,'server_now',clock_timestamp(),
  'leveling',jsonb_build_object('total',v_total,'done',v_done,'ready',v_total>=4 and v_total=v_done),
  'active',case when r.id is null then null else jsonb_build_object('id',r.id,'match_id',r.match_id,'stage',r.stage,
   'round',(select round from __EDITION__.ac_matches where id=r.match_id),'position',r.position,'score',r.score,'total',array_length(r.questions,1),
   'deadline',case when r.review_pending then null else r.question_started_at+interval '90 seconds' end) end,
  'questions',coalesce(v_questions,'[]'::jsonb),'answers',v_answers);
end $$;create or replace function __EDITION__.ac_start_knockout() returns void
language plpgsql security definer set search_path='' as $$
declare v_ids uuid[]; v_n int; v_size int:=2; v_rounds int:=1; v_byes int; v_slots int;
 v_q int[]; v_p1 uuid; v_p2 uuid; v_b int:=0; v_pair int:=0;
begin
 if not __EDITION__.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 perform __EDITION__.ac_tick();
 if (select phase from __EDITION__.ac_settings where id=1)<>'leveling' then raise exception 'O nivelamento não está em andamento'; end if;
 if exists(select 1 from __EDITION__.ac_runs r join __EDITION__.ac_players p on p.id=r.player_id where r.stage='leveling' and not p.disqualified and r.finished_at is null) then raise exception 'Aguarde todos concluírem o nivelamento'; end if;
 select array_agg(p.id order by r.score desc,r.finished_at-r.started_at-r.review_elapsed,r.tie_order,p.id) into v_ids
  from __EDITION__.ac_players p join __EDITION__.ac_runs r on r.player_id=p.id and r.stage='leveling' where not p.disqualified;
 v_n:=coalesce(array_length(v_ids,1),0);
 if v_n<4 then raise exception 'São necessários pelo menos quatro participantes habilitados'; end if;
 while v_size<v_n loop v_size:=v_size*2;v_rounds:=v_rounds+1;end loop;
 v_byes:=v_size-v_n;v_slots:=v_size/2;
 insert into __EDITION__.ac_meta(id,total_rounds) values(1,v_rounds);
 for r in 1..v_rounds loop
  for j in 0..(v_size/(2^r)::int)-1 loop
   v_p1:=null;v_p2:=null;
   if r=1 then
    -- Melhores resultados recebem as vagas automáticas; as demais duplas são vizinhas no ranking.
    -- Distribuição uniforme de byes evita concentrá-los em uma única região da árvore.
    if ((j+1)*v_byes)/v_slots>(j*v_byes)/v_slots then
     v_b:=v_b+1;v_p1:=v_ids[v_b];
    else
     v_p1:=v_ids[v_byes+2*v_pair+1];v_p2:=v_ids[v_byes+2*v_pair+2];v_pair:=v_pair+1;
    end if;
   end if;
   select array_agg(id order by ordering) into v_q from
    (select id,random() ordering from __EDITION__.ac_questions order by ordering limit 10) q;
   insert into __EDITION__.ac_matches(round,slot,p1,p2,questions) values(r,j,v_p1,v_p2,v_q);
  end loop;
 end loop;
 select array_agg(id order by ordering) into v_q from
  (select id,random() ordering from __EDITION__.ac_questions order by ordering limit 10) q;
 insert into __EDITION__.ac_matches(round,slot,is_third,questions) values(v_rounds,0,true,v_q);
 update __EDITION__.ac_settings set phase='knockout' where id=1;
 perform __EDITION__.ac_tick();
end $$;revoke all on all functions in schema __EDITION__ from public,anon,authenticated;
$review$) on conflict(id) do update set sql_patch=excluded.sql_patch;
do $upgrade$ declare e record;v_phase text;v_patch text;begin
 select sql_patch into v_patch from public.cp_review_engine where id=1;
 for e in select * from public.cp_editions loop
 perform pg_advisory_xact_lock(hashtextextended(e.engine_schema,0));
 execute format('select phase from %I.ac_settings where id=1',e.engine_schema) into v_phase;
 if e.archived_at is null and v_phase in ('leveling','knockout') then raise exception 'Encerre ou arquive as edições em andamento antes desta atualização';end if;
 execute replace(v_patch,'__EDITION__',e.engine_schema);
 end loop;
end $upgrade$;
create or replace function public.cp_provision(p_id uuid,p_discipline uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s text:='cp_e_'||replace(p_id::text,'-','');t text;p text;v_review text;
begin
 select sql_template into t from public.cp_engine where id=1;
 select sql_patch into p from public.cp_learning_engine where id=1;
 if t is null or p is null then raise exception 'Motor não configurado';end if;
 execute format('create schema %I',s);
 execute replace(replace(t,'__EDITION__',s),'__DISCIPLINE__',p_discipline::text);
 execute replace(p,'__EDITION__',s);
 select sql_patch into v_review from public.cp_review_engine where id=1;
 execute replace(v_review,'__EDITION__',s);
end $$;
create or replace function public.cp_rpc(p_edition uuid,p_action text,p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.cp_editions%rowtype;v_result jsonb;v_admin boolean;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro';end if;
 select * into e from public.cp_editions where id=p_edition for share;
 if e.id is null then raise exception 'Campeonato não encontrado';end if;
 v_admin:=public.cp_can_manage(e.discipline_id);
 if e.archived_at is not null and (not v_admin or p_action<>'ac_state') then raise exception 'Campeonato arquivado';end if;
 if p_action in ('ac_start','ac_start_knockout','ac_disqualify') and not v_admin then raise exception 'Apenas professor da disciplina';end if;
 -- Sem SQL fornecido pelo cliente: ações e assinaturas são fixas.
 case p_action
 when 'ac_state' then
  if e.archived_at is null then execute format('select %I.ac_state()',e.engine_schema) into v_result;
  else
   -- O estado arquivado já é materializado no arquivamento e não deve avançar relógios.
   select snapshot into v_result from public.cp_frozen where edition_id=e.id;
  end if;
 when 'ac_join' then execute format('select to_jsonb(%I.ac_join($1))',e.engine_schema) into v_result using p_args->>'p_name';
 when 'ac_start' then execute format('select %I.ac_start()',e.engine_schema);v_result:='null';
 when 'ac_start_knockout' then execute format('select %I.ac_start_knockout()',e.engine_schema);v_result:='null';
 when 'ac_submit' then execute format('select %I.ac_submit($1,$2,$3)',e.engine_schema) into v_result using (p_args->>'p_run')::uuid,(p_args->>'p_question')::int,(p_args->>'p_choice')::int;
 when 'ac_continue' then execute format('select %I.ac_continue($1,$2)',e.engine_schema) into v_result using (p_args->>'p_run')::uuid,(p_args->>'p_question')::int;
 when 'ac_disqualify' then execute format('select %I.ac_disqualify($1,$2)',e.engine_schema) using (p_args->>'p_player')::uuid,p_args->>'p_reason';v_result:='null';
 else raise exception 'Ação não permitida';end case;
 if p_action='ac_state' then
  v_result:=v_result||jsonb_build_object('edition',jsonb_build_object('id',e.id,'name',e.name,'code',e.code,'archived',e.archived_at is not null,
   'discipline',(select name from public.cp_disciplines where id=e.discipline_id),'bank_revision',e.bank_revision));
 end if;
 return v_result;
end $$;
create or replace function public.cp_practice_state(p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.cp_practice_runs%rowtype;n int;q jsonb;last_answer jsonb;feedback jsonb;
begin
 select * into r from public.cp_practice_runs where id=p_run and user_id=auth.uid();
 if r.id is null then raise exception 'Simulado não encontrado para este usuário';end if;
 n:=jsonb_array_length(r.answers);q:=r.questions->n;
 if n>0 then
  last_answer:=r.answers->(n-1);
  feedback:=jsonb_build_object('number',n,'correct',last_answer->'correct','choice',last_answer->'choice',
   'options',r.questions->(n-1)->'options','statement',r.questions->(n-1)->>'statement','correct_choice',r.questions->(n-1)->'correct',
   'correct_option',r.questions->(n-1)->'options'->>((r.questions->(n-1)->>'correct')::int));
 end if;
 return jsonb_build_object('id',r.id,'bank',r.bank_name,'discipline',r.discipline_name,'total',jsonb_array_length(r.questions),
  'answered',n,'score',r.score,'finished',r.finished_at is not null,'feedback',feedback,
  'question',case when q is null then null else jsonb_build_object('number',n+1,'statement',q->>'statement','options',q->'options') end);
end $$;
revoke all on function public.cp_provision(uuid,uuid) from public,anon,authenticated;
commit;
