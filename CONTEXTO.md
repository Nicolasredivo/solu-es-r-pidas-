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
- Página **Cadastro**, com abas "Adicionar" e "Consultar"
  - Adicionar: campo de CPF/CNPJ com formatação e validação de dígitos,
    detecção automática do tipo, consulta de duplicado + dados da Receita
    (incluindo endereço, que já vira o primeiro bloco preenchido), formulário
    completo da tabela Entidades, endereços e contatos sem limite, e botões
    Salvar/Cancelar
  - Consultar: lista todos os cadastros, busca, abre/edita/exclui — inclusive
    endereços e contatos de um cadastro existente
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

Existe também uma base maior, "ERP Soluções Rápidas - Produção", ainda não usada
pelo app.

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

## PENDENTE AGORA (é por aqui que se continua)

- **`WhatsApp_Financeiro` não existe mais**, mas nada foi perdido: o campo só
  mudou de nome. Nenhuma limpeza pendente no Airtable desta vez.
- Nome do responsável por cada número (chegou a ser pedido e foi cancelado).
- Telefone e e-mail próprios da administradora.
- **Duas sessões do Claude podem estar ativas ao mesmo tempo neste projeto**
  (esta conversa + uma sessão `claude rc` pelo celular, mesma pasta/branch,
  modo "same-dir"). Nenhuma vê o que a outra fez até o próximo `git status`/
  `git pull`. Sempre conferir isso no início de uma sessão nova.

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
