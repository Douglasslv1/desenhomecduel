const SUPABASE_URL='https://neiohdvunvmgqznmyviz.supabase.co';
const SUPABASE_KEY='sb_publishable_pl5_hDZ-ar6wMJAIVsfggw_svHxW3IZ';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const teacher=new URLSearchParams(location.search).has('professor');
let editionId=null;
let state=null,busy=false,pollingId=null,timerId=null,deadlineAt=0,lastExpiryRefresh=0,renderedPhase=null,refreshVersion=0;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=id=>['login','waiting','quiz','teacher-login','teacher','portal','entry','bank-editor','practice-menu','practice-quiz','practice-result'].forEach(x=>$(x).hidden=x!==id);
const error=e=>{console.error(e);$('message').textContent=e.message||String(e)};
async function confirmAction(message,options={}){return (await window.ChampionsExperience.confirm({message,...options})).confirmed}
async function rpc(fn,args={}){
 const scoped=fn.startsWith('ac_')&&editionId;
 if(fn.startsWith('ac_')&&!editionId)throw Error('Selecione um campeonato primeiro.');
 const {data,error:e}=await db.rpc(scoped?'cp_rpc':fn,scoped?{p_edition:editionId,p_action:fn,p_args:args}:args);if(e)throw e;return data}
function startPolling(){if(pollingId===null)pollingId=setInterval(()=>{if(!busy)refresh().catch(error)},2500)}
async function init(){try{
 const {data:{session}}=await db.auth.getSession();
 if(teacher){if(!session||session.user.is_anonymous){show('teacher-login');return}}else if(!session){const {error:e}=await db.auth.signInAnonymously();if(e)throw e}
 await openPlatform();startPolling();
 }catch(e){error(e);if(teacher)show('teacher-login');else show('entry')}}
async function refresh(){const requestedEdition=editionId,version=++refreshVersion,next=await rpc('ac_state');
 if(requestedEdition!==editionId||version!==refreshVersion)return;
 state=next;$('message').textContent='';
 if(state.edition){$('edition-title').textContent=`${state.edition.discipline} · ${state.edition.name}`;$('edition-context').hidden=false;$('edition-code').textContent=`Código: ${state.edition.code}`}
 deadlineAt=state.active?.deadline?performance.now()+Math.max(0,Date.parse(state.active.deadline)-Date.parse(state.server_now)):0;
 if(teacher){if(!state.admin){show('teacher-login');$('message').textContent='Esta conta não está autorizada como professor.';return}show('teacher');renderTeacher();window.ChampionsExperience?.onState(state,{teacher:true});return}
 if(!state.registered){show('login');$('join-btn').disabled=!!state.started;return}
 if(state.disqualified){show('waiting');window.ChampionsExperience?.onState(state);$('waiting-text').textContent='Você foi desclassificado desta edição. Procure o professor para mais informações.';return}
 const active=state.active;if(!active){show('waiting');$('waiting-text').textContent=state.phase==='leveling'?'Nivelamento concluído. Aguarde o professor formar os confrontos por desempenho.':state.phase==='finished'?'Campeonato encerrado! Confira o pódio no painel do professor.':state.started?'Aguardando classificação ou próxima rodada. Confira a árvore no projetor.':'Inscrição confirmada! Aguardando o professor iniciar o nivelamento.';window.ChampionsExperience?.onState(state);return}
 show('quiz');renderQuiz();window.ChampionsExperience?.onState(state);}
function renderTeacher(){
 $('question-report-open').hidden=state.phase!=='finished'||!state.admin;
 const players=state.players||[],matches=state.matches||[];
 const archived=!!state.edition?.archived;
 if(archived)players.forEach(p=>p.can_disqualify=false);
 if(renderedPhase!==state.phase){$('participants-details').open=!['knockout','finished'].includes(state.phase);renderedPhase=state.phase}
 $('teacher').classList.toggle('leveling-phase',state.phase==='leveling');
 $('count').textContent=`${players.length} inscritos`;
 const levelTotal=state.leveling_question_count||20;
 $('roster').innerHTML=players.map(p=>`<div class="player-row"><span>${esc(p.name)}${p.disqualified?' · Desclassificado':''}</span><span class="muted">${p.level_score==null?'Aguardando nivelamento':`${p.level_score} acertos · ${Math.max(0,(p.level_answered||0)-p.level_score)} erros/tempo esgotado · ${p.level_answered||0}/${levelTotal} respondidas${p.level_done?' · Concluído':''}`}</span>${p.can_disqualify?`<button type="button" class="disqualify" data-player="${esc(p.id)}">Desclassificar</button>`:p.disqualified?`<span class="muted" title="${esc(p.reason)}">${esc(p.reason)}</span>`:''}</div>`).join('')||'Nenhum estudante inscrito.';
 $('start').disabled=archived||state.started||players.filter(p=>!p.disqualified).length<4||busy||state.api_version!==2;
 if(state.api_version!==2)$('message').textContent='Para iniciar uma nova edição, aplique competition-v2.sql no Supabase e atualize a página.';
 $('start').hidden=!!state.started;
 $('start').textContent='Iniciar nivelamento';
 $('knockout').hidden=state.phase!=='leveling';
 $('knockout').disabled=!state.leveling?.ready||busy||archived;
 $('level-summary').hidden=state.phase!=='leveling';
 $('level-summary').textContent=state.phase==='leveling'?`${state.leveling?.done||0} de ${state.leveling?.total||0} participantes habilitados concluíram. ${levelTotal} questões iguais para todos · 1min30s por questão. No mata-mata são dez questões por duelo. O tempo total desempata resultados iguais.`:'';
 const standard=matches.filter(m=>!m.third),rounds=[...new Set(standard.map(m=>m.round))].sort((a,b)=>a-b);
 const last=rounds.at(-1),final=standard.find(m=>m.round===last),third=matches.find(m=>m.third);
 $('reset').hidden=archived;
 $('reset').textContent='Arquivar esta edição';
 $('reset').disabled=busy;
 if(final?.winner&&third?.winner)$('start').textContent='Campeonato encerrado';
 const pending=standard.filter(m=>m.p1&&m.p2&&!m.winner);
 const current=pending.length?Math.min(...pending.map(m=>m.round)):null;
 const labels=r=>r===last?'Final':r===last-1?'Semifinais':r===last-2?'Quartas de final':r===last-3?'Oitavas de final':r===last-4?'Fase de 32':`Rodada ${r}`;
 const banner=archived?'EDIÇÃO ARQUIVADA · Resultados preservados':!state.started?`⏳ Inscrições abertas · ${players.length} participantes inscritos`:
  state.phase==='leveling'?`📝 NIVELAMENTO · Todos respondem às mesmas ${levelTotal} questões`:
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
function card(m){const bye=!!m.winner&&(!m.p1||!m.p2);const name=(p,score,id,dq)=>{const win=p&&(m.winner_id?m.winner_id===id:m.winner===p);
 const canDisqualify=teacher&&state?.admin&&!m.winner&&m.status==='waiting'&&!dq&&state.players?.some(player=>player.id===id&&player.can_disqualify);
 const action=canDisqualify?`<button type="button" class="card-disqualify" data-player="${esc(id)}" aria-label="Desclassificar ${esc(p)}" title="Desclassificar ${esc(p)}" ${busy?'disabled':''}>Desclassificar</button>`:'';
 return `<div class="competitor ${win?'win':''} ${dq?'disqualified':''}"><div class="competitor-identity"><span title="${esc(p||(bye?'Sem adversário':'A definir'))}">${esc(p||(bye?'Sem adversário':'A definir'))}</span>${action}</div><strong>${dq?'DQ':p?(score??'–'):''}${win?' ✓':''}</strong></div>`};
 return `<div class="match ${bye?'automatic':''}"><small>${m.status==='empty'?'Sem vencedor habilitado':m.winner&&(m.dq1||m.dq2)?'Vitória por desclassificação':bye?'Classificação automática':m.winner?'Concluído':m.p1&&m.p2?'Em disputa':'Aguardando classificados'}</small>${name(m.p1,m.s1,m.p1_id,m.dq1)}${name(m.p2,m.s2,m.p2_id,m.dq2)}</div>`}
function renderQuiz(){
 $('question-next').hidden=!state.review;
 if(state.review){const f=state.review,a=state.active;
  $('quiz-title').textContent=a.stage==='leveling'?'Etapa de nivelamento':'Duelo em andamento';
  $('duel').textContent='Confira sua resposta';
  $('progress').textContent=`Questão ${a.position-1} de ${a.total} · ${a.score} acertos`;
  $('question').textContent=f.statement;$('options').innerHTML=reviewOptions(f);
  $('feedback').textContent=reviewMessage(f);$('question-timer').hidden=true;
  $('question-next').textContent=a.position>a.total?'Concluir etapa →':'Próxima questão →';return;
 }
 $('feedback').textContent='';
 const a=state.active,qs=state.questions||[],answered=state.answers||[];const next=qs.find(q=>!answered.some(x=>x.id===q.id));
 const match=state.matches.find(m=>m.id===(a.match_id||a.id));
 $('quiz-title').textContent=a.stage==='leveling'?'Etapa de nivelamento':'Duelo em andamento';
 const total=a.total||(a.stage==='leveling'?20:10);
 $('duel').textContent=a.stage==='leveling'?`${total} questões iguais para todos`:`Rodada ${a.round} · ${match?.p1||''} × ${match?.p2||''}`;
 $('progress').textContent=`${a.position?a.position-1:answered.length} / ${total} respondidas · ${a.score??answered.filter(x=>x.correct).length} acertos`;
 if(!next){$('question').textContent=`Você terminou as ${total} questões. Aguarde seu adversário concluir.`;$('options').innerHTML='';return}
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
 try{await rpc(state.api_version===2?'ac_submit':'ac_answer',state.api_version===2?{p_run:match,p_question:question,p_choice:choice}:{p_match:match,p_question:question,p_choice:choice});await refresh()}catch(e){try{await refresh()}catch{}error(e)}finally{busy=false}}
$('join').onsubmit=async e=>{e.preventDefault();try{await rpc('ac_join',{p_name:$('name').value.trim()});await refresh()}catch(e){error(e)}};
$('start').onclick=async()=>{if(busy||!await confirmAction('As inscrições serão encerradas e todos terão 20 questões, com 1min30s por questão. O relógio começa agora para todos os inscritos. No mata-mata são dez questões por duelo.',{title:'Iniciar o nivelamento?',confirmLabel:'Iniciar nivelamento'}))return;busy=true;try{await rpc('ac_start');await refresh()}catch(e){error(e)}finally{busy=false}};
$('knockout').onclick=async()=>{if(busy||!await confirmAction('Os confrontos serão formados por desempenho. As vagas automáticas serão atribuídas aos melhores resultados e o relógio das primeiras partidas começa assim que forem formadas.',{title:'Vamos para o mata-mata?',confirmLabel:'Formar confrontos'}))return;busy=true;try{await rpc('ac_start_knockout');await refresh()}catch(e){error(e)}finally{busy=false}};
async function handleDisqualification(e){
 if(!teacher||!state?.admin)return;
 const button=e.target.closest('button[data-player]');if(!button||busy)return;
 const player=state.players.find(p=>p.id===button.dataset.player);if(!player?.can_disqualify)return;
 const decision=await window.ChampionsExperience.confirm({title:`Desclassificar ${player.name}?`,message:'O adversário habilitado avança no mata-mata. Esta ação não pode ser desfeita pelo painel. Registre o motivo para confirmar.',confirmLabel:'Desclassificar jogador',danger:true,input:true,inputLabel:'Motivo da desclassificação',minLength:3,maxLength:500});
 if(!decision.confirmed)return;
 const reason=decision.value;
 busy=true;button.disabled=true;
 try{await rpc('ac_disqualify',{p_player:player.id,p_reason:reason.trim()});await refresh()}catch(e){error(e)}finally{busy=false;button.disabled=false}
}
$('roster').onclick=handleDisqualification;
$('bracket').onclick=handleDisqualification;
$('reset').onclick=async()=>{
 if(busy||!await confirmAction('Os resultados serão preservados e novas respostas serão bloqueadas. Você poderá criar outra edição na página da disciplina.',{title:'Arquivar esta edição?',confirmLabel:'Arquivar edição',danger:true}))return;
 busy=true;$('reset').disabled=true;
 try{await rpc('cp_archive',{p_edition:editionId});await refresh()}catch(e){error(e)}finally{busy=false;$('reset').disabled=false}
};
$('teacher-form').onsubmit=async e=>{e.preventDefault();try{const {error:e}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(e)throw e;await openPlatform();startPolling()}catch(e){error(e)}};
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
function projection(enabled){document.body.classList.toggle('projection-mode',enabled);$('projection').setAttribute('aria-pressed',String(enabled))}
$('projection').onclick=()=>projection(true);
$('projection-exit').onclick=()=>projection(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')projection(false)});
function reviewMessage(f){return f.timed_out?'Tempo esgotado. Confira a resposta correta em verde.':f.correct?'✓ Você acertou!':'✕ Você errou. Confira a resposta correta em verde.'}
function reviewOptions(f){return (f.options||[]).map((option,i)=>{
 const correct=i===f.correct_choice,selected=i===f.choice;
 return `<button type="button" class="option ${correct?'answer-correct':selected?'answer-incorrect':''}" disabled>${esc(option)}${correct?' <strong>✓ Correta</strong>':selected?' <strong>✕ Sua resposta</strong>':''}</button>`;
}).join('')}
$('question-next').onclick=async()=>{if(busy||!state?.review)return;busy=true;$('question-next').disabled=true;
 try{await rpc('ac_continue',{p_run:state.active.id,p_question:state.review.question_id});await refresh()}catch(e){error(e)}finally{busy=false;$('question-next').disabled=false}
};
// platform.js instala os controles de disciplinas e então inicia a aplicação.
let questionReportVersion=0;
function closeQuestionReport(){questionReportVersion++;if($('question-report-dialog').open)$('question-report-dialog').close()}
async function loadQuestionReport(){
 const requestedEdition=editionId,version=++questionReportVersion,stage=$('question-report-stage').value;
 $('question-report-status').textContent='Preparando a revisão da turma…';$('question-report-list').innerHTML='';
 $('question-report-stage').disabled=true;
 try{
  const report=await rpc('cp_question_report',{p_edition:requestedEdition,p_stage:stage});
  if(version!==questionReportVersion||requestedEdition!==editionId)return;
  $('question-report-context').textContent=report.edition;
  $('question-report-status').textContent=`${report.attempts} respostas · ${report.correct} acertos · ${report.wrong} erros de alternativa · ${report.timed_out} por tempo esgotado`;
  $('question-report-list').innerHTML=report.questions.length?report.questions.map((q,i)=>`<article class="question-report-card"><div class="question-report-rank">${i+1}ª MAIS ERRADA · QUESTÃO ${esc(q.id)}</div><h3>${esc(q.statement)}</h3><p class="question-report-stats"><strong>${q.misses} de ${q.attempts} sem acerto (${q.miss_rate}%)</strong><br>${q.wrong} erros de alternativa · ${q.timed_out} por tempo esgotado · ${q.correct} acertos · ${q.students} participantes</p><ol type="A">${q.options.map((option,j)=>`<li class="${j===q.correct_choice?'report-correct':''}">${esc(option.replace(/^[A-E]\)\s*/,''))}${j===q.correct_choice?' <strong>✓ Resposta correta</strong>':''}</li>`).join('')}</ol></article>`).join(''):'<p class="question-report-empty">Nenhuma questão com erro ou tempo esgotado nesta etapa. Todos acertaram as respostas registradas!</p>';
  if(!report.attempts)$('question-report-list').innerHTML='<p class="question-report-empty">Não há respostas registradas nesta etapa.</p>';
 }catch(e){if(version===questionReportVersion)$('question-report-status').textContent=e.message||'Não foi possível carregar o relatório.'}
 finally{if(version===questionReportVersion)$('question-report-stage').disabled=false}
}
$('question-report-open').onclick=()=>{if(!teacher||!state?.admin||state.phase!=='finished')return;
 $('question-report-stage').value='all';$('question-report-context').textContent='';$('question-report-dialog').showModal();loadQuestionReport();
};
$('question-report-stage').onchange=loadQuestionReport;
$('question-report-close').onclick=closeQuestionReport;
$('question-report-dialog').oncancel=()=>{questionReportVersion++};
