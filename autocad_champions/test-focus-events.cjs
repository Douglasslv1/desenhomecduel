const {PGlite}=require('./.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const db=new PGlite(),owner='00000000-0000-4000-8000-000000000001',student='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003';
const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
const scalar=async(sql,args=[])=>Object.values((await query(sql,args))[0])[0];
const login=id=>query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const rpc=(name,args=[])=>scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,is_anonymous boolean default false);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const file of ['schema.sql','questions.sql','competition-v2.sql','questions-approved.sql'])await db.exec(fs.readFileSync(file,'utf8').replace('create extension if not exists pgcrypto;',''));
 for(const id of [owner,student,other])await query('insert into auth.users(id) values($1)',[id]);
 await query('insert into public.ac_admins(user_id) values($1)',[owner]);await login(owner);
 for(const file of ['platform-multidisciplines.sql','platform-learning-update.sql','platform-answer-review.sql','platform-focus-events.sql','platform-focus-events.sql'])await db.exec(fs.readFileSync(file,'utf8'));
 const edition=(await rpc('cp_catalog')).editions[0].id,schema=await scalar('select engine_schema from public.cp_editions where id=$1',[edition]);
 const player=await scalar(`insert into ${schema}.ac_players(user_id,name) values($1,'Aluno') returning id`,[student]);
 const match=await scalar(`insert into ${schema}.ac_matches(round,slot,p1,questions) values(1,0,$1,array(select generate_series(1,10))) returning id`,[player]);
 const run=await scalar(`insert into ${schema}.ac_runs(player_id,match_id,stage,questions) values($1,$2,'knockout',array(select generate_series(1,10))) returning id`,[player,match]);
 const event=await scalar('select gen_random_uuid()'),at=new Date().toISOString();
 await login(student);
 const args=[edition,run,event,'blur',at];assert.equal((await rpc('cp_record_focus',args)).recorded,true);await rpc('cp_record_focus',args);
 await assert.rejects(()=>rpc('cp_focus_report',[edition]),/Sem acesso/);
 await login(other);await assert.rejects(()=>rpc('cp_record_focus',args),/para este aluno/);
 await login(owner);let report=await rpc('cp_focus_report',[edition]);assert.equal(report[0].total,1);assert.equal(report[0].events[0].match_id,match);
 const level=await scalar(`insert into ${schema}.ac_runs(player_id,stage,questions) values($1,'leveling',array(select generate_series(1,20))) returning id`,[player]);
 await login(student);await assert.rejects(()=>rpc('cp_record_focus',[edition,level,event,'hidden',at]),/para este aluno/);
 await query(`update ${schema}.ac_runs set finished_at=clock_timestamp() where id=$1`,[run]);
 const late=await scalar('select gen_random_uuid()');assert.equal((await rpc('cp_record_focus',[edition,run,late,'hidden','2099-01-01'])).recorded,false);
 await query('update public.cp_editions set archived_at=now() where id=$1',[edition]);
 assert.equal((await rpc('cp_record_focus',args)).recorded,true);
 await login(owner);assert.equal((await rpc('cp_focus_report',[edition]))[0].total,1);
 await db.exec('set role authenticated');await assert.rejects(()=>query('select * from public.cp_focus_events'),/permission denied/);await db.exec('reset role');
 await db.close();
 // Eventos reais do navegador simulados: blur + hidden contam uma vez, retorno rearma.
 const handlers={},sent=[],nodes={},storage=new Map();let focused=true,hidden=false;
 const context={console,Date,crypto:require('node:crypto').webcrypto,teacher:false,editionId:edition,state:{active:{id:run,stage:'knockout'}},esc:String,
 sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
 document:{get visibilityState(){return hidden?'hidden':'visible'},hasFocus:()=>focused,addEventListener:(k,v)=>handlers[k]=v,createElement:()=>({setAttribute(){}})},
 $:id=>nodes[id]??={prepend(){}},db:{rpc:async(name,event)=>{sent.push(event);return {error:null}}},window:{addEventListener:(k,v)=>handlers[k]=v}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('focus.js','utf8'),context);
 context.window.ChampionsFocus.sync();assert.equal(sent.length,0);
 focused=false;handlers.blur();hidden=true;handlers.visibilitychange();await new Promise(setImmediate);assert.equal(sent.length,1);
 hidden=false;focused=true;handlers.focus();focused=false;handlers.blur();await new Promise(setImmediate);assert.equal(sent.length,2);
 context.state.active.stage='leveling';context.window.ChampionsFocus.sync();focused=true;handlers.focus();focused=false;handlers.blur();assert.equal(sent.length,2);
 console.log('OK: SQL idempotente, autorização, isolamento por aluno, histórico, reenvios sem duplicação, rejeição fora do confronto e deduplicação blur/hidden.');
})().catch(async e=>{console.error(e);process.exitCode=1;await db.close()});
