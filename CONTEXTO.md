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

- Testar pelo app publicado (o túnel do Cloudflare precisa estar ligado).
  Os testes até aqui foram direto no `localhost`, sem passar pelo túnel.
- O app ainda não usa o campo `avisoReceita` que o workflow já devolve. Ele
  explica por que os dados da Receita não vieram ("muitas consultas seguidas"
  ou "não encontrei este CNPJ"). Hoje o app mostra só o formulário em branco,
  sem dizer o motivo.

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
