const assert=require('node:assert/strict'),handler=require('./api/teachers.js');
process.env.SUPABASE_URL='https://example.test';process.env.SUPABASE_PUBLISHABLE_KEY='public-test';process.env.SUPABASE_SERVICE_ROLE_KEY='secret-only-server';
const id='00000000-0000-4000-8000-000000000002';
const valid={name:'Professor',email:'Professor@school.test',password:'Test-password-123!',disciplines:[id]};
let calls=[],mode='success';
global.fetch=async(url,options)=>{
 calls.push({url,options});let status=200,data=true;
 if(url.endsWith('cp_teacher_admin_check')){data=mode!=='forbidden';if(mode==='unauthorized')status=401}
 else if(url.endsWith('/auth/v1/admin/users')){status=mode==='duplicate'?422:200;data=mode==='duplicate'?{code:'email_exists'}:{id}}
 else if(url.endsWith('cp_register_teacher')){status=mode==='link-failure'?400:200;data=null}
 return {ok:status<300,status,json:async()=>data};
};
async function invoke(body=valid,headers={authorization:'Bearer user-token'},method='POST'){
 calls=[];const res={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}};
 await handler({method,headers,body},res);assert.ok(!JSON.stringify(res.data).includes('secret-only-server'));assert.ok(!JSON.stringify(res.data).includes(valid.password));return res;
}
(async()=>{
 assert.equal((await invoke()).code,201);assert.equal(calls.length,3);
 const create=calls[1];assert.equal(create.options.headers.apikey,'secret-only-server');assert.equal(JSON.parse(create.options.body).email,'professor@school.test');assert.equal(JSON.parse(create.options.body).email_confirm,true);
 assert.equal(calls[2].options.headers.Authorization,'Bearer user-token');
 mode='forbidden';assert.equal((await invoke()).code,403);assert.equal(calls.length,1);
 mode='unauthorized';assert.equal((await invoke()).code,401);assert.equal(calls.length,1);
 mode='success';assert.equal((await invoke(valid,{})).code,401);assert.equal(calls.length,0);
 assert.equal((await invoke(valid,{},'GET')).code,405);
 assert.equal((await invoke({...valid,disciplines:[]})).code,400);assert.equal(calls.length,1);
 assert.equal((await invoke({...valid,password:'123'})).code,400);
 assert.equal((await invoke('{broken')).code,400);
 mode='duplicate';assert.equal((await invoke()).code,409);assert.equal(calls.length,2);
 mode='link-failure';assert.equal((await invoke()).code,502);assert.equal(calls.at(-1).options.method,'DELETE');assert.ok(calls.at(-1).url.endsWith(id));
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;assert.equal((await invoke()).code,503);assert.equal(calls.length,0);
 console.log('OK: API restrita ao superadmin, validação, conta duplicada, reversão de cadastro incompleto e chave/senha ausentes das respostas.');
})().catch(e=>{console.error(e);process.exitCode=1});
