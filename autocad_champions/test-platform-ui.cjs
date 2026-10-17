const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8'),portal=fs.readFileSync('platform.js','utf8').replace(/init\(\);\s*$/,''),html=fs.readFileSync('index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'IDs únicos');
for(const code of [app,portal])for(const match of code.matchAll(/\$\('([^']+)'\)/g))if(!match[1].endsWith('-'))assert.ok(ids.includes(match[1]),'Elemento existente: '+match[1]);
const sample={owner:true,disciplines:[{id:'drawing',name:'Desenho Mecânico',teachers:['teacher'],banks:[{id:'bank1',name:'AutoCAD',count:55,revision:1}]},{id:'ads',name:'Análise e Desenvolvimento de Sistemas',teachers:['teacher'],banks:[{id:'bank2',name:'Questões ADS',count:0,revision:1}]}],editions:[{id:'edition1',name:'Turma A',discipline_id:'drawing',code:'ABCD12345678',phase:'registration',players:0,bank_revision:1}]};
function env(teacher){
 const elements=new Map(),calls=[],intervals=[];let catalog=structuredClone(sample),selectedState={api_version:2,admin:teacher,registered:teacher,phase:'registration',started:false,players:[],matches:[],leveling:{},edition:{id:'edition1',name:'Turma A',discipline:'Desenho Mecânico',code:'ABCD12345678'}};
 const $=id=>{assert.ok(ids.includes(id),'ID existe: '+id);if(!elements.has(id))elements.set(id,{id,hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',classList:{toggle:()=>{}},setAttribute:()=>{},reset(){this.resetCalled=true},showModal(){this.open=true},close(){this.open=false},select(){this.selected=true},scrollIntoView(){this.scrolled=true},querySelectorAll:()=>[]});return elements.get(id)};
 const ctx=vm.createContext({URLSearchParams,URL,location:{search:teacher?'?professor=true':'',href:teacher?'https://example.test/?professor=true':'https://example.test/',pathname:'/'},history:{replaceState:()=>{}},performance:{now:()=>10000},document:{getElementById:$,addEventListener:()=>{},body:{classList:{toggle:()=>{}}}},navigator:{clipboard:{writeText:async()=>{}}},console,confirm:()=>true,prompt:()=>null,setInterval:fn=>{intervals.push(fn);return intervals.length},setTimeout:()=>{},window:{supabase:{createClient:()=>({rpc:async(name,args)=>{
  calls.push({name,args});
  const data=name==='cp_catalog'?catalog:name==='cp_resolve'?{id:'edition1',code:'ABCD12345678'}:name==='cp_rpc'?selectedState:name==='cp_create_edition'?'edition1':name==='cp_bank_questions'?[{id:1,statement:'Enunciado teste',options:['A) A','B) B','C) C','D) D','E) E'],correct:0}]:'new-id';
  return {data,error:null};
 }})}}});
 vm.runInContext(app,ctx);vm.runInContext(portal,ctx);return {ctx,$,calls,intervals,setState:s=>selectedState=s};
}
(async()=>{
 const t=env(true);await vm.runInContext('openPlatform()',t.ctx);assert.equal(t.$('portal').hidden,false);assert.match(t.$('discipline-grid').innerHTML,/Desenho Mecânico/);assert.match(t.$('discipline-grid').innerHTML,/Aguardando questões/);
 t.$('discipline-grid').onclick({target:{closest:()=>({dataset:{discipline:'ads'}})}});assert.equal(t.$('create-edition-btn').disabled,true);assert.equal(t.$('discipline-name').textContent,'Análise e Desenvolvimento de Sistemas');
 t.$('discipline-grid').onclick({target:{closest:()=>({dataset:{discipline:'drawing'}})}});assert.equal(t.$('create-edition-btn').disabled,false);
 t.$('new-edition-name').value='Turma B';t.$('edition-bank').value='bank1';t.$('new-edition-form').onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(t.calls.find(c=>c.name==='cp_create_edition').args.p_discipline,'drawing');assert.ok(t.calls.some(c=>c.name==='cp_rpc'&&c.args.p_edition==='edition1'&&c.args.p_action==='ac_state'));
 assert.equal(t.$('edition-context').hidden,false);t.$('share-current').onclick();assert.equal(t.$('share-dialog').open,true);assert.equal(t.$('share-link').value,'https://example.test/?campeonato=ABCD12345678');
 await vm.runInContext('loadPortal()',t.ctx);const count=t.calls.length;await t.intervals[0]?.();assert.equal(t.calls.length,count,'Sem polling da edição anterior no portal');
 await vm.runInContext("openBank('bank1')",t.ctx);assert.equal(t.$('bank-editor').hidden,false);assert.match(t.$('question-list').innerHTML,/Enunciado teste/);
 t.$('question-number').value='2';t.$('question-statement').value='Uma nova pergunta';for(let i=0;i<5;i++)t.$('question-option-'+i).value='Opção '+i;t.$('question-correct').value='2';
 t.$('question-form').onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));const save=t.calls.find(c=>c.name==='cp_save_questions');assert.equal(save.args.p_bank,'bank1');assert.equal(save.args.p_questions[0].correct,2);
 const s=env(false);await vm.runInContext('openPlatform()',s.ctx);assert.equal(s.$('entry').hidden,false);s.$('entry-code').value='ABCD12345678';s.$('entry-form').onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.ok(s.calls.some(c=>c.name==='cp_resolve'));assert.ok(s.calls.some(c=>c.name==='cp_rpc'&&c.args.p_edition==='edition1'));assert.equal(s.$('login').hidden,false);
 assert.equal(await vm.runInContext("rpc('ac_state').then(()=>true)",s.ctx),true);
 const empty=env(false);await assert.rejects(()=>vm.runInContext("rpc('ac_join',{p_name:'Sem campeonato'})",empty.ctx),/Selecione um campeonato/);
 console.log('OK: disciplinas, bloqueio de banco vazio, criação e seleção de edição, links, formulário de questões, inscrição por código e consultas com escopo.');
})().catch(e=>{console.error(e);process.exitCode=1});
