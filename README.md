# Soluções Rápidas

App (PWA) que serve de interface para o sistema de automações rodando no n8n.

## Etapa 1 — o que já existe aqui

Uma tela simples com campo de senha e um botão "Testar conexão", só para confirmar
que o app consegue falar com o n8n (rodando no computador, exposto por um
Cloudflare Tunnel).

- `index.html`, `style.css`, `app.js` — a tela do app
- `config.js` — **o único arquivo que você precisa editar**: o endereço do túnel
- `manifest.json`, `service-worker.js`, `icons/` — o que torna o app instalável
- `n8n/testar-conexao.json` — o workflow pronto para importar no n8n

## Como colocar para funcionar

1. **Ligue o n8n** (`n8n` no CMD) e deixe a janela aberta.
2. **Ligue o túnel** em outra janela:
   `cd C:\cloudflared` e depois `cloudflared tunnel --url http://localhost:5678`
3. **Importe o workflow** no n8n: menu `...` → *Import from File* →
   escolha `n8n/testar-conexao.json`.
4. **Defina sua senha**: abra o passo *"Senha esta correta?"* e troque
   `TROQUE-ESTA-SENHA` pela senha que você quiser.
5. **Ative o workflow** no botão de liga/desliga no canto superior direito.
6. **Atualize o endereço** em `config.js` com o link que o túnel mostrou.

> O endereço do túnel muda toda vez que ele é reiniciado — quando isso
> acontecer, é só atualizar a primeira parte do link em `config.js`.
