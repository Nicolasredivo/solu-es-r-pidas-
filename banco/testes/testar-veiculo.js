// Aba Veículo (08/11/2026): fluxo "App - Veículo" (webhook "veiculo").
// salvar (só campos conhecidos), anexar PDF (+ campos lidos), substituir, remover o PDF (os dados
// ficam), consumo (salvar, alterar, excluir, recusar inválido), entrada inválida e acesso sem token.
//
// O veículo de verdade NUNCA é tocado: o teste roda numa CÓPIA do fluxo que só enxerga um registro
// de teste (marcado em Observacoes). No fim apaga o registro de teste, os PDFs dele e a cópia, e
// confere que o registro de verdade ficou idêntico.
// Uso: node banco/testes/testar-veiculo.js
const fs = require('fs');
const path = require('path');
const t = require('./comum');
const { CAD, local, chamar, confere } = t;

const PASTA_ANEXOS = 'C:/Users/rediv/banco-solucoes/anexos';
const MARCA = '__TESTE_AUTOMATICO_VEICULO__';
const FILTRO_PNEU = '?filterByFormula=' + encodeURIComponent(`{Modelo}='${MARCA}'`);
const FILTRO = '?filterByFormula=' + encodeURIComponent(`{Observacoes}='${MARCA}'`);
// PDF mínimo válido, só para o teste (o conteúdo não importa ao fluxo).
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

(async () => {
  const antes = await t.contarTudo();
  const reaisAntes = JSON.stringify(await t.lista(CAD, 'Veiculos'));
  const pneusAntes = await t.lista(CAD, 'Pneus');
  // Uma posição que o dono ainda não usa (cada posição só pode ter um pneu).
  const livre = ['Estepe', 'Traseiro direito', 'Traseiro esquerdo', 'Dianteiro direito', 'Dianteiro esquerdo']
    .find((p) => !pneusAntes.some((r) => r.fields.Posicao === p));
  let copia = null;
  let testeId = null;
  try {
    // ---- sem token (fluxo real: só lê o acesso, não grava nada) ----
    const semToken = await (await fetch('http://localhost:5678/webhook/veiculo', { method: 'POST', body: new URLSearchParams({ acao: 'carregar' }) })).json();
    confere('sem token: acesso negado', semToken.acessoNegado === true, semToken);

    // ---- registro de teste + cópia do fluxo que só enxerga ele ----
    const criado = await local('POST', `/v0/${CAD}/Veiculos`, { fields: { Observacoes: MARCA } });
    testeId = criado.id;
    confere('registro de teste criado', /^rec/.test(testeId || ''), criado);
    const wf = (await t.n8n('GET', '/workflows?limit=250')).data.find((w) => w.name === 'App - Veículo');
    copia = await t.copiaDeTeste(wf.id, {
      ajustar: (nodes) => nodes.map((n) => (['Busca veículo', 'Busca de novo'].includes(n.name)
        ? { ...n, parameters: { ...n.parameters, url: n.parameters.url + FILTRO } }
        : ['Busca pneus', 'Busca pneus de novo'].includes(n.name)
          ? { ...n, parameters: { ...n.parameters, url: n.parameters.url + FILTRO_PNEU } } : n)),
    });
    await t.esperar(1500);
    await t.entrarComUsuarioDeTeste();
    const app = (dados) => chamar(copia.caminho, dados);

    let r = await app({ acao: 'carregar' });
    confere('carregar: a cópia vê só o registro de teste', r.ok === true && r.veiculo && r.veiculo.id === testeId && r.veiculo.consumo === null, r);
    // Trava de segurança: se a cópia enxergasse o veículo de verdade, as gravações abaixo mexeriam nele.
    if (!(r.veiculo && r.veiculo.id === testeId)) throw new Error('a cópia não está presa ao registro de teste; parei antes de gravar');

    r = await app({ acao: 'apagar-tudo' });
    confere('ação desconhecida: recusada', r.ok === false && /Ação inválida/.test(r.mensagem), r);

    r = await app({ acao: 'salvar', campos: JSON.stringify({ Placa: 'TST0A00', Cor: '  TESTE  ', Campo_Que_Nao_Existe: 'x', Documento: [{ id: 'attfalso' }] }) });
    confere('salvar: altera o registro de teste', r.ok === true && r.veiculo && r.veiculo.id === testeId, r);
    confere('salvar: valores limpos', r.veiculo && r.veiculo.campos.Placa === 'TST0A00' && r.veiculo.campos.Cor === 'TESTE', r.veiculo);
    confere('salvar: campo estranho e Documento ignorados', r.veiculo && !('Campo_Que_Nao_Existe' in r.veiculo.campos) && r.veiculo.documento === null, r.veiculo);

    r = await app({ acao: 'documento', arquivo: Buffer.from('não sou pdf').toString('base64'), nomeArquivo: 'x.pdf', campos: '{}' });
    confere('arquivo que não é PDF: recusado', r.ok === false && /PDF/.test(r.mensagem), r);

    r = await app({ acao: 'documento', arquivo: PDF.toString('base64'), nomeArquivo: 'crlv teste.pdf', campos: JSON.stringify({ Chassi: '9BWTESTE000000000' }) });
    confere('anexar PDF: ok', r.ok === true && r.veiculo && r.veiculo.documento && r.veiculo.documento.nome === 'crlv teste.pdf', r);
    confere('anexar PDF: dados lidos gravados e os outros mantidos', r.veiculo && r.veiculo.campos.Chassi === '9BWTESTE000000000' && r.veiculo.campos.Placa === 'TST0A00', r.veiculo && r.veiculo.campos);
    const url1 = r.veiculo && r.veiculo.documento && r.veiculo.documento.url;
    confere('anexar PDF: endereço completo do anexo', /^http:\/\/localhost:5678\/webhook\/anexo\?id=att[0-9a-f]{32}$/.test(url1 || ''), url1);
    if (url1) {
      const baixado = Buffer.from(await (await fetch(url1)).arrayBuffer());
      confere('o PDF abre pelo endereço e é o mesmo arquivo', baixado.equals(PDF), baixado.length);
    }

    r = await app({ acao: 'documento', arquivo: PDF.toString('base64'), nomeArquivo: 'crlv novo', campos: '{}' });
    const docs = ((await local('GET', `/v0/${CAD}/Veiculos/${testeId}`)).fields.Documento || []);
    confere('substituir: fica só o PDF novo (com .pdf no nome)', r.ok && docs.length === 1 && docs[0].filename === 'crlv novo.pdf' && r.veiculo.documento.url !== url1, docs.map((d) => d.filename));

    r = await app({ acao: 'remover-documento' });
    confere('remover: sem PDF e os dados continuam', r.ok && r.veiculo.documento === null && r.veiculo.campos.Placa === 'TST0A00', r.veiculo);

    // ---- consumo (km/l), à parte dos dados do documento ----
    r = await app({ acao: 'consumo', consumo: '9,5' });
    confere('consumo: salva 9,5', r.ok && r.veiculo.consumo === 9.5 && r.mensagem === 'Consumo salvo.', r);
    confere('consumo: não mexe nos dados do documento', r.veiculo.campos.Placa === 'TST0A00' && r.veiculo.id === testeId, r.veiculo);
    r = await app({ acao: 'consumo', consumo: '10.25' });
    confere('consumo: altera para 10.25', r.ok && r.veiculo.consumo === 10.25, r.veiculo && r.veiculo.consumo);
    for (const ruim of ['abc', '0', '-3', '9,555', '150']) {
      r = await app({ acao: 'consumo', consumo: ruim });
      confere(`consumo inválido recusado (${ruim})`, r.ok === false && /Consumo inválido/.test(r.mensagem), r);
    }
    r = await app({ acao: 'salvar', campos: JSON.stringify({ Cor: 'PRATA' }) });
    confere('salvar os dados do documento mantém o consumo', r.ok && r.veiculo.consumo === 10.25, r.veiculo && r.veiculo.consumo);
    r = await app({ acao: 'consumo', consumo: '' });
    confere('consumo: excluir deixa vazio', r.ok && r.veiculo.consumo === null && r.mensagem === 'Consumo excluído.', r);
    // ---- pneus (numa posição que o dono não usa; o Modelo leva a marca do teste) ----
    if (!livre) {
      console.log('(pneus: as 5 posições já estão preenchidas pelo dono; parte dos pneus pulada)');
    } else {
      confere('pneus: 5 posições na resposta', Array.isArray(r.pneus) && r.pneus.length === 5, r.pneus);
      r = await app({ acao: 'pneu', posicao: livre, marca: 'TESTE', modelo: MARCA, valor: '1.234,56', dataTroca: '01/11/2026', desgaste: '0,0247' });
      let p = r.ok && r.pneus.find((x) => x.posicao === livre);
      confere('pneu: salva', r.ok && p && p.salvo && r.mensagem === 'Pneu salvo.', r);
      confere('pneu: valores entendidos', p && p.marca === 'TESTE' && p.valor === 1234.56 && p.dataTroca === '2026-11-01' && p.desgaste === 0.0247, p);
      r = await app({ acao: 'pneu', posicao: livre, marca: 'TESTE2', modelo: MARCA, valor: '450', dataTroca: '2026-11-02', desgaste: '' });
      p = r.ok && r.pneus.find((x) => x.posicao === livre);
      confere('pneu: altera o mesmo pneu', p && p.marca === 'TESTE2' && p.valor === 450 && p.dataTroca === '2026-11-02' && p.desgaste === null, p);
      confere('pneu: continua um registro só', (await t.lista(CAD, 'Pneus', `{Modelo}='${MARCA}'`)).length === 1);
      for (const [nome, ruim, msg] of [
        ['posição', { posicao: 'Teto' }, /Pneu inválido/],
        ['valor', { posicao: livre, valor: 'abc' }, /Valor pago inválido/],
        ['desgaste', { posicao: livre, desgaste: '1,23456' }, /Desgaste inválido/],
        ['data', { posicao: livre, dataTroca: '31/02/2026' }, /Data da troca inválida/],
      ]) {
        r = await app({ acao: 'pneu', modelo: MARCA, ...ruim });
        confere(`pneu: ${nome} inválido recusado`, r.ok === false && msg.test(r.mensagem), r);
      }
      r = await app({ acao: 'pneu', posicao: livre });
      p = r.ok && r.pneus.find((x) => x.posicao === livre);
      confere('pneu: tudo vazio exclui', r.ok && p && p.salvo === false && r.mensagem === 'Pneu excluído.', r);
      confere('pneu: registro apagado', (await t.lista(CAD, 'Pneus', `{Modelo}='${MARCA}'`)).length === 0);
    }
  } finally {
    if (testeId) await local('DELETE', `/v0/${CAD}/Veiculos/${testeId}`);
    for (const p of await t.lista(CAD, 'Pneus', `{Modelo}='${MARCA}'`)) await local('DELETE', `/v0/${CAD}/Pneus/${p.id}`);
    // Os PDFs do registro de teste (a pasta de anexos guarda o arquivo e um .json ao lado).
    if (testeId && fs.existsSync(PASTA_ANEXOS)) {
      for (const arq of fs.readdirSync(PASTA_ANEXOS).filter((a) => a.endsWith('.json'))) {
        let info = {};
        try { info = JSON.parse(fs.readFileSync(path.join(PASTA_ANEXOS, arq), 'utf8')); } catch (e) { continue; }
        if (info.tabela === 'Veiculos' && info.recordId === testeId) {
          fs.rmSync(path.join(PASTA_ANEXOS, arq), { force: true });
          fs.rmSync(path.join(PASTA_ANEXOS, arq.replace(/\.json$/, '')), { force: true });
        }
      }
    }
    await t.sairEApagarUsuarioDeTeste();
    if (copia) await copia.apagar();
  }
  confere('os pneus de verdade ficaram idênticos', JSON.stringify(await t.lista(CAD, 'Pneus')) === JSON.stringify(pneusAntes));
  confere('o veículo de verdade ficou idêntico', JSON.stringify(await t.lista(CAD, 'Veiculos')) === reaisAntes);
  const depois = await t.contarTudo();
  confere('nada sobrou nas tabelas', JSON.stringify(depois) === JSON.stringify(antes), { antes, depois });
  const { ok, falhas } = t.placar();
  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e); process.exitCode = 1; });
