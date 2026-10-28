// Contato com várias empresas, de ponta a ponta, só com registros de teste:
// - "App - Contatos" grava e confere a lista de empresas (e ainda aceita o formato antigo, uma só);
// - "App - Atualizar cadastro" (em CÓPIA, Asaas simulado): tirar do cliente um contato que também
//   é de outra empresa só desfaz o vínculo; o que era só daquele cliente continua sendo apagado;
// - "App - Excluir cadastro": a mesma regra ao excluir o cliente inteiro.
// Guarda o backup dos cadastros antes e devolve igual no fim.
// Uso: node banco/testes/testar-contato-varias-empresas.js
const fs = require('fs');
const t = require('./comum');
const { CAD, local, lista, chamar, confere } = t;

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const SIM_CLIENTE = {
  'Grava cliente na Asaas': "return [{ json: { id: 'cus_teste_varias' } }];",
  'Le notificacoes padrao': 'return [{ json: { data: [] } }];',
  'Ajusta notificacoes': 'return $input.all().map(() => ({ json: { ok: true } }));',
};

const vinculos = async (id) => {
  const r = await local('GET', `/v0/${CAD}/Contatos_Solicitantes/${id}`);
  return r.error ? null : (r.fields.Entidades_Vinculadas || []);
};

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const empresas = [], contatos = [], copias = [];

  try {
    await t.entrarComUsuarioDeTeste();
    for (const nome of ['A', 'B', 'C']) {
      empresas.push(await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE VARIAS ' + nome, Status: 'Ativo' } }));
    }
    const [A, B, C] = empresas.map((e) => e.id);

    // ---- App - Contatos ----
    const novo = await chamar('contatos', { acao: 'salvar', nome: 'TESTE VARIAS Pessoa', telefones: '[]', emails: '[]', empresaIds: JSON.stringify([A, B, A]) });
    if (novo.contato) contatos.push(novo.contato.id);
    confere('salva contato com duas empresas (repetida entra uma vez)', novo.ok && JSON.stringify(await vinculos(novo.contato.id)) === JSON.stringify([A, B]), novo);
    const lst = await chamar('contatos', { acao: 'listar' });
    confere('listar devolve as duas empresas do contato', lst.ok && JSON.stringify((lst.contatos.find((c) => c.id === novo.contato.id) || {}).empresaIds) === JSON.stringify([A, B]));
    const ruim = await chamar('contatos', { acao: 'salvar', id: novo.contato.id, nome: 'X', telefones: '[]', emails: '[]', empresaIds: JSON.stringify([A, 'nao-e-id']) });
    confere('lista com código malformado é recusada', ruim.ok === false && /Empresa inválida/.test(ruim.mensagem), ruim);
    const sumida = await chamar('contatos', { acao: 'salvar', id: novo.contato.id, nome: 'X', telefones: '[]', emails: '[]', empresaIds: JSON.stringify([A, 'recNaoExiste00000']) });
    confere('lista com empresa que não existe é recusada', sumida.ok === false && /empresa/.test(sumida.mensagem), sumida);
    confere('recusas não mexeram nos vínculos', JSON.stringify(await vinculos(novo.contato.id)) === JSON.stringify([A, B]));
    const antigo = await chamar('contatos', { acao: 'salvar', nome: 'TESTE VARIAS Formato antigo', telefones: '[]', emails: '[]', empresaId: C });
    if (antigo.contato) contatos.push(antigo.contato.id);
    confere('formato antigo (uma empresa só) ainda funciona', antigo.ok && JSON.stringify(await vinculos(antigo.contato.id)) === JSON.stringify([C]), antigo);
    const tres = await chamar('contatos', { acao: 'salvar', id: novo.contato.id, nome: 'TESTE VARIAS Pessoa', telefones: '[]', emails: '[]', empresaIds: JSON.stringify([C, A, B]) });
    confere('editar troca a lista inteira de empresas', tres.ok && JSON.stringify(await vinculos(novo.contato.id)) === JSON.stringify([C, A, B]), tres);

    // ---- Atualizar cadastro (cópia, Asaas simulado): tirar contatos do cliente A ----
    const X = (await local('POST', `/v0/${CAD}/Contatos_Solicitantes`, { fields: { Nome_Contato: 'TESTE VARIAS X (A e B)', Entidades_Vinculadas: [A, B], Status: 'Ativo' } })).id;
    const Y = (await local('POST', `/v0/${CAD}/Contatos_Solicitantes`, { fields: { Nome_Contato: 'TESTE VARIAS Y (só A)', Entidades_Vinculadas: [A], Status: 'Ativo' } })).id;
    contatos.push(X, Y);
    const atualizar = await t.copiaDeTeste('1UbdhChF8Pfse0of', { simulacoes: SIM_CLIENTE });
    copias.push(atualizar);
    const ac = await chamar(atualizar.caminho, {
      id: A, documento: '', razaoSocial: 'TESTE VARIAS A', nomeFantasia: '', tipo: '', exigenciaFiscal: '', emails: '', whatsappCnpj: '',
      administradora: '', empresaSindicos: '', status: 'Ativo', observacoes: '', locais: '[]', contatos: '[]',
      locaisApagar: '', contatosApagar: [X, Y].join(','),
    });
    await t.esperar(1500);
    confere('atualizar-cadastro respondeu ok', ac.ok === true, ac);
    confere('contato de A e B tirado de A: continua, só com B', JSON.stringify(await vinculos(X)) === JSON.stringify([B]), await vinculos(X));
    // Desde 28/10/2026 tirar do cliente nunca apaga: o contato fica no Cadastro de contatos.
    confere('contato só de A tirado de A: continua existindo, sem cliente', JSON.stringify(await vinculos(Y)) === '[]', await vinculos(Y));

    // ---- Excluir cadastro (fluxo de verdade, só dados de teste): excluir o cliente B ----
    const W = (await local('POST', `/v0/${CAD}/Contatos_Solicitantes`, { fields: { Nome_Contato: 'TESTE VARIAS W (só B)', Entidades_Vinculadas: [B], Status: 'Ativo' } })).id;
    contatos.push(W);
    // a Pessoa está em C, A e B; o X está só em B agora
    const ex = await chamar('excluir-cadastro', { id: B, locaisIds: '', contatosIds: [novo.contato.id, X, W].join(',') });
    await t.esperar(800);
    confere('excluir-cadastro respondeu ok e o cliente sumiu', ex.ok === true && (await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${B}`)).error !== undefined, ex);
    confere('contato de outras empresas continua, sem o cliente excluído', JSON.stringify(await vinculos(novo.contato.id)) === JSON.stringify([C, A]), await vinculos(novo.contato.id));
    // Desde 28/10/2026 excluir o cliente nunca apaga contato: só desfaz o vínculo.
    confere('contatos que eram só do cliente excluído continuam, sem cliente',
      JSON.stringify(await vinculos(X)) === '[]' && JSON.stringify(await vinculos(W)) === '[]', { X: await vinculos(X), W: await vinculos(W) });
  } finally {
    if (copias.length) await t.apagarCopias(copias);
    for (const id of contatos) await local('DELETE', `/v0/${CAD}/Contatos_Solicitantes/${id}`).catch(() => {});
    for (const e of empresas) await local('DELETE', `/v0/${CAD}/Entidades_Cadastradas/${e.id}`).catch(() => {});
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
