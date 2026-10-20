const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const storage=new Map(),options=['A) Zero','B) Um','C) Dois','D) Tres','E) Quatro'];
function environment(){
 const elements=new Map(),calls=[];let answerState=null,practiceAnswer=null,random=0;
 const element=id=>{
  if(!elements.has(id)){
   const e={hidden:false,disabled:false,textContent:'',dataset:{},value:'',classList:{toggle(){}},inner:'',buttons:[],reset(){},querySelectorAll(){return this.buttons}};
   Object.defineProperty(e,'innerHTML',{get(){return this.inner},set(html){this.inner=html;this.buttons=[...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(m=>({html:m[2],disabled:/\bdisabled\b/.test(m[1]),dataset:{choice:m[1].match(/data-choice="(\d+)"/)?.[1],practiceChoice:m[1].match(/data-practice-choice="(\d+)"/)?.[1]}}))}});elements.set(id,e);
  }return elements.get(id);
 };
 const ctx=vm.createContext({Math:Object.assign(Object.create(Math),{random:()=>random}),URLSearchParams,location:{search:''},document:{getElementById:element,addEventListener(){}},performance:{now:()=>1000},setInterval:()=>1,setTimeout:()=>1,console,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},window:{supabase:{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='cp_practice_answer'?practiceAnswer:answerState,error:null}}})}}});
 vm.runInContext(fs.readFileSync('app.js','utf8'),ctx);vm.runInContext(fs.readFileSync('practice.js','utf8'),ctx);
 vm.runInContext("rpc=async(name,args)=>{const r=await db.rpc(name,args);return r.data};async function task(fn){if(busy)return;busy=true;try{await fn()}finally{busy=false}}",ctx);
 return {ctx,element,calls,setRandom:v=>random=v,setAnswer:s=>answerState=s,setPractice:s=>practiceAnswer=s};
}
(async()=>{
 const e=environment(),base={api_version:2,registered:true,matches:[],answers:[],active:{id:'run-1',stage:'knockout',position:1,total:10,score:0},questions:[{id:17,q:'Comando?',op:options}]};
 e.ctx.sample=base;vm.runInContext('state=sample;renderQuiz()',e.ctx);
 const shown=e.element('options').buttons.map(b=>b.dataset.choice);assert.deepEqual(shown,['1','2','3','4','0']);assert.equal(e.element('options').buttons[0].html,'A) Um');
 vm.runInContext('renderQuiz()',e.ctx);assert.deepEqual(e.element('options').buttons.map(b=>b.dataset.choice),shown,'Polling preserva a ordem');
 const reload=environment();reload.setRandom(.999);reload.ctx.sample=base;vm.runInContext('state=sample;renderQuiz()',reload.ctx);assert.deepEqual(reload.element('options').buttons.map(b=>b.dataset.choice),shown,'Recarga preserva a ordem salva');
 const feedback={run_id:'run-1',question_id:17,statement:'Comando?',options,correct:true,correct_choice:3,choice:3};
 e.setAnswer({...base,active:{...base.active,position:2,score:1,deadline:null},questions:[],review:feedback});
 await e.element('options').buttons[2].onclick();assert.equal(e.calls.find(c=>c.name==='ac_submit').args.p_choice,3,'Envia o índice original, não a posição exibida');
 assert.match(e.element('options').buttons[2].html,/C\) Tres/);assert.match(e.element('options').innerHTML,/answer-correct/);assert.ok(e.element('options').buttons.every(b=>b.disabled));
 e.ctx.sample={...base,active:{...base.active,position:2},review:{...feedback,correct:false,choice:1}};vm.runInContext('state=sample;renderQuiz()',e.ctx);assert.match(e.element('options').buttons[0].html,/Sua resposta/);assert.match(e.element('options').buttons[2].html,/Correta/);
 e.setRandom(.999);e.ctx.sample={...base,active:{...base.active,id:'run-2'}};vm.runInContext('state=sample;renderQuiz()',e.ctx);assert.deepEqual(e.element('options').buttons.map(b=>b.dataset.choice),['0','1','2','3','4'],'Nova rodada tem sorteio independente');
 const p={id:'practice-1',discipline:'Desenho',bank:'CAD',score:0,total:10,question:{number:1,statement:'Simulado?',options}};e.ctx.practice=p;e.setRandom(0);vm.runInContext('practiceState=practice;renderPractice()',e.ctx);
 assert.deepEqual(e.element('practice-options').buttons.map(b=>b.dataset.practiceChoice),shown);
 e.setPractice({...p,score:1,feedback:{...feedback,number:1},question:{...p.question,number:2}});
 e.element('practice-options').onclick({target:{closest:()=>e.element('practice-options').buttons[2]}});await new Promise(r=>setImmediate(r));assert.equal(e.calls.find(c=>c.name==='cp_practice_answer').args.p_choice,3);assert.match(e.element('practice-options').buttons[2].html,/C\) Tres/);
 e.setRandom(.999);vm.runInContext("practiceState={...practice,id:'practice-2'};renderPractice()",e.ctx);assert.deepEqual(e.element('practice-options').buttons.map(b=>b.dataset.practiceChoice),['0','1','2','3','4'],'Novo simulado sorteia novamente');
 storage.set('champions-option-order-v1:invalid','[1,1,1,1,1]');assert.equal(new Set(vm.runInContext("optionOrder('invalid',5)",e.ctx)).size,5);
 const noStorage=environment();vm.runInContext("sessionStorage.getItem=()=>{throw Error()};sessionStorage.setItem=()=>{throw Error()}",noStorage.ctx);const a=vm.runInContext("optionOrder('fallback',5).join(',')",noStorage.ctx);noStorage.setRandom(.999);assert.equal(vm.runInContext("optionOrder('fallback',5).join(',')",noStorage.ctx),a);
 console.log('OK: embaralhamento, letras atualizadas, sequência estável no polling/recarga/correção, índice original enviado nos dois modos, novo sorteio por rodada/tentativa e armazenamento inválido/indisponível.');
})().catch(e=>{console.error(e);process.exitCode=1});
