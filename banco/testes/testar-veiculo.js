// Aba Veículo (08/11/2026): fluxo "App - Veículo" (webhook "veiculo").
// carregar vazio, salvar (só campos conhecidos), anexar PDF (+ campos lidos), substituir,
// remover o PDF (os dados ficam), entrada inválida e acesso sem token.
// Só roda com a tabela Veiculos VAZIA (nunca mexe no veículo de verdade); apaga tudo no fim,
// inclusive os arquivos de PDF que o teste subiu.
// Uso: node banco/testes/testar-veiculo.js   (precisa do Airtable local reiniciado depois da tabela nova)
const fs = require('fs');
const path = require('path');
const t = require('./comum');
const { CAD, local, chamar, confere } = t;

const PASTA_ANEXOS = 'C:/Users/rediv/banco-solucoes/anexos';
// PDF mínimo válido, só para o teste (o conteúdo não importa ao fluxo).
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

(async () => {
  const antes = await t.contarTudo();
  if (antes.Veiculos !== 0) {
    console.log('PAREI: a tabela Veiculos já tem registro (dado de verdade). O teste só roda com ela vazia.');
    process.exitCode = 1;
    return;
  }
  const anexosAntes = new Set(fs.existsSync(PASTA_ANEXOS) ? fs.readdirSync(PASTA_ANEXOS) : []);
  try {
    // ---- sem token ----
    const semToken = await (await fetch('http://localhost:5678/webhook/veiculo', { method: 'POST', body: new URLSearchParams({ acao: 'carregar' }) })).json();
    confere('sem token: acesso negado', semToken.acessoNegado === true, semToken);

    await t.entrarComUsuarioDeTeste();

    let r = await chamar('veiculo', { acao: 'carregar' });
    confere('carregar com a tabela vazia: veiculo null', r.ok === true && r.veiculo === null, r);

    r = await chamar('veiculo', { acao: 'apagar-tudo' });
    confere('ação desconhecida: recusada', r.ok === false && /Ação inválida/.test(r.mensagem), r);

    r = await chamar('veiculo', { acao: 'salvar', campos: JSON.stringify({ Placa: 'TST0A00', Cor: '  TESTE  ', Campo_Que_Nao_Existe: 'x', Documento: [{ id: 'attfalso' }] }) });
    confere('salvar cria o registro', r.ok === true && r.veiculo && /^rec/.test(r.veiculo.id), r);
    confere('salvar: valores limpos', r.veiculo && r.veiculo.campos.Placa === 'TST0A00' && r.veiculo.campos.Cor === 'TESTE', r.veiculo);
    confere('salvar: campo estranho e Documento ignorados', r.veiculo && !('Campo_Que_Nao_Existe' in r.veiculo.campos) && r.veiculo.documento === null, r.veiculo);
    const id = r.veiculo && r.veiculo.id;

    r = await chamar('veiculo', { acao: 'salvar', campos: JSON.stringify({ Cor: 'BRANCA' }) });
    confere('salvar de novo altera o MESMO registro', r.ok && r.veiculo.id === id && r.veiculo.campos.Cor === 'BRANCA' && r.veiculo.campos.Placa === 'TST0A00', r.veiculo);
    confere('continua um registro só', (await t.lista(CAD, 'Veiculos')).length === 1);

    r = await chamar('veiculo', { acao: 'documento', arquivo: Buffer.from('não sou pdf').toString('base64'), nomeArquivo: 'x.pdf', campos: '{}' });
    confere('arquivo que não é PDF: recusado', r.ok === false && /PDF/.test(r.mensagem), r);

    r = await chamar('veiculo', { acao: 'documento', arquivo: PDF.toString('base64'), nomeArquivo: 'crlv teste.pdf', campos: JSON.stringify({ Chassi: '9BWTESTE000000000' }) });
    confere('anexar PDF: ok', r.ok === true && r.veiculo && r.veiculo.documento && r.veiculo.documento.nome === 'crlv teste.pdf', r);
    confere('anexar PDF: dados lidos gravados e os outros mantidos', r.veiculo && r.veiculo.campos.Chassi === '9BWTESTE000000000' && r.veiculo.campos.Placa === 'TST0A00', r.veiculo && r.veiculo.campos);
    const url1 = r.veiculo && r.veiculo.documento && r.veiculo.documento.url;
    confere('anexar PDF: endereço completo do anexo', /^http:\/\/localhost:5678\/webhook\/anexo\?id=att[0-9a-f]{32}$/.test(url1 || ''), url1);
    if (url1) {
      const baixado = Buffer.from(await (await fetch(url1)).arrayBuffer());
      confere('o PDF abre pelo endereço e é o mesmo arquivo', baixado.equals(PDF), baixado.length);
    }

    r = await chamar('veiculo', { acao: 'documento', arquivo: PDF.toString('base64'), nomeArquivo: 'crlv novo', campos: '{}' });
    const docs = ((await t.lista(CAD, 'Veiculos'))[0].fields.Documento || []);
    confere('substituir: fica só o PDF novo (com .pdf no nome)', r.ok && docs.length === 1 && docs[0].filename === 'crlv novo.pdf' && r.veiculo.documento.url !== url1, docs.map((d) => d.filename));

    r = await chamar('veiculo', { acao: 'remover-documento' });
    confere('remover: sem PDF e os dados continuam', r.ok && r.veiculo.documento === null && r.veiculo.campos.Placa === 'TST0A00', r.veiculo);

    r = await chamar('veiculo', { acao: 'carregar' });
    confere('carregar depois: igual ao que ficou', r.ok && r.veiculo.id === id && r.veiculo.documento === null && r.veiculo.campos.Cor === 'BRANCA', r.veiculo);
  } finally {
    for (const v of await t.lista(CAD, 'Veiculos')) await local('DELETE', `/v0/${CAD}/Veiculos/${v.id}`);
    // Os PDFs que este teste subiu (a pasta de anexos guarda o arquivo e um .json ao lado).
    if (fs.existsSync(PASTA_ANEXOS)) {
      for (const arq of fs.readdirSync(PASTA_ANEXOS)) {
        if (anexosAntes.has(arq)) continue;
        const base = arq.replace(/\.json$/, '');
        let info = {};
        try { info = JSON.parse(fs.readFileSync(path.join(PASTA_ANEXOS, base + '.json'), 'utf8')); } catch (e) { continue; }
        if (info.tabela === 'Veiculos') fs.rmSync(path.join(PASTA_ANEXOS, arq), { force: true });
      }
    }
    await t.sairEApagarUsuarioDeTeste();
  }
  const depois = await t.contarTudo();
  confere('nada sobrou nas tabelas', JSON.stringify(depois) === JSON.stringify(antes), { antes, depois });
  const { ok, falhas } = t.placar();
  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e); process.exitCode = 1; });
