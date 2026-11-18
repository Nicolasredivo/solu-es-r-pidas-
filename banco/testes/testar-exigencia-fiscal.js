// Chave "Nota fiscal / Apenas recibo" do cliente (18/11/2026): o "App - Exigencia fiscal" grava só
// Entidades_Cadastradas.Exigencia_Fiscal ("nota" → "Exige Nota Fiscal", "recibo" → "Apenas Recibo").
// Só com cliente de teste (apagado no fim).
// Uso: node banco/testes/testar-exigencia-fiscal.js
const fs = require('fs');
const t = require('./comum');
const { CAD, local, chamar, confere } = t;

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const DOC = '00000000000721';
const DOC_NOVO_RECIBO = '00000000000722';

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const copias = [];
  const apagarEnt = [];

  try {
    const ent = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: {
      CPF_CNPJ: DOC, Razao_Social_Nome: 'TESTE EXIGENCIA FISCAL', Status: 'Ativo', Exigencia_Fiscal: 'Exige Nota Fiscal', Gera_Boleto: true } });
    apagarEnt.push(ent.id);
    const ler = async () => (await local('GET', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`)).fields || {};

    await t.entrarComUsuarioDeTeste();
    const todos = (await t.n8n('GET', '/workflows?limit=250')).data;
    const idDe = (nome) => todos.find((w) => w.name === nome).id;
    const detalhe = await t.copiaDeTeste(idDe('App - Detalhe do cadastro')); copias.push(detalhe);
    const chave = await t.copiaDeTeste(idDe('App - Exigencia fiscal')); copias.push(chave);
    const salvar = await t.copiaDeTeste(idDe('App - Salvar entidade')); copias.push(salvar);
    const noDetalhe = async () => ((await chamar(detalhe.caminho, { id: ent.id })).cadastro || {}).exigenciaFiscal;

    // ---- passar para recibo ----
    let r = await chamar(chave.caminho, { id: ent.id, exigencia: 'recibo' });
    confere('recibo: ok, responde "Apenas Recibo" e mensagem', r.ok === true && r.exigenciaFiscal === 'Apenas Recibo' && /recibo/.test(r.mensagem || ''), r);
    confere('recibo: gravado no banco', (await ler()).Exigencia_Fiscal === 'Apenas Recibo');
    confere('detalhe devolve "Apenas Recibo"', (await noDetalhe()) === 'Apenas Recibo');
    const f = await ler();
    confere('o resto do cadastro não mudou', f.Razao_Social_Nome === 'TESTE EXIGENCIA FISCAL' && f.CPF_CNPJ === DOC && f.Status === 'Ativo' && f.Gera_Boleto === true, f);

    // ---- pedidos ruins não mexem ----
    r = await chamar(chave.caminho, { id: ent.id, exigencia: 'talvez' });
    confere('valor estranho: recusa e continua recibo', r.ok === false && (await ler()).Exigencia_Fiscal === 'Apenas Recibo', r);
    r = await chamar(chave.caminho, { id: ent.id });
    confere('sem valor: recusa e continua recibo', r.ok === false && (await ler()).Exigencia_Fiscal === 'Apenas Recibo', r);
    r = await chamar(chave.caminho, { id: 'nada', exigencia: 'nota' });
    confere('código inválido: recusa', r.ok === false, r);
    r = await chamar(chave.caminho, { id: 'recZZZZZZZZZZZZZZ', exigencia: 'nota' });
    confere('cliente que não existe: recusa', r.ok === false, r);

    // ---- voltar para nota ----
    r = await chamar(chave.caminho, { id: ent.id, exigencia: 'nota' });
    confere('nota: ok e responde "Exige Nota Fiscal"', r.ok === true && r.exigenciaFiscal === 'Exige Nota Fiscal' && /nota fiscal/.test(r.mensagem || ''), r);
    confere('nota: gravado no banco', (await ler()).Exigencia_Fiscal === 'Exige Nota Fiscal');

    // ---- cadastro novo pelo app com "Apenas Recibo" ----
    await chamar(salvar.caminho, {
      documento: DOC_NOVO_RECIBO, tipo: 'CNPJ - Empresa', razaoSocial: 'TESTE EXIGENCIA ' + DOC_NOVO_RECIBO, nomeFantasia: '',
      exigenciaFiscal: 'Apenas Recibo', emails: '', whatsappCnpj: '', administradora: '', empresaSindicos: '',
      status: 'Ativo', observacoes: '', locais: '[]', contatos: '[]', geraBoleto: 'nao',
    });
    await t.esperar(1500);
    const [novo] = await t.lista(CAD, 'Entidades_Cadastradas', `{CPF_CNPJ}='${DOC_NOVO_RECIBO}'`);
    if (novo) apagarEnt.push(novo.id);
    confere('cadastro novo nasce "Apenas Recibo"', novo && novo.fields.Exigencia_Fiscal === 'Apenas Recibo', novo);
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
