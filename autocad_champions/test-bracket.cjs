const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function tournament(n){
 let size=2,seeds=[1,2];while(size<n){size*=2;seeds=seeds.flatMap(s=>[s,size+1-s])}
 const rounds=Math.log2(size),matches=[];
 for(let r=1;r<=rounds;r++)for(let slot=0;slot<size/2**r;slot++)matches.push({id:`${r}-${slot}`,round:r,slot,third:false,p1:r===1&&seeds[2*slot]<=n?`Teste ${seeds[2*slot]}`:null,p2:r===1&&seeds[2*slot+1]<=n?`Teste ${seeds[2*slot+1]}`:null,winner:null,status:'waiting'});
 matches.push({id:'third',round:rounds,slot:0,third:true,p1:null,p2:null,winner:null,status:'waiting'});
 let played=0,byes=0;
 for(let r=1;r<=rounds;r++)for(const m of matches.filter(m=>m.round===r&&!m.third)){
  assert.ok(m.p1||m.p2,'Nenhum confronto completamente vazio');
  if(!m.p1||!m.p2){assert.equal(r,1,'Avanço automático só na primeira fase');byes++}
  else played++;
  m.winner=m.p1||m.p2;m.status='advanced';m.s1=m.p1?8:0;m.s2=m.p2?4:0;
  if(r<rounds){const next=matches.find(x=>x.round===r+1&&x.slot===Math.floor(m.slot/2)&&!x.third);next[m.slot%2?'p2':'p1']=m.winner}
  if(r===rounds-1)matches.at(-1)[m.slot?'p2':'p1']=m.winner===m.p1?m.p2:m.p1;
 }
 const third=matches.at(-1);assert.ok(third.p1&&third.p2);third.winner=third.p1;third.status='advanced';played++;
 assert.equal(played,n);assert.equal(byes,size-n);
 return {matches,byes,played,rounds};
}
for(let n=4;n<=64;n++)tournament(n);
const sample=tournament(26),elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{hidden:true});return elements.get(id)};
const ctx=vm.createContext({window:{supabase:{createClient:()=>({})}},URLSearchParams,location:{search:'?professor=true'},document:{getElementById:el,addEventListener:()=>{}},console});
vm.runInContext(fs.readFileSync('app.js','utf8').replace(/init\(\);\s*$/,''),ctx);
ctx.sample={started:true,players:Array.from({length:26},(_,i)=>({name:`Teste ${i+1}`})),matches:sample.matches};vm.runInContext('state=sample;renderTeacher()',ctx);
assert.equal((el('bracket').innerHTML.match(/class="tree-node /g)||[]).length,31);
assert.ok(el('bracket').innerHTML.indexOf('Grande final')<el('bracket').innerHTML.indexOf('Fase de 32'));
assert.ok(el('bracket').innerHTML.includes('third-place'));
assert.ok(el('bracket').innerHTML.includes('repeat(16,minmax(0,1fr))'));
assert.ok(!el('bracket').innerHTML.includes('minmax(170px'));
let html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const teacher=html.indexOf('<section id="teacher"');
html=html.slice(0,teacher)+html.slice(teacher).replace('class="panel" hidden','class="panel"');
for(const id of ['stage-banner','roster','bracket','podium']){
 const start=html.indexOf(`<div id="${id}"`),contentStart=html.indexOf('>',start)+1;
 let depth=1,end=contentStart;const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=contentStart;let tag;
 while(depth&&(tag=tags.exec(html))){depth+=tag[0].startsWith('</')?-1:1;if(!depth)end=tag.index}
 const content=id==='stage-banner'?'PRÉVIA LOCAL · 26 participantes fictícios · Resultado simulado':el(id).innerHTML;
 html=html.slice(0,contentStart)+content+html.slice(end);
}
html=html.replace('</body>',`<script>const setProjection=enabled=>{document.body.classList.toggle('projection-mode',enabled);document.getElementById('projection').setAttribute('aria-pressed',String(enabled))};document.getElementById('projection').onclick=()=>setProjection(true);document.getElementById('projection-exit').onclick=()=>setProjection(false);document.addEventListener('keydown',e=>{if(e.key==='Escape')setProjection(false)});</script></body>`);
fs.writeFileSync('preview-26.html',html);
console.log(`OK: simulação de 4 a 64 participantes; 26 participantes = ${sample.byes} avanços automáticos, ${sample.played} duelos, ${sample.rounds} fases. Prévia gerada.`);
