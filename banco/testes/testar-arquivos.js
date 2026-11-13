// Fluxo "App - Arquivos" (13/11/2026): guardar a cópia de cada PDF gerado na pasta do cliente.
// Usa dois clientes de teste (apagados no fim, com os PDFs deles); nada de verdade é tocado.
// Uso: node banco/testes/testar-arquivos.js   (precisa do Airtable local reiniciado depois da tabela nova)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const t = require('./comum');
const { CAD, local, lista, chamar, confere } = t;

const T = 'Arquivos_Cliente';
const PASTA_ANEXOS = 'C:/Users/rediv/banco-solucoes/anexos';
// PDF mínimo válido, só para o teste.
const pdfDe = (texto) => Buffer.from(`%PDF-1.4\n% ${texto}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
const hashDe = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const reaisAntes = JSON.stringify(await lista(CAD, T));
  const apagar = [];
  const anexos = new Set();
  try {
    await t.entrarComUsuarioDeTeste();
    const cliA = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE ARQUIVOS CLIENTE A', Status: 'Ativo' } });
    apagar.unshift(['Entidades_Cadastradas', cliA.id]);
    const cliB = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE ARQUIVOS CLIENTE B', Status: 'Ativo' } });
    apagar.unshift(['Entidades_Cadastradas', cliB.id]);

    const pdf1 = pdfDe('orcamento um');
    const base = (extra) => ({
      acao: 'salvar', clienteId: cliA.id, clienteNome: 'Cliente A', tipo: 'orcamento', titulo: 'Orçamento · Cliente A',
      descricao: "Limpeza de caixa d'água", textoBusca: "Cliente A | Rua X | caixa d'água", valor: '1.290,50', dataDocumento: '2026-11-13',
      emissor: 'CNPJ 1', hash: hashDe(pdf1), dadosJson: '{"a":1}', nomeArquivo: 'orcamento-cliente-a.pdf', arquivo: pdf1.toString('base64'), ...extra,
    });
    const doCliente = async (id) => (await lista(CAD, T)).filter((r) => r.fields.Cliente_Ref === id);
    const guardarAnexos = (r) => ((r && r.fields && r.fields.Arquivo) || []).forEach((a) => anexos.add(a.id));

    // ---- acesso e entrada ----
    const semToken = await (await fetch('http://localhost:5678/webhook/arquivos', { method: 'POST', body: new URLSearchParams({ acao: 'salvar', tokenAcesso: 'errado' }) })).json();
    confere('sem login é recusado', semToken.acessoNegado === true, semToken);
    confere('ação inválida', (await chamar('arquivos', { acao: 'apagar' })).ok === false);
    const recusa = async (nome, extra, rx) => {
      const r = await chamar('arquivos', base(extra));
      confere(`recusa: ${nome}`, r.ok === false && (!rx || rx.test(r.mensagem)) && (await doCliente(cliA.id)).length === 0, r);
    };
    await recusa('sem cliente', { clienteId: '' }, /cliente/i);
    await recusa('cliente com formato inválido', { clienteId: 'abc' }, /cliente/i);
    await recusa('tipo que ainda não existe (servico)', { tipo: 'servico' }, /Tipo/);
    await recusa('tipo inventado', { tipo: 'outra-coisa' }, /Tipo/);
    await recusa('sem título', { titulo: '  ' }, /título/i);
    await recusa('data inválida', { dataDocumento: '13/11/2026' }, /Data/);
    await recusa('valor inválido', { valor: 'abc' }, /Valor/);
    await recusa('impressão digital inválida', { hash: 'xyz' }, /Identifica/);
    await recusa('arquivo que não é PDF', { arquivo: Buffer.from('oi, sou um texto').toString('base64') }, /PDF/);
    await recusa('arquivo vazio', { arquivo: '' }, /Arquivo/);
    const fantasma = await chamar('arquivos', base({ clienteId: 'recAAAAAAAAAAAAAA' }));
    confere('cliente que não existe: recusado e nada guardado', fantasma.ok === false && (await lista(CAD, T)).filter((r) => r.fields.Cliente_Ref === 'recAAAAAAAAAAAAAA').length === 0, fantasma);

    // ---- guardar ----
    const r1 = await chamar('arquivos', base());
    confere('orçamento guardado', r1.ok === true && r1.id && !r1.jaGuardado, r1);
    const reg = await local('GET', `/v0/${CAD}/${T}/${r1.id}`);
    guardarAnexos(reg);
    const f = reg.fields;
    confere('registro: cliente, tipo e título', f.Cliente_Ref === cliA.id && f.Tipo === 'orcamento' && f.Titulo === 'Orçamento · Cliente A' && f.Cliente_Nome === 'Cliente A', f);
    confere('registro: valor 1.290,50 vira 1290.5 e data', f.Valor === 1290.5 && f.Data_Documento === '2026-11-13', { v: f.Valor, d: f.Data_Documento });
    confere('registro: emissor, origem e impressão digital', f.Emissor === 'CNPJ 1' && f.Origem === 'gerado' && f.Hash_PDF === hashDe(pdf1), f);
    confere('registro: texto de busca e dados guardados', /caixa d'água/.test(f.Texto_Busca) && f.Dados_Json === '{"a":1}', f);
    confere('registro: um arquivo anexado, PDF', Array.isArray(f.Arquivo) && f.Arquivo.length === 1 && f.Arquivo[0].type === 'application/pdf' && f.Arquivo[0].filename === 'orcamento-cliente-a.pdf', f.Arquivo);
    const url = 'http://localhost:5678' + f.Arquivo[0].url;
    const baixado = Buffer.from(await (await fetch(url)).arrayBuffer());
    confere('o PDF abre pelo endereço e é o mesmo arquivo', baixado.equals(pdf1), { tamanho: baixado.length });

    // ---- não duplica ----
    const r2 = await chamar('arquivos', base());
    confere('mesmo PDF do mesmo cliente: já estava guardado', r2.ok === true && r2.jaGuardado === true && r2.id === r1.id, r2);
    confere('duplicado não cria registro', (await doCliente(cliA.id)).length === 1);
    const r3 = await chamar('arquivos', base({ clienteId: cliB.id, clienteNome: 'Cliente B' }));
    guardarAnexos(r3.id && await local('GET', `/v0/${CAD}/${T}/${r3.id}`));
    confere('mesmo PDF para outro cliente é guardado', r3.ok === true && !r3.jaGuardado && r3.id !== r1.id, r3);

    // ---- outros tipos ----
    const pdf2 = pdfDe('comunicado');
    const r4 = await chamar('arquivos', base({ tipo: 'comunicado', titulo: 'Comunicado · Cliente A', valor: '', hash: hashDe(pdf2), arquivo: pdf2.toString('base64'), emissor: 'CNPJ 2', nomeArquivo: 'comunicado sem extensao' }));
    const reg4 = await local('GET', `/v0/${CAD}/${T}/${r4.id}`); guardarAnexos(reg4);
    confere('comunicado: sem valor, CNPJ 2, nome ganha .pdf', r4.ok === true && reg4.fields.Valor === undefined && reg4.fields.Emissor === 'CNPJ 2' && reg4.fields.Arquivo[0].filename === 'comunicado sem extensao.pdf', reg4.fields);
    const pdf3 = pdfDe('recibo');
    const r5 = await chamar('arquivos', base({ tipo: 'recibo', titulo: 'Recibo · Cliente A', valor: '290', hash: hashDe(pdf3), arquivo: pdf3.toString('base64') }));
    const reg5 = await local('GET', `/v0/${CAD}/${T}/${r5.id}`); guardarAnexos(reg5);
    confere('recibo: valor 290', r5.ok === true && reg5.fields.Valor === 290, reg5.fields);
    const pdf4 = pdfDe('sem hash');
    const r6 = await chamar('arquivos', base({ tipo: 'laudo', titulo: 'Laudo · Cliente A', valor: '', hash: '', arquivo: pdf4.toString('base64') }));
    const reg6 = await local('GET', `/v0/${CAD}/${T}/${r6.id}`); guardarAnexos(reg6);
    confere('laudo sem impressão digital também é guardado', r6.ok === true && reg6.fields.Hash_PDF === undefined, reg6.fields);
    confere('cliente A tem 4 arquivos, cliente B tem 1', (await doCliente(cliA.id)).length === 4 && (await doCliente(cliB.id)).length === 1);
  } finally {
    // apaga os registros de teste e os PDFs que eles deixaram na pasta de anexos
    for (const r of (await lista(CAD, T))) {
      if (apagar.some(([tab, id]) => tab === 'Entidades_Cadastradas' && id === r.fields.Cliente_Ref)) {
        (r.fields.Arquivo || []).forEach((a) => anexos.add(a.id));
        await local('DELETE', `/v0/${CAD}/${T}/${r.id}`).catch((e) => console.log('não apagou', r.id, e.message));
      }
    }
    for (const [tabela, id] of apagar) await local('DELETE', `/v0/${CAD}/${tabela}/${id}`).catch((e) => console.log('não apagou', tabela, id, e.message));
    for (const id of anexos) for (const sufixo of ['', '.json']) { try { fs.unlinkSync(path.join(PASTA_ANEXOS, id + sufixo)); } catch (e) { /* já não existe */ } }
    await t.sairEApagarUsuarioDeTeste();
  }

  const depois = await t.contarTudo();
  confere('as quantidades voltaram ao que eram', JSON.stringify(depois) === JSON.stringify(antes), { antes, depois });
  confere('os arquivos de verdade não mudaram', JSON.stringify(await lista(CAD, T)) === reaisAntes);
  const erros = await t.errosDesde(inicio);
  confere('o n8n não registrou erro', erros.length === 0, erros);
  const { ok, falhas } = t.placar();
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e.message); process.exitCode = 1; });
