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
function renderTeacher(){const players=state.players||[],matches=state.matches||[];
 $('count').textContent=`${players.length} inscritos`;
 $('roster').innerHTML=players.map(p=>`<span class="chip">${esc(p.name)}</span>`).join('')||'Nenhum estudante inscrito.';
 $('start').disabled=state.started||players.length<4;
 $('start').textContent=state.started?'Campeonato em andamento':'Sortear confrontos e iniciar';
 const rounds=[...new Set(matches.filter(m=>!m.third).map(m=>m.round))];
 $('bracket').innerHTML=rounds.map((r,i)=>`<div class="round"><h3>${r===rounds.at(-1)?'🏆 Final':r===rounds.at(-2)?'Semifinais':`Rodada ${r}`}</h3>${matches.filter(m=>m.round===r&&!m.third).map(card).join('')}</div>`).join('')+(matches.some(m=>m.third)?`<div class="round"><h3>🥉 Terceiro lugar</h3>${matches.filter(m=>m.third).map(card).join('')}</div>`:'');
 const final=matches.find(m=>m.round===rounds.at(-1)&&!m.third),third=matches.find(m=>m.third);
 $('podium').innerHTML=final?.winner&&third?.winner?`🥇 ${esc(final.winner)} · 🥈 ${esc(final.winner===final.p1?final.p2:final.p1)} · 🥉 ${esc(third.winner)}`:'O pódio será definido após a final e a disputa pelo terceiro lugar.';
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
