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
    detecção automática do tipo, consulta de duplicado + dados da Receita,
    formulário completo da tabela Entidades e botão de salvar
  - Consultar: ainda vazio

## Airtable

Base **"cadastro"** (`app6PyYmtFduIMp7B`), com 3 tabelas ligadas entre si:

- `Entidades_Cadastradas` (`tbl5Joji6gAir3mNh`) — clientes; é a tabela "mãe"
- `Locais_Atendimento` (`tblffVczCf1VeNxs7`) — endereços de cada cliente
- `Contatos_Solicitantes` (`tblXXOEOCwQnC2qFX`) — pessoas que abrem chamado

Existe também uma base maior, "ERP Soluções Rápidas - Produção", ainda não usada
pelo app.

## Workflows do n8n (feitos e testados em 12/08/2026)

Os três estão criados, publicados e testados de ponta a ponta:

| Workflow | Caminho do webhook | ID no n8n |
|---|---|---|
| `App - Testar conexao` | `/webhook/testar-conexao` | `cgtZoemwpad0tVTN` |
| `App - Consultar documento` | `/webhook/consultar-documento` | `jIZWUEwHUU8KnCVR` |
| `App - Salvar entidade` | `/webhook/salvar-entidade` | `dFV53YYjsktzuEWw` |

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

## PENDENTE AGORA (é por aqui que se continua)

- Cadastro de **Contatos_Solicitantes** ligados à Entidade. A tabela já existe
  e já está ligada; falta o app usar. O caminho é o mesmo dos Locais: bloco que
  se repete no formulário + nós no `App - Salvar entidade`.
- A aba "Consultar" continua vazia.

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

- Aba "Consultar" (buscar cadastros existentes)
- Cadastro de Locais de Atendimento e Contatos, ligados à Entidade
- Painel de status das automações
- Tela de chat/assistente
