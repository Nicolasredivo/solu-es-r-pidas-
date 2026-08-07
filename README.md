# Soluções Rápidas

App (PWA) que serve de interface para o sistema de automações rodando no n8n.

## Etapa 1 — o que já existe aqui

Uma tela simples com campo de senha e um botão "Testar conexão", só para confirmar
que o app (hospedado na internet) consegue falar com o n8n (rodando no seu
computador, exposto por um Cloudflare Tunnel).

Para deixar funcionando, faltam 2 coisas fora deste repositório:

1. Ligar o n8n e o Cloudflare Tunnel, e criar o workflow de teste (feito junto
   com o Claude, via chat).
2. Colar o endereço público gerado pelo túnel no arquivo `config.js`.

Depois disso, é só abrir a página publicada (GitHub Pages) e testar.
