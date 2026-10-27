// Testa o backup único dos cadastros: refeito quando entra cliente novo (pelo fluxo, em
// cópia com o Asaas simulado), troca o arquivo anterior sem deixar outro, e guarda quem foi
// apagado do sistema. No fim devolve o arquivo de backup exatamente ao que era.
// Uso: node banco/testes/testar-backup-cadastros.js
const fs = require('fs');
const path = require('path');
const t = require('./comum');
const { CAD, local, lista, chamar, confere } = t;

const ARQ = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const PASTA = path.dirname(ARQ);
const lerBackup = () => JSON.parse(fs.readFileSync(ARQ, 'utf8'));
const arquivosDeBackup = () => fs.readdirSync(PASTA).filter((n) => n.startsWith('backup-cadastros'));
const TOKEN = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8').match(/^token do airtable local:\s*(\S+)/m)[1];
const refazerBackup = async () => (await fetch('http://127.0.0.1:5690/backup-cadastros', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN } })).json();

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const original = fs.readFileSync(ARQ);
  const feitoAntes = lerBackup().feito_em;
  let copia, entId;
  await t.entrarComUsuarioDeTeste();
  try {
    copia = await t.copiaDeTeste('dFV53YYjsktzuEWw', { simulacoes: {
      'Cria cliente na Asaas': "return [{ json: { id: 'cus_teste_migracao' } }];",
      'Le notificacoes padrao': 'return [{ json: { data: [] } }];',
      'Ajusta notificacoes': 'return $input.all().map(() => ({ json: { ok: true } }));',
    } });
    const se = await chamar(copia.caminho, {
      documento: '00000000000434', tipo: 'CNPJ - Empresa', razaoSocial: 'TESTE MIGRACAO backup', status: 'Ativo',
      locais: JSON.stringify([{ nome: 'Sede', endereco: 'RUA TESTE, 5', bairroCidade: 'CENTRO / JOINVILLE - SC', status: 'Ativo' }]),
      contatos: JSON.stringify([{ nome: 'Fulana Teste', cargo: 'Gerente', whatsapps: ['5547933333333'], emails: [], status: 'Ativo' }]),
    });
    let b = null;
    for (let i = 0; i < 20; i++) { await t.esperar(500); b = lerBackup(); if (b.feito_em !== feitoAntes) break; }
    const [ent] = await lista(CAD, 'Entidades_Cadastradas', "{CPF_CNPJ}='00000000000434'");
    entId = ent && ent.id;
    confere('cliente novo dispara o backup', se.ok === true && b.feito_em !== feitoAntes, { se, feito: b.feito_em });
    confere('backup novo já tem o cliente, o endereço e o contato', b.tabelas.Entidades_Cadastradas.some((r) => r.id === entId)
      && b.tabelas.Locais_Atendimento.some((r) => (r.fields.Cliente_Vinculado || [])[0] === entId)
      && b.tabelas.Contatos_Solicitantes.some((r) => (r.fields.Entidades_Vinculadas || []).includes(entId)));
    confere('backup tem os mesmos números do sistema', b.tabelas.Entidades_Cadastradas.length === antes.Entidades_Cadastradas + 1
      && b.tabelas.Locais_Atendimento.length === antes.Locais_Atendimento + 1 && b.tabelas.Contatos_Solicitantes.length === antes.Contatos_Solicitantes + 1);
    confere('um arquivo só (o anterior foi trocado)', JSON.stringify(arquivosDeBackup()) === '["backup-cadastros.json"]', arquivosDeBackup());

    const locId = b.tabelas.Locais_Atendimento.find((r) => (r.fields.Cliente_Vinculado || [])[0] === entId).id;
    const conId = b.tabelas.Contatos_Solicitantes.find((r) => (r.fields.Entidades_Vinculadas || []).includes(entId)).id;
    const ex = await chamar('excluir-cadastro', { id: entId, locaisIds: locId, contatosIds: conId });
    await t.esperar(800);
    confere('apagar cliente não refaz o backup (só cliente novo refaz)', ex.ok === true && lerBackup().feito_em === b.feito_em);

    const r2 = await refazerBackup(); // como se entrasse outro cliente
    const b2 = lerBackup();
    const ap = b2.apagados_do_sistema;
    confere('quem foi apagado continua no backup, em "apagados_do_sistema"', r2.ok === true
      && ap.Entidades_Cadastradas.some((r) => r.id === entId && r.apagadoNoSistemaEm && r.fields.Razao_Social_Nome === 'TESTE MIGRACAO backup')
      && ap.Locais_Atendimento.some((r) => r.id === locId) && ap.Contatos_Solicitantes.some((r) => r.id === conId)
      && !b2.tabelas.Entidades_Cadastradas.some((r) => r.id === entId), { r2, ap: Object.fromEntries(Object.entries(ap).map(([k, v]) => [k, v.length])) });
    const quando = ap.Entidades_Cadastradas.find((r) => r.id === entId).apagadoNoSistemaEm;
    await refazerBackup();
    const ap3 = lerBackup().apagados_do_sistema;
    confere('e continua nos backups seguintes, sem repetir', ap3.Entidades_Cadastradas.filter((r) => r.id === entId).length === 1
      && ap3.Entidades_Cadastradas.find((r) => r.id === entId).apagadoNoSistemaEm === quando);
    confere('ainda um arquivo só', JSON.stringify(arquivosDeBackup()) === '["backup-cadastros.json"]', arquivosDeBackup());
    confere('backup das 22h desligado (o app só não recebe resposta)', (await fetch('http://localhost:5678/webhook/fazer-backup', { method: 'POST' })).status === 404);
  } finally {
    await t.esperar(800);
    const erros = await t.errosDesde(inicio);
    if (copia) await copia.apagar().catch((e) => console.log('não apagou a cópia', e.message));
    for (const c of await lista(CAD, 'Entidades_Cadastradas', "{CPF_CNPJ}='00000000000434'")) await local('DELETE', `/v0/${CAD}/Entidades_Cadastradas/${c.id}`);
    fs.writeFileSync(ARQ, original); // o arquivo volta exatamente ao que era antes do teste
    await t.sairEApagarUsuarioDeTeste();
    await t.esperar(800);
    confere('arquivo de backup devolvido ao original', fs.readFileSync(ARQ).equals(original));
    confere('quantidades voltaram ao que eram', JSON.stringify(antes) === JSON.stringify(await t.contarTudo()));
    confere('n8n sem execuções com erro', erros.length === 0, erros);
    const p = t.placar();
    console.log(`\n${p.ok} ok, ${p.falhas} falha(s).`);
    process.exitCode = p.falhas ? 1 : 0;
  }
})();
