const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map(),storage=new Map(),timers=[],frames=[];let focus=0,draws=0,reduced=false;
function el(id){if(!elements.has(id)){
 const events={};const classes=new Set();
 const element={hidden:false,textContent:'',value:'',required:false,dataset:{},returnValue:'',classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},
  addEventListener:(name,handler)=>events[name]=handler,focus:()=>focus++,setCustomValidity(message){this.validity=message},reportValidity(){return !this.validity},
  showModal(){this.open=true},close(value=''){this.returnValue=value;this.open=false;events.close?.()},cancel(){events.cancel?.();this.close(this.returnValue)},
  getContext:()=>({clearRect(){},setTransform(){},save(){},restore(){},translate(){},rotate(){},fillRect(){draws++}})};
 elements.set(id,element);
 }return elements.get(id)}
const ctx=vm.createContext({window:{matchMedia:()=>({matches:reduced}),innerWidth:1200,innerHeight:800,devicePixelRatio:1},document:{getElementById:el,activeElement:{isConnected:true,focus:()=>focus++},addEventListener:()=>{},hidden:false},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{},requestAnimationFrame:fn=>{frames.push(fn);return frames.length},cancelAnimationFrame:()=>{},console});
vm.runInContext(fs.readFileSync('experience.js','utf8'),ctx);const ui=ctx.window.ChampionsExperience;ui.init();
const player='p1';const semi={id:'semi',round:2,p1:'Ana',p2:'Bia',p1_id:player,p2_id:'p2',winner_id:player,winner:'Ana'};
const final={id:'final',round:3,p1:'Ana',p2:null,p1_id:player,p2_id:null,winner_id:null};
const third={id:'third',round:3,third:true,p1:'Bia',p2:'Caio',p1_id:'p2',p2_id:'p3',winner_id:null};
const state={edition:{id:'edition-a'},started:true,phase:'knockout',player_id:player,active:null,matches:[semi,final,third]};
(async()=>{
 let pending=ui.confirm({title:'Começar?',message:'Mensagem',confirmLabel:'Iniciar'});assert.equal(el('action-dialog').open,true);assert.equal(el('action-title').textContent,'Começar?');assert.equal(el('action-input-group').hidden,true);
 assert.equal((await ui.confirm({title:'Duplicado'})).confirmed,false);
 el('action-cancel').onclick();assert.equal((await pending).confirmed,false);
 pending=ui.confirm({input:true,title:'Desclassificar?',danger:true});el('action-input').value='  ';el('action-form').onsubmit({preventDefault(){}});assert.equal(el('action-dialog').open,true);assert.ok(el('action-input').validity);
 el('action-input').value='  Ajuda externa  ';el('action-form').onsubmit({preventDefault(){}});const decision=await pending;assert.equal(decision.confirmed,true);assert.equal(decision.value,'Ajuda externa');assert.equal(el('action-dialog').dataset.tone,'danger');
 pending=ui.confirm({title:'Cancelar com Escape'});el('action-dialog').cancel();assert.equal((await pending).confirmed,false);assert.ok(focus>0);
 assert.equal(ui.eventFor(state,false).kind,'round');ui.onState(state);assert.equal(el('waiting-title').textContent,'Você venceu a rodada!');assert.equal(el('winner-emblem').hidden,false);assert.equal(el('celebration-toast').hidden,false);
 const count=frames.length;ui.onState(state);assert.equal(frames.length,count,'Polling não repete os confetes');
 frames.at(-1)(1000);frames.at(-1)(1100);assert.ok(draws>0);
 // A memória persistida também evita repetição depois de recarregar o script.
 const saved=storage.size;vm.runInContext(fs.readFileSync('experience.js','utf8'),ctx);ctx.window.ChampionsExperience.onState(state);assert.equal(storage.size,saved);
 const active={...state,edition:{id:'edition-b'},active:{id:'run-final'}};ui.onState(active);assert.match(el('celebration-message').textContent,/já começou/);
 const waitingForOpponent={...state,matches:[semi,{...final,p2_id:'p3',p2:'Caio'},third]};assert.equal(ui.eventFor(waitingForOpponent,false),null);
 const won={...state,phase:'finished',matches:[semi,{...final,p2_id:'p3',p2:'Caio',winner_id:player,winner:'Ana'},third]};
 ui.onState(won);assert.equal(el('winner-rank').textContent,'1º LUGAR');assert.equal(el('waiting-title').textContent,'Você é o campeão!');
 assert.equal(ui.eventFor({...won,player_id:'p3'},false).rank,2);
 assert.equal(ui.eventFor({...won,player_id:'p2',matches:[semi,won.matches[1],{...third,winner_id:'p2',winner:'Bia'}]},false).rank,3);
 assert.equal(ui.eventFor({...won,player_id:'p3',disqualified:true},false),null);
 assert.equal(ui.eventFor({...won,edition:{id:'e',archived:true}},true),null);
 assert.equal(ui.eventFor(won,true).kind,'podium');assert.equal(ui.eventFor(state,true),null);
 const bye={...state,edition:{id:'bye'},matches:[{...semi,p2_id:null,p2:null},final,third]};assert.equal(ui.eventFor(bye,false).title,'Você está classificado!');
 reduced=true;const before=frames.length;ui.onState({...won,edition:{id:'motion-reduced'}});assert.equal(frames.length,before);assert.equal(el('celebration-toast').hidden,false);
 ui.onState({...state,disqualified:true});assert.equal(el('celebration-toast').hidden,true);assert.equal(el('winner-emblem').hidden,true);
 const app=fs.readFileSync('app.js','utf8'),platform=fs.readFileSync('platform.js','utf8');
 assert.ok(!/(?:^|[^.\w])(?:confirm|prompt|alert)\s*\(/m.test(app+platform),'Sem caixas nativas');
 const html=fs.readFileSync('index.html','utf8');assert.ok(html.indexOf('./experience.js')<html.indexOf('./platform.js'));
 console.log('OK: confirmação/cancelamento/Escape, motivo obrigatório, rodada e três colocações, confetes sem repetição, histórico e desclassificação sem festa, movimento reduzido e ausência de caixas nativas.');
})().catch(e=>{console.error(e);process.exitCode=1});
