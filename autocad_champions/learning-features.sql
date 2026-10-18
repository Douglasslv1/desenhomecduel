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
