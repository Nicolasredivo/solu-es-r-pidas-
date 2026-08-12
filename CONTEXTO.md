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

## PENDENTE AGORA (é por aqui que se continua)

Os dois workflows em `n8n/` **nunca foram importados nem testados** — foram
escritos sem acesso ao n8n, então podem ter erros:

- `n8n/consultar-documento.json` — recebe CPF/CNPJ, procura no Airtable e avisa
  se já existe; sendo CNPJ novo, busca os dados na Receita (BrasilAPI)
- `n8n/salvar-entidade.json` — grava a entidade no Airtable

Para funcionarem, falta:
1. Importar os dois no n8n
2. Em cada um, trocar `TROQUE-ESTA-SENHA` pela senha real de acesso ao app
   (a mesma que já está no workflow `App - Testar conexao`)
3. Selecionar a credencial do Airtable nos nós de Airtable
4. Publicar os dois
5. Testar de ponta a ponta pelo app

Se você tem acesso direto ao n8n (sessão local), prefira criar/corrigir os
workflows via API do n8n em vez de pedir importação manual — foi exatamente
essa falta de acesso que travou o projeto até aqui.

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
