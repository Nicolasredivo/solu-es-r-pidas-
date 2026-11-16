// Fluxo "App - Notas fiscais": roda numa CÓPIA do fluxo ligada a um serviço de notas próprio (porta 5699)
// forçado no ambiente de testes do governo (notas sem validade), com clientes fictícios apagados no fim.
// O serviço de verdade (5691) e as notas reais nunca são tocados. Cobre os dois emissores (CNPJ 1 e 2).
// Uso: node banco/testes/testar-fluxo-notas.js
const { spawn } = require('child_process');
const path = require('path');
const t = require('./comum');
const { CAD, local, lista, chamar, confere } = t;

const T = 'Notas_Fiscais';
const fs = require('fs');
const PASTA_ANEXOS = 'C:/Users/rediv/banco-solucoes/anexos/';
const pdfsDeTeste = [];
// Texto de dentro de um PDF guardado (o jsPDF compacta cada página; aqui se descompacta para ler).
const zlib = require('zlib');
function textoDoPdf(attId) {
  const b = fs.readFileSync(PASTA_ANEXOS + attId);
  const s = b.toString('latin1');
  let out = '';
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const ini = m.index + m[0].length;
    const fim = s.indexOf('endstream', ini);
    if (fim < 0) break;
    try { out += zlib.inflateSync(b.subarray(ini, fim), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('latin1'); } catch (e) { /* não compactado */ }
    re.lastIndex = fim;
  }
  return out;
}
const formatarCnpj = (c) => String(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const PORTA_TESTE = 5699;
const SERVICO = `http://127.0.0.1:${PORTA_TESTE}/saude`;
const SERV = 'Instalação de teste. TESTE SEM VALIDADE JURIDICA. Valor total = R$ 1,00.';

(async () => {
  const serv = spawn('node', [path.join(__dirname, '..', 'nfse-local.js')], { env: { ...process.env, NFSE_PORTA: String(PORTA_TESTE), NFSE_AMBIENTE: 'restrita' }, windowsHide: true });
  const copias = [];
  let saude = null;
  for (let i = 0; i < 30 && !saude; i++) {
    try { const r = await fetch(SERVICO); if (r.ok) saude = await r.json(); } catch (e) { await new Promise((ok) => setTimeout(ok, 200)); }
  }
  if (!saude || saude.ambiente !== 'restrita') { serv.kill(); throw new Error('PARADO: o serviço de teste não subiu no ambiente de testes'); }
  if (!saude.emissores || !saude.emissores['CNPJ 2']) { serv.kill(); throw new Error('PARADO: o serviço não conhece o CNPJ 2 (nfse-config.json)'); }
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const reaisAntes = JSON.stringify((await lista(CAD, T)).filter((n) => n.fields.Ambiente === 'Producao'));
  const apagar = [];
  const criar = async (tabela, fields) => { const r = await local('POST', `/v0/${CAD}/${tabela}`, { fields }); apagar.unshift([tabela, r.id]); return r; };

  try {
    await t.entrarComUsuarioDeTeste();
    // Cópia do fluxo ligada ao serviço de teste (5699). A 2ª copia faz de conta que o serviço é o antigo
    // (sem a lista de emissores) para provar a trava do CNPJ 2.
    const wf = (await t.n8n('GET', '/workflows?limit=250')).data.find((w) => w.name === 'App - Notas fiscais');
    const paraTeste = (nodes) => nodes.map((n) => {
      const j = JSON.stringify(n.parameters || {});
      return j.includes('127.0.0.1:5691') ? { ...n, parameters: JSON.parse(j.replace(/127\.0\.0\.1:5691/g, `127.0.0.1:${PORTA_TESTE}`)) } : n;
    });
    const copia = await t.copiaDeTeste(wf.id, { ajustar: paraTeste });
    copias.push(copia);
    const copiaVelha = await t.copiaDeTeste(wf.id, {
      ajustar: paraTeste,
      simulacoes: { 'Status do servico': "return [{ json: { ok: true, ambiente: 'restrita', serie: 1 } }];" },
    });
    copias.push(copiaVelha);
    await t.esperar(1500);
    const app = (dados) => chamar(copia.caminho, dados);
    const appVelho = (dados) => chamar(copiaVelha.caminho, dados);

    const cli = await criar('Entidades_Cadastradas', { Razao_Social_Nome: 'TESTE NFSE CLIENTE FICTICIO', CPF_CNPJ: '11222333000181', Tipo_Documento: 'CNPJ - Condomínio', Status: 'Ativo', Exigencia_Fiscal: 'Exige Nota Fiscal' });
    const lCnpj = await criar('Locais_Atendimento', { Nome_do_Local: 'Endereço do CNPJ', Endereco_Completo: 'RUA DE TESTE, 1, CEP 89201-000', Bairro_Cidade: 'CENTRO / JOINVILLE - SC', Cliente_Vinculado: [cli.id], Status: 'Ativo' });
    const lObra = await criar('Locais_Atendimento', { Nome_do_Local: 'Outra obra', Endereco_Completo: 'RUA DA OBRA, 22, BLOCO B, CEP 89202-000', Bairro_Cidade: 'GLÓRIA / Joinville - SC', Cliente_Vinculado: [cli.id], Status: 'Ativo' });
    const cpf = await criar('Entidades_Cadastradas', { Razao_Social_Nome: 'TESTE NFSE PESSOA FICTICIA', CPF_CNPJ: '52998224725', Tipo_Documento: 'CPF - Pessoa Física', Status: 'Ativo' });
    await criar('Locais_Atendimento', { Nome_do_Local: 'Endereço do CNPJ', Endereco_Completo: 'RUA DE TESTE, 2, CEP 89201-000', Bairro_Cidade: 'CENTRO / JOINVILLE - SC', Cliente_Vinculado: [cpf.id], Status: 'Ativo' });
    const fora = await criar('Entidades_Cadastradas', { Razao_Social_Nome: 'TESTE NFSE FORA', CPF_CNPJ: '11222333000181', Status: 'Ativo' });
    await criar('Locais_Atendimento', { Nome_do_Local: 'Endereço do CNPJ', Endereco_Completo: 'RUA X, 3, CEP 88000-000', Bairro_Cidade: 'CENTRO / FLORIANÓPOLIS - SC', Cliente_Vinculado: [fora.id], Status: 'Ativo' });
    const semEnd = await criar('Entidades_Cadastradas', { Razao_Social_Nome: 'TESTE NFSE SEM ENDERECO', CPF_CNPJ: '11222333000181', Status: 'Ativo' });
    const semDoc = await criar('Entidades_Cadastradas', { Razao_Social_Nome: 'TESTE NFSE SEM DOCUMENTO', Status: 'Ativo' });
    await criar('Locais_Atendimento', { Nome_do_Local: 'Endereço do CNPJ', Endereco_Completo: 'RUA X, 3, CEP 89201-000', Bairro_Cidade: 'CENTRO / JOINVILLE - SC', Cliente_Vinculado: [semDoc.id], Status: 'Ativo' });
    const quebrado = await criar('Entidades_Cadastradas', { Razao_Social_Nome: 'TESTE NFSE ENDERECO QUEBRADO', CPF_CNPJ: '11222333000181', Status: 'Ativo' });
    await criar('Locais_Atendimento', { Nome_do_Local: 'Endereço do CNPJ', Endereco_Completo: 'RUA SEM NADA', Bairro_Cidade: 'JOINVILLE', Cliente_Vinculado: [quebrado.id], Status: 'Ativo' });

    const pedido = (extra) => ({ clienteId: cli.id, descricao: SERV, valor: '1,00', ...extra });
    const guardarNota = (id) => { if (id) apagar.unshift([T, id]); };

    // ---- acesso e entrada ----
    const semToken = await (await fetch('http://localhost:5678/webhook/notas-fiscais', { method: 'POST', body: new URLSearchParams({ acao: 'listar', tokenAcesso: 'errado' }) })).json();
    confere('sem login é recusado', semToken.acessoNegado === true, semToken);
    confere('ação inválida', (await app({ acao: 'apagar' })).ok === false);
    confere('preparar sem cliente', (await app({ acao: 'preparar', descricao: SERV, valor: '1' })).ok === false);
    confere('preparar sem descrição', (await app(pedido({ acao: 'preparar', descricao: ' ' }))).ok === false);
    confere('preparar com descrição acima de 1100', (await app(pedido({ acao: 'preparar', descricao: 'x'.repeat(1101) }))).ok === false);
    for (const v of ['0', '-1', 'abc', '1,2,3', '']) confere(`preparar com valor "${v}"`, (await app(pedido({ acao: 'preparar', valor: v }))).ok === false);

    // ---- listar ----
    const l0 = await app({ acao: 'listar' });
    confere('listar: ok e diz o ambiente', l0.ok === true && l0.ambiente === 'Testes', { ok: l0.ok, ambiente: l0.ambiente });
    confere('listar: traz as notas reais, sem o XML', l0.notas.filter((n) => n.ambiente === 'Producao').length >= 2 && !JSON.stringify(l0.notas).includes('<NFSe'));

    // ---- preparar: nada é gravado nem enviado ----
    const qtd = (await lista(CAD, T)).length;
    const p = await app(pedido({ acao: 'preparar' }));
    confere('preparar: pode emitir', p.ok === true && p.podeEmitir === true && p.problemas.length === 0, p);
    confere('preparar: tomador do cadastro', p.tomador && p.tomador.nome === 'TESTE NFSE CLIENTE FICTICIO' && p.tomador.tipo === 'CNPJ' && p.tomador.endereco.includes('RUA DE TESTE, 1'), p.tomador);
    confere('preparar: obra = endereço do cliente por padrão', p.obra.includes('RUA DE TESTE, 1'), p.obra);
    confere('preparar: valor com vírgula vira 1.00', p.valor === '1.00', p.valor);
    for (const [v, esperado] of [['1.290,50', '1290.50'], ['290', '290.00'], ['290.5', '290.50']]) confere(`preparar: valor ${v}`, (await app(pedido({ acao: 'preparar', valor: v }))).valor === esperado);
    const pObra = await app(pedido({ acao: 'preparar', localId: lObra.id }));
    confere('preparar: outra obra, com complemento e acento', pObra.obra.includes('RUA DA OBRA, 22, BLOCO B') && pObra.tomador.endereco.includes('RUA DE TESTE, 1') && pObra.podeEmitir === true, pObra);
    const pAlheia = await app(pedido({ acao: 'preparar', clienteId: cpf.id, localId: lObra.id }));
    confere('preparar: obra de outro cliente é barrada', pAlheia.podeEmitir === false, pAlheia);
    const pFora = await app(pedido({ acao: 'preparar', clienteId: fora.id }));
    confere('preparar: fora de Joinville é barrado', pFora.podeEmitir === false && /fora de Joinville/.test(pFora.problemas.join()), pFora);
    const pSem = await app(pedido({ acao: 'preparar', clienteId: semEnd.id }));
    confere('preparar: sem endereço é barrado', pSem.podeEmitir === false, pSem);
    const pDoc = await app(pedido({ acao: 'preparar', clienteId: semDoc.id }));
    confere('preparar: sem documento é barrado', pDoc.podeEmitir === false, pDoc);
    const pQue = await app(pedido({ acao: 'preparar', clienteId: quebrado.id }));
    confere('preparar: endereço incompleto é barrado', pQue.podeEmitir === false && /falta/.test(pQue.problemas.join()), pQue);
    const pCpf = await app(pedido({ acao: 'preparar', clienteId: cpf.id }));
    confere('preparar: cliente com CPF', pCpf.podeEmitir === true && pCpf.tomador.tipo === 'CPF', pCpf);
    confere('preparar: não gravou nada', (await lista(CAD, T)).length === qtd);

    // ---- emitir ----
    const semConfirmar = await app(pedido({ acao: 'emitir' }));
    confere('emitir sem confirmar é recusado', semConfirmar.ok === false && (await lista(CAD, T)).length === qtd, semConfirmar);
    const eFora = await app(pedido({ acao: 'emitir', confirmar: '1', clienteId: fora.id }));
    confere('emitir fora de Joinville é recusado e nada é gravado', eFora.ok === false && (await lista(CAD, T)).length === qtd, eFora);

    const n1 = await app(pedido({ acao: 'emitir', confirmar: '1' }));
    guardarNota(n1.nota && n1.nota.id);
    confere('emitir: nota aceita no ambiente de testes', n1.ok === true && n1.ambiente === 'Testes' && n1.nota && /^\d{50}$/.test(n1.nota.chave) && n1.nota.situacao === '107', n1);
    const reg = await local('GET', `/v0/${CAD}/${T}/${n1.nota.id}`);
    confere('emitir: linha registrada como Emitida, ambiente Testes', reg.fields.Status === 'Emitida' && reg.fields.Ambiente === 'Testes' && reg.fields.Chave_Acesso === n1.nota.chave, { ...reg.fields, Xml_Nota: undefined });
    confere('emitir: XML guardado, de teste', String(reg.fields.Xml_Nota).includes('<tpAmb>2</tpAmb>') && String(reg.fields.Xml_Nota).includes('TESTE NFSE CLIENTE FICTICIO'));
    confere('emitir: competência e valor', reg.fields.Valor === 1 && reg.fields.Competencia === t.hojeISO());
    // PDF da nota (16/11/2026): gerado pelo banco local assim que a nota fica Emitida, e já vem na resposta.
    const pdfReg = (reg.fields.Pdf_Nota || [])[0] || {};
    confere('emitir: a nota já tem o PDF guardado', /^att[0-9a-f]{32}$/.test(pdfReg.id || '') && pdfReg.type === 'application/pdf' && pdfReg.size > 5000, reg.fields.Pdf_Nota);
    confere('emitir: a resposta ao app traz o PDF', n1.nota.pdf && /\/webhook\/anexo\?id=att/.test(n1.nota.pdf.url) && /^NFS-e \d+ - TESTE NFSE CLIENTE FICTICIO\.pdf$/.test(n1.nota.pdf.nome), n1.nota.pdf);
    const bytesPdf = pdfReg.id ? fs.readFileSync(PASTA_ANEXOS + pdfReg.id) : Buffer.alloc(0);
    confere('emitir: o arquivo guardado é um PDF de uma página', bytesPdf.slice(0, 5).toString() === '%PDF-' && (bytesPdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length === 1);
    const l1pdf = await app({ acao: 'listar', clienteId: cli.id });
    confere('listar: a nota traz o PDF', l1pdf.notas.some((n) => n.id === n1.nota.id && n.pdf && n.pdf.url === n1.nota.pdf.url), l1pdf.notas.map((n) => n.pdf));

    // ---- não duplica ----
    const rep = await app(pedido({ acao: 'emitir', confirmar: '1' }));
    confere('nota igual no mesmo dia é barrada', rep.ok === false && rep.repetida && rep.repetida.id === n1.nota.id, rep);
    const pRep = await app(pedido({ acao: 'preparar' }));
    confere('preparar avisa da nota igual', pRep.repetida && pRep.repetida.id === n1.nota.id, pRep);
    const n2 = await app(pedido({ acao: 'emitir', confirmar: '1', confirmarRepetida: '1' }));
    guardarNota(n2.nota && n2.nota.id);
    confere('com confirmação explícita, emite com outro número', n2.ok === true && n2.nota.numeroDps > n1.nota.numeroDps, n2);
    const dif = await app(pedido({ acao: 'emitir', confirmar: '1', descricao: SERV + ' Outra.' }));
    guardarNota(dif.nota && dif.nota.id);
    confere('descrição diferente não conta como repetida', dif.ok === true, dif);

    // ---- recusa do governo: CPF fictício não existe na Receita ----
    const rec = await app(pedido({ acao: 'emitir', confirmar: '1', clienteId: cpf.id }));
    guardarNota(rec.notaId);
    confere('recusa do governo volta explicada', rec.ok === false && rec.recusada === true && rec.erros.some((e) => e.codigo === 'E0207'), rec);
    const regRec = await local('GET', `/v0/${CAD}/${T}/${rec.notaId}`);
    confere('recusa: linha fica como Recusada, com o motivo', regRec.fields.Status === 'Recusada' && /E0207/.test(regRec.fields.Erro), regRec.fields);
    const rec2 = await app(pedido({ acao: 'emitir', confirmar: '1', clienteId: cpf.id }));
    guardarNota(rec2.notaId);
    confere('nota recusada não bloqueia nova tentativa (e usa outro número)', rec2.recusada === true && rec2.notaId !== rec.notaId, rec2);

    // ---- sem resposta: conferir ----
    await local('PATCH', `/v0/${CAD}/${T}/${n1.nota.id}`, { fields: { Status: 'Sem resposta', Chave_Acesso: '', Numero_NFSe: '', Situacao: '', Xml_Nota: '' } });
    const c1 = await app({ acao: 'conferir', notaId: n1.nota.id });
    confere('conferir: nota que saiu volta como emitida', c1.ok === true && c1.existe === true && c1.chave === n1.nota.chave && c1.situacao === '107', c1);
    const regC1 = await local('GET', `/v0/${CAD}/${T}/${n1.nota.id}`);
    confere('conferir: linha atualizada, com XML', regC1.fields.Status === 'Emitida' && regC1.fields.Chave_Acesso === n1.nota.chave && String(regC1.fields.Xml_Nota).includes(n1.nota.chave), { s: regC1.fields.Status });
    const nunca = await criar(T, { Ambiente: 'Testes', Serie: 1, Numero_DPS: 999999, Status: 'Sem resposta', Tomador_Documento: '11222333000181', Descricao: 'TESTE' });
    const c2 = await app({ acao: 'conferir', notaId: nunca.id });
    confere('conferir: número que o governo não tem vira Recusada', c2.ok === true && c2.existe === false && (await local('GET', `/v0/${CAD}/${T}/${nunca.id}`)).fields.Status === 'Recusada', c2);
    confere('conferir: nota já emitida é recusada', (await app({ acao: 'conferir', notaId: n1.nota.id })).ok === false);
    const real = (await lista(CAD, T)).find((n) => n.fields.Ambiente === 'Producao');
    confere('conferir: nota real emitida é recusada', (await app({ acao: 'conferir', notaId: real.id })).ok === false);
    await local('PATCH', `/v0/${CAD}/${T}/${nunca.id}`, { fields: { Status: 'Sem resposta', Ambiente: 'Producao' } });
    confere('conferir: nota de outro ambiente é recusada', (await app({ acao: 'conferir', notaId: nunca.id })).ok === false);
    await local('PATCH', `/v0/${CAD}/${T}/${nunca.id}`, { fields: { Ambiente: 'Testes' } });

    // ---- segundo emissor (CNPJ 2, fase 4, 13/11/2026) ----
    confere('emissor: cliente sem "Atendido por" emite pelo CNPJ 1', p.emissor === 'CNPJ 1' && reg.fields.Emissor === 'CNPJ 1' && reg.fields.Serie === 1, { p: p.emissor, reg: reg.fields.Emissor });
    const cli2 = await criar('Entidades_Cadastradas', { Razao_Social_Nome: 'TESTE NFSE CLIENTE CNPJ2', CPF_CNPJ: '11222333000181', Tipo_Documento: 'CNPJ - Condomínio', Status: 'Ativo', Exigencia_Fiscal: 'Exige Nota Fiscal', Atendido_Por: 'CNPJ 2' });
    await criar('Locais_Atendimento', { Nome_do_Local: 'Endereço do CNPJ', Endereco_Completo: 'RUA DE TESTE, 5, CEP 89201-000', Bairro_Cidade: 'CENTRO / JOINVILLE - SC', Cliente_Vinculado: [cli2.id], Status: 'Ativo' });
    const p2 = await app(pedido({ acao: 'preparar', clienteId: cli2.id }));
    confere('emissor: cliente do CNPJ 2 aparece com emissor CNPJ 2', p2.ok === true && p2.emissor === 'CNPJ 2' && p2.podeEmitir === true, p2);
    const v2 = await appVelho(pedido({ acao: 'preparar', clienteId: cli2.id }));
    confere('trava: serviço antigo (sem emissores) não prepara nota do CNPJ 2', v2.ok === false && v2.servicoFora === true, v2);
    const v1 = await appVelho(pedido({ acao: 'preparar' }));
    confere('trava: serviço antigo continua servindo o CNPJ 1', v1.ok === true && v1.emissor === 'CNPJ 1', v1);
    const eV = await appVelho(pedido({ acao: 'emitir', confirmar: '1', clienteId: cli2.id }));
    confere('trava: serviço antigo não emite nota do CNPJ 2 e nada é gravado', eV.ok === false && eV.servicoFora === true && !(await lista(CAD, T)).some((n) => n.fields.Emissor === 'CNPJ 2' && n.fields.Ambiente === 'Testes'), eV);
    const m1 = await app(pedido({ acao: 'emitir', confirmar: '1', clienteId: cli2.id }));
    guardarNota(m1.nota && m1.nota.id);
    confere('CNPJ 2: nota aceita no ambiente de testes', m1.ok === true && m1.ambiente === 'Testes' && m1.nota && /^\d{50}$/.test(m1.nota.chave) && m1.nota.situacao === '107', m1);
    const regM1 = await local('GET', `/v0/${CAD}/${T}/${m1.nota.id}`);
    const cfg = JSON.parse(require('fs').readFileSync('C:/Users/rediv/nfse-config.json', 'utf8').replace(/^\uFEFF/, ''));
    confere('CNPJ 2: linha registrada com Emissor CNPJ 2', regM1.fields.Status === 'Emitida' && regM1.fields.Emissor === 'CNPJ 2', { ...regM1.fields, Xml_Nota: undefined });
    confere('CNPJ 2: o prestador no XML é o CNPJ 2', String(regM1.fields.Xml_Nota).includes(`<CNPJ>${cfg.emissores['CNPJ 2'].cnpj}</CNPJ>`) && String(regM1.fields.Id_DPS).includes(cfg.emissores['CNPJ 2'].cnpj), regM1.fields.Id_DPS);
    confere('CNPJ 2: o identificador não leva o CNPJ 1', !String(regM1.fields.Id_DPS).includes(cfg.emissores['CNPJ 1'].cnpj), regM1.fields.Id_DPS);
    // Numeração própria: a série do CNPJ 2 anda sozinha, sem olhar as notas do CNPJ 1.
    const m2 = await app(pedido({ acao: 'emitir', confirmar: '1', confirmarRepetida: '1', clienteId: cli2.id }));
    guardarNota(m2.nota && m2.nota.id);
    confere('CNPJ 2: segunda nota usa o número seguinte do CNPJ 2', m2.ok === true && m2.nota.numeroDps > m1.nota.numeroDps, { a: m1.nota && m1.nota.numeroDps, b: m2.nota && m2.nota.numeroDps });
    const lm = await app({ acao: 'listar', clienteId: cli2.id });
    confere('listar: cada nota traz o emissor', lm.notas.length === 2 && lm.notas.every((n) => n.emissor === 'CNPJ 2'), lm.notas.map((n) => n.emissor));
    const l1 = await app({ acao: 'listar', clienteId: cli.id });
    confere('listar: notas antigas aparecem como CNPJ 1', l1.notas.length > 0 && l1.notas.every((n) => n.emissor === 'CNPJ 1'), l1.notas.map((n) => n.emissor));
    // Conferir "Sem resposta" de nota do CNPJ 2: a consulta vai pelo emissor certo.
    await local('PATCH', `/v0/${CAD}/${T}/${m1.nota.id}`, { fields: { Status: 'Sem resposta', Chave_Acesso: '', Numero_NFSe: '', Situacao: '', Xml_Nota: '' } });
    const cc = await app({ acao: 'conferir', notaId: m1.nota.id });
    confere('CNPJ 2: conferir acha a nota no governo pelo emissor certo', cc.ok === true && cc.existe === true && cc.chave === m1.nota.chave, cc);
    const ccV = await appVelho({ acao: 'conferir', notaId: m2.nota.id });
    confere('trava: conferir nota do CNPJ 2 com serviço antigo é recusado', ccV.ok === false, ccV);

    // ---- PDF de cada nota emitida, nos dois CNPJs (16/11/2026) ----
    // O número que aparece no PDF é o que o governo deu àquela nota (vem do XML devolvido na emissão), e o prestador
    // é o CNPJ que emitiu. Lido de dentro de cada PDF guardado, nota por nota.
    const numerosPorEmissor = {};
    for (const x of [n1, n2, dif, m1, m2]) {
      const r = (await local('GET', `/v0/${CAD}/${T}/${x.nota.id}`)).fields;
      const em = r.Emissor || 'CNPJ 1';
      const outro = em === 'CNPJ 1' ? 'CNPJ 2' : 'CNPJ 1';
      const anexo = (r.Pdf_Nota || [])[0];
      const txt = anexo ? textoDoPdf(anexo.id) : '';
      const rotulo = `PDF ${em}, nota nº ${r.Numero_NFSe}`;
      confere(`${rotulo}: o número é o que o governo deu (o mesmo do XML e do sistema)`,
        Boolean(anexo) && /^\d+$/.test(r.Numero_NFSe || '') && String(r.Xml_Nota).includes(`<nNFSe>${r.Numero_NFSe}</nNFSe>`) && txt.includes(`(${r.Numero_NFSe}) Tj`), { numero: r.Numero_NFSe, temPdf: Boolean(anexo) });
      confere(`${rotulo}: a chave e o rodapé são desta nota`, txt.includes(`(${r.Chave_Acesso}) Tj`) && txt.includes(`(${r.Numero_NFSe} / ${r.Chave_Acesso}) Tj`));
      confere(`${rotulo}: o pedido (DPS) é o desta nota`, txt.includes(`(${r.Numero_DPS}) Tj`));
      confere(`${rotulo}: o prestador é o ${em}, não o ${outro}`, txt.includes(`(${formatarCnpj(cfg.emissores[em].cnpj)}) Tj`) && !txt.includes(formatarCnpj(cfg.emissores[outro].cnpj)));
      (numerosPorEmissor[em] = numerosPorEmissor[em] || []).push(r.Numero_NFSe);
    }
    confere('PDF: cada nota tem o seu próprio número, sem repetir, nos dois CNPJs',
      (numerosPorEmissor['CNPJ 1'] || []).length === 3 && (numerosPorEmissor['CNPJ 2'] || []).length === 2
      && Object.values(numerosPorEmissor).every((l) => new Set(l).size === l.length), numerosPorEmissor);
    console.log('       números das notas de teste:', JSON.stringify(numerosPorEmissor));

    // ---- cancelar (16/11/2026): evento e101101 no ambiente de testes, nos dois CNPJs ----
    const cancelar = (nota, extra) => app({ acao: 'cancelar', notaId: nota.nota.id, motivo: '1', justificativa: 'Teste de cancelamento pelo sistema.', confirmar: '1', ...extra });
    confere('cancelar sem motivo é recusado', (await cancelar(dif, { motivo: '' })).ok === false);
    confere('cancelar com motivo fora da lista é recusado', (await cancelar(dif, { motivo: '3' })).ok === false);
    confere('cancelar com justificativa curta é recusado', (await cancelar(dif, { justificativa: 'curta demais' })).ok === false);
    confere('cancelar com justificativa acima de 255 é recusado', (await cancelar(dif, { justificativa: 'x'.repeat(256) })).ok === false);
    confere('cancelar sem confirmar é recusado', (await cancelar(dif, { confirmar: '' })).ok === false);
    confere('cancelar nota real (produção) é recusado aqui, sem ir ao governo', (await app({ acao: 'cancelar', notaId: real.id, motivo: '1', justificativa: 'Teste de cancelamento pelo sistema.', confirmar: '1' })).ok === false);
    confere('cancelar nota recusada é recusado', (await app({ acao: 'cancelar', notaId: rec.notaId, motivo: '1', justificativa: 'Teste de cancelamento pelo sistema.', confirmar: '1' })).ok === false);
    const cx = await cancelar(dif);
    confere('cancelar: o governo aceita e a resposta diz que foi cancelada', cx.ok === true && cx.cancelada === true && !cx.jaEstava, cx);
    const regCx = (await local('GET', `/v0/${CAD}/${T}/${dif.nota.id}`)).fields;
    confere('cancelar: linha fica Cancelada, com data, motivo e o evento do governo', regCx.Status === 'Cancelada' && Boolean(regCx.Cancelada_Em)
      && regCx.Motivo_Cancelamento === 'Erro na emissão: Teste de cancelamento pelo sistema.' && /<e101101>/.test(regCx.Xml_Cancelamento || '') && String(regCx.Xml_Cancelamento).includes(dif.nota.chave), { ...regCx, Xml_Nota: undefined, Xml_Cancelamento: String(regCx.Xml_Cancelamento || '').slice(0, 80) });
    confere('cancelar: a nota continua com o PDF', (regCx.Pdf_Nota || []).length === 1);
    confere('cancelar de novo é recusado aqui (já cancelada)', (await cancelar(dif)).ok === false);
    // Cancelada pelo portal: o sistema ainda acha que está emitida; o governo responde E0840 e o sistema só marca.
    await local('PATCH', `/v0/${CAD}/${T}/${dif.nota.id}`, { fields: { Status: 'Emitida', Cancelada_Em: null, Motivo_Cancelamento: '', Xml_Cancelamento: '' } });
    const ja = await cancelar(dif, { justificativa: 'Nota cancelada antes no portal do governo.' });
    const regJa = (await local('GET', `/v0/${CAD}/${T}/${dif.nota.id}`)).fields;
    confere('cancelada no portal: o sistema reconhece (E0840) e marca como Cancelada', ja.ok === true && ja.jaEstava === true && regJa.Status === 'Cancelada' && /já estava cancelada/.test(regJa.Motivo_Cancelamento), { ja, s: regJa.Status, m: regJa.Motivo_Cancelamento });
    const cx2 = await cancelar(m2, { motivo: '2', justificativa: 'Serviço não prestado (teste do CNPJ 2).' });
    const regCx2 = (await local('GET', `/v0/${CAD}/${T}/${m2.nota.id}`)).fields;
    confere('CNPJ 2: cancela com o certificado do CNPJ 2', cx2.ok === true && regCx2.Status === 'Cancelada' && regCx2.Motivo_Cancelamento.startsWith('Serviço não prestado: ')
      && String(regCx2.Xml_Cancelamento).includes(`<CNPJAutor>${cfg.emissores['CNPJ 2'].cnpj}</CNPJAutor>`), { cx2, s: regCx2.Status });
    const lcx = await app({ acao: 'listar', clienteId: cli.id });
    const naLista = lcx.notas.find((n) => n.id === dif.nota.id) || {};
    confere('listar: a nota cancelada vem com status, data e motivo, sem o XML', naLista.status === 'Cancelada' && Boolean(naLista.canceladaEm) && /já estava cancelada/.test(naLista.motivoCancelamento) && !JSON.stringify(lcx).includes('<e101101'), naLista);
    const pDepois = await app(pedido({ acao: 'preparar', descricao: SERV + ' Outra.' }));
    confere('nota cancelada não conta como "nota igual hoje"', pDepois.ok === true && !pDepois.repetida, pDepois.repetida);

    // ---- listar filtra por cliente ----
    const lc = await app({ acao: 'listar', clienteId: cli.id });
    confere('listar por cliente', lc.notas.length === 3 && lc.notas.every((n) => n.clienteId === cli.id) && lc.notas[0].numeroDps >= lc.notas[2].numeroDps, lc.notas.map((n) => n.numeroDps));
  } finally {
    serv.kill();
    // Os PDFs das notas de teste saem junto com elas (o arquivo fica na pasta de anexos do PC).
    for (const [tabela, id] of apagar) {
      if (tabela !== T) continue;
      const r = await local('GET', `/v0/${CAD}/${T}/${id}`).catch(() => null);
      for (const a of (r && r.fields && r.fields.Pdf_Nota) || []) {
        if (!/^att[0-9a-f]{32}$/.test(a.id)) continue;
        pdfsDeTeste.push(a.id);
        for (const f of [a.id, a.id + '.json']) { try { fs.unlinkSync(PASTA_ANEXOS + f); } catch (e) { /* já saiu */ } }
      }
    }
    for (const [tabela, id] of apagar) await local('DELETE', `/v0/${CAD}/${tabela}/${id}`).catch((e) => console.log('não apagou', tabela, id, e.message));
    await t.sairEApagarUsuarioDeTeste();
    await t.apagarCopias(copias);
  }

  const depois = await t.contarTudo();
  confere('as quantidades voltaram ao que eram', JSON.stringify(depois) === JSON.stringify(antes), { antes, depois });
  confere('os PDFs das notas de teste foram apagados', pdfsDeTeste.length > 0 && pdfsDeTeste.every((a) => !fs.existsSync(PASTA_ANEXOS + a)), pdfsDeTeste.length);
  confere('as notas reais não mudaram', JSON.stringify((await lista(CAD, T)).filter((n) => n.fields.Ambiente === 'Producao')) === reaisAntes);
  const erros = await t.errosDesde(inicio);
  confere('o n8n não registrou erro', erros.length === 0, erros);
  const { ok, falhas } = t.placar();
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e.message); process.exitCode = 1; });
