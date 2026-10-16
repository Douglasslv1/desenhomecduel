const SUPABASE_URL='https://neiohdvunvmgqznmyviz.supabase.co';
const SUPABASE_KEY='sb_publishable_pl5_hDZ-ar6wMJAIVsfggw_svHxW3IZ';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const teacher=new URLSearchParams(location.search).has('professor');
let state=null,busy=false,lastMatch=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=id=>['login','waiting','quiz','teacher-login','teacher'].forEach(x=>$(x).hidden=x!==id);
const error=e=>{console.error(e);$('message').textContent=e.message||String(e)};
async function rpc(fn,args={}){const {data,error:e}=await db.rpc(fn,args);if(e)throw e;return data}
async function init(){try{
 const {data:{session}}=await db.auth.getSession();
 if(teacher){if(!session||session.user.is_anonymous){show('teacher-login');return}}else if(!session){const {error:e}=await db.auth.signInAnonymously();if(e)throw e}
 await refresh();setInterval(()=>{if(!busy)refresh().catch(error)},2500);
 }catch(e){error(e);if(teacher)show('teacher-login');else show('login')}}
async function refresh(){state=await rpc('ac_state');$('message').textContent='';
 if(teacher){if(!state.admin){show('teacher-login');$('message').textContent='Esta conta não está autorizada como professor.';return}show('teacher');renderTeacher();return}
 if(!state.registered){show('login');$('join-btn').disabled=!!state.started;return}
 const active=state.active;if(!active){show('waiting');$('waiting-text').textContent=state.started?'Aguardando classificação ou próxima rodada. Confira a árvore no projetor.':'Inscrição confirmada! Aguardando o professor iniciar.';return}
 show('quiz');renderQuiz();}
function renderTeacher(){
 const players=state.players||[],matches=state.matches||[];
 $('count').textContent=`${players.length} inscritos`;
 $('roster').innerHTML=players.map(p=>`<span class="chip">${esc(p.name)}</span>`).join('')||'Nenhum estudante inscrito.';
 $('start').disabled=state.started||players.length<4;
 $('start').textContent=state.started?'Campeonato em andamento':'Sortear confrontos e iniciar';
 const standard=matches.filter(m=>!m.third),rounds=[...new Set(standard.map(m=>m.round))].sort((a,b)=>a-b);
 const last=rounds.at(-1),final=standard.find(m=>m.round===last),third=matches.find(m=>m.third);
 $('reset').hidden=!state.started;
 $('reset').disabled=busy;
 if(final?.winner&&third?.winner)$('start').textContent='Campeonato encerrado';
 const pending=standard.filter(m=>m.p1&&m.p2&&!m.winner);
 const current=pending.length?Math.min(...pending.map(m=>m.round)):null;
 const labels=r=>r===last?'Final':r===last-1?'Semifinais':r===last-2?'Quartas de final':r===last-3?'Oitavas de final':r===last-4?'Fase de 32':`Rodada ${r}`;
 const banner=!state.started?`⏳ Aguardando o professor iniciar · ${players.length} participantes inscritos`:
  final?.winner&&third?.winner?'🏆 CAMPEONATO ENCERRADO · Pódio definido!':
  current!==null?`⚔ ${labels(current)} · ${pending.filter(m=>m.round===current).length} confronto(s) em andamento. Os classificados avançam automaticamente ao concluir as 10 perguntas.`:
  '⏳ Aguardando classificação automática e formação da próxima rodada…';
 $('stage-banner').textContent=banner;
 if(!rounds.length){$('bracket').innerHTML='<div class="podium-pending">A árvore será exibida quando o professor iniciar o campeonato.</div>'}
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
 if(final?.winner&&third?.winner){
  const runner=final.winner===final.p1?final.p2:final.p1;
  const place=(rank,name,cup,cls)=>`<div class="podium-place ${cls}"><div class="podium-cup">${cup}</div><div class="podium-name">${esc(name)}</div><div class="podium-step">${rank}º</div></div>`;
  $('podium').innerHTML=`<h3>🏆 PÓDIO DOS CAMPEÕES</h3><div class="podium-stands">${place(2,runner,'🥈','second')}${place(1,final.winner,'🏆','first')}${place(3,third.winner,'🥉','third')}</div>`;
 } else $('podium').innerHTML='<h3>🏆 PÓDIO DOS CAMPEÕES</h3><div class="podium-pending">🥇 🥈 🥉<p>O pódio será revelado ao término da final e da disputa de terceiro lugar.</p></div>';
}
function card(m){const bye=!!m.winner&&(!m.p1||!m.p2);const name=(p,score)=>`<div class="competitor ${m.winner===p&&p?'win':''}"><span title="${esc(p||(bye?'Sem adversário':'A definir'))}">${esc(p||(bye?'Sem adversário':'A definir'))}</span><strong>${p?(score??'–'):''}${m.winner===p&&p?' ✓':''}</strong></div>`;
 return `<div class="match ${bye?'automatic':''}"><small>${m.status==='empty'?'Sem participantes':bye?'Classificação automática':m.winner?'Concluído':m.p1&&m.p2?'Em disputa':'Aguardando classificados'}</small>${name(m.p1,m.s1)}${name(m.p2,m.s2)}</div>`}
function renderQuiz(){const a=state.active,qs=state.questions||[],answered=state.answers||[];const next=qs.find(q=>!answered.some(x=>x.id===q.id));
 $('duel').textContent=`Rodada ${a.round} · ${esc(state.matches.find(m=>m.id===a.id)?.p1||'')} × ${esc(state.matches.find(m=>m.id===a.id)?.p2||'')}`;
 $('progress').textContent=`${answered.length} / 10 respondidas · ${answered.filter(x=>x.correct).length} acertos`;
 if(!next){$('question').textContent='Você terminou as 10 questões. Aguarde seu adversário concluir.';$('options').innerHTML='';return}
 $('question').textContent=next.q;
 $('options').innerHTML=next.op.map((o,i)=>`<button class="option" data-choice="${i}">${esc(o)}</button>`).join('');
 $('options').querySelectorAll('button').forEach(b=>b.onclick=()=>answer(a.id,next.id,Number(b.dataset.choice)));
}
async function answer(match,question,choice){if(busy)return;busy=true;$('options').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{const r=await rpc('ac_answer',{p_match:match,p_question:question,p_choice:choice});$('feedback').textContent=r.correct?'✓ Resposta correta!':'✕ Resposta incorreta.';await refresh();setTimeout(()=>$('feedback').textContent='',1800)}catch(e){error(e);await refresh()}finally{busy=false}}
$('join').onsubmit=async e=>{e.preventDefault();try{await rpc('ac_join',{p_name:$('name').value.trim()});await refresh()}catch(e){error(e)}};
$('start').onclick=async()=>{if(!confirm('Iniciar o torneio? Novas inscrições serão bloqueadas.'))return;busy=true;try{await rpc('ac_start');await refresh()}catch(e){error(e)}finally{busy=false}};
$('reset').onclick=async()=>{
 if(busy||!confirm('Arquivar este campeonato e abrir uma nova edição? Os participantes deverão se inscrever novamente. As perguntas e o acesso do professor serão mantidos.'))return;
 busy=true;$('reset').disabled=true;
 try{await rpc('ac_reset');await refresh()}catch(e){error(e)}finally{busy=false;$('reset').disabled=false}
};
$('teacher-form').onsubmit=async e=>{e.preventDefault();try{const {error:e}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(e)throw e;await refresh()}catch(e){error(e)}};
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
function projection(enabled){document.body.classList.toggle('projection-mode',enabled);$('projection').setAttribute('aria-pressed',String(enabled))}
$('projection').onclick=()=>projection(true);
$('projection-exit').onclick=()=>projection(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')projection(false)});
init();
