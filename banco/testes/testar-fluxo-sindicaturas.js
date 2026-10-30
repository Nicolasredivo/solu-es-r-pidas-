// Testa os fluxos "App - Sindicaturas" (ligada aos contatos pelo campo Empresas) e "App -
// Administradoras" (ligada aos clientes pelo campo Administradora, com e-mails), listar /
// salvar, só com registros de teste ("ZZ Teste ..."), apagados no fim. Os fluxos refazem o
// backup dos cadastros ao gravar: o arquivo é guardado antes e devolvido como estava.
// Uso: node banco/testes/testar-fluxo-sindicaturas.js
const fs = require('fs');
const { CAD, local, lista, chamar, entrarComUsuarioDeTeste, sairEApagarUsuarioDeTeste, confere, placar, contarTudo, errosDesde, esperar } = require('./comum');

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const chave = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const CADASTROS = [
  { webhook: 'sindicaturas', tabela: 'Sindicaturas', item: 'sindicatura', vinculo: 'contatos' },
  { webhook: 'administradoras', tabela: 'Administradoras', item: 'administradora', vinculo: 'clientes', comEmails: true },
];

// Quem é de cada nome, lido direto do banco: contatos (campo Empresas) ou clientes (Administradora).
async function ligadosNoBanco(vinculo) {
  if (vinculo === 'contatos') {
    return (await lista(CAD, 'Contatos_Solicitantes')).map((c) => ({ id: c.id, chaves: String(c.fields.Empresas || '').split('\n').map(chave) }));
  }
  return (await lista(CAD, 'Entidades_Cadastradas')).map((c) => ({ id: c.id, chaves: [chave(c.fields.Administradora)] }));
}

async function testar(cad, criados) {
  const { webhook, tabela, item, vinculo, comEmails } = cad;
  const t = (texto) => `[${webhook}] ${texto}`;
  const reaisAntes = await lista(CAD, tabela);
  confere(t('nenhum registro real tem nome de teste'), !reaisAntes.some((s) => /zz teste/i.test(s.fields.Nome || '')));

  // ---- acesso e entrada ----
  const semToken = await fetch('http://localhost:5678/webhook/' + webhook, { method: 'POST', body: new URLSearchParams({ acao: 'listar' }) }).then((r) => r.json());
  confere(t('sem login: acesso negado'), semToken.acessoNegado === true, semToken);
  const acaoRuim = await chamar(webhook, { acao: 'apagar-tudo' });
  confere(t('ação desconhecida é recusada'), acaoRuim.ok === false && /Ação inválida/.test(acaoRuim.mensagem), acaoRuim);
  const semNome = await chamar(webhook, { acao: 'salvar', nome: '   ' });
  confere(t('salvar sem nome é recusado'), semNome.ok === false && /nome/.test(semNome.mensagem), semNome);
  const soPontuacao = await chamar(webhook, { acao: 'salvar', nome: '...' });
  confere(t('salvar só com pontuação é recusado'), soPontuacao.ok === false, soPontuacao);

  // ---- listar: todas do banco, com quem é de cada uma ----
  const lst = await chamar(webhook, { acao: 'listar' });
  const ligados = await ligadosNoBanco(vinculo);
  const esperado = (nome) => ligados.filter((c) => c.chaves.includes(chave(nome))).map((c) => c.id).sort();
  confere(t('listar devolve todos os registros do banco'), lst.ok && lst[webhook].length === reaisAntes.length, lst);
  confere(t(`cada um vem com os ${vinculo} ligados a ele`), lst.ok && lst[webhook].every((s) =>
    JSON.stringify(s[vinculo].map((c) => c.id).sort()) === JSON.stringify(esperado(s.nome))), lst[webhook]);

  // ---- salvar: nome novo entra; repetido (outra grafia) é recusado ----
  const nome = 'ZZ Teste ' + item;
  const nova = await chamar(webhook, { acao: 'salvar', nome: '  ' + nome.replace(' ', '   ') + ' ',
    emails: JSON.stringify(['adm@exemplo.invalid', 'ADM@exemplo.invalid', 'outro@exemplo.invalid']) });
  if (nova[item]) criados.push([tabela, nova[item].id]);
  confere(t('salvar devolve o registro com o nome arrumado'), nova.ok && nova[item] && nova[item].nome === nome, nova);
  const noBanco = nova[item] && await local('GET', `/v0/${CAD}/${tabela}/${nova[item].id}`);
  confere(t('gravado no banco'), noBanco && noBanco.fields && noBanco.fields.Nome === nome, noBanco);
  if (comEmails) {
    confere(t('e-mails gravados (repetido com outra caixa entra uma vez)'), noBanco.fields.Emails === 'adm@exemplo.invalid\noutro@exemplo.invalid'
      && JSON.stringify(nova[item].emails) === JSON.stringify(['adm@exemplo.invalid', 'outro@exemplo.invalid']), { f: noBanco.fields, nova });
    const emailRuim = await chamar(webhook, { acao: 'salvar', nome: 'ZZ Teste Email Ruim', emails: '{x' });
    if (emailRuim.ok && emailRuim[item]) criados.push([tabela, emailRuim[item].id]);
    confere(t('lista de e-mails malformada é recusada'), emailRuim.ok === false && /E-mail inválido/.test(emailRuim.mensagem), emailRuim);

    // ---- editar: troca só os e-mails ----
    const editado = await chamar(webhook, { acao: 'editar', id: nova[item].id, nome: 'Outro nome',
      emails: JSON.stringify(['novo@exemplo.invalid', 'segundo@exemplo.invalid']) });
    let aposEditar = await local('GET', `/v0/${CAD}/${tabela}/${nova[item].id}`);
    confere(t('editar troca os e-mails e não mexe no nome'), editado.ok && aposEditar.fields.Emails === 'novo@exemplo.invalid\nsegundo@exemplo.invalid'
      && aposEditar.fields.Nome === nome && JSON.stringify(editado[item].emails) === JSON.stringify(['novo@exemplo.invalid', 'segundo@exemplo.invalid']), { editado, f: aposEditar.fields });
    const semEmails = await chamar(webhook, { acao: 'editar', id: nova[item].id, emails: '[]' });
    aposEditar = await local('GET', `/v0/${CAD}/${tabela}/${nova[item].id}`);
    confere(t('editar pode deixar sem e-mail'), semEmails.ok && !aposEditar.fields.Emails, aposEditar.fields);
    const fantasma = await chamar(webhook, { acao: 'editar', id: 'recFantasma0000000'.slice(0, 17), emails: '[]' });
    confere(t('editar registro que não existe é recusado'), fantasma.ok === false && /não existe/.test(fantasma.mensagem), fantasma);
    const semId = await chamar(webhook, { acao: 'editar', emails: '[]' });
    confere(t('editar sem id é recusado'), semId.ok === false && /inválida/.test(semId.mensagem), semId);
  }
  const repetida = await chamar(webhook, { acao: 'salvar', nome: nome.toUpperCase().replace('A', 'Á') + '.' });
  if (repetida.ok && repetida[item]) criados.push([tabela, repetida[item].id]);
  confere(t('nome repetido (acento, maiúscula, ponto) é recusado e mostra qual já existe'), repetida.ok === false && repetida.jaExiste === true
    && repetida[item] && repetida[item].id === (nova[item] || {}).id && /Já existe/.test(repetida.mensagem), repetida);

  // ---- quem tem o nome (em outra grafia) aparece nele ----
  let ligadoId = '';
  if (vinculo === 'contatos') {
    const pessoa = await chamar('contatos', { acao: 'salvar', nome: 'TESTE Empresa Pessoa', funcao: 'Síndico', telefones: '[]', emails: '[]',
      empresas: JSON.stringify([nome.toUpperCase(), 'ZZ Teste Outra Empresa']) });
    if (pessoa.contato) criados.push(['Contatos_Solicitantes', pessoa.contato.id]);
    ligadoId = (pessoa.contato || {}).id;
  } else {
    const cliente = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE ADM Cliente', Administradora: nome.toUpperCase() + '.', Status: 'Ativo' } });
    if (cliente.id) criados.push(['Entidades_Cadastradas', cliente.id]);
    ligadoId = cliente.id;
  }
  const lst2 = await chamar(webhook, { acao: 'listar' });
  const doTeste = (lst2[webhook] || []).find((s) => s.id === (nova[item] || {}).id);
  confere(t(`quem tem o nome (outra grafia) aparece em ${vinculo}`), doTeste && doTeste[vinculo].length === 1 && doTeste[vinculo][0].id === ligadoId, doTeste);
  confere(t('nome que não está cadastrado não aparece'), !(lst2[webhook] || []).some((s) => /outra empresa/i.test(s.nome)));
  await esperar(1500);
  const backupDepois = JSON.parse(fs.readFileSync(ARQ_BACKUP, 'utf8'));
  confere(t('backup dos cadastros inclui a tabela'), (backupDepois.tabelas[tabela] || []).some((s) => s.id === (nova[item] || {}).id));

  // ---- renomear e excluir: o nome muda (ou sai) também nos contatos e clientes ----
  const campoCliente = vinculo === 'contatos' ? 'Empresa_Sindicos' : 'Administradora';
  let clienteId = vinculo === 'clientes' ? ligadoId : '';
  if (!clienteId) {
    const cli = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE SIND Cliente', [campoCliente]: nome.toLowerCase(), Status: 'Ativo' } });
    criados.push(['Entidades_Cadastradas', cli.id]);
    clienteId = cli.id;
  }
  const outra = await chamar(webhook, { acao: 'salvar', nome: 'ZZ Teste outra ' + item, emails: '[]' });
  if (outra[item]) criados.push([tabela, outra[item].id]);
  const semIdR = await chamar(webhook, { acao: 'renomear', nome: 'x' });
  confere(t('renomear sem id é recusado'), semIdR.ok === false && /inválida/.test(semIdR.mensagem), semIdR);
  const paraRepetido = await chamar(webhook, { acao: 'renomear', id: nova[item].id, nome: 'zz teste OUTRA ' + item });
  confere(t('renomear para um nome que já existe é recusado'), paraRepetido.ok === false && paraRepetido.jaExiste === true, paraRepetido);
  const novoNome = 'ZZ Teste ' + item + ' renomeada';
  const ren = await chamar(webhook, { acao: 'renomear', id: nova[item].id, nome: novoNome });
  await esperar(500);
  const regRen = await local('GET', `/v0/${CAD}/${tabela}/${nova[item].id}`);
  const cliRen = await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${clienteId}`);
  confere(t('renomear troca o nome no cadastro'), ren.ok && regRen.fields.Nome === novoNome && /trocado/.test(ren.mensagem), { ren, f: regRen.fields });
  confere(t('renomear troca o nome no cliente'), cliRen.fields[campoCliente] === novoNome, cliRen.fields);
  if (vinculo === 'contatos') {
    const conRen = await local('GET', `/v0/${CAD}/Contatos_Solicitantes/${ligadoId}`);
    confere(t('renomear troca o nome no contato e mantém a outra empresa'), conRen.fields.Empresas === novoNome + '\nZZ Teste Outra Empresa', conRen.fields);
  }
  const lst3 = await chamar(webhook, { acao: 'listar' });
  const renomeada = (lst3[webhook] || []).find((s) => s.id === nova[item].id);
  confere(t('depois de renomear, quem usava continua ligado'), renomeada && renomeada[vinculo].some((p) => p.id === ligadoId), renomeada);

  const exc = await chamar(webhook, { acao: 'excluir', id: nova[item].id });
  await esperar(500);
  const regExc = await local('GET', `/v0/${CAD}/${tabela}/${nova[item].id}`);
  const cliExc = await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${clienteId}`);
  confere(t('excluir apaga o cadastro'), exc.ok && regExc.error !== undefined && /excluída/.test(exc.mensagem), { exc, regExc });
  confere(t('excluir tira o nome do cliente'), !cliExc.fields[campoCliente] && cliExc.fields.Razao_Social_Nome, cliExc.fields);
  if (vinculo === 'contatos') {
    const conExc = await local('GET', `/v0/${CAD}/Contatos_Solicitantes/${ligadoId}`);
    confere(t('excluir tira o nome do contato e mantém a outra empresa'), conExc.fields.Empresas === 'ZZ Teste Outra Empresa', conExc.fields);
  }
  const outraDepois = await local('GET', `/v0/${CAD}/${tabela}/${(outra[item] || {}).id}`);
  confere(t('excluir não mexe nos outros cadastros'), outraDepois.fields && outraDepois.fields.Nome === 'ZZ Teste outra ' + item, outraDepois);
  const excDeNovo = await chamar(webhook, { acao: 'excluir', id: nova[item].id });
  confere(t('excluir de novo é recusado'), excDeNovo.ok === false && /não existe/.test(excDeNovo.mensagem), excDeNovo);
}

(async () => {
  const inicio = new Date().toISOString();
  const antes = await contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const criados = []; // [tabela, id]

  try {
    await entrarComUsuarioDeTeste();
    for (const cad of CADASTROS) await testar(cad, criados);
  } finally {
    // Contatos e clientes de teste antes; os cadastros (sindicatura/administradora) depois.
    const ordem = (tabela) => (['Contatos_Solicitantes', 'Entidades_Cadastradas'].includes(tabela) ? 0 : 1);
    for (const [tabela, id] of [...criados].sort((a, b) => ordem(a[0]) - ordem(b[0]))) {
      await local('DELETE', `/v0/${CAD}/${tabela}/${id}`).catch(() => {});
    }
    await sairEApagarUsuarioDeTeste();
    await esperar(1500);
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
