// Testa, em CÓPIAS temporárias, os fluxos que falam com o Asaas (cliente, PIX, boleto) ou
// que gravam na configuração do Financeiro. Nas cópias o Asaas é simulado — a cópia nem é
// montada se sobrar qualquer chamada real a ele —, e a configuração usa uma linha de teste.
// Tudo é apagado no fim (registros e cópias); confere quantidades e as linhas reais da
// configuração, que não podem mudar.
// Uso: node banco/testes/testar-fluxos-copias.js
const fs = require('fs');
const t = require('./comum');
const { CAD, FIN, local, lista, chamar, confere } = t;

// O "Salvar entidade" refaz o backup dos cadastros: guarda o arquivo e devolve no fim,
// senão o cliente de teste ficaria dentro do backup do dono.
const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';

const SIM_CLIENTE = {
  'Cria cliente na Asaas': "return [{ json: { id: 'cus_teste_migracao' } }];",
  'Le notificacoes padrao': 'return [{ json: { data: [] } }];',
  'Ajusta notificacoes': 'return $input.all().map(() => ({ json: { ok: true } }));',
};

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const configReal = JSON.stringify(await lista(FIN, 'Config_Financeiro', "{Chave}='principal'"));
  const backupOriginal = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const copias = [];
  const apagar = []; // [base, tabela, id]
  let erros = [];
  await t.entrarComUsuarioDeTeste();
  try {
    // ================= Cadastro de cliente (Asaas simulado) =================
    const salvar = await t.copiaDeTeste('dFV53YYjsktzuEWw', { simulacoes: SIM_CLIENTE });
    copias.push(salvar);
    const se = await chamar(salvar.caminho, {
      documento: '00000000000353', tipo: 'CNPJ - Condomínio', razaoSocial: 'TESTE MIGRACAO condominio', nomeFantasia: 'TESTE MIG',
      exigenciaFiscal: 'Exige Nota Fiscal', emails: 'fin@exemplo.invalid', whatsappCnpj: '5547900000000', administradora: '', empresaSindicos: '',
      status: 'Ativo', observacoes: 'cadastro de teste',
      locais: JSON.stringify([{ nome: 'Endereço do CNPJ', endereco: 'RUA TESTE, 10, CEP 89200-000', bairroCidade: 'CENTRO / JOINVILLE - SC', acesso: 'portaria', status: 'Ativo' }]),
      contatos: JSON.stringify([{ nome: 'Síndica Teste', cargo: 'Síndico', whatsapps: ['5547911111111', '5547922222222'], emails: ['sindica@exemplo.invalid'], observacoes: '', status: 'Ativo' }]),
    });
    await t.esperar(1500);
    const [ent] = await lista(CAD, 'Entidades_Cadastradas', "{CPF_CNPJ}='00000000000353'");
    if (ent) apagar.push([CAD, 'Entidades_Cadastradas', ent.id]);
    const locs = ent ? (await lista(CAD, 'Locais_Atendimento')).filter((l) => (l.fields.Cliente_Vinculado || [])[0] === ent.id) : [];
    const cons = ent ? (await lista(CAD, 'Contatos_Solicitantes')).filter((c) => (c.fields.Entidades_Vinculadas || []).includes(ent.id)) : [];
    locs.forEach((l) => apagar.push([CAD, 'Locais_Atendimento', l.id]));
    cons.forEach((c) => apagar.push([CAD, 'Contatos_Solicitantes', c.id]));
    confere('salvar-entidade (cliente)', se.ok === true && ent && ent.fields.Razao_Social_Nome === 'TESTE MIGRACAO condominio' && ent.fields.Tipo_Documento === 'CNPJ - Condomínio' && ent.fields.Status === 'Ativo', { se, f: ent && ent.fields });
    confere('salvar-entidade (local e contato)', locs.length === 1 && locs[0].fields.Observacoes_Acesso === 'portaria' && cons.length === 1 && cons[0].fields.WhatsApps === '5547911111111\n5547922222222' && cons[0].fields.Cargo_Funcao === 'Síndico', { l: locs.map((x) => x.fields), c: cons.map((x) => x.fields) });
    confere('salvar-entidade (código do Asaas gravado)', ent && ent.fields.Asaas_Customer_Id === 'cus_teste_migracao', ent && ent.fields);
    const dup = await chamar(salvar.caminho, { documento: '00000000000353', tipo: 'CNPJ - Condomínio', razaoSocial: 'duplicado', locais: '[]', contatos: '[]' });
    await t.esperar(800);
    confere('salvar-entidade de novo com o mesmo CNPJ', (await lista(CAD, 'Entidades_Cadastradas', "{CPF_CNPJ}='00000000000353'")).length >= 1, dup);
    // apaga já o duplicado: senão o atualizar-cadastro (com razão) recusa o CNPJ repetido
    for (const extra of (await lista(CAD, 'Entidades_Cadastradas', "{Razao_Social_Nome}='duplicado'"))) await local('DELETE', `/v0/${CAD}/Entidades_Cadastradas/${extra.id}`);

    const atualizar = await t.copiaDeTeste('1UbdhChF8Pfse0of', { simulacoes: { ...SIM_CLIENTE, 'Grava cliente na Asaas': "return [{ json: { id: 'cus_teste_migracao' } }];" } });
    copias.push(atualizar);
    const ac = await chamar(atualizar.caminho, {
      id: ent.id, documento: '00000000000353', razaoSocial: 'TESTE MIGRACAO condominio (editado)', nomeFantasia: 'TESTE MIG', tipo: 'CNPJ - Condomínio',
      exigenciaFiscal: 'Apenas Recibo', emails: 'fin@exemplo.invalid', whatsappCnpj: '5547900000000', administradora: 'Adm Teste', empresaSindicos: '', status: 'Ativo', observacoes: '',
      locais: JSON.stringify([{ id: locs[0].id, nome: 'Endereço do CNPJ', endereco: 'RUA TESTE, 11, CEP 89200-000', bairroCidade: 'CENTRO / JOINVILLE - SC', acesso: 'portaria', status: 'Ativo' },
        { nome: 'Bloco 2', endereco: 'RUA TESTE, 12', bairroCidade: 'CENTRO / JOINVILLE - SC', acesso: '', status: 'Ativo' }]),
      contatos: JSON.stringify([{ id: cons[0].id, nome: 'Síndica Teste', cargo: 'Síndico', whatsapps: ['5547911111111'], emails: [], observacoes: 'trocou', status: 'Ativo' }]),
      locaisApagar: '', contatosApagar: '',
    });
    await t.esperar(1500);
    const ent2 = await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`);
    const locs2 = (await lista(CAD, 'Locais_Atendimento')).filter((l) => (l.fields.Cliente_Vinculado || [])[0] === ent.id);
    locs2.filter((l) => !apagar.some((a) => a[2] === l.id)).forEach((l) => apagar.push([CAD, 'Locais_Atendimento', l.id]));
    const con2 = await local('GET', `/v0/${CAD}/Contatos_Solicitantes/${cons[0].id}`);
    confere('atualizar-cadastro (cliente)', ac.ok === true && ent2.fields.Razao_Social_Nome === 'TESTE MIGRACAO condominio (editado)' && ent2.fields.Exigencia_Fiscal === 'Apenas Recibo' && ent2.fields.Administradora === 'Adm Teste' && !ent2.fields.Observacoes, { ac, f: ent2.fields });
    confere('atualizar-cadastro (altera um local e cria outro)', locs2.length === 2 && locs2.some((l) => l.fields.Endereco_Completo === 'RUA TESTE, 11, CEP 89200-000') && locs2.some((l) => l.fields.Nome_do_Local === 'Bloco 2'), locs2.map((l) => l.fields));
    confere('atualizar-cadastro (contato)', con2.fields.WhatsApps === '5547911111111' && !con2.fields.Emails && con2.fields.Observacoes === 'trocou', con2.fields);
    const novoLocal = locs2.find((l) => l.fields.Nome_do_Local === 'Bloco 2');
    await chamar(atualizar.caminho, {
      id: ent.id, documento: '00000000000353', razaoSocial: 'TESTE MIGRACAO condominio (editado)', nomeFantasia: 'TESTE MIG', tipo: 'CNPJ - Condomínio', exigenciaFiscal: 'Apenas Recibo',
      emails: 'fin@exemplo.invalid', whatsappCnpj: '5547900000000', administradora: 'Adm Teste', empresaSindicos: '', status: 'Ativo', observacoes: '',
      locais: JSON.stringify([{ id: locs[0].id, nome: 'Endereço do CNPJ', endereco: 'RUA TESTE, 11, CEP 89200-000', bairroCidade: 'CENTRO / JOINVILLE - SC', acesso: 'portaria', status: 'Ativo' }]),
      contatos: JSON.stringify([{ id: cons[0].id, nome: 'Síndica Teste', cargo: 'Síndico', whatsapps: ['5547911111111'], emails: [], observacoes: 'trocou', status: 'Ativo' }]),
      locaisApagar: novoLocal ? novoLocal.id : '', contatosApagar: '',
    });
    await t.esperar(1500);
    confere('atualizar-cadastro (apaga o local removido)', novoLocal && (await local('GET', `/v0/${CAD}/Locais_Atendimento/${novoLocal.id}`)).error !== undefined);

    const ex = await chamar('excluir-cadastro', { id: ent.id, locaisIds: locs[0].id, contatosIds: cons[0].id });
    await t.esperar(800);
    // Desde 28/10/2026 o contato não vai junto: continua no Cadastro de contatos, sem o cliente.
    const conDepois = await local('GET', `/v0/${CAD}/Contatos_Solicitantes/${cons[0].id}`);
    confere('excluir-cadastro (apaga cliente e local; contato fica, sem o cliente)', ex.ok === true && !(await lista(CAD, 'Entidades_Cadastradas', "{CPF_CNPJ}='00000000000353'")).length
      && (await local('GET', `/v0/${CAD}/Locais_Atendimento/${locs[0].id}`)).error !== undefined
      && !conDepois.error && !(conDepois.fields.Entidades_Vinculadas || []).length, { ex, conDepois });

    // ================= Pagar fatura por PIX e por boleto (Asaas simulado) =================
    for (const modo of ['PIX', 'Boleto']) {
      const cartao = await local('POST', `/v0/${FIN}/Cartoes`, { fields: { Nome: 'TESTE MIGRACAO cartao ' + modo, Chave_PIX: 'teste@exemplo.invalid', Tipo_Chave_PIX: 'EMAIL', Dia_Vencimento: 12, Ativo: true } });
      apagar.push([FIN, 'Cartoes', cartao.id]);
      const d = (await local('POST', `/v0/${FIN}/Despesas`, { records: [10, 20].map((v) => ({ fields: { Descricao: 'TESTE MIGRACAO fatura ' + modo, Valor: v, Vencimento: '2027-12-12', Status: 'Pendente', Forma_Pagamento: 'Cartão de crédito', Cartao_Ref: [cartao.id] } })) })).records;
      d.forEach((x) => apagar.push([FIN, 'Despesas', x.id]));
      const copia = modo === 'PIX'
        ? await t.copiaDeTeste('jCimCPy6ICIwOm4q', { simulacoes: { 'Consulta saldo Asaas': 'return [{ json: { balance: 1000000 } }];', 'Envia o PIX': "return [{ json: { id: 'tra_teste_migracao', status: 'PENDING' } }];" } })
        : await t.copiaDeTeste('FayraViYiF44HN6p', { simulacoes: { 'Consulta saldo Asaas': 'return [{ json: { balance: 1000000 } }];', 'Paga o boleto': "return [{ json: { id: 'bill_teste_migracao', status: 'PENDING' } }];" } });
      copias.push(copia);
      const pedido = { cartaoId: cartao.id, vencimentoFatura: '2027-12-12', valor: '35', valorCalculado: '30', ids: d.map((x) => x.id).join(',') };
      if (modo === 'Boleto') pedido.linhaDigitavel = '23793.38128 60000.000003 00000.000400 1 99990000003500';
      const pg = await chamar(copia.caminho, pedido);
      await t.esperar(800);
      const pags = (await lista(FIN, 'Pagamentos_Fatura')).filter((p) => (p.fields.Cartao_Ref || [])[0] === cartao.id);
      pags.forEach((p) => apagar.push([FIN, 'Pagamentos_Fatura', p.id]));
      const despDoCartao = (await lista(FIN, 'Despesas')).filter((x) => (x.fields.Cartao_Ref || [])[0] === cartao.id);
      despDoCartao.filter((x) => !d.some((y) => y.id === x.id)).forEach((x) => apagar.push([FIN, 'Despesas', x.id]));
      const dif = despDoCartao.find((x) => !d.some((y) => y.id === x.id));
      confere(`pagar fatura por ${modo}: comprovante gravado`, pg.ok === true && pags.length === 1 && pags[0].fields.Status === 'Enviado' && pags[0].fields.Metodo === modo
        && pags[0].fields.Valor === 35 && pags[0].fields.Valor_Calculado === 30 && pags[0].fields.Vencimento_Fatura === '2027-12-12' && /teste_migracao/.test(pags[0].fields.Asaas_Transfer_Id || ''), { pg, p: pags.map((p) => p.fields) });
      confere(`pagar fatura por ${modo}: despesas pagas e diferença lançada`, despDoCartao.filter((x) => d.some((y) => y.id === x.id)).every((x) => x.fields.Status === 'Pago') && dif && dif.fields.Valor === 5 && dif.fields.Status === 'Pago', despDoCartao.map((x) => x.fields));
      const deNovo = await chamar(copia.caminho, pedido);
      confere(`pagar fatura por ${modo}: não paga duas vezes`, deNovo.ok !== true && (await lista(FIN, 'Pagamentos_Fatura')).filter((p) => (p.fields.Cartao_Ref || [])[0] === cartao.id).length === 1, deNovo);
    }

    // ================= Gerar despesas das contas fixas (só a de teste) =================
    const rec = await local('POST', `/v0/${FIN}/Recorrentes`, { fields: { Descricao: 'TESTE MIGRACAO rec gerar', Valor: 10, Categoria: 'Outros', Forma_Pagamento: 'PIX', Dia_Do_Mes: 5, Restantes: 2, Ativo: true, Proxima_Geracao: '2026-10-05' } });
    apagar.push([FIN, 'Recorrentes', rec.id]);
    const gerar = await t.copiaDeTeste('1QcqoaGJKuiCTx91', { ajustar: (nodes) => t.trocarBusca(nodes, 'Busca as contas fixas', "{Descricao}='TESTE MIGRACAO rec gerar'") });
    copias.push(gerar);
    const gr = await chamar(gerar.caminho, {});
    await t.esperar(800);
    const geradas = (await lista(FIN, 'Despesas')).filter((x) => (x.fields.Recorrente_Ref || [])[0] === rec.id);
    geradas.forEach((x) => apagar.push([FIN, 'Despesas', x.id]));
    const rec2 = await local('GET', `/v0/${FIN}/Recorrentes/${rec.id}`);
    confere('gerar-recorrentes (cópia, só a conta de teste)', gr.ok === true && geradas.length >= 1 && geradas.every((x) => x.fields.Valor === 10) && rec2.fields.Proxima_Geracao > '2026-10-05', { gr, n: geradas.length, rec: rec2.fields });

    // ================= Configuração do Financeiro (linha de teste) =================
    const linha = await local('POST', `/v0/${FIN}/Config_Financeiro`, { fields: { Chave: 'teste-migracao', Saldo_Inicial: 1, Socio_1_Nome: 'Sócio A teste' } });
    apagar.push([FIN, 'Config_Financeiro', linha.id]);
    const cfg = await t.copiaDeTeste('FwwkYrUdHsBpJUhz', {
      ajustar: (nodes) => t.trocarBusca(nodes, 'Acha a linha principal', "{Chave} = 'teste-migracao'").map((n) => (n.name !== 'Monta a chamada' ? n
        : { ...n, parameters: { ...n.parameters, jsCode: n.parameters.jsCode.replace('Chave: "principal"', 'Chave: "teste-migracao"') } })),
    });
    copias.push(cfg);
    const sc = await chamar(cfg.caminho, { id: '', saldoInicial: '123.45', socio2Nome: 'Sócio B teste', aliquotaImposto: '6' });
    const linha2 = await local('GET', `/v0/${FIN}/Config_Financeiro/${linha.id}`);
    confere('salvar-config (cópia, linha de teste)', sc.ok === true && linha2.fields.Saldo_Inicial === 123.45 && linha2.fields.Socio_2_Nome === 'Sócio B teste'
      && linha2.fields.Socio_1_Nome === 'Sócio A teste' && linha2.fields.Aliquota_Imposto === 0.06 && linha2.fields.Chave === 'teste-migracao', { sc, f: linha2.fields });
  } finally {
    await t.esperar(1000);
    erros = await t.errosDesde(inicio);
    await t.apagarCopias(copias);
    for (const [b, tab, id] of apagar.reverse()) await local('DELETE', `/v0/${b}/${tab}/${id}`);
    if (backupOriginal) fs.writeFileSync(ARQ_BACKUP, backupOriginal);
    await t.sairEApagarUsuarioDeTeste();
    await t.esperar(1000);
    const depois = await t.contarTudo();
    confere('quantidades voltaram ao que eram', JSON.stringify(antes) === JSON.stringify(depois), { antes, depois });
    confere('linhas reais da configuração intactas', configReal === JSON.stringify(await lista(FIN, 'Config_Financeiro', "{Chave}='principal'")));
    confere('backup dos cadastros devolvido ao original', !backupOriginal || fs.readFileSync(ARQ_BACKUP).equals(backupOriginal));
    confere('n8n sem execuções com erro', erros.length === 0, erros);
    const restantes = (await t.n8n('GET', '/workflows?limit=100')).data.filter((w) => w.name.startsWith('TMP teste migracao'));
    confere('nenhuma cópia de teste sobrou no n8n', restantes.length === 0, restantes.map((w) => w.name));
    const p = t.placar();
    console.log(`\n${p.ok} ok, ${p.falhas} falha(s).`);
    process.exitCode = p.falhas ? 1 : 0;
  }
})();
