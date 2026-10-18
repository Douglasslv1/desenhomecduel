const {PGlite}=require('./.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
const db=new PGlite();const admin='00000000-0000-4000-8000-000000000001',teacher='00000000-0000-4000-8000-000000000002';
const users=Array.from({length:26},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const query=async(sql,args=[])=> (await db.query(sql,args)).rows;
const scalar=async(sql,args=[])=>Object.values((await query(sql,args))[0])[0];
const login=id=>query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const rpc=(name,args=[])=>scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
const call=(id,action,args={})=>rpc('cp_rpc',[id,action,JSON.stringify(args)]);
async function answer(id,schema,correct=true){
 const s=await call(id,'ac_state');if(!s.active)return false;
 if(s.review){await call(id,'ac_continue',{p_run:s.active.id,p_question:s.review.question_id});return true}
 const q=s.questions[0];assert.equal(q.correct,undefined);
 const key=await scalar(`select correct from ${schema}.ac_questions where id=$1`,[q.id]);
 const r=await call(id,'ac_submit',{p_run:s.active.id,p_question:q.id,p_choice:correct?key:(key+1)%5});
 assert.equal(r.accepted,true);assert.equal(r.feedback.correct_choice,key);assert.equal(r.feedback.question_id,q.id);assert.equal(r.feedback.correct,correct);
 const pending=await call(id,'ac_state');assert.equal(pending.review.question_id,q.id);assert.equal(pending.active.deadline,null);assert.deepEqual(pending.questions,[]);
 assert.ok(pending.review.options.length);assert.equal(pending.active.position,s.active.position+1);
 const duplicate=await call(id,'ac_submit',{p_run:s.active.id,p_question:q.id,p_choice:0});assert.equal(duplicate.accepted,false);
 await call(id,'ac_continue',{p_run:s.active.id,p_question:q.id});
 return true;
}
async function main(){
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const file of ['schema.sql','questions.sql','competition-v2.sql','questions-approved.sql'])await db.exec(fs.readFileSync(file,'utf8').replace('create extension if not exists pgcrypto;',''));
 await query('insert into auth.users(id,email) values($1,$2),($3,$4)',[admin,'admin@escola.test',teacher,'ads@escola.test']);
 for(const user of users)await query('insert into auth.users(id,is_anonymous) values($1,true)',[user]);
 await query('insert into public.ac_admins(user_id) values($1)',[admin]);await login(admin);
 await db.exec(fs.readFileSync('platform-multidisciplines.sql','utf8'));
 const catalog=await rpc('cp_catalog'),drawing=catalog.disciplines.find(d=>d.name==='Desenho Mecânico'),ads=catalog.disciplines.find(d=>d.id!==drawing.id),bank=drawing.banks[0].id;
 const oldEdition=catalog.editions[0].id,oldSchema=await scalar('select engine_schema from public.cp_editions where id=$1',[oldEdition]);
 const oldPlayer=await scalar(`insert into ${oldSchema}.ac_players(user_id,name) values($1,'Histórico de dez') returning id`,[users[0]]);
 await query(`insert into ${oldSchema}.ac_runs(player_id,stage,questions,position,score,finished_at) values($1,'leveling',array[1,2,3,4,5,6,7,8,9,10],11,8,clock_timestamp())`,[oldPlayer]);
 await query(`update ${oldSchema}.ac_settings set started=true,phase='finished' where id=1`);
 await rpc('cp_archive',[oldEdition]);
 const edition=await rpc('cp_create_edition',[drawing.id,bank,'Edição antes da atualização']);
 const patch=fs.readFileSync('platform-learning-update.sql','utf8');await db.exec(patch);const reviewPatch=fs.readFileSync('platform-answer-review.sql','utf8');await db.exec(reviewPatch);await db.exec(reviewPatch);
 assert.equal((await call(oldEdition,'ac_state')).leveling_question_count,10);
 assert.equal(await scalar(`select score from ${oldSchema}.ac_runs limit 1`),8);
 if(process.argv.includes('--history-only')){console.log('OK: edição arquivada anterior preserva oito acertos em dez questões após a migração.');await db.close();return}
 await query('delete from public.cp_teachers where user_id=$1',[admin]);
 assert.equal((await rpc('cp_catalog')).disciplines.length,2,'Superadmin acessa tudo sem vínculos individuais');
 await rpc('cp_assign_teacher',[ads.id,'ads@escola.test',true]);
 assert.equal((await rpc('cp_teacher_directory',[ads.id]))[0].email,'ads@escola.test');
 await assert.rejects(()=>rpc('cp_assign_teacher',[ads.id,users[0],true]),/Professor não encontrado/);
 await login(teacher);let scoped=await rpc('cp_catalog');assert.equal(scoped.owner,false);assert.equal(scoped.disciplines.length,1);assert.equal(scoped.disciplines[0].id,ads.id);
 await assert.rejects(()=>rpc('cp_bank_questions',[bank]),/Sem acesso/);
 await assert.rejects(()=>rpc('cp_assign_teacher',[drawing.id,'ads@escola.test',true]),/superadministrador/);
 await assert.rejects(()=>rpc('cp_teacher_directory',[ads.id]),/superadministrador/);
 await login(admin);await rpc('cp_assign_teacher',[drawing.id,teacher,true]);await login(teacher);assert.equal((await rpc('cp_catalog')).disciplines.length,2);
 await login(admin);await rpc('cp_set_teacher',[drawing.id,teacher,false]);await login(teacher);assert.equal((await rpc('cp_catalog')).disciplines.length,1);
 console.log('OK: conta existente como superadmin; professor por e-mail/UUID, disciplinas atribuídas, ampliação e remoção de acesso, conta anônima não vira professor.');
 await login(users[0]);const publicCatalog=await rpc('cp_practice_catalog');assert.equal(publicCatalog.length,2);assert.equal(publicCatalog[0].banks[0].correct,undefined);
 let practice=await rpc('cp_practice_start',[bank,10]);const practiceId=practice.id;assert.equal(practice.question.correct,undefined);assert.equal(practice.total,10);
 const snapshot=await scalar('select questions from public.cp_practice_runs where id=$1',[practiceId]);assert.equal(new Set(snapshot.map(q=>q.id)).size,10);
 await login(users[1]);await assert.rejects(()=>rpc('cp_practice_state',[practiceId]),/este usuário/);await assert.rejects(()=>rpc('cp_practice_answer',[practiceId,1,0]),/este usuário/);
 await login(users[0]);await assert.rejects(()=>rpc('cp_practice_answer',[practiceId,2,0]),/não está disponível/);
 for(let i=0;i<10;i++){
  practice=await rpc('cp_practice_answer',[practiceId,i+1,i%2?snapshot[i].correct:(snapshot[i].correct+1)%5]);
  assert.equal(practice.feedback.correct_choice,snapshot[i].correct);assert.deepEqual(practice.feedback.options,snapshot[i].options);
  if(i===0)await assert.rejects(()=>rpc('cp_practice_answer',[practiceId,1,0]),/já foi respondida/);
  if(practice.question)assert.equal(practice.question.correct,undefined);
 }
 assert.equal(practice.score,5);assert.equal(practice.finished,true);assert.equal(practice.answered,10);assert.equal(practice.question,null);
 assert.equal((await rpc('cp_practice_state',[practiceId])).score,5);
 const practice20=await rpc('cp_practice_start',[bank,20]);assert.equal(practice20.total,20);
 assert.equal(await scalar('select count(*)::int from public.cp_editions'),2,'Simulado não cria campeonato');
 await assert.rejects(()=>rpc('cp_practice_start',[ads.banks[0].id,10]),/suficientes/);
 await assert.rejects(()=>rpc('cp_practice_start',[bank,30]),/dez ou vinte/);
 console.log('OK: simulados aleatórios de 10/20, sem repetição, pontuação 5/10, retomada, gabarito só após resposta e tentativas privadas.');
 await login(admin);const small=await rpc('cp_create_bank',[ads.id,'Banco de dez']);
 await rpc('cp_save_questions',[small,JSON.stringify(Array.from({length:10},(_,i)=>({id:i+1,statement:'Pergunta de teste '+i,options:['a','b','c','d','e'],correct:0})))]);
 await assert.rejects(()=>rpc('cp_create_edition',[ads.id,small,'Edição insuficiente']),/vinte questões/);
 const schema=await scalar('select engine_schema from public.cp_editions where id=$1',[edition]);
 for(const [i,user] of users.entries()){await login(user);await call(edition,'ac_join',{p_name:'Teste '+(i+1)})}
 await login(admin);await call(edition,'ac_start');
 await assert.rejects(()=>db.exec(patch),/Encerre ou arquive/);await db.exec('rollback');
 assert.equal(await scalar(`select count(*)::int from ${schema}.ac_runs where array_length(questions,1)=20`),26);
 assert.equal(await scalar(`select count(distinct questions)::int from ${schema}.ac_runs`),1);
 await login(users[0]);let state=await call(edition,'ac_state');assert.equal(state.active.total,20);assert.equal(state.feedback,null);const deadline=state.active.deadline;
 assert.equal((await call(edition,'ac_state')).active.deadline,deadline);
 const future=await scalar(`select questions[2] from ${schema}.ac_runs where id=$1`,[state.active.id]);
 const refused=await call(edition,'ac_submit',{p_run:state.active.id,p_question:future,p_choice:0});assert.equal(refused.accepted,false);assert.equal(refused.feedback,undefined);
 for(const [i,user] of users.entries()){await login(user);for(let j=0;j<20;j++)await answer(edition,schema,j<i%21)}
 await login(admin);state=await call(edition,'ac_state');assert.equal(state.leveling.ready,true);assert.equal(state.leveling_question_count,20);
 assert.equal(await scalar(`select count(*)::int from ${schema}.ac_responses`),520);
 await call(edition,'ac_start_knockout');
 for(let pass=0;pass<15;pass++){
  let changed=false;
  for(const user of users){await login(user);for(let j=0;j<10;j++){
   const s=await call(edition,'ac_state');if(!s.active)break;assert.equal(s.active.total,10);changed=true;await answer(edition,schema,j%2===0);
  }}if(!changed)break;
 }
 await login(admin);state=await call(edition,'ac_state');assert.equal(state.phase,'finished');
 assert.equal(await scalar(`select count(*)::int from ${schema}.ac_responses`),1040);
 assert.equal(await scalar(`select count(*)::int from ${schema}.ac_runs where stage='knockout' and array_length(questions,1)=10`),52);
 console.log('OK: 26 participantes, nivelamento igual de 20 questões, mata-mata de dez, 1040 respostas até o pódio e gabarito somente de questões já respondidas.');
 const timeoutEdition=await rpc('cp_create_edition',[drawing.id,bank,'Prazos de vinte']);const timeoutSchema=await scalar('select engine_schema from public.cp_editions where id=$1',[timeoutEdition]);
 for(const user of users.slice(0,4)){await login(user);await call(timeoutEdition,'ac_join',{p_name:'Prazo'})}
 await login(admin);await call(timeoutEdition,'ac_start');
 await query(`update ${timeoutSchema}.ac_runs set question_started_at=statement_timestamp()-interval '1801 seconds',started_at=statement_timestamp()-interval '1801 seconds' where finished_at is null`);
 state=await call(timeoutEdition,'ac_state');assert.equal(state.leveling.ready,false);assert.equal(await scalar(`select count(*)::int from ${timeoutSchema}.ac_responses where timed_out`),4);
 await login(users[0]);state=await call(timeoutEdition,'ac_state');assert.equal(state.review.timed_out,true);assert.equal(state.active.deadline,null);assert.ok(state.review.options);
 const run=state.active.id,question=state.review.question_id;
 await login(users[1]);await assert.rejects(()=>call(timeoutEdition,'ac_continue',{p_run:run,p_question:question}),/indisponível/);
 await login(users[0]);await call(timeoutEdition,'ac_continue',{p_run:run,p_question:question});
 state=await call(timeoutEdition,'ac_state');assert.equal(state.review,null);assert.equal(state.active.position,2);assert.ok(Date.parse(state.active.deadline)-Date.parse(state.server_now)>88000);
 assert.equal((await call(timeoutEdition,'ac_continue',{p_run:run,p_question:question})).accepted,false);
 await login(admin);await rpc('cp_archive',[timeoutEdition]);await db.exec(reviewPatch);await db.exec(reviewPatch);
 await login(admin);await db.exec(reviewPatch);
 await db.exec('set role authenticated');
 await assert.rejects(()=>query('select * from public.cp_practice_runs'),/permission denied/);
 await assert.rejects(()=>query('select * from public.cp_learning_engine'),/permission denied/);
 await assert.rejects(()=>query(`select ${schema}.ac_feedback(null,null)`),/permission denied/);
 await db.exec('reset role');
 console.log('OK: pausa na revisão, timeout de uma questão, retomada com 90 segundos, clique duplicado e acesso de outro usuário bloqueados, migração repetível e históricos preservados.');
 await db.close();
}
main().catch(async e=>{console.error(e);process.exitCode=1;await db.close()});
