// Cliente no Asaas do CNPJ certo (08/11/2026): cliente do CNPJ 1 no Asaas do CNPJ 1, do CNPJ 2 no do
// CNPJ 2; trocar o "Atendido por" move o cliente (cria no novo com notificações desligadas e tira do
// antigo), mas nunca tira de um Asaas onde ele tem cobrança em aberto.
// O Asaas é um SIMULADOR (fluxo temporário): nada sai daqui. Só cliente e usuário de teste, apagados no fim.
// Uso: node banco/testes/testar-asaas-por-cnpj.js
//   AJUSTE_PREVIO=<arquivo .js> testa a troca dos fluxos antes de ela ir para os fluxos reais.
const fs = require('fs');
const crypto = require('crypto');
const t = require('./comum');
const { CAD, local, chamar, confere } = t;

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const PREVIO = process.env.AJUSTE_PREVIO ? require(process.env.AJUSTE_PREVIO) : null;

// Asaas de mentira. Regras fixas para os casos do teste:
//  - cliente com "ABERTA" no id tem cobrança em aberto; documento terminado em 999 já existe no CNPJ 2;
//  - nome com RECUSA é recusado pelo CNPJ 2; id com NAOAPAGA não sai do Asaas antigo.
const SIMULADOR = `return $input.all().map((i) => {
  const p = i.json || {};
  if (p.pular) return { json: { pulado: true } };
  if (!['CNPJ 1', 'CNPJ 2'].includes(p.conta)) return { json: { error: { message: 'conta desconhecida' } } };
  const m = String(p.metodo || '').toUpperCase();
  const c = String(p.url || '').replace('https://api.asaas.com/v3', '');
  const tag = p.conta.replace(' ', '');
  if (m === 'GET' && /^\\/(payments|subscriptions)\\?/.test(c)) { const a = /customer=[^&]*ABERTA/.test(c); return { json: { totalCount: a ? 1 : 0, data: a ? [{ id: 'pay_sim' }] : [] } }; }
  if (m === 'GET' && /^\\/customers\\?/.test(c)) { const ja = p.conta === 'CNPJ 2' && /cpfCnpj=\\d*999(&|$)/.test(c); return { json: { totalCount: ja ? 1 : 0, data: ja ? [{ id: 'cus_existente_CNPJ2', deleted: false }] : [] } }; }
  if (m === 'POST' && c === '/customers') {
    if (p.conta === 'CNPJ 2' && String((p.corpo || {}).name || '').includes('RECUSA')) return { json: { error: { message: '400 - {"errors":[{"code":"invalid_action","description":"Conta em analise"}]}' } } };
    return { json: { id: 'cus_sim_' + tag + '_' + Math.random().toString(36).slice(2, 8) } };
  }
  if (m === 'PUT' && /^\\/customers\\/[^/?]+$/.test(c)) return { json: { id: decodeURIComponent(c.split('/')[2]) } };
  if (m === 'GET' && /^\\/customers\\/[^/]+\\/notifications$/.test(c)) return { json: { data: [
    { id: 'not_a', event: 'PAYMENT_CREATED', scheduleOffset: 0 }, { id: 'not_b', event: 'PAYMENT_OVERDUE', scheduleOffset: 7 }, { id: 'not_c', event: 'PAYMENT_RECEIVED', scheduleOffset: 0 } ] } };
  if (m === 'PUT' && /^\\/notifications\\//.test(c)) return { json: { id: c.split('/')[2] } };
  if (m === 'DELETE' && /^\\/customers\\//.test(c)) return { json: c.includes('NAOAPAGA') ? { error: { message: '404 - não achado' } } : { deleted: true, id: c.split('/')[2] } };
  return { json: { error: { message: 'simulador: chamada inesperada ' + m + ' ' + c } } };
});`;

async function criarSimulador() {
  const w = await t.n8n('POST', '/workflows', {
    name: 'TMP teste - Simulador do Asaas',
    settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all' },
    nodes: [
      { id: crypto.randomUUID(), name: 'Recebe pedido', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: [0, 0], parameters: { inputSource: 'passthrough' } },
      { id: crypto.randomUUID(), name: 'Simula', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { jsCode: SIMULADOR } },
    ],
    connections: { 'Recebe pedido': { main: [[{ node: 'Simula', type: 'main', index: 0 }]] } },
  });
  await t.n8n('POST', '/workflows/' + w.id + '/activate');
  return w.id;
}

// Cópia do "Asaas - Sincroniza cliente" real, chamando o simulador no lugar do Asaas.
async function copiaDoSincroniza(idSimulador) {
  const lista = (await t.n8n('GET', '/workflows?limit=250')).data;
  const real = await t.n8n('GET', '/workflows/' + lista.find((w) => w.name === 'Asaas - Sincroniza cliente').id);
  const nodes = real.nodes.map((n) => (n.type === 'n8n-nodes-base.executeWorkflow'
    ? { ...n, parameters: { ...n.parameters, workflowId: { __rl: true, value: idSimulador, mode: 'id' } } } : n));
  if (nodes.some((n) => /httpRequest/.test(n.type) || (n.credentials && n.credentials.httpHeaderAuth))) throw new Error('cópia do sincroniza com chamada de verdade');
  const w = await t.n8n('POST', '/workflows', { name: 'TMP teste - Sincroniza (simulado)', nodes, connections: real.connections,
    settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all' } });
  await t.n8n('POST', '/workflows/' + w.id + '/activate');
  return w.id;
}

// Chamadas que chegaram ao simulador desde "desde" (em ordem).
async function chamadas(idSimulador, desde) {
  await t.esperar(1200);
  const r = await t.n8n('GET', `/executions?workflowId=${idSimulador}&includeData=true&limit=100`);
  return r.data.filter((e) => e.startedAt >= desde).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
    .flatMap((e) => (((e.data || {}).resultData || {}).runData || {})['Recebe pedido']?.[0]?.data?.main?.[0] || [])
    .map((i) => i.json).filter((p) => !p.pular)
    .map((p) => ({ conta: p.conta, metodo: String(p.metodo).toUpperCase(), url: String(p.url).replace('https://api.asaas.com/v3', ''), corpo: p.corpo }));
}
const resumo = (cs) => cs.map((c) => `${c.conta} ${c.metodo} ${c.url.split('?')[0].replace(/cus_[A-Za-z0-9_]+/, 'ID').replace(/not_[a-z]/, 'N')}`);

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const copias = [];
  const apagarEnt = [];
  let idSimulador = null, idSinc = null;

  try {
    idSimulador = await criarSimulador();
    idSinc = await copiaDoSincroniza(idSimulador);
    await t.entrarComUsuarioDeTeste();
    const lista = (await t.n8n('GET', '/workflows?limit=250')).data;
    const idDe = (nome) => lista.find((w) => w.name === nome).id;
    const opcoes = (ajuste) => ({ sincroniza: idSinc, ...(PREVIO ? { ajustar: (nodes, con) => ajuste(nodes, con, idSinc) } : {}) });
    const salvar = await t.copiaDeTeste(idDe('App - Salvar entidade'), opcoes(PREVIO && PREVIO.ajustarSalvar));
    copias.push(salvar);
    const atualizar = await t.copiaDeTeste(idDe('App - Atualizar cadastro'), opcoes(PREVIO && PREVIO.ajustarAtualizar));
    copias.push(atualizar);

    const ler = async (id) => (await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${id}`)).fields || {};
    const criar = async (doc, extra) => {
      const r = await chamar(salvar.caminho, {
        documento: doc, tipo: 'CNPJ - Empresa', razaoSocial: 'TESTE ASAASCNPJ ' + doc, nomeFantasia: '', exigenciaFiscal: '',
        emails: 'fin@exemplo.invalid', whatsappCnpj: '', administradora: '', empresaSindicos: '', status: 'Ativo', observacoes: '',
        locais: '[]', contatos: '[]', ...extra,
      });
      await t.esperar(1500);
      const [ent] = await t.lista(CAD, 'Entidades_Cadastradas', `{CPF_CNPJ}='${doc}'`);
      if (ent) apagarEnt.push(ent.id);
      return { r, ent };
    };
    const editar = async (ent, extra) => {
      const f = await ler(ent.id);
      const r = await chamar(atualizar.caminho, {
        id: ent.id, documento: f.CPF_CNPJ, razaoSocial: f.Razao_Social_Nome, nomeFantasia: '', tipo: 'CNPJ - Empresa', exigenciaFiscal: '',
        emails: 'fin@exemplo.invalid', whatsappCnpj: '', administradora: '', empresaSindicos: '', status: 'Ativo', observacoes: '',
        locais: '[]', contatos: '[]', locaisApagar: '', contatosApagar: '', ...extra,
      });
      await t.esperar(1000);
      return r;
    };

    // ---- 1. cliente novo no CNPJ 2: só o Asaas do CNPJ 2, notificações desligadas ----
    let desde = new Date().toISOString();
    const n2 = await criar('00000000000701', { atendidoPor: 'CNPJ 2' });
    let f = await ler(n2.ent.id);
    let cs = await chamadas(idSimulador, desde);
    confere('novo CNPJ 2: salvo, Atendido_Por e Asaas_Conta = CNPJ 2', n2.r.ok === true && f.Atendido_Por === 'CNPJ 2' && f.Asaas_Conta === 'CNPJ 2' && /^cus_sim_CNPJ2_/.test(f.Asaas_Customer_Id || ''), { r: n2.r, f });
    confere('novo CNPJ 2: nenhuma chamada ao Asaas do CNPJ 1', cs.length > 0 && cs.every((c) => c.conta === 'CNPJ 2'), resumo(cs));
    const post = cs.find((c) => c.metodo === 'POST');
    confere('novo CNPJ 2: criado com notificações desligadas e referência do sistema', post && post.corpo.notificationDisabled === true && post.corpo.externalReference === n2.ent.id && post.corpo.email === 'fin@exemplo.invalid', post && post.corpo);
    confere('novo CNPJ 2: ajustou as notificações (só e-mail onde já era)', cs.filter((c) => c.metodo === 'PUT' && c.url.startsWith('/notifications/')).every((c) => c.corpo.whatsappEnabledForCustomer === false && c.corpo.smsEnabledForCustomer === false)
      && cs.some((c) => c.metodo === 'PUT' && c.url.startsWith('/notifications/')), resumo(cs));
    confere('novo CNPJ 2: mensagem normal', n2.r.mensagem === 'Cadastro salvo!', n2.r.mensagem);

    // ---- 2. cliente novo sem escolher: CNPJ 1 ----
    desde = new Date().toISOString();
    const n1 = await criar('00000000000702', {});
    f = await ler(n1.ent.id);
    cs = await chamadas(idSimulador, desde);
    confere('novo sem escolha: CNPJ 1 nos dois campos', f.Atendido_Por === 'CNPJ 1' && f.Asaas_Conta === 'CNPJ 1' && /^cus_sim_CNPJ1_/.test(f.Asaas_Customer_Id || ''), f);
    confere('novo sem escolha: só o Asaas do CNPJ 1', cs.every((c) => c.conta === 'CNPJ 1'), resumo(cs));

    // ---- 3. editar sem trocar o CNPJ: só atualiza no mesmo Asaas, sem mexer nas notificações ----
    desde = new Date().toISOString();
    const idAntes = (await ler(n2.ent.id)).Asaas_Customer_Id;
    let r = await editar(n2.ent, { atendidoPor: 'CNPJ 2' });
    cs = await chamadas(idSimulador, desde);
    f = await ler(n2.ent.id);
    confere('editar no mesmo CNPJ: um PUT no Asaas do CNPJ 2 e nada mais', JSON.stringify(resumo(cs)) === JSON.stringify(['CNPJ 2 PUT /customers/ID']) && cs[0].corpo.notificationDisabled === undefined, resumo(cs));
    confere('editar no mesmo CNPJ: id e conta iguais, mensagem normal', f.Asaas_Customer_Id === idAntes && f.Asaas_Conta === 'CNPJ 2' && r.mensagem === 'Alterações salvas!', { f, r });

    // ---- 4. trocar CNPJ 2 -> CNPJ 1: confere cobranças, cria no CNPJ 1, tira do CNPJ 2 ----
    desde = new Date().toISOString();
    r = await editar(n2.ent, { atendidoPor: 'CNPJ 1' });
    cs = await chamadas(idSimulador, desde);
    f = await ler(n2.ent.id);
    confere('mover 2->1: ordem das chamadas', JSON.stringify(resumo(cs).filter((x) => !/notifications\/N|notifications$/.test(x))) === JSON.stringify([
      'CNPJ 2 GET /payments', 'CNPJ 2 GET /payments', 'CNPJ 2 GET /subscriptions', 'CNPJ 1 GET /customers', 'CNPJ 1 POST /customers', 'CNPJ 2 DELETE /customers/ID']), resumo(cs));
    confere('mover 2->1: tirou do CNPJ 2 o id antigo', cs.some((c) => c.metodo === 'DELETE' && c.conta === 'CNPJ 2' && c.url === '/customers/' + idAntes));
    confere('mover 2->1: gravou o id novo e a conta CNPJ 1', f.Atendido_Por === 'CNPJ 1' && f.Asaas_Conta === 'CNPJ 1' && /^cus_sim_CNPJ1_/.test(f.Asaas_Customer_Id || ''), f);
    confere('mover 2->1: mensagem conta a troca', /passou do Asaas do CNPJ 2 para o do CNPJ 1/.test(r.mensagem || '') && !/Atenção/.test(r.mensagem || ''), r.mensagem);

    // ---- 5. cobrança em aberto: não move, avisa, e tenta de novo no próximo salvar ----
    await local('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${n1.ent.id}`, { fields: { Asaas_Customer_Id: 'cus_ABERTA_1', Asaas_Conta: 'CNPJ 1' } });
    desde = new Date().toISOString();
    r = await editar(n1.ent, { atendidoPor: 'CNPJ 2' });
    cs = await chamadas(idSimulador, desde);
    f = await ler(n1.ent.id);
    confere('cobrança aberta: não cria nem apaga nada', !cs.some((c) => c.metodo === 'POST' || c.metodo === 'DELETE') && cs.every((c) => c.conta === 'CNPJ 1'), resumo(cs));
    confere('cobrança aberta: continua no Asaas do CNPJ 1, mas Atendido_Por = CNPJ 2', f.Atendido_Por === 'CNPJ 2' && f.Asaas_Conta === 'CNPJ 1' && f.Asaas_Customer_Id === 'cus_ABERTA_1', f);
    confere('cobrança aberta: avisa na mensagem', r.ok === true && /Atenção: .*cobrança em aberto no Asaas do CNPJ 1/.test(r.mensagem || ''), r.mensagem);

    await local('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${n1.ent.id}`, { fields: { Asaas_Customer_Id: 'cus_paga_1' } });
    desde = new Date().toISOString();
    r = await editar(n1.ent, { atendidoPor: 'CNPJ 2' });
    cs = await chamadas(idSimulador, desde);
    f = await ler(n1.ent.id);
    confere('cobrança paga: salvar de novo move para o CNPJ 2', f.Asaas_Conta === 'CNPJ 2' && /^cus_sim_CNPJ2_/.test(f.Asaas_Customer_Id || '')
      && cs.some((c) => c.metodo === 'DELETE' && c.conta === 'CNPJ 1' && c.url === '/customers/cus_paga_1'), { f, cs: resumo(cs) });

    // ---- 6. Asaas de destino recusa: fica onde estava, sem apagar ----
    const nr = await criar('00000000000703', {});
    await local('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${nr.ent.id}`, { fields: { Razao_Social_Nome: 'TESTE ASAASCNPJ RECUSA' } });
    const idR = (await ler(nr.ent.id)).Asaas_Customer_Id;
    desde = new Date().toISOString();
    r = await editar(nr.ent, { atendidoPor: 'CNPJ 2' });
    cs = await chamadas(idSimulador, desde);
    f = await ler(nr.ent.id);
    confere('destino recusa: não apaga do antigo', !cs.some((c) => c.metodo === 'DELETE'), resumo(cs));
    confere('destino recusa: id e conta de antes', f.Asaas_Customer_Id === idR && f.Asaas_Conta === 'CNPJ 1', f);
    confere('destino recusa: avisa com o motivo do Asaas', /Atenção: O Asaas do CNPJ 2 não aceitou o cliente \(Conta em analise\)/.test(r.mensagem || ''), r.mensagem);

    // ---- 7. já existe no Asaas de destino (mesmo CNPJ): reaproveita, sem duplicar ----
    const ne = await criar('00000000000999', {});
    desde = new Date().toISOString();
    r = await editar(ne.ent, { atendidoPor: 'CNPJ 2' });
    cs = await chamadas(idSimulador, desde);
    f = await ler(ne.ent.id);
    const putExistente = cs.find((c) => c.metodo === 'PUT' && c.url === '/customers/cus_existente_CNPJ2');
    confere('já existe no destino: atualiza o existente (com notificações desligadas), sem POST', putExistente && putExistente.corpo.notificationDisabled === true && !cs.some((c) => c.metodo === 'POST'), resumo(cs));
    confere('já existe no destino: grava o id existente', f.Asaas_Customer_Id === 'cus_existente_CNPJ2' && f.Asaas_Conta === 'CNPJ 2', f);

    // ---- 8. não consegue tirar do antigo: fica no novo e avisa para tirar à mão ----
    const nn = await criar('00000000000704', {});
    await local('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${nn.ent.id}`, { fields: { Asaas_Customer_Id: 'cus_NAOAPAGA_1' } });
    r = await editar(nn.ent, { atendidoPor: 'CNPJ 2' });
    f = await ler(nn.ent.id);
    confere('não tirou do antigo: fica no CNPJ 2 e avisa', f.Asaas_Conta === 'CNPJ 2' && /Atenção: Não consegui tirar o cliente do Asaas do CNPJ 1/.test(r.mensagem || ''), { f, m: r.mensagem });

    // ---- 9. cliente antigo, sem Asaas_Conta anotada: vale como CNPJ 1 ----
    await local('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${nn.ent.id}`, { fields: { Asaas_Customer_Id: 'cus_antigo_1', Asaas_Conta: null, Atendido_Por: 'CNPJ 1' } });
    desde = new Date().toISOString();
    r = await editar(nn.ent, { atendidoPor: 'CNPJ 1' });
    cs = await chamadas(idSimulador, desde);
    f = await ler(nn.ent.id);
    confere('sem conta anotada: atualiza no CNPJ 1 e anota a conta', JSON.stringify(resumo(cs)) === JSON.stringify(['CNPJ 1 PUT /customers/ID']) && f.Asaas_Conta === 'CNPJ 1', { cs: resumo(cs), f });
  } finally {
    if (copias.length) await t.apagarCopias(copias.concat([idSinc, idSimulador].filter(Boolean).map((id) => ({ id }))));
    for (const id of apagarEnt) await local('DELETE', `/v0/${CAD}/Entidades_Cadastradas/${id}`).catch(() => {});
    await t.sairEApagarUsuarioDeTeste();
    await t.esperar(1500);
    if (backupAntes) fs.writeFileSync(ARQ_BACKUP, backupAntes);
  }

  const depois = await t.contarTudo();
  confere('nenhuma tabela mudou de tamanho', JSON.stringify(antes) === JSON.stringify(depois), { antes, depois });
  if (backupAntes) confere('backup dos cadastros voltou a ser o de antes', fs.readFileSync(ARQ_BACKUP).equals(backupAntes));
  const erros = await t.errosDesde(inicio);
  confere('nenhuma execução com erro no n8n', !erros.length, erros);
  const { ok, falhas } = t.placar();
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e); process.exitCode = 1; });
