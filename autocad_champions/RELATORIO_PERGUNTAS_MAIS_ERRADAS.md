# Revisão das perguntas mais erradas

## Atualização

1. Execute `platform-question-report.sql` completo no SQL Editor do Supabase. As migrações anteriores da plataforma devem estar instaladas. Pode ser aplicado sem encerrar uma partida em andamento: ele apenas adiciona uma consulta protegida, sem alterar respostas, perguntas ou resultados.
2. Publique os arquivos de `publicacao-champions.zip`, preservando a pasta api e o arquivo .vercelignore. As variáveis já configuradas na Vercel continuam as mesmas; esta melhoria não exige novas chaves.
3. Atualize a página após a publicação.

## Uso pelo professor

Depois de finalizar o campeonato, aparece o botão **Ver perguntas mais erradas**, abaixo do pódio. Ele abre uma revisão com enunciado, alternativas, resposta correta em verde e contagens da turma. O professor pode escolher campeonato completo, nivelamento ou mata-mata. O relatório também funciona ao abrir o painel de uma edição encerrada e arquivada.

A ordenação usa o número de respostas sem acerto, somando alternativas erradas e tempo esgotado. Em empate, considera o percentual sem acerto e o número da questão. Cada item discrimina acertos, alternativas erradas e tempo esgotado para ajudar a conduzir a revisão.

As contagens são de respostas, não de alunos: a mesma pessoa pode responder à questão em mais de um duelo. A quantidade de participantes distintos que responderam também aparece. Respostas de desclassificados são excluídas. Perguntas que tiveram apenas acertos não entram na lista. Questões nunca respondidas não entram no relatório. Não há nomes de alunos nessa revisão.

O relatório usa a cópia das questões guardada no campeonato; alterar o banco de questões para uma próxima edição não modifica esse histórico.

Somente o superadministrador e os professores ativos com acesso à disciplina podem consultá-lo. Alunos e professores de outras disciplinas não têm acesso; a consulta é bloqueada antes do encerramento, inclusive por chamadas diretas.

## Validação local

Testadas contagens e percentuais, filtros por etapa, questão repetida em etapas diferentes, tempo esgotado, exclusão de desclassificados, edição arquivada, mudanças futuras no banco, lista sem respostas e bloqueios por perfil e disciplina. A interface foi verificada para abertura, filtro, fechamento, mensagem de falha e exibição segura do enunciado.
