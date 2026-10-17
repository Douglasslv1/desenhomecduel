-- 15 questões aprovadas em 17/10/2026. Preserva as 40 questões originais.
-- Requer competition-v2.sql. Execute apenas com inscrições abertas ou edição encerrada.
-- Os números originais da proposta são preservados para facilitar a identificação.
begin;
do $$ begin
 perform pg_advisory_xact_lock(100019);
 if (select phase from public.ac_settings where id=1) not in ('registration','finished') then
  raise exception 'Encerre ou arquive a edição antes de atualizar o banco de questões';
 end if;
end $$;
insert into public.ac_questions(id,statement,options,correct) values
(41,'41. Uma placa tem largura total de 80 mm. Um furo deve ficar centralizado nessa largura. Qual deve ser a distância do centro do furo a cada uma das duas bordas laterais?','["A) 20 mm","B) 40 mm","C) 60 mm","D) 80 mm","E) 160 mm"]'::jsonb,1),
(42,'42. Uma placa retangular tem 100 mm de comprimento e 60 mm de largura. Você precisa criar um contorno interno a 5 mm de todas as bordas. Qual combinação está correta?','["A) OFFSET de 5 mm para dentro; contorno de 90 × 50 mm","B) OFFSET de 5 mm para dentro; contorno de 95 × 55 mm","C) SCALE com fator 0,5; contorno de 50 × 30 mm","D) MOVE de 5 mm; contorno de 100 × 60 mm","E) OFFSET de 10 mm para fora; contorno de 120 × 80 mm"]'::jsonb,0),
(43,'43. O centro de um furo deve ficar exatamente no meio de um segmento de 120 mm. Ao posicioná-lo no AutoCAD, qual recurso evita estimar esse ponto visualmente?','["A) OSNAP Endpoint","B) OSNAP Nearest","C) OSNAP Midpoint","D) Zoom Extents","E) Alterar a espessura da linha"]'::jsonb,2),
(44,'44. Você desenhou a metade esquerda de uma peça simétrica e quer gerar a metade direita, mantendo a original. Qual procedimento é adequado?','["A) Usar MIRROR com o eixo central e manter os objetos de origem","B) Usar MOVE e apagar a metade esquerda","C) Usar SCALE com fator 2","D) Usar TRIM no eixo central","E) Usar ROTATE com qualquer ponto-base"]'::jsonb,0),
(45,'45. Uma linha horizontal ultrapassou o contorno externo de uma peça. Apenas o trecho que ficou para fora deve desaparecer. Qual ação resolve o problema?','["A) Apagar a linha inteira com ERASE","B) Usar EXTEND para alongá-la","C) Usar TRIM com o contorno como limite","D) Usar OFFSET para duplicá-la","E) Usar JOIN com a linha de cota"]'::jsonb,2),
(47,'47. Você precisa distribuir seis furos iguais, com espaçamento angular uniforme, ao redor do centro de um disco. Qual comando permite criar essas repetições de forma organizada?','["A) MIRROR","B) ARRAY","C) OFFSET","D) SCALE","E) TRIM"]'::jsonb,1),
(54,'54. As hachuras dificultam a seleção de detalhes internos. Você quer ocultá-las temporariamente, sem apagá-las. Qual organização facilita essa tarefa?','["A) Colocar hachuras em layer próprio e desligá-lo temporariamente","B) Colocar todos os objetos no Layer 0","C) Transformar cada hachura em uma cota","D) Aumentar a espessura dos contornos","E) Reduzir a escala de todo o desenho"]'::jsonb,0),
(55,'55. Você precisa representar um furo de diâmetro 12 mm usando o comando CIRCLE pela opção de raio. Qual valor deve informar?','["A) 3 mm","B) 6 mm","C) 12 mm","D) 24 mm","E) 36 mm"]'::jsonb,1),
(56,'56. Um arredondamento deve unir duas linhas com raio de 4 mm. Antes de selecionar as linhas no FILLET, qual valor precisa ser configurado?','["A) Diâmetro de 4 mm","B) Ângulo de 4 graus","C) Raio de 4 mm","D) Escala de 4:1","E) Espessura de 4 mm no layer"]'::jsonb,2),
(58,'58. Uma linha deve partir de um ponto e permanecer exatamente horizontal durante o desenho. Qual recurso ajuda a restringir o movimento às direções horizontal e vertical do UCS atual?','["A) Modo Ortho","B) Hachura sólida","C) Layer bloqueado","D) Zoom Window","E) Estilo visual Realistic"]'::jsonb,0),
(62,'62. Uma cavidade interna gera muitas linhas ocultas e fica difícil de entender nas vistas externas. Qual recurso de representação pode tornar o interior mais claro?','["A) Aumentar apenas a cor de fundo","B) Retirar todas as cotas","C) Apresentar uma vista em corte que atravesse a cavidade","D) Desenhar a peça em escala aleatória","E) Duplicar a mesma vista externa"]'::jsonb,2),
(63,'63. Uma vista em corte atravessa uma peça com um furo vazio. Qual parte deve receber hachura nessa seção?','["A) Somente o espaço vazio do furo","B) Toda a folha de desenho","C) Apenas as linhas de cota","D) O material sólido interceptado pelo plano de corte","E) Somente a linha de centro do furo"]'::jsonb,3),
(64,'64. Uma placa mede 100 mm de comprimento. O centro de um furo fica a 25 mm da borda esquerda. Qual é a distância desse centro à borda direita?','["A) 25 mm","B) 50 mm","C) 75 mm","D) 100 mm","E) 125 mm"]'::jsonb,2),
(67,'67. Um contorno parece fechado, mas existe uma pequena abertura entre duas extremidades. Antes de aplicar uma hachura sem tolerância a aberturas, qual atitude é mais adequada?','["A) Trocar somente a cor da hachura","B) Fechar a abertura, fazendo as extremidades coincidirem","C) Imprimir antes de conferir o contorno","D) Duplicar todas as linhas","E) Reduzir o tamanho do cursor"]'::jsonb,1),
(80,'80. Um modelo 3D está sendo exibido apenas por linhas, dificultando distinguir suas faces. Você quer uma visualização sombreada, sem alterar suas dimensões. O que fazer?','["A) Aumentar todas as dimensões com SCALE","B) Converter o sólido em linhas com EXPLODE","C) Trocar para um estilo visual sombreado, como Shaded","D) Aplicar uma cota em cada face","E) Apagar as arestas que aparecem ao fundo"]'::jsonb,2)
on conflict(id) do update set statement=excluded.statement,options=excluded.options,correct=excluded.correct;
commit;
select count(*) as total_questoes from public.ac_questions;
