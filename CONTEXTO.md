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
- Página **Financeiro**, com abas "Painel", "A pagar", "A receber",
  "Contas fixas" e "Ajustes"
  - Painel: aviso de fatura de cartão a vencer, com o valor calculado e
    editável, pagando por PIX ou por boleto direto do Asaas (ou só marcando
    como paga),
    saldo em caixa e quanto dele já tem dono (impostos, folha, reserva,
    capital de giro), o que entra e sai, previsão mês a mês com o mês em que o
    caixa fica negativo em vermelho, fluxo de caixa realizado, limite do MEI,
    conferência com o banco, e o em aberto por categoria e por fornecedor
  - A pagar: lançar (com parcelamento), filtrar por situação e mês, marcar como
    paga, editar pelo lápis, excluir uma ou o grupo de parcelas
  - A receber: o que os clientes ainda devem, com o cliente vindo do Cadastro,
    e o material gasto no serviço (é ele que define o lucro a dividir)
  - Contas fixas: o que se repete todo mês; o sistema lança sozinho no dia
  - Divisão: quanto do lucro cabe a cada sócio e à empresa, quanto o caixa
    aguenta pagar disso agora, e o registro das retiradas
  - Ajustes: saldo de partida, metas de reserva e giro, regime e imposto,
    folha, as fatias da divisão do lucro, e o cadastro dos cartões de crédito
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
- `Recebimentos` (`tbl4tMnm3t3peeLYo`) — contas a receber (26/08/2026)
- `Config_Financeiro` (`tbl3uT9h7ZYXnfR7E`) — **uma linha só**, com os ajustes
  do painel e as fatias da divisão do lucro (26/08/2026)
- `Conferencias` (`tblIrMrXYI6FZdKfS`) — conciliação bancária (26/08/2026)
- `Retiradas` (`tblh3m5JB6N2sNs5i`) — o que cada sócio já tirou (26/08/2026)
- `Cartoes` (`tblzJwNGcTpvGmYiM`) — cartões de crédito, com o ciclo da fatura e
  a chave PIX para onde o pagamento vai (27/08/2026)
- `Pagamentos_Fatura` (`tbldfftPos0qX7nlm`) — comprovante de cada pagamento de
  fatura (PIX ou boleto, campo `Metodo`), e a trava contra pagar duas vezes
  (27/08/2026)

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
| `App - Listar locais` | `/webhook/listar-locais` | `guRASaILS9KHOVpW` |
| `App - Listar contatos` | `/webhook/listar-contatos` | `Se7DavX4vQrwpmsI` |
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
| `App - Listar recebimentos` | `/webhook/listar-recebimentos` | `0GeCpXBalEUJkwJz` |
| `App - Listar config financeiro` | `/webhook/listar-config` | `saK4LysHMYYSi2KM` |
| `App - Listar conferencias` | `/webhook/listar-conferencias` | `bs7XkyFK4OoejHMp` |
| `App - Salvar recebimento` | `/webhook/salvar-recebimento` | `PkI7yuIjjrurcXKK` |
| `App - Salvar config financeiro` | `/webhook/salvar-config` | `FwwkYrUdHsBpJUhz` |
| `App - Salvar conferencia` | `/webhook/salvar-conferencia` | `Yxbz5zhzBuNuryBM` |
| `App - Excluir recebimento` | `/webhook/excluir-recebimento` | `ZVuAGeNmuytxyVQe` |
| `App - Listar retiradas` | `/webhook/listar-retiradas` | `bdBluhbFStnnbI4j` |
| `App - Salvar retirada` | `/webhook/salvar-retirada` | `EWAGlYN9Idv5yAKx` |
| `App - Excluir retirada` | `/webhook/excluir-retirada` | `ihcCLwC35J103Y1v` |
| `App - Listar cartoes` | `/webhook/listar-cartoes` | `DBrjXWNhc4UySl9Y` |
| `App - Salvar cartao` | `/webhook/salvar-cartao` | `aRuPCSPYrof8qHE9` |
| `App - Excluir cartao` | `/webhook/excluir-cartao` | `ciGFel5tQvtCozGp` |
| `App - Listar pagamentos de fatura` | `/webhook/listar-pagamentos-fatura` | `Zf321z3EBXjr3PYI` |
| `App - Pagar fatura do cartao` | `/webhook/pagar-fatura` | `jCimCPy6ICIwOm4q` |
| `App - Pagar fatura do cartao por boleto` | `/webhook/pagar-fatura-boleto` | `FayraViYiF44HN6p` |
| `App - Confirmar fatura paga` | `/webhook/confirmar-fatura` | `D5VnSvfkddLSxhNL` |

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

- **INCIDENTE REAL em 28/08/2026 — teste apagou dado de verdade do dono, sem
  querer.** `Config_Financeiro` tem uma linha só, e por isso é tentador usar a
  linha real pra testar em vez de criar uma linha separada. Fiz isso construindo
  Cartões e depois o pagamento por boleto: ao "limpar" no fim de cada sessão,
  zerei `Saldo_Inicial`, `Data_Saldo_Inicial`, `Reserva_Meta`, `Giro_Meta`,
  `Imposto_Fixo_Mensal`, `Teto_Anual`, `Folha_Mensal` — sem checar se o dono já
  tinha preenchido aqueles campos de verdade entre uma sessão e outra. Só não
  perdi `Socio_1_Nome`/`Socio_2_Nome`/percentuais porque, por sorte, fui
  cuidadoso em ler-e-devolver *esses* campos específicos sem mudar; os outros
  eu simplesmente sobrescrevi com o valor fixo que usava pra testar. O dono
  perdeu o que tinha preenchido, sem eu ter como recuperar (não guardo
  histórico). **Regra: nunca gravar em `Config_Financeiro` (nem em nenhuma
  tabela de configuração de linha única) só pra testar.** Se precisar testar
  salvar/ler de novo, criar uma tabela ou linha temporária separada — já está
  validado que o mecanismo funciona, não precisa retestar tocando no dado real.
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
- **Conta Simples** — **conferido em 27/08/2026 direto em
  `developers.contasimples.com`, pendência resolvida.** A API é real e
  self-service (chave gerada no próprio Internet Banking deles, sem precisar
  virar parceiro homologado). Tem exatamente o que faltava:
  - `GET /v1/bills?status=OPEN` → a **fatura em aberto de verdade**, com valor
    total, quanto falta pagar, data de fechamento e vencimento — o que
    "nenhum banco fornece" (ver acima) a Conta Simples fornece.
  - `GET /v1/statements/credit-card` → cada compra, com estabelecimento,
    valor, data, e a parcela atual (`"installment": 1`). **Mas não devolve o
    total de parcelas** — só sabe "estou na parcela 2", não "2 de 6". Furo
    real, mas incompleto é bem melhor que nada.
  - `GET /v1/balance` → saldo, mas é o saldo **da própria conta Conta
    Simples**, mesmo padrão do Asaas (ver abaixo) — não lê banco externo.
  - **A pegadinha que muda a decisão:** só funciona pra compra feita em
    **cartão emitido pela própria Conta Simples**. Não lê o cartão que a
    empresa já usa — exigiria abrir conta lá e trocar de cartão corporativo,
    não é só "ligar uma API".
- **Agregador Open Finance** (Pluggy e afins) — é o mecanismo oficial pra
  alguém fora do sistema bancário ler dado de outro banco (só instituição
  autorizada pelo Banco Central pode; por isso banco não te dá direto). Tem
  mensalidade.

**Conferido em 27/08/2026: o "Open Finance" que aparece no painel do Asaas não
serve pra isso.** O dono viu o menu Open Finance no Asaas e perguntou se dava
pra ver o saldo de um banco conectado por ali. Não dá — confirmado direto no
artigo oficial deles (`central.ajuda.asaas.com`, "Como será a participação do
Asaas no Open Finance"): **o Asaas participa como *detentora* de dados, não
como agregadora.** Ou seja, é o Asaas que **compartilha o saldo da própria
conta Asaas** pra outros bancos/apps usarem (ex: agendar um Pix recorrente no
app de outro banco usando saldo do Asaas) — o caminho inverso do que
resolveria o problema. Continua valendo: `/finance/balance` e
`/financialTransactions` da API do Asaas mostram só o saldo **dentro do
Asaas**, nunca o de um banco externo.

**Pix pelo Asaas — conferido em 27/08/2026, direto na doc oficial
(`docs.asaas.com`):**

- `POST /v3/transfers` faz PIX de verdade (chave CPF/CNPJ/e-mail/telefone/EVP)
  puxando do saldo do Asaas. Tem `scheduleDate` pra agendar uma data futura.
- **Não é recorrente de verdade** — `scheduleDate` agenda uma transferência,
  não repete sozinho todo mês. Pra virar "aluguel sai sozinho", o próprio n8n
  precisaria chamar essa API de novo a cada mês (mesmo padrão do
  `App - Gerar despesas recorrentes`, que já existe).
- **Decisão tomada com o dono:** essa automação será construída **com
  autorização manual antes de cada envio** — o sistema prepara e mostra "vai
  pagar R$ X pra Y no dia Z, confirma?", nunca 100% sem toque humano de
  início. Motivo: chave é de produção, PIX é irreversível, e um erro de
  lógica sai como dinheiro indo pro lugar errado sem chance de desfazer.
  **Ainda não construído** — combinado pra depois.

**Pague Contas do Asaas aceita DAS — conferido em 27/08/2026.** O saldo motivo
tira: aceita boleto de cobrança, INSS, DAS, Simples (só não aceita guia DARE).
Mas o Asaas **não emite nem gera** o DAS — quem gera é sempre o Portal do
Empreendedor/PGMEI; o Asaas só paga o código de barras que já existe.

**DDA não pega DAS, em nenhum banco — confirmado tecnicamente.** DDA (Débito
Direto Autorizado) só cobre **boletos de cobrança registrados** (a frase
oficial é literalmente essa: "o DDA engloba apenas boletos de cobrança
registrados"). DAS é uma **guia de arrecadação**, categoria diferente, que
passa pela rede arrecadadora do governo, não pela central de registro que
alimenta o DDA. Não é limitação do Asaas — nenhum banco mostra DAS via DDA.

**Débito Automático do MEI (o mecanismo certo pra isso) — Asaas não está na
lista.** Confirmado no manual oficial da Receita
(`MANUAL_DEBITO_AUTO_MEI.pdf`, versão março/2024): só funciona com conta em
um dos 14 bancos da rede arrecadadora — Banco do Brasil, Banco da Amazônia,
Banco do Nordeste, Banestes, Santander, Banrisul, Banese, BRB, Caixa,
Bradesco, Itaú, Banco Mercantil do Brasil, Sicredi, Sicoob. Todos tradicionais
— nenhum banco digital/fintech está na lista (nem Asaas, nem Nubank, nem
Inter). Pra ter DAS debitado sozinho todo mês sem passar pelo app, precisaria
de conta num desses 14. Fora isso, o caminho é colar o código de barras no
Pague Contas todo mês, manualmente — ~5 segundos, mas não é automático.

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
  **Regra travada em 27/08/2026, pra não duplicar dinheiro saindo do caixa
  quando isso for construído:** a fatura tem que ser um jeito de **agrupar**
  despesas que já existem (pelo cartão + ciclo de fechamento), nunca um lugar
  novo onde o valor é digitado de novo. O que já sai do caixa hoje é só a
  despesa marcada como Paga (com `Data_Pagamento`) — a fatura, quando existir,
  não pode ter seu próprio evento de saída somado por cima disso, senão o
  mesmo real conta duas vezes. O dono já cadastra contas fixas no cartão de
  crédito com essa regra em mente: fica Pendente até ele pagar a fatura de
  verdade, e só aí marca como Paga (na data do pagamento da fatura, não na
  data da cobrança individual).

  **"Confirmar fatura paga" construído em 27/08/2026, provisório até a tabela
  `Cartoes` existir.** O dono queria que contas fixas no cartão se marcassem
  sozinhas como pagas no dia da fatura. Ele imaginou o banco avisando por API
  — **não existe isso pra nenhum banco comum de empresa**, confirmado nesta
  mesma sessão (ver seção do Asaas/DAS acima). Sem tabela de cartões ainda, o
  agrupamento é feito pela **data de vencimento**: despesas com
  `Forma_Pagamento = Cartão de crédito` que vencem no mesmo dia são tratadas
  como a mesma fatura. No Painel, quando existe alguma vencida ou vencendo
  hoje, aparece um aviso com a lista e **um botão que confirma o grupo inteiro
  de uma vez** (dois toques, como o resto do projeto) — nunca marca sozinho
  sem o dono confirmar; foi decisão dele, não suposição. Workflow
  `App - Confirmar fatura paga` (`confirmar-fatura`) só mexe em `Status` e
  `Data_Pagamento`, não reenvia o resto do registro. **Quando a tabela
  `Cartoes` existir**, trocar o agrupamento por data para agrupamento por
  cartão — a UI e o workflow já dão para reaproveitar quase inteiros, só muda
  a função `despesasDeFaturaPendentes()` em `app.js`.
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

## Campo comprido que precisa aparecer inteiro (26/08/2026)

"Endereço completo" era `<input type="text">` e cortava o texto que não cabia
numa linha. Em modo leitura isso é pior do que parece: campo `disabled` não
deixa nem rolar por dentro, então o endereço longo ficava **impossível de ler**
sem clicar no lápis.

Virou `<textarea class="local-endereco auto-altura" rows="1">`, com a altura
ajustada por `ajustarAlturaAuto`. **Nada mudou para ler nem gravar**: `.value`
funciona igual em input e textarea. Enter é bloqueado no campo — o textarea
está ali para *mostrar* em várias linhas, não para guardar `\n` num campo que
no Airtable é de linha única.

Se outro campo comprido precisar do mesmo: vira `textarea`, ganha a classe
`auto-altura`, e pronto — a varredura já pega.

**O detalhe que dá trabalho: altura só mede certo com o campo à vista.**
Escondido, `scrollHeight` devolve zero e o campo fica travado numa linha só.
Por isso `ajustarAlturasAuto` é chamada em cada momento em que um bloco aparece
ou muda a largura que sobra para o texto:

- ao entrar na tela (`adicionarLocal`)
- ao abrir um cadastro na Consulta — `montarDetalhe` monta tudo **solto da
  página**, então lá dentro qualquer medida daria zero
- ao revelar o formulário depois da consulta à Receita
- ao travar/destravar: o CSS zera o espaçamento lateral do campo travado, e a
  linha passa a quebrar noutro ponto
- ao trocar de aba interna
- no `resize` da janela (girar o celular)

Duas armadilhas que custaram tempo:

- **Somar a borda.** O projeto usa `box-sizing: border-box`, então a altura
  inclui a borda, mas `scrollHeight` conta só conteúdo e espaçamento. Sem
  `campo.offsetHeight - campo.clientHeight`, sobravam 2px de texto cortado.
- **`ResizeObserver` foi tentado e descartado.** Seria mais elegante — a altura
  depende da largura, então observar a largura cobriria todos os casos de uma
  vez, inclusive os que ninguém previu. Mas **ele nunca dispara no navegador
  embutido de teste**: existe como função e fica calado, nem no disparo inicial.
  Sem conseguir verificar, não vale entregar. Ficaram as chamadas explícitas,
  medidas funcionando uma a uma. Se um dia o campo aparecer por um caminho novo
  e nascer com uma linha só, é aqui que se acrescenta a chamada.

## Velocidade: por que tudo custa ~700ms, e como não custar mais que isso (26/08/2026)

Medido nesta data, com o n8n local (sem o túnel no meio):

| | tempo |
|---|---|
| o n8n em si (webhook + confere senha + responde) | **18ms** |
| **cada ida ao Airtable** | **~700ms** |

Ou seja: o custo do sistema é **o número de idas ao Airtable**, não o n8n e não
o app. A conta é direta — 1 busca ≈ 700ms, 3 buscas em fila ≈ 2,1s.

E lembre da regra já descoberta antes: **o n8n executa um nó de cada vez, mesmo
em ramos que parecem paralelos.** Quem paraleliza de verdade é o navegador.

**A regra do projeto, então: um workflow = uma ida ao Airtable.** Quando a tela
precisa de várias tabelas, são vários workflows pequenos que o app dispara
juntos com `Promise.all`. Dá o tempo da mais lenta em vez da soma.

Foi assim que o Financeiro nasceu (três listas em paralelo, ~800ms) e foi assim
que o **abrir um cadastro** caiu de **2057ms para 810ms** em 26/08/2026:
`detalhe-cadastro` fazia cadastro → locais → contatos em fila dentro de um
workflow só. As três buscas não dependiam uma da outra (locais e contatos
filtram pelo CPF/CNPJ que veio no pedido), então viraram três workflows.

**Cuidado que veio junto:** com três respostas em vez de uma, dá para o
cadastro chegar e os endereços não. Se qualquer uma das três falhar, o cadastro
**não abre**. Abrir sem os endereços seria pior do que não abrir — a tela
mostraria o cadastro como se ele não tivesse nenhum, e quem salvasse assim
acharia que estava tudo certo.

**Onde ainda sobra tempo, se um dia incomodar:** salvar um cadastro faz 1 busca
de duplicado + uma escrita por registro (entidade, cada endereço, cada
contato), tudo em fila. Dá para juntar as escritas da mesma tabela (o Airtable
aceita 10 por chamada), mas mexe na lógica de criar/apagar e não vale o risco
enquanto salvar for menos frequente que abrir.

**O que não foi feito de propósito:** guardar o cadastro já aberto em memória
para reabrir instantâneo. Economizaria os 810ms na segunda abertura, mas
mostraria dado velho se algo mudasse pelo Airtable ou por outra sessão. Preferi
sempre buscar.

## Painel do Financeiro: os 11 itens do caixa (26/08/2026)

O dono pediu uma tela que mostrasse, de forma simples: saldo disponível,
reserva de emergência, capital de giro, contas a pagar, contas a receber,
impostos provisionados, folha provisionada, fluxo de caixa, conciliação
bancária, comprovantes e previsão de caixa.

### O que foi corrigido antes de construir

Ele pediu que os dados viessem "por API dos meus bancos". **Isso não existe
para ele** — já estava pesquisado neste arquivo (ver "Fonte 3 — Cartão /
fatura"). Foi repetido para ele, e a arquitetura foi montada em cima do que é
real:

- **Recebimentos automáticos:** via **Asaas**, que ele já tem chave. É a única
  automação bancária de verdade disponível.
- **Saldo:** calculado, não lido do banco. Ponto de partida informado uma vez,
  e daí em diante entra o que foi recebido e sai o que foi pago.
- **Conciliação:** ele informa de vez em quando o saldo real, e o sistema
  guarda a diferença. Nunca vai ler o banco sozinho.

Descoberto de passagem: **o Asaas tem `/finance/balance`**, então o dinheiro
parado lá dentro é legível por API. A conta é MEI, produção, e a chave é de
produção — **qualquer cobrança criada com ela é real, com boleto de verdade**.
Nos testes só foram usadas rotas de leitura.

### A ideia que faz a tela ficar simples

Itens 1, 2, 3, 6 e 7 são **o mesmo dinheiro visto de ângulos diferentes**. O
dinheiro está numa conta só; o que muda é quanto já tem dono. Daí a "cascata":

```
Saldo em caixa
 − impostos − folha − reserva − capital de giro
 = LIVRE PARA USAR      (verde se sobra, vermelho se não)
```

### Estrutura

Abas do Financeiro: **Painel · A pagar · A receber · Contas fixas · Ajustes**.
A antiga aba "Resumo" foi absorvida pelo Painel (por categoria e por
fornecedor continuam lá).

Tabelas novas na base Financeiro:

- `Recebimentos` (`tbl4tMnm3t3peeLYo`) — contas a receber, com campos do Asaas
  já prontos (`Asaas_Cobranca_Id`, `Asaas_Link`) e `Comprovantes` (anexo)
- `Config_Financeiro` (`tbl3uT9h7ZYXnfR7E`) — **uma linha só**: saldo inicial,
  metas de reserva e giro, regime, imposto, teto do MEI, folha
- `Conferencias` (`tblIrMrXYI6FZdKfS`) — conciliação bancária

`Despesas` ganhou o campo `Comprovantes` (anexo).

### Contas que o painel faz sozinho

- **Saldo** = saldo inicial + recebido desde a data − pago desde a data
- **Impostos**: MEI = DAS fixo do mês; Simples = alíquota × o que entrou no mês
- **Folha**: com 13º e férias marcado, guarda ~19,4% a mais por mês
  (1/12 de um salário + 1/12 de um salário e um terço)
- **Previsão**: mês a mês, entra − sai, acumulando sobre o saldo. **A linha
  fica vermelha no mês em que o caixa vira negativo** — é o aviso mais
  importante da tela, e aparece meses antes do problema.
- **Teto do MEI**: barra do faturamento do ano contra o limite. Avisa em 80% e
  avisa de novo se passar. **O valor do teto é digitado nos Ajustes de
  propósito** — ele muda de tempos em tempos, e é melhor o dono confirmar o
  vigente do que o sistema afirmar um número velho.

### Descoberta que muda a regra de velocidade

A regra anterior era "um workflow = uma ida ao Airtable, e o app dispara todas
juntas". Ela tem um teto: **o navegador só faz cerca de SEIS chamadas ao mesmo
tempo por servidor.** Com 8, ele faz duas rodadas e o tempo dobra (medido:
1 chamada 649ms · 4 juntas 757ms · 8 juntas 1442ms).

Por isso `carregarFinanceiro` tem **duas ondas**:

- **Primeira (5 chamadas, ~780ms):** despesas, recebimentos, contas fixas,
  ajustes e cadastros — o que a tela precisa para aparecer.
- **Segunda, sem segurar a tela:** fornecedores, última conferência e o
  lançamento das contas fixas vencidas. Nada aqui muda os números do painel.

Os cadastros entram na primeira onda porque é deles que sai a lista de clientes
das contas a receber — sem isso, escolher cliente só funcionaria depois de
passar pela aba Consultar. De brinde, a Consulta passou a abrir pronta.

### Ainda falta (o dono já sabe)

- **Cobrança pelo Asaas**: criar boleto/PIX pelo app e dar baixa sozinho pelo
  webhook de pagamento. Os campos no Airtable já existem esperando.
- **Comprovantes**: os campos de anexo existem nas duas tabelas, mas o app
  ainda não envia arquivo. O caminho é o endpoint `uploadAttachment` do
  Airtable (aceita base64, limite de 5MB por arquivo).

## Divisão do lucro entre os sócios e a empresa (26/08/2026)

Como funciona na vida real, segundo o dono: **o lucro de cada serviço (o que o
cliente pagou menos o material) é dividido em três** — uma parte para ele, uma
para o pai, uma para a empresa. As duas partes pessoais **saem sempre**; a da
empresa é que banca as contas, e por isso costuma sobrar menos.

Ele acrescentou uma condição importante: só tirar **"quando entrou, e tem saldo
suficiente em conta, pois estamos com grande dificuldade financeira no
momento"**. Isso virou o centro do desenho.

### Como o material chega (ele pediu os dois caminhos)

- **Campo no próprio serviço** (`Recebimentos.Material_Valor`) — para o que não
  foi lançado como despesa separada. Rápido.
- **Vínculo na compra** (`Despesas.Servico_Ref`) — ao lançar a despesa, escolhe
  a qual serviço ela pertence.

**Material total = o campo + as compras vinculadas.** O texto na tela avisa
para não lançar a mesma compra nos dois lugares, que é o único jeito de errar.

### O número que importa: "o caixa aguenta tirar agora"

```
saldo em caixa
 − contas que vencem nos próximos 30 dias (mais as já vencidas)
 − imposto do mês
 − folha do mês
 = o que dá para tirar sem deixar conta descoberta   (nunca negativo)
```

Isso é mostrado junto do que cada sócio tem a retirar. Quando o direito é maior
que a folga, a tela diz as duas coisas: *"há R$ 933,33 a retirar, mas só
R$ 250,00 sobra depois das contas dos próximos 30 dias"*.

O formulário de retirada **avisa mas não impede**. Passar da folga do caixa, ou
tirar mais do que se tem direito (vira adiantamento), mostra aviso — quem
decide é o dono, que pode ter motivo.

### O bloco "A parte da empresa"

É a peça que torna visível o que ele já sentia:

```
Coube à empresa nos serviços
 − contas pagas que NÃO são material de serviço
 = sobrou para a empresa      (vermelho quando negativo)
```

Negativo quer dizer que a fatia da empresa não cobriu as contas dela, e a
diferença saiu do caixa. É a explicação de por que sobra menos do que parece.

### Decisões que valem lembrar

- **O direito de cada sócio é sempre calculado, nunca gravado.** Corrigir o
  valor de um serviço ou o material corrige a divisão junto. A tabela
  `Retiradas` guarda só o que de fato saiu.
- **Retirada é saída de caixa**, então entra no `saldoEmCaixa` e na coluna
  "saiu" do fluxo. Sem isso o saldo mostraria dinheiro que já não está lá.
- **Só serviço com status Recebido divide.** Não se reparte dinheiro que ainda
  não entrou.
- **As fatias são configuráveis** (`Config_Financeiro.Socio_N_Percentual`),
  com 33,3333% cada por padrão. A empresa fica com o que sobrar dos dois. Os
  Ajustes mostram a conta enquanto se digita, para não passar de 100%.
- Os nomes dos sócios são gravados como **texto** na retirada, não como
  vínculo: se o nome mudar nos Ajustes, o histórico antigo continua verdadeiro.

### Tabela nova

`Retiradas` (`tblh3m5JB6N2sNs5i`) — data, sócio, valor, observações.

## Cartões de crédito e pagamento da fatura por PIX (27/08/2026)

**Este é o único lugar do projeto que move dinheiro de verdade.** A chave do
Asaas é de produção e PIX não volta — qualquer mexida aqui merece cuidado
extra.

### Como o dono descreveu o fluxo

O débito automático da fatura fica na conta do próprio cartão. O sistema deve
mandar um **PIX do Asaas para a conta do cartão** no valor da fatura. Ele
alimenta o sistema com as compras, então o sistema sabe o valor
*indiretamente*. Um dia antes do vencimento, ao abrir a tela, o sistema avisa,
mostra o valor que calculou, e pede confirmação — se o valor estiver errado,
ele corrige antes de confirmar.

### Tabelas novas

- `Cartoes` (`tblzJwNGcTpvGmYiM`) — nome, banco, bandeira, final, **chave PIX +
  tipo** (para onde o dinheiro vai), dia de fechamento, dia de vencimento,
  limite, ativo.
- `Pagamentos_Fatura` (`tbldfftPos0qX7nlm`) — comprovante de cada PIX enviado.
  **Não é movimento de caixa** (quem tira dinheiro do caixa são as despesas
  marcadas como pagas); serve de auditoria e, principalmente, de trava.
- `Despesas.Cartao_Ref` — em qual cartão a compra caiu.

### Em qual fatura cada compra cai

Calculado **no app** (`faturaDaCompra`), não no n8n — o app já tem os cartões
carregados, então não custa nenhuma ida a mais ao servidor:

- comprou até o dia do fechamento → entra na fatura que fecha naquele mês;
- depois disso → na fatura do mês seguinte;
- e se o dia de vencimento for **anterior** ao de fechamento, a fatura só vence
  no mês seguinte ao fechamento.

A tela mostra a conta enquanto se escolhe ("Essa compra entra na fatura que
vence em 15/10"), então dá para conferir na hora em vez de descobrir depois.

### As seis travas do pagamento (todas testadas)

O workflow `App - Pagar fatura do cartao` (`pagar-fatura`) recusa, nesta ordem:

1. **fatura já paga** — mesmo cartão + mesmo vencimento com Status `Enviado`
2. **cartão não encontrado**
3. **cartão sem chave PIX cadastrada**
4. **valor abaixo de R$ 0,01**
5. **valor acima de R$ 100.000** — trava de dedo errado; acima disso, banco
6. **saldo insuficiente no Asaas** — confere antes, e se não conseguir
   consultar o saldo, também recusa em vez de mandar às cegas

**A chave PIX vem SEMPRE do cadastro do cartão, nunca do pedido do app.** O app
manda só quanto e de qual cartão. Assim nem um app adulterado consegue
redirecionar o dinheiro para outro lugar.

### Ordem das gravações depois que o PIX sai

O comprovante em `Pagamentos_Fatura` é gravado **antes** de marcar as despesas.
Se algo falhar no meio, o pior caso é ter o registro do dinheiro que saiu —
nunca dinheiro sem rastro. A resposta de erro nesse caso diz explicitamente
para conferir no Asaas e marcar à mão.

### Valor diferente do calculado

O campo do valor é editável, porque a fatura real pode ter compra que ainda não
foi lançada. Quando o valor confirmado difere do somado, o sistema **lança a
diferença como uma despesa própria** ("Diferença da fatura X"), senão o caixa
ficaria errado exatamente pelo tamanho da diferença.

### O que o PIX NÃO faz

Não vira uma despesa nova. Quem tira o dinheiro do caixa são as despesas da
fatura sendo marcadas como pagas — a mesma regra travada antes, para o mesmo
real não contar duas vezes.

### Segunda forma de pagar: boleto/linha digitável (28/08/2026)

**Nem todo cartão tem chave PIX fixa pra fatura.** O cartão real do dono (do
Itaú) manda um **QR code Pix diferente todo mês**, por e-mail — não uma chave
fixa reutilizável. Pesquisado e confirmado: o **Asaas não paga um Pix Copia e
Cola de outro banco** por API, só gera o próprio pra receber. A fatura, porém,
também vem com o boleto tradicional (linha digitável), e isso sim o Asaas paga
de verdade (`POST /v3/bill`, endpoint do recurso "Pague Contas" deles — já
confirmado antes que aceita conta de terceiro: INSS, DAS, Simples).

Por isso existe uma **segunda forma de pagar a fatura**, lado a lado com a
chave PIX:

- **Com chave PIX fixa** (cartão comum): botão "Pagar por PIX agora", como já
  existia — `App - Pagar fatura do cartao` (`pagar-fatura`).
- **Sem chave fixa** (caso do Itaú): campo pra colar a linha digitável daquele
  mês + botão "Pagar este boleto agora" — `App - Pagar fatura do cartao por
  boleto` (`pagar-fatura-boleto`). Aparece sempre que o cartão existe, mesmo
  que ele *também* tenha chave PIX (dá pra escolher qualquer um dos dois).

O boleto **continua exigindo um toque manual todo mês** (colar o código) — não
tem como fugir disso sem o sistema ler o e-mail do banco sozinho, que é um
projeto bem maior (mesmo tamanho da automação de nota fiscal por e-mail já
descartada por enquanto). O que se manteve automático foi o resto: o aviso um
dia antes do vencimento, o valor somado das compras, e a trava contra pagar
duas vezes.

**Mesmas cinco travas do PIX**, adaptadas: fatura já paga, cartão inexistente,
valor abaixo de R$ 0,01, valor acima de R$ 100.000, saldo insuficiente no
Asaas. A única que muda é a validação da chave: como não há chave salva pra
conferir contra, quem valida o formato da linha digitável é o próprio Asaas
(testado com `identificationField` inválido → recusa por formato, sem mover
nada). `Pagamentos_Fatura.Metodo` (novo campo: PIX/Boleto) registra qual
caminho foi usado.

### Ainda não testado de ponta a ponta

**Nenhum PIX nem boleto real foi enviado nos testes** — o saldo do Asaas está
em R$ 0,00, e foi exatamente essa trava que barrou as duas tentativas. Os dois
endpoints foram conferidos com entrada inválida (valor 0 pro PIX, linha
digitável inválida pro boleto — os dois recusados pelo Asaas antes de mover
qualquer coisa), o que provou que a chave tem permissão e o formato do pedido
está certo nos dois casos. **O primeiro pagamento de verdade será o do dono**
— recomendado começar com um valor pequeno.

### Credencial

A chave do Asaas virou a credencial `Asaas API (producao)` (`httpHeaderAuth`,
cabeçalho `access_token`) **dentro do n8n**, id `99sqJeNJjk6jJRgZ`. Conferido
que os arquivos em `n8n/*.json` referenciam só o id e o nome — a chave nunca
aparece no repositório.

## Revisão de segurança e de perda de dados (29/08/2026)

Feita depois do incidente de 28/08, a pedido do dono, com quatro princípios
que valem daqui pra frente: **não perder dado recente; não fazer mudança
irreversível sozinho e sem avisar; não deixar dado exposto; aguentar ataque
básico.**

### Backup diário — antes não existia nenhum

`App - Backup de tudo` lê as **13 tabelas das 3 bases** e grava um JSON com os
registros crus (`id` + `fields`), de onde dá pra reconstruir na mão.

- **Onde**: `C:\Users\rediv\.n8n-files\backups-sistema\` — um arquivo por dia
  (`2026-08-29.json`) e um `ultimo.json` fixo.
- **Por que essa pasta e não o OneDrive**: o n8n só grava dentro de
  `~/.n8n-files`. Ele tem uma lista de pastas permitidas
  (`restrictFileAccessTo`, padrão `~/.n8n-files`) e qualquer outro caminho dá
  `The file ... is not writable`. Mudar isso exige a variável
  `N8N_RESTRICT_FILE_ACCESS_TO` na hora de subir o n8n — e o dono sobe na mão,
  então não dá pra confiar que vai lembrar. Copiar pro OneDrive por dentro do
  n8n também não deu: **o nó `executeCommand` não existe nesta instalação**
  (`Unrecognized node type`), o que aliás é um padrão bom.
- **Dois gatilhos, de propósito**: agendado às 22h *e* uma chamada do próprio
  app ao entrar, no máximo uma vez por dia (`backupDoDia`, guardada em
  `localStorage`). Só o agendamento não bastava — ele só roda se o PC estiver
  ligado às 22h. O gatilho do app roda quando os dados de fato mudam.
- Custa ~8s e não trava a tela: falha de backup nunca impede de entrar.
- **A pasta fica fora do repositório**, que é público e não pode receber dado
  de cliente.

### Config_Financeiro podia duplicar e sumir — a causa provável do susto

Duas falhas somadas, nas duas pontas:

- `salvar-config` confiava no `id` que o app mandava e, **sem id, criava linha
  nova** numa tabela que só pode ter uma.
- `listar-config` buscava **sem filtro nenhum** e pegava `[0]` — a linha que o
  Airtable devolvesse primeiro, ordem que depende da view.

Junte os dois e o resultado é exatamente o que o dono relatou: salva, fecha,
abre e está tudo zerado. Agora:

- `salvar-config` **procura a linha ele mesmo** (`{Chave} = 'principal'`) e o
  app não manda id nenhum. Não existe caminho que crie a segunda linha.
- Os dois lados escolhem a **mais antiga** por `createdTime` — critério que não
  muda se alguém reordenar a view.
- Verificado com quatro pedidos malformados (sem corpo, id vazio, id
  inventado, id sem formato): nenhuma linha nova, nenhum valor alterado.

**Sobrou uma linha duplicada** (`recV4T0MA60rb5OjW`, só com `Chave`, nenhum
dado) criada por um teste em 29/08. Está inerte e foi deixada de propósito:
apagar é irreversível e o dono precisa saber antes.

### Gravação parcial não zera mais o resto

`SALVAR_CONFIG` só grava **os campos que vieram no pedido**
(`hasOwnProperty`). Antes, um pedido com metade dos campos zerava a outra
metade — foi assim que os dados de verdade se perderam em 28/08.

### Senha

Trocada: era uma data de nascimento — 8 dígitos, chutável por quem conhece o
dono, e escrever a antiga aqui neste arquivo entregaria o padrão. Virou uma
frase de 4 palavras + 3 dígitos, 30 caracteres. 244 palavras disponíveis dão
~3,2×10¹² combinações: a 1.000 tentativas por segundo, ~51 anos em média.

- Guardada em `C:\Users\rediv\senha-app.txt`.
- **Trocada nos 37 workflows de uma vez** e conferido que a antiga não entra em
  nenhuma rota, nem de leitura nem de gravação.

**Armadilha que custou caro:** `scratchpad/fin-comum.js` lia a senha de
`cgtZoemwpad0tVTN.json`, um export **congelado no tempo**. Republicar qualquer
workflow o fazia voltar pra senha velha, e a tela parava de salvar sem
explicação. Agora lê de `senha-app.txt`, a fonte de verdade.

### CORS fechado

Os 38 webhooks estavam com `allowedOrigins: '*'` — qualquer site do mundo
podia falar com o túnel pelo navegador do dono. Agora só:

```
https://nicolasredivo.github.io,http://localhost:8099,http://127.0.0.1:8099
```

Medido: o navegador libera as duas primeiras e bloqueia as demais. Isso **não**
substitui a senha (CORS não vale pra `curl`); serve pra impedir que um site
qualquer use o navegador do dono como ponte pra ficar chutando senha.

**Se o app for aberto de um endereço fora dessa lista, todas as telas param com
erro de CORS.** Para liberar outro, editar `scratchpad/seguranca5-cors.js` e
rodar de novo.

Cuidado ao mexer em workflow pela API: **`PUT` despublica**, e `settings` só
aceita `executionOrder`, `saveDataSuccessExecution` e
`saveDataErrorExecution` — qualquer outra chave dá HTTP 400 (o
`App - Testar conexao` tinha `binaryMode` e `availableInMCP` e quebrou por
isso, duas vezes).

### Endereço do túnel saiu do repositório

`config.js` ia pro GitHub **com o endereço do túnel dentro** — a porta de
entrada do sistema, num repositório público. Agora `N8N_BASE_URL = ""` e o
endereço é digitado na tela de entrada, guardado só no aparelho. O app já
avisava certo quando falta: *"Falta o endereço do n8n"*.

### O que ainda está aberto

- Não há limite de tentativas de senha. Com a senha nova o risco é teórico
  (~51 anos), mas some se a senha voltar a ser fraca.
- O backup só existe se o n8n rodar. Não há aviso de "faz X dias sem backup".
- A cópia pro OneDrive não é automática: hoje o backup mora só neste PC. O
  Airtable continua sendo a cópia fora do PC.

## Cliente sincronizado com a Asaas ao cadastrar (29/08/2026)

Todo cadastro (condomínio/empresa/pessoa física) agora vira **cliente na
Asaas** sozinho, sem digitar de novo lá. Criado e editado no
`App - Salvar entidade` / `App - Atualizar cadastro`; **nunca excluído por
ali** (decisão do dono: excluir cliente na Asaas apaga junto qualquer cobrança
pendente ou vencida dele, e isso não tem volta — exclusão no sistema local
deixa o cliente órfão na Asaas de propósito, para excluir lá é preciso ser na
mão).

Campo novo, só aditivo: `Asaas_Customer_Id` em `Entidades_Cadastradas`,
guardando o id que a Asaas devolve. Sem ele cada edição precisaria procurar o
cliente na Asaas de novo.

**De onde vem cada campo do cliente na Asaas:**

| Campo Asaas | Vem de |
|---|---|
| `name` | `Razao_Social_Nome` |
| `cpfCnpj` | `CPF_CNPJ`, só dígitos |
| `email` (principal) | `Emails_Financeiro_NFE` — decisão do dono, é o que ele considera o principal |
| `additionalEmails` | e-mail do contato (o primeiro), só se for diferente do de cima |
| `mobilePhone` | primeiro WhatsApp do contato, sem o 55 na frente — **não** o `WhatsApp_CNPJ` (esse é só o telefone da Receita) |
| `address` / `addressNumber` / `complement` / `postalCode` | separados por regex do `Endereço completo` do primeiro local vinculado (formato `"RUA X, 100, CEP 00000-000"`) |
| `province` | o bairro, primeira parte de `Bairro_Cidade` |
| `notificationDisabled` | `true`, **só na criação** |
| `externalReference` | o id do cadastro no Airtable |

**Hoje sempre 1 local e 1 contato por cadastro, mas o formulário aceita
vários — usa sempre o primeiro vinculado de cada.** Se um dia isso deixar de
bastar, é só avisar.

**O endereço é um texto só, não campos separados.** Enquanto seguir o padrão
de sempre (a consulta à Receita gera assim), a separação funciona. Um endereço
digitado fora desse padrão manda CEP/número vazios pra Asaas — não trava nada,
só sincroniza incompleto.

**A notificação nunca é mandada numa edição**, só na criação. Testado de
verdade: liguei a notificação direto na Asaas, editei o cadastro pelo app
mudando o e-mail, e a notificação continuou ligada — a chave simplesmente não
viaja na edição, então nada volta atrás sozinho.

Verificado de ponta a ponta com um CNPJ descartável (criado, editado,
excluído, cliente de teste removido da Asaas manualmente depois) — nunca na
linha de um cliente real. **Achado no meio do teste**: meu primeiro gerador de
dígito verificador de CNPJ tinha os pesos errados; a Asaas recusou
corretamente ("CPF/CNPJ inválido") — não era bug no fluxo.

**Importante: essa sincronização não cobre cadastro que já existia antes
dela.** Os 4 cadastros que já estavam no sistema em 29/08 precisaram de uma
rodada manual à parte (reenviando os mesmos dados de cada um pelo
`atualizar-cadastro`, só para disparar a criação na Asaas) — documentado
abaixo. **Se aparecer cadastro novo no futuro que não passe por
`salvar-entidade`** (importação em lote, por exemplo), vai precisar do mesmo
tipo de rodada manual.

### Notificação padrão de cobrança para todo cliente (29/08/2026)

A Asaas cria, sozinha, 8 preferências de notificação para cada cliente novo
(uma por evento) — e o padrão dela manda e-mail **e** SMS pro cliente em quase
tudo. O dono definiu o padrão dele, evento por evento (só o canal
"para o cliente"; "para mim" fica como a Asaas já traz, desligado):

| Evento na Asaas | `scheduleOffset` | Regra do dono |
|---|---|---|
| `PAYMENT_CREATED` | 0 | só e-mail |
| `PAYMENT_UPDATED` | 0 | nada |
| `PAYMENT_DUEDATE_WARNING` | 10 | só e-mail |
| `PAYMENT_DUEDATE_WARNING` | 0 | nada |
| `SEND_LINHA_DIGITAVEL` | 0 | nada |
| `PAYMENT_OVERDUE` | 0 | só e-mail |
| `PAYMENT_OVERDUE` | 7 | só e-mail |
| `PAYMENT_RECEIVED` | 0 | nada |

**Aplicado nos 4 clientes já existentes** (uma rodada manual, via
`GET .../customers/{id}/notifications` + `PUT .../notifications/{id}` por
evento) e **virou automático para todo cliente novo**: depois que
`Salvar entidade` (ou a primeira sincronização de um cadastro antigo, dentro
de `Atualizar cadastro`) cria o cliente na Asaas, o próprio fluxo lê as 8
notificações que a Asaas acabou de criar e ajusta cada uma para o padrão
acima, antes de responder ao app.

**Numa edição normal (cliente que já tem `Asaas_Customer_Id`) as notificações
não são tocadas de novo** — só são configuradas no momento em que o cliente é
criado. Testado: editar um cadastro já sincronizado não mexeu nas
notificações dele.

**Achado no caminho, vale registrar**: um workflow de teste com
`sendBody` calculado por fórmula (`={{ metodo !== "GET" }}`) **respondia
normalmente mas não mandava o corpo de verdade** — o PUT "funcionava" (a
Asaas respondia com o objeto) só que nada mudava. Trocado por dois nós fixos
(um só de leitura, sem corpo; um só de gravação, com corpo sempre ligado) e
passou a funcionar. Os workflows de produção nunca usaram esse truque —
o `metodo`/`url` dinâmico neles é só no `{{ }}` do próprio texto, nunca no
`sendBody`.

### Contato com mais de um e-mail (30/08/2026)

Achado no cadastro `76874528000151` (PANACAT): o contato "camillo" tem 4
e-mails cadastrados, mas só o primeiro estava indo pra Asaas — os outros 3
eram descartados sem aviso nenhum. A Asaas aceita mais de um e-mail extra no
mesmo cliente (`additionalEmails`, separados por vírgula); o código só não
estava juntando todos.

Corrigido em `Salvar entidade` e `Atualizar cadastro`: agora TODOS os
e-mails do contato entram (junto com o de Financeiro/NF-e), sem repetir. O
primeiro vira o principal (`email`), o resto vai todo em `additionalEmails`.
Continua valendo: o de Financeiro/NF-e é sempre o principal quando existe —
só muda o que costumava ser jogado fora.

Reaplicado no PANACAT (reenviando os dados sem mudar nada, só pra disparar a
correção) e conferido direto na Asaas: os 4 e-mails chegaram. Testado também
que cadastro com um e-mail só (o caso comum) continua saindo exatamente
igual a antes.

## Chamados: criação e agendamento inicial (02/09/2026)

Área nova, planejada numa conversa longa com o dono antes de construir
(vários rounds de perguntas/decisões, incluindo um documento formal que ele
trouxe). Esta primeira etapa cobre **só** abrir e agendar um chamado —
atendimento/execução, materiais usados, conclusão, cobrança e nota fiscal
ficam para uma rodada futura, decisão deliberada dele.

### Onde vive

Tabela nova **`Chamados`** (`tbltipxOIw8F96QHO`), na base **`cadastro`**
(`app6PyYmtFduIMp7B`) — não numa base própria, porque vínculo
(`multipleRecordLinks`) do Airtable só liga registro dentro da mesma base, e
todo chamado se liga a um cadastro de `Entidades_Cadastradas`.

Campos principais: `Numero_Chamado` (sequencial, calculado pelo n8n — o
Airtable não cria autonumber por API), `Cliente_Ref` (o vínculo) mais uma
**cópia** de nome/documento/endereço/contato no momento da criação (decisão
do dono: vínculo *e* cópia, para o chamado continuar legível mesmo que o
cadastro mude ou seja excluído depois), `Local_Exato` (texto livre, tipo
"teto da garagem"), `Descricao_Solicitacao`, `Anexos` (nativo do Airtable),
`Observacoes_Servico` (interna, nunca visível pro cliente — o app é 100%
interno), `Status`, `Horario_Combinado_Cliente` (só informativo),
`Reservado_Inicio`/`Reservado_Fim`/`Duracao_Escolhida` (o bloco real que
conta pra conflito) e `Historico` (uma linha por mudança importante,
escrita automaticamente).

### Dois horários, não um só

Ponto que o dono corrigiu durante o planejamento: o horário combinado com o
cliente **não é** o que deve bloquear a agenda, porque o bloco reservado
precisa ser maior — inclui sair de casa, parar pra comprar material, etc.
`Reservado_Inicio` + `Duracao_Escolhida` é o que entra na conta de conflito;
`Horario_Combinado_Cliente` é só uma anotação dentro desse bloco.

Duração: 1h/2h/3h com horário livre, ou período fixo — **Manhã 8h-12h,
Tarde 13h30-18h, Dia inteiro 8h-18h** (`LOGICA_BLOCO` em
`chamados-comum.js`). São *defaults* ajustáveis, não regra gravada — o
horário de funcionamento pode variar por demanda.

### Status

`Aberto` (que eu tinha proposto) e `Aguardando confirmação de data` (do
documento do dono) descreviam a mesma coisa — viraram um status só, com o
nome mais descritivo. Conjunto final: **Aguardando confirmação de data →
Agendado → Em andamento → Concluído**, mais **Cancelado** (só marca, sem
exigir motivo).

### Conflito de horário, com "empurrar"

Fluxo combinado com o dono, mais rico que um simples avisa/bloqueia:

1. Ao marcar uma data que bate com outro chamado, mostra o que já está lá.
2. Sugere o próximo horário livre com duração suficiente (procura no dia
   pedido, e se não couber, nos dias seguintes).
3. O dono escolhe: usar o horário livre sugerido, **ou** marcar mesmo assim
   e empurrar o chamado antigo pro horário livre — as duas gravações
   acontecem juntas, cada uma com sua própria linha no `Historico`.

### Workflows

`App - Checar conflito de chamado` (só lê, chamado toda vez que o app mexe
nos campos de data/horário, antes de confirmar), `App - Criar chamado`
(relê os dados do cliente no Airtable em vez de confiar no que o app
mandou, calcula o número sequencial, sobe anexos depois de criar o
registro), `App - Reagendar chamado` (data/horário/duração, o mecanismo de
empurrar, e — extensão pequena, não estava no plano original mas fechava
uma lacuna real — cancelamento: `{chamadoId, cancelar: "true"}` só muda o
status, sem mexer em agendamento), `App - Listar chamados` (chamados
ativos, já separados em "sem data" e "com data").

**Anexos: 5MB por arquivo, não 10MB.** O plano original tinha 10MB
(aprovado pelo dono), mas o endpoint de upload direto do Airtable
(`content.airtable.com/.../uploadAttachment`, base64, sem precisar de URL
pública) tem limite próprio de 5MB — descoberto na implementação, ajustado
e avisado.

**Erro real encontrado e corrigido durante o teste**: o campo `anexos`
viajava do app pro n8n como array de verdade, mas o formulário é enviado
como `URLSearchParams` (pra não pedir a verificação extra de CORS) — que
não sabe serializar array nenhum, só vira texto tosco. A submissão
quebrava silenciosamente sempre que havia agendamento envolvido. Corrigido
seguindo o mesmo padrão que "locais"/"contatos" já usam no Cadastro:
`anexos` viaja como **texto JSON num campo só**, e o workflow faz
`JSON.parse` do outro lado.

### App

Aba nova "Chamados", com "Agenda" (tela inicial: seção "Aguardando data" no
topo + lista de hoje/próximos dias) e "Criar chamado". Busca de cliente
**100% no navegador** — sem chamada nova a cada letra, reaproveitando o que
`listar-cadastros` já devolve hoje (razão social, nome fantasia, CPF/CNPJ,
nomes dos contatos via o lookup `Contatos_Nomes`, que já existia
justamente pra isso). Ao escolher, `listar-locais`/`listar-contatos` (já
existiam, já aceitam `{documento}`) trazem endereço/telefone/e-mail — o
mesmo mecanismo que a aba Consultar já usa.

Testado de ponta a ponta no navegador de verdade (não só por chamada
direta): busca, autopreenchimento, escolha de contato quando há mais de
um, criação sem e com data, o aviso de conflito completo (mostra → sugere
→ empurra), cancelar com dois toques, e o layout no celular (~375px) —
tudo com um cadastro descartável, nunca num cliente real.

### Editar chamado depois de criado, e layout de horário (03/09/2026)

Faltavam duas coisas depois da primeira entrega: só dava pra reagendar
(mudar data/horário), não editar o resto; e o campo de duração era um menu
suspenso, lento de usar no dia a dia.

**Duração agora é botão de toque único** (1h/2h/3h/Manhã/Tarde/Dia
inteiro), num campo escondido por baixo pra não mudar o resto do código
que já lia `.value`. Quando a duração é um período fixo, o campo "Reservar
a partir de" some e vira um texto informativo ("A partir das 08:00.") —
mais claro que um campo desabilitado, que em alguns navegadores parece
quebrado. Os dois formulários (criar e editar) usam a mesma função
`ligarDuracaoPills`/`selecionaDuracaoPill`.

**Editar chamado**: workflow novo `App - Editar chamado` cobre o que
"Reagendar" não cobria — local exato, descrição, observações, o contato
escolhido (relê o contato no Airtable se mudou) e novos anexos (soma aos
que já existiam; ainda não dá pra excluir um anexo salvo, só adicionar).
Data/horário continuam sendo só do "Reagendar chamado", que já tinha a
lógica de conflito — o botão "Salvar" da edição chama os dois workflows em
sequência quando a data está preenchida, e só o de edição quando não está.
O cliente do chamado não muda nessa tela — só o que foi pedido, pra quem,
e quando.

`Listar chamados` passou a devolver também `clienteDocumento` (pra buscar
a lista de contatos do cliente ao editar), `clienteId`, `observacoesServico`
e `anexos` (nome + link), que faltavam.

**Achado no teste**: ao testar pela primeira vez com dados reais no
navegador, apareceu um chamado #1 de verdade (`EDIFICIO MONTE SAINT
MICHEL`) — o dono já tinha usado a tela assim que foi entregue. Cuidado
tomado: abri a edição dele sem querer, fechei sem salvar nada, e testei
tudo de novo só no cadastro descartável, deixando o chamado real intocado.

### Anexo: foto e PDF em botões separados (03/09/2026)

O campo de anexo misturava `accept="image/*,.pdf"` num input só. No
celular, misturar tipos assim costuma fazer o navegador abrir o
gerenciador de arquivos genérico em vez da galeria de fotos direto — o
dono pediu explicitamente pra abrir a galeria. Virou dois botões
("📷 Adicionar foto" / "📄 Adicionar PDF"), cada um com seu próprio
`<input type="file">` escondido com `accept` puro de um tipo só — é o
`accept` puro de imagem que faz o celular priorizar a galeria. Os dois
alimentam a mesma lista de anexos por baixo; o usuário nem percebe a
diferença, só que agora tem dois toques em vez de um.

### Duração combinada: período + horas extras (03/09/2026) — SUBSTITUÍDO

> Esta abordagem (botões de período + extensão) foi trocada no mesmo dia
> por algo mais simples — ver "Agendamento livre: só início e fim
> (03/09/2026)" logo abaixo. Fica registrado aqui só pelo achado do bug em
> `achaHorarioLivre`, que continua válido.

Pedido: Manhã ou Tarde poder vir combinado com uma extensão — "Manhã + 2h",
"Tarde + 1h" etc. — pro serviço que passa um pouco do período normal mas não
chega a precisar do dia inteiro. Só Manhã e Tarde aceitam extensão (1h/2h/3h);
Dia inteiro e as durações em hora fixa (1h/2h/3h sozinhas) não fazem sentido
combinadas.

**Codificação**: uma string só, `"Período manhã + 2h"` — o período normal
seguido de `" + Nh"` quando há extensão. Guardada assim direto no Airtable
(`Duracao_Escolhida` continua singleSelect; `typecast: true`, já usado em
toda escrita, cria a opção nova sozinho, sem precisar mexer no schema à
mão). `separaDuracaoExtra()` (n8n, em `chamados-comum.js`) e sua espelha no
app `separaDuracaoBase()` (`app.js`) fazem o parse — o resto da lógica de
cálculo de bloco/conflito não muda, só o fim do bloco é empurrado pelas
horas extras.

**Tela**: segunda fileira de botões ("Só o período" / "+1 hora" / "+2
horas" / "+3 horas") aparece só quando Manhã ou Tarde está selecionado,
embaixo da fileira principal de duração — nos dois formulários (criar e
editar). `ligarDuracaoPills`/`selecionaDuracaoPill` (`app.js`) ganharam um
parâmetro a mais (o container da segunda fileira) pra mostrar/esconder e
marcar a opção certa, inclusive ao reabrir um chamado que já tem uma
extensão salva.

**Achado testando (bug de verdade, não só do combo)**: `achaHorarioLivre`
montava o horário sugerido cortando a string ISO na marra
(`cursor.slice(11, 16)`), assumindo que ela sempre vinha no formato
`-03:00`. Isso só era verdade quando o cursor vinha de `isoBrasilia(...)`
(dia sem nenhum chamado antes) — mas quando a folga sugerida começa logo
depois do fim de um chamado já existente, esse fim vem do Airtable, que
**sempre** devolve data/hora em UTC (`...Z`). Nesse caso a sugestão saía
com a hora errada (UTC em vez de Brasília) — um bug que já existia antes
do combo, só nunca tinha sido pego porque os testes unitários até então só
usavam strings montadas à mão em `-03:00`. Corrigido com uma função nova,
`horaLocalBrasilia(iso)`, que converte de verdade (soma/subtrai o fuso via
`Date`) em vez de cortar a string. Redeploy feito nos três workflows que
usam essa lógica (`App - Checar conflito de chamado`, `App - Criar
chamado`, `App - Reagendar chamado`).

**Dev server pro navegador embutido**: criado `.claude/launch.json`
(`npx serve -l 8099 .`) pra testar o app servido por HTTP de verdade — só
abrir como `file://` faz o navegador embutido renderizar como "static
snapshot" e não carrega `style.css`/`app.js` (achado ao ver que a segunda
fileira de duração aparecia sempre visível, sem nenhum CSS aplicado).

### Agendamento livre: só início e fim (03/09/2026)

Depois de entregues os botões de período + extensão, o dono pediu algo
mais direto: **nada de botão pra escolher duração** — só dois campos de
horário, "De" e "Até", pra marcar o intervalo que quiser (ex: cliente
combinou 14h, mas o serviço reserva das 13:30 às 17:30, um intervalo que
não bate com nenhum período fixo). Substitui de vez o esquema de Manhã/
Tarde/Dia inteiro/1h/2h/3h e sua extensão — tudo isso saiu.

**Simplificação grande no back-end**: como o bloco reservado agora é
sempre um "de tal hora até tal hora" escolhido direto, toda a lógica de
período fixo (`PERIODOS`, `HORAS_FIXAS`, `separaDuracaoExtra`,
`calculaBloco`) saiu de `chamados-comum.js` — no lugar entrou uma função
só, `montaBloco(data, inicio, fim)`, que apenas monta o ISO de cada
horário. `achaHorarioLivre` também simplificou: em vez de receber uma
string de duração e ter que decifrá-la, agora recebe a duração pronta em
milissegundos (calculada por quem chama, como `fim - início` do pedido)
— e de quebra passou a devolver também `fim`/`fimIso` da sugestão (antes
só devolvia o início), o que sobrou bem útil pro mecanismo de "empurrar"
abaixo.

**Campo `Duracao_Escolhida` no Airtable parou de ser usado.** Era
`singleSelect` com `typecast: true` criando opção nova a cada valor —
funcionava bem quando os valores eram um conjunto pequeno e fixo
(1h/2h/3h/períodos), mas com início/fim livres cada chamado teria uma
combinação diferente, o que faria a lista de opções do campo crescer sem
parar. Decisão: parar de gravar nele (registros antigos mantêm o que já
tinha; `Reservado_Inicio`/`Reservado_Fim`, que já eram a fonte de verdade
pro cálculo de conflito, continuam sendo gravados normalmente).

**Mecanismo de "empurrar" ficou mais simples também**: antes, quando um
chamado precisava ser deslocado por causa de conflito, o app tinha que
carregar a duração original dele (`conflito.duracao`) pra manter o mesmo
tamanho no novo horário. Agora a sugestão que vem de `achaHorarioLivre`
já inclui início **e** fim prontos — o app só repassa os dois direto pro
`App - Reagendar chamado`, sem precisar saber nada sobre duração.

**Tela**: os dois formulários (criar e editar) trocaram a fileira de
botões por dois `<input type="time">` lado a lado, "De" e "Até" — layout
novo `.chamado-horario-intervalo` no `style.css`. Removidas as funções
`ligarDuracaoPills`/`selecionaDuracaoPill`/`aplicaDuracaoNoHorario`/
`montaDuracaoFinal`/`separaDuracaoBase` do `app.js` (não sobrou nenhum
código de botão de duração no app).

### Sugestão de "empurrar" com a duração errada, e linha do tempo arrastável (03/09/2026)

**Bug achado pelo dono usando de verdade**: ao marcar um chamado que batia
com o Chamado #2 (OPERA, 2h30 de duração), a opção "mover o Chamado #2 pra
esse horário livre" sugeria um horário de só 1h — a duração do chamado
**novo** sendo criado, não a do OPERA que ia ser movido. Causa: só existia
uma sugestão (`resultado.sugestao`), calculada com a duração do pedido, e
o botão de empurrar reusava ela pro chamado errado. Corrigido em
`chamados1-checar-conflito.js`: agora cada chamado conflitante ganha sua
própria sugestão (`conflitos[].sugestaoEmpurrar`), calculada com a
duração **dele mesmo**, e a busca por horário livre pra ele considera o
pedido novo como ocupado (já que é ele quem vai ficar ali) e o próprio
conflitante como livre (é ele que está saindo dali) — sem isso a primeira
sugestão que aparecia era o próprio horário que ele já ocupava.

**Caixa de conflito reorganizada**: virou dois cartões lado a lado, cada
um com seu próprio horário sugerido e botão — "Usar outro horário pro seu
chamado" (botão cheio, cor de destaque) e "Manter seu horário e mover o
Chamado #N" (botão contornado) — em vez de duas frases corridas com botões
soltos, mais fácil de diferenciar rápido qual ação faz o quê.

**Linha do tempo do dia, com arrastar pra reagendar**: pedido do dono foi
poder "visualizar bem a agenda como um todo" em vez de só uma lista de
cards. Nova seção no topo da aba Agenda: um dia por vez (setas
`‹`/`›` + campo de data + atalho "Ir pra hoje"), mostrando os chamados
daquele dia como blocos coloridos por status, posicionados pela hora real
(grade de 07h-19h, que se estica sozinha se algum chamado começar antes
ou terminar depois). Embaixo, uma linha de "conselho" com as folgas livres
do dia (`calculaFolgasLivres`), pra ver de relance onde ainda cabe algo
sem comparar cartão por cartão.

- **Arrastar** um bloco (vertical, dentro do mesmo dia) muda o horário
  reservado, mantendo a duração original — solta e o app já confere
  conflito (`checarConflito`) e, se estiver livre, reagenda de verdade
  (`reagendar-chamado`) e recarrega a lista. Se bater com outro chamado,
  o bloco volta pro lugar e mostra qual chamado atrapalhou, sem gravar
  nada.
- **Tocar sem arrastar** (menos de ~2px de movimento) abre a edição
  completa do chamado, igual ao botão "Editar" do card — mesmo bloco,
  dois gestos diferentes.
- Implementado com Pointer Events (`pointerdown`/`pointermove`/
  `pointerup`), não HTML5 drag-and-drop nativo — funciona igual com mouse
  e toque, importante pro uso no celular.
- **Achado testando** (`ligarArrastarBlocoTimeline` em `app.js`): a
  primeira versão chamava `bloco.setPointerCapture(...)` **antes** de
  guardar a duração original do bloco (`duracaoMin`). Em qualquer caso
  onde `setPointerCapture` falhasse (achado simulando o arrastar via
  eventos sintéticos pra testar sem mexer em dado real — o Chrome recusa
  `setPointerCapture` de um pointerId que não veio de um evento de
  hardware de verdade), o restante do `pointerdown` não rodava e a
  duração ficava com o valor inicial (0), fazendo o reagendamento sair
  com início = fim. Corrigido guardando todo o estado necessário **antes**
  da chamada de `setPointerCapture`, e essa chamada agora está em
  `try/catch` (o arrastar continua funcionando mesmo se a captura formal
  falhar, só perde a garantia extra de receber os eventos fora do
  elemento). Testado de novo depois com eventos de ponteiro simulados e
  espionando `checarConflito`/`pedirAoN8n` (sem deixar nenhuma chamada
  real sair) pra confirmar que a duração agora é preservada corretamente
  — e confirmado por leitura direta no Airtable que o Chamado #2 real
  nunca foi alterado durante os testes.

### Linha do tempo também na tela de Criar chamado (03/09/2026)

Pedido: poder usar o mesmo esquema visual/arrastar da Agenda também ao
criar um chamado, **sem tirar** os campos De/Até que já existiam — os dois
modelos convivem.

Reaproveita a mesma visualização (grade de horas, blocos por chamado)
numa segunda instância, dentro do formulário de criar. Diferenças da
versão da Agenda:

- Os chamados **já marcados** aparecem só como referência (classe
  `somente-leitura`, sem arrastar neles) — mover um chamado existente
  continua sendo coisa só da Agenda.
- Existe um bloco a mais, tracejado ("Novo chamado"), representando o
  chamado sendo criado agora — esse sim é arrastável.
- **Os dois formatos ficam sincronizados nos dois sentidos**: digitar em
  "De"/"Até" reposiciona o bloco tracejado; arrastar o bloco atualiza
  "De"/"Até". Nenhuma chamada de rede acontece durante o arrastar aqui
  (o chamado ainda nem existe) — a checagem de conflito de verdade
  continua sendo só no envio do formulário, como já era.
- Ver o bloco novo sobrepondo um chamado já marcado já mostra o conflito
  visualmente, de graça, sem precisar calcular nada a mais.

Refatorado pra evitar duplicar código entre as duas telas: `renderizarTimeline`
(Agenda) e `renderizarTimelineCriar` (Criar chamado) compartilham
`calculaIntervaloHoras`, `desenhaGradeHoras` e `criaBlocoTimeline`.

**Achado durante o teste**: pra testar localmente (servidor estático em
`:8099`, ver nota acima), reiniciar o `preview_start` cria um perfil de
navegador novo — localStorage some, e com ele o endereço do túnel n8n
salvo (`n8n_base_url`) e a senha lembrada. Sem isso, `pedirAoN8n` manda a
requisição pro próprio `localhost:8099` (a origem do app) em vez do n8n,
e volta HTML (a página 404 do `serve`) em vez de JSON. Contornado
setando `localStorage.setItem('n8n_base_url', 'http://localhost:5678')`
(mesmo endereço que os scripts de deploy usam pra API admin, porta
`5678` — o CORS do workflow já libera `localhost:8099`) direto no
console antes de testar.

**Achado no meio do teste (não é bug, mas quase virou confusão)**: o
Chamado #2 (OPERA) apareceu como "Cancelado" no Airtable no meio da
sessão de testes. Antes de presumir qualquer coisa, perguntei — era o
próprio dono testando/cancelando de propósito, nada a ver com os testes
daqui (que só usam funções simuladas, nunca gravam de verdade). Fica
registrado o hábito: **sempre perguntar antes de assumir que um dado
real mudou por causa de um teste**, mesmo quando a evidência (código
revisado, leituras antes/depois) aponta pra "não fui eu".

### Alça de redimensionar, navegar dia clicando, hora de Brasília e feriados (03/09/2026)

Rodada de ajustes finos pedidos em sequência depois da linha do tempo:

**Alça pra esticar/encolher a duração**: cada bloco arrastável (os reais
da Agenda e o tracejado "Novo chamado" do formulário de criar) ganhou uma
faixa fina no rodapé (`.chamado-timeline-resize`, com uma alcinha visual)
que arrasta só o **fim**, mantendo o início fixo — mais uma forma de achar
o horário certo, sem precisar redigitar o campo "Até". A alça tem seus
próprios eventos de ponteiro e chama `evento.stopPropagation()` no
`pointerdown` pra não disparar também o arrastar-pra-mover do bloco
inteiro (que está escutando o mesmo tipo de evento, só que no bloco pai).
Na Agenda, soltar a alça confere conflito e grava de verdade (extraído
pra uma função só, `confirmaNovoHorarioBloco`, reaproveitada pelo mover E
pelo redimensionar, que antes eram lógicas quase idênticas duplicadas).
No formulário de criar, só atualiza o campo "Até" — sem chamada de rede,
igual ao mover.

**Trocar de dia clicando na própria linha do tempo do formulário de
criar**: ganhou a mesma barra de navegação que a Agenda já tinha (‹ / data
por extenso / ›) — clicar muda a própria `Data` do formulário (não é uma
"data de visita" separada da que vai ser gravada).

**Horário "agora" sempre em Brasília, não no fuso do aparelho**:
`dataLocalISO(new Date())` usa o fuso configurado no sistema operacional
de quem está usando — se alguém abrir o app com o aparelho em outro fuso
(ou UTC, como aconteceu tentando testar no navegador embutido), "hoje"
sai errado. Trocado por `agoraBrasilia()`/`dataLocalISOBrasilia()`, que
pegam o instante real (`Date.now()`, sempre UTC de verdade) e descontam
3h fixas, lendo depois com os métodos `getUTC*` -- mesmo truque já usado
no backend (`horaLocalBrasilia`, em `chamados-comum.js`). Usado no
"Ir pra hoje" e na data inicial da Agenda.

**Feriados nacionais, só aviso (nunca bloqueia)**: fixos (Confraternização,
Tiradentes, Trabalho, Independência, Aparecida, Finados, República,
Natal) e móveis calculados a partir da Páscoa (algoritmo de Meeus/Jones/
Butcher — conferido contra datas reais de 2024-2027: Carnaval 2026 =
17/02, Páscoa 2026 = 05/04, batendo certinho). **Só feriados nacionais**
— estadual/municipal varia por cidade e não foi informado qual usar, não
dava pra adivinhar sem risco de errar. Aparece em três lugares: um aviso
dedicado embaixo do campo Data (criar e editar), e junto da data mostrada
nas duas linhas do tempo ("· Feriado: Natal"). Não impede marcar — é
literalmente só texto, sem nenhuma validação de bloqueio.

## Decisões já tomadas (não relitigar sem motivo)

- **Toda ação envia a senha para o n8n conferir.** A tela de entrada é só
  conveniência visual e nunca deve ser tratada como prova de acesso.
- Chaves e credenciais ficam **só no n8n**, nunca no código do app — o
  repositório é público.
- Consultas externas (como a da Receita) passam pelo n8n, não direto do
  navegador.
- Hospedagem no GitHub Pages, de graça (por isso o repositório é público).
- Comprar domínio próprio para o túnel: adiado, sem urgência.
- **O endereço do túnel não vai para o repositório.** `config.js` fica vazio; o
  endereço é digitado na tela de entrada de cada aparelho.
- **Nunca gravar em tabela de configuração de linha única só para testar**, e
  em teste nenhum escrever na linha real do dono. Foi assim que se perdeu dado
  em 28/08.
- **Antes de apagar qualquer coisa do Airtable, avisar o dono** — não existe
  histórico e não tem volta.

## Próximos passos previstos, depois do pendente

- Painel de status das automações
- Tela de chat/assistente
