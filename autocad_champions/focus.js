window.ChampionsFocus=(()=>{
 let away=false,context=null,sending=false,notice=null,storageFailed=false;
 let queue=[];
 try{queue=JSON.parse(sessionStorage.getItem('champions-focus-queue')||'[]');if(!Array.isArray(queue))queue=[]}catch{queue=[]}
 function persist(){try{sessionStorage.setItem('champions-focus-queue',JSON.stringify(queue))}catch{storageFailed=true}}
 function warn(text){
  if(!notice){notice=document.createElement('p');notice.className='focus-warning';notice.setAttribute('role','status');$('quiz').prepend(notice)}
  notice.textContent=text;notice.hidden=false;
 }
 async function flush(){
  if(sending||teacher||!queue.length)return;
  sending=true;
  try{
   while(queue.length){
    const event=queue[0],{error:e}=await db.rpc('cp_record_focus',event);
    if(e)throw e;
    queue.shift();persist();
   }
   if(notice&&!notice.hidden)notice.textContent='Você saiu da aba ou a janela perdeu o foco. Registro enviado ao servidor. O professor avaliará a situação; não há desclassificação automática.';
  }catch(e){console.error('Falha ao registrar perda de foco',e);warn('Você saiu da aba ou a janela perdeu o foco. O registro está pendente de envio; mantenha a conexão e permaneça no confronto.')}
  finally{sending=false}
 }
 function check(kind){
  const lost=document.visibilityState==='hidden'||!document.hasFocus();
  if(!lost){away=false;flush();return}
  if(away||!context)return;
  away=true;
  queue.push({p_edition:context.edition,p_run:context.run,p_event:crypto.randomUUID(),p_kind:kind,p_occurred_at:new Date().toISOString()});persist();
  warn(`Você saiu da aba ou a janela perdeu o foco. A ocorrência será informada ao professor, que avaliará a situação.${storageFailed?' Mantenha esta página aberta para enviar o registro.':''}`);
  flush();
 }
 function sync(){
  const active=!teacher&&!state?.disqualified&&!state?.edition?.archived&&state?.active?.stage==='knockout'?state.active:null;
  const next=active?{edition:editionId,run:active.id}:null;
  if(next?.run!==context?.run||next?.edition!==context?.edition){away=false;if(notice)notice.hidden=true}
  context=next;
  if(context)check(document.visibilityState==='hidden'?'hidden':'blur');
  flush();
 }
 window.addEventListener('blur',()=>check('blur'));
 window.addEventListener('focus',()=>check('blur'));
 document.addEventListener('visibilitychange',()=>check('hidden'));
 window.addEventListener('online',flush);
 return {sync,clear(){context=null;away=false;if(notice)notice.hidden=true}};
})();
