let catalog=null,disciplineId=null,editingBank=null,bankQuestions=[],teacherAccounts=[];
document.body.classList.toggle('teacher-view',teacher);
const phaseLabel=phase=>({registration:'Inscrições abertas',leveling:'Nivelamento',knockout:'Mata-mata',finished:'Encerrado'}[phase]||phase);
function entryUrl(code,professor=false){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('campeonato',code);if(professor)url.searchParams.set('professor','true');return url.href}
function stopEdition(){editionId=null;state=null;deadlineAt=0;renderedPhase=null;window.ChampionsExperience?.clear();projection(false);$('edition-context').hidden=true}
async function openPlatform(){
 if(new URLSearchParams(location.search).has('simulado')){await loadPractice();return}
 const code=new URLSearchParams(location.search).get('campeonato');
 if(code){const edition=await rpc('cp_resolve',{p_code:code});editionId=edition.id;await refresh();return}
 if(teacher){await loadPortal();return}
 show('entry');
}
async function loadPortal(){
 stopEdition();catalog=await rpc('cp_catalog');
 if(!catalog.owner&&!catalog.disciplines.length){show('teacher-login');const status=await rpc('cp_teacher_account_status');throw Error(status?.active===false?'Seu cadastro de professor está desativado. Procure o superadministrador.':'Esta conta não tem acesso a disciplinas. Solicite acesso ao administrador.')}
 teacherAccounts=catalog.owner?await rpc('cp_teacher_accounts_list'):[];
 if(!catalog.disciplines.some(d=>d.id===disciplineId))disciplineId=null;
 show('portal');renderPortal();
}
function renderPortal(){
 renderTeacherAccounts();
 $('profile-role').textContent=catalog.owner?'SUPERADMINISTRADOR':'PROFESSOR · ACESSO POR DISCIPLINA';
 const discipline=catalog.disciplines.find(d=>d.id===disciplineId);
 $('discipline-grid').innerHTML=catalog.disciplines.map(d=>{
 const count=d.banks.reduce((sum,b)=>sum+b.count,0);
 return `<button type="button" class="discipline-card ${d.id===disciplineId?'selected':''}" data-discipline="${esc(d.id)}"><span class="discipline-symbol">${d.name==='Desenho Mecânico'?'⚙':'◈'}</span><strong>${esc(d.name)}</strong><span>${d.banks.length} banco(s) · ${count} questões</span><small>${count?'Abrir disciplina →':'Aguardando questões'}</small></button>`;
 }).join('');
 $('new-discipline-form').hidden=!catalog.owner;
 $('teacher-access').hidden=!catalog.owner;
 $('teacher-user-id').disabled=!catalog.owner;
 $('teacher-list').innerHTML='';
 $('discipline-workspace').hidden=!discipline;
 if(!discipline)return;
 $('discipline-name').textContent=discipline.name;
 $('bank-grid').innerHTML=discipline.banks.map(b=>`<article class="bank-card"><h4>${esc(b.name)}</h4><p>${b.count} questões · versão ${b.revision}</p><button data-edit-bank="${esc(b.id)}" type="button">Gerenciar questões</button></article>`).join('')||'<p>Nenhum banco criado.</p>';
 $('edition-bank').innerHTML=discipline.banks.map(b=>`<option value="${esc(b.id)}" ${b.count<20?'disabled':''}>${esc(b.name)} · ${b.count} questões${b.count<20?' · mínimo 20':''}</option>`).join('');
 $('create-edition-btn').disabled=!discipline.banks.some(b=>b.count>=20);
 const editions=catalog.editions.filter(e=>e.discipline_id===disciplineId);
 $('edition-list').innerHTML=editions.map(e=>`<article class="edition-card"><div><h4>${esc(e.name)}</h4><p>${e.archived?'Arquivada':esc(phaseLabel(e.phase))} · ${e.players} participantes · banco v${e.bank_revision}</p><span class="code-label">${esc(e.code)}</span></div><div class="edition-actions"><button data-open-edition="${esc(e.id)}" type="button">${e.archived?'Ver resultados':'Abrir painel'}</button>${e.archived?'':`<button data-share-code="${esc(e.code)}" type="button" class="secondary">Link dos estudantes</button>`}</div></article>`).join('')||'<p class="muted">Nenhum campeonato criado. Escolha um banco para abrir a primeira edição.</p>';
 $('teacher-access').hidden=!catalog.owner;
 $('teacher-list').innerHTML='';
 if(catalog.owner)loadTeacherDirectory(discipline.id).catch(error);
}
async function task(fn){if(busy)return;busy=true;$('message').textContent='';try{await fn()}catch(e){error(e)}finally{busy=false}}
function renderTeacherAccounts(){
 const owner=!!catalog?.owner;$('teacher-accounts').hidden=!owner;
 $('teacher-create-toggle').disabled=!owner;
 if(!owner){$('teacher-create-form').hidden=true;$('teacher-create-form').reset();$('teacher-accounts-list').innerHTML='';return}
 $('teacher-create-disciplines').innerHTML=catalog.disciplines.map(d=>`<label class="discipline-check"><input type="checkbox" name="teacher-discipline" value="${esc(d.id)}"> ${esc(d.name)}</label>`).join('');
 $('teacher-accounts-list').innerHTML=(Array.isArray(teacherAccounts)?teacherAccounts:[]).map(t=>`<article class="teacher-account-row"><div><strong>${esc(t.name||t.email)}</strong>${t.name?`<p>${esc(t.email)}</p>`:''}<p class="muted">${esc((t.disciplines||[]).join(' · ')||'Nenhuma disciplina atribuída')}</p><span class="teacher-account-status ${t.active?'active':'inactive'}">${t.superadmin?'Superadministrador':t.active?'Ativo':'Desativado'}</span></div>${t.superadmin?'':`<button type="button" class="secondary" data-teacher-account="${esc(t.id)}" data-activate="${!t.active}">${t.active?'Desativar':'Reativar'}</button>`}</article>`).join('')||'<p class="muted">Nenhum professor cadastrado.</p>';
}
$('teacher-create-toggle').onclick=()=>{if(!catalog?.owner||busy)return;$('teacher-create-form').hidden=!$('teacher-create-form').hidden};
$('teacher-create-cancel').onclick=()=>{$('teacher-create-form').hidden=true;$('teacher-create-form').reset()};
$('teacher-create-form').onsubmit=e=>{e.preventDefault();if(!catalog?.owner)return;task(async()=>{
 const disciplines=Array.from($('teacher-create-disciplines').querySelectorAll('input:checked'),input=>input.value);
 if(!disciplines.length)throw Error('Selecione ao menos uma disciplina para o professor.');
 const submit=$('teacher-create-submit');submit.disabled=true;submit.textContent='Cadastrando…';
 try{
  const {data:{session}}=await db.auth.getSession();if(!session)throw Error('Entre novamente como superadministrador.');
  const response=await fetch('/api/teachers',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({name:$('teacher-create-name').value.trim(),email:$('teacher-create-email').value.trim(),password:$('teacher-create-password').value,disciplines})});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw Error(result?.error||'Não foi possível cadastrar. Verifique se a função de cadastro foi publicada.');
  $('teacher-create-form').reset();$('teacher-create-form').hidden=true;await loadPortal();$('message').textContent=result.message;
 }finally{submit.disabled=false;submit.textContent='Salvar professor'}
})};
$('teacher-accounts-list').onclick=e=>{if(!catalog?.owner)return;const button=e.target.closest('[data-teacher-account]');if(!button)return;task(async()=>{
 const person=(Array.isArray(teacherAccounts)?teacherAccounts:[]).find(t=>t.id===button.dataset.teacherAccount);if(!person||person.superadmin)return;
 const active=button.dataset.activate==='true';
 if(!await confirmAction(active?'O professor voltará a acessar as disciplinas já atribuídas.':'O professor perderá o acesso a todas as disciplinas. Os campeonatos e resultados serão preservados.',{title:`${active?'Reativar':'Desativar'} ${person.name||person.email}?`,confirmLabel:active?'Reativar cadastro':'Desativar cadastro',danger:!active}))return;
 await rpc('cp_teacher_set_active',{p_user:person.id,p_active:active});await loadPortal();
})};
$('discipline-grid').onclick=e=>{const button=e.target.closest('[data-discipline]');if(button){disciplineId=button.dataset.discipline;renderPortal()}};
$('new-discipline-form').onsubmit=e=>{e.preventDefault();task(async()=>{disciplineId=await rpc('cp_create_discipline',{p_name:$('new-discipline-name').value.trim()});$('new-discipline-form').reset();await loadPortal()})};
$('new-bank-form').onsubmit=e=>{e.preventDefault();task(async()=>{await rpc('cp_create_bank',{p_discipline:disciplineId,p_name:$('new-bank-name').value.trim()});$('new-bank-form').reset();await loadPortal()})};
$('new-edition-form').onsubmit=e=>{e.preventDefault();task(async()=>{
 const id=await rpc('cp_create_edition',{p_discipline:disciplineId,p_bank:$('edition-bank').value,p_name:$('new-edition-name').value.trim()});
 $('new-edition-form').reset();editionId=id;await refresh();startPolling();
})};
$('edition-list').onclick=e=>task(async()=>{
 const open=e.target.closest('[data-open-edition]'),share=e.target.closest('[data-share-code]');
 if(open){editionId=open.dataset.openEdition;await refresh();startPolling()}
 if(share){$('share-link').value=entryUrl(share.dataset.shareCode);$('share-dialog').showModal()}
});
$('share-current').onclick=()=>{if(state?.edition){$('share-link').value=entryUrl(state.edition.code);$('share-dialog').showModal()}};
$('share-copy').onclick=()=>task(async()=>{try{await navigator.clipboard.writeText($('share-link').value);$('share-status').textContent='Link copiado.'}catch{$('share-link').select();$('share-status').textContent='Selecione e copie o link acima.'}});
$('share-close').onclick=()=>{$('share-dialog').close();$('share-status').textContent=''};
$('back-platform').onclick=()=>task(async()=>{history.replaceState(null,'',teacher?'?professor=true':location.pathname);await loadPortal()});
$('portal-logout').onclick=()=>task(async()=>{await db.auth.signOut();location.reload()});
$('entry-form').onsubmit=e=>{e.preventDefault();task(async()=>{
 const edition=await rpc('cp_resolve',{p_code:$('entry-code').value.trim()});
 history.replaceState(null,'',entryUrl(edition.code));editionId=edition.id;await refresh();startPolling();
})};
$('teacher-access-form').onsubmit=e=>{e.preventDefault();if(!catalog?.owner)return;task(async()=>{
 await rpc('cp_assign_teacher',{p_discipline:disciplineId,p_identity:$('teacher-user-id').value.trim(),p_allowed:true});$('teacher-access-form').reset();await loadPortal();
})};
$('teacher-list').onclick=e=>task(async()=>{const button=e.target.closest('[data-remove-teacher]');if(button&&await confirmAction('Este professor deixará de acessar os bancos e os campeonatos desta disciplina.',{title:'Retirar acesso do professor?',confirmLabel:'Retirar acesso',danger:true})){await rpc('cp_set_teacher',{p_discipline:disciplineId,p_user:button.dataset.removeTeacher,p_allowed:false});await loadPortal()}});
async function loadTeacherDirectory(id){
 const list=await rpc('cp_teacher_directory',{p_discipline:id});if(id!==disciplineId||!catalog?.owner)return;
 $('teacher-list').innerHTML=list.map(user=>`<li><span>${esc(user.email||user.id)}${user.superadmin?' · Superadministrador':''}</span>${user.superadmin?'':`<button data-remove-teacher="${esc(user.id)}" type="button" class="secondary">Retirar acesso</button>`}</li>`).join('')||'<li>Nenhum professor atribuído. O superadministrador mantém acesso.</li>';
}
async function openBank(id){
 editingBank=id;bankQuestions=await rpc('cp_bank_questions',{p_bank:id});
 const discipline=catalog.disciplines.find(d=>d.id===disciplineId),bank=discipline.banks.find(b=>b.id===id);
 $('bank-editor-title').textContent=bank.name;$('question-form').reset();renderQuestions();show('bank-editor');
}
function renderQuestions(){
 $('bank-question-count').textContent=`${bankQuestions.length} questões · Alterações valem apenas para novas edições.`;
 $('question-list').innerHTML=bankQuestions.map(q=>`<article class="question-record"><h4>${q.id}. ${esc(q.statement.replace(/^\d+\.\s*/,''))}</h4><ol type="A">${q.options.map((op,i)=>`<li ${q.correct===i?'class="correct-answer"':''}>${esc(op.replace(/^[A-E]\)\s*/,''))}${q.correct===i?' ✓':''}</li>`).join('')}</ol><button type="button" data-edit-question="${q.id}" class="secondary">Editar questão</button></article>`).join('')||'<p class="muted">Banco vazio. Adicione as questões abaixo ou importe um arquivo JSON.</p>';
 $('question-number').value=bankQuestions.length?Math.max(...bankQuestions.map(q=>q.id))+1:1;
}
$('bank-grid').onclick=e=>{const button=e.target.closest('[data-edit-bank]');if(button)task(()=>openBank(button.dataset.editBank))};
$('bank-back').onclick=()=>task(loadPortal);
$('question-list').onclick=e=>{const button=e.target.closest('[data-edit-question]');if(!button)return;const q=bankQuestions.find(x=>x.id===Number(button.dataset.editQuestion));$('question-number').value=q.id;$('question-statement').value=q.statement;q.options.forEach((value,i)=>$('question-option-'+i).value=value.replace(/^[A-E]\)\s*/,''));$('question-correct').value=q.correct;$('question-form').scrollIntoView({behavior:'smooth',block:'start'})};
$('question-clear').onclick=()=>{$('question-form').reset();$('question-number').value=bankQuestions.length?Math.max(...bankQuestions.map(q=>q.id))+1:1};
$('question-form').onsubmit=e=>{e.preventDefault();task(async()=>{
 const q={id:Number($('question-number').value),statement:$('question-statement').value.trim(),options:Array.from({length:5},(_,i)=>`${String.fromCharCode(65+i)}) ${$('question-option-'+i).value.trim()}`),correct:Number($('question-correct').value)};
 const exists=bankQuestions.some(x=>x.id===q.id);if(exists&&!await confirmAction('As edições já criadas manterão a versão anterior. O banco será atualizado para os próximos campeonatos.',{title:`Atualizar a questão ${q.id}?`,confirmLabel:'Salvar alterações'}))return;
 await rpc('cp_save_questions',{p_bank:editingBank,p_questions:[q]});await openBank(editingBank);
})};
$('bank-import').onchange=e=>task(async()=>{
 const file=e.target.files[0];if(!file)return;
 try{const data=JSON.parse(await file.text());if(!Array.isArray(data)||!data.length)throw Error('O arquivo deve conter uma lista de questões.');
 if(!await confirmAction('Números existentes serão atualizados e as novas questões serão adicionadas. As edições já criadas serão preservadas.',{title:`Importar ${data.length} questões?`,confirmLabel:'Importar questões'}))return;
 await rpc('cp_save_questions',{p_bank:editingBank,p_questions:data});await openBank(editingBank);
 }finally{e.target.value=''}
});
$('bank-export').onclick=()=>{
 const blob=new Blob([JSON.stringify(bankQuestions,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='banco-questoes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
// Consulta apenas o campeonato selecionado; trocar de disciplina interrompe as consultas da edição anterior.
startPolling=function(){if(pollingId===null)pollingId=setInterval(()=>{if(!busy&&editionId)refresh().catch(error)},2500)};
window.ChampionsExperience.init();
init();
