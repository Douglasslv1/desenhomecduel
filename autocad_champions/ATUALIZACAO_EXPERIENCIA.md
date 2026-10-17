# Confirmações e comemorações da plataforma

## Publicação

Esta atualização não altera o banco e não requer SQL. Publique juntos index.html, app.js, platform.js, experience.js e platform.css. O pacote publicacao-champions.zip contém somente esses cinco arquivos, prontos para extração na raiz da publicação.

## Confirmações

As caixas nativas confirm e prompt foram substituídas por um diálogo com o visual da plataforma nas ações de início do nivelamento, formação do mata-mata, desclassificação, arquivamento, retirada de acesso de professor, atualização e importação de perguntas.

A desclassificação reúne o motivo e a confirmação no mesmo diálogo. O motivo continua obrigatório, com 3 a 500 caracteres. O servidor mantém todas as verificações já existentes.

O diálogo usa foco de teclado, nomes e descrições acessíveis, botões claros de confirmação e cancelamento, suporte a Escape e retorno do foco ao controle de origem quando possível. Os detalhes aparecem como texto, sem interpretar nomes ou enunciados como HTML. Ações simultâneas não abrem vários diálogos sobrepostos.

## Comemorações

- Vencedor de rodada que aguarda outro adversário: tela de classificação com mensagem de vitória e confetes.
- Vencedor cujo próximo duelo já começou: aviso breve, sem bloquear o questionário ou pausar o cronômetro.
- Classificação automática: mensagem própria de classificação, sem apresentar a vaga como vitória em um duelo disputado.
- Primeiro, segundo e terceiro lugares: mensagens e símbolos próprios, com confetes. A finalização da disputa de terceiro lugar não é necessária para reconhecer a colocação de quem já encerrou a final.
- Painel do professor: comemoração do campeão quando o campeonato termina.
- Desclassificados e histórico arquivado: sem comemoração.

Cada evento é registrado na sessão do navegador por edição, participante e rodada. O polling e a atualização da página não repetem os confetes já exibidos na mesma sessão. A tela de classificação continua visível enquanto o jogador aguarda. Abrir uma nova sessão de navegador pode exibir novamente a comemoração, sem alterar resultados.

Os confetes duram poucos segundos, usam um canvas sem interceptar cliques e são desativados quando a pessoa prefere movimento reduzido. A mensagem de conquista continua disponível. Os avisos podem ser fechados e desaparecem automaticamente; não impedem responder às questões.

## Validação

Testes locais: node test-experience.cjs, node test-ui-v2.cjs, node test-platform-ui.cjs, node test-reset.cjs e node test-bracket.cjs.

Foram verificados confirmação, cancelamento, Escape, validação do motivo, clique de desclassificação, rodada, vaga automática, três colocações do pódio, ausência de repetição no polling e na recarga, preferência por movimento reduzido e ausência de chamadas a caixas nativas nos fluxos da página.

A atualização não foi publicada por esta tarefa. A aparência no navegador e as comemorações no site precisam ser conferidas depois da publicação, em uma nova edição com participantes fictícios.
