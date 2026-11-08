// Fluxo "App - Notas fiscais": só roda com o serviço no ambiente de testes do governo (notas sem
// validade), com clientes fictícios apagados no fim. Recusa rodar se o serviço estiver em produção.
// Uso: node banco/testes/testar-fluxo-notas.js
const t = require('./comum');
const { CAD, local, lista, chamar, confere } = t;

const T = 'Notas_Fiscais';
const SERVICO = 'http://127.0.0.1:5691/saude';
const SERV = 'Instalação de teste. TESTE SEM VALIDADE JURIDICA. Valor total = R$ 1,00.';

(async () => {
  const saude = await (await fetch(SERVICO)).json();
  if (saude.ambiente !== 'restrita') throw new Error('PARADO: o serviço de notas não está no ambiente de testes');
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const reaisAntes = JSON.stringify((await lista(CAD, T)).filter((n) => n.fields.Ambiente === 'Producao'));
  const apagar = [];
  const criar = async (tabela, fields) => { const r = await local('POST', `/v0/${CAD}/${tabela}`, { fields }); apagar.unshift([tabela, r.id]); return r; };

  try {
    await t.entrarComUsuarioDeTeste();

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
    confere('ação inválida', (await chamar('notas-fiscais', { acao: 'apagar' })).ok === false);
    confere('preparar sem cliente', (await chamar('notas-fiscais', { acao: 'preparar', descricao: SERV, valor: '1' })).ok === false);
    confere('preparar sem descrição', (await chamar('notas-fiscais', pedido({ acao: 'preparar', descricao: ' ' }))).ok === false);
    confere('preparar com descrição acima de 1100', (await chamar('notas-fiscais', pedido({ acao: 'preparar', descricao: 'x'.repeat(1101) }))).ok === false);
    for (const v of ['0', '-1', 'abc', '1,2,3', '']) confere(`preparar com valor "${v}"`, (await chamar('notas-fiscais', pedido({ acao: 'preparar', valor: v }))).ok === false);

    // ---- listar ----
    const l0 = await chamar('notas-fiscais', { acao: 'listar' });
    confere('listar: ok e diz o ambiente', l0.ok === true && l0.ambiente === 'Testes', { ok: l0.ok, ambiente: l0.ambiente });
    confere('listar: traz as notas reais, sem o XML', l0.notas.filter((n) => n.ambiente === 'Producao').length >= 2 && !JSON.stringify(l0.notas).includes('<NFSe'));

    // ---- preparar: nada é gravado nem enviado ----
    const qtd = (await lista(CAD, T)).length;
    const p = await chamar('notas-fiscais', pedido({ acao: 'preparar' }));
    confere('preparar: pode emitir', p.ok === true && p.podeEmitir === true && p.problemas.length === 0, p);
    confere('preparar: tomador do cadastro', p.tomador && p.tomador.nome === 'TESTE NFSE CLIENTE FICTICIO' && p.tomador.tipo === 'CNPJ' && p.tomador.endereco.includes('RUA DE TESTE, 1'), p.tomador);
    confere('preparar: obra = endereço do cliente por padrão', p.obra.includes('RUA DE TESTE, 1'), p.obra);
    confere('preparar: valor com vírgula vira 1.00', p.valor === '1.00', p.valor);
    for (const [v, esperado] of [['1.290,50', '1290.50'], ['290', '290.00'], ['290.5', '290.50']]) confere(`preparar: valor ${v}`, (await chamar('notas-fiscais', pedido({ acao: 'preparar', valor: v }))).valor === esperado);
    const pObra = await chamar('notas-fiscais', pedido({ acao: 'preparar', localId: lObra.id }));
    confere('preparar: outra obra, com complemento e acento', pObra.obra.includes('RUA DA OBRA, 22, BLOCO B') && pObra.tomador.endereco.includes('RUA DE TESTE, 1') && pObra.podeEmitir === true, pObra);
    const pAlheia = await chamar('notas-fiscais', pedido({ acao: 'preparar', clienteId: cpf.id, localId: lObra.id }));
    confere('preparar: obra de outro cliente é barrada', pAlheia.podeEmitir === false, pAlheia);
    const pFora = await chamar('notas-fiscais', pedido({ acao: 'preparar', clienteId: fora.id }));
    confere('preparar: fora de Joinville é barrado', pFora.podeEmitir === false && /fora de Joinville/.test(pFora.problemas.join()), pFora);
    const pSem = await chamar('notas-fiscais', pedido({ acao: 'preparar', clienteId: semEnd.id }));
    confere('preparar: sem endereço é barrado', pSem.podeEmitir === false, pSem);
    const pDoc = await chamar('notas-fiscais', pedido({ acao: 'preparar', clienteId: semDoc.id }));
    confere('preparar: sem documento é barrado', pDoc.podeEmitir === false, pDoc);
    const pQue = await chamar('notas-fiscais', pedido({ acao: 'preparar', clienteId: quebrado.id }));
    confere('preparar: endereço incompleto é barrado', pQue.podeEmitir === false && /falta/.test(pQue.problemas.join()), pQue);
    const pCpf = await chamar('notas-fiscais', pedido({ acao: 'preparar', clienteId: cpf.id }));
    confere('preparar: cliente com CPF', pCpf.podeEmitir === true && pCpf.tomador.tipo === 'CPF', pCpf);
    confere('preparar: não gravou nada', (await lista(CAD, T)).length === qtd);

    // ---- emitir ----
    const semConfirmar = await chamar('notas-fiscais', pedido({ acao: 'emitir' }));
    confere('emitir sem confirmar é recusado', semConfirmar.ok === false && (await lista(CAD, T)).length === qtd, semConfirmar);
    const eFora = await chamar('notas-fiscais', pedido({ acao: 'emitir', confirmar: '1', clienteId: fora.id }));
    confere('emitir fora de Joinville é recusado e nada é gravado', eFora.ok === false && (await lista(CAD, T)).length === qtd, eFora);

    const n1 = await chamar('notas-fiscais', pedido({ acao: 'emitir', confirmar: '1' }));
    guardarNota(n1.nota && n1.nota.id);
    confere('emitir: nota aceita no ambiente de testes', n1.ok === true && n1.ambiente === 'Testes' && n1.nota && /^\d{50}$/.test(n1.nota.chave) && n1.nota.situacao === '107', n1);
    const reg = await local('GET', `/v0/${CAD}/${T}/${n1.nota.id}`);
    confere('emitir: linha registrada como Emitida, ambiente Testes', reg.fields.Status === 'Emitida' && reg.fields.Ambiente === 'Testes' && reg.fields.Chave_Acesso === n1.nota.chave, { ...reg.fields, Xml_Nota: undefined });
    confere('emitir: XML guardado, de teste', String(reg.fields.Xml_Nota).includes('<tpAmb>2</tpAmb>') && String(reg.fields.Xml_Nota).includes('TESTE NFSE CLIENTE FICTICIO'));
    confere('emitir: competência e valor', reg.fields.Valor === 1 && reg.fields.Competencia === t.hojeISO());

    // ---- não duplica ----
    const rep = await chamar('notas-fiscais', pedido({ acao: 'emitir', confirmar: '1' }));
    confere('nota igual no mesmo dia é barrada', rep.ok === false && rep.repetida && rep.repetida.id === n1.nota.id, rep);
    const pRep = await chamar('notas-fiscais', pedido({ acao: 'preparar' }));
    confere('preparar avisa da nota igual', pRep.repetida && pRep.repetida.id === n1.nota.id, pRep);
    const n2 = await chamar('notas-fiscais', pedido({ acao: 'emitir', confirmar: '1', confirmarRepetida: '1' }));
    guardarNota(n2.nota && n2.nota.id);
    confere('com confirmação explícita, emite com outro número', n2.ok === true && n2.nota.numeroDps > n1.nota.numeroDps, n2);
    const dif = await chamar('notas-fiscais', pedido({ acao: 'emitir', confirmar: '1', descricao: SERV + ' Outra.' }));
    guardarNota(dif.nota && dif.nota.id);
    confere('descrição diferente não conta como repetida', dif.ok === true, dif);

    // ---- recusa do governo: CPF fictício não existe na Receita ----
    const rec = await chamar('notas-fiscais', pedido({ acao: 'emitir', confirmar: '1', clienteId: cpf.id }));
    guardarNota(rec.notaId);
    confere('recusa do governo volta explicada', rec.ok === false && rec.recusada === true && rec.erros.some((e) => e.codigo === 'E0207'), rec);
    const regRec = await local('GET', `/v0/${CAD}/${T}/${rec.notaId}`);
    confere('recusa: linha fica como Recusada, com o motivo', regRec.fields.Status === 'Recusada' && /E0207/.test(regRec.fields.Erro), regRec.fields);
    const rec2 = await chamar('notas-fiscais', pedido({ acao: 'emitir', confirmar: '1', clienteId: cpf.id }));
    guardarNota(rec2.notaId);
    confere('nota recusada não bloqueia nova tentativa (e usa outro número)', rec2.recusada === true && rec2.notaId !== rec.notaId, rec2);

    // ---- sem resposta: conferir ----
    await local('PATCH', `/v0/${CAD}/${T}/${n1.nota.id}`, { fields: { Status: 'Sem resposta', Chave_Acesso: '', Numero_NFSe: '', Situacao: '', Xml_Nota: '' } });
    const c1 = await chamar('notas-fiscais', { acao: 'conferir', notaId: n1.nota.id });
    confere('conferir: nota que saiu volta como emitida', c1.ok === true && c1.existe === true && c1.chave === n1.nota.chave && c1.situacao === '107', c1);
    const regC1 = await local('GET', `/v0/${CAD}/${T}/${n1.nota.id}`);
    confere('conferir: linha atualizada, com XML', regC1.fields.Status === 'Emitida' && regC1.fields.Chave_Acesso === n1.nota.chave && String(regC1.fields.Xml_Nota).includes(n1.nota.chave), { s: regC1.fields.Status });
    const nunca = await criar(T, { Ambiente: 'Testes', Serie: 1, Numero_DPS: 999999, Status: 'Sem resposta', Tomador_Documento: '11222333000181', Descricao: 'TESTE' });
    const c2 = await chamar('notas-fiscais', { acao: 'conferir', notaId: nunca.id });
    confere('conferir: número que o governo não tem vira Recusada', c2.ok === true && c2.existe === false && (await local('GET', `/v0/${CAD}/${T}/${nunca.id}`)).fields.Status === 'Recusada', c2);
    confere('conferir: nota já emitida é recusada', (await chamar('notas-fiscais', { acao: 'conferir', notaId: n1.nota.id })).ok === false);
    const real = (await lista(CAD, T)).find((n) => n.fields.Ambiente === 'Producao');
    confere('conferir: nota real emitida é recusada', (await chamar('notas-fiscais', { acao: 'conferir', notaId: real.id })).ok === false);
    await local('PATCH', `/v0/${CAD}/${T}/${nunca.id}`, { fields: { Status: 'Sem resposta', Ambiente: 'Producao' } });
    confere('conferir: nota de outro ambiente é recusada', (await chamar('notas-fiscais', { acao: 'conferir', notaId: nunca.id })).ok === false);
    await local('PATCH', `/v0/${CAD}/${T}/${nunca.id}`, { fields: { Ambiente: 'Testes' } });

    // ---- listar filtra por cliente ----
    const lc = await chamar('notas-fiscais', { acao: 'listar', clienteId: cli.id });
    confere('listar por cliente', lc.notas.length === 3 && lc.notas.every((n) => n.clienteId === cli.id) && lc.notas[0].numeroDps >= lc.notas[2].numeroDps, lc.notas.map((n) => n.numeroDps));
  } finally {
    for (const [tabela, id] of apagar) await local('DELETE', `/v0/${CAD}/${tabela}/${id}`).catch((e) => console.log('não apagou', tabela, id, e.message));
    await t.sairEApagarUsuarioDeTeste();
  }

  const depois = await t.contarTudo();
  confere('as quantidades voltaram ao que eram', JSON.stringify(depois) === JSON.stringify(antes), { antes, depois });
  confere('as notas reais não mudaram', JSON.stringify((await lista(CAD, T)).filter((n) => n.fields.Ambiente === 'Producao')) === reaisAntes);
  const erros = await t.errosDesde(inicio);
  confere('o n8n não registrou erro', erros.length === 0, erros);
  const { ok, falhas } = t.placar();
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e.message); process.exitCode = 1; });
