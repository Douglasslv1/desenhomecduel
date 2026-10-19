// Teste autorizado: 16 alunos fictícios, somente na edição indicada.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
const url=source.match(/SUPABASE_URL='([^']+)'/)[1],key=source.match(/SUPABASE_KEY='([^']+)'/)[1];
const code='059A3CB9E53A',file=path.join(os.tmpdir(),'champions-focus-test-'+code+'.json');
let sessions=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
const save=()=>fs.writeFileSync(file,JSON.stringify(sessions));
async function request(route,body,token){
 const response=await fetch(url+route,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok)throw Error(`${response.status}: ${data.message||data.msg||JSON.stringify(data)}`);return data;
}
async function main(){
 for(const s of sessions){const auth=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refresh_token});Object.assign(s,{access_token:auth.access_token,refresh_token:auth.refresh_token});save()}
 if(!sessions.length){const a=await request('/auth/v1/signup',{});if(!a.access_token)throw Error('Sessão anônima indisponível');sessions.push({name:'Teste Foco 01',access_token:a.access_token,refresh_token:a.refresh_token});save()}
 const edition=await request('/rest/v1/rpc/cp_resolve',{p_code:code},sessions[0].access_token);
 const rpc=(s,action,args={})=>request('/rest/v1/rpc/cp_rpc',{p_edition:edition.id,p_action:action,p_args:args},s.access_token);
 let state=await rpc(sessions[0],'ac_state');console.log(JSON.stringify({edition:edition.name,phase:state.phase,started:state.started,registered:state.registered}));
 if((process.argv[2]||'register')==='register'){
  if(state.started)throw Error('Inscrições encerradas. Nenhum novo aluno foi cadastrado.');
  for(let i=0;i<16;i++){
   if(!sessions[i]){const a=await request('/auth/v1/signup',{});if(!a.access_token)throw Error('Sessão anônima indisponível');sessions.push({name:`Teste Foco ${String(i+1).padStart(2,'0')}`,access_token:a.access_token,refresh_token:a.refresh_token});save()}
   const s=sessions[i],current=await rpc(s,'ac_state');
   if(!current.registered)await rpc(s,'ac_join',{p_name:s.name});
   if(!(await rpc(s,'ac_state')).registered)throw Error('Cadastro não confirmado');
   console.log(s.name+': cadastrado');
  }
  return;
 }
 if(process.argv[2]==='level'){
  if(state.phase!=='leveling')throw Error('Aguardando início do nivelamento pelo professor');
  await Promise.all(sessions.map(async(s,i)=>{
   let current=await rpc(s,'ac_state');
   for(let step=0;step<45&&current.active?.stage==='leveling';step++){
    const a=current.active;
    if(current.review)await rpc(s,'ac_continue',{p_run:a.id,p_question:current.review.question_id});
    else if(current.questions?.[0]){const q=current.questions[0];await rpc(s,'ac_submit',{p_run:a.id,p_question:q.id,p_choice:(i+q.id)%q.op.length})}
    else break;
    current=await rpc(s,'ac_state');
   }
   console.log(s.name+': nivelamento respondido');
  }));
  console.log(JSON.stringify((await rpc(sessions[0],'ac_state')).leveling));return;
 }
 if(process.argv[2]==='focus'){
  let count=0;
  for(const s of sessions){
   const current=await rpc(s,'ac_state');
   if(current.active?.stage!=='knockout')continue;
   const n=count===0?3:1;
   for(let i=0;i<n;i++){
    const result=await request('/rest/v1/rpc/cp_record_focus',{p_edition:edition.id,p_run:current.active.id,p_event:crypto.randomUUID(),p_kind:i%2?'hidden':'blur',p_occurred_at:new Date().toISOString()},s.access_token);
    if(!result.recorded)throw Error('Ocorrência não aceita pelo servidor');
   }
   console.log(JSON.stringify({student:s.name,simulated_events:n,match:current.active.match_id}));
   if(++count===2)break;
  }
  if(!count)throw Error('Nenhum confronto ativo. O professor deve formar o mata-mata.');
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
