// Fluxo "App - Arquivos" (13/11/2026): guardar a cópia de cada PDF gerado na pasta do cliente (salvar) e ler
// as pastas (resumo de todos os clientes e arquivos de um cliente, com as NFS-e).
// Roda numa CÓPIA do fluxo, com o "Status do servico" simulado (testes ou produção), para nunca depender do
// ambiente real de notas. Usa dois clientes de teste (apagados no fim, com os PDFs e as notas de teste deles).
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
  const copias = [];
  try {
    await t.entrarComUsuarioDeTeste();
    const wf = (await t.n8n('GET', '/workflows?limit=250')).data.find((w) => w.name === 'App - Arquivos');
    const saude = (ambiente) => `return [{ json: { ok: true, ambiente: '${ambiente}', serie: 1 } }];`;
    const copia = await t.copiaDeTeste(wf.id, { simulacoes: { 'Status do servico': saude('restrita') } });
    const copiaProd = await t.copiaDeTeste(wf.id, { simulacoes: { 'Status do servico': saude('producao') } });
    copias.push(copia, copiaProd);
    await t.esperar(1500);
    const app = (dados) => chamar(copia.caminho, dados);
    const appProd = (dados) => chamar(copiaProd.caminho, dados);
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
    confere('ação inválida', (await app({ acao: 'apagar' })).ok === false);
    const recusa = async (nome, extra, rx) => {
      const r = await app(base(extra));
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
    const fantasma = await app(base({ clienteId: 'recAAAAAAAAAAAAAA' }));
    confere('cliente que não existe: recusado e nada guardado', fantasma.ok === false && (await lista(CAD, T)).filter((r) => r.fields.Cliente_Ref === 'recAAAAAAAAAAAAAA').length === 0, fantasma);

    // ---- guardar ----
    const r1 = await app(base());
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
    const r2 = await app(base());
    confere('mesmo PDF do mesmo cliente: já estava guardado', r2.ok === true && r2.jaGuardado === true && r2.id === r1.id, r2);
    confere('duplicado não cria registro', (await doCliente(cliA.id)).length === 1);
    const r3 = await app(base({ clienteId: cliB.id, clienteNome: 'Cliente B' }));
    guardarAnexos(r3.id && await local('GET', `/v0/${CAD}/${T}/${r3.id}`));
    confere('mesmo PDF para outro cliente é guardado', r3.ok === true && !r3.jaGuardado && r3.id !== r1.id, r3);

    // ---- outros tipos ----
    const pdf2 = pdfDe('comunicado');
    const r4 = await app(base({ tipo: 'comunicado', titulo: 'Comunicado · Cliente A', valor: '', hash: hashDe(pdf2), arquivo: pdf2.toString('base64'), emissor: 'CNPJ 2', nomeArquivo: 'comunicado sem extensao' }));
    const reg4 = await local('GET', `/v0/${CAD}/${T}/${r4.id}`); guardarAnexos(reg4);
    confere('comunicado: sem valor, CNPJ 2, nome ganha .pdf', r4.ok === true && reg4.fields.Valor === undefined && reg4.fields.Emissor === 'CNPJ 2' && reg4.fields.Arquivo[0].filename === 'comunicado sem extensao.pdf', reg4.fields);
    const pdf3 = pdfDe('recibo');
    const r5 = await app(base({ tipo: 'recibo', titulo: 'Recibo · Cliente A', valor: '290', hash: hashDe(pdf3), arquivo: pdf3.toString('base64') }));
    const reg5 = await local('GET', `/v0/${CAD}/${T}/${r5.id}`); guardarAnexos(reg5);
    confere('recibo: valor 290', r5.ok === true && reg5.fields.Valor === 290, reg5.fields);
    const pdf4 = pdfDe('sem hash');
    const r6 = await app(base({ tipo: 'laudo', titulo: 'Laudo · Cliente A', valor: '', hash: '', arquivo: pdf4.toString('base64') }));
    const reg6 = await local('GET', `/v0/${CAD}/${T}/${r6.id}`); guardarAnexos(reg6);
    confere('laudo sem impressão digital também é guardado', r6.ok === true && reg6.fields.Hash_PDF === undefined, reg6.fields);
    confere('cliente A tem 4 arquivos, cliente B tem 1', (await doCliente(cliA.id)).length === 4 && (await doCliente(cliB.id)).length === 1);

    // ---- ler: arquivos de um cliente (com as NFS-e) e resumo de todos ----
    const mkNota = async (fields) => { const n = await local('POST', `/v0/${CAD}/Notas_Fiscais`, { fields }); apagar.unshift(['Notas_Fiscais', n.id]); return n; };
    await mkNota({ Ambiente: 'Testes', Serie: 1, Numero_DPS: 8800001, Status: 'Emitida', Numero_NFSe: '777', Chave_Acesso: '42091022211338567000199000000000007726110000000001', Cliente_Ref: cliA.id, Tomador_Nome: 'CLIENTE A', Tomador_Documento: '11222333000181', Valor: 100, Competencia: '2026-12-01', Emissor: 'CNPJ 2' });
    await mkNota({ Ambiente: 'Testes', Serie: 1, Numero_DPS: 8800002, Status: 'Recusada', Cliente_Ref: cliA.id, Tomador_Nome: 'CLIENTE A', Valor: 50, Competencia: '2026-12-02', Emissor: 'CNPJ 1' });
    const lerA = await app({ acao: 'cliente', clienteId: cliA.id });
    confere('cliente: lista os 4 arquivos e a nota emitida (a recusada não entra)', lerA.ok === true && lerA.ambiente === 'Testes' && lerA.itens.length === 5, lerA.itens && lerA.itens.map((i) => i.pasta));
    confere('cliente: do mais recente para o mais antigo', lerA.itens.every((it, k, v) => k === 0 || String(v[k - 1].data) >= String(it.data)) && lerA.itens[0].pasta === 'nfs', lerA.itens.map((i) => i.data));
    const nota = lerA.itens.find((i) => i.pasta === 'nfs');
    confere('cliente: a NFS-e traz número, chave e emissor', nota.nota.numero === '777' && /^\d{50}$/.test(nota.nota.chave) && nota.emissor === 'CNPJ 2' && nota.valor === 100 && nota.titulo === 'Nota nº 777', nota);
    const orc = lerA.itens.find((i) => i.pasta === 'orcamento');
    confere('cliente: o PDF vem com endereço completo e abre igual', orc.arquivo && /^https?:\/\//.test(orc.arquivo.url) && orc.arquivo.nome === 'orcamento-cliente-a.pdf' && orc.valor === 1290.5, orc);
    confere("cliente: traz o texto de busca (para buscar por palavras na tela)", /caixa d'água/.test(orc.texto) && /777|CLIENTE A/.test(nota.texto), { orc: orc.texto, nota: nota.texto });
    const baixado2 = Buffer.from(await (await fetch(orc.arquivo.url)).arrayBuffer());
    confere('cliente: o endereço devolvido abre o PDF certo', baixado2.equals(pdf1));
    confere('cliente: só os arquivos dele', lerA.itens.every((i) => i.clienteId === cliA.id) && !JSON.stringify(lerA).includes(cliB.id));
    const lerB = await app({ acao: 'cliente', clienteId: cliB.id });
    confere('cliente B: só o arquivo dele', lerB.ok === true && lerB.itens.length === 1 && lerB.itens[0].clienteId === cliB.id, lerB);
    const vazio = await app({ acao: 'cliente', clienteId: 'recBBBBBBBBBBBBBB' });
    confere('cliente sem nada: lista vazia', vazio.ok === true && vazio.itens.length === 0, vazio);
    confere('cliente inválido é recusado', (await app({ acao: 'cliente', clienteId: 'abc' })).ok === false);
    const res = await app({ acao: 'resumo' });
    const rA = res.clientes && res.clientes[cliA.id];
    confere('resumo: contagem por pasta do cliente A', res.ok === true && rA && rA.total === 5 && rA.pastas.orcamento === 1 && rA.pastas.comunicado === 1 && rA.pastas.recibo === 1 && rA.pastas.laudo === 1 && rA.pastas.nfs === 1, rA);
    confere('resumo: cliente B tem 1', res.clientes[cliB.id] && res.clientes[cliB.id].total === 1);
    confere('resumo: não traz conteúdo dos PDFs', !JSON.stringify(res).includes('JVBERi0'));
    confere('resumo: não traz o texto de busca (só a lista de um cliente traz)', !JSON.stringify(res).includes("caixa d'água"));
    const resProd = await appProd({ acao: 'resumo' });
    confere('em produção a NFS-e de teste não aparece (só os arquivos)', resProd.ok === true && resProd.ambiente === 'Producao' && resProd.clientes[cliA.id].total === 4 && !resProd.clientes[cliA.id].pastas.nfs, resProd.clientes && resProd.clientes[cliA.id]);
    const lerProd = await appProd({ acao: 'cliente', clienteId: cliA.id });
    confere('em produção, cliente A só tem os 4 arquivos', lerProd.itens.length === 4 && lerProd.itens.every((i) => i.pasta !== 'nfs'), lerProd.itens.map((i) => i.pasta));
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
    await t.apagarCopias(copias);
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
