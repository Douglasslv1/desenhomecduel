const {PGlite}=require('./.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
const db=new PGlite();
const admin='00000000-0000-4000-8000-000000000001';
let users=[];
const query=async(sql,args=[])=> (await db.query(sql,args)).rows;
const scalar=async(sql,args=[])=>Object.values((await query(sql,args))[0])[0];
const login=id=>query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const rpc=async(name,args=[])=>scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
async function rejects(fn,pattern){await assert.rejects(fn,pattern)}
async function roster(n){users=[];for(let i=0;i<n;i++){
 const user=`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
 await login(user);const player=await rpc('ac_join',[`Teste ${String(i+1).padStart(2,'0')}`]);users.push({user,player,index:i});
}await login(admin)}
async function runAnswer(user,correct=true){
 await login(user.user);const s=await rpc('ac_state');if(!s.active)return false;
 const q=s.questions[0],key=await scalar('select correct from public.ac_questions where id=$1',[q.id]);
 const result=await rpc('ac_submit',[s.active.id,q.id,correct?key:(key+1)%q.op.length]);
 assert.equal(result.accepted,true);return true;
}
async function finishLevel(){for(const u of users){
 if(await scalar('select disqualified from public.ac_players where id=$1',[u.player]))continue;
 for(let i=0;i<10;i++)await runAnswer(u,i<u.index%11);
}await login(admin)}
async function finishBracket(){
 for(let pass=0;pass<20;pass++){
  let progress=false;
  for(const u of users){
   if(await scalar('select disqualified from public.ac_players where id=$1',[u.player]))continue;
   await login(u.user);const s=await rpc('ac_state');if(!s.active)continue;
   for(let i=s.active.position;i<=10;i++)await runAnswer(u,(i+u.index)%3!==0);
   progress=true;
  }
  if(!progress)break;
 }
 await login(admin);const s=await rpc('ac_state');assert.equal(s.phase,'finished');return s;
}
async function reset(){await login(admin);return rpc('ac_reset')}
async function main(){
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await db.exec(fs.readFileSync('schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 await db.exec(fs.readFileSync('questions.sql','utf8'));
 await db.exec(fs.readFileSync('competition-v2.sql','utf8'));
 await db.exec(fs.readFileSync('competition-v2.sql','utf8'));
 await query('insert into auth.users(id) values($1)',[admin]);await query('insert into public.ac_admins(user_id) values($1)',[admin]);
 await roster(26);
 await login(users[0].user);await rejects(()=>rpc('ac_start'),/Apenas professor/);
 await rejects(()=>rpc('ac_disqualify',[users[1].player,'Teste']),/Apenas professor/);
 await login(admin);await rpc('ac_start');
 assert.equal(await scalar('select count(distinct questions) from public.ac_runs'),1);
 const before=await scalar('select count(*) from public.ac_questions');assert.equal(before,40);
 await login(users[0].user);let s=await rpc('ac_state');
 assert.equal(s.phase,'leveling');assert.equal(s.questions.length,1);assert.equal(s.questions[0].correct,undefined);
 const deadline=s.active.deadline;s=await rpc('ac_state');assert.equal(s.active.deadline,deadline);
 await login(users[1].user);await rejects(()=>rpc('ac_submit',[s.active.id,s.questions[0].id,0]),/indisponível/);
 await login(users[0].user);
 const future=await scalar('select questions[2] from public.ac_runs where id=$1',[s.active.id]);
 assert.equal((await rpc('ac_submit',[s.active.id,future,0])).accepted,false);
 assert.equal(await scalar('select position from public.ac_runs where id=$1',[s.active.id]),1);
 await login(admin);await rejects(()=>rpc('ac_start_knockout'),/Aguarde/);
 await finishLevel();
 const ranking=(await query("select player_id from public.ac_runs where stage='leveling' order by score desc,finished_at-started_at,tie_order,player_id")).map(r=>r.player_id);
 await rpc('ac_start_knockout');
 const first=await query('select * from public.ac_matches where round=1 order by slot');
 assert.equal(first.length,16);assert.equal(first.filter(m=>!m.p2).length,6);
 assert.equal(new Set(first.flatMap(m=>[m.p1,m.p2]).filter(Boolean)).size,26);
 const byes=first.filter(m=>!m.p2).map(m=>m.p1);assert.deepEqual(byes,ranking.slice(0,6));
 const pairs=first.filter(m=>m.p2);pairs.forEach((m,i)=>assert.deepEqual([m.p1,m.p2],ranking.slice(6+2*i,8+2*i)));
 const finished=await finishBracket();
 assert.equal(finished.matches.filter(m=>m.p1&&m.p2).length,26);
 assert.equal(await scalar("select count(*) from public.ac_responses x join public.ac_runs r on r.id=x.run_id where r.stage='knockout'"),520);
 assert.equal(await scalar('select count(*) from public.ac_responses'),780);
 console.log('OK: 26 participantes; nivelamento igual, duplas por ranking, seis byes e 780 respostas até o pódio.');
 await reset();assert.equal(await scalar("select jsonb_array_length(snapshot->'responses') from public.ac_archives order by archived_at desc limit 1"),780);
 assert.equal(await scalar('select count(*) from public.ac_runs'),0);assert.equal(await scalar('select count(*) from public.ac_questions'),40);
 await roster(4);await rpc('ac_start');await login(users[0].user);s=await rpc('ac_state');
 await query("update public.ac_runs set started_at=clock_timestamp()-interval '91 seconds',question_started_at=clock_timestamp()-interval '91 seconds' where id=$1",[s.active.id]);
 const late=await rpc('ac_submit',[s.active.id,s.questions[0].id,0]);assert.equal(late.accepted,false);assert.equal(late.expired,true);
 assert.equal(await scalar('select count(*) from public.ac_responses where timed_out'),1);
 let resumed=await rpc('ac_state');assert.equal(resumed.active.position,2);assert.equal(resumed.active.score,0);
 const deadline2=resumed.active.deadline;resumed=await rpc('ac_state');assert.equal(resumed.active.deadline,deadline2);
 await query("update public.ac_runs set started_at=clock_timestamp()-interval '901 seconds',question_started_at=clock_timestamp()-interval '901 seconds' where position=1");
 await query("update public.ac_runs set question_started_at=clock_timestamp()-interval '811 seconds' where position=2");
 await login(admin);s=await rpc('ac_state');assert.equal(s.leveling.ready,true);
 assert.equal(await scalar('select count(*) from public.ac_responses where timed_out'),40);
 assert.equal(await scalar('select max(score) from public.ac_runs'),0);
 // Force tempos idênticos: chamadas separadas a clock_timestamp diferem em microssegundos.
 await query("update public.ac_runs set started_at='2026-01-01T00:00:00Z',finished_at='2026-01-01T00:15:00Z' where stage='leveling'");
 const tiedRanking=(await query("select player_id from public.ac_runs where stage='leveling' order by tie_order,player_id")).map(r=>r.player_id);
 await rpc('ac_start_knockout');
 const tiedPairs=await query('select p1,p2 from public.ac_matches where round=1 order by slot');
 assert.deepEqual(tiedPairs.flatMap(m=>[m.p1,m.p2]),tiedRanking);
 for(let pass=0;pass<2;pass++){
  await query("update public.ac_runs set started_at=statement_timestamp()-interval '901 seconds',question_started_at=statement_timestamp()-interval '901 seconds' where stage='knockout' and finished_at is null");
  await rpc('ac_state');
 }
 const tiedGames=await query("select m.winner,case when a.tie_order<b.tie_order then a.player_id else b.player_id end expected from public.ac_matches m join public.ac_runs a on a.match_id=m.id and a.player_id=m.p1 join public.ac_runs b on b.match_id=m.id and b.player_id=m.p2");
 assert.equal(tiedGames.length,4);for(const game of tiedGames)assert.equal(game.winner,game.expected);
 assert.equal((await rpc('ac_state')).phase,'finished');
 console.log('OK: 90 segundos por pergunta; recarga mantém prazo; resposta tardia recusada; desconectados expiram sem pontos.');
 console.log('OK: empate exato no nivelamento e em todos os duelos usa desempate persistente sem travar o pódio.');
 await reset();await roster(8);await rpc('ac_start');
 await rpc('ac_disqualify',[users[0].player,'Uso de ferramenta não autorizada']);
 await login(users[0].user);s=await rpc('ac_state');assert.equal(s.disqualified,true);assert.equal(s.active,null);
 await login(admin);await finishLevel();await rpc('ac_start_knockout');
 const duel=(await query('select * from public.ac_matches where round=1 and p1 is not null and p2 is not null limit 1'))[0];
 await rpc('ac_disqualify',[duel.p1,'Comunicação externa durante o duelo']);
 assert.equal(await scalar('select winner from public.ac_matches where id=$1',[duel.id]),duel.p2);
 const dqUser=users.find(u=>u.player===duel.p1);await login(dqUser.user);const run=await scalar('select id from public.ac_runs where player_id=$1 and match_id=$2',[duel.p1,duel.id]);
 await rejects(()=>rpc('ac_submit',[run,1,0]),/indisponível/);
 await login(admin);await finishBracket();
 assert.equal(await scalar('select count(*) from public.ac_matches m join public.ac_players p on p.id=m.winner where p.disqualified'),0);
 console.log('OK: desclassificação exclui do nivelamento, encerra acesso e faz adversário avançar.');
 await reset();await roster(4);await rpc('ac_start');await finishLevel();await rpc('ac_start_knockout');
 const semis=await query('select * from public.ac_matches where round=1 order by slot');
 for(const semi of semis)await rpc('ac_disqualify',[semi.p1,'Infração durante a semifinal']);
 const third=(await query('select * from public.ac_matches where is_third'))[0];assert.equal(third.status,'empty');assert.equal(third.winner,null);
 await finishBracket();
 await rejects(()=>rpc('ac_disqualify',[semis[0].p2,'Revisão retroativa']),/já terminou/);
 await reset();await roster(4);await rpc('ac_start');await finishLevel();await rpc('ac_start_knockout');
 const semi=(await query('select * from public.ac_matches where round=1 order by slot limit 1'))[0];
 for(const player of [semi.p1,semi.p2]){const u=users.find(x=>x.player===player);for(let i=0;i<10;i++)await runAnswer(u,true)}
 await login(admin);const won=await scalar('select winner from public.ac_matches where id=$1',[semi.id]);
 await rpc('ac_disqualify',[won,'Infração antes de conhecer o adversário da final']);
 const podium=await finishBracket();assert.notEqual(podium.matches.find(m=>m.round===2&&!m.third).winner_id,won);
 console.log('OK: semifinais desclassificadas não alimentam o terceiro lugar; classificado sem adversário ainda pode ser removido.');
 await db.exec('set role authenticated');
 await rejects(()=>query('select * from public.ac_runs'),/permission denied/);
 await rejects(()=>rpc('ac_tick'),/permission denied/);
 await rejects(()=>rpc('ac_advance'),/permission denied/);
 await db.exec('reset role');
 console.log('OK: tabelas e funções internas protegidas; reset preserva perguntas e arquiva respostas.');
 await db.close();
}
main().catch(async e=>{console.error(e);process.exitCode=1;await db.close()});
