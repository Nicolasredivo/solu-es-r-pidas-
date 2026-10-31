// Regra de 30/10/2026: os e-mails dos contatos do cliente entram sempre também no campo
// E-mails (financeiro / NF-e), sem repetir e sem tirar nada. Vale no cliente novo, ao editar o
// cliente, ao ligar um contato pela tela do cliente e ao editar o contato no Cadastro de contatos.
// Só com clientes e contatos de teste (apagados no fim); Asaas simulado nas cópias.
// Uso: node banco/testes/testar-emails-contato-no-financeiro.js
const fs = require('fs');
const t = require('./comum');
const { CAD, local, chamar, confere } = t;

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const SIM_CLIENTE = {
  'Cria cliente na Asaas': "return [{ json: { id: 'cus_teste_migracao' } }];",
  'Grava cliente na Asaas': "return [{ json: { id: 'cus_teste_migracao' } }];",
  'Le notificacoes padrao': 'return [{ json: { data: [] } }];',
  'Ajusta notificacoes': 'return $input.all().map(() => ({ json: { ok: true } }));',
};
const cliente = async (id) => (await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${id}`)).fields || {};
const emailsDe = async (id) => String((await cliente(id)).Emails_Financeiro_NFE || '').split('\n').filter(Boolean);

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const apagar = []; // [tabela, id]
  const copias = [];

  try {
    await t.entrarComUsuarioDeTeste();

    // ---- cliente novo: financeiro + e-mails de dois contatos, um repetido com outra caixa ----
    const salvar = await t.copiaDeTeste('dFV53YYjsktzuEWw', { simulacoes: SIM_CLIENTE });
    copias.push(salvar);
    const se = await chamar(salvar.caminho, {
      documento: '00000000000515', tipo: 'CNPJ - Condomínio', razaoSocial: 'TESTE EMAILFIN condominio', nomeFantasia: '',
      exigenciaFiscal: '', emails: 'fin@exemplo.invalid', whatsappCnpj: '', administradora: '', empresaSindicos: '', status: 'Ativo', observacoes: '',
      locais: '[]',
      contatos: JSON.stringify([
        { nome: 'TESTE EMAILFIN A', cargo: '', whatsapps: [], emails: ['a@exemplo.invalid', 'FIN@exemplo.invalid'], observacoes: '', status: 'Ativo' },
        { nome: 'TESTE EMAILFIN B', cargo: '', whatsapps: [], emails: ['b@exemplo.invalid'], observacoes: '', status: 'Ativo' },
      ]),
    });
    await t.esperar(1500);
    const [ent] = await t.lista(CAD, 'Entidades_Cadastradas', "{CPF_CNPJ}='00000000000515'");
    if (ent) apagar.push(['Entidades_Cadastradas', ent.id]);
    const contatos = (await t.lista(CAD, 'Contatos_Solicitantes')).filter((c) => /^TESTE EMAILFIN/.test(c.fields.Nome_Contato || ''));
    contatos.forEach((c) => apagar.push(['Contatos_Solicitantes', c.id]));
    confere('cliente novo: respondeu ok', se.ok === true && Boolean(ent), se);
    confere('cliente novo: financeiro + e-mails dos contatos, sem repetir', JSON.stringify(await emailsDe(ent.id))
      === JSON.stringify(['fin@exemplo.invalid', 'a@exemplo.invalid', 'b@exemplo.invalid']), await emailsDe(ent.id));

    // ---- editar cliente: tiraram um e-mail do financeiro na tela; o do contato volta; contato com e-mail novo ----
    const atualizar = await t.copiaDeTeste('1UbdhChF8Pfse0of', { simulacoes: SIM_CLIENTE });
    copias.push(atualizar);
    const A = contatos.find((c) => c.fields.Nome_Contato === 'TESTE EMAILFIN A').id;
    const B = contatos.find((c) => c.fields.Nome_Contato === 'TESTE EMAILFIN B').id;
    const ac = await chamar(atualizar.caminho, {
      id: ent.id, documento: '00000000000515', razaoSocial: 'TESTE EMAILFIN condominio', nomeFantasia: '', tipo: 'CNPJ - Condomínio',
      exigenciaFiscal: '', emails: 'fin@exemplo.invalid\nb@exemplo.invalid', whatsappCnpj: '', administradora: '', empresaSindicos: '', status: 'Ativo', observacoes: '', locais: '[]',
      contatos: JSON.stringify([
        { id: A, nome: 'TESTE EMAILFIN A', cargo: '', whatsapps: [], emails: ['a@exemplo.invalid', 'a2@exemplo.invalid'], observacoes: '', status: 'Ativo' },
      ]),
      locaisApagar: '', contatosApagar: B,
    });
    await t.esperar(1500);
    confere('editar: respondeu ok', ac.ok === true, ac);
    confere('editar: e-mails do contato voltam e o do contato tirado (já na tela) fica', JSON.stringify(await emailsDe(ent.id))
      === JSON.stringify(['fin@exemplo.invalid', 'b@exemplo.invalid', 'a@exemplo.invalid', 'a2@exemplo.invalid']), await emailsDe(ent.id));
    confere('editar: os outros campos do cliente continuam', (await cliente(ent.id)).Razao_Social_Nome === 'TESTE EMAILFIN condominio');

    // ---- App - Contatos: ligar um contato salvo pela tela do cliente ----
    const C = (await local('POST', `/v0/${CAD}/Contatos_Solicitantes`, { fields: { Nome_Contato: 'TESTE EMAILFIN C', Emails: 'c@exemplo.invalid\nA@exemplo.invalid', Status: 'Ativo' } })).id;
    apagar.push(['Contatos_Solicitantes', C]);
    const vc = await chamar('contatos', { acao: 'vincularCliente', id: C, clienteId: ent.id });
    await t.esperar(1000);
    const cLigado = (await local('GET', `/v0/${CAD}/Contatos_Solicitantes/${C}`)).fields || {};
    confere('ligar contato: respondeu o contato', vc.ok === true && vc.contato && vc.contato.id === C, vc);
    confere('ligar contato: ficou ligado', JSON.stringify(cLigado.Entidades_Vinculadas) === JSON.stringify([ent.id]), cLigado);
    confere('ligar contato: e-mail dele entrou no financeiro, sem repetir', JSON.stringify(await emailsDe(ent.id))
      === JSON.stringify(['fin@exemplo.invalid', 'b@exemplo.invalid', 'a@exemplo.invalid', 'a2@exemplo.invalid', 'c@exemplo.invalid']), await emailsDe(ent.id));

    // ---- App - Contatos: editar o contato no Cadastro de contatos com e-mail novo ----
    const ec = await chamar('contatos', { acao: 'salvar', id: C, nome: 'TESTE EMAILFIN C', funcao: '', empresas: '[]', telefones: '[]', emails: JSON.stringify(['c3@exemplo.invalid']), observacoes: '' });
    await t.esperar(1000);
    confere('editar contato: respondeu o contato', ec.ok === true && ec.contato && ec.contato.emails.join() === 'c3@exemplo.invalid', ec);
    confere('editar contato: e-mail novo entrou no financeiro e nada saiu', JSON.stringify(await emailsDe(ent.id))
      === JSON.stringify(['fin@exemplo.invalid', 'b@exemplo.invalid', 'a@exemplo.invalid', 'a2@exemplo.invalid', 'c@exemplo.invalid', 'c3@exemplo.invalid']), await emailsDe(ent.id));

    // ---- salvar o contato de novo, sem mudança: não grava nada no cliente ----
    const antesDeRepetir = JSON.stringify(await cliente(ent.id));
    const rc = await chamar('contatos', { acao: 'salvar', id: C, nome: 'TESTE EMAILFIN C', funcao: '', empresas: '[]', telefones: '[]', emails: JSON.stringify(['c3@exemplo.invalid']), observacoes: '' });
    await t.esperar(1000);
    confere('salvar sem mudança: ok e cliente igual', rc.ok === true && JSON.stringify(await cliente(ent.id)) === antesDeRepetir);
  } finally {
    if (copias.length) await t.apagarCopias(copias);
    for (const [tabela, id] of apagar.filter((a) => a[0] === 'Contatos_Solicitantes')) await local('DELETE', `/v0/${CAD}/${tabela}/${id}`).catch(() => {});
    for (const [tabela, id] of apagar.filter((a) => a[0] !== 'Contatos_Solicitantes')) await local('DELETE', `/v0/${CAD}/${tabela}/${id}`).catch(() => {});
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
