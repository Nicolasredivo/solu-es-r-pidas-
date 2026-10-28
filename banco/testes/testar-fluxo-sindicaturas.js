// Testa o fluxo "App - Sindicaturas" (webhook sindicaturas: listar / salvar) só com registros de
// teste ("ZZ Teste ..."), apagados no fim. O fluxo refaz o backup dos cadastros ao gravar: o
// arquivo é guardado antes e devolvido como estava.
// Uso: node banco/testes/testar-fluxo-sindicaturas.js
const fs = require('fs');
const { CAD, local, lista, chamar, entrarComUsuarioDeTeste, sairEApagarUsuarioDeTeste, confere, placar, contarTudo, errosDesde, esperar } = require('./comum');

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const chave = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const inicio = new Date().toISOString();
  const antes = await contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const sindicaturasCriadas = [], contatosCriados = [];

  try {
    await entrarComUsuarioDeTeste();
    const reaisAntes = await lista(CAD, 'Sindicaturas');
    confere('nenhuma sindicatura real tem nome de teste', !reaisAntes.some((s) => /zz teste/i.test(s.fields.Nome || '')));

    // ---- acesso e entrada ----
    const semToken = await fetch('http://localhost:5678/webhook/sindicaturas', { method: 'POST', body: new URLSearchParams({ acao: 'listar' }) }).then((r) => r.json());
    confere('sem login: acesso negado', semToken.acessoNegado === true, semToken);
    const acaoRuim = await chamar('sindicaturas', { acao: 'apagar-tudo' });
    confere('ação desconhecida é recusada', acaoRuim.ok === false && /Ação inválida/.test(acaoRuim.mensagem), acaoRuim);
    const semNome = await chamar('sindicaturas', { acao: 'salvar', nome: '   ' });
    confere('salvar sem nome é recusado', semNome.ok === false && /nome/.test(semNome.mensagem), semNome);
    const soPontuacao = await chamar('sindicaturas', { acao: 'salvar', nome: '...' });
    confere('salvar só com pontuação é recusado', soPontuacao.ok === false, soPontuacao);

    // ---- listar: todas do banco, com quem trabalha em cada uma ----
    const lst = await chamar('sindicaturas', { acao: 'listar' });
    const contatos = await lista(CAD, 'Contatos_Solicitantes');
    const esperado = (nome) => contatos.filter((c) => String(c.fields.Empresas || '').split('\n').map(chave).includes(chave(nome))).map((c) => c.id).sort();
    confere('listar devolve todas as sindicaturas do banco', lst.ok && lst.sindicaturas.length === reaisAntes.length, lst);
    confere('cada sindicatura vem com os contatos que trabalham nela', lst.ok && lst.sindicaturas.every((s) =>
      JSON.stringify(s.contatos.map((c) => c.id).sort()) === JSON.stringify(esperado(s.nome))), lst.sindicaturas);

    // ---- salvar: nome novo entra; repetido (outra grafia) é recusado ----
    const nova = await chamar('sindicaturas', { acao: 'salvar', nome: '  ZZ Teste   Sindicatura ' });
    if (nova.sindicatura) sindicaturasCriadas.push(nova.sindicatura.id);
    confere('salvar devolve a sindicatura com o nome arrumado', nova.ok && nova.sindicatura && nova.sindicatura.nome === 'ZZ Teste Sindicatura', nova);
    const noBanco = nova.sindicatura && await local('GET', `/v0/${CAD}/Sindicaturas/${nova.sindicatura.id}`);
    confere('sindicatura gravada no banco', noBanco && noBanco.fields && noBanco.fields.Nome === 'ZZ Teste Sindicatura', noBanco);
    const repetida = await chamar('sindicaturas', { acao: 'salvar', nome: 'zz teste sindicatúra.' });
    if (repetida.ok && repetida.sindicatura) sindicaturasCriadas.push(repetida.sindicatura.id);
    confere('nome repetido (acento, maiúscula, ponto) é recusado e mostra qual já existe', repetida.ok === false && repetida.jaExiste === true
      && repetida.sindicatura && repetida.sindicatura.id === (nova.sindicatura || {}).id && /Já existe/.test(repetida.mensagem), repetida);

    // ---- contato com o nome no campo Empresas aparece na sindicatura ----
    const pessoa = await chamar('contatos', { acao: 'salvar', nome: 'TESTE Sindicatura Pessoa', funcao: 'Síndico', telefones: '[]', emails: '[]',
      empresas: JSON.stringify(['ZZ TESTE SINDICATURA', 'ZZ Teste Outra Empresa']) });
    if (pessoa.contato) contatosCriados.push(pessoa.contato.id);
    const lst2 = await chamar('sindicaturas', { acao: 'listar' });
    const daTeste = (lst2.sindicaturas || []).find((s) => s.id === (nova.sindicatura || {}).id);
    confere('contato com o nome no campo Empresas aparece na sindicatura (outra grafia)', daTeste && daTeste.contatos.length === 1
      && daTeste.contatos[0].id === (pessoa.contato || {}).id && daTeste.contatos[0].funcao === 'Síndico', daTeste);
    confere('outra empresa do contato não vira sindicatura', !(lst2.sindicaturas || []).some((s) => /outra empresa/i.test(s.nome)));
    await esperar(1500);
    const backupDepois = JSON.parse(fs.readFileSync(ARQ_BACKUP, 'utf8'));
    confere('backup dos cadastros inclui as sindicaturas', (backupDepois.tabelas.Sindicaturas || []).some((s) => s.id === (nova.sindicatura || {}).id));
  } finally {
    for (const id of contatosCriados) await local('DELETE', `/v0/${CAD}/Contatos_Solicitantes/${id}`).catch(() => {});
    for (const id of sindicaturasCriadas) await local('DELETE', `/v0/${CAD}/Sindicaturas/${id}`).catch(() => {});
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
