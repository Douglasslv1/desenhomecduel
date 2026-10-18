-- Aplicar após platform-answer-review.sql. Preserva contas, disciplinas e campeonatos.
begin;
select pg_advisory_xact_lock(200020);
create table if not exists public.cp_teacher_accounts(
 user_id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '',active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_by uuid
);
alter table public.cp_teacher_accounts enable row level security;
revoke all on public.cp_teacher_accounts from public,anon,authenticated;
insert into public.cp_teacher_accounts(user_id)
 select distinct user_id from public.cp_teachers where user_id in(select id from auth.users)
 on conflict do nothing;

create or replace function public.cp_can_manage(p_discipline uuid) returns boolean
language sql security definer set search_path='' as $$
 select auth.uid() is not null and (public.cp_is_owner() or
 (not exists(select 1 from public.cp_teacher_accounts where user_id=auth.uid() and not active)
 and exists(select 1 from public.cp_teachers where discipline_id=p_discipline and user_id=auth.uid())))
$$;

create or replace function public.cp_teacher_accounts_list() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.cp_is_owner() then raise exception 'Apenas superadministrador';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',to_jsonb(u)->>'email',
 'name',coalesce(a.name,''),'active',coalesce(a.active,true),
 'superadmin',exists(select 1 from public.ac_admins s where s.user_id=u.id),
 'disciplines',(select coalesce(jsonb_agg(d.name order by d.name),'[]') from public.cp_teachers t join public.cp_disciplines d on d.id=t.discipline_id where t.user_id=u.id))
 order by lower(to_jsonb(u)->>'email')),'[]') into result
 from auth.users u left join public.cp_teacher_accounts a on a.user_id=u.id
 where a.user_id is not null or exists(select 1 from public.cp_teachers t where t.user_id=u.id) or exists(select 1 from public.ac_admins s where s.user_id=u.id);
 return result;
end $$;

create or replace function public.cp_register_teacher(p_user uuid,p_name text,p_disciplines uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.cp_is_owner() then raise exception 'Apenas superadministrador';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 100 then raise exception 'Informe o nome do professor';end if;
 if coalesce(array_length(p_disciplines,1),0)<1 or exists(select 1 from unnest(p_disciplines) d where d is null or not exists(select 1 from public.cp_disciplines where id=d)) then raise exception 'Selecione disciplinas válidas';end if;
 if not exists(select 1 from auth.users u where u.id=p_user and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false) then raise exception 'Conta do professor não encontrada';end if;
 insert into public.cp_teacher_accounts(user_id,name,updated_by) values(p_user,trim(p_name),auth.uid())
 on conflict(user_id) do update set name=excluded.name,updated_at=now(),updated_by=auth.uid();
 insert into public.cp_teachers(user_id,discipline_id) select p_user,d from (select distinct unnest(p_disciplines) d) chosen on conflict do nothing;
end $$;

create or replace function public.cp_teacher_set_active(p_user uuid,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.cp_is_owner() then raise exception 'Apenas superadministrador';end if;
 if p_active is null then raise exception 'Defina a situação do cadastro';end if;
 if p_user=auth.uid() or exists(select 1 from public.ac_admins where user_id=p_user) then raise exception 'O cadastro do superadministrador é protegido';end if;
 if not exists(select 1 from public.cp_teacher_accounts where user_id=p_user) and not exists(select 1 from public.cp_teachers where user_id=p_user) then raise exception 'Professor não encontrado';end if;
 insert into public.cp_teacher_accounts(user_id,active,updated_by) values(p_user,p_active,auth.uid())
 on conflict(user_id) do update set active=excluded.active,updated_at=now(),updated_by=auth.uid();
end $$;

create or replace function public.cp_teacher_account_status() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('active',public.cp_is_owner() or not exists(select 1 from public.cp_teacher_accounts where user_id=auth.uid() and not active))
$$;
-- Checagem pequena para a função de servidor, sem expor o catálogo completo.
create or replace function public.cp_teacher_admin_check() returns boolean
language sql security definer set search_path='' as $$select public.cp_is_owner()$$;

revoke all on function public.cp_teacher_accounts_list(),public.cp_register_teacher(uuid,text,uuid[]),public.cp_teacher_set_active(uuid,boolean),public.cp_teacher_account_status(),public.cp_teacher_admin_check() from public,anon;
grant execute on function public.cp_teacher_accounts_list(),public.cp_register_teacher(uuid,text,uuid[]),public.cp_teacher_set_active(uuid,boolean),public.cp_teacher_account_status(),public.cp_teacher_admin_check() to authenticated;
revoke all on function public.cp_can_manage(uuid) from public,anon,authenticated;
create or replace function public.cp_assign_teacher(p_discipline uuid,p_identity text,p_allowed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if not public.cp_is_owner() then raise exception 'Apenas superadministrador';end if;
 select u.id into v_user from auth.users u
 where (lower(to_jsonb(u)->>'email')=lower(trim(p_identity)) or u.id::text=trim(p_identity))
 and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false;
 if v_user is null then raise exception 'Professor não encontrado. Cadastre-o na área Professores do painel';end if;
 perform public.cp_set_teacher(p_discipline,v_user,p_allowed);
end $$;
commit;
