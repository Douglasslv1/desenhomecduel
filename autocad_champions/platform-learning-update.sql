-- Aplicar após platform-multidisciplines.sql. Não altera questões nem resultados encerrados.
begin;
select pg_advisory_xact_lock(200020);
create table if not exists public.cp_learning_engine(id int primary key check(id=1),sql_patch text not null);
alter table public.cp_learning_engine enable row level security;
revoke all on public.cp_learning_engine from public,anon,authenticated;
insert into public.cp_learning_engine(id,sql_patch) values(1,$patch$do $constraints$ declare c record;begin
 for c in select conname from pg_constraint where conrelid='__EDITION__.ac_runs'::regclass and contype='c' loop
 execute format('alter table __EDITION__.ac_runs drop constraint %I',c.conname);end loop;
end $constraints$;
alter table __EDITION__.ac_runs add constraint ac_run_stage_v4 check(stage in ('leveling','knockout'));
alter table __EDITION__.ac_runs add constraint ac_run_questions_v4 check(array_length(questions,1) in (10,20) and (stage='leveling' or array_length(questions,1)=10));
alter table __EDITION__.ac_runs add constraint ac_run_position_v4 check(position between 1 and array_length(questions,1)+1);
alter table __EDITION__.ac_runs add constraint ac_run_score_v4 check(score between 0 and array_length(questions,1));
alter table __EDITION__.ac_runs add constraint ac_run_match_v4 check((stage='leveling' and match_id is null) or (stage='knockout' and match_id is not null));
create or replace function __EDITION__.ac_feedback(p_run uuid,p_question int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 select jsonb_build_object('run_id',r.id,'question_id',q.id,'statement',q.statement,
 'correct',a.correct,'timed_out',a.timed_out,'choice',a.choice,'correct_choice',q.correct,
 'correct_option',q.options->>q.correct,'answered_at',a.answered_at) into v_result
 from __EDITION__.ac_runs r join __EDITION__.ac_players p on p.id=r.player_id
 join __EDITION__.ac_responses a on a.run_id=r.id and a.question_id=p_question
 join __EDITION__.ac_questions q on q.id=a.question_id
 where r.id=p_run and p.user_id=auth.uid() and not p.disqualified;
 return v_result;
end $$;
create or replace function __EDITION__.ac_start() returns void
language plpgsql security definer set search_path='' as $$
declare v_q int[]; v_now timestamptz:=clock_timestamp();
begin
 if not __EDITION__.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 if (select phase from __EDITION__.ac_settings where id=1)<>'registration' then raise exception 'Etapa já iniciada'; end if;
 if (select count(*) from __EDITION__.ac_players where not disqualified)<4 then raise exception 'São necessários pelo menos quatro participantes habilitados'; end if;
 if (select count(*) from __EDITION__.ac_questions)<20 then raise exception 'Cadastre pelo menos vinte questões'; end if;
 select array_agg(id order by ordering) into v_q from
  (select id,random() ordering from __EDITION__.ac_questions order by ordering limit 20) q;
 update __EDITION__.ac_settings set started=true,phase='leveling',leveling_questions=v_q where id=1;
 insert into __EDITION__.ac_runs(player_id,stage,questions,started_at,question_started_at)
  select id,'leveling',v_q,v_now,v_now from __EDITION__.ac_players where not disqualified;
end $$;
create or replace function __EDITION__.ac_tick() returns void
language plpgsql security definer set search_path='' as $$
declare r record; m record; a __EDITION__.ac_runs%rowtype; b __EDITION__.ac_runs%rowtype;
 v_now timestamptz:=clock_timestamp(); v_deadline timestamptz; v_winner uuid;
begin
 -- Expiração permanece válida mesmo sem alunos conectados. Recupera todos os prazos vencidos.
 for r in select x.* from __EDITION__.ac_runs x join __EDITION__.ac_players p on p.id=x.player_id
  where x.finished_at is null and not p.disqualified order by x.id loop
  while r.position<=array_length(r.questions,1) and r.question_started_at+interval '90 seconds'<=v_now loop
   v_deadline:=r.question_started_at+interval '90 seconds';
   insert into __EDITION__.ac_responses(run_id,question_id,choice,correct,timed_out,opened_at,answered_at)
    values(r.id,r.questions[r.position],null,false,true,r.question_started_at,v_deadline);
   r.position:=r.position+1; r.question_started_at:=v_deadline;
  end loop;
  update __EDITION__.ac_runs set position=r.position,question_started_at=r.question_started_at,
   finished_at=case when r.position>array_length(r.questions,1) then r.question_started_at else null end where id=r.id;
 end loop;
 if (select phase from __EDITION__.ac_settings where id=1)<>'knockout' then return; end if;
 for m in select * from __EDITION__.ac_matches where winner is null and p1 is not null and p2 is not null and status='waiting' loop
  select * into a from __EDITION__.ac_runs where match_id=m.id and player_id=m.p1;
  select * into b from __EDITION__.ac_runs where match_id=m.id and player_id=m.p2;
  if a.id is null or b.id is null then continue; end if;
  update __EDITION__.ac_matches set s1=a.score,s2=b.score,done1=a.finished_at is not null,done2=b.finished_at is not null where id=m.id;
  if a.finished_at is not null and b.finished_at is not null then
   v_winner:=case when a.score>b.score then m.p1 when b.score>a.score then m.p2
    when a.finished_at-a.started_at<b.finished_at-b.started_at then m.p1
    when b.finished_at-b.started_at<a.finished_at-a.started_at then m.p2
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
end $$;
create or replace function __EDITION__.ac_submit(p_run uuid,p_question int,p_choice int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r __EDITION__.ac_runs%rowtype; v_correct boolean; v_now timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 if not exists(select 1 from __EDITION__.ac_runs x join __EDITION__.ac_players p on p.id=x.player_id
  where x.id=p_run and p.user_id=auth.uid() and not p.disqualified) then raise exception 'Etapa indisponível'; end if;
 perform __EDITION__.ac_tick();
 select * into r from __EDITION__.ac_runs where id=p_run;
 -- Não levantar erro aqui: precisamos confirmar os timeouts calculados pelo tick.
 if r.finished_at is not null or p_question is distinct from r.questions[r.position] then
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
  question_started_at=v_now,finished_at=case when position=array_length(questions,1) then v_now else null end where id=r.id;
 perform __EDITION__.ac_tick();
 return jsonb_build_object('accepted',true,'correct',v_correct,'feedback',__EDITION__.ac_feedback(r.id,p_question));
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
 if r.id is not null then
  select jsonb_build_array(jsonb_build_object('id',q.id,'q',q.statement,'op',q.options)) into v_questions
   from __EDITION__.ac_questions q where q.id=r.questions[r.position];
  select coalesce(jsonb_agg(jsonb_build_object('id',question_id,'correct',correct,'timed_out',timed_out)),'[]'::jsonb)
   into v_answers from __EDITION__.ac_responses where run_id=r.id;
 end if;
 select x.run_id,x.question_id into v_feedback_run,v_feedback_question
 from __EDITION__.ac_responses x join __EDITION__.ac_runs z on z.id=x.run_id
 where z.player_id=v_player order by x.answered_at desc,x.question_id limit 1;
 if v_feedback_run is not null then v_last:=__EDITION__.ac_feedback(v_feedback_run,v_feedback_question);end if;
 return jsonb_build_object('api_version',2,'leveling_question_count',coalesce((select array_length(questions,1) from __EDITION__.ac_runs where stage='leveling' limit 1),20),'knockout_question_count',10,'feedback',v_last,'registered',v_player is not null,'admin',v_admin,'phase',v_phase,
  'started',(select started from __EDITION__.ac_settings where id=1),'player_id',v_player,'disqualified',coalesce(v_disqualified,false),
  'players',coalesce(v_players,'[]'::jsonb),'matches',v_matches,'server_now',clock_timestamp(),
  'leveling',jsonb_build_object('total',v_total,'done',v_done,'ready',v_total>=4 and v_total=v_done),
  'active',case when r.id is null then null else jsonb_build_object('id',r.id,'match_id',r.match_id,'stage',r.stage,
   'round',(select round from __EDITION__.ac_matches where id=r.match_id),'position',r.position,'score',r.score,'total',array_length(r.questions,1),
   'deadline',r.question_started_at+interval '90 seconds') end,
  'questions',coalesce(v_questions,'[]'::jsonb),'answers',v_answers);
end $$;
revoke all on all functions in schema __EDITION__ from public,anon,authenticated;
$patch$) on conflict(id) do update set sql_patch=excluded.sql_patch;
do $upgrade$ declare e record;v_phase text;v_patch text;begin
 select sql_patch into v_patch from public.cp_learning_engine where id=1;
 for e in select * from public.cp_editions loop
  perform pg_advisory_xact_lock(hashtextextended(e.engine_schema,0));
  execute format('select phase from %I.ac_settings where id=1',e.engine_schema) into v_phase;
  if e.archived_at is null and v_phase in ('leveling','knockout') then raise exception 'Encerre ou arquive as edições em andamento antes desta atualização';end if;
  execute replace(v_patch,'__EDITION__',e.engine_schema);
 end loop;
end $upgrade$;
-- Os históricos congelados anteriores usavam dez questões no nivelamento.
update public.cp_frozen set snapshot=snapshot||jsonb_build_object('leveling_question_count',10,'knockout_question_count',10)
 where not (snapshot ? 'leveling_question_count');
create or replace function public.cp_create_edition(p_discipline uuid,p_bank uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=gen_random_uuid();v_schema text:='cp_e_'||replace(v_id::text,'-','');v_revision int;
begin
 if not public.cp_can_manage(p_discipline) then raise exception 'Sem acesso à disciplina';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 100 then raise exception 'Informe um nome entre 2 e 100 caracteres';end if;
 select revision into v_revision from public.cp_banks where id=p_bank and discipline_id=p_discipline for update;
 if v_revision is null then raise exception 'Banco não pertence à disciplina';end if;
 if (select count(*) from public.cp_questions where bank_id=p_bank)<20 then raise exception 'O banco precisa de pelo menos vinte questões';end if;
 insert into public.cp_editions(id,discipline_id,bank_id,bank_revision,name,engine_schema,created_by)
 values(v_id,p_discipline,p_bank,v_revision,trim(p_name),v_schema,auth.uid());
 perform public.cp_provision(v_id,p_discipline);
 execute format('insert into %I.ac_questions(id,statement,options,correct) select id,statement,options,correct from public.cp_questions where bank_id=$1',v_schema) using p_bank;
 return v_id;
end $$;
-- Novas edições recebem o motor atualizado sem modificar o arquivo original da migração anterior.
create or replace function public.cp_provision(p_id uuid,p_discipline uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s text:='cp_e_'||replace(p_id::text,'-','');t text;p text;
begin
 select sql_template into t from public.cp_engine where id=1;
 select sql_patch into p from public.cp_learning_engine where id=1;
 if t is null or p is null then raise exception 'Motor não configurado';end if;
 execute format('create schema %I',s);
 execute replace(replace(t,'__EDITION__',s),'__DISCIPLINE__',p_discipline::text);
 execute replace(p,'__EDITION__',s);
end $$;
-- Parte da migração gerada. Execute platform-learning-update.sql completo.
create or replace function public.cp_can_manage(p_discipline uuid) returns boolean
language sql security definer set search_path='' as $$
 select auth.uid() is not null and (public.cp_is_owner() or exists(select 1 from public.cp_teachers where discipline_id=p_discipline and user_id=auth.uid()))
$$;

create or replace function public.cp_assign_teacher(p_discipline uuid,p_identity text,p_allowed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if not public.cp_is_owner() then raise exception 'Apenas superadministrador';end if;
 select u.id into v_user from auth.users u
 where (lower(to_jsonb(u)->>'email')=lower(trim(p_identity)) or u.id::text=trim(p_identity))
 and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false;
 if v_user is null then raise exception 'Professor não encontrado. Crie primeiro uma conta com e-mail e senha no Supabase';end if;
 perform public.cp_set_teacher(p_discipline,v_user,p_allowed);
end $$;

create or replace function public.cp_teacher_directory(p_discipline uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 if not public.cp_is_owner() then raise exception 'Apenas superadministrador';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',to_jsonb(u)->>'email','superadmin',exists(select 1 from public.ac_admins a where a.user_id=u.id)) order by to_jsonb(u)->>'email'),'[]') into v_result
 from public.cp_teachers t join auth.users u on u.id=t.user_id where t.discipline_id=p_discipline;
 return v_result;
end $$;

-- Catálogo de estudo: apenas nomes e quantidades, sem perguntas nem gabaritos.
create or replace function public.cp_practice_catalog() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'banks',
 (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'count',(select count(*) from public.cp_questions q where q.bank_id=b.id)) order by b.created_at),'[]') from public.cp_banks b where b.discipline_id=d.id)) order by d.created_at),'[]') into v_result from public.cp_disciplines d;
 return v_result;
end $$;

create table if not exists public.cp_practice_runs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,bank_id uuid not null references public.cp_banks(id),
 bank_name text not null,discipline_name text not null,questions jsonb not null,
 answers jsonb not null default '[]',score int not null default 0,created_at timestamptz not null default now(),finished_at timestamptz,
 check(jsonb_typeof(questions)='array' and jsonb_array_length(questions) in (10,20)),
 check(jsonb_typeof(answers)='array'),check(score between 0 and jsonb_array_length(questions)),
 check(jsonb_array_length(answers)<=jsonb_array_length(questions))
);
create index if not exists cp_practice_user_idx on public.cp_practice_runs(user_id,created_at desc);
alter table public.cp_practice_runs enable row level security;
revoke all on public.cp_practice_runs from public,anon,authenticated;

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
   'statement',r.questions->(n-1)->>'statement','correct_choice',r.questions->(n-1)->'correct',
   'correct_option',r.questions->(n-1)->'options'->>((r.questions->(n-1)->>'correct')::int));
 end if;
 return jsonb_build_object('id',r.id,'bank',r.bank_name,'discipline',r.discipline_name,'total',jsonb_array_length(r.questions),
  'answered',n,'score',r.score,'finished',r.finished_at is not null,'feedback',feedback,
  'question',case when q is null then null else jsonb_build_object('number',n+1,'statement',q->>'statement','options',q->'options') end);
end $$;

create or replace function public.cp_practice_start(p_bank uuid,p_count int default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_questions jsonb;v_bank text;v_discipline text;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro';end if;
 if p_count is null or p_count not in (10,20) then raise exception 'Escolha dez ou vinte questões';end if;
 select b.name,d.name into v_bank,v_discipline from public.cp_banks b join public.cp_disciplines d on d.id=b.discipline_id where b.id=p_bank for share of b;
 if v_bank is null then raise exception 'Banco não encontrado';end if;
 if (select count(*) from public.cp_questions where bank_id=p_bank)<p_count then raise exception 'O banco não possui questões suficientes para este simulado';end if;
 select jsonb_agg(jsonb_build_object('id',id,'statement',statement,'options',options,'correct',correct) order by ordering) into v_questions
 from (select q.*,random() ordering from public.cp_questions q where bank_id=p_bank order by ordering limit p_count) sampled;
 insert into public.cp_practice_runs(user_id,bank_id,bank_name,discipline_name,questions) values(auth.uid(),p_bank,v_bank,v_discipline,v_questions) returning id into v_id;
 return public.cp_practice_state(v_id);
end $$;

create or replace function public.cp_practice_answer(p_run uuid,p_question int,p_choice int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.cp_practice_runs%rowtype;n int;q jsonb;v_correct boolean;
begin
 select * into r from public.cp_practice_runs where id=p_run and user_id=auth.uid() for update;
 if r.id is null then raise exception 'Simulado não encontrado para este usuário';end if;
 n:=jsonb_array_length(r.answers);
 if p_question is null or p_question<>n+1 then raise exception 'Esta pergunta já foi respondida ou não está disponível';end if;
 if r.finished_at is not null then raise exception 'Simulado já concluído';end if;
 if p_choice is null or p_choice not between 0 and 4 then raise exception 'Alternativa inválida';end if;
 q:=r.questions->n;v_correct:=p_choice=(q->>'correct')::int;
 update public.cp_practice_runs set answers=answers||jsonb_build_array(jsonb_build_object('number',n+1,'choice',p_choice,'correct',v_correct)),
 score=score+case when v_correct then 1 else 0 end,finished_at=case when n+1=jsonb_array_length(questions) then clock_timestamp() else null end where id=r.id;
 return public.cp_practice_state(r.id);
end $$;

revoke all on function public.cp_assign_teacher(uuid,text,boolean),public.cp_teacher_directory(uuid),public.cp_practice_catalog(),public.cp_practice_state(uuid),public.cp_practice_start(uuid,int),public.cp_practice_answer(uuid,int,int) from public,anon;
grant execute on function public.cp_assign_teacher(uuid,text,boolean),public.cp_teacher_directory(uuid),public.cp_practice_catalog(),public.cp_practice_state(uuid),public.cp_practice_start(uuid,int),public.cp_practice_answer(uuid,int,int) to authenticated;
revoke all on function public.cp_provision(uuid,uuid),public.cp_can_manage(uuid) from public,anon,authenticated;
insert into public.cp_migrations(id) values('learning-v4') on conflict do nothing;

commit;
