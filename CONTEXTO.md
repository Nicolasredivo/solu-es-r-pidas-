# Contexto do projeto (leia antes de começar)

Este arquivo existe para que uma nova sessão do Claude entenda rapidamente
onde o projeto está, sem precisar do histórico da conversa anterior.

## Quem é o usuário

Dono de uma empresa de manutenção predial. **Não tem formação técnica**: não
programa e não conhece jargão. Explique tudo em linguagem do dia a dia,
evite termos técnicos, e prefira sempre a solução mais simples que funcione.
Ele acompanha bem quando o passo a passo é curto e literal ("clique no botão
X, no canto Y").

Trabalhe em etapas pequenas: planejar → confirmar com ele → executar → mostrar
o resultado. Ele gosta de ver funcionando antes de seguir.

## O que é o projeto

Um app PWA (site instalável) que serve de interface para o sistema dele.
Quem executa as automações de verdade é o **n8n**, e o app é só a "tela".

- Publicado em: https://nicolasredivo.github.io/solu-es-r-pidas-/
- Repositório: `Nicolasredivo/solu-es-r-pidas-`
- Branch de trabalho: `claude/pwa-n8n-interface-6s1orn`
- Feito em HTML, CSS e JavaScript puro, **sem framework e sem build** —
  decisão deliberada para manter simples e leve. Mantenha assim.

## Ambiente dele

- **Windows**, n8n rodando local via Node (`n8n` no CMD), em `http://localhost:5678`
- n8n exposto para a internet por **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:5678`),
  em `C:\cloudflared`. O endereço muda a cada reinício do túnel.
- O app precisa do túnel ligado para funcionar; para editar workflows, não precisa.

## Estado atual do app

- Tela de entrada com senha (conferida pelo n8n, não pela tela)
- Opção "Lembrar neste aparelho" e ajuste do endereço do n8n pela própria tela
  de entrada (salvo no aparelho, tem prioridade sobre `config.js`)
- Depois de entrar: menu lateral (retrátil no celular, fixo no computador)
- **Layout responsivo**: mesmas funcionalidades no celular e no computador, só
  o aproveitamento do espaço muda (ver "Padrão de layout" abaixo)
- Página **Cadastro**, com abas "Adicionar" e "Consultar"
  - Adicionar: campo de CPF/CNPJ com formatação e validação de dígitos,
    detecção automática do tipo, consulta de duplicado + dados da Receita
    (incluindo endereço, que já vira o primeiro bloco preenchido), formulário
    completo da tabela Entidades, endereços e contatos sem limite, e botões
    Salvar/Cancelar
  - Consultar: lista todos os cadastros, busca, abre/edita/exclui — inclusive
    endereços e contatos de um cadastro existente
- Página **Financeiro**, com abas "Contas a pagar", "Contas fixas" e "Resumo"
  - Contas a pagar: lançar (com parcelamento), filtrar por situação e mês,
    marcar como paga, editar pelo lápis, excluir uma ou o grupo de parcelas
  - Contas fixas: o que se repete todo mês; o sistema lança sozinho no dia
  - Resumo: previsão de saída dos próximos 6 meses, por categoria e por
    fornecedor
- Rodapé do menu: **Sair** (dois toques) e versão do app instalada
- Indicador de conexão com o n8n na barra superior
- Aviso ao tentar sair (menu, aba, fechar a janela) com algo não salvo —
  cadastro novo em andamento ou edição aberta na Consulta
- Botão voltar do celular fecha o menu ou o cadastro aberto, em vez de sair do app
- Telefone sempre salvo com código do país (55); a tela mostra formatado

## Airtable

Base **"cadastro"** (`app6PyYmtFduIMp7B`), com 3 tabelas ligadas entre si:

- `Entidades_Cadastradas` (`tbl5Joji6gAir3mNh`) — clientes; é a tabela "mãe"
- `Locais_Atendimento` (`tblffVczCf1VeNxs7`) — endereços de cada cliente
- `Contatos_Solicitantes` (`tblXXOEOCwQnC2qFX`) — pessoas que abrem chamado

Base **"Financeiro"** (`appjAmWXV7Zr33UqE`), criada em 22/08/2026:

- `Despesas` (`tblNduEKl2jY280V0`) — contas a pagar. Cada parcela é uma linha
  própria; o campo `Grupo` liga as parcelas da mesma compra.
- `Fornecedores` (`tblhsabIIg8SLqMMj`) — nome + CNPJ (criada em 25/08/2026)
- `Recorrentes` (`tblb8QplhcGRP6SZ7`) — a regra das contas fixas, não as contas
  em si (criada em 25/08/2026)

Em `Despesas` sobrou o campo antigo `Fornecedor` (texto solto), substituído pelo
vínculo `Fornecedor_Ref` + o lookup `Fornecedor_Nome`. A API do Airtable não
apaga campo; ele ficou lá sem uso e só some pela tela do Airtable.

Existe também uma base maior, **"ERP Soluções Rápidas - Produção"**
(`appvRrT2s6rK7jOKh`), com 17 tabelas (Chamados/Work Orders, Técnicos,
Materiais, Fornecedores, Faturas, Despesas, Veículos…). **Não é usada pelo app
e não deve ser usada como base para construir** — foi decidido em 22/08/2026
que ela serve só de referência/inspiração; o ERP é construído do zero, peça por
peça, conforme a necessidade real aparecer.

## Workflows do n8n

Todos criados, publicados e testados de ponta a ponta:

| Workflow | Caminho do webhook | ID no n8n |
|---|---|---|
| `App - Testar conexao` | `/webhook/testar-conexao` | `cgtZoemwpad0tVTN` |
| `App - Consultar documento` | `/webhook/consultar-documento` | `jIZWUEwHUU8KnCVR` |
| `App - Salvar entidade` | `/webhook/salvar-entidade` | `dFV53YYjsktzuEWw` |
| `App - Listar cadastros` | `/webhook/listar-cadastros` | `cfcdcr5qYWIVtko2` |
| `App - Detalhe do cadastro` | `/webhook/detalhe-cadastro` | `fknumisB42zBZNjS` |
| `App - Atualizar cadastro` | `/webhook/atualizar-cadastro` | `1UbdhChF8Pfse0of` |
| `App - Excluir cadastro` | `/webhook/excluir-cadastro` | `Zeyk3CwEDKeHjf3G` |
| `App - Salvar despesa` | `/webhook/salvar-despesa` | `srhsmBQE202yhtrU` |
| `App - Listar despesas` | `/webhook/listar-despesas` | `pvDggp2tA894MToU` |
| `App - Atualizar despesa` | `/webhook/atualizar-despesa` | `TZ7jynwhg0Al4BCo` |
| `App - Excluir despesa` | `/webhook/excluir-despesa` | `3dWn81rxmpgb15D6` |
| `App - Consultar CNPJ` | `/webhook/consultar-cnpj` | `RBtMasPgT2AtZKMv` |
| `App - Salvar fornecedor` | `/webhook/salvar-fornecedor` | `D7Jd1R0AlZ9FBV8w` |
| `App - Listar fornecedores` | `/webhook/listar-fornecedores` | `WRbYRCTL0pqtFBlB` |
| `App - Salvar recorrente` | `/webhook/salvar-recorrente` | `kMsLgZxxoOHnR3FB` |
| `App - Listar recorrentes` | `/webhook/listar-recorrentes` | `ZdfVXhs49hfaP8Ju` |
| `App - Excluir recorrente` | `/webhook/excluir-recorrente` | `xoFsbiv2DsLrNrU9` |
| `App - Gerar despesas recorrentes` | `/webhook/gerar-recorrentes` | `1QcqoaGJKuiCTx91` |

Cada arquivo em `n8n/` tem o nome do caminho do webhook correspondente.

As cópias em `n8n/*.json` são só backup/referência. **Nelas a senha aparece
como `TROQUE-ESTA-SENHA` de propósito** — o repositório é público e a senha
real vive só dentro do n8n. Quem reimportar precisa trocar na mão.

## Como mexer no n8n direto pela API (evita importação manual)

Foi a falta disso que travou o projeto antes. Funciona assim:

- A chave da API fica em `C:\Users\rediv\chave-n8n.txt`, **fora do repositório
  e fora do OneDrive**. Criada no n8n em Settings → n8n API.
- Chamadas: `http://localhost:5678/api/v1/...` com o cabeçalho `X-N8N-API-KEY`.
- Dá para listar, criar, alterar (`PUT`) e publicar (`POST .../activate`).
- Dois detalhes que custaram tempo:
  - `PUT` **despublica** o workflow — tem que republicar depois.
  - A API só aceita `settings: {"executionOrder":"v1"}`; chaves que a tela
    aceita (como `binaryMode`) fazem a API recusar com erro 400.
- Para depurar, `GET /executions?workflowId=...&includeData=true` mostra o que
  entrou e saiu de cada nó. É o jeito mais rápido de achar erro.

## Coisas descobertas testando (não repetir o erro)

- **Versão do n8n: 2.31.5.** O nó do Airtable é o **2.2**, não o 2.1.
  A diferença importa: no 2.1 os campos do registro vinham soltos na raiz;
  no 2.2 vêm dentro de `.fields`. Ler do lugar errado devolve vazio calado.
- **A Receita (BrasilAPI) limita consultas por minuto** e responde 429 quando
  passa. Não é defeito. O workflow tenta 3 vezes e, se não conseguir, deixa o
  cadastro seguir com o formulário em branco em vez de travar.
- O nó `Consulta a Receita` manda `User-Agent: SolucoesRapidas-App/1.0 (n8n)`.
  Sem User-Agent nenhum, a BrasilAPI responde 403.
- Listas do Airtable (Tipo, Exigência, Status) recusam texto vazio. O nó
  `Prepara dados` converte vazio em `null`, que o Airtable entende como
  "em branco". Sem isso, campo opcional não preenchido quebraria o salvamento.
- Os nomes das opções no app batem exatamente com os do Airtable. Se mudar um
  lado, tem que mudar o outro.
- **O n8n executa um nó de cada vez, mesmo em ramos "paralelos".** Testado em
  25/08/2026: três buscas ao Airtable num workflow só levam ~2s (a soma), e
  separá-las em ramos paralelos com o nó Merge não mudou nada. Medido: o n8n
  em si custa ~40ms; cada ida ao Airtable custa ~700ms. Quem paraleliza de
  verdade é o **navegador** — por isso as leituras do Financeiro são três
  workflows pequenos que o app dispara juntos (~800ms no total).
- **O Airtable não devolve caixinha desmarcada** — o campo simplesmente não
  vem na resposta. Ler `campo === undefined ? true : ...` faz "desmarcado"
  virar "marcado". Use `Boolean(campo)` direto.
- O Airtable aceita no máximo **10 registros por chamada** (criar, alterar ou
  apagar). Os nós que gravam em lote já quebram a lista de 10 em 10.

## Aba Consultar (feita em 16/08/2026)

Lista todos os cadastros, um por linha: CPF/CNPJ, razão social, e embaixo
nome fantasia · contato. Clicar abre o cadastro ali mesmo; **um aberto por vez**.

Aberto, os campos nascem travados e parecem texto comum (o CSS tira borda e
fundo de campo desabilitado). O **lápis** destrava e só então aparecem Salvar e
Cancelar. **Excluir precisa de dois cliques**: o primeiro vira "Confirmar
exclusão" em vermelho e avisa quantos endereços e contatos vão junto.

**Editar mexe só nos dados do cliente.** Endereços e contatos aparecem só para
ver — foi decisão consciente, para sair funcionando antes. Editá-los é o
próximo passo natural.

**Excluir apaga em cascata**: endereços e contatos primeiro, o cliente por
último, para não sobrar endereço apontando para um cliente que não existe mais.
Os IDs vêm do próprio app (ele acabou de abrir o cadastro), então o n8n não
precisa procurar de novo.

Detalhes que custaram tempo:

- **O nó do Airtable roda uma vez por item que chega.** No detalhe, três
  endereços fariam a busca de contatos rodar três vezes. Por isso existe o nó
  `Guarda os locais`, que volta para um item só.
- **`FIND('', {campo})` casa com tudo.** As buscas por ligação usam o CPF/CNPJ
  (campo principal da tabela de Entidades). Documento vazio viraria uma busca
  que traz a tabela inteira, então nesse caso a fórmula vira `FALSE()`.
- **Excluir usa o nó HTTP**, não o do Airtable: o endereço da chamada pode
  mudar por item, então um nó só apaga nas três tabelas. O Airtable apaga no
  máximo 10 por chamada, e o código já divide em lotes.
- Campo de status na tela **precisa manter a própria classe** ao mudar de cor.
  Reescrever `className` inteiro apagava o nome pelo qual o elemento é achado.

## Rodada de ajustes (17/08/2026)

- **Cancelar no cadastro**, com dois cliques (o segundo confirma), igual ao
  Excluir. Um toque sem querer apagaria tudo que foi digitado.
- **`Empresa_Sindicos`**: campo novo, opcional. É diferente de `Administradora`
  — uma administra o condomínio, a outra fornece o síndico profissional.
- **`WhatsApp_Financeiro` virou `WhatsApp_CNPJ`.** O número que a Receita
  devolve nunca foi o do financeiro; agora o nome diz o que ele é. Renomear
  campo a API permite (trocar o tipo, não).
- **O endereço da Receita vira o primeiro bloco de endereço, já preenchido.**
  Continua dando para apagá-lo ou acrescentar outros.
- **Endereços e contatos agora são editáveis na aba Consultar.**

O que tornou a edição viável: as funções de bloco (`adicionarLocal`,
`reiniciarLocais`, `locaisPreenchidos` e as equivalentes de contato) **recebem
a caixa onde os blocos ficam**. As mesmas servem ao formulário de cadastro e à
edição na consulta — os moldes do HTML são reaproveitados nos dois lugares.

Cada bloco guarda o código do registro em `dataset.id`. Na hora de salvar:
bloco **com** id vira alteração, **sem** id vira criação, e o que sumiu da tela
entra em `locaisApagar` / `contatosApagar`. **Depois de salvar, o detalhe é
relido do n8n** — é o que traz os códigos dos registros recém-criados; sem
isso, salvar duas vezes seguidas criaria tudo de novo.

O `App - Atualizar cadastro` foi refeito: um nó Code monta a fila de chamadas
(PATCH, POST e DELETE nas três tabelas) e **um único nó HTTP executa todas** —
o método e o endereço mudam por item. Muito mais curto do que uma trilha de
nós do Airtable, e é o mesmo truque já usado no Excluir.

Em modo leitura os botões somem pela classe `somente-leitura` no CSS, não um a
um: assim a renumeração dos blocos não briga com a visibilidade ao destravar.

## O básico de sistema: Sair, aviso de perda, versão, conexão, telefone com 55 (21/08/2026)

Feito por outra sessão (`claude rc`, controle remoto) rodando em paralelo a esta
mesma branch — por isso vale registrar aqui com cuidado, para quem ler depois
entender o que veio de onde. Revisado nesta sessão em seguida (ver abaixo).

- **Sair** no rodapé do menu, dois toques. Apaga a senha guardada (senão o app
  entraria sozinho de novo) e preserva o endereço do n8n (é do aparelho, não
  da sessão).
- **Indicador de conexão** na barra superior, alimentado pelas chamadas que o
  app já faz (função única `fetchN8n`), sem ficar testando o servidor à toa.
- **Versão do app** visível no menu (`APP_VERSION` em `app.js`, sobe junto com
  `CACHE_NAME` em `service-worker.js` a cada publicação).
- **Botão voltar do celular** fecha o menu ou o cadastro aberto na Consulta,
  em vez de sair do app — duas camadas só, via `history.pushState`.
- **Aviso suave** (não bloqueia) quando e-mail ou telefone não parecem válidos.
- **Telefone sempre com código do país.** Guardado como `5554999998888`,
  mostrado como `+55 (54) 99999-8888`. Decisão pelo **tamanho** do número, nunca
  pelo prefixo — 55 também é DDD (Santa Maria/RS), então só ganha o país quem
  tem 10 ou 11 dígitos locais. Normaliza na leitura (`valoresDosCanais`), então
  cobre Adicionar e Consulta de uma vez. Números antigos sem o 55 (o do OPERA,
  por exemplo) ganham o prefixo sozinhos na próxima vez que o cadastro for salvo.

**Dois bugs encontrados e corrigidos nesta sessão, ao revisar:**

- O **Sair** tinha dois avisos de confirmação empilhados (um de "cadastro em
  andamento", outro do próprio botão) que brigavam entre si: com algo não
  salvo, eram necessários **4 toques**, com o menu fechando de novo no meio de
  forma confusa, em vez dos "dois toques" prometidos. Unificados num ciclo só:
  `haAlgoParaPerder()` decide se mostra o aviso extra no primeiro toque; o
  segundo sempre sai.
- **Editar um cadastro existente na Consulta não avisava nada** ao sair sem
  salvar — a proteção só cobria o cadastro novo (aba Adicionar). Agora
  `edicaoDaConsultaAbertaEmEdicao()` cobre também esse caso, e o aviso escreve
  no lugar certo da tela (a caixa de status do próprio cadastro aberto, não a
  do formulário de Adicionar, que pode estar fora da vista). Ao confirmar a
  saída, a edição é revertida de verdade (clica no próprio Cancelar por baixo)
  — o aviso promete descartar, então precisa descartar mesmo.

Limite conhecido, não corrigido: se o usuário já navegou para uma página bem
diferente (ex: Início) enquanto uma edição ficou aberta e esquecida numa aba
escondida, o aviso ainda funciona (exige os dois toques) mas escreve num lugar
que também está fora da vista naquele momento — funcional, sem feedback visível
nesse caso bem específico.

## Trava de duplicado ao editar, e Status de endereço/contato (21/08/2026)

Depois de fechar a Consulta, revisão do que faltava em "Cadastro" — duas coisas
saíram do "seria bom ter" para "vale a pena consertar":

- **Editar o CPF/CNPJ de um cadastro para um valor que já pertence a outro**
  agora é recusado. Antes, a verificação de duplicado só rodava ao **criar**;
  editar um cadastro existente não conferia nada. `App - Atualizar cadastro`
  ganhou uma busca por outro registro com o mesmo CPF_CNPJ (excluindo o próprio
  registro via `RECORD_ID() != id`, e sem rodar a checagem se o documento vier
  vazio — senão bateria com o registro em branco de teste que sobrou na base).
  Achando duplicado, responde `ok:false` com o nome do outro cliente, e **nada**
  é gravado. O app já mostrava qualquer mensagem de erro do n8n na tela certa,
  então não precisou mudar nada no front.
- **Endereços e contatos agora têm Status** (Ativo/Inativo/Arquivado), igual ao
  que o Airtable sempre teve mas o app nunca expôs. Antes, a única forma de
  tirar um endereço ou contato de circulação era excluir de vez, perdendo o
  histórico. Os seletores ficam no fim de cada bloco (`.local-status` /
  `.contato-status`), reaproveitando o mesmo molde de HTML usado no Adicionar
  e na edição da Consulta — então apareceram nos dois lugares de graça. Bloco
  novo nasce "Ativo"; o valor do Status **não conta** para decidir se um bloco
  está "preenchido" (senão todo endereço em branco viraria registro só por
  causa do Status).

Um bug que apareceu montando a trava de duplicado, para não repetir: **inserir
nós novos no meio de uma cadeia muda o `$json` de quem vem depois.** O nó
`Monta as alteracoes` lia `$json.body` esperando receber direto do webhook,
mas com a busca de duplicado na frente, `$json` passou a ser a saída do nó
anterior (`{duplicado, nomeDuplicado}`), sem `.body` nenhum — `entidadeId`
saía vazio e o nó explodia. Corrigido lendo direto de
`$('Recebe pedido do app').first().json.body`, o mesmo padrão que
`Prepara locais`/`Prepara contatos` já usavam em `App - Salvar entidade`
por este exato motivo.

## Começo do ERP: Financeiro / Despesas (22/08/2026)

Decisão sobre como construir o ERP, tomada depois de investigar o Base ERP
(Asaas): **construir do zero, peça por peça, conforme a necessidade real.** As
bases prontas no Airtable ("ERP Soluções Rápidas - Produção") servem só de
referência — não são a fundação.

**Sobre o Asaas / Base ERP** (investigado em 22/08/2026, vale registrar para não
repetir a pesquisa):

- São **dois produtos com APIs separadas**: `docs.asaas.com` (cobrança,
  pagamento, **nota fiscal de serviço**) e `docs.baseerp.com.br` (o ERP em si).
- A API do **Base ERP** só expõe Cliente, Produto, Transportadora, Pedido de
  venda, NF-e (produto) e webhooks disso. **Não tem** endpoint de serviço,
  ordem de serviço, estoque, financeiro ou técnico — conferido tentando abrir
  `/docs/servico`, `/docs/estoque` e `/docs/financeiro`, os três dão 404.
- Como o negócio é 100% serviço, **a chave que importa é a do Asaas**, não a do
  Base ERP: é o Asaas que emite **NFS-e** (nota de serviço), avulsa ou atrelada
  a uma cobrança. A chave do Base ERP só faria falta para vender mercadoria.
- Chave do Asaas guardada em `C:\Users\rediv\chave-asaas.txt` (fora do
  repositório e fora do OneDrive, mesmo cuidado da chave do n8n). **Ainda não
  usada por nenhum workflow** — foi guardada para quando chegarmos em cobrança
  e nota fiscal.

**O que foi construído:** base `Financeiro` com a tabela `Despesas`, quatro
workflows (salvar/listar/atualizar/excluir) e a página Financeiro no app.

Detalhes da tela que valem saber:

- **Resumo no topo**: Em aberto, Vencidas (em vermelho) e Pago no mês. Tudo
  calculado no próprio app, a partir da lista que já foi carregada — nenhuma
  chamada extra ao n8n só para somar.
- "Pago no mês" olha a **data do pagamento**, não a do vencimento: o que
  importa ali é quanto dinheiro saiu neste mês.
- **Vencida** = data no passado **e** ainda não paga. Uma despesa paga com
  data passada mostra "Venceu em…", mas não entra no vermelho.
- Botão **"Marcar como paga"** grava o status e a data de hoje de uma vez, sem
  precisar abrir o formulário — é a ação mais comum do dia a dia.
- O campo "Data do pagamento" só aparece quando o status é Pago.
- Valor aceita **vírgula ou ponto** (o brasileiro digita vírgula); o app
  converte antes de mandar, e o n8n também aceita os dois.
- O aviso de "alterações não salvas" foi estendido para cobrir o formulário de
  despesa, e o aviso aparece **na caixa da própria tela de Financeiro** — não
  na do Cadastro, que estaria fora da vista.
- Sair do sistema limpa a lista e o resumo do Financeiro, como já fazia com a
  Consulta: valores em aberto não devem ficar na tela depois do logout.

## Financeiro completo: parcelas, contas fixas, fornecedores e resumo (25/08/2026)

A aba Financeiro virou três: **Contas a pagar**, **Contas fixas** e **Resumo**.

### Parcelamento — decisão de fundo

Uma compra em N vezes vira **N despesas de verdade**, uma por mês, ligadas pelo
campo `Grupo`. Não é uma despesa só com "3x" escrito nela.

O motivo: assim cada parcela pode ser marcada como paga sozinha, aparece no mês
certo da previsão e some da lista quando é quitada — que é como a dívida
acontece na vida real. O preço é ter mais linhas na tabela, e por isso existe o
botão **"Excluir todas as parcelas"** dentro de cada parcela.

A divisão é feita **em centavos**: as primeiras ficam com o valor arredondado e
a última recebe a sobra, então a soma bate exata com o total (R$ 1.000 em 3x =
333,33 + 333,33 + **333,34**). A mesma conta é feita no app, só para mostrar na
tela antes de salvar o que vai ser gravado.

Datas de parcela **não estouram o mês**: 31/01 + 1 mês = 28/02, não 03/03.

**Editar não mexe no parcelamento.** O campo "em quantas vezes" some quando o
formulário está editando: mudar de 3 para 5 exigiria remexer nas outras
parcelas, e não vale a complicação — para isso, apaga o grupo e lança de novo.

### Contas fixas (recorrentes)

A **regra** fica guardada uma vez na tabela `Recorrentes`; as despesas do mês
são geradas a partir dela. O campo `Proxima_Geracao` é o que impede duplicar:
o workflow só gera o que está com data vencida ou de hoje, e já empurra a data
para o mês seguinte.

**Tem recuperação de atraso**: se o sistema passou dois meses sem ser aberto,
as duas contas atrasadas aparecem de uma vez (limite de 24 por segurança, para
o caso de data cadastrada errada no passado). Por isso **não existe agendamento
no n8n** — quem dispara é o app, toda vez que a aba Financeiro é aberta. Se
ninguém abre o sistema, nada precisava ser gerado mesmo.

Tem opção **"não tem data para acabar"** (o `Sem_Fim`), para conta que se paga
para sempre. Sem ela, informa-se quantas ainda faltam, e a regra se encerra
sozinha quando chega a zero.

**Encerrar ≠ excluir**: encerrar só para de gerar e guarda o histórico do que
já saiu; excluir apaga a regra, para quando foi cadastro errado.

### Fornecedores

Virou tabela própria, com vínculo (`Fornecedor_Ref`) em vez de texto solto. O
campo do formulário aceita **nome ou CNPJ**:

- CNPJ já cadastrado → preenche o nome sem nem chamar a Receita
- CNPJ novo → busca a razão social na Receita e preenche
- nome digitado torto ("  ferragem   TESTE  ltda ") → casa com o já salvo,
  comparando sem acento e sem pontuação, e **adota a grafia salva**

Assim o mesmo fornecedor não entra escrito de dez jeitos. `App - Salvar
fornecedor` é um workflow separado de propósito: salvar despesa e salvar conta
fixa só recebem o código do fornecedor, e ficam simples.

### Sobre não repetir dados (o pedido do agente de IA)

O pedido era usar IA (Claude/OpenAI no n8n) para descobrir que dois produtos
descritos diferente são o mesmo. **Ainda não foi feito, e de propósito.**

O que foi feito primeiro é o que resolve o caso comum **sem gastar crédito e
sem risco de erro**: sugestão do que já foi digitado antes (fornecedores,
descrições, categorias), normalização de fornecedor pelo CNPJ, e um aviso
quando a descrição digitada é a mesma coisa escrita de outro jeito ("Você já
lançou isto como X"). É **aviso, não bloqueio** — quem decide se é o mesmo item
é o dono, porque "Cimento" e "Cimento CP-II" podem ser produtos diferentes de
verdade.

A IA entra na fase de **catálogo de produtos / estoque** (ver a seção da
arquitetura de captura de compras), que é onde a comparação fica realmente
difícil — e lá vale a regra que o dono deu: **a IA pergunta antes de assumir
que dois produtos são o mesmo, a não ser que tenha certeza absoluta provada por
código**, nunca só por descrição parecida.

### Velocidade

As três leituras (despesas, fornecedores, contas fixas) mais a geração das
contas fixas saem **ao mesmo tempo**, do navegador. Medido: ~870ms para a aba
inteira, contra ~2s da primeira tentativa que juntava tudo num workflow só
(ver "Coisas descobertas testando" sobre o n8n não paralelizar).

Depois de salvar, o app relê **só a lista que mudou**, não as três.

### Outros detalhes da tela

- **Valor com máscara**: digita-se só números e o R$, o ponto de milhar e a
  vírgula aparecem sozinhos, da direita para a esquerda como calculadora.
- **Categoria "Outros"** abre um campo de texto livre, com sugestão das
  categorias que já foram digitadas antes. É salvo com `typecast`, então a
  lista do Airtable cresce sozinha.
- **Forma de pagamento**: PIX, Boleto, Dinheiro, Depósito, Cartão de débito,
  Cartão de crédito. O campo de parcelas só aparece em **Cartão de crédito e
  Boleto** — as duas em que parcelar existe de verdade.
- **Filtros** de situação (Em aberto / Vencidas / Pagas / Todas) e de mês. O
  filtro de mês só oferece meses que existem na lista. O rodapé da lista mostra
  a **soma do que está filtrado**.
- **Resumo**: previsão de saída dos próximos 6 meses (o que está lançado em
  aberto **mais** o que as contas fixas ainda vão gerar), em aberto por
  categoria e por fornecedor. Barras em CSS puro, sem biblioteca de gráfico.
  Contas atrasadas ou sem data entram no mês corrente, que é quando precisam
  ser pagas.

### Bug antigo corrigido junto

`#subfin-despesas` tinha a classe `.subpage`, e o clique nas abas do Cadastro
escondia **todas** as `.subpage` do documento — inclusive a do Financeiro, que
depois abria em branco. As abas internas agora buscam só dentro da própria
página (`aba.closest(".page")`), e os blocos do Financeiro usam `.subpage-fin`.

## Arquitetura para captura automática de compras (planejada em 24/08/2026 — nada construído ainda)

Só análise e pesquisa até aqui, nenhum código. Registrando pra não perder o
raciocínio e as fontes verificadas quando formos construir.

**O objetivo do dono:** passar o cartão da empresa e o sistema já saber
sozinho o quê foi comprado, quantidade, valor de cada item, onde e em quantas
vezes — sem tirar foto de cupom nem digitar nada, pra alimentar comparação de
fornecedor, estoque e consumo médio.

**Descoberta central: nenhuma fonte sozinha tem tudo isso.** Item e quantidade
só existem na **nota fiscal**. Parcelamento só existe na **fatura do
cartão** — conferido no layout oficial da NF-e 4.0 (grupo `detPag`): tem
`tPag`, `xPag`, `vPag`, `tBand`, `cAut`, mas **nenhum campo de parcelas**. O
sistema sempre vai juntar duas fontes.

### Fonte 1 — Nota fiscal por e-mail (fornecedor recorrente)

Cadastrar o CNPJ da empresa como fixo nos fornecedores que se compra sempre,
com um e-mail dedicado pra receber a nota. O n8n lê a caixa (gatilho IMAP já
existe no n8n instalado) e extrai o XML anexado (nó de XML nativo já existe
também) — item, quantidade, valor unitário, fornecedor, tudo automático,
**esforço zero por compra**.

**Pendência do dono antes disso começar:** criar um Gmail dedicado (ex:
`notas@...`) e falar uma vez com cada fornecedor recorrente pra mandar nota
nesse endereço. Gmail comum (não Workspace) resolve. Quando o n8n for
conectar, é por autorização OAuth (o dono clica "permitir" numa tela do
Google) — **nunca senha direto**, Google e Microsoft não aceitam mais isso
pra programa de terceiro.

### Fonte 2 — QR code do cupom (compra avulsa)

Pra compra em lugar sem CNPJ fixo cadastrado: um botão no app pra escanear o
QR code do cupom, que leva direto pra consulta pública da SEFAZ do estado —
**confirmado que não exige certificado nem login**, mostra os itens. Esforço:
apontar a câmera. Mais frágil que a Fonte 1 porque cada estado tem sua
própria página de consulta (o dono opera em SC e RS).

**Por que não puxar direto da SEFAZ pelo n8n, sem depender de e-mail nem QR:**
investigado e descartado por enquanto — dois obstáculos reais, testados nesta
máquina:

- O serviço existe (`NFeDistribuicaoDFe`) e o n8n aceita certificado digital
  (credencial `httpSslAuth`, testado e confirmado que existe), mas a SEFAZ só
  entrega o **resumo** (fornecedor, valor total, data) de graça. Os **itens**
  só vêm depois de "manifestar ciência" — um documento **assinado
  digitalmente** (assinatura XML, padrão da Receita), bem mais complexo que
  uma chamada de API comum.
- Os arquivos da SEFAZ vêm compactados, e testei ao vivo: **o Code node do
  n8n bloqueia o módulo `zlib`** (`Module 'zlib' is disallowed`). Contornável
  reiniciando o n8n com uma variável de ambiente a mais, mas é mais uma
  fricção nesse caminho.

Boa notícia que muda o cenário a favor: desde **janeiro de 2026** (Ajuste
SINIEF 11/2025), loja **não pode mais emitir cupom (NFC-e) pra CNPJ** — vira
obrigatório NF-e modelo 55. Ou seja, pedir "põe no CNPJ" hoje já gera o tipo
de nota que os dois caminhos acima conseguem captar; ano passado nem sempre.

### Fonte 3 — Cartão / fatura (valor, local, data, parcelas)

**Nenhum banco brasileiro expõe fatura de cartão de crédito por API própria**
— nem Inter, nem Cora, confirmado nos dois portais de desenvolvedor. Não é
peculiaridade de um banco, é padrão do mercado inteiro.

Três caminhos possíveis, nenhum construído ainda:

- **Importar o arquivo da fatura** (o banco exporta), uma vez por mês. De
  graça, funciona, esforço é mensal e não por compra.
- **Conta Simples** — o produto dela é justamente gestão de cartão
  corporativo. Tem API com sandbox (`api-sandbox.contasimples.com` responde
  401, confirmado que existe de verdade), mas **não confirmei se ela expõe
  transação com número de parcelas** — a documentação pública não foi
  localizada. **Pendência do dono:** perguntar direto no suporte deles se a
  API lista transações com parcelas, e se é aberta pra qualquer cliente ou só
  parceiro homologado.
- **Agregador Open Finance** (Pluggy e afins) — é o mecanismo oficial pra
  alguém fora do sistema bancário ler dado de outro banco (só instituição
  autorizada pelo Banco Central pode; por isso banco não te dá direto). Tem
  mensalidade.

**Descartado, não reconsiderar:** automatizar o app do banco no PC (com ou
sem IA lendo a tela). Motivos: a senha do banco ficaria guardada num PC com
túnel aberto pra internet; viola os termos de praticamente todo banco
(risco de bloqueio de conta); e quebra toda vez que o banco muda a tela —
proteções que existem justamente pra impedir esse tipo de automação.

**Também avaliado e descartado por enquanto:** "Level 3 data" das bandeiras
(Visa/Mastercard têm um padrão que carrega item dentro da própria transação
de cartão corporativo) — existe de verdade, mas quem envia esse dado é o
**lojista**, e só compensa pra quem vende B2B de alto volume; loja pequena não
manda. Mesmo se mandasse, a API de bandeira é pra emissor/adquirente, não pro
portador do cartão.

### Cruzamento nota × fatura

Casar pelo **CNPJ do fornecedor + valor + data** (e pelo `cAut` — código de
autorização do cartão — quando a nota trouxer, que dá casamento exato; nem
toda maquininha pequena envia). O que não casar depois de um tempo = despesa
sem comprovação fiscal, que é justamente o que vale sinalizar (não é
dedutível).

### Catálogo de produtos / estoque (fase seguinte, ainda mais adiante)

Pra virar estoque de verdade, precisa de um "dicionário" que reconheça que
"CIMENTO CP-II 50KG VOTORAN" de um fornecedor é o mesmo produto que "CIM
CPII 50 KG" de outro. Desenho pensado:

- Tabela `Produtos` (catálogo mestre) + `Apelidos` (como cada fornecedor
  chama cada produto) + `Movimentações` (entrada/saída, com produto,
  quantidade, valor, fornecedor, data).
- Casamento em cascata: **código de barras (GTIN)** quando a nota traz →
  **apelido já visto** desse fornecedor → **IA** (Claude/OpenAI, o dono já
  tem integração no n8n) compara a descrição nova com o catálogo e devolve
  confiança; alta confiança casa sozinho, média entra numa fila com a
  sugestão da IA pronta (confirma com 1 toque), baixa vira produto
  genuinamente novo (nomeia uma vez).
- Toda confirmação (IA ou humana) vira um apelido novo salvo — o uso de IA
  cai com o tempo, porque fornecedor recorrente para de precisar dela.
- Custo da IA: não é literalmente zero (chamada de API tem custo mínimo),
  mas irrelevante pro volume esperado — poucos itens realmente novos por mês,
  o resto casa de graça por GTIN/apelido.
- Com as movimentações acumulando: fornecedor mais barato por produto,
  consumo médio mensal, sugestão de estoque mínimo, e custo de material por
  chamado (quando Chamados existir).
- **A baixa de estoque (o que foi usado) continua manual, sempre** — o
  sistema sabe o que entrou pela nota, mas ninguém tem como saber o que foi
  gasto sem alguém informar. Vale pensar numa tela de baixa rápida (escolher
  chamado + marcar materiais) quando chegar nessa fase.

## PENDENTE AGORA (é por aqui que se continua)

- **`WhatsApp_Financeiro` não existe mais**, mas nada foi perdido: o campo só
  mudou de nome. Nenhuma limpeza pendente no Airtable desta vez.
- Nome do responsável por cada número (chegou a ser pedido e foi cancelado).
- Telefone e e-mail próprios da administradora.
- A lista da Consulta não mostra nem filtra por Status — cadastros Inativos
  aparecem misturados com os Ativos, sem diferença visual.
- Trocar o tamanho do CPF/CNPJ ao editar (corrigir um que na real era do outro
  tipo) não ajusta o "Tipo" sozinho — quem edita precisa lembrar de mudar os
  dois.
- **Duas sessões do Claude podem estar ativas ao mesmo tempo neste projeto**
  (esta conversa + uma sessão `claude rc` pelo celular, mesma pasta/branch,
  modo "same-dir"). Nenhuma vê o que a outra fez até o próximo `git status`/
  `git pull`. Sempre conferir isso no início de uma sessão nova.

**No Financeiro, o que o dono pediu e ainda falta** (ele pediu para ir devagar,
uma peça por vez, e volta quando precisar):

- **Nota fiscal de serviço (NFS-e) via Asaas** — a chave já está guardada e a
  configuração fiscal já foi feita por ele no Base ERP. Falta construir.
- **Cobrança dos clientes (contas a receber)** via Asaas — boleto/PIX e saber
  quem pagou, por webhook.
- **Resumo financeiro geral** (quanto entrou × quanto saiu). O resumo do
  Financeiro já existe, mas só olha o que sai — falta o lado das entradas.
- **Cartão de crédito: dia da fatura.** O parcelamento já prevê a saída mês a
  mês, mas usa a data que foi digitada como vencimento. O dono disse que ia
  passar os dados dos cartões depois; quando passar, dá para lançar a parcela
  no **dia real da fatura** de cada cartão, em vez de contar mês a mês a partir
  da compra. Provavelmente vira uma tabela `Cartoes` (nome, dia do fechamento,
  dia do vencimento) e um campo de cartão na despesa.
- **Captura automática de compras** (nota por e-mail, QR do cupom, cruzamento
  com a fatura do cartão, catálogo de produtos com IA) — arquitetura inteira
  já desenhada e com fontes verificadas, ver seção acima. Nada construído.
  Duas coisas do lado do dono, antes de começar a Fonte 1:
  - Criar um Gmail dedicado pra receber nota dos fornecedores
  - Perguntar pro suporte da Conta Simples se a API deles lista transação de
    cartão com número de parcelas, e se é aberta pra qualquer cliente

## Aviso da Receita no cadastro (feito em 12/08/2026)

Quando a Receita não preenche os campos, o app agora diz o motivo em vez de
mostrar um "CNPJ válido" verde com o formulário em branco:

| Situação | O que aparece | Botão "Tentar de novo"? |
|---|---|---|
| Estourou o limite por minuto | Aviso amarelo pedindo para esperar | sim |
| CNPJ não consta na Receita | Aviso amarelo para preencher à mão | não |

O workflow manda dois campos: `avisoReceita` (o texto) e `podeTentarDeNovo`
(booleano). **O app decide o botão pelo booleano, nunca lendo o texto** — texto
muda, e comparar string quebraria calado. O botão só aparece onde insistir
resolve; num CNPJ que não existe, ele só criaria esperança à toa.

A cor `--aviso` (amarelo) foi criada para isso: o cadastro continua funcionando,
então não é caso de vermelho de erro.

## Vários endereços por cadastro (feito em 15/08/2026)

Vale para CPF e CNPJ igualmente. O Airtable **não precisou de mudança**: a
tabela `Locais_Atendimento` e a ligação com as Entidades já existiam prontas.

No app, um bloco que se repete (`<template id="modelo-local">` no HTML, clonado
pelo `app.js`). Começa com um bloco só e sem botão de remover — remover o único
deixaria a seção vazia e sem pista do que fazer. A numeração ("Endereço 1, 2…")
só aparece a partir do segundo. Bloco deixado totalmente em branco não vira
registro: quem abriu um a mais e desistiu não gera lixo na tabela.

A lista viaja como **texto JSON num campo só** (`locais`), para o envio
continuar sendo um formulário simples — mandar JSON de verdade faria o
navegador pedir a verificação extra (CORS preflight) que hoje é evitada.

No `App - Salvar entidade`, depois de criar a entidade: `Prepara locais` monta
um item por endereço já com o ID do cliente, `Tem algum local?` desvia, e
`Cria locais no Airtable` grava. Dois cuidados que não são óbvios:

- **Sem endereço nenhum, `Prepara locais` ainda devolve um item** (com
  `temLocal: false`). Se devolvesse lista vazia, o fluxo morreria ali e o app
  ficaria esperando para sempre uma resposta que nunca chegaria.
- **Se os endereços falharem, a resposta é `ok: true`** com aviso, não erro. O
  cliente já foi gravado; dizer "não consegui salvar" faria cadastrar de novo e
  duplicar.

Endereço sem nome preenchido usa o próprio endereço como título, senão o
registro aparece em branco na lista do Airtable.

Campo de lista (singleSelect) com **valor fixo** no nó do Airtable exige que as
opções estejam declaradas no `schema`, senão o n8n recusa publicar. Com
expressão (`={{ ... }}`) ele não cobra.

## Contatos, com WhatsApps e e-mails sem limite (feito em 15/08/2026)

O formulário ganhou "Contatos / solicitantes": bloco que se repete, e dentro de
cada contato duas listas que também crescem sem limite (WhatsApps e e-mails).

**Por que não criar coluna nova a cada telefone.** O pedido original era o
Airtable criar `Email_5`, `Email_6`… sozinho. Isso foi conversado e descartado:
coluna criada nunca some, então ela passa a existir vazia em *todos* os
contatos, a tabela vira uma parede de colunas em branco, há teto de campos por
tabela, e procurar "quem tem tal e-mail" viraria procurar em dezenas de
colunas. **Não voltar atrás nisso sem motivo forte.**

O que ficou: dois campos `multilineText` novos, `WhatsApps` e `Emails`, com
**um valor por linha**. Ilimitado, visível de uma vez na célula, e a busca do
Airtable acha normalmente.

Os 8 campos velhos (`WhatsApp_1..4`, `Email_1..4`) estão vazios e sem uso — só
podem ser apagados pela tela do Airtable (veja "PENDENTE AGORA"). A API do
Airtable **não apaga campo nem troca o tipo de um campo**; só cria.

Contato sem nome usa o primeiro WhatsApp (ou e-mail) como título. Linha de
canal em branco no meio da lista é descartada no envio.

## Padrão de layout: grade no computador, coluna única no celular (24/08/2026)

**Vale para o app inteiro, inclusive telas que ainda não existem.** O pedido do
dono: mesmas funcionalidades nos dois, mas no computador sobrava espaço vazio
dos dois lados, e no celular ele quer continuar rolando de cima pra baixo.

Antes, todo conteúdo ficava preso em `.card { max-width: 380px }` — estreito
até num monitor grande. Agora, dentro do breakpoint que já existia
(`@media (min-width: 768px)`, em `style.css`):

- **`.page { max-width: 960px }`** — só as páginas do app alargam. A tela de
  login usa `.card` **sem** `.page`, então continua estreita e centralizada,
  que é o certo pra uma tela de senha. **Não trocar isso para `.card`**, ou o
  login estica junto.
- **`.grade-responsiva`** — classe reutilizável: vira grade de colunas no
  computador (`repeat(auto-fill, minmax(280px, 1fr))`, o número de colunas se
  ajusta sozinho à largura), e não faz nada no celular (o container continua
  `display: block`, empilhado).

**Como usar em tela nova:** é só pôr `class="grade-responsiva"` no container
que recebe os itens repetidos. Nada de CSS novo, e **nada no `app.js`** — o
`appendChild` não liga pro `display` do pai, então a lógica de montar as
linhas continua igual.

Hoje está em seis containers: `#lista-despesas`, `#lista-cadastros`,
`#locais`, `.d-locais`, `#contatos`, `.d-contatos`.

**Não** aplicar em `.contato-whatsapps` / `.contato-emails` — são um campo de
texto com um "×" do lado, ficam estranhos em grade.

Uma armadilha que apareceu ao construir: **um item que expande dentro da
grade fica preso na largura de uma coluna.** O cadastro aberto na Consulta é
filho de `#lista-cadastros`, então seu detalhe (campos, endereços, contatos)
saía espremido em ~300px. Resolvido com
`.grade-responsiva > .aberto { grid-column: 1 / -1 }`, que faz o item aberto
ocupar a linha inteira. **Se outra lista ganhar um item que expande, ela
precisa da mesma regra** (ou usar a classe `.aberto`, que já é pega por essa).

Em 25/08/2026 descobriu-se que as despesas usavam `.aberta` (no feminino) e
por isso não pegavam a regra — o cartão aberto ficava espremido numa coluna. A
regra agora cobre **as duas grafias**.

## Decisões já tomadas (não relitigar sem motivo)

- **Toda ação envia a senha para o n8n conferir.** A tela de entrada é só
  conveniência visual e nunca deve ser tratada como prova de acesso.
- Chaves e credenciais ficam **só no n8n**, nunca no código do app — o
  repositório é público.
- Consultas externas (como a da Receita) passam pelo n8n, não direto do
  navegador.
- Hospedagem no GitHub Pages, de graça (por isso o repositório é público).
- Comprar domínio próprio para o túnel: adiado, sem urgência.

## Próximos passos previstos, depois do pendente

- Painel de status das automações
- Tela de chat/assistente
