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

-- ENGINE_TEMPLATE

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
