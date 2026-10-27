// Testa os fluxos do Financeiro que gravam (sem dinheiro de verdade: nada de Asaas aqui).
// Tudo com registros de teste "TESTE MIGRACAO", apagados no fim; confere que as
// quantidades das tabelas voltam ao que eram e que o n8n não registrou erro.
// Uso: node banco/testes/testar-fluxos-financeiro.js
const t = require('./comum');
const { FIN, local, lista, chamar, confere } = t;

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const criados = { Despesas: [], Fornecedores: [], Recebimentos: [], Cartoes: [], Recorrentes: [], Conferencias: [], Retiradas: [] };
  await t.entrarComUsuarioDeTeste();
  try {
    const sf = await chamar('salvar-fornecedor', { nome: 'TESTE MIGRACAO forn', cnpj: '' });
    confere('salvar-fornecedor', sf.ok === true && sf.fornecedor && /^rec/.test(sf.fornecedor.id), sf);
    const fornId = sf.fornecedor && sf.fornecedor.id;
    if (fornId) criados.Fornecedores.push(fornId);

    const sc = await chamar('salvar-cartao', { nome: 'TESTE MIGRACAO cartao', banco: 'Banco Teste', bandeira: 'Visa', final: '0000', chavePix: '', tipoChavePix: '', diaFechamento: '5', diaVencimento: '12', limite: '1000', observacoes: '' });
    const [cartao] = await lista(FIN, 'Cartoes', "{Nome}='TESTE MIGRACAO cartao'");
    confere('salvar-cartao', sc.ok === true && cartao && cartao.fields.Dia_Vencimento === 12 && cartao.fields.Limite === 1000 && cartao.fields.Ativo === true, { sc, cartao });
    if (cartao) criados.Cartoes.push(cartao.id);

    const sr = await chamar('salvar-recebimento', { descricao: 'TESTE MIGRACAO receb', valor: '100', cliente: 'TESTE', clienteDocumento: '', vencimento: '2027-12-01', status: 'Pendente', dataRecebimento: '', forma: 'PIX', materialValor: '10', observacoes: '' });
    const [receb] = await lista(FIN, 'Recebimentos', "{Descricao}='TESTE MIGRACAO receb'");
    confere('salvar-recebimento', sr.ok === true && receb && receb.fields.Valor === 100 && receb.fields.Vencimento === '2027-12-01' && receb.fields.Material_Valor === 10, { sr, receb });
    if (receb) criados.Recebimentos.push(receb.id);
    const sr2 = await chamar('salvar-recebimento', { id: receb.id, descricao: 'TESTE MIGRACAO receb', valor: '100', cliente: 'TESTE', clienteDocumento: '', vencimento: '2027-12-01', status: 'Recebido', dataRecebimento: t.hojeISO(), forma: 'PIX', materialValor: '10', observacoes: '' });
    const receb2 = await local('GET', `/v0/${FIN}/Recebimentos/${receb.id}`);
    confere('salvar-recebimento (editar: recebido)', sr2.ok === true && receb2.fields.Status === 'Recebido' && receb2.fields.Data_Recebimento === t.hojeISO(), receb2);

    const sd = await chamar('salvar-despesa', { descricao: 'TESTE MIGRACAO desp', valor: '90', fornecedorId: fornId, vencimento: '2027-12-10', status: 'Pendente', categoria: 'Outros', formaPagamento: 'Cartão de crédito', dataPagamento: '', observacoes: '', servicoId: receb.id, cartaoId: cartao.id, parcelas: '3' });
    const desp = (await lista(FIN, 'Despesas', "FIND('TESTE MIGRACAO desp', {Descricao})")).sort((a, b) => a.fields.Parcela_Numero - b.fields.Parcela_Numero);
    desp.forEach((d) => criados.Despesas.push(d.id));
    confere('salvar-despesa em 3 parcelas', sd.ok === true && desp.length === 3 && desp.every((d, i) => d.fields.Parcela_Numero === i + 1 && d.fields.Parcela_Total === 3), { sd, n: desp.length });
    confere('parcelas com o mesmo grupo e vencimentos mês a mês', desp.length === 3 && new Set(desp.map((d) => d.fields.Grupo)).size === 1 && desp[1].fields.Vencimento === '2028-01-10' && desp[2].fields.Vencimento === '2028-02-10', desp.map((d) => [d.fields.Grupo, d.fields.Vencimento]));
    confere('vínculos da despesa (fornecedor, serviço, cartão)', desp.length === 3 && desp.every((d) => d.fields.Fornecedor_Ref[0] === fornId && d.fields.Servico_Ref[0] === receb.id && d.fields.Cartao_Ref[0] === cartao.id), desp[0] && desp[0].fields);
    confere('consulta Fornecedor_Nome na despesa', desp.length && JSON.stringify(desp[0].fields.Fornecedor_Nome) === '["TESTE MIGRACAO forn"]', desp[0] && desp[0].fields.Fornecedor_Nome);
    const fornLido = await local('GET', `/v0/${FIN}/Fornecedores/${fornId}`);
    confere('fornecedor mostra as 3 despesas', (fornLido.fields.Despesas || []).length === 3, fornLido.fields);
    const ld = await chamar('listar-despesas');
    const naLista = (ld.despesas || []).filter((d) => criados.Despesas.includes(d.id));
    confere('listar-despesas traz as parcelas novas', ld.ok === true && naLista.length === 3, { ok: ld.ok, n: naLista.length, ex: naLista[0] });

    const ad = await chamar('atualizar-despesa', { id: desp[0].id, descricao: 'TESTE MIGRACAO desp (1/3)', valor: '30', fornecedorId: fornId, vencimento: '2027-12-10', status: 'Pago', categoria: 'Outros', formaPagamento: 'PIX', dataPagamento: t.hojeISO(), observacoes: 'paga no teste' });
    const d0 = await local('GET', `/v0/${FIN}/Despesas/${desp[0].id}`);
    confere('atualizar-despesa', ad.ok === true && d0.fields.Status === 'Pago' && d0.fields.Valor === 30 && d0.fields.Data_Pagamento === t.hojeISO() && d0.fields.Observacoes === 'paga no teste', { ad, f: d0.fields });

    const cf = await chamar('confirmar-fatura', { ids: desp.slice(1).map((d) => d.id).join(','), dataPagamento: t.hojeISO() });
    const pagas = await Promise.all(desp.slice(1).map((d) => local('GET', `/v0/${FIN}/Despesas/${d.id}`)));
    confere('confirmar-fatura marca as outras como pagas', cf.ok === true && pagas.every((d) => d.fields.Status === 'Pago' && d.fields.Data_Pagamento === t.hojeISO()), { cf, s: pagas.map((d) => d.fields.Status) });

    const srec = await chamar('salvar-recorrente', { descricao: 'TESTE MIGRACAO rec', valor: '50', fornecedorId: fornId, diaDoMes: '15', semFim: '', restantes: '2', categoria: 'Outros', formaPagamento: 'PIX', observacoes: '' });
    const [rec] = await lista(FIN, 'Recorrentes', "{Descricao}='TESTE MIGRACAO rec'");
    confere('salvar-recorrente', srec.ok === true && rec && rec.fields.Dia_Do_Mes === 15 && rec.fields.Restantes === 2 && rec.fields.Fornecedor_Ref[0] === fornId && !!rec.fields.Proxima_Geracao, { srec, rec });
    if (rec) criados.Recorrentes.push(rec.id);
    const lr = await chamar('listar-recorrentes');
    confere('listar-recorrentes traz a nova', lr.ok === true && lr.recorrentes.some((r) => r.id === rec.id));
    const enc = await chamar('excluir-recorrente', { id: rec.id });
    const recEnc = await local('GET', `/v0/${FIN}/Recorrentes/${rec.id}`);
    confere('excluir-recorrente (só encerrar)', enc.ok === true && recEnc.id === rec.id && !recEnc.fields.Ativo, { enc, f: recEnc.fields });
    const er = await chamar('excluir-recorrente', { id: rec.id, apagarDeVez: 'sim' });
    const recDepois = await lista(FIN, 'Recorrentes', "{Descricao}='TESTE MIGRACAO rec'");
    confere('excluir-recorrente (apagar de vez)', er.ok === true && recDepois.length === 0, { er, sobrou: recDepois.length });
    if (!recDepois.length) criados.Recorrentes = [];

    const sconf = await chamar('salvar-conferencia', { data: t.hojeISO(), informado: '100', calculado: '90.5', observacoes: 'TESTE MIGRACAO conf' });
    const [conf] = await lista(FIN, 'Conferencias', "{Observacoes}='TESTE MIGRACAO conf'");
    confere('salvar-conferencia', sconf.ok === true && conf && conf.fields.Saldo_Informado === 100 && conf.fields.Saldo_Calculado === 90.5 && conf.fields.Diferenca === 9.5, { sconf, conf });
    if (conf) criados.Conferencias.push(conf.id);
    const lconf = await chamar('listar-conferencias');
    confere('listar-conferencias traz a nova', lconf.ok === true && JSON.stringify(lconf).includes(conf.id), lconf);

    const sret = await chamar('salvar-retirada', { data: t.hojeISO(), socio: 'TESTE', valor: '1.5', observacoes: 'TESTE MIGRACAO ret' });
    const [ret] = await lista(FIN, 'Retiradas', "{Observacoes}='TESTE MIGRACAO ret'");
    confere('salvar-retirada', sret.ok === true && ret && ret.fields.Valor === 1.5 && ret.fields.Socio === 'TESTE', { sret, ret });
    if (ret) criados.Retiradas.push(ret.id);
    const eret = await chamar('excluir-retirada', { id: ret.id });
    confere('excluir-retirada', eret.ok === true && !(await lista(FIN, 'Retiradas', "{Observacoes}='TESTE MIGRACAO ret'")).length, eret);
    criados.Retiradas = [];

    const ed = await chamar('excluir-despesa', { ids: desp.map((d) => d.id).join(',') });
    confere('excluir-despesa (as 3 parcelas)', ed.ok === true && !(await lista(FIN, 'Despesas', "FIND('TESTE MIGRACAO desp', {Descricao})")).length, ed);
    criados.Despesas = [];
    const erec = await chamar('excluir-recebimento', { id: receb.id });
    confere('excluir-recebimento', erec.ok === true && !(await lista(FIN, 'Recebimentos', "{Descricao}='TESTE MIGRACAO receb'")).length, erec);
    criados.Recebimentos = [];
    const ec = await chamar('excluir-cartao', { id: cartao.id });
    confere('excluir-cartao', ec.ok === true && !(await lista(FIN, 'Cartoes', "{Nome}='TESTE MIGRACAO cartao'")).length, ec);
    criados.Cartoes = [];
  } finally {
    // limpeza do que sobrou (fornecedor e conferência não têm fluxo de excluir)
    for (const [tab, ids] of Object.entries(criados)) for (const id of ids) await local('DELETE', `/v0/${FIN}/${tab}/${id}`);
    await t.sairEApagarUsuarioDeTeste();
    await t.esperar(1500);
    const depois = await t.contarTudo();
    confere('quantidades voltaram ao que eram', JSON.stringify(antes) === JSON.stringify(depois), { antes, depois });
    const erros = await t.errosDesde(inicio);
    confere('n8n sem execuções com erro', erros.length === 0, erros);
    const p = t.placar();
    console.log(`\n${p.ok} ok, ${p.falhas} falha(s).`);
    process.exitCode = p.falhas ? 1 : 0;
  }
})();
