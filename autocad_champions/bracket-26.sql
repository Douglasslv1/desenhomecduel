-- Atualiza o sorteio para distribuir as vagas automáticas. Vale para novas edições.
begin;
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
