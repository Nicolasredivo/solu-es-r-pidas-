// Testa chamados, agenda e atendimento, com cliente/local/contato de teste e chamados
// marcados para dezembro de 2027 (longe da agenda real: nada real é empurrado).
// Tudo é apagado no fim; confere quantidades e execuções com erro no n8n.
// Uso: node banco/testes/testar-fluxos-chamados.js
const fs = require('fs');
const t = require('./comum');
const { CAD, local, lista, chamar, confere } = t;

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const criados = { Visitas: [], Chamados: [], Contatos_Solicitantes: [], Locais_Atendimento: [], Entidades_Cadastradas: [] };
  const anexosCriados = [];
  await t.entrarComUsuarioDeTeste();
  try {
    const ent = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE MIGRACAO cliente', CPF_CNPJ: '00000000000272', Tipo_Documento: 'CNPJ - Condomínio', Status: 'Ativo' } });
    criados.Entidades_Cadastradas.push(ent.id);
    const loc = await local('POST', `/v0/${CAD}/Locais_Atendimento`, { fields: { Nome_do_Local: 'Endereço do CNPJ', Endereco_Completo: 'RUA TESTE, 1, CEP 89200-000', Bairro_Cidade: 'CENTRO / JOINVILLE - SC', Cliente_Vinculado: [ent.id], Status: 'Ativo' } });
    criados.Locais_Atendimento.push(loc.id);
    const con = await local('POST', `/v0/${CAD}/Contatos_Solicitantes`, { fields: { Nome_Contato: 'Contato Teste', Cargo_Funcao: 'Síndico', WhatsApps: '5547999999999', Emails: 'contato@exemplo.invalid', Entidades_Vinculadas: [ent.id], Status: 'Ativo' } });
    criados.Contatos_Solicitantes.push(con.id);

    // ---- criar chamado (com anexo pequeno) ----
    const anexo = { filename: 'teste-migracao.txt', contentType: 'text/plain', base64: Buffer.from('anexo de teste da migração').toString('base64') };
    const cc = await chamar('criar-chamado', {
      clienteId: ent.id, contatoId: con.id, localId: loc.id, tipoChamado: 'Atendimento', localExato: 'Casa de máquinas',
      descricaoSolicitacao: 'TESTE MIGRACAO chamado', observacoesServico: '', data: '', reservadoInicio: '', reservadoFim: '',
      horarioCombinadoCliente: '08:30', anexos: JSON.stringify([anexo]),
    });
    await t.esperar(1000);
    const [ch] = (await lista(CAD, 'Chamados', "{Descricao_Solicitacao}='TESTE MIGRACAO chamado'"));
    if (ch) criados.Chamados.push(ch.id);
    const maiorAntes = Math.max(0, ...(await lista(CAD, 'Chamados')).filter((c) => c.id !== (ch && ch.id)).map((c) => c.fields.Numero_Chamado || 0));
    confere('criar-chamado', cc.ok === true && ch && ch.fields.Cliente_Ref[0] === ent.id && ch.fields.Contato_Nome === 'Contato Teste'
      && ch.fields.Status === 'Aguardando confirmação de data' && ch.fields.Horario_Combinado_Cliente === '08:30' && ch.fields.Numero_Chamado === maiorAntes + 1,
      { cc, f: ch && ch.fields, maiorAntes });
    const anexos = (ch && ch.fields.Anexos) || [];
    anexos.forEach((a) => anexosCriados.push(a.id));
    confere('anexo guardado no PC', anexos.length === 1 && anexos[0].filename === 'teste-migracao.txt'
      && fs.existsSync('C:/Users/rediv/banco-solucoes/anexos/' + anexos[0].id), anexos);
    const entLida = await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`);
    confere('cliente mostra o chamado (lado mãe)', (entLida.fields.Chamados || [])[0] === ch.id, entLida.fields);

    // ---- editar chamado ----
    const ec = await chamar('editar-chamado', { chamadoId: ch.id, contatoId: con.id, localId: loc.id, localExato: 'Bloco B', descricaoSolicitacao: 'TESTE MIGRACAO chamado', horarioCombinadoCliente: '09:15', observacoesServico: 'obs do teste', anexosNovos: '[]' });
    const ch2 = await local('GET', `/v0/${CAD}/Chamados/${ch.id}`);
    confere('editar-chamado', ec.ok === true && ch2.fields.Local_Exato === 'Bloco B' && ch2.fields.Horario_Combinado_Cliente === '09:15' && ch2.fields.Observacoes_Servico === 'obs do teste', { ec, f: ch2.fields });

    // ---- agendar (reagendar-chamado) para 20/12/2027 08:00-10:00 ----
    const ag = await chamar('reagendar-chamado', { chamadoId: ch.id, data: '2027-12-20', dataFim: '2027-12-20', reservadoInicio: '08:00', reservadoFim: '10:00', statusAgendamento: 'confirmado' });
    const ch3 = await local('GET', `/v0/${CAD}/Chamados/${ch.id}`);
    confere('reagendar-chamado (agendar)', ag.ok === true && ch3.fields.Status === 'Agendado' && ch3.fields.Reservado_Inicio === '2027-12-20T11:00:00.000Z' && ch3.fields.Reservado_Fim === '2027-12-20T13:00:00.000Z', { ag, f: ch3.fields });
    const lch = await chamar('listar-chamados');
    confere('listar-chamados traz o agendado com anexo', lch.ok === true && (lch.comData || []).some((c) => c.id === ch.id && c.anexos.length === 1), { ok: lch.ok });
    const conf = await chamar('checar-conflito-chamado', { chamadoId: ch.id, data: '2027-12-20', reservadoInicio: '09:00', reservadoFim: '11:00' });
    confere('checar-conflito-chamado responde', conf && conf._status === undefined, conf);

    // ---- atendimento: iniciar, desfazer, iniciar de novo, concluir ----
    const ini = await chamar('atendimento', { acao: 'iniciar', chamadoId: ch.id, confirmarData: '' });
    const ch4 = await local('GET', `/v0/${CAD}/Chamados/${ch.id}`);
    let vis = (await lista(CAD, 'Visitas')).filter((v) => (v.fields.Chamado || [])[0] === ch.id);
    vis.forEach((v) => criados.Visitas.push(v.id));
    confere('atendimento: iniciar', ini.ok === true && ch4.fields.Status === 'Em andamento' && vis.length === 1 && vis[0].fields.Situacao === 'Em andamento'
      && new Date(ch4.fields.Reservado_Inicio) < new Date('2027-01-01') && JSON.parse(vis[0].fields.Reservado_Antes || '[]').length === 1, { ini, f: ch4.fields, vis: vis.map((v) => v.fields) });
    confere('chamado mostra a visita (lado mãe)', (ch4.fields.Visitas || [])[0] === (vis[0] && vis[0].id), ch4.fields.Visitas);
    const lat = await chamar('atendimento', { acao: 'listar' });
    confere('atendimento: listar mostra o iniciado', lat.ok === true && lat.visitas.some((v) => v.id === vis[0].id), lat);
    const des = await chamar('atendimento', { acao: 'desfazer', visitaId: vis[0].id });
    const ch5 = await local('GET', `/v0/${CAD}/Chamados/${ch.id}`);
    const visDepois = (await lista(CAD, 'Visitas')).filter((v) => (v.fields.Chamado || [])[0] === ch.id);
    confere('atendimento: desfazer volta o horário e apaga a visita', des.ok === true && ch5.fields.Status === 'Agendado' && ch5.fields.Reservado_Inicio === '2027-12-20T11:00:00.000Z' && visDepois.length === 0, { des, f: ch5.fields, n: visDepois.length });
    if (!visDepois.length) criados.Visitas = [];
    const ini2 = await chamar('atendimento', { acao: 'iniciar', chamadoId: ch.id, confirmarData: '' });
    vis = (await lista(CAD, 'Visitas')).filter((v) => (v.fields.Chamado || [])[0] === ch.id);
    vis.forEach((v) => criados.Visitas.push(v.id));
    const conc = await chamar('atendimento', { acao: 'concluir', visitaId: vis[0] && vis[0].id, resumo: 'Serviço de teste feito.', recebidoPor: 'Fulano Teste' });
    const ch6 = await local('GET', `/v0/${CAD}/Chamados/${ch.id}`);
    const v6 = vis[0] && await local('GET', `/v0/${CAD}/Visitas/${vis[0].id}`);
    confere('atendimento: iniciar de novo e concluir', ini2.ok === true && conc.ok === true && ch6.fields.Status === 'Concluído' && v6.fields.Situacao === 'Concluída'
      && v6.fields.Resumo === 'Serviço de teste feito.' && v6.fields.Recebido_Por === 'Fulano Teste' && !!v6.fields.Fim_Real, { conc, f: ch6.fields.Status, v: v6 && v6.fields });

    // ---- orçamento: finalizar, transformar em atendimento, cancelar ----
    const co = await chamar('criar-chamado', {
      clienteId: ent.id, contatoId: con.id, localId: loc.id, tipoChamado: 'Orçamento', localExato: '', descricaoSolicitacao: 'TESTE MIGRACAO orcamento',
      observacoesServico: '', data: '', reservadoInicio: '', reservadoFim: '', horarioCombinadoCliente: '', anexos: '[]',
    });
    const [orc] = await lista(CAD, 'Chamados', "{Descricao_Solicitacao}='TESTE MIGRACAO orcamento'");
    if (orc) criados.Chamados.push(orc.id);
    confere('criar-chamado (orçamento)', co.ok === true && orc && orc.fields.Tipo_Chamado === 'Orçamento', { co, f: orc && orc.fields });
    const fo = await chamar('editar-chamado', { chamadoId: orc.id, finalizarOrcamento: 'true', orcamentoValorMaterial: '100.5', orcamentoValorMaoDeObra: '200', orcamentoValorAproximado: '0', orcamentoFormaPagamento: 'PIX', orcamentoDetalhes: 'detalhe teste', localExato: '', descricaoSolicitacao: 'TESTE MIGRACAO orcamento', observacoesServico: '' });
    const orc2 = await local('GET', `/v0/${CAD}/Chamados/${orc.id}`);
    confere('editar-chamado (finalizar orçamento)', fo.ok === true && orc2.fields.Orcamento_Situacao === 'Finalizado' && orc2.fields.Orcamento_Valor_Material === 100.5 && orc2.fields.Orcamento_Valor_MaoDeObra === 200, { fo, f: orc2.fields });
    const tr = await chamar('reagendar-chamado', { chamadoId: orc.id, transformarEmAtendimento: 'true' });
    const orc3 = await local('GET', `/v0/${CAD}/Chamados/${orc.id}`);
    confere('reagendar-chamado (transformar em atendimento)', tr.ok === true && orc3.fields.Tipo_Chamado === 'Atendimento', { tr, f: orc3.fields.Tipo_Chamado });
    const ca = await chamar('reagendar-chamado', { chamadoId: orc.id, cancelar: 'true' });
    const orc4 = await local('GET', `/v0/${CAD}/Chamados/${orc.id}`);
    confere('reagendar-chamado (cancelar)', ca.ok === true && orc4.fields.Status === 'Cancelado', { ca, f: orc4.fields.Status });
  } finally {
    for (const tab of ['Visitas', 'Chamados', 'Contatos_Solicitantes', 'Locais_Atendimento', 'Entidades_Cadastradas']) {
      for (const id of criados[tab]) await local('DELETE', `/v0/${CAD}/${tab}/${id}`);
    }
    for (const a of anexosCriados) for (const ext of ['', '.json']) fs.rmSync('C:/Users/rediv/banco-solucoes/anexos/' + a + ext, { force: true });
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
