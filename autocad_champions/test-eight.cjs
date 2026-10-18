// Integração com oito sessões anônimas independentes. Tokens ficam no temporário.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
const url=source.match(/SUPABASE_URL='([^']+)'/)[1],key=source.match(/SUPABASE_KEY='([^']+)'/)[1];
const total=Number(process.argv[3]||8);
if(![8,26].includes(total))throw Error('Selecione 8 ou 26 participantes');
const sessionFile=path.join(os.tmpdir(),total===8?'autocad-champions-eight-sessions.json':`autocad-champions-${total}-sessions.json`);
let sessions=fs.existsSync(sessionFile)?JSON.parse(fs.readFileSync(sessionFile,'utf8')):[];
function save(){fs.writeFileSync(sessionFile,JSON.stringify(sessions))}
async function request(route,body,token){
 const response=await fetch(url+route,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const result=await response.json();if(!response.ok)throw Error(`${route}: ${result.message||result.msg||result.error_description||JSON.stringify(result)}`);return result;
}
let platformEdition=null;
async function rpc(session,fn,args={}){return platformEdition&&fn.startsWith('ac_')?request('/rest/v1/rpc/cp_rpc',{p_edition:platformEdition,p_action:fn,p_args:args},session.access_token):request('/rest/v1/rpc/'+fn,args,session.access_token)}
async function playV2(mode){
 const expected=mode==='level'?'leveling':'knockout';let submitted=0,expired=0;
 const delay=Math.min(10000,Math.max(0,Number(process.env.AC_TEST_STEP_MS)||0));
 const sets=new Map();
 for(let pass=0;pass<12;pass++){
  const progress=await Promise.all(sessions.map(async(session,i)=>{try{
   let state=await rpc(session,'ac_state');
   if(state.disqualified||!state.active||state.active.stage!==expected)return false;
   const run=state.active.id;let changed=false;
   const questionsInRun=state.active.total||(expected==='leveling'?20:10);
   for(let q=0;q<questionsInRun&&state.active?.id===run;q++){
    if(state.questions.length!==1)throw Error('O servidor deve enviar somente a pergunta atual');
    const current=state.questions[0],key=(state.active.match_id||'leveling')+':'+state.active.position,value=JSON.stringify(current);
    if(sets.has(key)&&sets.get(key)!==value)throw Error('Pergunta divergente entre adversários ou no nivelamento');sets.set(key,value);
    const result=await rpc(session,'ac_submit',{p_run:run,p_question:current.id,p_choice:(i+current.id)%current.op.length});
    if(result.accepted)submitted++;else if(result.expired)expired++;else throw Error('Resposta não reconhecida');
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    changed=true;state=await rpc(session,'ac_state');
   }
   if(changed)console.log(`${session.name}: etapa respondida`);return changed;
   }catch(e){const current=await rpc(session,'ac_state');if(current.disqualified){console.log(`${session.name}: desclassificado pelo professor; respostas interrompidas`);return false}throw e}
  }));
  if(!progress.some(Boolean))break;
 }
 const state=await rpc(sessions[0],'ac_state');
 if(mode==='level'){
  if(state.phase!=='leveling'||!state.leveling.ready)throw Error('O nivelamento ainda não está pronto para formar o mata-mata');
  console.log(JSON.stringify({stage:'leveling',submitted,expired,...state.leveling},null,2));return;
 }
 if(state.phase!=='finished')throw Error('O mata-mata ainda não terminou');
 const standard=state.matches.filter(m=>!m.third),last=Math.max(...standard.map(m=>m.round)),final=standard.find(m=>m.round===last),third=state.matches.find(m=>m.third);
 const report={participants:total,submitted,expired,phase:state.phase,played:state.matches.filter(m=>m.p1&&m.p2).length,
  automatic:state.matches.filter(m=>m.round===1&&m.winner&&(!m.p1||!m.p2)).length,champion:final?.winner,
  runnerUp:final?.winner_id===final?.p1_id?final?.p2:final?.p1,third:third?.winner,matches:state.matches};
 fs.writeFileSync(path.join(__dirname,`resultado-teste-v2-${total}.json`),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,matches:undefined},null,2));
}
async function main(){
 for(const session of sessions){const refreshed=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});Object.assign(session,{access_token:refreshed.access_token,refresh_token:refreshed.refresh_token});save()}
 if(process.env.AC_TEST_CODE){
  if(!sessions.length){const auth=await request('/auth/v1/signup',{});sessions.push({name:`Teste${total===8?'':'26'} 01`,access_token:auth.access_token,refresh_token:auth.refresh_token});save()}
  const edition=await request('/rest/v1/rpc/cp_resolve',{p_code:process.env.AC_TEST_CODE},sessions[0].access_token);platformEdition=edition.id;
  console.log(`Campeonato selecionado: ${edition.discipline} · ${edition.name}`);
 }
 const mode=process.argv[2]||'register';
 if(!['register','play','level'].includes(mode))throw Error('Escolha register, level ou play');
 if(mode!=='register'){
  if(sessions.length!==total)throw Error(`Cadastre as ${total} sessões primeiro`);
  const probe=await rpc(sessions[0],'ac_state');
  if(probe.api_version===2){
   if(mode==='level'&&probe.phase!=='leveling')throw Error('O professor precisa iniciar o nivelamento');
   if(mode==='play'&&!['knockout','finished'].includes(probe.phase))throw Error('O professor precisa formar o mata-mata após o nivelamento');
   return playV2(mode);
  }
  if(mode==='level')throw Error('Aplique competition-v2.sql antes de testar o nivelamento');
 }
 if(mode==='register'){
  for(let i=0;i<total;i++){
   let session=sessions[i];
   if(!session){const auth=await request('/auth/v1/signup',{});session={name:`Teste${total===8?'':'26'} ${String(i+1).padStart(2,'0')}`,access_token:auth.access_token,refresh_token:auth.refresh_token};if(!session.access_token)throw Error('Login anônimo não retornou uma sessão');sessions.push(session);save()}
   const state=await rpc(session,'ac_state');if(state.started)throw Error('Campeonato já iniciado; nenhum novo cadastro foi feito nesta etapa.');
   if(!state.registered)await rpc(session,'ac_join',{p_name:session.name});
   const verified=await rpc(session,'ac_state');if(!verified.registered)throw Error('Inscrição não confirmada');
   console.log(`${session.name}: inscrição confirmada`);
  }
  return;
 }
 if(sessions.length!==total)throw Error(`É necessário cadastrar ${total} sessões primeiro`);
 const initial=await rpc(sessions[0],'ac_state');
 if(!initial.started)throw Error('O professor ainda não iniciou o campeonato');
 const automatic=initial.matches.filter(m=>!m.third&&!!m.winner&&(!m.p1||!m.p2));
 if(automatic.length!==2**Math.ceil(Math.log2(total))-total||automatic.some(m=>m.round!==1))throw Error('Distribuição incorreta das classificações automáticas');
 console.log(`Chave conferida: ${automatic.length} classificações automáticas, todas na primeira fase.`);
 const questionSets=new Map();
 let submitted=0;
 for(let pass=0;pass<12;pass++){
  let progress=false;
  for(let i=0;i<sessions.length;i++){
   const session=sessions[i],state=await rpc(session,'ac_state');if(!state.started)throw Error('O professor ainda não iniciou o campeonato');
   if(!state.active)continue;
   const match=state.matches.find(m=>m.id===state.active.id);if(!match)throw Error('Duelo ausente da chave');
   const remaining=state.questions.filter(q=>!state.answers.some(a=>a.id===q.id));
   if(state.questions.length!==10)throw Error('Duelo não possui dez questões');
   const questionSet=JSON.stringify(state.questions);
   if(questionSets.has(match.id)&&questionSets.get(match.id)!==questionSet)throw Error('Perguntas diferentes entre adversários');
   questionSets.set(match.id,questionSet);
   for(const q of remaining){const answer=await rpc(session,'ac_answer',{p_match:state.active.id,p_question:q.id,p_choice:(i+q.id)%q.op.length});if(typeof answer.correct!=='boolean')throw Error('Resposta sem validação');submitted++;progress=true}
   if(remaining.length)console.log(`${session.name}: concluiu dez questões da rodada ${state.active.round}`);
  }
  if(!progress)break;
 }
 const state=await rpc(sessions[0],'ac_state'),standard=state.matches.filter(m=>!m.third),final=standard.find(m=>m.round===Math.max(...standard.map(x=>x.round))),third=state.matches.find(m=>m.third);
 const expectedSlots=2**Math.ceil(Math.log2(total));
 if(state.matches.length!==expectedSlots||state.matches.some(m=>!m.winner)||!final?.winner||!third?.winner)throw Error('Campeonato ainda não foi concluído');
 const played=state.matches.filter(m=>m.p1&&m.p2);if(played.length!==total)throw Error('Número incorreto de duelos disputados');
 if(played.some(m=>!m.done1||!m.done2||m.s1<0||m.s1>10||m.s2<0||m.s2>10))throw Error('Pontuação ou conclusão inconsistente');
 const report={participants:total,submitted,automatic:automatic.length,played:played.length,bracketCards:state.matches.length,champion:final.winner,runnerUp:final.winner===final.p1?final.p2:final.p1,third:third.winner,matches:state.matches};
 fs.writeFileSync(path.join(__dirname,`resultado-teste-${total}.json`),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,matches:undefined},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
