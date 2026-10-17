# Atualização do campeonato com nivelamento

## Aplicação em uma instalação existente

1. Faça uma cópia de segurança do banco.
2. Encerre ou arquive a edição anterior. A atualização recusa duelos antigos ainda em andamento.
3. Execute **competition-v2.sql** completo no SQL Editor do Supabase. Não execute os antigos arquivos de correção depois dele, pois eles substituem funções desta versão.
4. Publique novamente **index.html** e **app.js** juntos na Vercel.
5. Teste com participantes fictícios antes de usar com a turma.

As 40 perguntas existentes são mantidas. As novas questões de 41 a 80 continuam sendo uma proposta para revisão e não foram incluídas no banco.

Para uma instalação nova, execute schema.sql, questions.sql e competition-v2.sql, nessa ordem. A configuração de autenticação e professor continua sendo a do README.

## Nivelamento e formação do mata-mata

- As inscrições são encerradas pelo botão **Iniciar nivelamento**. Há um mínimo de quatro participantes habilitados.
- São sorteadas dez questões iguais, na mesma ordem, para todos os inscritos habilitados.
- O painel mostra o progresso e a pontuação de cada participante. O professor acompanha os acertos e o total respondido, incluindo questões expiradas.
- Depois que todos concluírem ou esgotarem os prazos, o botão **Formar mata-mata por desempenho** fica disponível. A formação é feita pelo professor.
- A ordenação usa acertos decrescentes, menor tempo total de conclusão e um desempate aleatório persistente quando os dois critérios forem exatamente iguais.
- O campeonato continua com uma única chave e um único pódio. Os confrontos da primeira rodada são entre vizinhos nessa ordenação. Nas rodadas seguintes os vencedores seguem a chave.
- Havendo vagas automáticas, os melhores resultados do nivelamento recebem essas vagas, distribuídas pela primeira fase. Com 26 participantes habilitados são seis vagas automáticas e dez duelos iniciais. As duplas disputadas correspondem às posições 7 e 8, 9 e 10, até 25 e 26.
- Se desclassificações reduzirem o total habilitado para menos de quatro antes do mata-mata, o professor deverá arquivar a edição e abrir novas inscrições.

## Prazo de cada pergunta

- Cada pergunta tem **90 segundos**. O prazo é registrado e verificado no banco.
- No nivelamento, o relógio da primeira pergunta começa quando o professor inicia a etapa. Os alunos devem estar conectados e prontos.
- Nos duelos, o relógio começa quando os dois adversários estão definidos. Um classificado aguarda sem cronômetro até a formação do seu próximo duelo.
- Após uma resposta aceita, o prazo da pergunta seguinte começa imediatamente. Ao expirar, a pergunta vale zero e o prazo seguinte segue a partir do vencimento anterior.
- Recarregar, fechar a página, trocar o relógio do computador ou perder a conexão não reinicia nem pausa o prazo.
- As consultas do painel e dos estudantes processam vencimentos. Se todos ficarem desconectados, os vencimentos acumulados são processados no próximo acesso, preservando os prazos originais.
- O navegador recebe apenas a pergunta atual, sem o gabarito. Respostas fora de ordem, atrasadas ou de outro usuário não são aceitas.

## Desclassificação

- No mata-mata, o botão **Desclassificar** fica visível junto ao nome do jogador no próprio card do confronto, inclusive no modo projeção. Aparece apenas no confronto ainda não resolvido de um participante habilitado.
- Em **Participantes e resultados do nivelamento**, cada participante ainda habilitado também tem um botão **Desclassificar**. A lista abre automaticamente na inscrição e no nivelamento, podendo ser recolhida pelo professor.
- A ação exige motivo e confirmação. O banco exige autenticação de professor e registra responsável, data e motivo.
- No nivelamento, o participante desclassificado é retirado da formação da chave.
- No mata-mata, o adversário habilitado avança sem precisar concluir as respostas. Caso ainda não tenha sido definido, o avanço é resolvido assim que a chave o definir.
- Um desclassificado não pode continuar respondendo nem disputar o terceiro lugar. Se não houver participante habilitado para uma colocação, ela aparece como não atribuída.
- O painel não permite desfazer a desclassificação nem alterar retroativamente um pódio já encerrado. Participantes já eliminados não recebem o botão.
- A nova edição continua usando **Arquivar e abrir nova edição**. O arquivo inclui nivelamento, respostas, prazos, resultados e registros de desclassificação.

## Validação local

`test-competition-v2.cjs` usa PostgreSQL embarcado em memória, sem conexão com o Supabase. A dependência de teste é instalada em .test-runtime e não é publicada na Vercel.

O teste cobre 26 participantes, nivelamento, formação por ranking, seis vagas automáticas, duelos até o pódio, respostas fora de ordem e de outro usuário, vencimentos, desclassificação, terceiro lugar sem participante habilitado, arquivamento e permissões de acesso.

`test-ui-v2.cjs` cobre as telas, a contagem de tempo, a retomada, o retorno de resposta expirada e as ações do professor. Os testes existentes de reset e de renderização da chave também continuam disponíveis.

Para reproduzir o teste em banco local: instale `@electric-sql/pglite` com `npm install --prefix .test-runtime --no-save --package-lock=false @electric-sql/pglite` e execute `node test-competition-v2.cjs`.

Para testar a versão publicada com participantes fictícios, o roteiro agora tem duas etapas: `node test-eight.cjs register 26`, professor inicia o nivelamento, `node test-eight.cjs level 26`, professor forma o mata-mata e `node test-eight.cjs play 26`. Os estudantes simulados respondem em sessões independentes; as requisições são feitas pela API e não validam a aparência da página. Use 8 no lugar de 26 para o teste menor. O relógio já estará correndo após cada ação do professor.

Esses testes locais não confirmam a aplicação da migração na instância publicada nem substituem a conferência visual no navegador.
