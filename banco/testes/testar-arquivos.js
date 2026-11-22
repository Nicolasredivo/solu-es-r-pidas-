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

    // ---- substituir um documento por outro e desfazer (17/11/2026) ----
    const novoOrc = async (texto, data, valor) => {
      const pdf = pdfDe(texto);
      const r = await app(base({ titulo: 'Orçamento · ' + texto, valor, dataDocumento: data, hash: hashDe(pdf), arquivo: pdf.toString('base64'), dadosJson: '{"b":2}' }));
      guardarAnexos(r.id && await local('GET', `/v0/${CAD}/${T}/${r.id}`));
      return r;
    };
    const rNovo = await novoOrc('revisado', '2026-11-20', '1.500,00');
    const rTerc = await novoOrc('terceiro', '2026-11-25', '1.600,00');
    const dadosDe = async (id) => JSON.parse((await local('GET', `/v0/${CAD}/${T}/${id}`)).fields.Dados_Json || '{}');
    const troca = (acao, antigoId, novoId, motivo) => app({ acao, clienteId: cliA.id, antigoId, novoId, motivo: motivo || '' });
    const recusaTroca = async (nome, r, rx) => confere(`troca recusada: ${nome}`, r.ok === false && (!rx || rx.test(r.mensagem)), r);
    await recusaTroca('sem o documento novo', await troca('substituir', r1.id, ''), /Escolha/);
    await recusaTroca('o mesmo documento', await troca('substituir', r1.id, r1.id), /outro/);
    await recusaTroca('pastas diferentes', await troca('substituir', r1.id, r4.id), /mesma pasta/);
    await recusaTroca('documento de outro cliente', await troca('substituir', r1.id, r3.id), /Não achei/);
    await recusaTroca('cliente errado', await app({ acao: 'substituir', clienteId: cliB.id, antigoId: r1.id, novoId: rNovo.id }), /Não achei/);
    confere('troca recusada não mexe nos dados', JSON.stringify(await dadosDe(r1.id)) === '{"a":1}');
    const tr = await troca('substituir', r1.id, rNovo.id, '  valor   revisto  ');
    confere('substituir: ok', tr.ok === true && /substituído/.test(tr.mensagem), tr);
    const dA = await dadosDe(r1.id), dN = await dadosDe(rNovo.id);
    confere('substituir: o antigo guarda o novo (id, data, motivo) e mantém os dados de antes',
      dA.a === 1 && dA.substituidoPor.id === rNovo.id && dA.substituidoPor.data === '2026-11-20' && dA.substituidoPor.motivo === 'valor revisto' && /R\$ 1\.500,00/.test(dA.substituidoPor.titulo), dA);
    confere('substituir: o novo guarda o antigo', dN.b === 2 && dN.substitui.id === r1.id && dN.substitui.data === '2026-11-13' && /R\$ 1\.290,50/.test(dN.substitui.titulo), dN);
    const lerT = await app({ acao: 'cliente', clienteId: cliA.id });
    const itA = lerT.itens.find((i) => i.id === r1.id), itN = lerT.itens.find((i) => i.id === rNovo.id);
    confere('leitura: a troca chega ao app com o id do par', itA.substituidoPor && itA.substituidoPor.id === rNovo.id && !itA.substitui && itN.substitui && itN.substitui.id === r1.id && !itN.substituidoPor, { itA, itN });
    await recusaTroca('já substituído', await troca('substituir', r1.id, rTerc.id), /já foi substituído/);
    await recusaTroca('o novo escolhido já foi substituído', await troca('substituir', rTerc.id, r1.id), /também já foi substituído/);
    await recusaTroca('o novo escolhido já substitui outro', await troca('substituir', rTerc.id, rNovo.id), /já substitui outro/);
    await recusaTroca('desfazer com o par errado', await troca('desfazer', r1.id, rTerc.id), /não está marcado/);
    await recusaTroca('desfazer o que não foi trocado', await troca('desfazer', rTerc.id, rNovo.id), /não está marcado/);
    const tr2 = await troca('substituir', rNovo.id, rTerc.id, 'segunda revisão');
    confere('em cadeia: o revisado também pode ser substituído', tr2.ok === true && (await dadosDe(rNovo.id)).substitui.id === r1.id && (await dadosDe(rNovo.id)).substituidoPor.id === rTerc.id, tr2);
    const d1 = await troca('desfazer', rNovo.id, rTerc.id);
    const d2 = await troca('desfazer', r1.id, rNovo.id);
    confere('desfazer: ok', d1.ok === true && d2.ok === true && /desfeita/.test(d2.mensagem), { d1, d2 });
    confere('desfazer: os três voltam aos dados de antes', JSON.stringify(await dadosDe(r1.id)) === '{"a":1}' && JSON.stringify(await dadosDe(rNovo.id)) === '{"b":2}' && JSON.stringify(await dadosDe(rTerc.id)) === '{"b":2}');

    // ---- importar documento antigo (etapa 5): origem "importado" e PDF de nota feita fora do sistema ----
    const cliC = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE ARQUIVOS CLIENTE C', Status: 'Ativo' } });
    apagar.unshift(['Entidades_Cadastradas', cliC.id]);
    const pdfI = pdfDe('nota antiga do portal');
    const baseI = (extra) => base({ clienteId: cliC.id, clienteNome: 'Cliente C', tipo: 'nfs', titulo: 'Nota 123 (portal)', descricao: 'Instalação antiga', valor: '350,00', dataDocumento: '2025-03-10',
      origem: 'importado', hash: hashDe(pdfI), arquivo: pdfI.toString('base64'), nomeArquivo: 'nota-123.pdf', dadosJson: '{"arquivoOriginal":"nota-123.pdf"}', ...extra });
    const rOrigem = await app(baseI({ origem: 'inventada' }));
    confere('importar: origem inventada é recusada', rOrigem.ok === false && /Origem/.test(rOrigem.mensagem) && (await doCliente(cliC.id)).length === 0, rOrigem);
    const rI = await app(baseI());
    const regI = rI.id ? await local('GET', `/v0/${CAD}/${T}/${rI.id}`) : { fields: {} }; guardarAnexos(regI);
    confere('importar: PDF de nota antiga guardado na pasta NFS-e com origem importado', rI.ok === true && regI.fields.Tipo === 'nfs' && regI.fields.Origem === 'importado' && regI.fields.Data_Documento === '2025-03-10' && regI.fields.Valor === 350, regI.fields);
    const rI2 = await app(baseI());
    confere('importar: o mesmo PDF não entra duas vezes', rI2.ok === true && rI2.jaGuardado === true && (await doCliente(cliC.id)).length === 1, rI2);
    const lerC = await app({ acao: 'cliente', clienteId: cliC.id });
    const itemC = lerC.itens && lerC.itens[0];
    confere('importar: aparece na pasta NFS-e como PDF (tem arquivo, sem dados de nota do sistema)', lerC.itens.length === 1 && itemC.pasta === 'nfs' && itemC.arquivo && !itemC.nota && /nota antiga|Nota 123/.test(itemC.titulo + itemC.texto), itemC);
    const resC = await app({ acao: 'resumo' });
    confere('importar: o resumo conta na pasta NFS-e', resC.clientes[cliC.id] && resC.clientes[cliC.id].pastas.nfs === 1, resC.clientes[cliC.id]);
    // ---- corrigir os dados de um documento (22/11/2026) ----
    const editar = (id, cli, extra) => app({ acao: 'editar', clienteId: cli, id, titulo: 'Nota nº 123', descricao: 'Instalação de bomba', valor: '1.306,00',
      dataDocumento: '2025-03-11', emissor: 'CNPJ 2', ...extra });
    const regEd = async (id) => (await local('GET', `/v0/${CAD}/${T}/${id}`)).fields;
    const recusaEd = async (nome, r, rx) => confere(`editar recusa: ${nome}`, r.ok === false && rx.test(r.mensagem || ''), r);
    await recusaEd('documento inválido', await editar('abc', cliC.id), /Documento inválido/);
    await recusaEd('sem título', await editar(rI.id, cliC.id, { titulo: '  ' }), /título/);
    await recusaEd('data inválida', await editar(rI.id, cliC.id, { dataDocumento: '11/03/2025' }), /Data/);
    await recusaEd('valor inválido', await editar(rI.id, cliC.id, { valor: 'mil' }), /Valor/);
    await recusaEd('documento de outro cliente', await editar(rI.id, cliA.id), /Não achei/);
    confere('editar: recusas não mudaram nada', (await regEd(rI.id)).Titulo === 'Nota 123 (portal)');
    const ed = await editar(rI.id, cliC.id);
    const fI = await regEd(rI.id);
    const dI = JSON.parse(fI.Dados_Json);
    confere('editar importado: ok', ed.ok === true && /corrigidos/.test(ed.mensagem), ed);
    confere('editar importado: muda título, descrição, data, valor e emissor', fI.Titulo === 'Nota nº 123' && fI.Descricao === 'Instalação de bomba' && fI.Data_Documento === '2025-03-11' && fI.Valor === 1306 && fI.Emissor === 'CNPJ 2', fI);
    confere('editar importado: busca com o título novo e o nome do arquivo', fI.Texto_Busca === 'Nota nº 123 | Instalação de bomba | nota-123.pdf', fI.Texto_Busca);
    confere('editar importado: guarda o antes', dI.arquivoOriginal === 'nota-123.pdf' && dI.edicoes.length === 1 && dI.edicoes[0].antes.titulo === 'Nota 123 (portal)' && dI.edicoes[0].antes.valor === 350 && dI.edicoes[0].antes.data === '2025-03-10', dI);
    const igual = await editar(rI.id, cliC.id);
    confere('editar: sem mudança não grava', igual.ok === true && /Nada mudou/.test(igual.mensagem) && JSON.parse((await regEd(rI.id)).Dados_Json).edicoes.length === 1, igual);
    const semValor = await editar(rI.id, cliC.id, { valor: '' });
    const fSV = await regEd(rI.id);
    confere('editar: valor vazio tira o valor', semValor.ok === true && fSV.Valor === undefined && JSON.parse(fSV.Dados_Json).edicoes.length === 2, fSV);
    const lerC2 = await app({ acao: 'cliente', clienteId: cliC.id });
    confere('editar: a pasta mostra o novo e diz que é importado', lerC2.itens[0].titulo === 'Nota nº 123' && lerC2.itens[0].origem === 'importado' && lerC2.itens[0].valor === null, lerC2.itens[0]);
    const antesG = await regEd(r1.id);
    const edG = await editar(r1.id, cliA.id, { titulo: 'Orçamento revisto', descricao: 'Limpeza e desinfecção', valor: '999', dataDocumento: '2026-01-01', emissor: 'CNPJ 2' });
    const fG = await regEd(r1.id);
    confere('editar gerado: só título e descrição (data, valor e emissor estão no PDF)', edG.ok === true && fG.Titulo === 'Orçamento revisto' && fG.Descricao === 'Limpeza e desinfecção'
      && fG.Valor === antesG.Valor && fG.Data_Documento === antesG.Data_Documento && fG.Emissor === antesG.Emissor && fG.Texto_Busca === antesG.Texto_Busca, { antesG, fG });
    const dG = JSON.parse(fG.Dados_Json);
    confere('editar gerado: mantém os dados do PDF e guarda o antes', dG.a === 1 && dG.edicoes.length === 1 && dG.edicoes[0].antes.titulo === antesG.Titulo, dG);
    const lerAEd = await app({ acao: 'cliente', clienteId: cliA.id });
    confere('editar: a leitura diz que o gerado é gerado', lerAEd.itens.find((i) => i.id === r1.id).origem === 'gerado', lerAEd.itens.find((i) => i.id === r1.id));
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
