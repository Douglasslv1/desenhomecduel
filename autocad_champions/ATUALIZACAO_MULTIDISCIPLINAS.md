# Plataforma Champions com várias disciplinas

## O que está implementado

- Um login de professor com disciplinas autorizadas, apresentadas em cartões.
- Desenho Mecânico com o banco atual importado, incluindo todas as questões efetivamente existentes no Supabase. Se as 15 aprovadas já foram inseridas, serão preservadas as 55.
- Análise e Desenvolvimento de Sistemas com banco vazio, aguardando as questões do professor. Não há perguntas fictícias de ADS na migração entregue.
- Criação de outras disciplinas pelo administrador da plataforma.
- Vários bancos por disciplina, com inclusão manual, edição, importação e exportação JSON de perguntas. As alternativas corretas só são acessíveis a professores autorizados.
- Criação de campeonatos independentes por disciplina ou turma. Cada edição guarda o banco e a revisão usados na sua criação, sem receber alterações posteriores do banco.
- Links e códigos próprios para entrada dos estudantes. Uma mesma sessão pode participar de várias edições com inscrições e progresso separados.
- Nivelamento, primeira rodada por resultados próximos, vagas automáticas, cronômetro de 90 segundos, desclassificação junto ao nome e pódio preservados.
- Arquivamento sem apagar resultados. A lista de edições mantém acesso do professor ao painel congelado.
- Acesso de professores por disciplina. O administrador pode atribuir ou retirar acesso usando o UUID de uma conta de professor já criada no Supabase Authentication.

## Aplicar na instalação atual

1. Faça uma cópia de segurança do banco e guarde os arquivos atuais da página. A migração altera as funções acessíveis pelo navegador e deve ser publicada junto com a página nova.
2. Encerre ou arquive a edição atual. A migração recusa a atualização enquanto o motor antigo estiver em nivelamento ou mata-mata.
3. Execute **platform-multidisciplines.sql** completo no SQL Editor do Supabase. Os pré-requisitos são o schema e competition-v2.sql já aplicados. Se quiser importar as 55 perguntas agora, aplique questions-approved.sql antes da migração.
4. Publique juntos **index.html**, **app.js**, **platform.js** e **platform.css** na Vercel. O pacote publicacao-champions.zip contém somente esses quatro arquivos; se usar upload manual, extraia o conteúdo na raiz da publicação.
5. Atualize a página do professor em `?professor=true`, entre com a mesma conta e escolha uma disciplina.
6. Confira o banco importado, crie uma edição de teste e use **Link dos estudantes** para cadastrar os participantes fictícios. Não inicie o nivelamento antes de todos estarem prontos.

A migração é transacional e pode ser executada novamente sem duplicar disciplinas ou importar outra vez a edição antiga. Não execute schema.sql, competition-v2.sql ou os arquivos antigos de correção depois dela: esses arquivos pertencem à versão anterior e podem restaurar pontos de entrada antigos. Os testes locais usam a instalação anterior apenas para construir o cenário de migração.

## Fluxo do professor

1. Selecionar a disciplina.
2. Gerenciar ou escolher um banco com pelo menos dez perguntas.
3. Informar o nome da edição ou turma e criar o campeonato.
4. Copiar seu link e enviá-lo à turma.
5. Conferir as inscrições e iniciar o nivelamento.
6. Formar o mata-mata quando o nivelamento terminar.
7. Acompanhar a árvore, usar o modo projeção e desclassificar participantes quando necessário.
8. Arquivar a edição ao terminar e criar outra pelo painel da disciplina.

O arquivamento administrativo também pode encerrar uma edição em andamento após confirmação; preserva os dados recebidos até aquele momento e bloqueia novas respostas. O botão não limpa o campeonato nem abre automaticamente outra edição.

## Questões e versões

O formulário usa cinco alternativas e uma resposta correta. Para importação JSON, use uma lista com os campos `id`, `statement`, `options` e `correct`:

```json
[
  {
    "id": 1,
    "statement": "Qual é a resposta correta?",
    "options": ["A) Um", "B) Dois", "C) Três", "D) Quatro", "E) Cinco"],
    "correct": 0
  }
]
```

O campo correct usa 0 para A até 4 para E. Cada id identifica a pergunta dentro do banco; bancos diferentes podem usar os mesmos números. Importar atualiza os números existentes e inclui os novos, sem apagar os demais. A versão do banco aumenta a cada salvamento. A edição já criada usa a cópia anterior, inclusive se ainda estiver com inscrições abertas. Crie outra edição para usar as perguntas revisadas.

Na versão multidisciplinas, as novas perguntas devem ser salvas pelo painel do banco. Não use mais questions-approved.sql para alterar public.ac_questions: essa tabela passa a ser o acervo legado, sem efeito sobre os novos bancos.

## Migração e histórico anterior

O conteúdo antigo é copiado para uma edição chamada **Campeonato de Desenho Mecânico importado**. Participantes, confrontos, respostas, nivelamento, desclassificações e perguntas são preservados. Os arquivos antigos de reset também são copiados para o armazenamento privado da edição, embora ainda não exista uma tela para navegar dentro desses arquivos anteriores à plataforma.

As tabelas public.ac_* antigas permanecem preservadas para conferência administrativa. Seus pontos de entrada pelo navegador são desativados para impedir alterações fora do novo escopo. A conta que já constava em ac_admins mantém o papel de administrador da plataforma e recebe acesso às duas disciplinas iniciais.

Os links antigos sem código passam a mostrar o campo de entrada por código. Links novos são obtidos no painel de cada edição. Um link arquivado não aceita mais estudantes; resultados continuam disponíveis para professores autorizados.

## Isolamento e permissões

O catálogo, os bancos e as permissões usam tabelas cp_* privadas no schema public. Cada edição tem um schema privado cp_e_* com sua cópia das questões e do motor de competição. Nenhum desses schemas deve ser adicionado aos schemas expostos na API do Supabase. A página usa apenas RPCs controladas no schema public; não há service_role no frontend.

Todas as ações do campeonato recebem o identificador de edição. As permissões do professor são verificadas pela disciplina. Participantes só podem responder usando suas próprias tentativas. As rotinas internas e tabelas não têm acesso direto para anon ou authenticated. Os bloqueios transacionais são separados por edição, permitindo campeonatos independentes.

Essa estratégia preserva o motor já validado e facilita a migração do projeto atual. Cada edição cria tabelas e funções próprias; para uma futura operação com um volume muito grande de edições, será necessário medir o custo desse catálogo e planejar a evolução do armazenamento. Não foi realizado teste de carga em produção.

## Testes concluídos localmente

- Migração repetível com 55 questões e um participante anterior preservados.
- Bloqueio de criação de edição com banco vazio, validação de alternativas e gabaritos.
- Duas disciplinas com oito jogadores nas duas edições, nivelamento e mata-mata até dois pódios independentes.
- Desclassificação em uma edição sem efeito na outra, inclusive com a mesma sessão inscrita nas duas.
- Tentativa de responder a um campeonato com uma tentativa pertencente a outro recusada.
- Banco atualizado após criação da edição sem alterar sua cópia; nova edição recebe o banco revisado.
- Professores restritos à sua disciplina, revogação de permissão, códigos, histórico congelado e restrições de acesso a tabelas e funções internas.
- Interface: escolha de disciplinas, banco vazio bloqueado, criação e seleção de edição, links, formulário de perguntas, entrada por código e interrupção das consultas ao sair do campeonato.
- Testes existentes de telas, árvore e arquivamento ajustados à navegação nova.

Comandos: `node test-platform.cjs`, `node test-platform-ui.cjs`, `node test-ui-v2.cjs`, `node test-bracket.cjs` e `node test-reset.cjs`. O banco de teste usa a dependência local @electric-sql/pglite já instalada em .test-runtime; esse diretório não deve ser publicado.

A migração e a página não foram aplicadas à instância publicada por esta tarefa. A conferência visual em navegador e o teste com a turma fictícia no site ainda precisam ocorrer depois da instalação.

Para repetir o teste pela API, defina a variável AC_TEST_CODE com o código da edição antes de executar `node test-eight.cjs register 26`. Depois do início pelo professor, use `node test-eight.cjs level 26`, forme o mata-mata e use `node test-eight.cjs play 26`. O mesmo código precisa continuar definido em todas as etapas.

## Arquivos de manutenção

platform-catalog.sql e build-platform.cjs geram platform-multidisciplines.sql a partir do motor competition-v2.sql. O arquivo entregue já está gerado; o professor deve executar somente platform-multidisciplines.sql para esta atualização. platform-sections.html é uma referência das seções incorporadas em index.html e não precisa ser publicada separadamente.
