// Peças comuns dos testes dos fluxos: falar com o Airtable local e com os webhooks do n8n,
// entrar com um usuário de teste (senha gerada na hora) e conferir resultados.
const fs = require('fs');
const crypto = require('crypto');

const TOKEN_LOCAL = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8').match(/^token do airtable local:\s*(\S+)/m)[1];
const CHAVE_N8N = fs.readFileSync('C:/Users/rediv/chave-n8n.txt', 'utf8').trim();
const CAD = 'app6PyYmtFduIMp7B', FIN = 'appjAmWXV7Zr33UqE';
const EMAIL_TESTE = 'teste-migracao@exemplo.invalid';

async function local(metodo, caminho, corpo) {
  const r = await fetch('http://127.0.0.1:5690' + caminho, {
    method: metodo, headers: { Authorization: 'Bearer ' + TOKEN_LOCAL, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return r.json();
}
const lista = (base, t, formula) => local('GET', `/v0/${base}/${t}?_itens=1` + (formula ? '&filterByFormula=' + encodeURIComponent(formula) : ''));

async function n8n(metodo, caminho, corpo) {
  const r = await fetch('http://localhost:5678/api/v1' + caminho, {
    method: metodo, headers: { 'X-N8N-API-KEY': CHAVE_N8N, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

const sessao = { tokenAcesso: '', tokenSessao: '', usuarioId: '', senha: '' };
// Igual ao app (fetchN8n): formulário simples, todos os valores como texto.
async function chamar(caminho, dados = {}) {
  const r = await fetch('http://localhost:5678/webhook/' + caminho, {
    method: 'POST',
    body: new URLSearchParams({ ...dados, tokenAcesso: sessao.tokenAcesso }),
  });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return { _status: r.status, _texto: txt.slice(0, 300) }; }
}

async function entrarComUsuarioDeTeste() {
  sessao.senha = crypto.randomBytes(18).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = salt + ':' + crypto.scryptSync(sessao.senha, salt, 64).toString('hex');
  for (const v of await lista(CAD, 'Usuarios', `LOWER({Email})='${EMAIL_TESTE}'`)) await local('DELETE', `/v0/${CAD}/Usuarios/${v.id}`);
  const usu = await local('POST', `/v0/${CAD}/Usuarios`, { fields: { Nome: 'TESTE MIGRACAO', Email: EMAIL_TESTE, Papel: 'Dono', Ativo: true, Senha_Hash: hash } });
  sessao.usuarioId = usu.id;
  const login = await chamar('login', { email: EMAIL_TESTE, senha: sessao.senha, dispositivo: 'teste da migração' });
  if (!login.ok) throw new Error('login de teste falhou: ' + JSON.stringify(login));
  sessao.tokenAcesso = login.tokenAcesso;
  sessao.tokenSessao = login.tokenSessao;
}

async function sairEApagarUsuarioDeTeste() {
  if (sessao.usuarioId) await local('DELETE', `/v0/${CAD}/Usuarios/${sessao.usuarioId}`); // as sessões vão junto
}

let ok = 0, falhas = 0;
function confere(nome, cond, detalhe) {
  if (cond) { ok++; console.log('ok    ', nome); }
  else { falhas++; console.log('FALHOU', nome, detalhe === undefined ? '' : JSON.stringify(detalhe).slice(0, 500)); }
}
const placar = () => ({ ok, falhas });

async function contarTudo() {
  const q = {};
  for (const [b, ts] of [[CAD, ['Entidades_Cadastradas', 'Locais_Atendimento', 'Contatos_Solicitantes', 'Chamados', 'Usuarios', 'Sessoes', 'Visitas', 'Sindicaturas', 'Administradoras', 'Emails', 'Notas_Fiscais', 'Empresas_Emissoras', 'Veiculos', 'Pneus']],
    [FIN, ['Despesas', 'Fornecedores', 'Recorrentes', 'Recebimentos', 'Config_Financeiro', 'Conferencias', 'Retiradas', 'Cartoes', 'Pagamentos_Fatura']]]) {
    for (const t of ts) q[t] = (await lista(b, t)).length;
  }
  return q;
}

// Execuções com erro no n8n desde um instante (os fluxos guardam só as com erro).
async function errosDesde(inicioIso) {
  const r = await n8n('GET', '/executions?status=error&limit=50');
  return r.data.filter((e) => e.startedAt >= inicioIso).map((e) => ({ id: e.id, workflowId: e.workflowId }));
}

// Cópia temporária de um fluxo, com outro endereço de webhook e com os nós que falam com
// o mundo de fora (Asaas, e-mail) trocados por simulações. Recusa montar a cópia se
// sobrar qualquer chamada ao Asaas ou envio de e-mail. Devolve { caminho, apagar() }.
// Sub-fluxos que falam com o Asaas de verdade (08/11/2026): uma cópia de teste nunca pode chamá-los.
// "Asaas - Sincroniza cliente" vira uma simulação (cliente "criado" com id cus_teste_migracao na conta
// pedida), a não ser que o teste passe { sincroniza: <id de uma cópia com Asaas simulado> }.
const SUBS_DO_ASAAS = ['Asaas - Sincroniza cliente', 'Asaas - Chamada pela conta'];
const SIMULA_SINCRONIZA = "return [{ json: { ok: true, acao: 'criar', id: 'cus_teste_migracao', conta: ($json.destino === 'CNPJ 2' ? 'CNPJ 2' : 'CNPJ 1'), info: '', aviso: '' } }];";
async function idsDosSubsDoAsaas() {
  const lista = (await n8n('GET', '/workflows?limit=250')).data;
  return lista.filter((w) => SUBS_DO_ASAAS.includes(w.name)).map((w) => w.id);
}
const alvoDoSub = (n) => n.type === 'n8n-nodes-base.executeWorkflow' && n.parameters && n.parameters.workflowId
  ? String(n.parameters.workflowId.value || n.parameters.workflowId) : '';

async function copiaDeTeste(workflowId, { simulacoes = {}, ajustar, sincroniza } = {}) {
  const wf = await n8n('GET', '/workflows/' + workflowId);
  const caminho = 'teste-migracao-' + crypto.randomBytes(4).toString('hex');
  const subsDoAsaas = await idsDosSubsDoAsaas();
  let nodes = wf.nodes.map((n) => {
    if (simulacoes[n.name] === undefined && subsDoAsaas.includes(alvoDoSub(n))) {
      if (sincroniza) return { ...n, parameters: { ...n.parameters, workflowId: { __rl: true, value: sincroniza, mode: 'id' } } };
      return { id: n.id, name: n.name, type: 'n8n-nodes-base.code', typeVersion: 2, position: n.position, parameters: { jsCode: SIMULA_SINCRONIZA } };
    }
    if (simulacoes[n.name] !== undefined) {
      return {
        id: n.id, name: n.name, type: 'n8n-nodes-base.code', typeVersion: 2, position: n.position,
        parameters: { jsCode: simulacoes[n.name] }, ...(n.onError ? { onError: n.onError } : {}),
      };
    }
    if (n.type === 'n8n-nodes-base.webhook') return { ...n, parameters: { ...n.parameters, path: caminho }, webhookId: crypto.randomUUID() };
    return n;
  });
  let connections = wf.connections;
  // ajustar pode devolver só os nós ou { nodes, connections } (quando muda ligações).
  if (ajustar) {
    const r = ajustar(nodes, connections);
    if (Array.isArray(r)) nodes = r; else ({ nodes, connections } = r);
  }
  for (const n of nodes) {
    const p = JSON.stringify(n.parameters || {});
    if (n.type === 'n8n-nodes-base.httpRequest' && /asaas\.com/i.test(p)) throw new Error('a cópia ainda chamaria o Asaas: ' + n.name);
    if (n.credentials && n.credentials.httpHeaderAuth) throw new Error('a cópia ainda tem a credencial do Asaas: ' + n.name);
    if (/emailSend|gmail|smtp/i.test(n.type)) throw new Error('a cópia ainda mandaria e-mail: ' + n.name);
    if (subsDoAsaas.includes(alvoDoSub(n))) throw new Error('a cópia ainda chamaria o sub-fluxo do Asaas: ' + n.name);
  }
  const novo = await n8n('POST', '/workflows', {
    name: 'TMP teste migracao - ' + wf.name, nodes, connections,
    settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all' },
  });
  await n8n('POST', '/workflows/' + novo.id + '/activate');
  return { id: novo.id, caminho, apagar: () => apagarCopias([{ id: novo.id }]) };
}

// Apaga as cópias de teste. Primeiro só desliga e espera o n8n gravar as estatísticas de uso
// (insights, a cada 30 s): apagar o fluxo antes disso deixa o n8n tentando gravar estatística
// de fluxo que não existe, com erro no console a cada 30 s até ser reiniciado.
async function apagarCopias(copias) {
  if (!copias.length) return;
  for (const c of copias) { try { await n8n('POST', '/workflows/' + c.id + '/deactivate'); } catch (e) { /* já inativo */ } }
  await esperar(40000);
  for (const c of copias) await n8n('DELETE', '/workflows/' + c.id).catch((e) => console.log('não apagou a cópia', c.id, e.message));
}

// Troca parâmetros de busca de um nó HTTP (os que eram nós de busca do Airtable).
function trocarBusca(nodes, nomeNo, formula) {
  return nodes.map((n) => {
    if (n.name !== nomeNo) return n;
    const params = ((n.parameters.queryParameters || {}).parameters || []).filter((q) => q.name !== 'filterByFormula');
    params.push({ name: 'filterByFormula', value: formula });
    return { ...n, parameters: { ...n.parameters, queryParameters: { parameters: params } } };
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeISO = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

module.exports = { CAD, FIN, local, lista, n8n, chamar, sessao, entrarComUsuarioDeTeste, sairEApagarUsuarioDeTeste, confere, placar, contarTudo, errosDesde, esperar, hojeISO, copiaDeTeste, apagarCopias, trocarBusca };
