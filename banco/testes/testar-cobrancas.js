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
    confere('criar: multa 2%, juros 1%, pagável 30 dias depois', corpo.fine.value === 2 && corpo.interest.value === 1 && corpo.daysAfterDueDateToRegistrationCancellation === 30 && corpo.billingType === 'BOLETO', corpo);
    confere('criar: referência = id do A receber', /^rec[A-Za-z0-9]{14}$/.test(corpo.externalReference) && corpo.externalReference === cr.chamadas[0].ref.id, corpo);
    confere('criar: descrição "Referente à NFS-e de <hoje> (parcela 1 de 3): serviço", com telefone',
      corpo.description.startsWith('Referente à NFS-e de ' + hoje.split('-').reverse().join('/') + ' (parcela 1 de 3): Troca de boia da cisterna.')
      && /99208-1047 ou adm\.solucoes\.rapidas@gmail\.com/.test(corpo.description) && corpo.description.length <= 500, corpo.description);
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
    confere('ligar nota: descrição do boleto vira "Referente à NFS-e nº 9001 (parcela 1 de 3): ..."', lig.chamadas && lig.chamadas.length === 3
      && lig.chamadas[0].corpo.description.startsWith('Referente à NFS-e nº 9001 (parcela 1 de 3): Troca de boia da cisterna.')
      && lig.chamadas.every((ch) => ch.ref.tipo === 'descricao' && ch.ref.numero === '9001' && ch.metodo === 'POST'), lig);
    const ligOutro = await fn('cob_acao', { acao: 'ligar-nota', grupo, notaId: nota2 });
    confere('ligar nota de outro cliente: recusa', ligOutro.resposta && ligOutro.resposta.ok === false, ligOutro);
    await fn('cob_registrar', { contexto: lig.contexto, respostas: lig.chamadas.map((ch) => ({ ref: ch.ref, resposta: { id: 'x' } })) });
    const ligadas = await q(`select count(*)::int as n from "Recebimentos" where "Grupo" = $1 and "Nota_Ref" = $2`, [grupo, nota]);
    confere('ligar nota: as 3 parcelas apontam para a nota', ligadas[0].n === 3, ligadas);
    const evDesc = await q(`select count(*)::int as n from "Cobranca_Eventos" e join "Recebimentos" r on r.id = e."Recebimento_Ref" where r."Grupo" = $1 and e."Chave" like 'descricao:%:9001'`, [grupo]);
    confere('ligar nota: o Asaas aceitou a descrição nova -> fica anotado (não pede de novo)', evDesc[0].n === 3, evDesc);

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

    // ---------- ciclo do dono desde 21/11/2026: nota (ou recibo) primeiro, boleto depois, da MESMA conta ----------
    const nota5 = (await q(`insert into "Notas_Fiscais" ("Ambiente", "Serie", "Numero_DPS", "Status", "Numero_NFSe", "Cliente_Ref", "Tomador_Nome", "Descricao", "Valor", "Emissor", "Emitida_Em")
        values ('Testes', 999, (random() * 1000000)::int + 1, 'Emitida', '9005', $1, 'TESTE', 'Conserto da bomba. Valor total = R$ 300,00. Pagamento por boleto (vence x).', 300, 'CNPJ 2', now()) returning id`, [c1]))[0].id;
    ids.notas.push(nota5);
    const rn5 = (await fn('cob_acao', { acao: 'registrar-nota', notaId: nota5 })).resposta;
    confere('nota emitida antes: entra no A receber sem previsão', rn5.ok && rn5.id, rn5);
    const grupo3 = 'teste3-' + Date.now();
    const pedido5 = { acao: 'criar', grupo: grupo3, clienteId: c1, origem: 'nota', recebimentoId: rn5.id, servico: 'Conserto da bomba', parcelas: 2, vencimentos: [somaDias(hoje, 7), somaDias(hoje, 37)] };
    const cr5x = await fn('cob_acao', { ...pedido5, valor: 299 });
    confere('boleto da conta com outro valor: recusado', cr5x.resposta && cr5x.resposta.ok === false && /valor da conta/.test(cr5x.resposta.mensagem), cr5x);
    const cr5 = await fn('cob_acao', { ...pedido5, valor: 300 });
    confere('boleto nasce da conta da nota: 1ª parcela é a própria conta', cr5.chamadas && cr5.chamadas.length === 2 && cr5.chamadas[0].ref.id === rn5.id, cr5);
    confere('descrição já na criação: "Referente à NFS-e nº 9005 (parcela 1 de 2): ..."',
      cr5.chamadas[0].corpo.description.startsWith('Referente à NFS-e nº 9005 (parcela 1 de 2): Conserto da bomba.')
      && cr5.chamadas[1].corpo.description.startsWith('Referente à NFS-e nº 9005 (parcela 2 de 2)'), cr5.chamadas.map((x) => x.corpo.description));
    const linhas5 = await q(`select count(*)::int as n, sum("Valor")::numeric as v from "Recebimentos" where "Nota_Ref" = $1`, [nota5]);
    confere('a nota não conta em dobro: 2 parcelas somando R$ 300', linhas5[0].n === 2 && Number(linhas5[0].v) === 300, linhas5);
    const reg5 = await fn('cob_registrar', { contexto: cr5.contexto, respostas: cr5.chamadas.map((ch, i) => ({ ref: ch.ref,
      resposta: respostaPay('pay_testeC' + i + Date.now(), { value: ch.corpo.value, dueDate: ch.corpo.dueDate, description: ch.corpo.description }) })) });
    confere('boletos criados com link', reg5.resposta.ok && reg5.resposta.cobrancas.every((x) => x.link), reg5.resposta);
    const ev5 = await q(`select count(*)::int as n from "Cobranca_Eventos" where "Chave" in ($1, $2)`, ['descricao:' + reg5.resposta.cobrancas[0].id + ':9005', 'descricao:' + reg5.resposta.cobrancas[1].id + ':9005']);
    confere('número já veio na criação: a sincronização não pede de novo', ev5[0].n === 2, ev5);
    const cr5b = await fn('cob_acao', { ...pedido5, grupo: 'teste3b-' + Date.now(), valor: 150 });
    confere('a mesma conta não ganha outro boleto', cr5b.resposta && cr5b.resposta.ok === false, cr5b);
    // Recibo: entra no A receber na hora e o boleto diz "Referente ao recibo de <data>".
    const rec6 = (await q(`insert into "Arquivos_Cliente" ("Cliente_Ref", "Cliente_Nome", "Tipo", "Titulo", "Valor", "Emissor", "Origem")
        values ($1, 'TESTE COBRANCAS', 'recibo', 'TESTE recibo de limpeza', 120, 'CNPJ 2', 'gerado') returning id`, [c1]))[0].id;
    ids.arquivos = [rec6];
    const rr6 = (await fn('cob_acao', { acao: 'registrar-recibo', arquivoId: rec6 })).resposta;
    const rr6b = (await fn('cob_acao', { acao: 'registrar-recibo', arquivoId: rec6 })).resposta;
    confere('recibo entra no A receber na hora (e repetir não duplica)', rr6.ok && rr6.id && rr6b.existente === true && rr6b.id === rr6.id, [rr6, rr6b]);
    const cr6 = await fn('cob_acao', { acao: 'criar', grupo: 'teste4-' + Date.now(), clienteId: c1, origem: 'recibo', recebimentoId: rr6.id, servico: 'Limpeza', valor: 120, parcelas: 1, vencimentos: [somaDias(hoje, 7)] });
    confere('boleto do recibo: "Referente ao recibo de <hoje>"', cr6.chamadas && cr6.chamadas.length === 1
      && cr6.chamadas[0].corpo.description.startsWith('Referente ao recibo de ' + hoje.split('-').reverse().join('/') + ': Limpeza.'), cr6);
    await q(`delete from "Recebimentos" where "Arquivo_Ref" = $1`, [rec6]);

    // ---------- nota emitida fora da tela (chat): liga pelo link e põe o número na descrição pela sincronização ----------
    const grupo2 = 'teste2-' + Date.now();
    const vA = somaDias(hoje, 10), vB = somaDias(hoje, 40);
    const crB = await fn('cob_acao', { acao: 'criar', grupo: grupo2, clienteId: c1, origem: 'nota', servico: 'Limpeza de caixa', valor: 200, parcelas: 2, vencimentos: [vA, vB] });
    const regB = await fn('cob_registrar', { contexto: crB.contexto, respostas: crB.chamadas.map((ch, i) => ({ ref: ch.ref, resposta: respostaPay('pay_testeB' + i + Date.now(), { value: ch.corpo.value, dueDate: ch.corpo.dueDate }) })) });
    const [b1, b2] = regB.resposta.cobrancas;
    const nota4 = (await q(`insert into "Notas_Fiscais" ("Ambiente", "Serie", "Numero_DPS", "Status", "Numero_NFSe", "Cliente_Ref", "Tomador_Nome", "Descricao", "Valor", "Emissor", "Emitida_Em")
        values ('Testes', 999, (random() * 1000000)::int + 1, 'Emitida', '9004', $1, 'TESTE', $2, 200, 'CNPJ 2', now()) returning id`,
      [c1, 'Limpeza de caixa. Valor total = R$ 200,00. Pagamento em 2 boletos (vencimentos x e y). 1º boleto ou PIX: ' + b1.link + '. Os demais chegam por e-mail.']))[0].id;
    ids.notas.push(nota4);
    const kLig = (await q('select cob_ligar_por_link($1) as k', [nota4]))[0].k;
    confere('link do 1º boleto na nota liga as 2 parcelas do pedido', kLig === 2, kLig);
    confere('nota sem link de boleto não liga nada', (await q('select cob_ligar_por_link($1) as k', [nota2]))[0].k === 0);
    const grD = await fn('cob_sinc_gravar', { respostas: [] });
    const descB = (grD.chamadas || []).filter((ch) => ch.ref.tipo === 'descricao' && [b1.id, b2.id].includes(ch.ref.id));
    confere('sincronização pede a descrição "Referente à NFS-e nº 9004" das 2 parcelas', descB.length === 2
      && descB.some((ch) => ch.corpo.description.startsWith('Referente à NFS-e nº 9004 (parcela 2 de 2): Limpeza de caixa.')), grD.chamadas);
    const okB = descB.find((ch) => ch.ref.id === b1.id), erroB = descB.find((ch) => ch.ref.id === b2.id);
    await fn('cob_sinc_final', { respostas: [{ ref: okB.ref, resposta: { id: b1.asaasId, status: 'PENDING' } }, { ref: erroB.ref, resposta: { error: { message: '400 - teste' } } }] });
    const evB = await q(`select "Recebimento_Ref" as r, "Chave" as k from "Cobranca_Eventos" where "Recebimento_Ref" = any($1) and ("Chave" like 'descricao:%' or "Chave" like 'descricao-erro:%')`, [[b1.id, b2.id]]);
    confere('descrição aceita fica anotada; recusada vira aviso com data', evB.some((e) => e.r === b1.id && e.k === 'descricao:' + b1.id + ':9004')
      && evB.some((e) => e.r === b2.id && e.k === 'descricao-erro:' + b2.id + ':9004:' + hoje), evB);
    const b2Final = (await q(`select "Status", "Asaas_Status", "Aviso" from "Recebimentos" where id = $1`, [b2.id]))[0];
    confere('erro na descrição não mexe na cobrança (nem vira "pago por fora")', b2Final.Status === 'Pendente' && !/por fora/.test(b2Final.Aviso || ''), b2Final);
    const grD2 = await fn('cob_sinc_gravar', { respostas: [] });
    confere('não pede de novo a que deu certo, nem a que falhou hoje (tenta amanhã)', !(grD2.chamadas || []).some((ch) => ch.ref.tipo === 'descricao' && [b1.id, b2.id].includes(ch.ref.id)), grD2.chamadas);
    // PDF da nota na página do boleto (22/11/2026): só depois que a nota tem PDF; um envio por boleto.
    confere('nota ainda sem PDF: nada de anexo', !(grD2.chamadas || []).some((ch) => ch.ref.tipo === 'nf-pdf' && [b1.id, b2.id].includes(ch.ref.id)), grD2.chamadas);
    const attTeste = 'att' + require('crypto').randomBytes(16).toString('hex');
    await q(`update "Notas_Fiscais" set "Pdf_Nota" = $2::jsonb where id = $1`, [nota4, JSON.stringify([{ id: attTeste, url: '/webhook/anexo?id=' + attTeste, filename: 'NFS-e 9004.pdf', size: 10, type: 'application/pdf' }])]);
    const grP = await fn('cob_sinc_gravar', { respostas: [] });
    const pdfB = (grP.chamadas || []).filter((ch) => ch.ref.tipo === 'nf-pdf' && [b1.id, b2.id].includes(ch.ref.id));
    confere('com o PDF: pede ao Asaas o anexo nas 2 parcelas (POST /payments/<id>/documents, conta e arquivo certos)', pdfB.length === 2
      && pdfB.every((ch) => ch.metodo === 'POST' && ch.conta === 'CNPJ 2' && ch.anexo === attTeste && ch.ref.nota === nota4 && ch.ref.numero === '9004')
      && pdfB.some((ch) => ch.url === 'https://api.asaas.com/v3/payments/' + b1.asaasId + '/documents'), pdfB);
    const okP = pdfB.find((ch) => ch.ref.id === b1.id), erroP = pdfB.find((ch) => ch.ref.id === b2.id);
    await fn('cob_sinc_final', { respostas: [{ ref: okP.ref, resposta: { id: 'doc_teste', name: 'NFS-e 9004.pdf' } }, { ref: erroP.ref, resposta: { error: { message: '400 - teste' } } }] });
    const evP = await q(`select "Recebimento_Ref" as r, "Chave" as k, "Tipo" as t from "Cobranca_Eventos" where "Recebimento_Ref" = any($1) and "Chave" like 'nf-pdf%'`, [[b1.id, b2.id]]);
    confere('PDF aceito fica anotado; recusado vira aviso com data', evP.some((e) => e.r === b1.id && e.k === 'nf-pdf:' + b1.id + ':' + nota4 && e.t === 'nf-pdf')
      && evP.some((e) => e.r === b2.id && e.k === 'nf-pdf-erro:' + b2.id + ':' + nota4 + ':' + hoje), evP);
    const grP2 = await fn('cob_sinc_gravar', { respostas: [] });
    confere('não manda o PDF de novo (nem o que falhou hoje)', !(grP2.chamadas || []).some((ch) => ch.ref.tipo === 'nf-pdf' && [b1.id, b2.id].includes(ch.ref.id)), grP2.chamadas);
    await q(`delete from "Cobranca_Estado" where id = 'sinc:trava'`);

    // ---------- conta do Asaas nos dados de pagamento quando a chave PIX do CNPJ chega lá ----------
    // A decisão é uma função que não grava (cob_banco_novo); a linha real da empresa não é tocada no teste.
    const emp = { Codigo: 'CNPJ 1', CNPJ: '99.999.999/0001-91', Banco: '077 - Banco Inter', Agencia: '0001', Conta: '1-1', Chave_PIX: '99999999000191' };
    const decide = async (e, est) => (await q('select cob_banco_novo($1::jsonb, $2::jsonb, $3) as r', [JSON.stringify(e), JSON.stringify(est), '461 - Asaas I.P S.A']))[0].r;
    const estBase = { agencia: '0001', conta: '1234567-8', pix: false, pixChaves: [] };
    confere('sem chave PIX no Asaas: continua com o banco de antes', (await decide(emp, estBase)) === null);
    confere('outra chave (aleatória) não basta', (await decide(emp, { ...estBase, pix: true, pixChaves: [{ tipo: 'EVP', chave: 'abc-123' }] })) === null);
    confere('chave CNPJ de outro CNPJ não basta', (await decide(emp, { ...estBase, pix: true, pixChaves: [{ tipo: 'CNPJ', chave: '11111111000191' }] })) === null);
    confere('conta do Asaas ainda não lida: espera', (await decide(emp, { pix: true, pixChaves: [{ tipo: 'CNPJ', chave: '99999999000191' }] })) === null);
    const troca1 = await decide(emp, { ...estBase, pix: true, pixChaves: [{ tipo: 'CNPJ', chave: '99999999000191' }] });
    confere('chave do próprio CNPJ ativa: passa para a conta do Asaas', troca1 && troca1.Banco === '461 - Asaas I.P S.A' && troca1.Agencia === '0001'
      && troca1.Conta === '1234567-8' && troca1.Chave_PIX === '99999999000191', troca1);
    confere('linha que já é do Asaas não muda', (await decide({ ...emp, Banco: '461 - Asaas I.P S.A' }, { ...estBase, pixChaves: [{ tipo: 'CNPJ', chave: '99999999000191' }] })) === null);
    // A sincronização guarda as chaves e a agência/conta de cada conta (aqui numa conta de teste, que não existe na tabela).
    await fn('cob_sinc_gravar', { respostas: [
      { ref: { tipo: 'pix', conta: 'TESTE 9' }, resposta: { data: [{ type: 'CNPJ', key: '99999999000191', status: 'ACTIVE' }] } },
      { ref: { tipo: 'numero-conta', conta: 'TESTE 9' }, resposta: { agency: '0001', account: '1234567', accountDigit: '8' } }] });
    const est9 = (await q(`select "Valor" as v from "Cobranca_Estado" where id = 'conta:TESTE 9'`))[0];
    confere('sincronização guarda chaves PIX e agência/conta do Asaas', est9 && est9.v.pix === true && est9.v.conta === '1234567-8' && est9.v.agencia === '0001'
      && est9.v.pixChaves.length === 1 && est9.v.pixChaves[0].tipo === 'CNPJ', est9);
    const pa2 = (await fn('cob_acao', { acao: 'painel' })).resposta;
    confere('painel diz se as notas de cada conta já saem pelo Asaas', Object.values(pa2.contas).every((c) => typeof c.notasPeloAsaas === 'boolean'), Object.keys(pa2.contas));
    await q(`delete from "Cobranca_Estado" where id = 'sinc:trava'`);

    // ---------- e-mails pelo sistema (22/11/2026): criado, véspera, atraso a cada 3 dias, aviso dos 30 dias ----------
    await q(`delete from "Cobranca_Estado" where id = 'sinc:trava'`);
    await q(`insert into "Cobranca_Estado" (id, "Valor") values ('emails-sistema', jsonb_build_object('desde', now() - interval '1 hour'))
             on conflict (id) do update set "Valor" = excluded."Valor"`);
    const grupoE = 'testeE-' + Date.now();
    const vE1 = somaDias(hoje, 10), vE2 = somaDias(hoje, 40);
    const crE = await fn('cob_acao', { acao: 'criar', grupo: grupoE, clienteId: c1, origem: 'nota', servico: 'Pintura do hall', valor: 300, parcelas: 2, vencimentos: [vE1, vE2] });
    const regE = await fn('cob_registrar', { contexto: crE.contexto, respostas: crE.chamadas.map((ch, i) => ({ ref: ch.ref, resposta: respostaPay('pay_testeE' + i + Date.now(), { value: ch.corpo.value, dueDate: ch.corpo.dueDate }) })) });
    const attE = 'att' + require('crypto').randomBytes(16).toString('hex');
    const notaE = (await q(`insert into "Notas_Fiscais" ("Ambiente", "Serie", "Numero_DPS", "Status", "Numero_NFSe", "Cliente_Ref", "Tomador_Nome", "Descricao", "Valor", "Emissor", "Emitida_Em", "Pdf_Nota")
        values ('Testes', 999, (random() * 1000000)::int + 1, 'Emitida', '9007', $1, 'TESTE', 'Pintura do hall. Valor total = R$ 300,00.', 300, 'CNPJ 2', now(), $2::jsonb) returning id`,
      [c1, JSON.stringify([{ id: attE, filename: 'NFS-e 9007.pdf', type: 'application/pdf', size: 10 }])]))[0].id;
    ids.notas.push(notaE);
    await q(`update "Recebimentos" set "Nota_Ref" = $2 where "Grupo" = $1`, [grupoE, notaE]);
    const plE = await fn('cob_sinc_plano', { hora: 22 });
    const emE = (plE.lembretes || []).filter((l) => l.tipo === 'criado' && regE.resposta.cobrancas.some((c) => c.id === l.id));
    confere('boleto criado: um e-mail só para o pedido de 2 parcelas, mesmo fora do horário', emE.length === 1 && emE[0].emails.length === 2, plE.lembretes);
    const e0 = emE[0] || { anexos: [], html: '', assunto: '' };
    confere('e-mail do boleto: 2 boletos + a nota anexos, parcelas na tabela, nº da nota no assunto, contato novo',
      e0.anexos.length === 3 && e0.anexos.filter((a) => /^https:\/\/www\.asaas\.com\/b\/pdf\//.test(a.url)).length === 2
      && e0.anexos.some((a) => a.url === 'http://localhost:5678/webhook/anexo?id=' + attE && a.nome === 'NFS-e 9007.pdf')
      && /Parcela 1/.test(e0.html) && /Parcela 2/.test(e0.html) && /NFS-e nº 9007/.test(e0.assunto) && /99208-1047/.test(e0.html) && /adm\.solucoes\.rapidas@gmail\.com/.test(e0.html), e0);
    await fn('cob_sinc_final', { lembretes: [{ evento: e0.evento, tipo: 'criado', ok: true, quantos: 2, anexos: 3 }] });
    const evE = await q(`select "Tipo", "Texto" from "Cobranca_Eventos" where id = $1`, [e0.evento]);
    confere('enviado fica no histórico ("Boleto enviado por e-mail pelo sistema")', evE[0] && evE[0].Tipo === 'email-criado' && /3 anexo/.test(evE[0].Texto), evE);
    const plE2 = await fn('cob_sinc_plano', { hora: 10 });
    confere('o e-mail do boleto não sai de novo', !(plE2.lembretes || []).some((l) => l.tipo === 'criado' && regE.resposta.cobrancas.some((c) => c.id === l.id)), plE2.lembretes);
    await fn('cob_sinc_final', {});
    // Atraso: 4 dias depois do vencimento sai (1º, 4º, 7º...); 5 dias não; fora do horário não.
    const [pe1] = regE.resposta.cobrancas;
    await q(`update "Recebimentos" set "Vencimento" = $2, "Asaas_Status" = 'OVERDUE' where id = $1`, [pe1.id, somaDias(hoje, -4)]);
    const plA = await fn('cob_sinc_plano', { hora: 10 });
    const at = (plA.lembretes || []).find((l) => l.tipo === 'atraso' && l.id === pe1.id);
    confere('atraso: aviso no 4º dia, com boleto e nota anexos', at && /venceu em/.test(at.assunto) && at.anexos.length === 2 && /Consta em aberto/.test(at.html), plA.lembretes);
    await fn('cob_sinc_final', {});
    await q(`update "Recebimentos" set "Vencimento" = $2 where id = $1`, [pe1.id, somaDias(hoje, -5)]);
    const plA2 = await fn('cob_sinc_plano', { hora: 10 });
    confere('atraso: no 5º dia não sai', !(plA2.lembretes || []).some((l) => l.tipo === 'atraso' && l.id === pe1.id), plA2.lembretes);
    await fn('cob_sinc_final', {});
    await q(`update "Recebimentos" set "Vencimento" = $2 where id = $1`, [pe1.id, somaDias(hoje, -7)]);
    const plA3 = await fn('cob_sinc_plano', { hora: 21 });
    confere('atraso: fora do horário não sai (e não fica para depois)', !(plA3.lembretes || []).some((l) => l.tipo === 'atraso' && l.id === pe1.id), plA3.lembretes);
    await fn('cob_sinc_final', {});
    // 30 dias: aviso para o dono (só no sistema); data nova tira o aviso.
    await q(`update "Recebimentos" set "Vencimento" = $2 where id = $1`, [pe1.id, somaDias(hoje, -31)]);
    await fn('cob_sinc_plano', { hora: 10 });
    await fn('cob_sinc_final', {});
    const lim = (await q(`select "Aviso" from "Recebimentos" where id = $1`, [pe1.id]))[0];
    confere('30 dias: aviso "Venceu há mais de 30 dias..." para o dono', /^Venceu há mais de 30 dias/.test(lim.Aviso || ''), lim);
    const nvE = somaDias(hoje, 5);
    const prE = await fn('cob_acao', { acao: 'prorrogar', id: pe1.id, vencimento: nvE });
    await fn('cob_registrar', { contexto: prE.contexto, respostas: [{ ref: prE.chamadas[0].ref, resposta: { id: 'x', status: 'PENDING', dueDate: nvE } }] });
    const lim2 = (await q(`select "Aviso" from "Recebimentos" where id = $1`, [pe1.id]))[0];
    confere('data nova tira o aviso dos 30 dias', !lim2.Aviso, lim2);
    // Taxa do boleto pago vira gasto pago no Financeiro (o boleto p2 foi pago com taxa de R$ 2,98).
    const desp = await q(`select * from "Despesas" where "Servico_Ref" = $1 and "Categoria" = 'Taxas do Asaas'`, [p2.id]);
    confere('boleto pago: a taxa vira gasto "Taxas do Asaas", já pago', desp.length === 1 && Number(desp[0].Valor) === 2.98 && desp[0].Status === 'Pago' && /^Taxa do boleto · /.test(desp[0].Descricao), desp);
    await q(`select cob_despesa_taxa($1, $2::date)`, [p2.id, hoje]);
    confere('o gasto da taxa não duplica', (await q(`select count(*)::int as n from "Despesas" where "Servico_Ref" = $1`, [p2.id]))[0].n === 1);
    // Entradas: anotar com texto livre; transferência do próprio dono já vem anotada e nunca vira sugestão.
    const an = await fn('cob_acao', { acao: 'ignorar', conciliacaoId: concPix.id, texto: 'Pagamento antigo recebido no Inter' });
    const anRow = (await q(`select "Status", "Anotacao" from "Conciliacao" where id = $1`, [concPix.id]))[0];
    confere('anotar entrada: guarda o texto e sai da fila', an.resposta.ok && anRow.Status === 'anotado' && anRow.Anotacao === 'Pagamento antigo recebido no Inter', anRow);
    const tit = (await q(`select "Titular" from "Empresas_Emissoras" where "Codigo" = 'CNPJ 1'`))[0].Titular;
    await fn('cob_sinc_gravar', { respostas: [{ ref: { tipo: 'extrato', conta: 'CNPJ 2' }, resposta: { data: [
      { id: 'ft_teste_proprio' + Date.now(), type: 'PIX_TRANSACTION_CREDIT', value: 99, date: hoje, description: 'Transação via Pix - ' + tit }] } }], clientes: [] });
    const prop = (await q(`select "Status", "Anotacao", "Sugestao_Ref" from "Conciliacao" where "Transacao_Id" like 'ft:ft_teste_proprio%'`))[0];
    confere('PIX do próprio dono: fica para classificar, já anotado, sem sugestão', prop && prop.Status === 'sem-par' && /contas próprias/.test(prop.Anotacao || '') && !prop.Sugestao_Ref, prop);
    await q(`delete from "Cobranca_Estado" where id in ('sinc:trava', 'emails-sistema')`);

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
      await q(`delete from "Despesas" where "Categoria" = 'Taxas do Asaas' and "Servico_Ref" in (select id from "Recebimentos" where "Cliente_Ref" = any($1) or "Nota_Ref" = any($2) or "Asaas_Cobranca_Id" like 'pay_teste%')`, [ids.clientes, ids.notas]);
      await q(`delete from "Recebimentos" where "Cliente_Ref" = any($1) or "Nota_Ref" = any($2) or "Asaas_Cobranca_Id" like 'pay_teste%'`, [ids.clientes, ids.notas]);
      if (ids.notas.length) await q(`delete from "Notas_Fiscais" where id = any($1)`, [ids.notas]);
      if (ids.arquivos) await q(`delete from "Arquivos_Cliente" where id = any($1)`, [ids.arquivos]);
      if (ids.clientes.length) await q(`delete from "Entidades_Cadastradas" where id = any($1)`, [ids.clientes]);
      // O estado real volta como estava, menos o registro de uma troca de banco de verdade (se a chave PIX do CNPJ 1
      // chegar ao Asaas bem durante o teste, a troca vale e a cópia dos dados de antes não pode sumir).
      await q(`delete from "Cobranca_Estado" where id not like 'banco-antes:CNPJ %' and id not like 'banco-trocado:CNPJ %'`);
      for (const e of estadoAntes) await q(`insert into "Cobranca_Estado" (id, "Valor") values ($1, $2) on conflict (id) do nothing`, [e.id, JSON.stringify(e.Valor)]);
      const sobrou = await q(`select (select count(*) from "Entidades_Cadastradas" where "CPF_CNPJ" like '999999990%')::int as c, (select count(*) from "Recebimentos" where "Descricao" like '%TESTE%' or "Cliente_Nome" like 'TESTE%')::int as r`);
      confere('limpeza: nada de teste ficou no banco', sobrou[0].c === 0 && sobrou[0].r === 0, sobrou);
    } catch (e) { falhas++; console.log('ERRO na limpeza', e.message); }
    await db.end();
    console.log(`\n${ok} ok, ${falhas} falha(s)`);
    process.exitCode = falhas ? 1 : 0;
  }
})();
