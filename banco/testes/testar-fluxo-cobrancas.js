// Testes dos fluxos "App - Cobrancas" e "Cobrancas - Sincronizar" (20/11/2026), em CÓPIAS temporárias que chamam um
// Asaas SIMULADO (nada sai para a internet) e não mandam e-mail. Cliente, nota e usuário de TESTE, apagados no fim;
// o estado real das cobranças (saldo, última sincronização) é guardado antes e devolvido.
// Uso: node banco/testes/testar-fluxo-cobrancas.js
const fs = require('fs');
const crypto = require('crypto');
const t = require('./comum');
const { Client } = require('C:/Users/rediv/AppData/Roaming/npm/node_modules/n8n/node_modules/pg');
const seg = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8');
const db = new Client({ host: '127.0.0.1', port: 5432, database: 'solucoes', user: 'n8n_app', password: seg.match(/^senha do n8n:\s*(\S+)/m)[1] });
const q = async (sql, params) => (await db.query(sql, params)).rows;
const { chamar, confere } = t;

const SIMULADOR = `return $input.all().map((i) => {
  const p = i.json || {};
  if (p.pular) return { json: { pulado: true } };
  if (!['CNPJ 1', 'CNPJ 2'].includes(p.conta)) return { json: { error: { message: 'conta desconhecida' } } };
  const m = String(p.metodo || '').toUpperCase();
  const c = String(p.url || '').replace('https://api.asaas.com/v3', '');
  const b = p.corpo || {};
  const rnd = () => Math.random().toString(36).slice(2, 10);
  if (m === 'POST' && c === '/payments') return { json: { id: 'pay_simflx' + rnd(), status: 'PENDING', customer: b.customer, value: b.value, dueDate: b.dueDate,
    invoiceUrl: 'https://www.asaas.com/i/sim' + rnd(), bankSlipUrl: 'https://www.asaas.com/b/pdf/sim' + rnd(), fine: b.fine, interest: b.interest } };
  if (m === 'GET' && /^\\/payments\\?externalReference=/.test(c)) return { json: { data: [] } };
  if (m === 'POST' && /^\\/payments\\/[^/]+\\/receiveInCash$/.test(c)) return { json: { id: c.split('/')[2], status: 'RECEIVED_IN_CASH' } };
  if (m === 'POST' && /^\\/payments\\/[^/?]+$/.test(c)) return { json: { id: c.split('/')[2], status: 'PENDING', dueDate: b.dueDate } };
  if (m === 'DELETE' && /^\\/payments\\//.test(c)) return { json: { deleted: true, id: c.split('/')[2] } };
  if (m === 'GET' && c === '/finance/balance') return { json: { balance: 10 } };
  if (m === 'GET' && /^\\/pix\\/addressKeys/.test(c)) return { json: { data: p.conta === 'CNPJ 2' ? [{ id: 'k', type: 'CNPJ', status: 'ACTIVE' }] : [] } };
  if (m === 'GET' && /^\\/payments\\?/.test(c)) return { json: { data: [] } };
  if (m === 'GET' && /^\\/financialTransactions/.test(c)) return { json: { data: [] } };
  if (m === 'GET' && c === '/myAccount/accountNumber') return { json: { agency: '0001', account: '9999999', accountDigit: '9' } };
  if (m === 'GET' && c === '/myAccount/fees') return { json: { payment: { bankSlip: { defaultValue: 1.99, discountValue: 0.99, expirationDate: '2000-01-01 00:00:00' } }, notification: { messagingFeeValue: 0.99 } } };
  if (m === 'GET' && /^\\/payments\\/[^/]+\\/viewingInfo$/.test(c)) return { json: { invoiceViewedDate: '2026-11-20 08:00:00' } };
  if (m === 'GET' && /^\\/payments\\/[^/?]+$/.test(c)) return { json: { id: c.split('/')[2], status: 'RECEIVED', value: 200, netValue: 198.01, paymentDate: '2026-11-20', billingType: 'BOLETO' } };
  return { json: { error: { message: 'simulador: chamada inesperada ' + m + ' ' + c } } };
});`;

async function criarSimulador() {
  const w = await t.n8n('POST', '/workflows', {
    name: 'TMP teste - Simulador do Asaas (cobrancas)', settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all' },
    nodes: [
      { id: crypto.randomUUID(), name: 'Recebe pedido', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: [0, 0], parameters: { inputSource: 'passthrough' } },
      { id: crypto.randomUUID(), name: 'Simula', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { jsCode: SIMULADOR } },
    ],
    connections: { 'Recebe pedido': { main: [[{ node: 'Simula', type: 'main', index: 0 }]] } },
  });
  await t.n8n('POST', '/workflows/' + w.id + '/activate');
  return w.id;
}

(async () => {
  const inicio = new Date().toISOString();
  await db.connect();
  const estadoAntes = await q(`select id, "Valor" from "Cobranca_Estado"`);
  const copias = [];
  let idSimulador = null;
  const ids = { clientes: [], notas: [] };
  try {
    idSimulador = await criarSimulador();
    await t.entrarComUsuarioDeTeste();
    const lista = (await t.n8n('GET', '/workflows?limit=250')).data;
    const idDe = (nome) => lista.find((w) => w.name === nome).id;
    const app = await t.copiaDeTeste(idDe('App - Cobrancas'), { sincroniza: idSimulador, simulacoes: { 'Dispara sincronizacao': 'return [{ json: {} }];', 'Dispara sincronizacao (PDF)': 'return [{ json: { simulado: true } }];' } });
    copias.push(app);
    const caminhoSinc = 'teste-sinc-' + crypto.randomBytes(4).toString('hex');
    const sinc = await t.copiaDeTeste(idDe('Cobrancas - Sincronizar'), {
      sincroniza: idSimulador,
      simulacoes: { 'Manda lembrete': 'return $input.all().map(() => ({ json: { enviado: true } }));', 'A cada 30 minutos': 'return [{ json: {} }];' },
      ajustar: (nodes, con) => {
        nodes.push({ id: crypto.randomUUID(), name: 'Recebe teste', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 700], webhookId: crypto.randomUUID(),
          parameters: { httpMethod: 'POST', path: caminhoSinc, responseMode: 'lastNode', options: {} } });
        return { nodes, connections: { ...con, 'Recebe teste': { main: [[{ node: 'Plano', type: 'main', index: 0 }]] } } };
      },
    });
    copias.push(sinc);

    const c1 = (await q(`insert into "Entidades_Cadastradas" ("CPF_CNPJ", "Razao_Social_Nome", "Exigencia_Fiscal", "Emails_Financeiro_NFE", "Status", "Asaas_Customer_Id", "Atendido_Por", "Asaas_Conta", "Gera_Boleto")
        values ('99999999000353', 'TESTE FLUXO COBRANCAS', 'Exige Nota Fiscal', 'fin@example.com', 'Ativo', 'cus_teste_flx', 'CNPJ 2', 'CNPJ 2', true) returning id`))[0].id;
    ids.clientes.push(c1);
    const nota = (await q(`insert into "Notas_Fiscais" ("Ambiente", "Serie", "Numero_DPS", "Status", "Numero_NFSe", "Cliente_Ref", "Tomador_Nome", "Descricao", "Valor", "Emissor", "Emitida_Em")
        values ('Testes', 998, (random() * 1000000)::int + 1, 'Emitida', '9101', $1, 'TESTE FLUXO', 'Serviço de teste. Valor total = R$ 200,00.', 200, 'CNPJ 2', now()) returning id`, [c1]))[0].id;
    ids.notas.push(nota);
    const hoje = (await q('select cob_hoje()::text as h'))[0].h;
    const dia = (n) => { const d = new Date(hoje + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

    // ---------- acesso e entrada ----------
    const semToken = await fetch('http://localhost:5678/webhook/' + app.caminho, { method: 'POST', body: new URLSearchParams({ acao: 'painel' }) }).then((r) => r.json());
    confere('sem login: acesso negado', semToken.ok === false && semToken.acessoNegado === true, semToken);
    const inv = await chamar(app.caminho, { acao: 'apagar' });
    confere('ação inválida recusada', inv.ok === false && /Ação inválida/.test(inv.mensagem), inv);
    const pa = await chamar(app.caminho, { acao: 'painel' });
    confere('painel responde', pa.ok === true && Array.isArray(pa.recebimentos) && Array.isArray(pa.notasSemConta), Object.keys(pa));

    // ---------- conferir e gerar ----------
    const venc = JSON.stringify([dia(7), dia(37)]);
    const pre = await chamar(app.caminho, { acao: 'preparar', clienteId: c1, valor: '200,00', material: '0', parcelas: '2', vencimentos: venc });
    confere('preparar pelo fluxo: pode gerar 2 boletos de 100', pre.ok && pre.podeGerar && pre.parcelas.length === 2 && Number(pre.parcelas[0].valor) === 100, pre);
    const grupo = crypto.randomUUID();
    const cr = await chamar(app.caminho, { acao: 'criar', grupo, clienteId: c1, origem: 'nota', servico: 'Serviço de teste', valor: '200', parcelas: '2', vencimentos: venc });
    confere('criar pelo fluxo: 2 boletos com link', cr.ok === true && cr.cobrancas.length === 2 && cr.cobrancas.every((x) => /^https:\/\/www\.asaas\.com\/i\//.test(x.link)), cr);
    const cr2 = await chamar(app.caminho, { acao: 'criar', grupo, clienteId: c1, origem: 'nota', servico: 'Serviço de teste', valor: '200', parcelas: '2', vencimentos: venc });
    confere('criar de novo (mesmo pedido): os mesmos boletos, sem duplicar', cr2.ok === true && cr2.cobrancas.map((x) => x.asaasId).join() === cr.cobrancas.map((x) => x.asaasId).join(), cr2);
    const li = await chamar(app.caminho, { acao: 'ligar-nota', grupo, notaId: nota });
    confere('ligar à nota pelo fluxo', li.ok === true && li.cobrancas.every((x) => x.notaId === nota), li);
    const [b1, b2] = cr.cobrancas;
    const bx = await chamar(app.caminho, { acao: 'baixa', id: b1.id, data: hoje, valor: '100,00', forma: 'PIX' });
    confere('recebi por fora: baixa no Asaas e no sistema', bx.ok === true && bx.item.status === 'Recebido' && bx.item.asaasStatus === 'RECEIVED_IN_CASH', bx);
    const pr = await chamar(app.caminho, { acao: 'prorrogar', id: b2.id, vencimento: dia(40) });
    confere('mudar vencimento pelo fluxo', pr.ok === true && pr.item.vencimento === dia(40), pr);
    const hi = await chamar(app.caminho, { acao: 'historico', id: b2.id });
    confere('histórico pelo fluxo', hi.ok === true && hi.eventos.length >= 3, hi);

    // ---------- sincronização (cópia, Asaas simulado): o boleto aberto foi pago ----------
    await q(`delete from "Cobranca_Estado" where id = 'sinc:trava'`);
    // Taxas e agência/conta só são pedidas 1x por dia: o teste força pedir (o estado real volta no fim).
    await q(`update "Cobranca_Estado" set "Valor" = "Valor" - 'taxasEm' - 'numeroEm' where id like 'conta:%'`);
    const empAntes = await q(`select "Codigo", "Banco", "Conta", "Chave_PIX" from "Empresas_Emissoras" order by 1`);
    const sr = await fetch('http://localhost:5678/webhook/' + caminhoSinc, { method: 'POST' }).then((r) => r.json()).catch((e) => ({ erro: e.message }));
    const b2d = (await q(`select * from "Recebimentos" where id = $1`, [b2.id]))[0];
    confere('sincronizar: boleto pago vira Recebido com taxa', b2d.Status === 'Recebido' && Number(b2d.Taxa) === 1.99 && b2d.Visto_Em !== null, { sr, b2d });
    const est = (await q(`select "Valor" from "Cobranca_Estado" where id = 'conta:CNPJ 2'`))[0];
    confere('sincronizar: saldo, PIX e taxa da conta', est && Number(est.Valor.saldo) === 10 && est.Valor.pix === true && Number(est.Valor.taxaBoleto) === 1.99, est);
    confere('sincronizar: guarda agência/conta do Asaas e as chaves PIX', est && est.Valor.conta === '9999999-9' && est.Valor.agencia === '0001'
      && Array.isArray(est.Valor.pixChaves) && est.Valor.pixChaves[0].tipo === 'CNPJ', est);
    // O simulador não tem a chave do CNPJ 1: a sincronização de teste não pode mexer nos dados de pagamento reais.
    const empDepois = await q(`select "Codigo", "Banco", "Conta", "Chave_PIX" from "Empresas_Emissoras" order by 1`);
    confere('sincronizar: dados de pagamento das empresas não mudam sem a chave do próprio CNPJ', JSON.stringify(empAntes) === JSON.stringify(empDepois), empDepois);
    const trava = (await q(`select "Valor" from "Cobranca_Estado" where id = 'sinc:trava'`))[0];
    confere('sincronizar: trava solta no fim', trava && new Date(trava.Valor.ate) <= new Date(Date.now() + 2000), trava);

    // ---------- cancelar ----------
    const grupo2 = crypto.randomUUID();
    const cr3 = await chamar(app.caminho, { acao: 'criar', grupo: grupo2, clienteId: c1, origem: 'avulsa', servico: 'Avulso de teste', valor: '50', parcelas: '1', vencimentos: JSON.stringify([dia(10)]) });
    const ca = await chamar(app.caminho, { acao: 'cancelar', id: cr3.cobrancas[0].id });
    confere('cancelar pelo fluxo', ca.ok === true, ca);
    const erros = await t.errosDesde(inicio);
    confere('nenhuma execução com erro no n8n', !erros.length, erros);
  } catch (e) {
    t.confere('sem erro inesperado', false, e.message);
  } finally {
    try {
      await q(`delete from "Recebimentos" where "Cliente_Ref" = any($1) or "Nota_Ref" = any($2) or "Asaas_Cobranca_Id" like 'pay_simflx%'`, [ids.clientes, ids.notas]);
      if (ids.notas.length) await q(`delete from "Notas_Fiscais" where id = any($1)`, [ids.notas]);
      if (ids.clientes.length) await q(`delete from "Entidades_Cadastradas" where id = any($1)`, [ids.clientes]);
      // Volta o estado real, menos um registro de troca de banco de verdade (banco-antes / banco-trocado).
      await q(`delete from "Cobranca_Estado" where id not like 'banco-antes:CNPJ %' and id not like 'banco-trocado:CNPJ %'`);
      for (const e of estadoAntes) await q(`insert into "Cobranca_Estado" (id, "Valor") values ($1, $2) on conflict (id) do nothing`, [e.id, JSON.stringify(e.Valor)]);
    } catch (e) { console.log('ERRO na limpeza do banco', e.message); }
    await db.end();
    await t.sairEApagarUsuarioDeTeste().catch(() => {});
    if (idSimulador) copias.push({ id: idSimulador });
    await t.apagarCopias(copias);
    t.placar && t.placar();
  }
})();
