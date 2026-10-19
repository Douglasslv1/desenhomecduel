-- Aplicar depois de platform-answer-review.sql. Compatível com edições existentes e futuras.
begin;
create table if not exists public.cp_focus_events(
 edition_id uuid not null references public.cp_editions(id) on delete cascade,
 event_id uuid not null,
 player_id uuid not null,
 run_id uuid not null,
 match_id uuid not null,
 kind text not null check(kind in ('blur','hidden')),
 occurred_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp(),
 primary key(edition_id,event_id)
);
create index if not exists cp_focus_events_player on public.cp_focus_events(edition_id,player_id,occurred_at);
alter table public.cp_focus_events enable row level security;
revoke all on public.cp_focus_events from anon,authenticated;

create or replace function public.cp_record_focus(p_edition uuid,p_run uuid,p_event uuid,p_kind text,p_occurred_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.cp_editions%rowtype;r record;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro';end if;
 select * into e from public.cp_editions where id=p_edition for share;
 if e.id is null then raise exception 'Campeonato não encontrado';end if;
 if p_kind is null or p_kind not in ('blur','hidden') or p_event is null or p_occurred_at is null then raise exception 'Ocorrência inválida';end if;
 execute format('select r.player_id,r.match_id,r.started_at,r.finished_at,p.disqualified from %1$I.ac_runs r join %1$I.ac_players p on p.id=r.player_id where r.id=$1 and p.user_id=$2 and r.stage=''knockout''',e.engine_schema)
 into r using p_run,auth.uid();
 if r.player_id is null then raise exception 'Confronto não encontrado para este aluno';end if;
 -- Reenvios são idempotentes, inclusive após conclusão ou arquivamento.
 if exists(select 1 from public.cp_focus_events where edition_id=p_edition and event_id=p_event and player_id=r.player_id) then return jsonb_build_object('recorded',true);end if;
 if e.archived_at is not null or r.disqualified or p_occurred_at<r.started_at or p_occurred_at>clock_timestamp()+interval '30 seconds'
 or (r.finished_at is not null and p_occurred_at>r.finished_at) then return jsonb_build_object('recorded',false);end if;
 insert into public.cp_focus_events(edition_id,event_id,player_id,run_id,match_id,kind,occurred_at)
 values(p_edition,p_event,r.player_id,p_run,r.match_id,p_kind,p_occurred_at) on conflict do nothing;
 return jsonb_build_object('recorded',true);
end $$;

create or replace function public.cp_focus_report(p_edition uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.cp_editions%rowtype;result jsonb;
begin
 select * into e from public.cp_editions where id=p_edition;
 if e.id is null or not public.cp_can_manage(e.discipline_id) then raise exception 'Sem acesso ao campeonato';end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into result from (
 select player_id,count(*)::int total,max(occurred_at) last_at,
 jsonb_agg(jsonb_build_object('match_id',match_id,'kind',kind,'at',occurred_at,'received_at',received_at) order by occurred_at desc) events
 from public.cp_focus_events where edition_id=p_edition group by player_id) s;
 return result;
end $$;
revoke all on function public.cp_record_focus(uuid,uuid,uuid,text,timestamptz),public.cp_focus_report(uuid) from public,anon;
grant execute on function public.cp_record_focus(uuid,uuid,uuid,text,timestamptz),public.cp_focus_report(uuid) to authenticated;
commit;
