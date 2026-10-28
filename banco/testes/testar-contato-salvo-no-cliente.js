// Contato já salvo escolhido no formulário do cliente (Adicionar e editar): tem que ser LIGADO
// ao cliente, não criado de novo. Roda em cópias do "Salvar entidade" e do "Atualizar
// cadastro", com o Asaas simulado, só com clientes e contatos de teste, apagados no fim.
// Uso: node banco/testes/testar-contato-salvo-no-cliente.js
const fs = require('fs');
const t = require('./comum');
const { CAD, local, lista, chamar, confere } = t;

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const SIM_CLIENTE = {
  'Cria cliente na Asaas': "return [{ json: { id: 'cus_teste_migracao' } }];",
  'Grava cliente na Asaas': "return [{ json: { id: 'cus_teste_migracao' } }];",
  'Le notificacoes padrao': 'return [{ json: { data: [] } }];',
  'Ajusta notificacoes': 'return $input.all().map(() => ({ json: { ok: true } }));',
};
const contato = async (id) => {
  const r = await local('GET', `/v0/${CAD}/Contatos_Solicitantes/${id}`);
  return r.error ? null : r.fields;
};

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const apagar = []; // [tabela, id]
  const copias = [];

  try {
    await t.entrarComUsuarioDeTeste();
    const outro = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE SALVO Outro cliente', Status: 'Ativo' } });
    apagar.push(['Entidades_Cadastradas', outro.id]);
    // P: contato salvo que já é de outro cliente; Q: contato salvo sem cliente.
    const P = (await local('POST', `/v0/${CAD}/Contatos_Solicitantes`, { fields: { Nome_Contato: 'TESTE SALVO P', WhatsApps: '5547911110000', Empresas: 'ZZ Teste Empresa', Entidades_Vinculadas: [outro.id], Status: 'Ativo' } })).id;
    const Q = (await local('POST', `/v0/${CAD}/Contatos_Solicitantes`, { fields: { Nome_Contato: 'TESTE SALVO Q', Status: 'Ativo' } })).id;
    apagar.push(['Contatos_Solicitantes', P], ['Contatos_Solicitantes', Q]);
    const totalAntes = (await lista(CAD, 'Contatos_Solicitantes')).length;

    // ---- cliente novo (Salvar entidade) com P escolhido + um contato novo ----
    const salvar = await t.copiaDeTeste('dFV53YYjsktzuEWw', { simulacoes: SIM_CLIENTE });
    copias.push(salvar);
    const se = await chamar(salvar.caminho, {
      documento: '00000000000434', tipo: 'CNPJ - Condomínio', razaoSocial: 'TESTE SALVO condominio', nomeFantasia: '',
      exigenciaFiscal: '', emails: '', whatsappCnpj: '', administradora: '', empresaSindicos: '', status: 'Ativo', observacoes: '',
      locais: '[]',
      contatos: JSON.stringify([
        { id: P, nome: 'TESTE SALVO P', cargo: 'Síndico', whatsapps: ['5547911110000'], emails: ['p@exemplo.invalid'], observacoes: 'da tela', status: 'Ativo' },
        { nome: 'TESTE SALVO Novo', cargo: '', whatsapps: [], emails: [], observacoes: '', status: 'Ativo' },
      ]),
    });
    await t.esperar(1500);
    const [ent] = await lista(CAD, 'Entidades_Cadastradas', "{CPF_CNPJ}='00000000000434'");
    if (ent) apagar.push(['Entidades_Cadastradas', ent.id]);
    const todos = await lista(CAD, 'Contatos_Solicitantes');
    todos.filter((c) => /^TESTE SALVO Novo/.test(c.fields.Nome_Contato || '')).forEach((c) => apagar.push(['Contatos_Solicitantes', c.id]));
    const p1 = await contato(P);
    confere('cliente novo: respondeu ok', se.ok === true && Boolean(ent), se);
    confere('cliente novo: contato escolhido não foi criado de novo', todos.filter((c) => c.fields.Nome_Contato === 'TESTE SALVO P').length === 1
      && todos.length === totalAntes + 1, { total: todos.length, totalAntes });
    confere('cliente novo: contato escolhido ficou ligado, sem perder o outro cliente', ent && JSON.stringify(p1.Entidades_Vinculadas) === JSON.stringify([outro.id, ent.id]), p1);
    confere('cliente novo: dados da tela gravados e empresa de trabalho mantida', p1.Cargo_Funcao === 'Síndico' && p1.Emails === 'p@exemplo.invalid'
      && p1.Observacoes === 'da tela' && p1.Empresas === 'ZZ Teste Empresa', p1);
    const novo = todos.find((c) => c.fields.Nome_Contato === 'TESTE SALVO Novo');
    confere('cliente novo: contato digitado à mão foi criado e ligado', novo && JSON.stringify(novo.fields.Entidades_Vinculadas) === JSON.stringify([ent.id]), novo && novo.fields);

    // ---- editar (Atualizar cadastro): escolhe Q, mantém P, e um id que sumiu ----
    const atualizar = await t.copiaDeTeste('1UbdhChF8Pfse0of', { simulacoes: SIM_CLIENTE });
    copias.push(atualizar);
    const sumido = (await local('POST', `/v0/${CAD}/Contatos_Solicitantes`, { fields: { Nome_Contato: 'TESTE SALVO Sumido', Status: 'Ativo' } })).id;
    await local('DELETE', `/v0/${CAD}/Contatos_Solicitantes/${sumido}`);
    const ac = await chamar(atualizar.caminho, {
      id: ent.id, documento: '00000000000434', razaoSocial: 'TESTE SALVO condominio', nomeFantasia: '', tipo: 'CNPJ - Condomínio',
      exigenciaFiscal: '', emails: '', whatsappCnpj: '', administradora: '', empresaSindicos: '', status: 'Ativo', observacoes: '', locais: '[]',
      contatos: JSON.stringify([
        { id: P, nome: 'TESTE SALVO P', cargo: 'Síndico', whatsapps: ['5547911110000'], emails: [], observacoes: 'editado', status: 'Ativo' },
        { id: Q, nome: 'TESTE SALVO Q', cargo: 'Zelador', whatsapps: ['5547922220000'], emails: [], observacoes: '', status: 'Ativo' },
        { id: sumido, nome: 'TESTE SALVO Sumido', cargo: '', whatsapps: [], emails: [], observacoes: '', status: 'Ativo' },
      ]),
      locaisApagar: '', contatosApagar: '',
    });
    await t.esperar(1500);
    const depoisEditar = await lista(CAD, 'Contatos_Solicitantes');
    depoisEditar.filter((c) => c.fields.Nome_Contato === 'TESTE SALVO Sumido').forEach((c) => apagar.push(['Contatos_Solicitantes', c.id]));
    const p2 = await contato(P), q2 = await contato(Q);
    confere('editar: respondeu ok', ac.ok === true, ac);
    confere('editar: contato escolhido ficou ligado e com os dados da tela', JSON.stringify(q2.Entidades_Vinculadas) === JSON.stringify([ent.id])
      && q2.Cargo_Funcao === 'Zelador' && q2.WhatsApps === '5547922220000', q2);
    confere('editar: contato que já era do cliente não ganhou vínculo repetido', JSON.stringify(p2.Entidades_Vinculadas) === JSON.stringify([outro.id, ent.id]) && p2.Observacoes === 'editado', p2);
    confere('editar: contato escolhido que foi excluído entra como novo', depoisEditar.filter((c) => c.fields.Nome_Contato === 'TESTE SALVO Sumido').length === 1);
    confere('editar: nenhum contato repetido', depoisEditar.filter((c) => /^TESTE SALVO [PQ]$/.test(c.fields.Nome_Contato || '')).length === 2);
  } finally {
    if (copias.length) await t.apagarCopias(copias);
    // Contatos primeiro, clientes depois.
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
