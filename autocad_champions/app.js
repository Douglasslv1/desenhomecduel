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
 if(!state.registered){show('login');if(state.started)$('join-btn').disabled=true;return}
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
 const pending=standard.filter(m=>m.p1&&m.p2&&!m.winner);
 const current=pending.length?Math.min(...pending.map(m=>m.round)):null;
 const labels=r=>r===last?'Final':r===last-1?'Semifinais':r===last-2?'Quartas de final':`Rodada ${r}`;
 const banner=!state.started?`⏳ Aguardando o professor iniciar · ${players.length} participantes inscritos`:
  final?.winner&&third?.winner?'🏆 CAMPEONATO ENCERRADO · Pódio definido!':
  current!==null?`⚔ ${labels(current)} · ${pending.filter(m=>m.round===current).length} confronto(s) em andamento. Os classificados avançam automaticamente ao concluir as 10 perguntas.`:
  '⏳ Aguardando classificação automática e formação da próxima rodada…';
 $('stage-banner').textContent=banner;
 const roundHtml=(r,side)=>`<div class="bracket-col"><h3>${labels(r)}</h3>${standard.filter(m=>m.round===r).filter(m=>side==='left'?m.slot%2===0:m.slot%2===1).map(card).join('')||'<div class="match">Aguardando classificados</div>'}</div>`;
 if(!rounds.length){$('bracket').innerHTML='<div class="podium-pending">A árvore será exibida quando o professor iniciar o campeonato.</div>'}
 else {
  const early=rounds.slice(0,-1);
  const left=early.map(r=>roundHtml(r,'left')).join('');
  const right=early.slice().reverse().map(r=>roundHtml(r,'right')).join('');
  $('bracket').innerHTML=`<div class="bracket-wing left">${left}</div><div class="bracket-center"><h3>🏆 GRANDE FINAL</h3>${final?card(final):'Aguardando final'}<h3>🥉 TERCEIRO LUGAR</h3>${third?card(third):'Aguardando semifinalistas'}</div><div class="bracket-wing right">${right}</div>`;
 }
 if(final?.winner&&third?.winner){
  const runner=final.winner===final.p1?final.p2:final.p1;
  const place=(rank,name,cup,cls)=>`<div class="podium-place ${cls}"><div class="podium-cup">${cup}</div><div class="podium-name">${esc(name)}</div><div class="podium-step">${rank}º</div></div>`;
  $('podium').innerHTML=`<h3>🏆 PÓDIO DOS CAMPEÕES</h3><div class="podium-stands">${place(2,runner,'🥈','second')}${place(1,final.winner,'🏆','first')}${place(3,third.winner,'🥉','third')}</div>`;
 } else $('podium').innerHTML='<h3>🏆 PÓDIO DOS CAMPEÕES</h3><div class="podium-pending">🥇 🥈 🥉<p>O pódio será revelado ao término da final e da disputa de terceiro lugar.</p></div>';
}
function card(m){let name=(p,w)=>`<div class="competitor ${m.winner===p&&p?'win':''}">${esc(p||'A definir')} ${m.winner===p&&p?'✓':''}</div>`;
 return `<div class="match"><small>${m.status==='empty'?'Sem participantes':m.status==='advanced'||m.status==='finished'?'Concluído':m.status==='bye'?'Classificação automática':m.done1&&m.done2?'Concluído':m.p1&&m.p2?'Em disputa':'Aguardando'}</small>${name(m.p1)}<div class="vs">${m.s1??'–'} × ${m.s2??'–'}</div>${name(m.p2)}</div>`}
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
$('teacher-form').onsubmit=async e=>{e.preventDefault();try{const {error:e}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(e)throw e;await refresh()}catch(e){error(e)}};
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
init();
