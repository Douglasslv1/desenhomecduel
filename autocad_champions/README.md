# AutoCAD Champions — implantação

## O que foi corrigido
- Sorteio de chaves eliminatórias para 4+ participantes, inclusive números ímpares, com avanço automático (bye).
- 10 questões iguais para cada dupla, escolhidas no servidor entre 40; 10 novas por duelo.
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
- Vence quem tiver mais acertos. Em empate, vence quem concluiu as 10 respostas em menor intervalo entre a primeira e a última; se persistir, desempate aleatório.
- O terceiro lugar é decidido entre os dois perdedores das semifinais.
- Uma chave pode incluir classificação automática sem duelo quando o total não é potência de 2.

## Limites / segurança
- O SQL foi preparado para o Supabase, mas **não foi executado na sua instância**, nem validado com as políticas existentes.
- A atualização é por polling de 2,5 segundos, não push em tempo real estrito.
- As respostas são verificadas pelo servidor, mas não há cronômetro obrigatório nem sistema anti-cola/proctoring.
- Para atualizar uma instalação existente, execute `reset.sql` no SQL Editor e publique novamente `index.html` e `app.js`. O botão “Arquivar e abrir nova edição” estará disponível no painel do professor após o início. Os arquivos em `ac_archives` só podem ser consultados pelo administrador do banco; não há tela de histórico ou restauração nesta versão.
- Recomendado configurar CAPTCHA/rate limits de login anônimo e testar a capacidade de conexões para a quantidade de alunos.
