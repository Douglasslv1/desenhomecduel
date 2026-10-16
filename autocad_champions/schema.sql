-- Execute no SQL Editor do Supabase em um projeto dedicado.
-- Ative Authentication > Providers > Anonymous Sign-Ins.
create extension if not exists pgcrypto;
create table if not exists public.ac_admins(user_id uuid primary key references auth.users(id));
create table if not exists public.ac_players(id uuid primary key default gen_random_uuid(), user_id uuid unique not null, name text not null check(length(name) between 2 and 50), created_at timestamptz default now());
create table if not exists public.ac_questions(id int primary key, statement text not null, options jsonb not null, correct int not null check(correct between 0 and 4));
create table if not exists public.ac_settings(id int primary key default 1 check(id=1), started boolean not null default false, created_at timestamptz default now());
insert into public.ac_settings(id) values(1) on conflict do nothing;
create table if not exists public.ac_matches(id uuid primary key default gen_random_uuid(), round int not null, slot int not null, p1 uuid references public.ac_players(id), p2 uuid references public.ac_players(id), winner uuid references public.ac_players(id), s1 int not null default 0, s2 int not null default 0, done1 boolean not null default false, done2 boolean not null default false, tie1 int not null default 0, tie2 int not null default 0, status text not null default 'waiting', questions int[] not null default '{}', is_third boolean not null default false, unique(round,slot,is_third));
create table if not exists public.ac_answers(match_id uuid references public.ac_matches(id) on delete cascade, player_id uuid references public.ac_players(id), question_id int references public.ac_questions(id), answer int not null, correct boolean not null, answered_at timestamptz default now(), primary key(match_id,player_id,question_id));
create table if not exists public.ac_meta(id int primary key default 1, total_rounds int not null);
-- Negar acesso direto às tabelas: todas as operações passam por RPC.
alter table public.ac_admins enable row level security;
alter table public.ac_players enable row level security;
alter table public.ac_questions enable row level security;
alter table public.ac_settings enable row level security;
alter table public.ac_matches enable row level security;
alter table public.ac_answers enable row level security;
alter table public.ac_meta enable row level security;
revoke all on public.ac_admins,public.ac_players,public.ac_questions,public.ac_settings,public.ac_matches,public.ac_answers,public.ac_meta from anon,authenticated;
create or replace function public.ac_is_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.ac_admins where user_id=auth.uid())$$;
create or replace function public.ac_join(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Faça login anônimo primeiro'; end if;
 if (select started from public.ac_settings where id=1) then raise exception 'Inscrições encerradas'; end if;
 if length(trim(p_name)) not between 2 and 50 then raise exception 'Nome deve ter de 2 a 50 caracteres'; end if;
 insert into public.ac_players(user_id,name) values(auth.uid(),trim(p_name)) on conflict(user_id) do update set name=excluded.name returning id into v_id;
 return v_id;
end $$;
-- Avança chaves preenchendo vencedores; quando há bye, classifica automaticamente.
create or replace function public.ac_advance() returns void language plpgsql security definer set search_path='' as $$
declare m record; v_rounds int; v_next uuid; v_third uuid; v_progress boolean; v_count int:=0;
begin
 select total_rounds into v_rounds from public.ac_meta where id=1;
 if v_rounds is null then return; end if;
 loop
  v_progress:=false; v_count:=v_count+1; if v_count>200 then exit; end if;
  for m in select * from public.ac_matches where winner is not null and status <> 'advanced' order by round,slot loop
   if m.is_third then update public.ac_matches set status='advanced' where id=m.id; continue; end if;
   if m.round<v_rounds then
    update public.ac_matches set p1=case when mod(m.slot,2)=0 then m.winner else p1 end,
     p2=case when mod(m.slot,2)=1 then m.winner else p2 end
     where round=m.round+1 and slot=floor(m.slot/2.0)::int and not is_third;
   end if;
   if m.round=v_rounds-1 then
    v_third:=case when m.p1=m.winner then m.p2 else m.p1 end;
    if v_third is not null then
     update public.ac_matches set p1=case when m.slot=0 then v_third else p1 end,
      p2=case when m.slot=1 then v_third else p2 end where is_third;
    end if;
   end if;
   update public.ac_matches set status='advanced' where id=m.id;
   v_progress:=true;
  end loop;
  -- Slots vazios e byes só são resolvidos quando os alimentadores estão resolvidos.
  for m in select * from public.ac_matches where winner is null and status='waiting' and not is_third order by round,slot loop
   if m.round=1 or (select count(*)=2 and bool_and(status in ('advanced','empty')) from public.ac_matches where round=m.round-1 and not is_third and slot in (m.slot*2,m.slot*2+1)) then
    if m.p1 is null and m.p2 is null then
     update public.ac_matches set status='empty' where id=m.id; v_progress:=true;
    elsif m.p1 is null or m.p2 is null then
     update public.ac_matches set winner=coalesce(m.p1,m.p2),status='bye' where id=m.id; v_progress:=true;
    end if;
   end if;
  end loop;
  exit when not v_progress;
 end loop;
end $$;
create or replace function public.ac_start() returns void language plpgsql security definer set search_path='' as $$
declare v_ids uuid[]; v_n int; v_size int:=2; v_rounds int:=1; r int; j int; v_q int[]; v_i int;
begin
 if not public.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(100019);
 if (select started from public.ac_settings where id=1) then raise exception 'Torneio já iniciado'; end if;
 select array_agg(id order by random()) into v_ids from public.ac_players;
 v_n:=coalesce(array_length(v_ids,1),0);
 if v_n<4 then raise exception 'São necessários ao menos 4 alunos para definir pódio'; end if;
 if (select count(*) from public.ac_questions)<>40 then raise exception 'Cadastre exatamente 40 perguntas'; end if;
 while v_size<v_n loop v_size:=v_size*2; v_rounds:=v_rounds+1; end loop;
 delete from public.ac_answers; delete from public.ac_matches; delete from public.ac_meta;
 insert into public.ac_meta(id,total_rounds) values(1,v_rounds);
 for r in 1..v_rounds loop
  for j in 0..(v_size/(2^r)::int)-1 loop
   select array_agg(id order by seq) into v_q from (select id,row_number() over() seq from (select id from public.ac_questions order by random() limit 10) x) y;
   insert into public.ac_matches(round,slot,p1,p2,questions) values(r,j,
    case when r=1 then v_ids[2*j+1] else null end,
    case when r=1 then v_ids[2*j+2] else null end,v_q);
  end loop;
 end loop;
 select array_agg(id order by seq) into v_q from (select id,row_number() over() seq from (select id from public.ac_questions order by random() limit 10) x) y;
 insert into public.ac_matches(round,slot,is_third,questions) values(v_rounds,0,true,v_q);
 update public.ac_settings set started=true where id=1;
 perform public.ac_advance();
end $$;
create or replace function public.ac_answer(p_match uuid,p_question int,p_choice int) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.ac_matches%rowtype; v_player uuid; v_correct int; v_count int; v_score int; v_done boolean; v_is1 boolean; v_winner uuid; v_other uuid; 
begin
 perform pg_advisory_xact_lock(hashtext(p_match::text));
 select id into v_player from public.ac_players where user_id=auth.uid();
 select * into m from public.ac_matches where id=p_match for update;
 if m.id is null or v_player is null or v_player not in(m.p1,m.p2) or m.winner is not null then raise exception 'Duelo indisponível'; end if;
 if p_question <> all(m.questions) or p_choice not between 0 and 4 then raise exception 'Resposta inválida'; end if;
 select correct into v_correct from public.ac_questions where id=p_question;
 insert into public.ac_answers(match_id,player_id,question_id,answer,correct) values(p_match,v_player,p_question,p_choice,p_choice=v_correct);
 select count(*),count(*) filter(where correct) into v_count,v_score from public.ac_answers where match_id=p_match and player_id=v_player;
 v_done:=v_count=10; v_is1:=v_player=m.p1;
 update public.ac_matches set s1=case when v_is1 then v_score else s1 end,s2=case when not v_is1 then v_score else s2 end,
 done1=case when v_is1 then v_done else done1 end,done2=case when not v_is1 then v_done else done2 end where id=p_match;
 select * into m from public.ac_matches where id=p_match;
 if m.done1 and m.done2 then
  if m.s1>m.s2 then v_winner:=m.p1;
  elsif m.s2>m.s1 then v_winner:=m.p2;
  else
   -- Empate resolvido por menor duração; empate exato por sorteio.
  end if;
  if v_winner is null then
   declare d1 interval; d2 interval;
   begin
    select max(answered_at)-min(answered_at) into d1 from public.ac_answers where match_id=p_match and player_id=m.p1;
    select max(answered_at)-min(answered_at) into d2 from public.ac_answers where match_id=p_match and player_id=m.p2;
    v_winner:=case when d1<d2 then m.p1 when d2<d1 then m.p2 when random()<0.5 then m.p1 else m.p2 end;
   end;
  end if;
  update public.ac_matches set winner=v_winner,status='finished' where id=p_match;
  perform public.ac_advance();
 end if;
 return jsonb_build_object('correct',p_choice=v_correct,'score',v_score,'answered',v_count);
exception when unique_violation then raise exception 'Esta pergunta já foi respondida';
end $$;
create or replace function public.ac_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid; v_admin boolean; v_matches jsonb; v_players jsonb; v_active jsonb; v_questions jsonb; v_answers jsonb;
begin
 v_admin:=public.ac_is_admin();
 select id into v_player from public.ac_players where user_id=auth.uid();
 if not v_admin and v_player is null then return jsonb_build_object('started',(select started from public.ac_settings where id=1),'registered',false); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'round',m.round,'slot',m.slot,'third',m.is_third,'p1',a.name,'p2',b.name,'winner',w.name,'s1',case when m.done1 then m.s1 else null end,'s2',case when m.done2 then m.s2 else null end,'done1',m.done1,'done2',m.done2,'status',m.status) order by m.round,m.is_third,m.slot),'[]'::jsonb) into v_matches
 from public.ac_matches m left join public.ac_players a on a.id=m.p1 left join public.ac_players b on b.id=m.p2 left join public.ac_players w on w.id=m.winner;
 select coalesce(jsonb_agg(jsonb_build_object('name',name,'id',id) order by created_at),'[]'::jsonb) into v_players from public.ac_players;
 select to_jsonb(m) into v_active from public.ac_matches m where (m.p1=v_player or m.p2=v_player) and m.p1 is not null and m.p2 is not null and m.winner is null order by round desc limit 1;
 if v_active is not null then
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'q',q.statement,'op',q.options) order by array_position((select questions from public.ac_matches where id=(v_active->>'id')::uuid),q.id)),'[]'::jsonb) into v_questions
  from public.ac_questions q where q.id=any(select unnest(questions) from public.ac_matches where id=(v_active->>'id')::uuid);
  select coalesce(jsonb_agg(jsonb_build_object('id',question_id,'correct',correct)),'[]'::jsonb) into v_answers from public.ac_answers where match_id=(v_active->>'id')::uuid and player_id=v_player;
 end if;
 return jsonb_build_object('registered',true,'admin',v_admin,'started',(select started from public.ac_settings where id=1),'player_id',v_player,'players',case when v_admin then v_players else '[]'::jsonb end,'matches',v_matches,'active',case when v_active is null then null else jsonb_build_object('id',v_active->>'id','round',v_active->>'round','p1',v_active->>'p1','p2',v_active->>'p2') end,'questions',coalesce(v_questions,'[]'::jsonb),'answers',coalesce(v_answers,'[]'::jsonb));
end $$;
revoke all on function public.ac_is_admin(),public.ac_join(text),public.ac_start(),public.ac_advance(),public.ac_answer(uuid,int,int),public.ac_state() from public;
grant execute on function public.ac_is_admin(),public.ac_join(text),public.ac_start(),public.ac_answer(uuid,int,int),public.ac_state() to authenticated;
-- ac_advance é invocada internamente por funções SECURITY DEFINER, nunca diretamente pelo cliente.
