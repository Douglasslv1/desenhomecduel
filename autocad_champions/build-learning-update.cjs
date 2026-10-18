// Atualização das edições existentes e do template de novas edições.
const fs=require('node:fs');
const base=fs.readFileSync('competition-v2.sql','utf8');
const functions=[...base.matchAll(/create or replace function public\.(ac_\w+)\([\s\S]*?end \$\$;/g)].map(m=>({name:m[1],sql:m[0]}));
const feedback=`create or replace function __EDITION__.ac_feedback(p_run uuid,p_question int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 select jsonb_build_object('run_id',r.id,'question_id',q.id,'statement',q.statement,
 'correct',a.correct,'timed_out',a.timed_out,'choice',a.choice,'correct_choice',q.correct,
 'correct_option',q.options->>q.correct,'answered_at',a.answered_at) into v_result
 from __EDITION__.ac_runs r join __EDITION__.ac_players p on p.id=r.player_id
 join __EDITION__.ac_responses a on a.run_id=r.id and a.question_id=p_question
 join __EDITION__.ac_questions q on q.id=a.question_id
 where r.id=p_run and p.user_id=auth.uid() and not p.disqualified;
 return v_result;
end $$;`;
let overrides=feedback+'\n';
for(const name of ['ac_start','ac_tick','ac_submit','ac_state']){
 let sql=functions.find(f=>f.name===name).sql.replace(/public\.ac_/g,'__EDITION__.ac_').replace(/pg_advisory_xact_lock\(100019\)/g,"pg_advisory_xact_lock(hashtextextended('__EDITION__',0))");
 if(name==='ac_start')sql=sql.replace('count(*) from __EDITION__.ac_questions)<10','count(*) from __EDITION__.ac_questions)<20').replace('pelo menos dez questões','pelo menos vinte questões').replace('limit 10','limit 20');
 if(name==='ac_tick')sql=sql.replace('r.position<=10','r.position<=array_length(r.questions,1)').replace('r.position=11','r.position>array_length(r.questions,1)');
 if(name==='ac_submit'){
  sql=sql.replace('case when position=10 then v_now','case when position=array_length(questions,1) then v_now');
  sql=sql.replace("return jsonb_build_object('accepted',true,'correct',v_correct);","return jsonb_build_object('accepted',true,'correct',v_correct,'feedback',__EDITION__.ac_feedback(r.id,p_question));");
 }
 if(name==='ac_state'){
  sql=sql.replace('v_done int;','v_done int; v_last jsonb; v_feedback_run uuid; v_feedback_question int;');
  sql=sql.replace("return jsonb_build_object('api_version',2",`select x.run_id,x.question_id into v_feedback_run,v_feedback_question
 from __EDITION__.ac_responses x join __EDITION__.ac_runs z on z.id=x.run_id
 where z.player_id=v_player order by x.answered_at desc,x.question_id limit 1;
 if v_feedback_run is not null then v_last:=__EDITION__.ac_feedback(v_feedback_run,v_feedback_question);end if;
 return jsonb_build_object('api_version',2,'leveling_question_count',coalesce((select array_length(questions,1) from __EDITION__.ac_runs where stage='leveling' limit 1),20),'knockout_question_count',10,'feedback',v_last`);
  sql=sql.replace("'position',r.position,'score',r.score,","'position',r.position,'score',r.score,'total',array_length(r.questions,1),");
 }
 overrides+=sql+'\n';
}
const constraints=`do $constraints$ declare c record;begin
 for c in select conname from pg_constraint where conrelid='__EDITION__.ac_runs'::regclass and contype='c' loop
 execute format('alter table __EDITION__.ac_runs drop constraint %I',c.conname);end loop;
end $constraints$;
alter table __EDITION__.ac_runs add constraint ac_run_stage_v4 check(stage in ('leveling','knockout'));
alter table __EDITION__.ac_runs add constraint ac_run_questions_v4 check(array_length(questions,1) in (10,20) and (stage='leveling' or array_length(questions,1)=10));
alter table __EDITION__.ac_runs add constraint ac_run_position_v4 check(position between 1 and array_length(questions,1)+1);
alter table __EDITION__.ac_runs add constraint ac_run_score_v4 check(score between 0 and array_length(questions,1));
alter table __EDITION__.ac_runs add constraint ac_run_match_v4 check((stage='leveling' and match_id is null) or (stage='knockout' and match_id is not null));
`;
overrides=constraints+overrides+`revoke all on all functions in schema __EDITION__ from public,anon,authenticated;\n`;
const catalog=fs.readFileSync('platform-catalog.sql','utf8');
const createEdition=catalog.match(/create or replace function public\.cp_create_edition\([\s\S]*?end \$\$;/)[0].replace('cp_questions where bank_id=p_bank)<10','cp_questions where bank_id=p_bank)<20').replace('pelo menos dez questões','pelo menos vinte questões');
const migration=`-- Aplicar após platform-multidisciplines.sql. Não altera questões nem resultados encerrados.
begin;
select pg_advisory_xact_lock(200020);
create table if not exists public.cp_learning_engine(id int primary key check(id=1),sql_patch text not null);
alter table public.cp_learning_engine enable row level security;
revoke all on public.cp_learning_engine from public,anon,authenticated;
insert into public.cp_learning_engine(id,sql_patch) values(1,$patch$${overrides}$patch$) on conflict(id) do update set sql_patch=excluded.sql_patch;
do $upgrade$ declare e record;v_phase text;v_patch text;begin
 select sql_patch into v_patch from public.cp_learning_engine where id=1;
 for e in select * from public.cp_editions loop
  perform pg_advisory_xact_lock(hashtextextended(e.engine_schema,0));
  execute format('select phase from %I.ac_settings where id=1',e.engine_schema) into v_phase;
  if e.archived_at is null and v_phase in ('leveling','knockout') then raise exception 'Encerre ou arquive as edições em andamento antes desta atualização';end if;
  execute replace(v_patch,'__EDITION__',e.engine_schema);
 end loop;
end $upgrade$;
-- Os históricos congelados anteriores usavam dez questões no nivelamento.
update public.cp_frozen set snapshot=snapshot||jsonb_build_object('leveling_question_count',10,'knockout_question_count',10)
 where not (snapshot ? 'leveling_question_count');
${createEdition}
-- Novas edições recebem o motor atualizado sem modificar o arquivo original da migração anterior.
create or replace function public.cp_provision(p_id uuid,p_discipline uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s text:='cp_e_'||replace(p_id::text,'-','');t text;p text;
begin
 select sql_template into t from public.cp_engine where id=1;
 select sql_patch into p from public.cp_learning_engine where id=1;
 if t is null or p is null then raise exception 'Motor não configurado';end if;
 execute format('create schema %I',s);
 execute replace(replace(t,'__EDITION__',s),'__DISCIPLINE__',p_discipline::text);
 execute replace(p,'__EDITION__',s);
end $$;
${fs.readFileSync('learning-features.sql','utf8')}
commit;
`;
fs.writeFileSync('platform-learning-update.sql',migration);
console.log('Atualização gerada: nivelamento 20, mata-mata 10, gabarito após resposta, superadmin e simulados.');
