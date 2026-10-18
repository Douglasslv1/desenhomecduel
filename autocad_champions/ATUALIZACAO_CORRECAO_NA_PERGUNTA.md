# Correção na própria pergunta e professores por e-mail

## Como publicar

1. Encerre ou arquive os campeonatos em andamento. A atualização recusa alterar uma competição ativa e preserva os históricos.
2. No SQL Editor do Supabase, execute todo o arquivo `platform-answer-review.sql`. Ele pressupõe que `platform-learning-update.sql` já foi aplicado. Não é necessário reaplicar os arquivos antigos.
3. Publique os seis arquivos de `publicacao-champions.zip` na raiz do site: index.html, app.js, platform.js, practice.js, experience.js e platform.css. Eles também estão atualizados nesta pasta.
4. Atualize a página após concluir a publicação.

## Comportamento

- No campeonato e no simulado, responder mantém a pergunta e suas alternativas na tela.
- A correta fica verde com o texto “Correta”. Quando houver erro, a alternativa escolhida fica vermelha com o texto “Sua resposta”. Todas ficam bloqueadas para impedir uma segunda resposta.
- O botão “Próxima questão” inicia a seguinte. Na última, ele conclui a etapa ou abre o resultado do simulado, depois da correção.
- Nos campeonatos, os 90 segundos da próxima pergunta só começam após o clique. O tempo gasto lendo a correção é descontado do tempo usado para desempatar.
- Se o prazo acabar, apenas a pergunta atual é registrada como não respondida. A correção aparece e é necessário continuar para iniciar a seguinte. Um estudante parado na correção permanece pendente; o professor pode desclassificá-lo se necessário.
- Recarregar a página retoma a correção pendente do campeonato. No simulado, a mesma aba retoma a revisão ou a pergunta seguinte, conforme o último clique.
- A atribuição de professores solicita apenas o e-mail já cadastrado no Supabase Authentication. O superadministrador pode conceder acesso a uma ou mais disciplinas.
- Essa área fica visível somente ao superadministrador. Professores não podem atribuir acessos, nem por chamadas diretas ao banco.

A atualização não insere nem altera questões. A autenticação do professor continua usando a conta existente.
