-- Aplicar após competition-v2.sql e, se desejado, questions-approved.sql.
-- Migração transacional. O conteúdo antigo permanece preservado.
begin;
select pg_advisory_xact_lock(200020);
do $$ begin
 if (select phase from public.ac_settings where id=1) in ('leveling','knockout') then
  raise exception 'Encerre ou arquive a edição atual antes de migrar a plataforma';
 end if;
end $$;
create table if not exists public.cp_disciplines(
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100),
 created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.cp_teachers(
 discipline_id uuid not null references public.cp_disciplines(id),
 user_id uuid not null references auth.users(id),primary key(discipline_id,user_id)
);
create table if not exists public.cp_banks(
 id uuid primary key default gen_random_uuid(), discipline_id uuid not null references public.cp_disciplines(id),
 name text not null check(length(name) between 2 and 100), revision int not null default 1,
 created_at timestamptz not null default now(),unique(id,discipline_id)
);
create table if not exists public.cp_questions(
 bank_id uuid not null references public.cp_banks(id),id int not null check(id>0),
 statement text not null check(length(statement) between 5 and 3000), options jsonb not null,
 correct int not null check(correct between 0 and 4),primary key(bank_id,id),
 check(jsonb_typeof(options)='array' and jsonb_array_length(options)=5)
);
create table if not exists public.cp_editions(
 id uuid primary key default gen_random_uuid(),discipline_id uuid not null references public.cp_disciplines(id),
 bank_id uuid not null,bank_revision int not null,
 name text not null check(length(name) between 2 and 100),
 code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 engine_schema text not null unique,archived_at timestamptz,created_by uuid,
 created_at timestamptz not null default now(),
 foreign key(bank_id,discipline_id) references public.cp_banks(id,discipline_id)
);
create table if not exists public.cp_engine(id int primary key check(id=1),sql_template text not null);
create table if not exists public.cp_migrations(id text primary key,applied_at timestamptz default now());
alter table public.cp_disciplines enable row level security;
alter table public.cp_teachers enable row level security;
alter table public.cp_banks enable row level security;
alter table public.cp_questions enable row level security;
alter table public.cp_editions enable row level security;
alter table public.cp_engine enable row level security;
alter table public.cp_migrations enable row level security;
revoke all on public.cp_disciplines,public.cp_teachers,public.cp_banks,public.cp_questions,public.cp_editions,public.cp_engine,public.cp_migrations from public,anon,authenticated;

create or replace function public.cp_can_manage(p_discipline uuid) returns boolean
language sql security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.cp_teachers where discipline_id=p_discipline and user_id=auth.uid())
$$;
create or replace function public.cp_is_owner() returns boolean
language sql security definer set search_path='' as $$select exists(select 1 from public.ac_admins where user_id=auth.uid())$$;

insert into public.cp_engine(id,sql_template) values(1,$engine$create table if not exists __EDITION__.ac_admins(user_id uuid primary key references auth.users(id));
create table if not exists __EDITION__.ac_players(id uuid primary key default gen_random_uuid(), user_id uuid unique not null, name text not null check(length(name) between 2 and 50), created_at timestamptz default now());
create table if not exists __EDITION__.ac_questions(id int primary key, statement text not null, options jsonb not null, correct int not null check(correct between 0 and 4));
create table if not exists __EDITION__.ac_settings(id int primary key default 1 check(id=1), started boolean not null default false, created_at timestamptz default now());
insert into __EDITION__.ac_settings(id) values(1) on conflict do nothing;
create table if not exists __EDITION__.ac_matches(id uuid primary key default gen_random_uuid(), round int not null, slot int not null, p1 uuid references __EDITION__.ac_players(id), p2 uuid references __EDITION__.ac_players(id), winner uuid references __EDITION__.ac_players(id), s1 int not null default 0, s2 int not null default 0, done1 boolean not null default false, done2 boolean not null default false, tie1 int not null default 0, tie2 int not null default 0, status text not null default 'waiting', questions int[] not null default '{}', is_third boolean not null default false, unique(round,slot,is_third));
create table if not exists __EDITION__.ac_answers(match_id uuid references __EDITION__.ac_matches(id) on delete cascade, player_id uuid references __EDITION__.ac_players(id), question_id int references __EDITION__.ac_questions(id), answer int not null, correct boolean not null, answered_at timestamptz default now(), primary key(match_id,player_id,question_id));
create table if not exists __EDITION__.ac_meta(id int primary key default 1, total_rounds int not null);

create table if not exists __EDITION__.ac_archives (
 id uuid primary key default gen_random_uuid(),
 archived_at timestamptz not null default now(),
 archived_by uuid not null,
 snapshot jsonb not null
);

alter table __EDITION__.ac_settings add column if not exists phase text not null default 'registration';
alter table __EDITION__.ac_settings add column if not exists leveling_questions int[] not null default '{}';
update __EDITION__.ac_settings set phase='finished' where started and phase='registration';
alter table __EDITION__.ac_players add column if not exists disqualified boolean not null default false;
alter table __EDITION__.ac_players add column if not exists disqualification_reason text;
alter table __EDITION__.ac_players add column if not exists disqualified_at timestamptz;
alter table __EDITION__.ac_players add column if not exists disqualified_by uuid;
create table if not exists __EDITION__.ac_runs(
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references __EDITION__.ac_players(id) on delete cascade,
 match_id uuid references __EDITION__.ac_matches(id) on delete cascade,
 stage text not null check(stage in ('leveling','knockout')),
 questions int[] not null check(array_length(questions,1)=10),
 position int not null default 1 check(position between 1 and 11),
 started_at timestamptz not null default now(),
 question_started_at timestamptz not null default now(),
 finished_at timestamptz,
 score int not null default 0 check(score between 0 and 10),
 tie_order float8 not null default random(),
 unique(match_id,player_id),
 check((stage='leveling' and match_id is null) or (stage='knockout' and match_id is not null))
);
create unique index if not exists ac_runs_leveling_player on __EDITION__.ac_runs(player_id) where stage='leveling';
create table if not exists __EDITION__.ac_responses(
 run_id uuid not null references __EDITION__.ac_runs(id) on delete cascade,
 question_id int not null references __EDITION__.ac_questions(id),
 choice int,
 correct boolean not null,
 timed_out boolean not null default false,
 opened_at timestamptz not null,
 answered_at timestamptz not null,
 primary key(run_id,question_id)
);
alter table __EDITION__.ac_runs enable row level security;
alter table __EDITION__.ac_responses enable row level security;
revoke all on __EDITION__.ac_runs,__EDITION__.ac_responses from anon,authenticated;


create or replace function __EDITION__.ac_advance() returns void
language plpgsql security definer set search_path='' as $$
declare m record; v_rounds int; v1 uuid; v2 uuid; loser uuid; ready boolean; progressed boolean;
begin
 select total_rounds into v_rounds from __EDITION__.ac_meta where id=1;
 if v_rounds is null then return; end if;
 for iteration in 1..64 loop
  progressed:=false;
  for m in select * from __EDITION__.ac_matches order by round,is_third,slot loop
   -- O cursor guarda uma fotografia anterior às atualizações dos alimentadores.
   -- Releia a linha antes de decidir se ela possui um ou dois adversários.
   select * into m from __EDITION__.ac_matches where id=m.id;
   if m.status in ('advanced','empty') then continue; end if;
   if m.winner is null then
    ready:=m.round=1 and not m.is_third;
    if m.is_third then
     select count(*)=2 and bool_and(status in ('advanced','empty')) into ready
      from __EDITION__.ac_matches where round=v_rounds-1 and not is_third;
    elsif m.round>1 then
     select count(*)=2 and bool_and(status in ('advanced','empty')) into ready
      from __EDITION__.ac_matches where round=m.round-1 and not is_third and slot in (2*m.slot,2*m.slot+1);
    end if;
    if not coalesce(ready,false) then continue; end if;
    select id into v1 from __EDITION__.ac_players where id=m.p1 and not disqualified;
    select id into v2 from __EDITION__.ac_players where id=m.p2 and not disqualified;
    if v1 is not null and v2 is not null then continue; end if;
    if v1 is null and v2 is null then
     update __EDITION__.ac_matches set status='empty' where id=m.id;
     update __EDITION__.ac_runs set finished_at=coalesce(finished_at,clock_timestamp()) where match_id=m.id;
     progressed:=true; continue;
    end if;
    m.winner:=coalesce(v1,v2);
    update __EDITION__.ac_matches set winner=m.winner,status='bye' where id=m.id;
    update __EDITION__.ac_runs set finished_at=coalesce(finished_at,clock_timestamp()) where match_id=m.id;
   end if;
   if not m.is_third and m.round<v_rounds then
    update __EDITION__.ac_matches set
     p1=case when mod(m.slot,2)=0 then m.winner else p1 end,
     p2=case when mod(m.slot,2)=1 then m.winner else p2 end
     where round=m.round+1 and slot=m.slot/2 and not is_third;
   end if;
   if not m.is_third and m.round=v_rounds-1 then
    loser:=case when m.winner=m.p1 then m.p2 else m.p1 end;
    if exists(select 1 from __EDITION__.ac_players where id=loser and disqualified) then loser:=null; end if;
    update __EDITION__.ac_matches set p1=case when m.slot=0 then loser else p1 end,
     p2=case when m.slot=1 then loser else p2 end where is_third;
   end if;
   update __EDITION__.ac_matches set status='advanced' where id=m.id;
   progressed:=true;
  end loop;
  exit when not progressed;
 end loop;
end $$;
create or replace function __EDITION__.ac_tick() returns void
language plpgsql security definer set search_path='' as $$
declare r record; m record; a __EDITION__.ac_runs%rowtype; b __EDITION__.ac_runs%rowtype;
 v_now timestamptz:=clock_timestamp(); v_deadline timestamptz; v_winner uuid;
begin
 -- Expiração permanece válida mesmo sem alunos conectados. Recupera todos os prazos vencidos.
 for r in select x.* from __EDITION__.ac_runs x join __EDITION__.ac_players p on p.id=x.player_id
  where x.finished_at is null and not p.disqualified order by x.id loop
  while r.position<=10 and r.question_started_at+interval '90 seconds'<=v_now loop
   v_deadline:=r.question_started_at+interval '90 seconds';
   insert into __EDITION__.ac_responses(run_id,question_id,choice,correct,timed_out,opened_at,answered_at)
    values(r.id,r.questions[r.position],null,false,true,r.question_started_at,v_deadline);
   r.position:=r.position+1; r.question_started_at:=v_deadline;
  end loop;
  update __EDITION__.ac_runs set position=r.position,question_started_at=r.question_started_at,
   finished_at=case when r.position=11 then r.question_started_at else null end where id=r.id;
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
create or replace function __EDITION__.ac_join(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
 if (select phase from __EDITION__.ac_settings where id=1)<>'registration' then raise exception 'Inscrições encerradas'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 50 then raise exception 'Nome deve ter de 2 a 50 caracteres'; end if;
 if exists(select 1 from __EDITION__.ac_players where user_id=auth.uid() and disqualified) then raise exception 'Participante desclassificado nesta edição'; end if;
 insert into __EDITION__.ac_players(user_id,name) values(auth.uid(),trim(p_name)) on conflict(user_id) do update set name=excluded.name returning id into v_id;
 return v_id;
end $$;
create or replace function __EDITION__.ac_start() returns void
language plpgsql security definer set search_path='' as $$
declare v_q int[]; v_now timestamptz:=clock_timestamp();
begin
 if not __EDITION__.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 if (select phase from __EDITION__.ac_settings where id=1)<>'registration' then raise exception 'Etapa já iniciada'; end if;
 if (select count(*) from __EDITION__.ac_players where not disqualified)<4 then raise exception 'São necessários pelo menos quatro participantes habilitados'; end if;
 if (select count(*) from __EDITION__.ac_questions)<10 then raise exception 'Cadastre pelo menos dez questões'; end if;
 select array_agg(id order by ordering) into v_q from
  (select id,random() ordering from __EDITION__.ac_questions order by ordering limit 10) q;
 update __EDITION__.ac_settings set started=true,phase='leveling',leveling_questions=v_q where id=1;
 insert into __EDITION__.ac_runs(player_id,stage,questions,started_at,question_started_at)
  select id,'leveling',v_q,v_now,v_now from __EDITION__.ac_players where not disqualified;
end $$;
create or replace function __EDITION__.ac_start_knockout() returns void
language plpgsql security definer set search_path='' as $$
declare v_ids uuid[]; v_n int; v_size int:=2; v_rounds int:=1; v_byes int; v_slots int;
 v_q int[]; v_p1 uuid; v_p2 uuid; v_b int:=0; v_pair int:=0;
begin
 if not __EDITION__.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 perform __EDITION__.ac_tick();
 if (select phase from __EDITION__.ac_settings where id=1)<>'leveling' then raise exception 'O nivelamento não está em andamento'; end if;
 if exists(select 1 from __EDITION__.ac_runs r join __EDITION__.ac_players p on p.id=r.player_id where r.stage='leveling' and not p.disqualified and r.finished_at is null) then raise exception 'Aguarde todos concluírem o nivelamento'; end if;
 select array_agg(p.id order by r.score desc,r.finished_at-r.started_at,r.tie_order,p.id) into v_ids
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
  question_started_at=v_now,finished_at=case when position=10 then v_now else null end where id=r.id;
 perform __EDITION__.ac_tick();
 return jsonb_build_object('accepted',true,'correct',v_correct);
end $$;
create or replace function __EDITION__.ac_answer(p_match uuid,p_question int,p_choice int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_run uuid;
begin
 select r.id into v_run from __EDITION__.ac_runs r join __EDITION__.ac_players p on p.id=r.player_id
  where r.match_id=p_match and p.user_id=auth.uid();
 if v_run is null then raise exception 'Duelo indisponível'; end if;
 return __EDITION__.ac_submit(v_run,p_question,p_choice);
end $$;
create or replace function __EDITION__.ac_disqualify(p_player uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_phase text;
begin
 if not __EDITION__.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 select phase into v_phase from __EDITION__.ac_settings where id=1;
 if v_phase='finished' then raise exception 'O campeonato já terminou; não é possível alterar retroativamente o pódio'; end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Informe um motivo entre 3 e 500 caracteres'; end if;
 if not exists(select 1 from __EDITION__.ac_players where id=p_player and not disqualified) then raise exception 'Participante indisponível'; end if;
 if v_phase='knockout' and not exists(select 1 from __EDITION__.ac_matches where winner is null and status='waiting' and p_player in(p1,p2)) then raise exception 'Este participante não está mais disputando o campeonato'; end if;
 update __EDITION__.ac_players set disqualified=true,disqualification_reason=trim(p_reason),disqualified_at=clock_timestamp(),disqualified_by=auth.uid() where id=p_player;
 update __EDITION__.ac_runs set finished_at=coalesce(finished_at,clock_timestamp()) where player_id=p_player;
 -- Resolve primeiro a desclassificação para não decidir por tempo uma partida que foi encerrada pelo professor.
 if v_phase='knockout' then perform __EDITION__.ac_advance(); end if;
 perform __EDITION__.ac_tick();
end $$;
create or replace function __EDITION__.ac_state() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_player uuid; v_admin boolean; v_phase text; v_matches jsonb; v_players jsonb;
 r __EDITION__.ac_runs%rowtype; v_questions jsonb:='[]'; v_answers jsonb:='[]'; v_disqualified boolean;
 v_total int; v_done int;
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
 return jsonb_build_object('api_version',2,'registered',v_player is not null,'admin',v_admin,'phase',v_phase,
  'started',(select started from __EDITION__.ac_settings where id=1),'player_id',v_player,'disqualified',coalesce(v_disqualified,false),
  'players',coalesce(v_players,'[]'::jsonb),'matches',v_matches,'server_now',clock_timestamp(),
  'leveling',jsonb_build_object('total',v_total,'done',v_done,'ready',v_total>=4 and v_total=v_done),
  'active',case when r.id is null then null else jsonb_build_object('id',r.id,'match_id',r.match_id,'stage',r.stage,
   'round',(select round from __EDITION__.ac_matches where id=r.match_id),'position',r.position,'score',r.score,
   'deadline',r.question_started_at+interval '90 seconds') end,
  'questions',coalesce(v_questions,'[]'::jsonb),'answers',v_answers);
end $$;
create or replace function __EDITION__.ac_reset() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_archive uuid;
begin
 if not __EDITION__.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 if not (select started from __EDITION__.ac_settings where id=1) then raise exception 'O campeonato ainda não foi iniciado'; end if;
 insert into __EDITION__.ac_archives(archived_by,snapshot) values(auth.uid(),jsonb_build_object(
  'players',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from __EDITION__.ac_players p),
  'matches',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from __EDITION__.ac_matches m),
  'answers',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from __EDITION__.ac_answers a),
  'runs',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from __EDITION__.ac_runs r),
  'responses',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from __EDITION__.ac_responses r),
  'meta',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from __EDITION__.ac_meta m),
  'questions',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from __EDITION__.ac_questions q),
  'settings',(select to_jsonb(s) from __EDITION__.ac_settings s where id=1))) returning id into v_archive;
 delete from __EDITION__.ac_responses where run_id is not null;
 delete from __EDITION__.ac_runs where id is not null;
 delete from __EDITION__.ac_answers where match_id is not null;
 delete from __EDITION__.ac_matches where id is not null;
 delete from __EDITION__.ac_players where id is not null;
 delete from __EDITION__.ac_meta where id is not null;
 update __EDITION__.ac_settings set started=false,phase='registration',leveling_questions='{}',created_at=now() where id=1;
 return v_archive;
end $$;
create or replace function __EDITION__.ac_is_admin() returns boolean language sql security definer set search_path='' as $$select public.cp_can_manage('__DISCIPLINE__'::uuid)$$;
revoke all on all tables in schema __EDITION__ from public,anon,authenticated;
revoke all on all functions in schema __EDITION__ from public,anon,authenticated;
revoke all on schema __EDITION__ from public,anon,authenticated;$engine$) on conflict(id) do update set sql_template=excluded.sql_template;


create or replace function public.cp_provision(p_id uuid,p_discipline uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_schema text:='cp_e_'||replace(p_id::text,'-','');v_sql text;
begin
 select sql_template into v_sql from public.cp_engine where id=1;
 if v_sql is null then raise exception 'Motor de campeonato não configurado';end if;
 execute format('create schema %I',v_schema);
 execute replace(replace(v_sql,'__EDITION__',v_schema),'__DISCIPLINE__',p_discipline::text);
end $$;

create or replace function public.cp_create_discipline(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.cp_is_owner() then raise exception 'Apenas administrador da plataforma';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 100 then raise exception 'Informe um nome entre 2 e 100 caracteres';end if;
 insert into public.cp_disciplines(name,created_by) values(trim(p_name),auth.uid()) returning id into v_id;
 insert into public.cp_teachers(discipline_id,user_id) values(v_id,auth.uid());return v_id;
end $$;

create or replace function public.cp_set_teacher(p_discipline uuid,p_user uuid,p_allowed boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.cp_is_owner() then raise exception 'Apenas administrador da plataforma';end if;
 if p_allowed is null then raise exception 'Defina a permissão';end if;
 if p_allowed then
  insert into public.cp_teachers(discipline_id,user_id) values(p_discipline,p_user) on conflict do nothing;
 else
  if p_user=auth.uid() then raise exception 'Você não pode retirar seu próprio acesso';end if;
  delete from public.cp_teachers where discipline_id=p_discipline and user_id=p_user;
 end if;
end $$;

create or replace function public.cp_create_bank(p_discipline uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.cp_can_manage(p_discipline) then raise exception 'Sem acesso à disciplina';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 100 then raise exception 'Informe um nome entre 2 e 100 caracteres';end if;
 insert into public.cp_banks(discipline_id,name) values(p_discipline,trim(p_name)) returning id into v_id;return v_id;
end $$;

-- Adiciona ou atualiza questões do banco. Edições existentes têm sua própria cópia.
create or replace function public.cp_save_questions(p_bank uuid,p_questions jsonb) returns int
language plpgsql security definer set search_path='' as $$
declare v_discipline uuid;q jsonb;v_seen int[]:='{}';v_id int;v_count int:=0;
begin
 select discipline_id into v_discipline from public.cp_banks where id=p_bank;
 if not public.cp_can_manage(v_discipline) then raise exception 'Sem acesso ao banco';end if;
 perform 1 from public.cp_banks where id=p_bank for update;
 if p_questions is null or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 1000 then raise exception 'Envie de 1 a 1000 questões';end if;
 for q in select value from jsonb_array_elements(p_questions) loop
  if jsonb_typeof(q)<>'object' or coalesce(q->>'id','')!~'^[1-9][0-9]*$' then raise exception 'Cada questão deve ter um número positivo';end if;
  v_id:=(q->>'id')::int;
  if v_id=any(v_seen) then raise exception 'Número de questão repetido: %',v_id;end if;v_seen:=array_append(v_seen,v_id);
  if q->>'statement' is null or length(trim(q->>'statement')) not between 5 and 3000 then raise exception 'Enunciado inválido na questão %',v_id;end if;
  if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Informe cinco alternativas na questão %',v_id;end if;
  if jsonb_array_length(q->'options')<>5 then raise exception 'Informe cinco alternativas na questão %',v_id;end if;
  if exists(select 1 from jsonb_array_elements(q->'options') a where jsonb_typeof(a)<>'string' or length(trim(a#>>'{}')) not between 1 and 1000) then raise exception 'Alternativa inválida na questão %',v_id;end if;
  if (select count(distinct lower(trim(value))) from jsonb_array_elements_text(q->'options'))<>5 then raise exception 'Alternativas repetidas na questão %',v_id;end if;
  if coalesce(q->>'correct','')!~'^[0-4]$' then raise exception 'Gabarito deve ser de 0 a 4 na questão %',v_id;end if;
  insert into public.cp_questions(bank_id,id,statement,options,correct) values(p_bank,v_id,trim(q->>'statement'),q->'options',(q->>'correct')::int)
   on conflict(bank_id,id) do update set statement=excluded.statement,options=excluded.options,correct=excluded.correct;
  v_count:=v_count+1;
 end loop;
 update public.cp_banks set revision=revision+1 where id=p_bank;return v_count;
end $$;

create or replace function public.cp_bank_questions(p_bank uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 if not public.cp_can_manage((select discipline_id from public.cp_banks where id=p_bank)) then raise exception 'Sem acesso ao banco';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'statement',statement,'options',options,'correct',correct) order by id),'[]') into v_result from public.cp_questions where bank_id=p_bank;return v_result;
end $$;

create or replace function public.cp_create_edition(p_discipline uuid,p_bank uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=gen_random_uuid();v_schema text:='cp_e_'||replace(v_id::text,'-','');v_revision int;
begin
 if not public.cp_can_manage(p_discipline) then raise exception 'Sem acesso à disciplina';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 100 then raise exception 'Informe um nome entre 2 e 100 caracteres';end if;
 select revision into v_revision from public.cp_banks where id=p_bank and discipline_id=p_discipline for update;
 if v_revision is null then raise exception 'Banco não pertence à disciplina';end if;
 if (select count(*) from public.cp_questions where bank_id=p_bank)<10 then raise exception 'O banco precisa de pelo menos dez questões';end if;
 insert into public.cp_editions(id,discipline_id,bank_id,bank_revision,name,engine_schema,created_by)
 values(v_id,p_discipline,p_bank,v_revision,trim(p_name),v_schema,auth.uid());
 perform public.cp_provision(v_id,p_discipline);
 execute format('insert into %I.ac_questions(id,statement,options,correct) select id,statement,options,correct from public.cp_questions where bank_id=$1',v_schema) using p_bank;
 return v_id;
end $$;

create or replace function public.cp_resolve(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e record;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro';end if;
 select x.*,d.name discipline_name into e from public.cp_editions x join public.cp_disciplines d on d.id=x.discipline_id
  where x.code=upper(trim(p_code));
 if e.id is null then raise exception 'Código de campeonato não encontrado';end if;
 if e.archived_at is not null then raise exception 'Este campeonato foi arquivado. Solicite um novo link ao professor';end if;
 return jsonb_build_object('id',e.id,'name',e.name,'discipline',e.discipline_name,'code',e.code);
end $$;

create or replace function public.cp_catalog() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_disciplines jsonb;v_editions jsonb:='[]';e record;v_phase text;v_count int;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,
  'teachers',(select coalesce(jsonb_agg(t.user_id),'[]') from public.cp_teachers t where t.discipline_id=d.id),
  'banks',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'revision',b.revision,
   'count',(select count(*) from public.cp_questions q where q.bank_id=b.id)) order by b.created_at),'[]') from public.cp_banks b where b.discipline_id=d.id)) order by d.created_at,d.id),'[]') into v_disciplines
 from public.cp_disciplines d where public.cp_can_manage(d.id);
 for e in select x.* from public.cp_editions x where public.cp_can_manage(x.discipline_id) order by x.created_at desc loop
  execute format('select phase from %I.ac_settings where id=1',e.engine_schema) into v_phase;
  execute format('select count(*) from %I.ac_players',e.engine_schema) into v_count;
  v_editions:=v_editions||jsonb_build_array(jsonb_build_object('id',e.id,'name',e.name,'discipline_id',e.discipline_id,
   'bank_id',e.bank_id,'bank_revision',e.bank_revision,'code',e.code,'phase',v_phase,'players',v_count,'archived',e.archived_at is not null));
 end loop;
 return jsonb_build_object('owner',public.cp_is_owner(),'disciplines',v_disciplines,'editions',v_editions);
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
 when 'ac_disqualify' then execute format('select %I.ac_disqualify($1,$2)',e.engine_schema) using (p_args->>'p_player')::uuid,p_args->>'p_reason';v_result:='null';
 else raise exception 'Ação não permitida';end case;
 if p_action='ac_state' then
  v_result:=v_result||jsonb_build_object('edition',jsonb_build_object('id',e.id,'name',e.name,'code',e.code,'archived',e.archived_at is not null,
   'discipline',(select name from public.cp_disciplines where id=e.discipline_id),'bank_revision',e.bank_revision));
 end if;
 return v_result;
end $$;

create table if not exists public.cp_frozen(edition_id uuid primary key references public.cp_editions(id),snapshot jsonb not null);
alter table public.cp_frozen enable row level security;
revoke all on public.cp_frozen from public,anon,authenticated;
-- Snapshot do painel capturado uma única vez sob o lock da edição.
create or replace function public.cp_archive(p_edition uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.cp_editions%rowtype;v_state jsonb;
begin
 select * into e from public.cp_editions where id=p_edition for update;
 if not public.cp_can_manage(e.discipline_id) then raise exception 'Sem acesso ao campeonato';end if;
 if e.archived_at is not null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(e.engine_schema,0));
 execute format('select %I.ac_state()',e.engine_schema) into v_state;
 insert into public.cp_frozen(edition_id,snapshot) values(e.id,v_state);
 update public.cp_editions set archived_at=clock_timestamp() where id=e.id;
end $$;

-- Importação inicial preservando a edição atual, suas perguntas e todos os arquivos anteriores.
do $$
declare d uuid;ads uuid;b uuid;v_id uuid:=gen_random_uuid();s text:='cp_e_'||replace(v_id::text,'-','');t text;
begin
 if not exists(select 1 from public.cp_migrations where id='multidisciplines-v1') then
  insert into public.cp_disciplines(name) values('Desenho Mecânico') returning id into d;
  insert into public.cp_disciplines(name) values('Análise e Desenvolvimento de Sistemas') returning id into ads;
  insert into public.cp_teachers(discipline_id,user_id) select d,user_id from public.ac_admins;
  insert into public.cp_teachers(discipline_id,user_id) select ads,user_id from public.ac_admins;
  insert into public.cp_banks(discipline_id,name) values(d,'AutoCAD e Desenho Técnico') returning id into b;
  insert into public.cp_questions(bank_id,id,statement,options,correct) select b,id,statement,options,correct from public.ac_questions;
  insert into public.cp_banks(discipline_id,name) values(ads,'Questões de ADS');
  insert into public.cp_editions(id,discipline_id,bank_id,bank_revision,name,engine_schema)
   values(v_id,d,b,1,'Campeonato de Desenho Mecânico importado',s);
  perform public.cp_provision(v_id,d);
  foreach t in array array['ac_questions','ac_players','ac_matches','ac_answers','ac_meta','ac_archives','ac_runs','ac_responses'] loop
   execute format('insert into %I.%I select * from public.%I',s,t,t);
  end loop;
  execute format('update %I.ac_settings set (started,created_at,phase,leveling_questions)=(select started,created_at,phase,leveling_questions from public.ac_settings where id=1) where id=1',s);
  insert into public.cp_migrations(id) values('multidisciplines-v1');
 end if;
end $$;

-- O motor antigo permanece preservado para auditoria, mas deixa de receber chamadas do navegador.
revoke execute on function public.ac_join(text),public.ac_start(),public.ac_start_knockout(),public.ac_submit(uuid,int,int),public.ac_answer(uuid,int,int),public.ac_disqualify(uuid,text),public.ac_state(),public.ac_reset(),public.ac_is_admin() from authenticated,anon,public;
revoke all on function public.cp_can_manage(uuid),public.cp_is_owner(),public.cp_provision(uuid,uuid) from public,anon,authenticated;
revoke all on function public.cp_create_discipline(text),public.cp_set_teacher(uuid,uuid,boolean),public.cp_create_bank(uuid,text),public.cp_save_questions(uuid,jsonb),public.cp_bank_questions(uuid),public.cp_create_edition(uuid,uuid,text),public.cp_resolve(text),public.cp_catalog(),public.cp_archive(uuid),public.cp_rpc(uuid,text,jsonb) from public,anon;
grant execute on function public.cp_create_discipline(text),public.cp_set_teacher(uuid,uuid,boolean),public.cp_create_bank(uuid,text),public.cp_save_questions(uuid,jsonb),public.cp_bank_questions(uuid),public.cp_create_edition(uuid,uuid,text),public.cp_resolve(text),public.cp_catalog(),public.cp_archive(uuid),public.cp_rpc(uuid,text,jsonb) to authenticated;
commit;
