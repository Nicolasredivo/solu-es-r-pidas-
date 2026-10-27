// Troca os fluxos do n8n do Airtable (nuvem) para o "Airtable local" (banco do PC).
//
// - chamadas HTTP diretas à API do Airtable: só trocam o endereço e a credencial;
// - nós do Airtable (buscar / criar): viram nós HTTP com o mesmo nome, posição e ligações,
//   pedindo a mesma coisa ao Airtable local (a busca usa ?_itens=1 para sair um item por
//   registro, igual ao nó do Airtable).
//
// Uso:
//   node banco/trocar-fluxos-para-local.js --simular <pasta de saída>   (não mexe no n8n)
//   node banco/trocar-fluxos-para-local.js --aplicar [id do fluxo ...]  (grava e republica)
// A cópia de antes fica em C:\Users\rediv\banco-solucoes\fluxos-antes-da-migracao.

const fs = require('fs');
const path = require('path');

const N8N = 'http://localhost:5678/api/v1';
const CHAVE = fs.readFileSync('C:/Users/rediv/chave-n8n.txt', 'utf8').trim();
const LOCAL = 'http://127.0.0.1:5690/v0/';
const CREDENCIAL = { id: 'yzToTcui3yVtKT5d', name: 'Airtable local (banco do PC)' };
const IGNORAR = new Set(['LOrTbMbhlCb36kwh']); // "ERP Empresa - Principal": inativo, base antiga do ERP
const SETTINGS_ACEITOS = ['executionOrder', 'saveDataSuccessExecution', 'saveDataErrorExecution', 'saveManualExecutions',
  'saveExecutionProgress', 'executionTimeout', 'errorWorkflow', 'timezone', 'callerPolicy', 'callerIds'];

const api = async (metodo, caminho, corpo) => {
  const r = await fetch(N8N + caminho, {
    method: metodo,
    headers: { 'X-N8N-API-KEY': CHAVE, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
};

function trocarEnderecos(valor) {
  if (typeof valor === 'string') {
    return valor.split('https://api.airtable.com/v0/').join(LOCAL).split('https://content.airtable.com/v0/').join(LOCAL);
  }
  if (Array.isArray(valor)) return valor.map(trocarEnderecos);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, trocarEnderecos(v)]));
  return valor;
}

// "={{ expressão }}" -> "expressão" (só aceita expressão pura; texto misto não é usado nos fluxos)
function soExpressao(v, onde) {
  if (typeof v !== 'string') return JSON.stringify(v);
  const m = /^=\{\{([\s\S]*)\}\}$/.exec(v.trim());
  if (m && !m[1].includes('}}')) return '(' + m[1].trim() + ')';
  if (!v.startsWith('=')) return JSON.stringify(v);
  throw new Error('Valor com texto misto em ' + onde + ': ' + v);
}

function noAirtableParaHttp(n, wfNome) {
  const p = n.parameters || {};
  const base = p.base && (p.base.value || p.base);
  const tabela = p.table && (p.table.value || p.table);
  const op = p.operation;
  const url = LOCAL + base + '/' + tabela;
  const opcoes = p.options || {};
  const extras = Object.keys(opcoes).filter((k) => !(op === 'create' && k === 'typecast'));
  if (extras.length) throw new Error(`${wfNome} / ${n.name}: opções não tratadas ${extras.join(',')}`);

  const parametros = { authentication: 'predefinedCredentialType', nodeCredentialType: 'airtableTokenApi' };
  if (op === 'search') {
    const q = [{ name: '_itens', value: '1' }];
    if (p.filterByFormula) q.push({ name: 'filterByFormula', value: p.filterByFormula });
    if (p.returnAll === false) q.push({ name: 'maxRecords', value: String(p.limit || 50) });
    ((p.sort || {}).property || []).forEach((s, i) => {
      q.push({ name: `sort[${i}][field]`, value: s.field });
      q.push({ name: `sort[${i}][direction]`, value: s.direction || 'asc' });
    });
    Object.assign(parametros, { method: 'GET', url, sendQuery: true, queryParameters: { parameters: q }, options: { timeout: 20000 } });
  } else if (op === 'create') {
    const cols = p.columns || {};
    if (cols.mappingMode !== 'defineBelow') throw new Error(`${wfNome} / ${n.name}: mapeamento ${cols.mappingMode} não tratado`);
    const campos = Object.entries(cols.value || {}).map(([k, v]) => `${JSON.stringify(k)}: ${soExpressao(v, wfNome + ' / ' + n.name + ' / ' + k)}`);
    const typecast = opcoes.typecast ? 'typecast: true, ' : '';
    Object.assign(parametros, {
      method: 'POST', url, sendBody: true, specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ ${typecast}fields: { ${campos.join(', ')} } }) }}`,
      options: { timeout: 20000 },
    });
  } else {
    throw new Error(`${wfNome} / ${n.name}: operação ${op} não tratada`);
  }

  const novo = {
    parameters: parametros, id: n.id, name: n.name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: n.position, credentials: { airtableTokenApi: CREDENCIAL },
  };
  for (const k of ['onError', 'alwaysOutputData', 'executeOnce', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'notes', 'notesInFlow', 'disabled']) {
    if (n[k] !== undefined) novo[k] = n[k];
  }
  return novo;
}

function converter(wf) {
  const relatorio = { trocados: [], enderecos: 0 };
  const nodes = wf.nodes.map((n) => {
    let novo = n;
    if (n.type === 'n8n-nodes-base.airtable') {
      novo = noAirtableParaHttp(n, wf.name);
      relatorio.trocados.push(`${n.name} (${n.parameters.operation})`);
    } else {
      const antes = JSON.stringify(n.parameters || {});
      const params = trocarEnderecos(n.parameters || {});
      if (JSON.stringify(params) !== antes) relatorio.enderecos++;
      novo = { ...n, parameters: params };
      if (novo.credentials && novo.credentials.airtableTokenApi) novo.credentials = { ...novo.credentials, airtableTokenApi: CREDENCIAL };
    }
    return novo;
  });
  const texto = JSON.stringify(nodes);
  if (/api\.airtable\.com|content\.airtable\.com/.test(texto)) throw new Error(wf.name + ': ainda sobrou endereço do Airtable');
  if (nodes.some((n) => n.type === 'n8n-nodes-base.airtable')) throw new Error(wf.name + ': ainda sobrou nó do Airtable');
  if (nodes.some((n) => n.credentials && n.credentials.airtableTokenApi && n.credentials.airtableTokenApi.id !== CREDENCIAL.id)) throw new Error(wf.name + ': credencial antiga');
  const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS_ACEITOS.includes(k)));
  return { corpo: { name: wf.name, nodes, connections: wf.connections, settings }, relatorio };
}

(async () => {
  const modo = process.argv[2];
  if (!['--simular', '--aplicar'].includes(modo)) { console.error('Use --simular <pasta> ou --aplicar [ids]'); process.exit(1); }
  let wfs = [], cursor = '';
  do {
    const r = await api('GET', '/workflows?limit=100' + (cursor ? '&cursor=' + cursor : ''));
    wfs = wfs.concat(r.data); cursor = r.nextCursor;
  } while (cursor);
  const escolhidos = modo === '--aplicar' ? process.argv.slice(3) : [];
  for (const resumo of wfs) {
    if (IGNORAR.has(resumo.id)) continue;
    if (escolhidos.length && !escolhidos.includes(resumo.id)) continue;
    const wf = await api('GET', '/workflows/' + resumo.id);
    const usaAirtable = /airtable/i.test(JSON.stringify(wf.nodes));
    if (!usaAirtable) continue;
    const { corpo, relatorio } = converter(wf);
    const linha = `${wf.name.padEnd(42)} nós trocados: ${relatorio.trocados.length}, nós com endereço trocado: ${relatorio.enderecos}`;
    if (modo === '--simular') {
      fs.mkdirSync(process.argv[3], { recursive: true });
      fs.writeFileSync(path.join(process.argv[3], wf.id + '.json'), JSON.stringify(corpo, null, 1));
      console.log(linha);
    } else {
      await api('PUT', '/workflows/' + wf.id, corpo);
      if (wf.active) await api('POST', '/workflows/' + wf.id + '/activate');
      console.log('APLICADO  ' + linha + (wf.active ? '' : '  (estava inativo)'));
    }
  }
})().catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; });
