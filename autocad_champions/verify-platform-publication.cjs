const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const source=fs.readFileSync('app.js','utf8'),url=source.match(/SUPABASE_URL='([^']+)'/)[1],key=source.match(/SUPABASE_KEY='([^']+)'/)[1];
async function main(){
 for(const name of ['index.html','app.js','platform.js','experience.js','practice.js','platform.css']){
  const res=await fetch('https://desenhomecduel.vercel.app/'+(name==='index.html'?'':name),{cache:'no-store',signal:AbortSignal.timeout(25000)});
  if(!res.ok)throw Error(`${name}: HTTP ${res.status}`);
  const remote=await res.text(),local=fs.readFileSync(name,'utf8');
  const normalize=s=>s.replace(/\r\n/g,'\n').trim();
  const equal=normalize(remote)===normalize(local);
  console.log(`${name}: HTTP ${res.status} · ${equal?'igual à versão local':'diferente da versão local'}`);
  if(!equal)throw Error('A publicação ainda não corresponde a todos os arquivos locais');
 }
 const file=path.join(os.tmpdir(),'autocad-champions-26-sessions.json');
 if(!fs.existsSync(file)){console.log('Sem sessão anterior disponível para conferir a API.');return}
 const sessions=JSON.parse(fs.readFileSync(file,'utf8'));
 const refreshed=await fetch(url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:sessions[0].refresh_token}),signal:AbortSignal.timeout(25000)});
 const auth=await refreshed.json();if(!refreshed.ok)throw Error('Não foi possível renovar a sessão fictícia para conferir a API');
 Object.assign(sessions[0],{access_token:auth.access_token,refresh_token:auth.refresh_token});fs.writeFileSync(file,JSON.stringify(sessions));
 const headers={apikey:key,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'};
 const response=await fetch(url+'/rest/v1/rpc/cp_catalog',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok)throw Error('API da plataforma: '+(data.message||response.status));
 if(data.owner!==false||data.disciplines.length||data.editions.length)throw Error('Uma sessão fictícia recebeu acesso indevido ao catálogo do professor');
 console.log('API multidisciplinas: respondeu; sessão fictícia não recebe acesso ao catálogo do professor.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
