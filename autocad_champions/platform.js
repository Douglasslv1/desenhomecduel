let catalog=null,disciplineId=null,editingBank=null,bankQuestions=[];
document.body.classList.toggle('teacher-view',teacher);
const phaseLabel=phase=>({registration:'Inscrições abertas',leveling:'Nivelamento',knockout:'Mata-mata',finished:'Encerrado'}[phase]||phase);
function entryUrl(code,professor=false){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('campeonato',code);if(professor)url.searchParams.set('professor','true');return url.href}
function stopEdition(){editionId=null;state=null;deadlineAt=0;renderedPhase=null;projection(false);$('edition-context').hidden=true}
async function openPlatform(){
 const code=new URLSearchParams(location.search).get('campeonato');
 if(code){const edition=await rpc('cp_resolve',{p_code:code});editionId=edition.id;await refresh();return}
 if(teacher){await loadPortal();return}
 show('entry');
}
async function loadPortal(){
 stopEdition();catalog=await rpc('cp_catalog');
 if(!catalog.owner&&!catalog.disciplines.length){show('teacher-login');throw Error('Esta conta não tem acesso a disciplinas. Solicite acesso ao administrador.')}
 if(!catalog.disciplines.some(d=>d.id===disciplineId))disciplineId=null;
 show('portal');renderPortal();
}
function renderPortal(){
 const discipline=catalog.disciplines.find(d=>d.id===disciplineId);
 $('discipline-grid').innerHTML=catalog.disciplines.map(d=>{
 const count=d.banks.reduce((sum,b)=>sum+b.count,0);
 return `<button type="button" class="discipline-card ${d.id===disciplineId?'selected':''}" data-discipline="${esc(d.id)}"><span class="discipline-symbol">${d.name==='Desenho Mecânico'?'⚙':'◈'}</span><strong>${esc(d.name)}</strong><span>${d.banks.length} banco(s) · ${count} questões</span><small>${count?'Abrir disciplina →':'Aguardando questões'}</small></button>`;
 }).join('');
 $('new-discipline-form').hidden=!catalog.owner;
 $('discipline-workspace').hidden=!discipline;
 if(!discipline)return;
 $('discipline-name').textContent=discipline.name;
 $('bank-grid').innerHTML=discipline.banks.map(b=>`<article class="bank-card"><h4>${esc(b.name)}</h4><p>${b.count} questões · versão ${b.revision}</p><button data-edit-bank="${esc(b.id)}" type="button">Gerenciar questões</button></article>`).join('')||'<p>Nenhum banco criado.</p>';
 $('edition-bank').innerHTML=discipline.banks.map(b=>`<option value="${esc(b.id)}" ${b.count<10?'disabled':''}>${esc(b.name)} · ${b.count} questões${b.count<10?' · mínimo 10':''}</option>`).join('');
 $('create-edition-btn').disabled=!discipline.banks.some(b=>b.count>=10);
 const editions=catalog.editions.filter(e=>e.discipline_id===disciplineId);
 $('edition-list').innerHTML=editions.map(e=>`<article class="edition-card"><div><h4>${esc(e.name)}</h4><p>${e.archived?'Arquivada':esc(phaseLabel(e.phase))} · ${e.players} participantes · banco v${e.bank_revision}</p><span class="code-label">${esc(e.code)}</span></div><div class="edition-actions"><button data-open-edition="${esc(e.id)}" type="button">${e.archived?'Ver resultados':'Abrir painel'}</button>${e.archived?'':`<button data-share-code="${esc(e.code)}" type="button" class="secondary">Link dos estudantes</button>`}</div></article>`).join('')||'<p class="muted">Nenhum campeonato criado. Escolha um banco para abrir a primeira edição.</p>';
 $('teacher-access').hidden=!catalog.owner;
 $('teacher-list').innerHTML=(discipline.teachers||[]).map(id=>`<li><code>${esc(id)}</code><button data-remove-teacher="${esc(id)}" type="button" class="secondary">Retirar acesso</button></li>`).join('');
}
async function task(fn){if(busy)return;busy=true;$('message').textContent='';try{await fn()}catch(e){error(e)}finally{busy=false}}
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
$('teacher-access-form').onsubmit=e=>{e.preventDefault();task(async()=>{
 await rpc('cp_set_teacher',{p_discipline:disciplineId,p_user:$('teacher-user-id').value.trim(),p_allowed:true});$('teacher-access-form').reset();await loadPortal();
})};
$('teacher-list').onclick=e=>task(async()=>{const button=e.target.closest('[data-remove-teacher]');if(button&&confirm('Retirar o acesso deste professor a esta disciplina?')){await rpc('cp_set_teacher',{p_discipline:disciplineId,p_user:button.dataset.removeTeacher,p_allowed:false});await loadPortal()}});
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
 const exists=bankQuestions.some(x=>x.id===q.id);if(exists&&!confirm(`Salvar as alterações da questão ${q.id}? As edições já criadas manterão a versão anterior.`))return;
 await rpc('cp_save_questions',{p_bank:editingBank,p_questions:[q]});await openBank(editingBank);
})};
$('bank-import').onchange=e=>task(async()=>{
 const file=e.target.files[0];if(!file)return;
 try{const data=JSON.parse(await file.text());if(!Array.isArray(data)||!data.length)throw Error('O arquivo deve conter uma lista de questões.');
 if(!confirm(`Adicionar ou atualizar ${data.length} questões neste banco? Números existentes serão atualizados; as edições criadas serão preservadas.`))return;
 await rpc('cp_save_questions',{p_bank:editingBank,p_questions:data});await openBank(editingBank);
 }finally{e.target.value=''}
});
$('bank-export').onclick=()=>{
 const blob=new Blob([JSON.stringify(bankQuestions,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='banco-questoes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
// Consulta apenas o campeonato selecionado; trocar de disciplina interrompe as consultas da edição anterior.
startPolling=function(){if(pollingId===null)pollingId=setInterval(()=>{if(!busy&&editionId)refresh().catch(error)},2500)};
init();
