// Chave "Gera boletos" do cliente (18/11/2026): coluna Entidades_Cadastradas.Gera_Boleto (padrão false).
// O "App - Gera boleto" grava só esse campo ("sim"/"nao"); detalhe e lista devolvem geraBoleto;
// cliente novo pelo "App - Salvar entidade" nasce desligado e liga só com geraBoleto "sim".
// Só com cliente de teste (apagado no fim); Asaas simulado nas cópias dos fluxos.
// Uso: node banco/testes/testar-gera-boleto.js   (precisa do Airtable local reiniciado depois da coluna nova)
const fs = require('fs');
const t = require('./comum');
const { CAD, local, chamar, confere } = t;

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const DOC = '00000000000718';
const DOC_NOVO_SIM = '00000000000719';
const DOC_NOVO_NAO = '00000000000720';

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const copias = [];
  const apagarEnt = [];

  try {
    // ---- cliente criado sem dizer nada: nasce desligado ----
    const ent = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { CPF_CNPJ: DOC, Razao_Social_Nome: 'TESTE GERA BOLETO', Status: 'Ativo' } });
    apagarEnt.push(ent.id);
    const ler = async (id = ent.id) => (await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${id}`)).fields || {};
    confere('cliente novo nasce sem gerar boleto', (await ler()).Gera_Boleto === undefined, await ler());

    await t.entrarComUsuarioDeTeste();
    const todos = (await t.n8n('GET', '/workflows?limit=250')).data;
    const idDe = (nome) => todos.find((w) => w.name === nome).id;
    const detalhe = await t.copiaDeTeste(idDe('App - Detalhe do cadastro')); copias.push(detalhe);
    const listar = await t.copiaDeTeste(idDe('App - Listar cadastros')); copias.push(listar);
    const chave = await t.copiaDeTeste(idDe('App - Gera boleto')); copias.push(chave);
    const salvar = await t.copiaDeTeste(idDe('App - Salvar entidade')); copias.push(salvar);

    const noDetalhe = async () => ((await chamar(detalhe.caminho, { id: ent.id })).cadastro || {}).geraBoleto;
    const naLista = async () => (((await chamar(listar.caminho, {})).cadastros || []).find((c) => c.id === ent.id) || {}).geraBoleto;
    confere('detalhe devolve false', (await noDetalhe()) === false, await noDetalhe());
    confere('lista devolve false', (await naLista()) === false, await naLista());

    // ---- ligar ----
    let r = await chamar(chave.caminho, { id: ent.id, geraBoleto: 'sim' });
    confere('ligar: ok, responde geraBoleto true e mensagem', r.ok === true && r.geraBoleto === true && /gera boletos/.test(r.mensagem || ''), r);
    confere('ligar: gravado no banco', (await ler()).Gera_Boleto === true);
    confere('detalhe devolve true', (await noDetalhe()) === true);
    confere('lista devolve true', (await naLista()) === true);
    const f = await ler();
    confere('o resto do cadastro não mudou', f.Razao_Social_Nome === 'TESTE GERA BOLETO' && f.CPF_CNPJ === DOC && f.Status === 'Ativo', f);

    // ---- pedidos ruins não mexem ----
    r = await chamar(chave.caminho, { id: ent.id, geraBoleto: 'talvez' });
    confere('valor estranho: recusa e continua ligado', r.ok === false && (await ler()).Gera_Boleto === true, r);
    r = await chamar(chave.caminho, { id: ent.id });
    confere('sem valor: recusa e continua ligado', r.ok === false && (await ler()).Gera_Boleto === true, r);
    r = await chamar(chave.caminho, { id: 'nada', geraBoleto: 'nao' });
    confere('código inválido: recusa', r.ok === false, r);
    r = await chamar(chave.caminho, { id: 'recZZZZZZZZZZZZZZ', geraBoleto: 'nao' });
    confere('cliente que não existe: recusa, sem criar nada', r.ok === false, r);

    // ---- desligar ----
    r = await chamar(chave.caminho, { id: ent.id, geraBoleto: 'nao' });
    confere('desligar: ok e responde false', r.ok === true && r.geraBoleto === false, r);
    confere('desligar: gravado no banco', (await ler()).Gera_Boleto === undefined);
    confere('detalhe volta a false', (await noDetalhe()) === false);

    // ---- cadastro novo pelo app ----
    const criar = async (doc, extra) => {
      const resp = await chamar(salvar.caminho, {
        documento: doc, tipo: 'CNPJ - Empresa', razaoSocial: 'TESTE GERA BOLETO ' + doc, nomeFantasia: '', exigenciaFiscal: '',
        emails: '', whatsappCnpj: '', administradora: '', empresaSindicos: '', status: 'Ativo', observacoes: '',
        locais: '[]', contatos: '[]', ...extra,
      });
      await t.esperar(1500);
      const [novo] = await t.lista(CAD, 'Entidades_Cadastradas', `{CPF_CNPJ}='${doc}'`);
      if (novo) apagarEnt.push(novo.id);
      return { resp, novo };
    };
    let c = await criar(DOC_NOVO_SIM, { geraBoleto: 'sim' });
    confere('cadastro novo com "sim": nasce gerando boleto', c.resp.ok === true && c.novo && c.novo.fields.Gera_Boleto === true, c);
    c = await criar(DOC_NOVO_NAO, { geraBoleto: 'nao' });
    confere('cadastro novo com "nao": nasce sem gerar', c.resp.ok === true && c.novo && c.novo.fields.Gera_Boleto === undefined, c);
  } finally {
    if (copias.length) await t.apagarCopias(copias);
    for (const id of apagarEnt) await local('DELETE', `/v0/${CAD}/Entidades_Cadastradas/${id}`).catch(() => {});
    await t.sairEApagarUsuarioDeTeste();
    await t.esperar(1500);
    if (backupAntes) fs.writeFileSync(ARQ_BACKUP, backupAntes);
  }

  const depois = await t.contarTudo();
  confere('nenhuma tabela mudou de tamanho', JSON.stringify(antes) === JSON.stringify(depois), { antes, depois });
  const erros = await t.errosDesde(inicio);
  confere('nenhuma execução com erro no n8n', !erros.length, erros);
  const { ok, falhas } = t.placar();
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e); process.exitCode = 1; });
