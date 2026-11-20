// Testes da lógica das cobranças no banco (banco/cobrancas.sql), com o mesmo usuário do n8n (n8n_app).
// Usa só clientes, nota e cobranças de TESTE (apagados no fim) e um Asaas SIMULADO: as respostas do Asaas são
// montadas aqui, nada sai para a internet. O estado real (saldo, última sincronização) é guardado antes e devolvido.
// Uso: node banco/testes/testar-cobrancas.js
const fs = require('fs');
const { Client } = require('C:/Users/rediv/AppData/Roaming/npm/node_modules/n8n/node_modules/pg');
const seg = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8');
const pega = (rot) => (seg.match(new RegExp('^' + rot + ':\\s*(\\S+)', 'm')) || [])[1];
const db = new Client({ host: '127.0.0.1', port: 5432, database: 'solucoes', user: 'n8n_app', password: pega('senha do n8n') });

let ok = 0, falhas = 0;
function confere(nome, cond, detalhe) {
  if (cond) { ok++; console.log('ok    ', nome); } else { falhas++; console.log('FALHOU', nome, detalhe === undefined ? '' : JSON.stringify(detalhe).slice(0, 600)); }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const fn = async (nome, p) => (await q(`select ${nome}($1::jsonb) as r`, [JSON.stringify(p)]))[0].r;
const iso = (d) => d.toISOString().slice(0, 10);
const somaDias = (base, n) => { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const respostaPay = (id, extra = {}) => ({ id, status: 'PENDING', invoiceUrl: 'https://www.asaas.com/i/' + id.slice(4), bankSlipUrl: 'https://www.asaas.com/b/pdf/' + id.slice(4), customer: 'cus_teste_cob_1', value: 0, ...extra });

(async () => {
  await db.connect();
  const estadoAntes = await q(`select id, "Valor" from "Cobranca_Estado"`);
  const ids = { clientes: [], notas: [] };
  try {
    const hoje = (await q('select cob_hoje()::text as h'))[0].h;
    // ---------- preparação ----------
    const c1 = (await q(`insert into "Entidades_Cadastradas" ("CPF_CNPJ", "Razao_Social_Nome", "Nome_Fantasia_Identificador", "Exigencia_Fiscal", "Emails_Financeiro_NFE",
        "Status", "Asaas_Customer_Id", "Atendido_Por", "Asaas_Conta", "Gera_Boleto") values ('99999999000191', 'TESTE COBRANCAS LTDA', 'TESTE COBRANCAS', 'Exige Nota Fiscal',
        E'financeiro@example.com\nOutro@Example.com', 'Ativo', 'cus_teste_cob_1', 'CNPJ 2', 'CNPJ 2', true) returning id`))[0].id;
    const c2 = (await q(`insert into "Entidades_Cadastradas" ("CPF_CNPJ", "Razao_Social_Nome", "Exigencia_Fiscal", "Status", "Asaas_Customer_Id", "Atendido_Por", "Asaas_Conta", "Gera_Boleto")
        values ('99999999000272', 'TESTE COBRANCAS SEM BOLETO', 'Exige Nota Fiscal', 'Ativo', 'cus_teste_cob_2', 'CNPJ 1', 'CNPJ 1', false) returning id`))[0].id;
    ids.clientes.push(c1, c2);
    const nota = (await q(`insert into "Notas_Fiscais" ("Ambiente", "Serie", "Numero_DPS", "Status", "Numero_NFSe", "Cliente_Ref", "Tomador_Documento", "Tomador_Nome", "Descricao", "Valor", "Emissor", "Emitida_Em")
        values ('Testes', 999, (random() * 1000000)::int + 1, 'Emitida', '9001', $1, '99999999000191', 'TESTE COBRANCAS LTDA',
        'Troca de boia da cisterna. Valor material = R$ 406,00. Valor mão de obra = R$ 900,00. Valor total = R$ 1.306,00. Pagamento por boleto: https://www.asaas.com/i/x', 1306, 'CNPJ 2', now()) returning id`, [c1]))[0].id;
    const nota2 = (await q(`insert into "Notas_Fiscais" ("Ambiente", "Serie", "Numero_DPS", "Status", "Numero_NFSe", "Cliente_Ref", "Tomador_Documento", "Tomador_Nome", "Descricao", "Valor", "Emissor", "Emitida_Em")
        values ('Testes', 999, (random() * 1000000)::int + 1, 'Emitida', '9002', $1, '99999999000272', 'TESTE COBRANCAS SEM BOLETO',
        'Limpeza de caixa d''água. Valor total = R$ 450,00. Dados para pagamento - INTER', 450, 'CNPJ 1', now()) returning id`, [c2]))[0].id;
    ids.notas.push(nota, nota2);

    // ---------- conferir (preparar) ----------
    const v1 = somaDias(hoje, 7), v2 = somaDias(hoje, 37), v3 = somaDias(hoje, 67);
    const pre = await fn('cob_preparar', { clienteId: c1, valor: 1306, material: 406, parcelas: 3, vencimentos: [v1, v2, v3] });
    confere('preparar: pode gerar', pre.ok && pre.podeGerar, pre);
    confere('preparar: parcelas em centavos exatos', pre.parcelas.map((x) => Number(x.valor)).join('|') === '435.33|435.33|435.34', pre.parcelas);
    confere('preparar: material dividido junto', pre.parcelas.reduce((s, x) => s + Number(x.material), 0).toFixed(2) === '406.00', pre.parcelas);
    confere('preparar: e-mails do financeiro, sem repetir e em minúscula', JSON.stringify(pre.cliente.emails.sort()) === JSON.stringify(['financeiro@example.com', 'outro@example.com']), pre.cliente);
    confere('preparar: conta = CNPJ do cliente', pre.conta.codigo === 'CNPJ 2', pre.conta);
    const domingo = (() => { let d = somaDias(hoje, 7); while (new Date(d + 'T12:00:00Z').getUTCDay() !== 0) d = somaDias(d, 1); return d; })();
    const preDom = await fn('cob_preparar', { clienteId: c1, valor: 100, parcelas: 1, vencimentos: [domingo] });
    confere('preparar: domingo avisa e sugere o dia útil', preDom.avisos.some((a) => /não é dia útil/.test(a)) && preDom.parcelas[0].sugerido > domingo, preDom);
    const preSem = await fn('cob_preparar', { clienteId: c2, valor: 100, parcelas: 1, vencimentos: [v1] });
    confere('preparar: cliente sem "Gera boletos" não gera', preSem.podeGerar === false && preSem.problemas.some((x) => /Gera boletos/.test(x)), preSem);
    confere('preparar: cliente sem e-mail avisa', preSem.avisos.some((x) => /sem e-mail/.test(x)), preSem.avisos);
    const prePeq = await fn('cob_preparar', { clienteId: c1, valor: 12, parcelas: 3, vencimentos: [v1, v2, v3] });
    confere('preparar: boleto abaixo de R$ 5 recusado', prePeq.podeGerar === false, prePeq.problemas);
    const prePass = await fn('cob_preparar', { clienteId: c1, valor: 100, parcelas: 1, vencimentos: [somaDias(hoje, -1)] });
    confere('preparar: vencimento no passado recusado', prePass.podeGerar === false, prePass.problemas);

    // ---------- criar ----------
    const grupo = 'teste-' + Date.now();
    const cr = await fn('cob_acao', { acao: 'criar', grupo, clienteId: c1, origem: 'nota', servico: 'Troca de boia da cisterna', valor: 1306, material: 406, parcelas: 3, vencimentos: [v1, v2, v3] });
    confere('criar: pede 3 boletos ao Asaas', cr.chamadas && cr.chamadas.length === 3 && cr.chamadas.every((x) => x.metodo === 'POST' && x.conta === 'CNPJ 2'), cr);
    const corpo = cr.chamadas[0].corpo;
    confere('criar: multa 2%, juros 1%, pagável 20 dias depois', corpo.fine.value === 2 && corpo.interest.value === 1 && corpo.daysAfterDueDateToRegistrationCancellation === 20 && corpo.billingType === 'BOLETO', corpo);
    confere('criar: referência = id do A receber', /^rec[A-Za-z0-9]{14}$/.test(corpo.externalReference) && corpo.externalReference === cr.chamadas[0].ref.id, corpo);
    confere('criar: descrição com parcela e telefone', /Parcela 1 de 3/.test(corpo.description) && /99667-0900/.test(corpo.description) && corpo.description.length <= 500, corpo.description);
    const cr2 = await fn('cob_acao', { acao: 'criar', grupo, clienteId: c1, origem: 'nota', servico: 'x', valor: 1306, parcelas: 3, vencimentos: [v1, v2, v3] });
    confere('criar repetido (antes da resposta): procura no Asaas em vez de criar de novo', (cr2.chamadas || []).every((x) => x.metodo === 'GET' || x.metodo === 'POST'), cr2);
    const linhas = await q(`select count(*)::int as n from "Recebimentos" where "Grupo" = $1`, [grupo]);
    confere('criar repetido: não duplica linhas', linhas[0].n === 3, linhas);
    // Asaas responde: 2 criados, 1 recusado.
    const respostas = cr.chamadas.map((ch, i) => ({ ref: ch.ref, resposta: i < 2 ? respostaPay('pay_teste' + i + Date.now(), { value: ch.corpo.value, dueDate: ch.corpo.dueDate }) : { error: { message: '400 - {"errors":[{"code":"invalid","description":"Cliente inválido"}]}' } } }));
    const reg = await fn('cob_registrar', { contexto: cr.contexto, respostas });
    confere('registrar: devolve as cobranças com link', reg.resposta && reg.resposta.cobrancas.length === 3 && reg.resposta.cobrancas.filter((x) => x.link).length === 2, reg);
    confere('registrar: recusa vira aviso legível', reg.resposta.ok === false && /Cliente inválido/.test(reg.resposta.mensagem), reg.resposta.mensagem);
    // Tentar de novo a que falhou: procura pela referência e cria.
    const cr3 = await fn('cob_acao', { acao: 'criar', grupo, clienteId: c1, valor: 1306, parcelas: 3, vencimentos: [v1, v2, v3] });
    confere('tentar de novo: só a que falhou, procurando antes', cr3.chamadas.length === 1 && cr3.chamadas[0].metodo === 'GET' && /externalReference=/.test(cr3.chamadas[0].url), cr3);
    const reg3 = await fn('cob_registrar', { contexto: cr3.contexto, respostas: [{ ref: cr3.chamadas[0].ref, resposta: { data: [] } }] });
    confere('não achou na procura: cria numa segunda volta', reg3.chamadas && reg3.chamadas.length === 1 && reg3.chamadas[0].metodo === 'POST', reg3);
    const pay3 = 'pay_teste2' + Date.now();
    const reg4 = await fn('cob_registrar', { contexto: reg3.contexto, respostas: [{ ref: reg3.chamadas[0].ref, resposta: respostaPay(pay3, { value: 435.34, dueDate: v3 }) }] });
    confere('segunda volta: grupo completo', reg4.resposta.ok === true && reg4.resposta.cobrancas.every((x) => x.asaasId), reg4.resposta);
    const [p1, p2, p3] = reg4.resposta.cobrancas;

    // ---------- ligar nota ----------
    const lig = await fn('cob_acao', { acao: 'ligar-nota', grupo, notaId: nota });
    confere('ligar nota: descrição do boleto passa a citar a nota', lig.chamadas && lig.chamadas.length === 3 && /NFS-e nº 9001/.test(lig.chamadas[0].corpo.description), lig);
    const ligOutro = await fn('cob_acao', { acao: 'ligar-nota', grupo, notaId: nota2 });
    confere('ligar nota de outro cliente: recusa', ligOutro.resposta && ligOutro.resposta.ok === false, ligOutro);
    await fn('cob_registrar', { contexto: lig.contexto, respostas: lig.chamadas.map((ch) => ({ ref: ch.ref, resposta: { id: 'x' } })) });
    const ligadas = await q(`select count(*)::int as n from "Recebimentos" where "Grupo" = $1 and "Nota_Ref" = $2`, [grupo, nota]);
    confere('ligar nota: as 3 parcelas apontam para a nota', ligadas[0].n === 3, ligadas);

    // ---------- baixa, prorrogar, cancelar ----------
    const bx = await fn('cob_acao', { acao: 'baixa', id: p1.id, data: hoje, valor: 435.33, forma: 'PIX' });
    confere('baixa de boleto: pede receiveInCash ao Asaas', bx.chamadas && /receiveInCash$/.test(bx.chamadas[0].url) && bx.chamadas[0].corpo.notifyCustomer === false, bx);
    const bxr = await fn('cob_registrar', { contexto: bx.contexto, respostas: [{ ref: bx.chamadas[0].ref, resposta: { id: p1.asaasId, status: 'RECEIVED_IN_CASH' } }] });
    confere('baixa registrada', bxr.resposta.ok && bxr.resposta.item.status === 'Recebido' && bxr.resposta.item.baixaPor === 'manual', bxr.resposta);
    const bxFut = await fn('cob_acao', { acao: 'baixa', id: p2.id, data: somaDias(hoje, 2), valor: 10 });
    confere('baixa com data futura recusada', bxFut.resposta && bxFut.resposta.ok === false, bxFut);
    const nv = somaDias(hoje, 45);
    const pr = await fn('cob_acao', { acao: 'prorrogar', id: p2.id, vencimento: nv });
    confere('prorrogar: pede a data nova ao Asaas', pr.chamadas && pr.chamadas[0].corpo.dueDate === nv, pr);
    const prr = await fn('cob_registrar', { contexto: pr.contexto, respostas: [{ ref: pr.chamadas[0].ref, resposta: { id: p2.asaasId, status: 'PENDING' } }] });
    confere('prorrogar registrado', prr.resposta.ok && prr.resposta.item.vencimento === nv, prr.resposta);
    const ca = await fn('cob_acao', { acao: 'cancelar', id: p3.id });
    const car = await fn('cob_registrar', { contexto: ca.contexto, respostas: [{ ref: ca.chamadas[0].ref, resposta: { deleted: true, id: p3.asaasId } }] });
    confere('cancelar: DELETE no Asaas e conta cancelada', ca.chamadas[0].metodo === 'DELETE' && car.resposta.ok, car);
    const caDe = await fn('cob_acao', { acao: 'cancelar', id: p3.id });
    confere('cancelar de novo: avisa que já está cancelada', caDe.resposta && caDe.resposta.ok === false, caDe);

    // ---------- nota sem boleto ----------
    const rn = await fn('cob_acao', { acao: 'registrar-nota', notaId: nota2 });
    confere('nota sem boleto vira a receber sem previsão', rn.resposta.ok && rn.resposta.id, rn);
    const rnRow = (await q(`select * from "Recebimentos" where id = $1`, [rn.resposta.id]))[0];
    confere('nota sem boleto: sem vencimento, origem nota, CNPJ 1', rnRow.Vencimento === null && rnRow.Origem === 'nota' && rnRow.Emissor === 'CNPJ 1' && Number(rnRow.Valor) === 450, rnRow);
    const rn2 = await fn('cob_acao', { acao: 'registrar-nota', notaId: nota2 });
    confere('registrar a mesma nota de novo não duplica', rn2.resposta.existente === true, rn2);
    const rn3 = await fn('cob_acao', { acao: 'registrar-nota', notaId: nota });
    confere('nota com boleto já ligado não ganha outra conta', rn3.resposta.existente === true, rn3);

    // ---------- painel ----------
    const pa = (await fn('cob_acao', { acao: 'painel' })).resposta;
    const minhas = pa.recebimentos.filter((x) => x.clienteId === c1 || x.clienteId === c2);
    confere('painel: traz as cobranças de teste', minhas.length === 4, minhas.map((x) => x.status));
    confere('painel: nota de teste não aparece como "nota antiga sem conta"', !pa.notasSemConta.some((x) => x.id === nota || x.id === nota2), pa.notasSemConta.length);
    const hi = (await fn('cob_acao', { acao: 'historico', id: p2.id })).resposta;
    confere('histórico: criado, nota ligada e vencimento', ['criado', 'nota-ligada', 'vencimento'].every((t) => hi.eventos.some((e) => e.tipo === t)), hi.eventos.map((e) => e.tipo));

    // ---------- sincronização ----------
    // Estado real guardado; aqui o teste mexe só nas linhas de teste e devolve o resto no fim.
    await q(`delete from "Cobranca_Estado" where id = 'sinc:trava'`);
    const amanha = somaDias(hoje, 1);
    await q(`update "Recebimentos" set "Vencimento" = $2 where id = $1`, [p2.id, amanha]);
    const plano = await fn('cob_sinc_plano', { hora: 10 });
    confere('plano: trava e lista chamadas das duas contas', plano.ok && !plano.ocupado && plano.chamadas.filter((x) => x.ref.tipo === 'saldo').length === 2, plano.ocupado);
    confere('plano: pergunta o boleto aberto e se foi visto', plano.chamadas.some((x) => x.ref.tipo === 'pagamento' && x.ref.id === p2.id) && plano.chamadas.some((x) => x.ref.tipo === 'visto' && x.ref.id === p2.id), plano.chamadas.length);
    const meuLembrete = plano.lembretes.find((l) => l.id === p2.id);
    confere('plano: lembrete de véspera para quem vence amanhã', meuLembrete && /vence amanhã/.test(meuLembrete.assunto) && meuLembrete.emails.length === 2 && /Ver boleto e pagar/.test(meuLembrete.html), plano.lembretes);
    const plano2 = await fn('cob_sinc_plano', { hora: 10 });
    confere('plano: segunda sincronização ao mesmo tempo fica de fora', plano2.ocupado === true, plano2);
    // O Asaas responde: o boleto aberto foi pago (com taxa), foi visto, e apareceu um PIX direto do cliente 1.
    const resp = [
      { ref: { tipo: 'pagamento', id: p2.id }, resposta: { id: p2.asaasId, status: 'RECEIVED', value: 435.33, netValue: 432.35, paymentDate: hoje, billingType: 'BOLETO', dueDate: amanha } },
      { ref: { tipo: 'visto', id: p2.id }, resposta: { invoiceViewedDate: hoje + ' 09:15:00', boletoViewedDate: null } },
      { ref: { tipo: 'lista', conta: 'CNPJ 2' }, resposta: { data: [
        { id: 'pay_teste_ext' + Date.now(), status: 'PENDING', customer: 'cus_teste_cob_1', value: 99, dueDate: somaDias(hoje, 5), billingType: 'BOLETO', description: 'Feito à mão', fine: { value: 0 }, interest: { value: 0 } },
        { id: 'pay_teste_pix' + Date.now(), status: 'RECEIVED', customer: 'cus_teste_cob_1', value: 450, paymentDate: hoje, billingType: 'PIX' },
      ] } },
      { ref: { tipo: 'extrato', conta: 'CNPJ 1' }, resposta: { data: [{ id: 'ft_teste' + Date.now(), type: 'PIX_TRANSACTION_CREDIT', value: 450, date: hoje, description: 'Transação via Pix - FULANO TESTE' }] } },
    ];
    const gr = await fn('cob_sinc_gravar', { respostas: resp, clientes: [] });
    confere('gravar: rodou', gr.ok, gr);
    const p2depois = (await q(`select * from "Recebimentos" where id = $1`, [p2.id]))[0];
    confere('boleto pago: vira Recebido com taxa e líquido', p2depois.Status === 'Recebido' && Number(p2depois.Taxa) === 2.98 && Number(p2depois.Valor_Liquido) === 432.35 && p2depois.Baixa_Por === 'asaas', p2depois);
    confere('visto: guarda quando o cliente abriu', p2depois.Visto_Em !== null, p2depois.Visto_Em);
    const ext = await q(`select * from "Recebimentos" where "Asaas_Cobranca_Id" like 'pay_teste_ext%'`);
    confere('boleto feito direto no Asaas entra no A receber, com aviso de multa', ext.length === 1 && ext[0].Origem === 'asaas' && /sem multa/.test(ext[0].Aviso || ''), ext);
    // O PIX de R$ 450 do cliente 1 (CNPJ 2) não tem par no CNPJ 2: o A receber de 450 é do cliente 2, no CNPJ 1.
    const concs = await q(`select * from "Conciliacao" where "Transacao_Id" like 'pay:pay_teste_pix%' or "Transacao_Id" like 'ft:ft_teste%' order by "Transacao_Id"`);
    const concPix = concs.find((x) => x.Transacao_Id.startsWith('pay:'));
    const concFt = concs.find((x) => x.Transacao_Id.startsWith('ft:'));
    confere('entrada sem par na mesma conta fica "sem-par"', concPix && concPix.Status === 'sem-par', concPix);
    confere('PIX no CNPJ 1 de mesmo valor que a nota sem boleto: vira sugestão', concFt && concFt.Status === 'pendente' && concFt.Sugestao_Ref === rn.resposta.id && concFt.Confianca === 'media', concFt);
    // Conciliar a sugestão: dá baixa na nota sem boleto.
    const cc = await fn('cob_acao', { acao: 'conciliar', conciliacaoId: concFt.id, id: rn.resposta.id });
    confere('conciliar: nota sem boleto recebida pela entrada', cc.resposta && cc.resposta.ok && cc.resposta.item.status === 'Recebido' && cc.resposta.item.baixaPor === 'conciliacao', cc);
    // Entrada com certeza (mesmo cliente no Asaas e mesmo valor) dá baixa sozinha, inclusive num boleto aberto.
    const ext99 = ext[0];
    const gr2 = await fn('cob_sinc_gravar', { respostas: [{ ref: { tipo: 'lista', conta: 'CNPJ 2' }, resposta: { data: [
      { id: 'pay_teste_pix99' + Date.now(), status: 'RECEIVED', customer: 'cus_teste_cob_1', value: 99, paymentDate: hoje, billingType: 'PIX' }] } }], clientes: [] });
    const ext99d = (await q(`select * from "Recebimentos" where id = $1`, [ext99.id]))[0];
    confere('PIX do próprio cliente e mesmo valor: baixa sozinha', ext99d.Status === 'Recebido' && ext99d.Baixa_Por === 'conciliacao', ext99d);
    confere('e pede ao Asaas a baixa do boleto aberto (para os avisos pararem)', gr2.chamadas.length === 1 && /receiveInCash$/.test(gr2.chamadas[0].url), gr2.chamadas);
    // Final: lembrete enviado + baixa no Asaas; a trava é solta.
    const fi = await fn('cob_sinc_final', { lembretes: meuLembrete ? [{ evento: meuLembrete.evento, ok: true, quantos: 2 }] : [], respostas: [{ ref: gr2.chamadas[0].ref, resposta: { status: 'RECEIVED_IN_CASH' } }] });
    confere('final: lembrete registrado', fi.ok && fi.lembretes === (meuLembrete ? 1 : 0), fi);
    const plano3 = await fn('cob_sinc_plano', { hora: 10 });
    confere('depois do final, a próxima sincronização entra', plano3.ocupado === false, plano3.ocupado);
    confere('o lembrete do mesmo boleto e data não sai de novo', !plano3.lembretes.some((l) => l.id === p2.id), plano3.lembretes);
    await fn('cob_sinc_final', {});
    // Nota cancelada: a conta sem boleto é cancelada junto.
    const nota3 = (await q(`insert into "Notas_Fiscais" ("Ambiente", "Serie", "Numero_DPS", "Status", "Numero_NFSe", "Cliente_Ref", "Tomador_Nome", "Descricao", "Valor", "Emissor", "Emitida_Em")
        values ('Testes', 999, (random() * 1000000)::int + 1, 'Emitida', '9003', $1, 'TESTE', 'Serviço. Valor total = R$ 80,00.', 80, 'CNPJ 1', now()) returning id`, [c2]))[0].id;
    ids.notas.push(nota3);
    const rn4 = await fn('cob_acao', { acao: 'registrar-nota', notaId: nota3 });
    await q(`update "Notas_Fiscais" set "Status" = 'Cancelada' where id = $1`, [nota3]);
    await fn('cob_sinc_gravar', { respostas: [] });
    const rn4d = (await q(`select "Status" from "Recebimentos" where id = $1`, [rn4.resposta.id]))[0];
    confere('nota cancelada: a conta a receber dela é cancelada', rn4d.Status === 'Cancelado', rn4d);

    // ---------- segurança ----------
    const inv = await fn('cob_acao', { acao: 'apagar-tudo' });
    confere('ação desconhecida é recusada', inv.resposta && inv.resposta.ok === false, inv);
    const inj = await fn('cob_acao', { acao: 'criar', grupo: "x'; drop table x;--", clienteId: c1 });
    confere('grupo esquisito é recusado', inj.resposta && inj.resposta.ok === false, inj);
    const html = (await q(`select cob_email_lembrete(r) as h from "Recebimentos" r where id = $1`, [p2.id]))[0].h;
    await q(`update "Recebimentos" set "Cliente_Nome" = '<script>alert(1)</script>' where id = $1`, [p2.id]);
    const html2 = (await q(`select cob_email_lembrete(r) as h from "Recebimentos" r where id = $1`, [p2.id]))[0].h;
    confere('e-mail não leva HTML do nome do cliente', !/<script>/.test(html2) && /&lt;script&gt;/.test(html2) && html.length > 100, html2.slice(0, 200));
  } catch (e) {
    falhas++;
    console.log('ERRO', e.message);
  } finally {
    // Limpeza: tudo o que é de teste sai; o estado real volta como estava.
    try {
      await q(`delete from "Conciliacao" where "Transacao_Id" like 'pay:pay_teste%' or "Transacao_Id" like 'ft:ft_teste%'`);
      await q(`delete from "Recebimentos" where "Cliente_Ref" = any($1) or "Nota_Ref" = any($2) or "Asaas_Cobranca_Id" like 'pay_teste%'`, [ids.clientes, ids.notas]);
      if (ids.notas.length) await q(`delete from "Notas_Fiscais" where id = any($1)`, [ids.notas]);
      if (ids.clientes.length) await q(`delete from "Entidades_Cadastradas" where id = any($1)`, [ids.clientes]);
      await q(`delete from "Cobranca_Estado"`);
      for (const e of estadoAntes) await q(`insert into "Cobranca_Estado" (id, "Valor") values ($1, $2)`, [e.id, JSON.stringify(e.Valor)]);
      const sobrou = await q(`select (select count(*) from "Entidades_Cadastradas" where "CPF_CNPJ" like '999999990%')::int as c, (select count(*) from "Recebimentos" where "Descricao" like '%TESTE%' or "Cliente_Nome" like 'TESTE%')::int as r`);
      confere('limpeza: nada de teste ficou no banco', sobrou[0].c === 0 && sobrou[0].r === 0, sobrou);
    } catch (e) { falhas++; console.log('ERRO na limpeza', e.message); }
    await db.end();
    console.log(`\n${ok} ok, ${falhas} falha(s)`);
    process.exitCode = falhas ? 1 : 0;
  }
})();
