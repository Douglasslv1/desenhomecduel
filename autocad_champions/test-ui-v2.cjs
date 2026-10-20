const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8').replace(/init\(\);\s*$/,'');
function environment(teacher=false){
 const elements=new Map(),intervals=[],events=new Map(),calls=[];
 const element=id=>{
  if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',innerHTML:'',dataset:{},classes:new Set(),
   classList:{toggle(name,enabled){const e=element(id);enabled?e.classes.add(name):e.classes.delete(name)}},
   setAttribute(name,value){this[name]=value},querySelectorAll(){return []}});
  return elements.get(id);
 };
 const clock={now:10000};let response;
 const ctx=vm.createContext({URLSearchParams,location:{search:teacher?'?professor=true':''},performance:{now:()=>clock.now},
  console:{error:()=>{}},document:{getElementById:element,addEventListener:(event,handler)=>events.set(event,handler),body:{classList:{toggle:()=>{}}}},
  window:{supabase:{createClient:()=>({})}},setInterval:fn=>{intervals.push(fn);return intervals.length},setTimeout:()=>{},confirm:()=>true,prompt:()=> 'Uso de ajuda externa'});
 ctx.window.ChampionsExperience={confirm:async options=>({confirmed:ctx.confirm(),value:options.input?ctx.prompt():''}),onState:()=>{}};
 vm.runInContext(source,ctx);ctx.mockRpc=async(name,args)=>{calls.push({name,args});return name==='cp_focus_report'?[]:name==='ac_state'?response:{accepted:false,expired:true}};vm.runInContext('rpc=mockRpc',ctx);
 return {ctx,element,calls,intervals,events,clock,setState:s=>{response=s}};
}
const initial={api_version:2,registered:true,started:true,phase:'leveling',player_id:'p1',matches:[],answers:[],server_now:'2026-10-16T12:00:00Z',active:{id:'run1',stage:'leveling',position:1,score:0,deadline:'2026-10-16T12:01:30Z'},questions:[{id:10,q:'Qual comando?',op:['A','B','C','D','E']}]};
(async()=>{
 const s=environment();s.setState(initial);await vm.runInContext('refresh()',s.ctx);
 assert.equal(s.element('quiz-title').textContent,'Etapa de nivelamento');assert.equal(s.element('question-timer').textContent,'Tempo restante: 1:30');
 s.clock.now+=76000;vm.runInContext('updateTimer()',s.ctx);assert.equal(s.element('question-timer').textContent,'Tempo restante: 0:14');assert.ok(s.element('question-timer').classes.has('urgent'));
 s.setState({...initial,server_now:'2026-10-16T12:01:16Z'});await vm.runInContext('refresh()',s.ctx);assert.equal(s.element('question-timer').textContent,'Tempo restante: 0:14');
 s.setState({...initial,active:{...initial.active,position:2,total:20,deadline:null},review:{question_id:10,statement:'Qual comando?',options:['A','B','C','D','E'],choice:null,correct_choice:1,timed_out:true},server_now:'2026-10-16T12:01:31Z',questions:[]});
 await vm.runInContext("answer('run1',10,0)",s.ctx);assert.equal(s.calls.find(c=>c.name==='ac_submit').args.p_run,'run1');assert.match(s.element('feedback').textContent,/Tempo esgotado/);assert.equal(s.element('question').textContent,'Qual comando?');assert.match(s.element('options').innerHTML,/answer-correct/);assert.equal(s.element('question-next').hidden,false);
 await s.element('question-next').onclick();assert.ok(s.calls.some(c=>c.name==='ac_continue'&&c.args.p_question===10));
 s.setState({...initial,disqualified:true,active:null});await vm.runInContext('refresh()',s.ctx);assert.match(s.element('waiting-text').textContent,/desclassificado/);
 const t=environment(true);const player={id:'p1',name:'Teste 01',can_disqualify:true,level_score:8,level_answered:10,level_done:true};
 t.setState({...initial,admin:true,players:[player],leveling:{done:4,total:4,ready:true},active:null});await vm.runInContext('refresh()',t.ctx);
 assert.equal(t.element('knockout').hidden,false);assert.equal(t.element('knockout').disabled,false);assert.match(t.element('roster').innerHTML,/Desclassificar/);
 await t.element('roster').onclick({target:{closest:()=>({dataset:{player:'p1'}})}});assert.equal(t.calls.find(c=>c.name==='ac_disqualify').args.p_reason,'Uso de ajuda externa');
 await t.element('knockout').onclick();assert.ok(t.calls.some(c=>c.name==='ac_start_knockout'));
 assert.equal(t.element('participants-details').open,true);
 const duel={id:'match1',round:1,slot:0,p1:'Teste 01',p2:'Teste 02',p1_id:'p1',p2_id:'p2',winner:null,status:'waiting',third:false};
 const knockout={...initial,phase:'knockout',admin:true,active:null,players:[player,{id:'p2',name:'Teste 02',can_disqualify:true}],matches:[duel]};
 t.setState(knockout);await vm.runInContext('refresh()',t.ctx);
 assert.equal(t.element('participants-details').open,false);
 assert.equal((t.element('bracket').innerHTML.match(/class="card-disqualify"/g)||[]).length,2);
 assert.match(t.element('bracket').innerHTML,/aria-label="Desclassificar Teste 01"/);
 const before=t.calls.filter(c=>c.name==='ac_disqualify').length;
 await t.element('bracket').onclick({target:{closest:()=>({dataset:{player:'p2'}})}});
 assert.equal(t.calls.filter(c=>c.name==='ac_disqualify').length,before+1);
 assert.equal(t.calls.filter(c=>c.name==='ac_disqualify').at(-1).args.p_player,'p2');
 t.ctx.confirm=()=>false;
 await t.element('bracket').onclick({target:{closest:()=>({dataset:{player:'p2'}})}});
 assert.equal(t.calls.filter(c=>c.name==='ac_disqualify').length,before+1);
 t.setState({...knockout,phase:'finished',matches:[{...duel,winner:'Teste 01',winner_id:'p1',status:'advanced'}]});await vm.runInContext('refresh()',t.ctx);
 assert.ok(!t.element('bracket').innerHTML.includes('class="card-disqualify"'));
 t.setState({...knockout,players:[{...player,can_disqualify:false}],matches:[{...duel,dq1:true}]});await vm.runInContext('refresh()',t.ctx);
 assert.ok(!t.element('bracket').innerHTML.includes('class="card-disqualify"'));
 const student=environment();student.ctx.sample=knockout;vm.runInContext('state=sample',student.ctx);
 assert.ok(!vm.runInContext(`card(${JSON.stringify(duel)})`,student.ctx).includes('class="card-disqualify"'));
 console.log('OK: telas de nivelamento, relógio persistente, expiração, desclassificação e controles do professor.');
})().catch(e=>{console.error(e);process.exitCode=1});
