// Varredura antes de publicar: procura, em todos os arquivos que iriam para o GitHub, os
// segredos reais (lidos dos arquivos locais e do banco, nunca impressos) e padrões de chave.
// Uso: node n8n/conferir-segredos.js     (sai com erro se achar algo)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const CHAVE_N8N = fs.readFileSync('C:/Users/rediv/chave-n8n.txt', 'utf8').trim();
const TOKEN_LOCAL = (fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8').match(/^token do airtable local:\s*(\S+)/m) || [])[1];

function valoresDosArquivos() {
  const lista = [['chave do n8n', CHAVE_N8N]];
  for (const arq of ['chave-asaas.txt', 'senha-app.txt', 'senha-banco.txt']) {
    let txt = '';
    try { txt = fs.readFileSync('C:/Users/rediv/' + arq, 'utf8'); } catch (e) { continue; }
    txt.split(/\r?\n/).forEach((linha, i) => {
      const rotulo = linha.includes(':') ? linha.slice(0, linha.indexOf(':')) : '';
      const v = linha.includes(':') ? linha.slice(linha.indexOf(':') + 1).trim() : linha.trim();
      if (arq === 'senha-banco.txt' && !/senha|token/i.test(rotulo)) return;
      if (v.length >= 8 && !/\s/.test(v) && !/^[A-Za-z]:[\\/]|^http/.test(v)) lista.push([`${arq} linha ${i + 1}`, v]);
    });
  }
  return lista;
}

async function valoresDoSistema() {
  const lista = [];
  // senha de acesso e chave do JWT (moram no código do verificar-sessao, no n8n)
  const r = await (await fetch('http://localhost:5678/api/v1/workflows?limit=100', { headers: { 'X-N8N-API-KEY': CHAVE_N8N } })).json();
  const vs = r.data.find((w) => w.name === 'verificar-sessao');
  const full = await (await fetch('http://localhost:5678/api/v1/workflows/' + vs.id, { headers: { 'X-N8N-API-KEY': CHAVE_N8N } })).json();
  const code = full.nodes.map((n) => (n.parameters || {}).jsCode || '').join('\n');
  const senha = (code.match(/const SENHA_DE_ACESSO = "([^"]+)";/) || [])[1];
  const jwt = (code.match(/const SEGREDO_JWT = "([^"]+)";/) || [])[1];
  if (senha) lista.push(['senha de acesso do app', senha]);
  if (jwt) lista.push(['chave do JWT', jwt]);
  // hashes de senha, códigos e tokens de sessão guardados no banco
  const get = async (t) => (await fetch('http://127.0.0.1:5690/v0/app6PyYmtFduIMp7B/' + t + '?_itens=1', { headers: { Authorization: 'Bearer ' + TOKEN_LOCAL } })).json();
  for (const u of await get('Usuarios')) {
    if (u.fields.Senha_Hash) lista.push(['hash de senha de usuário', u.fields.Senha_Hash]);
    if (u.fields.Codigo_Recuperacao_Hash) lista.push(['hash de código de usuário', u.fields.Codigo_Recuperacao_Hash]);
  }
  for (const s of await get('Sessoes')) if (s.fields.Token) lista.push(['token de sessão', s.fields.Token]);
  return lista;
}

const PADROES = [
  ['chave do Asaas', /\$?aact_[A-Za-z0-9_\-]{10,}/],
  ['token do Airtable', /\bpat[A-Za-z0-9]{14}\.[a-f0-9]{30,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./],
  ['hash scrypt (salt:hash)', /\b[0-9a-f]{32}:[0-9a-f]{128}\b/],
  ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['chave da Anthropic/OpenAI', /\bsk-(ant-)?[A-Za-z0-9_\-]{20,}/],
];

(async () => {
  const proibidos = [...valoresDosArquivos(), ...(await valoresDoSistema())];
  const arquivos = execSync('git ls-files -co --exclude-standard', { cwd: RAIZ, encoding: 'utf8' }).split('\n').filter(Boolean);
  const achados = [];
  for (const rel of arquivos) {
    let txt;
    try { txt = fs.readFileSync(path.join(RAIZ, rel), 'utf8'); } catch (e) { continue; }
    for (const [nome, valor] of proibidos) if (valor && txt.includes(valor)) achados.push(`${rel}: ${nome}`);
    for (const [nome, re] of PADROES) if (re.test(txt)) achados.push(`${rel}: parece ${nome}`);
  }
  console.log(`${arquivos.length} arquivos conferidos contra ${proibidos.length} segredos e ${PADROES.length} padrões.`);
  if (achados.length) { console.log('ACHADOS:\n  ' + achados.join('\n  ')); process.exitCode = 1; }
  else console.log('Nenhum segredo encontrado.');
})().catch((e) => { console.error('ERRO (n8n e o atalho "Servidor n8n" ligados?):', e.message); process.exitCode = 1; });
