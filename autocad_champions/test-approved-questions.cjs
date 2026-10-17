const {PGlite}=require('./.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
const db=new PGlite();
const query=async(sql,args=[])=> (await db.query(sql,args)).rows;
const count=async()=> (await query('select count(*)::int n from public.ac_questions'))[0].n;
async function main(){
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await db.exec(fs.readFileSync('schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 await db.exec(fs.readFileSync('questions.sql','utf8'));
 await db.exec(fs.readFileSync('competition-v2.sql','utf8'));
 const originals=await query('select * from public.ac_questions order by id');assert.equal(originals.length,40);
 const sql=fs.readFileSync('questions-approved.sql','utf8');
 await db.exec("update public.ac_settings set phase='leveling' where id=1");
 await assert.rejects(()=>db.exec(sql),/Encerre ou arquive/);await db.exec('rollback');assert.equal(await count(),40);
 await db.exec("update public.ac_settings set phase='registration' where id=1");
 await db.exec(sql);assert.equal(await count(),55);
 await db.exec(sql);assert.equal(await count(),55);
 assert.deepEqual(await query('select * from public.ac_questions where id<=40 order by id'),originals);
 const expected=[41,42,43,44,45,47,54,55,56,58,62,63,64,67,80];
 const added=await query('select * from public.ac_questions where id>40 order by id');assert.deepEqual(added.map(q=>q.id),expected);
 const source=JSON.parse(fs.readFileSync('novas-questoes.json','utf8'));assert.equal(source.length,15);
 for(const question of added){
  const proposal=source.find(p=>p.id===question.id);
  assert.equal(question.statement,`${proposal.id}. ${proposal.question}`);
  assert.deepEqual(question.options,proposal.options.map((text,i)=>`${String.fromCharCode(65+i)}) ${text}`));
  assert.equal(question.options[question.correct],`${String.fromCharCode(65+question.correct)}) ${proposal.correct}`);
 }
 const array=added.find(q=>q.id===47);assert.equal(array.options[array.correct],'B) ARRAY');
 await db.exec("update public.ac_settings set phase='knockout' where id=1");
 await assert.rejects(()=>db.exec(sql),/Encerre ou arquive/);await db.exec('rollback');assert.equal(await count(),55);
 await db.exec("update public.ac_settings set phase='finished' where id=1");await db.exec(sql);assert.equal(await count(),55);
 console.log('OK: banco com 55 questões; 15 aprovadas e gabaritos conferidos; 40 originais preservadas; 25 excluídas ausentes; atualização repetível e bloqueada durante partidas.');
 await db.close();
}
main().catch(async e=>{console.error(e);process.exitCode=1;await db.close()});
