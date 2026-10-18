// Diálogos acessíveis e celebrações locais. Nenhuma alteração no banco.
window.ChampionsExperience=(()=>{
 const el=id=>document.getElementById(id),seen=new Set();let pending=null,animation=null,toastTimer=null;
 const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function confirm(options={}){
  if(pending)return Promise.resolve({confirmed:false,value:''});
  const dialog=el('action-dialog'),input=el('action-input');
  el('action-title').textContent=options.title||'Confirmar ação';
  el('action-message').textContent=options.message||'';
  el('action-confirm').textContent=options.confirmLabel||'Confirmar';
  el('action-input-group').hidden=!options.input;
  el('action-input-label').textContent=options.inputLabel||'Motivo';
  input.value='';input.required=!!options.input;input.minLength=options.minLength||3;input.maxLength=options.maxLength||500;input.setCustomValidity('');
  dialog.dataset.tone=options.danger?'danger':'normal';
  dialog.returnValue='';
  const previous=document.activeElement;
  const promise=new Promise(resolve=>{pending={resolve,previous,input:!!options.input}});
  dialog.showModal();(options.input?input:el('action-cancel')).focus();return promise;
 }
 function finish(confirmed){
  if(!pending)return;const current=pending;pending=null;
  current.resolve({confirmed,value:confirmed&&current.input?el('action-input').value.trim():''});
  if(current.previous?.isConnected)current.previous.focus();
 }
 function hasSeen(key){if(seen.has(key))return true;try{return sessionStorage.getItem(key)==='1'}catch{return false}}
 function remember(key){seen.add(key);try{sessionStorage.setItem(key,'1')}catch{}}
 function eventFor(state,teacher){
  if(state.edition?.archived||!state.started)return null;
  const matches=state.matches||[],standard=matches.filter(m=>!m.third),last=Math.max(0,...standard.map(m=>m.round));
  const final=standard.find(m=>m.round===last),third=matches.find(m=>m.third);
  if(teacher)return state.phase==='finished'&&final?.winner?{id:'podium',icon:'🏆',title:'Temos um campeão!',message:`${final.winner} venceu o campeonato. Parabéns a todos os participantes!`,rank:0,kind:'podium'}:null;
  const id=state.player_id;if(!id||state.disqualified)return null;
  const participated=m=>m&&(m.p1_id===id||m.p2_id===id),won=m=>m?.winner_id===id;
  if(participated(final)&&final.winner_id){
   const rank=won(final)?1:2;
   return {id:'final-'+final.id,icon:rank===1?'🏆':'🥈',title:rank===1?'Você é o campeão!':'Você conquistou o segundo lugar!',message:rank===1?'Seu conhecimento levou você ao topo. Parabéns pela conquista!':'Uma grande campanha até a final. Parabéns pela conquista!',rank,kind:'podium'};
  }
  if(participated(third)&&won(third))return {id:'third-'+third.id,icon:'🥉',title:'O terceiro lugar é seu!',message:'Você conquistou um lugar no pódio. Parabéns pela sua campanha!',rank:3,kind:'podium'};
  const win=standard.filter(m=>participated(m)&&won(m)&&m.round<last).sort((a,b)=>b.round-a.round)[0];
  if(!win)return null;
  if(!state.active&&matches.some(m=>participated(m)&&m.round>win.round&&!m.winner_id&&m.p1_id&&m.p2_id))return null;
  const eliminated=matches.some(m=>participated(m)&&m.round>win.round&&m.winner_id&&!won(m));
  if(eliminated)return null;
  const bye=!win.p1_id||!win.p2_id;
  return {id:'round-'+win.id,icon:bye?'✨':'🎉',title:bye?'Você está classificado!':'Você venceu a rodada!',message:state.active?'Seu próximo duelo já começou. Boa sorte!':'Próxima etapa garantida. Aguarde seu adversário e prepare-se para o próximo desafio.',rank:null,kind:'round'};
 }
 function resetWaiting(){
  el('waiting-title').textContent='Sala de espera';el('waiting').classList.remove('winner-waiting');el('winner-emblem').hidden=true;el('winner-rank').hidden=true;
 }
 function onState(state,{teacher=false}={}){
  if(!teacher)resetWaiting();
  if(state.review){return}
  if(state.disqualified||state.edition?.archived){clear();return}
  const event=eventFor(state,teacher);if(!event)return;
  if(!teacher&&!state.active){
   el('waiting').classList.add('winner-waiting');el('winner-emblem').hidden=false;el('winner-emblem').textContent=event.icon;
   el('waiting-title').textContent=event.title;el('waiting-text').textContent=event.message;
   el('winner-rank').hidden=!event.rank;el('winner-rank').textContent=event.rank?`${event.rank}º LUGAR`:'';
  }
  const key=`champions-celebration:${state.edition?.id||'legacy'}:${teacher?'teacher':state.player_id}:${event.id}`;
  if(hasSeen(key))return;remember(key);
  el('celebration-icon').textContent=event.icon;el('celebration-title').textContent=event.title;el('celebration-message').textContent=event.message;
  el('celebration-toast').dataset.kind=event.kind;el('celebration-toast').hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('celebration-toast').hidden=true,state.active?4500:7000);
  confetti(event.kind==='podium');
 }
 function stopConfetti(){
  if(animation!==null)cancelAnimationFrame(animation);animation=null;
  const canvas=el('celebration-canvas');canvas.hidden=true;canvas.getContext?.('2d')?.clearRect(0,0,canvas.width,canvas.height);
 }
 function confetti(final=false){
  stopConfetti();if(reducedMotion()||document.hidden)return;
  const canvas=el('celebration-canvas'),context=canvas.getContext('2d');if(!context)return;
  const width=window.innerWidth,height=window.innerHeight,ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0);canvas.hidden=false;
  const colors=['#f2c76c','#ffe5a3','#79c9ed','#9ee7c1','#d4a3ee','#ffffff'];
  const particles=Array.from({length:final?150:80},()=>({x:Math.random()*width,y:-Math.random()*height*.65,vx:(Math.random()-.5)*110,vy:90+Math.random()*160,size:4+Math.random()*5,angle:Math.random()*Math.PI,spin:(Math.random()-.5)*7,color:colors[Math.floor(Math.random()*colors.length)]}));
  let started=null,last=null;const duration=final?4800:3200;
  function frame(time){
   if(started===null){started=time;last=time}const dt=Math.min((time-last)/1000,.05);last=time;
   if(time-started>=duration){stopConfetti();return}
   context.clearRect(0,0,width,height);context.globalAlpha=Math.min(1,(duration-(time-started))/700);
   for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;context.save();context.translate(p.x,p.y);context.rotate(p.angle);context.fillStyle=p.color;context.fillRect(-p.size/2,-p.size/2,p.size,p.size*.55);context.restore()}
   animation=requestAnimationFrame(frame);
  }
  animation=requestAnimationFrame(frame);
 }
 function clear(){el('celebration-toast').hidden=true;clearTimeout(toastTimer);stopConfetti()}
 function init(){
  const dialog=el('action-dialog');
  el('action-form').onsubmit=e=>{
   e.preventDefault();if(!pending)return;
   if(pending.input){const input=el('action-input'),value=input.value.trim();input.setCustomValidity(value.length<input.minLength?`Informe pelo menos ${input.minLength} caracteres.`:'');if(!input.reportValidity())return}
   dialog.close('confirmed');
  };
  el('action-input').oninput=()=>el('action-input').setCustomValidity('');
  el('action-cancel').onclick=()=>dialog.close('cancelled');
  dialog.addEventListener('cancel',()=>{dialog.returnValue='cancelled'});
  dialog.addEventListener('close',()=>finish(dialog.returnValue==='confirmed'));
  el('celebration-dismiss').onclick=()=>el('celebration-toast').hidden=true;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopConfetti()});
 }
 return {init,confirm,onState,eventFor,clear};
})();
