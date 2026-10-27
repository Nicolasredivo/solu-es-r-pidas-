// Atualiza as cópias dos fluxos em n8n/*.json a partir do n8n local, SEM segredos.
//
// - Grava só name/nodes/connections/settings (nunca activeVersion, pinData, staticData...:
//   o activeVersion já carregou a senha real uma vez).
// - A senha de acesso e a chave do JWT viram "TROQUE-ESTA-SENHA" / "TROQUE-ESTA-CHAVE-JWT".
// - Recusa gravar se sobrar qualquer segredo conhecido (chaves e senhas dos arquivos locais).
// - Nome do arquivo = caminho do webhook (ou o nome do fluxo, se ele não tiver webhook).
//
// Uso: node n8n/exportar.js            (fluxos com cópia no repositório + os novos "App - ...")
const fs = require('fs');
const path = require('path');

const PASTA = __dirname;
const CHAVE = fs.readFileSync('C:/Users/rediv/chave-n8n.txt', 'utf8').trim();
const IGNORAR = new Set(['ERP Empresa - Principal']);
const SETTINGS = ['executionOrder', 'saveDataSuccessExecution', 'saveDataErrorExecution', 'saveManualExecutions',
  'saveExecutionProgress', 'executionTimeout', 'errorWorkflow', 'timezone', 'callerPolicy', 'callerIds'];

const api = async (p) => {
  const r = await fetch('http://localhost:5678/api/v1' + p, { headers: { 'X-N8N-API-KEY': CHAVE } });
  if (!r.ok) throw new Error(p + ': ' + r.status);
  return r.json();
};

// Valores que nunca podem ir para o repositório (lidos dos arquivos locais, nunca impressos).
function segredosLocais() {
  const lista = [CHAVE];
  for (const arq of ['chave-asaas.txt', 'senha-app.txt', 'senha-banco.txt']) {
    let txt = '';
    try { txt = fs.readFileSync('C:/Users/rediv/' + arq, 'utf8'); } catch (e) { continue; }
    for (const linha of txt.split(/\r?\n/)) {
      const rotulo = linha.includes(':') ? linha.slice(0, linha.indexOf(':')) : '';
      const v = linha.includes(':') ? linha.slice(linha.indexOf(':') + 1).trim() : linha.trim();
      // No senha-banco.txt só senha/token são segredo (as outras linhas são usuário, porta, pasta...).
      if (arq === 'senha-banco.txt' && !/senha|token/i.test(rotulo)) continue;
      if (v.length >= 8 && !/\s/.test(v) && !/^[A-Za-z]:[\\/]|^http/.test(v)) lista.push(v);
    }
  }
  return lista;
}

(async () => {
  let wfs = [], cursor = '';
  do {
    const r = await api('/workflows?limit=100' + (cursor ? '&cursor=' + cursor : ''));
    wfs = wfs.concat(r.data); cursor = r.nextCursor;
  } while (cursor);

  const completos = [];
  for (const w of wfs) if (!IGNORAR.has(w.name) && !w.name.startsWith('TMP ')) completos.push(await api('/workflows/' + w.id));

  // Segredos que moram dentro do código do "verificar-sessao": viram marcador.
  const trocas = [];
  for (const w of completos) {
    for (const n of w.nodes) {
      const code = (n.parameters || {}).jsCode || '';
      const senha = (code.match(/const SENHA_DE_ACESSO = "([^"]+)";/) || [])[1];
      const jwt = (code.match(/const SEGREDO_JWT = "([^"]+)";/) || [])[1];
      if (senha && senha !== 'TROQUE-ESTA-SENHA') trocas.push([senha, 'TROQUE-ESTA-SENHA']);
      if (jwt && jwt !== 'TROQUE-ESTA-CHAVE-JWT') trocas.push([jwt, 'TROQUE-ESTA-CHAVE-JWT']);
    }
  }
  if (!trocas.length) throw new Error('não achei a senha/chave no verificar-sessao — formato mudou? Nada gravado.');
  const proibidos = [...new Set([...segredosLocais(), ...trocas.map((t) => t[0])])];

  const saidas = [];
  for (const w of completos) {
    const webhook = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
    const nomeArq = ((webhook && webhook.parameters.path) || w.name).replace(/[^A-Za-z0-9_-]+/g, '-') + '.json';
    const settings = Object.fromEntries(Object.entries(w.settings || {}).filter(([k]) => SETTINGS.includes(k)));
    let texto = JSON.stringify({ name: w.name, nodes: w.nodes, connections: w.connections, settings }, null, 2);
    for (const [de, para] of trocas) texto = texto.split(de).join(para);
    const sobrou = proibidos.find((s) => texto.includes(s));
    if (sobrou) throw new Error(`segredo dentro de "${w.name}" — nada foi gravado`);
    saidas.push([nomeArq, texto]);
  }
  for (const [nomeArq, texto] of saidas) fs.writeFileSync(path.join(PASTA, nomeArq), texto);
  console.log(`${saidas.length} cópias gravadas em n8n/, sem segredos (${trocas.length} trocados por marcador).`);
})().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; });
