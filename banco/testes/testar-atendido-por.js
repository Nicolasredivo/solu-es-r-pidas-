// Dois CNPJs (08/11/2026), fase 1: cada cliente diz por qual CNPJ é atendido ("Atendido_Por").
// Cliente novo nasce no CNPJ 1; o detalhe devolve o valor; salvar troca só para CNPJ 1 ou CNPJ 2;
// app antigo (sem o campo) e valor estranho não mexem no que está gravado.
// Só com cliente de teste (apagado no fim); Asaas simulado nas cópias dos fluxos.
// Uso: node banco/testes/testar-atendido-por.js   (precisa do Airtable local reiniciado depois da coluna nova)
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
const DOC = '00000000000616';

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const copias = [];
  let ent = null;

  try {
    // ---- as duas empresas estão no banco e o Airtable local enxerga a tabela ----
    const emp = await t.lista(CAD, 'Empresas_Emissoras');
    confere('empresas emissoras: CNPJ 1 e CNPJ 2', JSON.stringify(emp.map((e) => e.fields.Codigo).sort()) === '["CNPJ 1","CNPJ 2"]', emp.map((e) => e.fields.Codigo));

    // ---- cliente novo, sem dizer o CNPJ: nasce no CNPJ 1 ----
    ent = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { CPF_CNPJ: DOC, Razao_Social_Nome: 'TESTE ATENDIDO POR', Status: 'Ativo' } });
    const gravado = async () => ((await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`)).fields || {}).Atendido_Por;
    confere('cliente novo nasce no CNPJ 1', (await gravado()) === 'CNPJ 1', await gravado());

    await t.entrarComUsuarioDeTeste();
    const todos = (await t.n8n('GET', '/workflows?limit=250')).data;
    const idDe = (nome) => todos.find((w) => w.name === nome).id;
    const detalhe = await t.copiaDeTeste(idDe('App - Detalhe do cadastro'));
    copias.push(detalhe);
    const atualizar = await t.copiaDeTeste(idDe('App - Atualizar cadastro'), { simulacoes: SIM_CLIENTE });
    copias.push(atualizar);
    const lerDetalhe = async () => ((await chamar(detalhe.caminho, { id: ent.id, documento: DOC })).cadastro || {}).atendidoPor;
    confere('detalhe devolve CNPJ 1', (await lerDetalhe()) === 'CNPJ 1', await lerDetalhe());

    const salvar = (extra) => chamar(atualizar.caminho, {
      id: ent.id, documento: DOC, razaoSocial: 'TESTE ATENDIDO POR', nomeFantasia: '', tipo: 'CNPJ - Empresa',
      exigenciaFiscal: '', emails: '', whatsappCnpj: '', administradora: '', empresaSindicos: '', status: 'Ativo', observacoes: '',
      locais: '[]', contatos: '[]', locaisApagar: '', contatosApagar: '', ...extra,
    });

    let r = await salvar({ atendidoPor: 'CNPJ 2' });
    await t.esperar(800);
    confere('trocar para CNPJ 2: ok e gravado', r.ok === true && (await gravado()) === 'CNPJ 2', { r, gravado: await gravado() });
    confere('detalhe devolve CNPJ 2', (await lerDetalhe()) === 'CNPJ 2');

    r = await salvar({});
    await t.esperar(800);
    confere('app antigo (sem o campo) não mexe: continua CNPJ 2', r.ok === true && (await gravado()) === 'CNPJ 2', { r, gravado: await gravado() });

    r = await salvar({ atendidoPor: 'CNPJ 3' });
    await t.esperar(800);
    confere('valor estranho é ignorado: continua CNPJ 2', r.ok === true && (await gravado()) === 'CNPJ 2', { r, gravado: await gravado() });

    r = await salvar({ atendidoPor: 'CNPJ 1' });
    await t.esperar(800);
    confere('voltar para CNPJ 1', r.ok === true && (await gravado()) === 'CNPJ 1', { r, gravado: await gravado() });
  } finally {
    if (copias.length) await t.apagarCopias(copias);
    if (ent) await local('DELETE', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`).catch(() => {});
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
