# Ampliação futura para várias disciplinas

Registrado em 17 de outubro de 2026 a pedido do professor. A implementação local foi retomada na mesma data. A publicação depende da aplicação de platform-multidisciplines.sql e da atualização dos arquivos da página, conforme ATUALIZACAO_MULTIDISCIPLINAS.md.

## Estrutura pretendida

Professor → Disciplina → Banco de questões → Edição do campeonato.

- Um único perfil de professor poderá acessar várias disciplinas, sem precisar de outra conta para ADS.
- A entrada da plataforma terá botões por disciplina, começando por Desenho Mecânico e Análise e Desenvolvimento de Sistemas.
- Cada disciplina poderá ter vários bancos de questões. As questões de ADS serão enviadas posteriormente pelo professor.
- Cada edição escolherá um banco e manterá seus próprios participantes, nivelamento, chaveamento, desclassificações, resultados e pódio.
- Campeonatos poderão ocorrer simultaneamente sem compartilhar o estado da competição.
- Estudantes acessarão cada edição por link ou código específico.
- Outros professores poderão ter permissões próprias para as disciplinas sob sua responsabilidade.
- Cada edição deverá guardar uma versão das perguntas utilizadas; editar um banco não poderá alterar um campeonato já iniciado.

## Regras que serão preservadas

- Dez questões de nivelamento iguais para todos os participantes da edição.
- Primeira rodada do mata-mata entre resultados próximos, mantendo um campeonato único e um pódio por edição.
- Prazo de 90 segundos por pergunta, validado no servidor.
- Desclassificação pelo professor, com motivo, registro e avanço do adversário habilitado.
- Arquivamento de resultados e abertura de novas edições.

## Primeira etapa quando o trabalho for retomado

1. Separar os dados e as permissões por disciplina e edição.
2. Migrar o conteúdo atual para Desenho Mecânico, preservando perguntas e histórico.
3. Criar a página de escolha de disciplinas e os painéis independentes.
4. Disponibilizar ADS aguardando suas questões, sem liberar campeonato sem banco configurado.
5. Repetir os testes com participantes fictícios antes de usar com turmas reais.

A versão local implementa um catálogo por disciplina e banco, com dados de competição isolados por edição. A migração importa o conteúdo antigo para Desenho Mecânico e cria ADS com banco vazio. A criação de disciplinas, bancos, edições, edição e importação de questões, links próprios, permissões por professor e histórico congelado estão disponíveis. Os testes locais e os limites da validação estão descritos no guia de atualização.
