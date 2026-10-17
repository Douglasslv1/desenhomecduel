const fs=require('node:fs'),assert=require('node:assert/strict');
const file='novas-questoes.json';
const excluded=new Set([46,48,49,50,51,52,53,57,59,60,61,65,66,68,69,70,71,72,73,74,75,76,77,78,79]);
const expected=[41,42,43,44,45,47,54,55,56,58,62,63,64,67,80];
const selected=JSON.parse(fs.readFileSync(file,'utf8')).filter(q=>!excluded.has(q.id));
assert.deepEqual(selected.map(q=>q.id),expected);
const array=selected.find(q=>q.id===47);
array.question='Você precisa distribuir seis furos iguais, com espaçamento angular uniforme, ao redor do centro de um disco. Qual comando permite criar essas repetições de forma organizada?';
array.options=['MIRROR','ARRAY','OFFSET','SCALE','TRIM'];
array.correct='ARRAY';
array.why='ARRAY replica objetos em arranjos circulares (opção Polar) ou retangulares. Para os furos ao redor do centro do disco, utiliza-se a opção Polar.';
fs.writeFileSync(file,JSON.stringify(selected,null,2)+'\n');
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
const values=selected.map(q=>{
 assert.equal(q.options.length,5);assert.equal(new Set(q.options).size,5);
 const key=q.options.indexOf(q.correct);assert.ok(key>=0);
 const options=q.options.map((text,i)=>`${String.fromCharCode(65+i)}) ${text}`);
 return `(${q.id},${quote(`${q.id}. ${q.question}`)},${quote(JSON.stringify(options))}::jsonb,${key})`;
});
const sql=`-- 15 questões aprovadas em 17/10/2026. Preserva as 40 questões originais.
-- Requer competition-v2.sql. Execute apenas com inscrições abertas ou edição encerrada.
-- Os números originais da proposta são preservados para facilitar a identificação.
begin;
do $$ begin
 perform pg_advisory_xact_lock(100019);
 if (select phase from public.ac_settings where id=1) not in ('registration','finished') then
  raise exception 'Encerre ou arquive a edição antes de atualizar o banco de questões';
 end if;
end $$;
insert into public.ac_questions(id,statement,options,correct) values
${values.join(',\n')}
on conflict(id) do update set statement=excluded.statement,options=excluded.options,correct=excluded.correct;
commit;
select count(*) as total_questoes from public.ac_questions;
`;
fs.writeFileSync('questions-approved.sql',sql);
console.log('Seleção conferida: 25 removidas, 15 aprovadas, questão 47 com gabarito ARRAY.');
