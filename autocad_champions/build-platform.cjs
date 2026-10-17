// Gera a migração a partir do motor de competição já testado.
const fs=require('node:fs');
const schema=fs.readFileSync('schema.sql','utf8');
const v2=fs.readFileSync('competition-v2.sql','utf8');
const funcs=[...v2.matchAll(/create or replace function public\.(ac_\w+)\([\s\S]*?end \$\$;/g)].map(m=>m[0]);
const tables=schema.slice(schema.indexOf('create table'),schema.indexOf('-- Negar acesso'));
const archive=schema.slice(schema.indexOf('create table if not exists public.ac_archives'),schema.indexOf('alter table public.ac_archives'));
const additions=v2.slice(v2.indexOf('alter table public.ac_settings'),v2.indexOf('-- Uso interno.'));
let template=tables+'\n'+archive+'\n'+additions+'\n'+funcs.join('\n');
template=template.replace(/public\.ac_/g,'__EDITION__.ac_').replace(/pg_advisory_xact_lock\(100019\)/g,"pg_advisory_xact_lock(hashtextextended('__EDITION__',0))");
template+=`\ncreate or replace function __EDITION__.ac_is_admin() returns boolean language sql security definer set search_path='' as $$select public.cp_can_manage('__DISCIPLINE__'::uuid)$$;\n`;
template+=`revoke all on all tables in schema __EDITION__ from public,anon,authenticated;
revoke all on all functions in schema __EDITION__ from public,anon,authenticated;
revoke all on schema __EDITION__ from public,anon,authenticated;`;
const catalog=fs.readFileSync('platform-catalog.sql','utf8');
const insertion=`insert into public.cp_engine(id,sql_template) values(1,$engine$${template}$engine$) on conflict(id) do update set sql_template=excluded.sql_template;\n`;
fs.writeFileSync('platform-multidisciplines.sql',catalog.replace('-- ENGINE_TEMPLATE',()=>insertion));
console.log('Migração multidisciplinas gerada com '+funcs.length+' funções do motor isoladas por edição.');
