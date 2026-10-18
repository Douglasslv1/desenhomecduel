const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
const app=fs.readFileSync('app.js','utf8'),practice=fs.readFileSync('practice.js','utf8'),platform=fs.readFileSync('platform.js','utf8').replace(/init\(\);\s*$/,'');
for(const source of [app,practice,platform])for(const match of source.matchAll(/\$\('([^']+)'\)/g))if(!match[1].endsWith('-'))assert.ok(ids.includes(match[1]),match[1]);
const elements=new Map(),calls=[],storage=new Map(),catalog=[{id:'drawing',name:'Desenho',banks:[{id:'bank1',name:'AutoCAD',count:55}]},{id:'ads',name:'ADS',banks:[{id:'bank2',name:'ADS básico',count:0}]}];
function $(id){if(!elements.has(id)){
 const element={value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){}},querySelectorAll:()=>[],setAttribute(){},reset(){},inner:''};
 Object.defineProperty(element,'innerHTML',{get(){return this.inner},set(value){this.inner=value;if(id.startsWith('practice-')&&['practice-discipline','practice-bank','practice-count'].includes(id)){
  const options=[...value.matchAll(/<option value="([^"]+)"([^>]*)>/g)].filter(m=>!m[2].includes('disabled'));
  if(!options.some(m=>m[1]===this.value))this.value=options[0]?.[1]||'';
 }}});elements.set(id,element);
 }return elements.get(id)}
const initial={id:'practice1',bank:'AutoCAD',discipline:'Desenho',total:10,answered:0,score:0,finished:false,feedback:null,question:{number:1,statement:'Pergunta um',options:['a','b','c','d','e']}};
let practiceState=initial,champState={registered:true,started:true,active:null,phase:'leveling',api_version:2,player_id:'p1',matches:[],feedback:{run_id:'run1',question_id:1,correct:false,statement:'Pergunta anterior',correct_option:'B) Certa'}};
const ctx=vm.createContext({URLSearchParams,URL,location:{search:'?simulado=true',href:'https://example.test/?simulado=true',pathname:'/'},history:{replaceState(){}},document:{getElementById:$,addEventListener(){},body:{classList:{toggle(){}}}},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},performance:{now:()=>1000},setInterval:()=>1,setTimeout:()=>1,console,window:{supabase:{createClient:()=>({rpc:async(name,args)=>{
 calls.push({name,args});const data=name==='cp_practice_catalog'?catalog:name==='cp_practice_start'||name==='cp_practice_state'||name==='cp_practice_answer'?practiceState:champState;return {data,error:null};
 }})},ChampionsExperience:{init(){},clear(){},onState(){},confirm:async()=>({confirmed:true})}}});
vm.runInContext(app,ctx);vm.runInContext(practice,ctx);vm.runInContext(platform,ctx);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 await vm.runInContext('openPlatform()',ctx);assert.equal($('practice-menu').hidden,false);assert.equal($('practice-start').disabled,false);
 $('practice-discipline').value='ads';$('practice-discipline').onchange();assert.equal($('practice-start').disabled,true);
 $('practice-discipline').value='drawing';$('practice-discipline').onchange();$('practice-count').value='10';
 $('practice-form').onsubmit({preventDefault(){}});await flush();assert.equal($('practice-quiz').hidden,false);assert.equal($('practice-question').textContent,'Pergunta um');assert.equal(storage.get('champions-practice-run'),'practice1');
 practiceState={...initial,answered:1,score:1,feedback:{correct:true,statement:'Pergunta um',correct_option:'A) a'},question:{...initial.question,number:2,statement:'Pergunta dois'}};
 $('practice-options').onclick({target:{closest:()=>({dataset:{practiceChoice:'0'}})}});await flush();assert.equal($('practice-question').textContent,'Pergunta dois');assert.match($('practice-feedback').innerHTML,/Resposta correta/);
 assert.equal(calls.find(c=>c.name==='cp_practice_answer').args.p_run,'practice1');assert.equal(calls.filter(c=>c.name==='cp_rpc').length,0);
 practiceState={...practiceState,finished:true,answered:10,score:7,question:null};
 $('practice-options').onclick({target:{closest:()=>({dataset:{practiceChoice:'1'}})}});await flush();assert.equal($('practice-result').hidden,false);assert.equal($('practice-score').textContent,'7 de 10');assert.match($('practice-result-description').textContent,/errou 3/);
 await vm.runInContext('loadPractice()',ctx);assert.equal($('practice-result').hidden,false,'Retoma tentativa existente');
 $('practice-new').onclick();assert.equal($('practice-menu').hidden,false);assert.equal(storage.has('champions-practice-run'),false);
 ctx.champ=champState;vm.runInContext('state=champ;renderAnswerReview()',ctx);assert.equal($('answer-review').hidden,false);assert.equal($('review-correct').textContent,'Resposta correta: B) Certa');
 ctx.champ={...champState,feedback:null};vm.runInContext('state=champ;renderAnswerReview()',ctx);assert.equal($('answer-review').hidden,true);
 ctx.champ={...champState,disqualified:true};vm.runInContext('state=champ;renderAnswerReview()',ctx);assert.equal($('answer-review').hidden,true);
 console.log('OK: menu por disciplina/banco, banco vazio bloqueado, simulado 7/10, retomada e novas tentativas, gabarito anterior no campeonato e isolamento da competição.');
})().catch(e=>{console.error(e);process.exitCode=1});
