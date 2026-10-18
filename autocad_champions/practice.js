let practiceCatalog=[],practiceState=null;
const practiceReviewed=new Map();
const practiceStorage='champions-practice-run';
function savePracticeRun(id){try{id?sessionStorage.setItem(practiceStorage,id):sessionStorage.removeItem(practiceStorage)}catch{}}
async function loadPractice(){
 stopEdition();practiceCatalog=await rpc('cp_practice_catalog');
 $('practice-discipline').innerHTML=practiceCatalog.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
 fillPracticeBanks();show('practice-menu');
 let previous;try{previous=sessionStorage.getItem(practiceStorage)}catch{}
 if(previous){try{practiceState=await rpc('cp_practice_state',{p_run:previous});renderPractice()}catch{savePracticeRun(null)}}
}
function fillPracticeBanks(){
 const discipline=practiceCatalog.find(d=>d.id===$('practice-discipline').value)||practiceCatalog[0];
 $('practice-bank').innerHTML=(discipline?.banks||[]).map(b=>`<option value="${esc(b.id)}" ${b.count<10?'disabled':''}>${esc(b.name)} · ${b.count} questões${b.count<10?' · aguardando questões':''}</option>`).join('');
 fillPracticeCount();
}
function fillPracticeCount(){
 const all=practiceCatalog.flatMap(d=>d.banks),bank=all.find(b=>b.id===$('practice-bank').value);
 const count=bank?.count||0;
 $('practice-count').innerHTML=[10,20].map(n=>`<option value="${n}" ${count<n?'disabled':''}>${n} questões${count<n?' · indisponível':''}</option>`).join('');
 $('practice-start').disabled=count<10;
 $('practice-availability').textContent=count>=10?'Perguntas sorteadas sem repetição. Estude no seu ritmo, sem cronômetro.':'Este banco ainda não tem dez questões. Escolha outro banco ou aguarde o professor.';
}
function renderPractice(){
 const s=practiceState;if(!s)return;
 const f=s.feedback;let reviewed=practiceReviewed.get(s.id)===f?.number;
 try{reviewed=reviewed||sessionStorage.getItem(`practice-reviewed:${s.id}`)===String(f?.number)}catch{}
 const reviewing=!!f&&!reviewed;
 $('practice-next').hidden=!reviewing;
 if(reviewing){
  show('practice-quiz');$('practice-context').textContent=`${s.discipline} · ${s.bank}`;
  $('practice-progress').textContent=`Questão ${f.number} de ${s.total} · ${s.score} acertos`;
  $('practice-question').textContent=f.statement;$('practice-options').innerHTML=reviewOptions(f);
  $('practice-feedback').hidden=false;$('practice-feedback').textContent=reviewMessage(f);
  $('practice-next').textContent=s.finished?'Ver resultado →':'Próxima questão →';return;
 }
 if(s.finished){
  show('practice-result');$('practice-score').textContent=`${s.score} de ${s.total}`;
  $('practice-result-description').textContent=`${s.discipline} · ${s.bank}. Você acertou ${s.score} e errou ${s.total-s.score} questões (${Math.round(s.score/s.total*100)}% de aproveitamento).`;
  $('practice-final-feedback').hidden=true;return;
 }
 show('practice-quiz');$('practice-context').textContent=`${s.discipline} · ${s.bank}`;
 $('practice-progress').textContent=`Questão ${s.question.number} de ${s.total} · ${s.score} acertos`;
 $('practice-question').textContent=s.question.statement;
 $('practice-options').innerHTML=s.question.options.map((option,i)=>`<button type="button" class="option" data-practice-choice="${i}">${esc(option)}</button>`).join('');
 $('practice-feedback').hidden=true;
}
$('practice-next').onclick=()=>{if(busy||!practiceState?.feedback)return;
 practiceReviewed.set(practiceState.id,practiceState.feedback.number);
 try{sessionStorage.setItem(`practice-reviewed:${practiceState.id}`,String(practiceState.feedback.number))}catch{}
 renderPractice();
};
$('practice-discipline').onchange=fillPracticeBanks;
$('practice-bank').onchange=fillPracticeCount;
$('practice-form').onsubmit=e=>{e.preventDefault();task(async()=>{
 practiceState=await rpc('cp_practice_start',{p_bank:$('practice-bank').value,p_count:Number($('practice-count').value)});
 savePracticeRun(practiceState.id);renderPractice();
})};
$('practice-options').onclick=e=>{const button=e.target.closest('[data-practice-choice]');if(!button||button.disabled||busy||!$('practice-next').hidden)return;
 const previous=practiceState;
 task(async()=>{
  $('practice-options').querySelectorAll('button').forEach(b=>b.disabled=true);
  try{practiceState=await rpc('cp_practice_answer',{p_run:previous.id,p_question:previous.question.number,p_choice:Number(button.dataset.practiceChoice)});renderPractice()}
  catch(err){try{practiceState=await rpc('cp_practice_state',{p_run:previous.id});renderPractice()}catch{}throw err}
 });
};
function practiceMenu(){practiceState=null;savePracticeRun(null);show('practice-menu')}
$('practice-new').onclick=practiceMenu;
$('practice-change-bank').onclick=async()=>{if(busy)return;if(await confirmAction('O progresso já respondido fica salvo, mas você começará outra tentativa ao escolher um novo simulado.',{title:'Escolher outro simulado?',confirmLabel:'Escolher outro'}))practiceMenu()};
$('practice-home').onclick=()=>task(async()=>{
 if(teacher){history.replaceState(null,'','?professor=true');await loadPortal()}
 else{history.replaceState(null,'',location.pathname);show('entry')}
});
