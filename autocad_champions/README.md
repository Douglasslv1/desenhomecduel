Atualiza??o mais recente: [alternativas em ordem aleat?ria](ALTERNATIVAS_ALEATORIAS.md). Publicar os arquivos do site; n?o exige SQL.

Atualização: [registro de perdas de foco nos confrontos](ATUALIZACAO_PERDAS_DE_FOCO.md). Aplicar `platform-focus-events.sql` e publicar também `focus.js`. Alertas ao professor e aviso ao aluno, sem desclassificação automática.

Atualização mais recente: [relatório das perguntas mais erradas ao final do campeonato](RELATORIO_PERGUNTAS_MAIS_ERRADAS.md). Aplicar `platform-question-report.sql`.

Atualização mais recente: [cadastro e ativação de professores pelo superadmin](CADASTRO_PROFESSORES.md). Requer `platform-teacher-accounts.sql` e configuração única da função na Vercel.

Atualização mais recente: veja [correção na própria pergunta e professores por e-mail](ATUALIZACAO_CORRECAO_NA_PERGUNTA.md). Aplicar `platform-answer-review.sql` após a atualização de simulados.

# Atualização atual da plataforma

Consulte **ATUALIZACAO_SIMULADOS_E_NIVELAMENTO.md**. A versão atual identifica a conta administrativa existente como superadministrador, atribui professores por disciplina e e-mail/UUID, usa vinte questões no nivelamento e dez no mata-mata, mostra o gabarito após cada resposta e inclui simulados independentes por disciplina.

Execute **platform-learning-update.sql** após a migração multidisciplinas e publique juntos **index.html, app.js, platform.js, experience.js, practice.js e platform.css**. O pacote **publicacao-champions.zip** contém os seis arquivos. Todas as edições em andamento devem ser encerradas ou arquivadas antes da aplicação.

Os testes novos são **test-learning.cjs** e **test-practice-ui.cjs**. Os guias abaixo registram etapas anteriores do projeto; use o guia atual para publicar esta atualização.

---
# Champions — plataforma de campeonatos por disciplina

**Guia atual: ATUALIZACAO_MULTIDISCIPLINAS.md.** A versão local agora inclui disciplinas, bancos versionados, campeonatos independentes, permissões por professor e entrada de estudantes por código. Para atualizar, execute platform-multidisciplines.sql com a edição antiga encerrada e publique juntos index.html, app.js, platform.js, experience.js e platform.css. O pacote publicacao-champions.zip contém somente esses cinco arquivos. Não execute os SQLs antigos depois da migração da plataforma. Os detalhes abaixo descrevem versões anteriores e servem apenas como histórico.

Os bancos de Desenho Mecânico são importados da instância atual; ADS fica com banco vazio aguardando as questões. Alterações de perguntas passam a ser feitas pelo painel de cada banco, mantendo as edições existentes intactas.

Os testes novos são test-platform.cjs e test-platform-ui.cjs. O plano retomado está em PLANO_PLATAFORMA_MULTIDISCIPLINAS.md.

---
# AutoCAD Champions — implantação
> Atualização atual: o campeonato agora tem nivelamento, mata-mata por desempenho, desclassificação pelo professor e 90 segundos por questão. Consulte **ATUALIZACAO_NIVELAMENTO.md** e aplique **competition-v2.sql** após o schema. Não aplique os arquivos antigos de correção depois dessa migração.

## O que foi corrigido
- Sorteio de chaves eliminatórias para 4+ participantes, inclusive números ímpares, com avanço automático (bye).
- 10 questões iguais para cada dupla, sorteadas no servidor a partir do banco disponível.
- Pontuação registrada e validada no banco, sem enviar o gabarito ao navegador.
- Classificação automática, semifinais, final, terceiro lugar e pódio.
- Persistência de progresso e retomada após atualizar a página.
- Painel do professor com atualização por consulta a cada 2,5 segundos (não é Supabase Realtime por WebSocket).
- Login do professor com autenticação real e allowlist.

## Instalação
1. Faça **backup** do Supabase antes de aplicar alterações. As tabelas novas usam prefixo `ac_` e não substituem as antigas.
2. No SQL Editor do Supabase execute `schema.sql` e depois `questions.sql`.
3. Em **Authentication > Providers**, habilite **Anonymous Sign-Ins** (para estudantes).
4. Em **Authentication > Users**, crie uma conta de professor com e-mail/senha. Copie o UUID do usuário.
5. No SQL Editor, execute `insert into public.ac_admins(user_id) values ('UUID-DO-PROFESSOR');` substituindo pelo UUID real. Não use a service_role key no frontend.
6. Publique `index.html` e `app.js` juntos na raiz do projeto Vercel. A URL normal é a do estudante; a URL com `?professor=true` é a do professor (protegida por login).
7. Teste em vários navegadores/dispositivos. Para testar estudantes diferentes no mesmo navegador, use perfis ou janelas isoladas, pois cada sessão anônima representa um aluno.

## Regras
- Exige **4 participantes** para iniciar e definir 3 colocações.
- Inscrições encerram após o início. O professor pode usar “Arquivar e abrir nova edição”, com confirmação. O campeonato anterior é arquivado no banco e os participantes devem se inscrever novamente.
- Vence quem tiver mais acertos. Em empate, vence quem concluiu a tentativa em menor tempo total, contado desde o início da primeira pergunta; se persistir, desempate aleatório.
- O terceiro lugar é decidido entre os dois perdedores das semifinais.
- Uma chave pode incluir classificação automática sem duelo quando o total não é potência de 2.

## Limites / segurança
- O SQL foi preparado para o Supabase, mas **não foi executado na sua instância**, nem validado com as políticas existentes.
- A atualização é por polling de 2,5 segundos, não push em tempo real estrito.
- As respostas são verificadas pelo servidor, mas não há cronômetro obrigatório nem sistema anti-cola/proctoring.
- Para atualizar uma instalação existente, execute `reset.sql` no SQL Editor e publique novamente `index.html` e `app.js`. O botão “Arquivar e abrir nova edição” estará disponível no painel do professor após o início. Os arquivos em `ac_archives` só podem ser consultados pelo administrador do banco; não há tela de histórico ou restauração nesta versão.
- Recomendado configurar CAPTCHA/rate limits de login anônimo e testar a capacidade de conexões para a quantidade de alunos.

## Árvore ascendente e teste com 26 participantes
- Execute `bracket-26.sql` para atualizar o sorteio antes de iniciar uma nova edição. Não modifica a chave de uma edição já iniciada.
- Publique `index.html` e `app.js` para exibir a final no topo e as fases anteriores abaixo. O terceiro lugar fica separado.
- `preview-26.html` é uma prévia local com resultados simulados, sem conexão com o banco.
- Validação local: `node test-bracket.cjs` simula a distribuição e progressão de 4 a 64 participantes. Não substitui a validação das funções SQL no Supabase.
- Para 26 participantes: 6 avanços automáticos na fase de 32; 10 duelos iniciais, 8 nas oitavas, 4 nas quartas, 2 nas semifinais, final e terceiro lugar. Total de 26 duelos e 520 respostas.
- Teste na instância: após o professor arquivar a edição anterior, `node test-eight.cjs register 26` cadastra as sessões. Depois do sorteio pelo professor, `node test-eight.cjs play 26` executa as respostas. As sessões ficam apenas no diretório temporário local; não publique arquivos de sessão.
## Painel compacto para projeção
- A chave usa colunas flexíveis, ocupando a largura da página, sem os 170 px mínimos por confronto.
- A lista de participantes fica recolhida e pode ser expandida. Os nomes nos cards quebram linha e também aparecem completos ao manter o ponteiro sobre eles.
- O botão “Modo projeção” recolhe cabeçalho, lista, controles e pódio para destacar a chave; use “Sair da projeção” ou Escape para voltar. Continua atualizando a cada 2,5 segundos.
- Republique apenas `index.html` e `app.js`. Esta alteração não exige SQL nem reinício do campeonato.
- `preview-26.html` mostra a versão compacta com dados simulados. A visualização local pelo navegador automatizado não está disponível nesta sessão.

## Seleção de questões aprovada em 17 de outubro de 2026

O arquivo `questions.sql` preserva as 40 perguntas originais. `novas-questoes.json` contém somente as 15 novas perguntas aprovadas, com sua numeração original: 41, 42, 43, 44, 45, 47, 54, 55, 56, 58, 62, 63, 64, 67 e 80. As outras 25 foram retiradas da seleção. Na questão 47, o gabarito é ARRAY.

Execute `questions-approved.sql` no Supabase, após `competition-v2.sql`, com inscrições abertas ou uma edição encerrada. O banco passa de 40 para 55 questões, sem alterar as originais. Não é necessário republicar a página. O arquivo pode ser executado novamente sem duplicar perguntas.

`node test-approved-questions.cjs` confere a seleção, os gabaritos, a preservação das originais, a repetição da atualização e o bloqueio durante uma competição em andamento. Os PDFs anteriores com 40 questões propostas são documentos históricos de revisão; a seleção vigente é o JSON de 15 questões.

## Ampliação futura

A proposta de plataforma para várias disciplinas está registrada em `PLANO_PLATAFORMA_MULTIDISCIPLINAS.md`. O desenvolvimento dessa ampliação ficou para uma próxima etapa.
