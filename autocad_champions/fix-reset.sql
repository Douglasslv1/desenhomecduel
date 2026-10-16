-- Execute uma vez no SQL Editor do Supabase, antes de publicar o novo painel.
begin;
create table if not exists public.ac_archives (
 id uuid primary key default gen_random_uuid(),
 archived_at timestamptz not null default now(),
 archived_by uuid not null,
 snapshot jsonb not null
);
alter table public.ac_archives enable row level security;
revoke all on public.ac_archives from anon, authenticated;

create or replace function public.ac_reset() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_archive uuid;
begin
 if not public.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(100019);
 if not (select started from public.ac_settings where id=1) then
  raise exception 'O campeonato ainda não foi iniciado';
 end if;
 insert into public.ac_archives(archived_by,snapshot)
 values(auth.uid(),jsonb_build_object(
  'players',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.ac_players p),
  'matches',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.ac_matches m),
  'answers',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.ac_answers a),
  'meta',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.ac_meta t),
  'questions',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from public.ac_questions q),
  'settings',(select to_jsonb(s) from public.ac_settings s where id=1)
 )) returning id into v_archive;
 delete from public.ac_answers where match_id is not null;
 delete from public.ac_matches where id is not null;
 delete from public.ac_players where id is not null;
 delete from public.ac_meta where id is not null;
 update public.ac_settings set started=false,created_at=now() where id=1;
 return v_archive;
end $$;
revoke all on function public.ac_reset() from public;
grant execute on function public.ac_reset() to authenticated;
-- As funções de inscrição e resposta são atualizadas abaixo para coordenar
-- operações simultâneas com o arquivamento da edição.

create or replace function public.ac_join(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock_shared(100019);
 if auth.uid() is null then raise exception 'Faça login anônimo primeiro'; end if;
 if (select started from public.ac_settings where id=1) then raise exception 'Inscrições encerradas'; end if;
 if length(trim(p_name)) not between 2 and 50 then raise exception 'Nome deve ter de 2 a 50 caracteres'; end if;
 insert into public.ac_players(user_id,name) values(auth.uid(),trim(p_name)) on conflict(user_id) do update set name=excluded.name returning id into v_id;
 return v_id;
end $$;
create or replace function public.ac_answer(p_match uuid,p_question int,p_choice int) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.ac_matches%rowtype; v_player uuid; v_correct int; v_count int; v_score int; v_done boolean; v_is1 boolean; v_winner uuid; v_other uuid; 
begin
 perform pg_advisory_xact_lock_shared(100019);
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

create or replace function public.ac_start() returns void language plpgsql security definer set search_path='' as $$
declare v_ids uuid[]; v_n int; v_size int:=2; v_rounds int:=1; r int; j int; v_q int[]; v_i int; v_seeds int[]:=array[1,2]; v_next_seeds int[];
begin
 if not public.ac_is_admin() then raise exception 'Apenas professor'; end if;
 perform pg_advisory_xact_lock(100019);
 if (select started from public.ac_settings where id=1) then raise exception 'Torneio já iniciado'; end if;
 select array_agg(id order by random()) into v_ids from public.ac_players;
 v_n:=coalesce(array_length(v_ids,1),0);
 if v_n<4 then raise exception 'São necessários ao menos 4 alunos para definir pódio'; end if;
 if (select count(*) from public.ac_questions)<>40 then raise exception 'Cadastre exatamente 40 perguntas'; end if;
 while v_size<v_n loop
  v_size:=v_size*2; v_rounds:=v_rounds+1;
  v_next_seeds:='{}';
  foreach v_i in array v_seeds loop
   v_next_seeds:=v_next_seeds || v_i || (v_size+1-v_i);
  end loop;
  v_seeds:=v_next_seeds;
 end loop;
 delete from public.ac_answers where match_id is not null; delete from public.ac_matches where id is not null; delete from public.ac_meta where id is not null;
 insert into public.ac_meta(id,total_rounds) values(1,v_rounds);
 for r in 1..v_rounds loop
  for j in 0..(v_size/(2^r)::int)-1 loop
   select array_agg(id order by seq) into v_q from (select id,row_number() over() seq from (select id from public.ac_questions order by random() limit 10) x) y;
   insert into public.ac_matches(round,slot,p1,p2,questions) values(r,j,
    case when r=1 then v_ids[v_seeds[2*j+1]] else null end,
    case when r=1 then v_ids[v_seeds[2*j+2]] else null end,v_q);
  end loop;
 end loop;
 select array_agg(id order by seq) into v_q from (select id,row_number() over() seq from (select id from public.ac_questions order by random() limit 10) x) y;
 insert into public.ac_matches(round,slot,is_third,questions) values(v_rounds,0,true,v_q);
 update public.ac_settings set started=true where id=1;
 perform public.ac_advance();
end $$;
commit;
