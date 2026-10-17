const SUPABASE_URL='https://neiohdvunvmgqznmyviz.supabase.co';
const SUPABASE_KEY='sb_publishable_pl5_hDZ-ar6wMJAIVsfggw_svHxW3IZ';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const teacher=new URLSearchParams(location.search).has('professor');
let state=null,busy=false,pollingId=null,timerId=null,deadlineAt=0,lastExpiryRefresh=0;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=id=>['login','waiting','quiz','teacher-login','teacher'].forEach(x=>$(x).hidden=x!==id);
const error=e=>{console.error(e);$('message').textContent=e.message||String(e)};
async function rpc(fn,args={}){const {data,error:e}=await db.rpc(fn,args);if(e)throw e;return data}
function startPolling(){if(pollingId===null)pollingId=setInterval(()=>{if(!busy)refresh().catch(error)},2500)}
async function init(){try{
 const {data:{session}}=await db.auth.getSession();
 if(teacher){if(!session||session.user.is_anonymous){show('teacher-login');return}}else if(!session){const {error:e}=await db.auth.signInAnonymously();if(e)throw e}
 await refresh();startPolling();
 }catch(e){error(e);if(teacher)show('teacher-login');else show('login')}}
async function refresh(){state=await rpc('ac_state');$('message').textContent='';
 deadlineAt=state.active?.deadline?performance.now()+Math.max(0,Date.parse(state.active.deadline)-Date.parse(state.server_now)):0;
 if(teacher){if(!state.admin){show('teacher-login');$('message').textContent='Esta conta não está autorizada como professor.';return}show('teacher');renderTeacher();return}
 if(!state.registered){show('login');$('join-btn').disabled=!!state.started;return}
 if(state.disqualified){show('waiting');$('waiting-text').textContent='Você foi desclassificado desta edição. Procure o professor para mais informações.';return}
 const active=state.active;if(!active){show('waiting');$('waiting-text').textContent=state.phase==='leveling'?'Nivelamento concluído. Aguarde o professor formar os confrontos por desempenho.':state.phase==='finished'?'Campeonato encerrado! Confira o pódio no painel do professor.':state.started?'Aguardando classificação ou próxima rodada. Confira a árvore no projetor.':'Inscrição confirmada! Aguardando o professor iniciar o nivelamento.';return}
 show('quiz');renderQuiz();}
function renderTeacher(){
 const players=state.players||[],matches=state.matches||[];
 $('count').textContent=`${players.length} inscritos`;
 $('roster').innerHTML=players.map(p=>`<div class="player-row"><span>${esc(p.name)}${p.disqualified?' · Desclassificado':''}</span><span class="muted">${p.level_score==null?'Aguardando nivelamento':`${p.level_score} acertos · ${Math.max(0,(p.level_answered||0)-p.level_score)} erros/tempo esgotado · ${p.level_answered||0}/10 respondidas${p.level_done?' · Concluído':''}`}</span>${p.can_disqualify?`<button type="button" class="disqualify" data-player="${esc(p.id)}">Desclassificar</button>`:p.disqualified?`<span class="muted" title="${esc(p.reason)}">${esc(p.reason)}</span>`:''}</div>`).join('')||'Nenhum estudante inscrito.';
 $('start').disabled=state.started||players.filter(p=>!p.disqualified).length<4||busy||state.api_version!==2;
 if(state.api_version!==2)$('message').textContent='Para iniciar uma nova edição, aplique competition-v2.sql no Supabase e atualize a página.';
 $('start').hidden=!!state.started;
 $('start').textContent='Iniciar nivelamento';
 $('knockout').hidden=state.phase!=='leveling';
 $('knockout').disabled=!state.leveling?.ready||busy;
 $('level-summary').hidden=state.phase!=='leveling';
 $('level-summary').textContent=state.phase==='leveling'?`${state.leveling?.done||0} de ${state.leveling?.total||0} participantes habilitados concluíram. Dez questões iguais para todos · 1min30s por questão. O mata-mata será organizado por acertos; tempo total desempata resultados iguais.`:'';
 const standard=matches.filter(m=>!m.third),rounds=[...new Set(standard.map(m=>m.round))].sort((a,b)=>a-b);
 const last=rounds.at(-1),final=standard.find(m=>m.round===last),third=matches.find(m=>m.third);
 $('reset').hidden=!state.started;
 $('reset').disabled=busy;
 if(final?.winner&&third?.winner)$('start').textContent='Campeonato encerrado';
 const pending=standard.filter(m=>m.p1&&m.p2&&!m.winner);
 const current=pending.length?Math.min(...pending.map(m=>m.round)):null;
 const labels=r=>r===last?'Final':r===last-1?'Semifinais':r===last-2?'Quartas de final':r===last-3?'Oitavas de final':r===last-4?'Fase de 32':`Rodada ${r}`;
 const banner=!state.started?`⏳ Inscrições abertas · ${players.length} participantes inscritos`:
  state.phase==='leveling'?'📝 NIVELAMENTO · Todos respondem às mesmas dez questões':
  state.phase==='finished'||final?.winner&&third?.winner?'🏆 CAMPEONATO ENCERRADO':
  current!==null?`⚔ ${labels(current)} · ${pending.filter(m=>m.round===current).length} confronto(s) em andamento. Os classificados avançam automaticamente ao concluir as 10 perguntas.`:
  '⏳ Aguardando classificação automática e formação da próxima rodada…';
 $('stage-banner').textContent=banner;
 if(!rounds.length){$('bracket').innerHTML='<div class="podium-pending">A árvore será formada após o nivelamento, com a primeira rodada entre estudantes com resultados próximos.</div>'}
 else {
  const leaves=standard.filter(m=>m.round===rounds[0]).length;
  const tree=rounds.slice().reverse().map(r=>{
   const span=2**(r-rounds[0]);
   const nodes=standard.filter(m=>m.round===r).sort((a,b)=>a.slot-b.slot).map(m=>
    `<div class="tree-node ${r===last?'tree-final':''}" style="grid-column:${m.slot*span+1} / span ${span}"><div class="tree-card"><div class="match-number">${r===last?'🏆 Grande final':`Confronto ${m.slot+1}`}</div>${card(m)}</div></div>`).join('');
   return `<section class="tree-round ${r===current?'current-round':''}" style="--round-slots:${leaves/span}"><h3>${labels(r)}${r===current?' · Em andamento':''}</h3><div class="tree-row" style="grid-template-columns:repeat(${leaves},minmax(0,1fr))">${nodes}</div></section>`;
  }).join('');
  $('bracket').innerHTML=`<p class="tree-help">DA BASE AO TOPO <span>↑</span> Acompanhe o caminho até a grande final</p><div class="tree-scroll"><div class="tree-canvas">${tree}</div></div><aside class="third-place"><h3>🥉 Disputa de terceiro lugar</h3><p class="muted">Entre os dois perdedores das semifinais</p>${third?card(third):'Aguardando semifinalistas'}</aside>`;
 }
 if(final?.winner&&(third?.winner||state.phase==='finished')){
  const firstWon=final.winner_id?final.winner_id===final.p1_id:final.winner===final.p1;
  const runner=(firstWon?final.dq2:final.dq1)?'Não atribuído':firstWon?final.p2:final.p1;
  const place=(rank,name,cup,cls)=>`<div class="podium-place ${cls}"><div class="podium-cup">${cup}</div><div class="podium-name">${esc(name)}</div><div class="podium-step">${rank}º</div></div>`;
  $('podium').innerHTML=`<h3>🏆 PÓDIO DOS CAMPEÕES</h3><div class="podium-stands">${place(2,runner||'Não atribuído','🥈','second')}${place(1,final.winner,'🏆','first')}${place(3,third?.winner||'Não atribuído','🥉','third')}</div>`;
 } else $('podium').innerHTML='<h3>🏆 PÓDIO DOS CAMPEÕES</h3><div class="podium-pending">🥇 🥈 🥉<p>O pódio será revelado ao término da final e da disputa de terceiro lugar.</p></div>';
}
function card(m){const bye=!!m.winner&&(!m.p1||!m.p2);const name=(p,score,id,dq)=>{const win=p&&(m.winner_id?m.winner_id===id:m.winner===p);return `<div class="competitor ${win?'win':''} ${dq?'disqualified':''}"><span title="${esc(p||(bye?'Sem adversário':'A definir'))}">${esc(p||(bye?'Sem adversário':'A definir'))}</span><strong>${dq?'DQ':p?(score??'–'):''}${win?' ✓':''}</strong></div>`};
 return `<div class="match ${bye?'automatic':''}"><small>${m.status==='empty'?'Sem vencedor habilitado':m.winner&&(m.dq1||m.dq2)?'Vitória por desclassificação':bye?'Classificação automática':m.winner?'Concluído':m.p1&&m.p2?'Em disputa':'Aguardando classificados'}</small>${name(m.p1,m.s1,m.p1_id,m.dq1)}${name(m.p2,m.s2,m.p2_id,m.dq2)}</div>`}
function renderQuiz(){const a=state.active,qs=state.questions||[],answered=state.answers||[];const next=qs.find(q=>!answered.some(x=>x.id===q.id));
 const match=state.matches.find(m=>m.id===(a.match_id||a.id));
 $('quiz-title').textContent=a.stage==='leveling'?'Etapa de nivelamento':'Duelo em andamento';
 $('duel').textContent=a.stage==='leveling'?'Dez questões iguais para todos':`Rodada ${a.round} · ${match?.p1||''} × ${match?.p2||''}`;
 $('progress').textContent=`${a.position?a.position-1:answered.length} / 10 respondidas · ${a.score??answered.filter(x=>x.correct).length} acertos`;
 if(!next){$('question').textContent='Você terminou as 10 questões. Aguarde seu adversário concluir.';$('options').innerHTML='';return}
 $('question').textContent=next.q;
 $('options').innerHTML=next.op.map((o,i)=>`<button class="option" data-choice="${i}">${esc(o)}</button>`).join('');
 $('options').querySelectorAll('button').forEach(b=>b.onclick=()=>answer(a.id,next.id,Number(b.dataset.choice)));
 if(timerId===null)timerId=setInterval(updateTimer,250);
 updateTimer();
}
function updateTimer(){
 if(!deadlineAt||!state?.active){$('question-timer').hidden=true;return}
 const remaining=Math.max(0,Math.ceil((deadlineAt-performance.now())/1000));
 $('question-timer').hidden=false;
 $('question-timer').textContent=`Tempo restante: ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
 $('question-timer').classList.toggle('urgent',remaining<=15);
 if(remaining===0){
  $('options').querySelectorAll('button').forEach(b=>b.disabled=true);
  if(!busy&&performance.now()-lastExpiryRefresh>1000){lastExpiryRefresh=performance.now();refresh().catch(error)}
 }
}
async function answer(match,question,choice){if(busy)return;busy=true;$('options').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{const r=await rpc(state.api_version===2?'ac_submit':'ac_answer',state.api_version===2?{p_run:match,p_question:question,p_choice:choice}:{p_match:match,p_question:question,p_choice:choice});$('feedback').textContent=r.expired?'Tempo esgotado. A resposta não foi aceita.':r.correct?'✓ Resposta correta!':'✕ Resposta incorreta.';await refresh();setTimeout(()=>$('feedback').textContent='',1800)}catch(e){try{await refresh()}catch{}error(e)}finally{busy=false}}
$('join').onsubmit=async e=>{e.preventDefault();try{await rpc('ac_join',{p_name:$('name').value.trim()});await refresh()}catch(e){error(e)}};
$('start').onclick=async()=>{if(busy||!confirm('Iniciar o nivelamento? As inscrições serão encerradas e todos terão dez questões, com 1min30s por questão. O relógio começa agora para todos os inscritos.'))return;busy=true;try{await rpc('ac_start');await refresh()}catch(e){error(e)}finally{busy=false}};
$('knockout').onclick=async()=>{if(busy||!confirm('Formar o mata-mata por desempenho? As vagas automáticas serão atribuídas aos melhores resultados. O tempo das primeiras partidas começa assim que forem formadas.'))return;busy=true;try{await rpc('ac_start_knockout');await refresh()}catch(e){error(e)}finally{busy=false}};
$('roster').onclick=async e=>{
 const button=e.target.closest('button[data-player]');if(!button||busy)return;
 const player=state.players.find(p=>p.id===button.dataset.player);if(!player)return;
 const reason=prompt(`Motivo da desclassificação de ${player.name} (3 a 500 caracteres):`);
 if(reason===null)return;
 if(reason.trim().length<3||reason.trim().length>500){error({message:'Informe um motivo entre 3 e 500 caracteres.'});return}
 if(!confirm(`Desclassificar ${player.name}? Esta ação não pode ser desfeita pelo painel. No mata-mata, o adversário habilitado avança.\nMotivo: ${reason.trim()}`))return;
 busy=true;button.disabled=true;
 try{await rpc('ac_disqualify',{p_player:player.id,p_reason:reason.trim()});await refresh()}catch(e){error(e)}finally{busy=false;button.disabled=false}
};
$('reset').onclick=async()=>{
 if(busy||!confirm('Arquivar este campeonato e abrir uma nova edição? Os participantes deverão se inscrever novamente. As perguntas e o acesso do professor serão mantidos.'))return;
 busy=true;$('reset').disabled=true;
 try{await rpc('ac_reset');await refresh()}catch(e){error(e)}finally{busy=false;$('reset').disabled=false}
};
$('teacher-form').onsubmit=async e=>{e.preventDefault();try{const {error:e}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(e)throw e;await refresh();startPolling()}catch(e){error(e)}};
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
function projection(enabled){document.body.classList.toggle('projection-mode',enabled);$('projection').setAttribute('aria-pressed',String(enabled))}
$('projection').onclick=()=>projection(true);
$('projection-exit').onclick=()=>projection(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')projection(false)});
init();
