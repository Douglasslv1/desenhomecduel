const fs=require('node:fs');
const learning=fs.readFileSync('platform-learning-update.sql','utf8').replace(/\r/g,'');
const template=learning.split('$patch$')[1];
const extract=(source,name)=>source.match(new RegExp('create or replace function (?:__EDITION__|public)\\.'+name+'\\([\\s\\S]*?end \\$\\$;'))[0];
let patch=`alter table __EDITION__.ac_runs add column if not exists review_pending boolean not null default false;
alter table __EDITION__.ac_runs add column if not exists review_started_at timestamptz;
alter table __EDITION__.ac_runs add column if not exists review_elapsed interval not null default interval '0 seconds';
`;
patch+=extract(template,'ac_feedback').replace("'statement',q.statement,","'statement',q.statement,'options',q.options,");
let tick=extract(template,'ac_tick').replace('Expiração permanece válida mesmo sem alunos conectados. Recupera todos os prazos vencidos.','Expira a pergunta atual e aguarda a revisão antes de iniciar a seguinte.');
tick=tick.replace('and not p.disqualified order by x.id','and not x.review_pending and not p.disqualified order by x.id');
tick=tick.replace('while r.position<=array_length(r.questions,1)', 'if r.position<=array_length(r.questions,1)').replace("<=v_now loop","<=v_now then");
tick=tick.replace('r.position:=r.position+1; r.question_started_at:=v_deadline;','r.position:=r.position+1; r.question_started_at:=v_deadline; r.review_pending:=true; r.review_started_at:=v_now;');
tick=tick.replace('  end loop;\n  update','  end if;\n  update');
tick=tick.replace('set position=r.position,question_started_at=r.question_started_at,','set position=r.position,question_started_at=r.question_started_at,review_pending=r.review_pending,review_started_at=r.review_started_at,');
tick=tick.replace('case when r.position>array_length(r.questions,1) then','case when not r.review_pending and r.position>array_length(r.questions,1) then');
tick=tick.replaceAll('a.finished_at-a.started_at','a.finished_at-a.started_at-a.review_elapsed').replaceAll('b.finished_at-b.started_at','b.finished_at-b.started_at-b.review_elapsed');
patch+=tick;
let submit=extract(template,'ac_submit').replace('if r.finished_at is not null or','if r.review_pending or r.finished_at is not null or');
submit=submit.replace('question_started_at=v_now,finished_at=case when position=array_length(questions,1) then v_now else null end','review_pending=true,review_started_at=v_now,finished_at=null');
patch+=submit;
patch+=`create or replace function __EDITION__.ac_continue(p_run uuid,p_question int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r __EDITION__.ac_runs%rowtype;v_now timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtextextended('__EDITION__',0));
 select x.* into r from __EDITION__.ac_runs x join __EDITION__.ac_players p on p.id=x.player_id
 where x.id=p_run and p.user_id=auth.uid() and not p.disqualified;
 if r.id is null then raise exception 'Etapa indisponível';end if;
 if not r.review_pending or p_question is distinct from r.questions[r.position-1] then return jsonb_build_object('accepted',false);end if;
 update __EDITION__.ac_runs set review_pending=false,review_started_at=null,
 review_elapsed=review_elapsed+greatest(interval '0 seconds',v_now-r.review_started_at),
 question_started_at=v_now,finished_at=case when position>array_length(questions,1) then v_now else null end where id=r.id;
 perform __EDITION__.ac_tick();return jsonb_build_object('accepted',true);
end $$;
`;
let state=extract(template,'ac_state');
state=state.replace('if r.id is not null then','if r.id is not null and not r.review_pending then');
state=state.replace("'feedback',v_last","'feedback',v_last,'review',case when r.review_pending then __EDITION__.ac_feedback(r.id,r.questions[r.position-1]) else null end");
state=state.replace("'deadline',r.question_started_at+interval '90 seconds'","'deadline',case when r.review_pending then null else r.question_started_at+interval '90 seconds' end");
patch+=state;
patch+=extract(fs.readFileSync('competition-v2.sql','utf8'),'ac_start_knockout').replaceAll('public.ac_','__EDITION__.ac_').replace('pg_advisory_xact_lock(100019)',"pg_advisory_xact_lock(hashtextextended('__EDITION__',0))").replace('r.finished_at-r.started_at','r.finished_at-r.started_at-r.review_elapsed');
patch+='revoke all on all functions in schema __EDITION__ from public,anon,authenticated;\n';
let provision=extract(learning,'cp_provision').replace('t text;p text;','t text;p text;v_review text;').replace("execute replace(p,'__EDITION__',s);","execute replace(p,'__EDITION__',s);\n select sql_patch into v_review from public.cp_review_engine where id=1;\n execute replace(v_review,'__EDITION__',s);");
const rpc=extract(fs.readFileSync('platform-catalog.sql','utf8'),'cp_rpc').replace(" when 'ac_disqualify'", " when 'ac_continue' then execute format('select %I.ac_continue($1,$2)',e.engine_schema) into v_result using (p_args->>'p_run')::uuid,(p_args->>'p_question')::int;\n when 'ac_disqualify'");
const practice=extract(fs.readFileSync('learning-features.sql','utf8'),'cp_practice_state').replace("'statement',r.questions->(n-1)->>'statement'","'options',r.questions->(n-1)->'options','statement',r.questions->(n-1)->>'statement'");
fs.writeFileSync('platform-answer-review.sql',`-- Aplicar após platform-learning-update.sql, sem campeonatos em andamento.
begin;
select pg_advisory_xact_lock(200020);
create table if not exists public.cp_review_engine(id int primary key check(id=1),sql_patch text not null);
alter table public.cp_review_engine enable row level security;
revoke all on public.cp_review_engine from public,anon,authenticated;
insert into public.cp_review_engine values(1,$review$${patch}$review$) on conflict(id) do update set sql_patch=excluded.sql_patch;
do $upgrade$ declare e record;v_phase text;v_patch text;begin
 select sql_patch into v_patch from public.cp_review_engine where id=1;
 for e in select * from public.cp_editions loop
 perform pg_advisory_xact_lock(hashtextextended(e.engine_schema,0));
 execute format('select phase from %I.ac_settings where id=1',e.engine_schema) into v_phase;
 if e.archived_at is null and v_phase in ('leveling','knockout') then raise exception 'Encerre ou arquive as edições em andamento antes desta atualização';end if;
 execute replace(v_patch,'__EDITION__',e.engine_schema);
 end loop;
end $upgrade$;
${provision}
${rpc}
${practice}
revoke all on function public.cp_provision(uuid,uuid) from public,anon,authenticated;
commit;
`);
console.log('Gerado platform-answer-review.sql');
