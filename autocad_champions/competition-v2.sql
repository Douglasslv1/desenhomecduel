-- Aplicar após schema.sql. Mantém as perguntas existentes.
-- Não aplicar durante um duelo antigo ainda em andamento: encerre ou arquive antes.
begin;
do $$ begin
 if exists(select 1 from public.ac_matches where p1 is not null and p2 is not null and winner is null)
 and (select started from public.ac_settings where id=1) then
  raise exception 'Encerre ou arquive o campeonato atual antes de atualizar';
 end if;
end $$;
alter table public.ac_settings add column if not exists phase text not null default 'registration';
alter table public.ac_settings add column if not exists leveling_questions int[] not null default '{}';
update public.ac_settings set phase='finished' where started and phase='registration';
alter table public.ac_players add column if not exists disqualified boolean not null default false;
alter table public.ac_players add column if not exists disqualification_reason text;
alter table public.ac_players add column if not exists disqualified_at timestamptz;
alter table public.ac_players add column if not exists disqualified_by uuid;
create table if not exists public.ac_runs(
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.ac_players(id) on delete cascade,
 match_id uuid references public.ac_matches(id) on delete cascade,
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
create unique index if not exists ac_runs_leveling_player on public.ac_runs(player_id) where stage='leveling';
create table if not exists public.ac_responses(
 run_id uuid not null references public.ac_runs(id) on delete cascade,
 question_id int not null references public.ac_questions(id),
 choice int,
 correct boolean not null,
 timed_out boolean not null default false,
 opened_at timestamptz not null,
 answered_at timestamptz not null,
 primary key(run_id,question_id)
);
alter table public.ac_runs enable row level security;
alter table public.ac_responses enable row level security;
revoke all on public.ac_runs,public.ac_responses from anon,authenticated;

-- Uso interno. Todos os pontos de entrada usam o mesmo lock transacional.
create or replace function public.ac_advance() returns void
language plpgsql security definer set search_path='' as $$
declare m record; v_rounds int; v1 uuid; v2 uuid; loser uuid; ready boolean; progressed boolean;
begin
 select total_rounds into v_rounds from public.ac_meta where id=1;
 if v_rounds is null then return; end if;
 for iteration in 1..64 loop
  progressed:=false;
  for m in select * from public.ac_matches order by round,is_third,slot loop
   -- O cursor guarda uma fotografia anterior às atualizações dos alimentadores.
   -- Releia a linha antes de decidir se ela possui um ou dois adversários.
   select * into m from public.ac_matches where id=m.id;
   if m.status in ('advanced','empty') then continue; end if;
   if m.winner is null then
    ready:=m.round=1 and not m.is_third;
    if m.is_third then
     select count(*)=2 and bool_and(status in ('advanced','empty')) into ready
      from public.ac_matches where round=v_rounds-1 and not is_third;
    elsif m.round>1 then
     select count(*)=2 and bool_and(status in ('advanced','empty')) into ready
      from public.ac_matches where round=m.round-1 and not is_third and slot in (2*m.slot,2*m.slot+1);
    end if;
    if not coalesce(ready,false) then continue; end if;
    select id into v1 from public.ac_players where id=m.p1 and not disqualified;
    select id into v2 from public.ac_players where id=m.p2 and not disqualified;
    if v1 is not null and v2 is not null then continue; end if;
    if v1 is null and v2 is null then
     update public.ac_matches set status='empty' where id=m.id;
     update public.ac_runs set finished_at=coalesce(finished_at,clock_timestamp()) where match_id=m.id;
     progressed:=true; continue;
    end if;
    m.winner:=coalesce(v1,v2);
    update public.ac_matches set winner=m.winner,status='bye' where id=m.id;
    update public.ac_runs set finished_at=coalesce(finished_at,clock_timestamp()) where match_id=m.id;
   end if;
   if not m.is_third and m.round<v_rounds then
    update public.ac_matches set
     p1=case when mod(m.slot,2)=0 then m.winner else p1 end,
     p2=case when mod(m.slot,2)=1 then m.winner else p2 end
     where round=m.round+1 and slot=m.slot/2 and not is_third;
   end if;
   if not m.is_third and m.round=v_rounds-1 then
    loser:=case when m.winner=m.p1 then m.p2 else m.p1 end;
    if exists(select 1 from public.ac_players where id=loser and disqualified) then loser:=null; end if;
    update public.ac_matches set p1=case when m.slot=0 then loser else p1 end,
     p2=case when m.slot=1 then loser else p2 end where is_third;
   end if;
   update public.ac_matches set status='advanced' where id=m.id;
   progressed:=true;
  end loop;
  exit when not progressed;
 end loop;
end $$;

create or replace function public.ac_tick() returns void
language plpgsql security definer set search_path='' as $$
declare r record; m record; a public.ac_runs%rowtype; b public.ac_runs%rowtype;
 v_now timestamptz:=clock_timestamp(); v_deadline timestamptz; v_winner uuid;
begin
 -- Expiração permanece válida mesmo sem alunos conectados. Recupera todos os prazos vencidos.
 for r in select x.* from public.ac_runs x join public.ac_players p on p.id=x.player_id
  where x.finished_at is null and not p.disqualified order by x.id loop
  while r.position<=10 and r.question_started_at+interval '90 seconds'<=v_now loop
   v_deadline:=r.question_started_at+interval '90 seconds';
   insert into public.ac_responses(run_id,question_id,choice,correct,timed_out,opened_at,answered_at)
    values(r.id,r.questions[r.position],null,false,true,r.question_started_at,v_deadline);
   r.position:=r.position+1; r.question_started_at:=v_deadline;
  end loop;
  update public.ac_runs set position=r.position,question_started_at=r.question_started_at,
   finished_at=case when r.position=11 then r.question_started_at else null end where id=r.id;
 end loop;
 if (select phase from public.ac_settings where id=1)<>'knockout' then return; end if;
 for m in select * from public.ac_matches where winner is null and p1 is not null and p2 is not null and status='waiting' loop
  select * into a from public.ac_runs where match_id=m.id and player_id=m.p1;
  select * into b from public.ac_runs where match_id=m.id and player_id=m.p2;
  if a.id is null or b.id is null then continue; end if;
  update public.ac_matches set s1=a.score,s2=b.score,done1=a.finished_at is not null,done2=b.finished_at is not null where id=m.id;
  if a.finished_at is not null and b.finished_at is not null then
   v_winner:=case when a.score>b.score then m.p1 when b.score>a.score then m.p2
    when a.finished_at-a.started_at<b.finished_at-b.started_at then m.p1
    when b.finished_at-b.started_at<a.finished_at-a.started_at then m.p2
    when a.tie_order<b.tie_order then m.p1 else m.p2 end;
   update public.ac_matches set winner=v_winner,status='finished' where id=m.id;
  end if;
 end loop;
 perform public.ac_advance();
 -- Só começa o relógio quando os dois adversários já estão definidos.
 insert into public.ac_runs(player_id,match_id,stage,questions,started_at,question_started_at)
 select p.id,mat.id,'knockout',mat.questions,v_now,v_now
 from public.ac_matches mat join public.ac_players p on p.id in(mat.p1,mat.p2)
 where mat.winner is null and mat.status='waiting' and mat.p1 is not null and mat.p2 is not null
 and not p.disqualified on conflict(match_id,player_id) do nothing;
 if not exists(select 1 from public.ac_matches where status not in ('advanced','empty')) then
  update public.ac_settings set phase='finished' where id=1;
 end if;
end $$;

create or replace function public.ac_join(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(100019);
 if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
 if (select phase from public.ac_settings where id=1)<>'registration' then raise exception 'Inscrições encerradas'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 50 then raise exception 'Nome deve ter de 2 a 50 caracteres'; end if;
 if exists(select 1 from public.ac_players where user_id=auth.uid() and disqualified) then raise exception 'Participante desclassificado nesta edição'; end if;
 insert into public.ac_players(user_id,name) values(auth.uid(),trim(p_name)) on conflict(user_id) do update set name=excluded.name returning id into v_id;
 return v_id;
end $$;

-- Primeiro botão do professor: nivelamento comum de dez questões.
create or replace function public.ac_start() returns void
language plpgsql security definer set search_path='' as $$
declare v_q int[]; v_now timestamptz:=clock_timestamp();
begin
 if not public.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(100019);
 if (select phase from public.ac_settings where id=1)<>'registration' then raise exception 'Etapa já iniciada'; end if;
 if (select count(*) from public.ac_players where not disqualified)<4 then raise exception 'São necessários pelo menos quatro participantes habilitados'; end if;
 if (select count(*) from public.ac_questions)<10 then raise exception 'Cadastre pelo menos dez questões'; end if;
 select array_agg(id order by ordering) into v_q from
  (select id,random() ordering from public.ac_questions order by ordering limit 10) q;
 update public.ac_settings set started=true,phase='leveling',leveling_questions=v_q where id=1;
 insert into public.ac_runs(player_id,stage,questions,started_at,question_started_at)
  select id,'leveling',v_q,v_now,v_now from public.ac_players where not disqualified;
end $$;

create or replace function public.ac_start_knockout() returns void
language plpgsql security definer set search_path='' as $$
declare v_ids uuid[]; v_n int; v_size int:=2; v_rounds int:=1; v_byes int; v_slots int;
 v_q int[]; v_p1 uuid; v_p2 uuid; v_b int:=0; v_pair int:=0;
begin
 if not public.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(100019);
 perform public.ac_tick();
 if (select phase from public.ac_settings where id=1)<>'leveling' then raise exception 'O nivelamento não está em andamento'; end if;
 if exists(select 1 from public.ac_runs r join public.ac_players p on p.id=r.player_id where r.stage='leveling' and not p.disqualified and r.finished_at is null) then raise exception 'Aguarde todos concluírem o nivelamento'; end if;
 select array_agg(p.id order by r.score desc,r.finished_at-r.started_at,r.tie_order,p.id) into v_ids
  from public.ac_players p join public.ac_runs r on r.player_id=p.id and r.stage='leveling' where not p.disqualified;
 v_n:=coalesce(array_length(v_ids,1),0);
 if v_n<4 then raise exception 'São necessários pelo menos quatro participantes habilitados'; end if;
 while v_size<v_n loop v_size:=v_size*2;v_rounds:=v_rounds+1;end loop;
 v_byes:=v_size-v_n;v_slots:=v_size/2;
 insert into public.ac_meta(id,total_rounds) values(1,v_rounds);
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
    (select id,random() ordering from public.ac_questions order by ordering limit 10) q;
   insert into public.ac_matches(round,slot,p1,p2,questions) values(r,j,v_p1,v_p2,v_q);
  end loop;
 end loop;
 select array_agg(id order by ordering) into v_q from
  (select id,random() ordering from public.ac_questions order by ordering limit 10) q;
 insert into public.ac_matches(round,slot,is_third,questions) values(v_rounds,0,true,v_q);
 update public.ac_settings set phase='knockout' where id=1;
 perform public.ac_tick();
end $$;

create or replace function public.ac_submit(p_run uuid,p_question int,p_choice int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ac_runs%rowtype; v_correct boolean; v_now timestamptz;
begin
 perform pg_advisory_xact_lock(100019);
 if not exists(select 1 from public.ac_runs x join public.ac_players p on p.id=x.player_id
  where x.id=p_run and p.user_id=auth.uid() and not p.disqualified) then raise exception 'Etapa indisponível'; end if;
 perform public.ac_tick();
 select * into r from public.ac_runs where id=p_run;
 -- Não levantar erro aqui: precisamos confirmar os timeouts calculados pelo tick.
 if r.finished_at is not null or p_question is distinct from r.questions[r.position] then
  return jsonb_build_object('accepted',false,'expired',true);
 end if;
 if p_choice is null or not exists(select 1 from public.ac_questions where id=p_question and p_choice between 0 and jsonb_array_length(options)-1) then raise exception 'Alternativa inválida'; end if;
 v_now:=clock_timestamp();
 if v_now>=r.question_started_at+interval '90 seconds' then
  perform public.ac_tick();return jsonb_build_object('accepted',false,'expired',true);
 end if;
 select p_choice=correct into v_correct from public.ac_questions where id=p_question;
 insert into public.ac_responses(run_id,question_id,choice,correct,opened_at,answered_at)
 values(r.id,p_question,p_choice,v_correct,r.question_started_at,v_now);
 update public.ac_runs set score=score+case when v_correct then 1 else 0 end,position=position+1,
  question_started_at=v_now,finished_at=case when position=10 then v_now else null end where id=r.id;
 perform public.ac_tick();
 return jsonb_build_object('accepted',true,'correct',v_correct);
end $$;

-- Compatibilidade de assinatura sem permitir contornar a sequência ou os prazos.
create or replace function public.ac_answer(p_match uuid,p_question int,p_choice int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_run uuid;
begin
 select r.id into v_run from public.ac_runs r join public.ac_players p on p.id=r.player_id
  where r.match_id=p_match and p.user_id=auth.uid();
 if v_run is null then raise exception 'Duelo indisponível'; end if;
 return public.ac_submit(v_run,p_question,p_choice);
end $$;

create or replace function public.ac_disqualify(p_player uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_phase text;
begin
 if not public.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(100019);
 select phase into v_phase from public.ac_settings where id=1;
 if v_phase='finished' then raise exception 'O campeonato já terminou; não é possível alterar retroativamente o pódio'; end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Informe um motivo entre 3 e 500 caracteres'; end if;
 if not exists(select 1 from public.ac_players where id=p_player and not disqualified) then raise exception 'Participante indisponível'; end if;
 if v_phase='knockout' and not exists(select 1 from public.ac_matches where winner is null and status='waiting' and p_player in(p1,p2)) then raise exception 'Este participante não está mais disputando o campeonato'; end if;
 update public.ac_players set disqualified=true,disqualification_reason=trim(p_reason),disqualified_at=clock_timestamp(),disqualified_by=auth.uid() where id=p_player;
 update public.ac_runs set finished_at=coalesce(finished_at,clock_timestamp()) where player_id=p_player;
 -- Resolve primeiro a desclassificação para não decidir por tempo uma partida que foi encerrada pelo professor.
 if v_phase='knockout' then perform public.ac_advance(); end if;
 perform public.ac_tick();
end $$;

create or replace function public.ac_state() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_player uuid; v_admin boolean; v_phase text; v_matches jsonb; v_players jsonb;
 r public.ac_runs%rowtype; v_questions jsonb:='[]'; v_answers jsonb:='[]'; v_disqualified boolean;
 v_total int; v_done int;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
 perform pg_advisory_xact_lock(100019);
 v_admin:=public.ac_is_admin();
 select id,disqualified into v_player,v_disqualified from public.ac_players where user_id=auth.uid();
 if not v_admin and v_player is null then return jsonb_build_object('started',(select started from public.ac_settings where id=1),'registered',false); end if;
 perform public.ac_tick();
 select phase into v_phase from public.ac_settings where id=1;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'round',m.round,'slot',m.slot,'third',m.is_third,
  'p1',a.name,'p2',b.name,'p1_id',m.p1,'p2_id',m.p2,'winner',w.name,'winner_id',m.winner,
  'dq1',coalesce(a.disqualified,false),'dq2',coalesce(b.disqualified,false),
  's1',case when m.done1 then m.s1 else null end,'s2',case when m.done2 then m.s2 else null end,
  'done1',m.done1,'done2',m.done2,'status',m.status) order by m.round,m.is_third,m.slot),'[]'::jsonb) into v_matches
 from public.ac_matches m left join public.ac_players a on a.id=m.p1 left join public.ac_players b on b.id=m.p2 left join public.ac_players w on w.id=m.winner;
 if v_admin then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'disqualified',p.disqualified,
   'reason',p.disqualification_reason,'level_score',l.score,'level_done',l.finished_at is not null,
   'level_answered',coalesce(l.position-1,0),
   'can_disqualify',not p.disqualified and v_phase<>'finished' and (v_phase in ('registration','leveling') or
    exists(select 1 from public.ac_matches m where m.winner is null and m.status='waiting' and p.id in(m.p1,m.p2))))
   order by p.created_at,p.id),'[]'::jsonb) into v_players
  from public.ac_players p left join public.ac_runs l on l.player_id=p.id and l.stage='leveling';
 end if;
 select count(*),count(*) filter(where x.finished_at is not null) into v_total,v_done
 from public.ac_runs x join public.ac_players p on p.id=x.player_id where x.stage='leveling' and not p.disqualified;
 if not coalesce(v_disqualified,false) then
  select * into r from public.ac_runs where player_id=v_player and finished_at is null order by started_at desc limit 1;
 end if;
 if r.id is not null then
  select jsonb_build_array(jsonb_build_object('id',q.id,'q',q.statement,'op',q.options)) into v_questions
   from public.ac_questions q where q.id=r.questions[r.position];
  select coalesce(jsonb_agg(jsonb_build_object('id',question_id,'correct',correct,'timed_out',timed_out)),'[]'::jsonb)
   into v_answers from public.ac_responses where run_id=r.id;
 end if;
 return jsonb_build_object('api_version',2,'registered',v_player is not null,'admin',v_admin,'phase',v_phase,
  'started',(select started from public.ac_settings where id=1),'player_id',v_player,'disqualified',coalesce(v_disqualified,false),
  'players',coalesce(v_players,'[]'::jsonb),'matches',v_matches,'server_now',clock_timestamp(),
  'leveling',jsonb_build_object('total',v_total,'done',v_done,'ready',v_total>=4 and v_total=v_done),
  'active',case when r.id is null then null else jsonb_build_object('id',r.id,'match_id',r.match_id,'stage',r.stage,
   'round',(select round from public.ac_matches where id=r.match_id),'position',r.position,'score',r.score,
   'deadline',r.question_started_at+interval '90 seconds') end,
  'questions',coalesce(v_questions,'[]'::jsonb),'answers',v_answers);
end $$;

create or replace function public.ac_reset() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_archive uuid;
begin
 if not public.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(100019);
 if not (select started from public.ac_settings where id=1) then raise exception 'O campeonato ainda não foi iniciado'; end if;
 insert into public.ac_archives(archived_by,snapshot) values(auth.uid(),jsonb_build_object(
  'players',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.ac_players p),
  'matches',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.ac_matches m),
  'answers',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.ac_answers a),
  'runs',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.ac_runs r),
  'responses',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.ac_responses r),
  'meta',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.ac_meta m),
  'questions',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from public.ac_questions q),
  'settings',(select to_jsonb(s) from public.ac_settings s where id=1))) returning id into v_archive;
 delete from public.ac_responses where run_id is not null;
 delete from public.ac_runs where id is not null;
 delete from public.ac_answers where match_id is not null;
 delete from public.ac_matches where id is not null;
 delete from public.ac_players where id is not null;
 delete from public.ac_meta where id is not null;
 update public.ac_settings set started=false,phase='registration',leveling_questions='{}',created_at=now() where id=1;
 return v_archive;
end $$;

revoke all on function public.ac_tick(),public.ac_advance(),public.ac_start_knockout(),public.ac_submit(uuid,int,int),public.ac_disqualify(uuid,text) from public;
revoke all on function public.ac_tick(),public.ac_advance() from anon,authenticated;
grant execute on function public.ac_start_knockout(),public.ac_submit(uuid,int,int),public.ac_disqualify(uuid,text) to authenticated;
-- Funções antigas preservam seus grants de authenticated ao usar CREATE OR REPLACE.
commit;
