# Registro de perdas de foco no mata-mata

1. Execute `platform-focus-events.sql` no SQL Editor do Supabase, após as migrações já instaladas (incluindo `platform-answer-review.sql`). Pode ser executado novamente. Não requer encerrar edições existentes.
2. Publique juntos `index.html`, `app.js`, `focus.js`, `platform.js` e `platform.css`, mantendo os demais arquivos da aplicação.
3. Atualize as páginas dos estudantes e professores. Durante um confronto, alterne a aba e volte: o aluno verá um aviso; o painel do professor exibirá o indicador ao lado do nome na lista e na árvore na próxima consulta (a cada 2,5 segundos).
4. Abra o indicador para consultar horários e tipos de evento. Na árvore, aparecem somente as ocorrências daquele confronto; na lista, o total da edição. O botão de desclassificação continua manual, com motivo e confirmação.

Somente o mata-mata é monitorado, incluindo os intervalos de revisão de resposta dentro do confronto. Nivelamento, simulados e espera não registram eventos. `blur` e aba oculta são agrupados até a página voltar a estar visível e com foco. O relógio das perguntas continua normalmente.

Os registros ficam em `public.cp_focus_events`, com edição, aluno, tentativa, confronto, identificador do evento, tipo, horário informado pelo navegador e horário de recebimento pelo servidor. Estudantes só podem registrar eventos das próprias tentativas do mata-mata. Apenas professores autorizados na disciplina podem consultar o relatório, inclusive após o arquivamento.

Envios pendentes são guardados no sessionStorage e reenviados nas consultas seguintes, no retorno à janela e na recuperação da conexão. Reenvios do mesmo identificador não duplicam ocorrências. Fechar a aba antes do envio pode perder o registro. Falhas de consulta são mostradas ao professor; falhas de envio são informadas ao aluno. O horário do dispositivo pode estar incorreto e os sinais podem ser bloqueados ou manipulados pelo navegador: não se trata de prova de fraude nem de monitoramento garantido. Notificações e trocas acidentais podem causar perda de foco. Não há desclassificação automática.

Validação local: `node test-focus-events.cjs` (PGlite e simulação dos eventos do navegador). A migração não foi executada no Supabase de produção.
