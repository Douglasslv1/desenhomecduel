// Executado somente no servidor da Vercel. Nunca exportar a chave administrativa ao navegador.
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'})}
 const url=process.env.SUPABASE_URL,publicKey=process.env.SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!publicKey||!secret)return res.status(503).json({error:'O cadastro de professores ainda precisa ser configurado no servidor.'});
 const token=req.headers.authorization;
 if(typeof token!=='string'||!/^Bearer \S+$/i.test(token))return res.status(401).json({error:'Entre novamente como superadministrador.'});
 const request=async(path,body,admin=false)=>{
  const response=await fetch(url+path,{method:'POST',headers:{apikey:admin?secret:publicKey,Authorization:admin?`Bearer ${secret}`:token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);return {ok:response.ok,status:response.status,data};
 };
 try{
  const permission=await request('/rest/v1/rpc/cp_teacher_admin_check',{});
  if(!permission.ok||permission.data!==true)return res.status(permission.status===401?401:403).json({error:'Apenas o superadministrador pode cadastrar professores.'});
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body)}catch{return res.status(400).json({error:'Cadastro inválido.'})}}
  const {name,email,password,disciplines}=body||{};
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>100||typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email.trim())||typeof password!=='string'||password.length<8||password.length>128||!Array.isArray(disciplines)||!disciplines.length||disciplines.length>100||disciplines.some(d=>typeof d!=='string'||!uuid.test(d)))return res.status(400).json({error:'Preencha nome, e-mail, senha de 8 a 128 caracteres e ao menos uma disciplina.'});
  const created=await request('/auth/v1/admin/users',{email:email.trim().toLowerCase(),password,email_confirm:true,user_metadata:{full_name:name.trim()}},true);
  if(!created.ok)return res.status(created.status===422?409:400).json({error:created.data?.code==='email_exists'||/already|registered|exists/i.test(created.data?.msg||created.data?.message||'')?'Esse e-mail já possui cadastro. Use o campo de atribuir acesso por e-mail.':'Não foi possível criar a conta. Confira os dados e os requisitos de senha.'});
  const id=created.data?.id||created.data?.user?.id;
  if(!id)return res.status(502).json({error:'Não foi possível confirmar a criação da conta.'});
  const linked=await request('/rest/v1/rpc/cp_register_teacher',{p_user:id,p_name:name.trim(),p_disciplines:[...new Set(disciplines)]});
  if(!linked.ok){
   // Reverte apenas a conta recém-criada se a etapa transacional de permissões falhar.
   const cleanup=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(id),{method:'DELETE',headers:{apikey:secret,Authorization:`Bearer ${secret}`}});
   return res.status(502).json({error:cleanup.ok?'Não foi possível atribuir as disciplinas. Nenhuma conta foi mantida; tente novamente.':'A conta foi criada, mas as disciplinas não foram atribuídas. Use a atribuição por e-mail para concluir.'});
  }
  return res.status(201).json({id,message:'Professor cadastrado. Ele já pode entrar com o e-mail e a senha definidos.'});
 }catch{return res.status(502).json({error:'Não foi possível concluir o cadastro. Verifique a lista de professores ou use a atribuição por e-mail antes de tentar novamente.'})}
};
