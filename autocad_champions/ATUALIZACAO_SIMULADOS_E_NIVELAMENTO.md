# Acessos por disciplina nivelamento de vinte questões e simulados

## Aplicar na instalação atual

1. Encerre ou arquive todas as edições em nivelamento ou mata-mata. A migração recusa a alteração de competições em andamento.
2. Faça backup do Supabase.
3. Execute **platform-learning-update.sql** completo no SQL Editor. O pré-requisito é a migração multidisciplinas já aplicada.
4. Publique juntos **index.html**, **app.js**, **platform.js**, **experience.js**, **practice.js** e **platform.css**. O pacote **publicacao-champions.zip** contém esses seis arquivos para extração na raiz da publicação.
5. Confira o painel da conta existente, os acessos atribuídos aos outros professores e a nova área de simulados.
6. Crie uma edição de teste com participantes fictícios antes de usar com a turma.

Não execute as migrações antigas depois desta, pois podem substituir as funções novas. Esta atualização não insere, apaga ou troca perguntas e não recalcula resultados já encerrados. Pode ser executada novamente sem duplicar dados. Edições antigas que tiveram dez questões de nivelamento mantêm seus resultados e sua contagem histórica.

## Superadministrador e professores

A conta existente que já constava em ac_admins passa a ser identificada como **Superadministrador** no painel. Ela tem acesso a todas as disciplinas, pode criar outras e conceder ou retirar acesso de professores. O acesso geral continua limitado a contas dessa lista administrativa.

Um professor comum não deve ser inserido em ac_admins. Crie uma conta com e-mail e senha no Supabase Authentication e, no painel do superadministrador, abra a disciplina desejada e use **Professores com acesso à disciplina**. Informe o e-mail ou UUID da conta para conceder acesso. Repita em outra disciplina quando quiser ampliar o acesso desse professor.

O professor comum vê e administra somente as disciplinas atribuídas, seus bancos e campeonatos. Ele não pode criar disciplinas nem atribuir outros professores. Sem vínculo, não recebe acesso ao painel de nenhuma disciplina. Retirar um vínculo bloqueia as operações seguintes nessa disciplina. A lista de professores apresenta o e-mail, quando disponível, e identifica superadministradores.

Contas anônimas de estudantes não podem ser atribuídas pelo formulário de professores. A atribuição é verificada no servidor e não depende de ocultar botões na página.

## Campeonatos

- Nivelamento: **20 questões**, iguais e na mesma ordem para todos os participantes da edição.
- Mata-mata: **10 questões por duelo**.
- Cada pergunta continua com **90 segundos**, controlados pelo servidor.
- O banco de uma nova edição precisa ter pelo menos 20 questões. Bancos com dez a dezenove continuam podendo ser usados em simulados de dez, mas não em novos campeonatos.
- Uma edição já criada, ainda com inscrições abertas, também precisa ter pelo menos 20 questões em sua cópia para iniciar o novo nivelamento. Se a cópia tiver menos, atualize o banco e crie uma nova edição.
- Formação dos confrontos, vagas automáticas, desempate, desclassificação e pódio continuam com as regras existentes.

Após responder, o estudante vê o resultado da pergunta anterior e a alternativa correta, identificada claramente no painel. Essa informação permanece durante a próxima pergunta e também após a última resposta. O cronômetro da próxima questão continua iniciando no servidor imediatamente após o envio, conforme a regra anterior. A revisão não bloqueia a tela nem pausa o relógio.

O navegador só recebe o gabarito de uma pergunta depois que uma resposta ou expiração dessa pergunta foi registrada para aquele participante. A pergunta atual seguinte continua sem gabarito. A revisão permanece disponível após atualizar a página. Acesso ao gabarito é negado para tentativas de outro usuário e para participantes desclassificados.

## Simulados

A entrada pública tem o botão **Fazer um simulado para estudar**. O painel do professor também tem um link para essa área. O acesso usa a sessão existente; para visitantes, a mesma autenticação anônima dos estudantes é utilizada.

1. Escolha a disciplina.
2. Escolha um dos bancos disponíveis daquela disciplina.
3. Escolha dez ou vinte perguntas, conforme a quantidade disponível no banco.
4. Responda no seu ritmo, sem cronômetro.
5. Veja a correção após cada resposta e, ao finalizar, o total de acertos, erros e percentual de aproveitamento.

As perguntas são sorteadas sem repetição dentro da tentativa e guardadas como uma cópia. Editar o banco depois não modifica um simulado já iniciado. Bancos vazios, como ADS antes de receber questões, não permitem iniciar uma tentativa.

O simulado tem armazenamento próprio. Não inscreve o estudante em campeonatos, não conta no nivelamento, não altera chaveamento e não envia notas ao professor. Somente a sessão que iniciou a tentativa pode consultá-la ou responder. O progresso é retomado após recarregar a página na mesma sessão; outra conta não recebe as respostas anteriores.

O usuário pode iniciar novas tentativas com novo sorteio. A versão atual apresenta o resultado da tentativa atual; não inclui ranking ou painel de histórico de simulados para professores.

## Testes locais

- `node test-learning.cjs`: conta de superadministrador, atribuição de professores por e-mail/UUID e disciplina, simulados aleatórios de dez/vinte, privacidade, pontuação e retomada, correção posterior, 26 participantes e 1040 respostas até o pódio, vencimento das vinte perguntas, bloqueio de banco insuficiente e migração repetível.
- `node test-practice-ui.cjs`: seleção de disciplina e banco, bloqueio de banco vazio, resultado e revisão, retomada, novas tentativas e separação dos campeonatos.
- Testes anteriores de interface, diálogos, árvore e arquivamento continuam disponíveis.

O banco de teste é local e não altera a instância publicada. A publicação, a conferência visual no navegador e o novo teste com jogadores fictícios no site ainda precisam ser realizados após a instalação.

## Manutenção

`node build-learning-update.cjs` gera platform-learning-update.sql a partir do motor já testado e das funções em learning-features.sql. A migração pronta acompanha o projeto. Não é necessário executar os arquivos geradores ou instalar dependências na Vercel.
