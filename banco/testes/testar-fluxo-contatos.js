// Testa o fluxo "App - Contatos" (webhook contatos: listar / salvar / excluir) de ponta a ponta,
// só com registros de teste: uma empresa e um contato criados aqui e apagados no fim.
// O fluxo refaz o backup dos cadastros a cada gravação, então o arquivo é guardado antes e
// devolvido como estava no fim (senão o contato de teste ficaria em "apagados_do_sistema").
const fs = require('fs');
const { CAD, local, lista, chamar, sessao, entrarComUsuarioDeTeste, sairEApagarUsuarioDeTeste, confere, placar, contarTudo, errosDesde, esperar } = require('./comum');

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';

(async () => {
  const inicio = new Date().toISOString();
  const antes = await contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  let empresaTeste = null, contatoId = null;

  try {
    await entrarComUsuarioDeTeste();
    empresaTeste = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE CONTATOS LTDA', Status: 'Ativo' } });

    // ---- acesso e entrada ----
    const semToken = await fetch('http://localhost:5678/webhook/contatos', { method: 'POST', body: new URLSearchParams({ acao: 'listar' }) }).then((r) => r.json());
    confere('sem login: acesso negado', semToken.acessoNegado === true, semToken);
    const acaoRuim = await chamar('contatos', { acao: 'apagar-tudo' });
    confere('ação desconhecida é recusada', acaoRuim.ok === false && /Ação inválida/.test(acaoRuim.mensagem), acaoRuim);
    const semNome = await chamar('contatos', { acao: 'salvar', nome: '   ', telefones: '[]', emails: '[]' });
    confere('salvar sem nome é recusado', semNome.ok === false && /nome/.test(semNome.mensagem), semNome);
    const jsonRuim = await chamar('contatos', { acao: 'salvar', nome: 'TESTE', telefones: '{x', emails: '[]' });
    confere('lista de telefones malformada é recusada', jsonRuim.ok === false, jsonRuim);
    const empresaRuim = await chamar('contatos', { acao: 'salvar', nome: 'TESTE', telefones: '[]', emails: '[]', empresaId: "x' OR 1=1" });
    confere('código de empresa malformado é recusado', empresaRuim.ok === false && /Empresa inválida/.test(empresaRuim.mensagem), empresaRuim);
    const empresaSumida = await chamar('contatos', { acao: 'salvar', nome: 'TESTE', telefones: '[]', emails: '[]', empresaId: 'recNaoExiste000000'.slice(0, 17) });
    confere('empresa que não existe é recusada', empresaSumida.ok === false && /empresa/.test(empresaSumida.mensagem), empresaSumida);

    // ---- listar ----
    const lst = await chamar('contatos', { acao: 'listar' });
    const noBanco = await lista(CAD, 'Contatos_Solicitantes');
    const empresasNoBanco = await lista(CAD, 'Entidades_Cadastradas');
    confere('listar devolve todos os contatos do banco', lst.ok && lst.contatos.length === noBanco.length, { veio: lst.contatos && lst.contatos.length, banco: noBanco.length });
    confere('listar devolve todas as empresas', lst.ok && lst.empresas.length === empresasNoBanco.length, { veio: lst.empresas && lst.empresas.length, banco: empresasNoBanco.length });
    const um = noBanco[0];
    const doUm = lst.contatos.find((c) => c.id === um.id);
    confere('contato listado igual ao banco', doUm && doUm.nome === (um.fields.Nome_Contato || '') && doUm.funcao === (um.fields.Cargo_Funcao || '')
      && JSON.stringify(doUm.empresaIds) === JSON.stringify(um.fields.Entidades_Vinculadas || []), { doUm, um });
    confere('empresa de teste aparece com o nome', lst.empresas.some((e) => e.id === empresaTeste.id && e.razaoSocial === 'TESTE CONTATOS LTDA'));

    // ---- salvar novo, sem empresa ----
    const novo = await chamar('contatos', {
      acao: 'salvar', nome: '  TESTE  Contato  Migração ', funcao: 'Função de teste',
      telefones: JSON.stringify(['+55 (47) 99999-0000', '5547999990000']),
      emails: JSON.stringify(['Teste@exemplo.invalid', 'teste@exemplo.invalid', 'outro@exemplo.invalid']),
      observacoes: 'Nota de teste',
    });
    contatoId = novo.contato && novo.contato.id;
    confere('salvar novo devolve o contato', novo.ok && /^rec/.test(contatoId || ''), novo);
    let gravado = (await lista(CAD, 'Contatos_Solicitantes', `RECORD_ID()='${contatoId}'`))[0];
    const f = (gravado && gravado.fields) || {};
    confere('nome com espaços arrumados', f.Nome_Contato === 'TESTE Contato Migração', f.Nome_Contato);
    confere('telefone só com dígitos e sem repetido', f.WhatsApps === '5547999990000', f.WhatsApps);
    confere('e-mail repetido (outra caixa) entra uma vez só', f.Emails === 'Teste@exemplo.invalid\noutro@exemplo.invalid', f.Emails);
    confere('novo nasce Ativo, sem empresa, com função e nota', f.Status === 'Ativo' && !(f.Entidades_Vinculadas || []).length
      && f.Cargo_Funcao === 'Função de teste' && f.Observacoes === 'Nota de teste', f);

    await esperar(1500);
    const backupDepois = JSON.parse(fs.readFileSync(ARQ_BACKUP, 'utf8'));
    confere('backup dos cadastros foi refeito com o contato novo',
      (backupDepois.tabelas.Contatos_Solicitantes || []).some((c) => c.id === contatoId), backupDepois.feito_em);

    // ---- editar: liga na empresa de teste, troca função, tira e-mails ----
    const editado = await chamar('contatos', {
      acao: 'salvar', id: contatoId, nome: 'TESTE Contato Migração', funcao: 'Outra função',
      telefones: JSON.stringify(['5547999990000']), emails: '[]', empresaId: empresaTeste.id, observacoes: '',
    });
    confere('editar devolve ok', editado.ok && editado.contato.id === contatoId, editado);
    gravado = (await lista(CAD, 'Contatos_Solicitantes', `RECORD_ID()='${contatoId}'`))[0];
    confere('edição gravou empresa, função e tirou e-mails', JSON.stringify(gravado.fields.Entidades_Vinculadas) === JSON.stringify([empresaTeste.id])
      && gravado.fields.Cargo_Funcao === 'Outra função' && !gravado.fields.Emails && gravado.fields.Status === 'Ativo', gravado.fields);
    const vistaDaEmpresa = await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${empresaTeste.id}`);
    confere('contato aparece do lado da empresa (cadastro de clientes)', (vistaDaEmpresa.fields.Contatos_Solicitantes || []).includes(contatoId), vistaDaEmpresa.fields);
    const pelaEmpresa = await chamar('listar-contatos', { entidadeId: empresaTeste.id });
    confere('fluxo antigo listar-contatos (Criar chamado) acha o contato', pelaEmpresa.ok && pelaEmpresa.contatos.some((c) => c.id === contatoId), pelaEmpresa);

    // ---- tirar a empresa ----
    const semEmpresa = await chamar('contatos', { acao: 'salvar', id: contatoId, nome: 'TESTE Contato Migração', telefones: '[]', emails: '[]', empresaId: '' });
    gravado = (await lista(CAD, 'Contatos_Solicitantes', `RECORD_ID()='${contatoId}'`))[0];
    confere('dá para deixar sem empresa de novo', semEmpresa.ok && !(gravado.fields.Entidades_Vinculadas || []).length, gravado.fields);

    // ---- contato que não existe ----
    const fantasma = await chamar('contatos', { acao: 'salvar', id: 'recFantasma0000000'.slice(0, 17), nome: 'X', telefones: '[]', emails: '[]' });
    confere('editar contato que não existe é recusado (não cria outro)', fantasma.ok === false && /não existe/.test(fantasma.mensagem), fantasma);

    // ---- excluir ----
    const exc = await chamar('contatos', { acao: 'excluir', id: contatoId });
    confere('excluir devolve ok', exc.ok && exc.excluido === contatoId, exc);
    confere('contato sumiu do banco', !(await lista(CAD, 'Contatos_Solicitantes', `RECORD_ID()='${contatoId}'`)).length);
    if (exc.ok) contatoId = null;
    const exc2 = await chamar('contatos', { acao: 'excluir', id: exc.excluido });
    confere('excluir de novo é recusado', exc2.ok === false && /não existe/.test(exc2.mensagem), exc2);
  } finally {
    if (contatoId) await local('DELETE', `/v0/${CAD}/Contatos_Solicitantes/${contatoId}`);
    if (empresaTeste && empresaTeste.id) await local('DELETE', `/v0/${CAD}/Entidades_Cadastradas/${empresaTeste.id}`);
    await sairEApagarUsuarioDeTeste();
    await esperar(1500); // o backup é refeito logo depois da resposta: espera antes de devolver o arquivo
    if (backupAntes) fs.writeFileSync(ARQ_BACKUP, backupAntes);
  }

  const depois = await contarTudo();
  confere('nenhuma tabela mudou de tamanho', JSON.stringify(antes) === JSON.stringify(depois), { antes, depois });
  if (backupAntes) confere('backup dos cadastros voltou a ser o de antes', fs.readFileSync(ARQ_BACKUP).equals(backupAntes));
  const erros = await errosDesde(inicio);
  confere('nenhuma execução com erro no n8n', !erros.length, erros);
  const { ok, falhas } = placar();
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e); process.exitCode = 1; });
