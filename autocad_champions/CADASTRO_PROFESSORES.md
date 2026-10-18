# Cadastro de professores pelo superadministrador

O superadministrador cadastra nome, e-mail, senha inicial e uma ou mais disciplinas. A conta é criada com o e-mail confirmado, pois o cadastro é realizado pelo administrador, e o professor pode entrar imediatamente. Não há envio automático de mensagem: informe ao professor o e-mail e a senha por um meio apropriado.

O botão Desativar suspende o acesso de professor a todas as disciplinas, inclusive em sessões abertas. O botão Reativar restaura os vínculos existentes. Os campeonatos, questões, resultados e vínculos não são apagados. A desativação restringe as funções de professor; a área pública de estudos permanece disponível. O superadministrador não pode ser desativado por esses botões.

## Configuração única

1. No SQL Editor do Supabase, execute `platform-teacher-accounts.sql` completo. As atualizações anteriores, incluindo `platform-answer-review.sql`, devem estar instaladas. Este arquivo não altera as questões nem o andamento dos campeonatos.
2. Na Vercel, abra o projeto do site e vá a **Settings → Environment Variables**. Adicione estas três variáveis para o ambiente **Production** (também em Preview se quiser testar nesse ambiente):

| Nome | Valor |
| --- | --- |
| SUPABASE_URL | https://neiohdvunvmgqznmyviz.supabase.co |
| SUPABASE_PUBLISHABLE_KEY | A chave pública/publishable do mesmo projeto, disponível nas configurações de API do Supabase. É a mesma usada pelo site. |
| SUPABASE_SERVICE_ROLE_KEY | A chave administrativa legada `service_role` do mesmo projeto, disponível nas configurações de API do Supabase. |

A chave `service_role` deve ficar somente nas variáveis do servidor da Vercel. Não a coloque no app.js, no GitHub, em arquivos públicos nem nesta conversa. Não use os prefixos NEXT_PUBLIC_ ou VITE_ nessas variáveis.

3. Publique os arquivos atualizados do pacote `publicacao-champions.zip`, preservando a pasta **api**, que contém `teachers.js`. Inclua também `.vercelignore`. A função `/api/teachers` precisa ser publicada como função da Vercel; não basta enviar o HTML para uma hospedagem apenas estática.
4. Faça uma nova implantação/redeploy após salvar as variáveis. Atualize a página do site.

A criação é executada no servidor, após validar a sessão e a permissão real de superadministrador. A chave administrativa e as senhas não são retornadas nas respostas. A sessão do superadministrador permanece aberta ao cadastrar outro usuário.

## Uso

1. Acesse o painel com sua conta de superadministrador.
2. Na seção Professores, clique em **Cadastrar professor**.
3. Preencha os dados, marque as disciplinas e clique em **Salvar professor**.
4. Use **Desativar** ou **Reativar** na mesma lista quando necessário. Há confirmação estilizada antes da mudança.
5. Para uma conta que já existe, use o campo por e-mail na disciplina para atribuir ou ampliar o acesso, sem criar uma segunda conta.

Professores comuns não veem essa seção nem podem chamar suas operações diretamente.

## Conferência após publicação

Cadastre um professor de teste, entre com ele em outra janela e confirme que vê somente as disciplinas atribuídas. Desative-o pelo superadmin e atualize a janela do professor: as disciplinas deixam de estar disponíveis. Reative e confirme o retorno do acesso. Não é necessário apagar contas ou resultados.

Se aparecer que o cadastro precisa ser configurado no servidor, confira as três variáveis e faça redeploy. Se aparecer que a função não foi publicada, confirme que a pasta api está na raiz do projeto publicado. Um e-mail já cadastrado deve ser atribuído às disciplinas pelo campo de e-mail.

Referências de implementação: [criação administrativa de usuários no Supabase](https://supabase.com/docs/reference/javascript/auth-admin-createuser) e [funções Node.js da Vercel](https://vercel.com/docs/functions/runtimes/node-js).
