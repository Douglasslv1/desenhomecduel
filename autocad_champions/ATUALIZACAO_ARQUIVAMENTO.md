# Finalizar e arquivar edição

Execute `platform-archive-finish.sql` no Supabase e publique `app.js` na Vercel.

O botão “Finalizar e arquivar edição” passa a marcar a fase como encerrada (`finished`) e arquivar na mesma transação. Novas respostas e o link dos estudantes são bloqueados; o professor consulta o histórico em “Ver resultados”. Partidas pendentes não recebem vencedores automaticamente.

A migração também marca como encerradas as edições já arquivadas, preservando os resultados salvos. Não modifica edições que ainda não foram arquivadas. Pode ser executada novamente.
