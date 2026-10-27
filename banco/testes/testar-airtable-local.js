// Testes do "Airtable local": fórmulas usadas pelos fluxos, ordenação, páginas e gravações.
// As gravações usam só registros de teste, criados e apagados aqui mesmo; no fim confere que
// as quantidades de cada tabela voltaram ao que eram.
// Uso: node banco/testes/testar-airtable-local.js
const fs = require('fs');
const token = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8').match(/^token do airtable local:\s*(\S+)/m)[1];
const CAD = 'app6PyYmtFduIMp7B', FIN = 'appjAmWXV7Zr33UqE';

async function api(metodo, caminho, corpo) {
  const r = await fetch('http://127.0.0.1:5690' + caminho, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const txt = await r.text();
  return { status: r.status, json: txt ? JSON.parse(txt) : null };
}
const lista = async (base, tabela, params = '') => (await api('GET', `/v0/${base}/${tabela}?_itens=1${params}`)).json;
const f = (formula) => '&filterByFormula=' + encodeURIComponent(formula);

let falhas = 0, ok = 0;
function confere(nome, cond, detalhe) {
  if (cond) ok++; else { falhas++; console.log('FALHOU:', nome, detalhe === undefined ? '' : JSON.stringify(detalhe).slice(0, 300)); }
}

(async () => {
  const contar = async () => {
    const q = {};
    for (const [b, ts] of [[CAD, ['Entidades_Cadastradas', 'Locais_Atendimento', 'Contatos_Solicitantes', 'Chamados', 'Usuarios', 'Sessoes', 'Visitas']], [FIN, ['Despesas', 'Fornecedores', 'Recorrentes', 'Recebimentos', 'Config_Financeiro', 'Conferencias', 'Retiradas', 'Cartoes', 'Pagamentos_Fatura']]])
      for (const t of ts) q[t] = (await lista(b, t)).length;
    return q;
  };
  const antes = await contar();

  try {
    // ---- fórmulas usadas pelos fluxos ----
    // Chamados de teste (o sistema pode não ter nenhum): um de cada situação, longe da agenda real.
    const daqui = (dias) => new Date(Date.now() + dias * 86400000).toISOString();
    const deTeste = (await api('POST', `/v0/${CAD}/Chamados`, { records: [
      { fields: { Numero_Chamado: 990001, Status: 'Agendado', Reservado_Inicio: daqui(400), Reservado_Fim: daqui(400.1), Descricao_Solicitacao: 'TESTE MIGRACAO' } },
      { fields: { Numero_Chamado: 990002, Status: 'Em andamento', Reservado_Inicio: daqui(-3), Descricao_Solicitacao: 'TESTE MIGRACAO' } },
      { fields: { Numero_Chamado: 990003, Status: 'Concluído', Reservado_Inicio: daqui(401), Descricao_Solicitacao: 'TESTE MIGRACAO' } },
      { fields: { Numero_Chamado: 990004, Status: 'Cancelado', Descricao_Solicitacao: 'TESTE MIGRACAO' } },
      { fields: { Numero_Chamado: 990005, Descricao_Solicitacao: 'TESTE MIGRACAO' } },
    ] })).json.records;
    const chamados = await lista(CAD, 'Chamados');
    const st = (c) => c.fields.Status || '';
    confere('OR Agendado/Em andamento', (await lista(CAD, 'Chamados', f("OR({Status}='Agendado', {Status}='Em andamento')"))).length === chamados.filter((c) => ['Agendado', 'Em andamento'].includes(st(c))).length);
    confere("{Status}!='Concluído'", (await lista(CAD, 'Chamados', f("{Status}!='Concluído'"))).length === chamados.filter((c) => st(c) !== 'Concluído').length);
    confere('AND dois !=', (await lista(CAD, 'Chamados', f("AND({Status}!='Concluído', {Status}!='Cancelado')"))).length === chamados.filter((c) => !['Concluído', 'Cancelado'].includes(st(c))).length);
    const ontem = new Date(Date.now() - 86400000).toISOString();
    const seguintes = await lista(CAD, 'Chamados', f(`AND(NOT(OR({Status}='Concluído',{Status}='Cancelado')),{Reservado_Inicio},IS_AFTER({Reservado_Inicio},'${ontem}'))`));
    confere('fórmula do "Busca seguintes"', seguintes.length === chamados.filter((c) => !['Concluído', 'Cancelado'].includes(st(c)) && c.fields.Reservado_Inicio && new Date(c.fields.Reservado_Inicio) > new Date(ontem)).length);
    const um = chamados[3];
    confere('RECORD_ID() =', (await lista(CAD, 'Chamados', f(`RECORD_ID() = '${um.id}'`))).map((x) => x.id).join() === um.id);
    confere('OR de RECORD_ID', (await lista(CAD, 'Chamados', f(`OR(RECORD_ID()='${chamados[0].id}',RECORD_ID()='${chamados[1].id}')`))).length === 2);
    confere('FALSE()', (await lista(CAD, 'Chamados', f('FALSE()'))).length === 0);
    const ents = await lista(CAD, 'Entidades_Cadastradas');
    const e1 = ents.find((e) => e.fields.CPF_CNPJ);
    confere('CPF_CNPJ =', (await lista(CAD, 'Entidades_Cadastradas', f(`{CPF_CNPJ} = '${e1.fields.CPF_CNPJ}'`))).some((x) => x.id === e1.id));
    confere('AND CPF e RECORD_ID !=', !(await lista(CAD, 'Entidades_Cadastradas', f(`AND({CPF_CNPJ} = '${e1.fields.CPF_CNPJ}', RECORD_ID() != '${e1.id}')`))).some((x) => x.id === e1.id));
    const [usu] = await lista(CAD, 'Usuarios');
    const emailEsc = String(usu.fields.Email || '').toLowerCase().replace(/'/g, "\\'");
    confere('LOWER({Email}) =', (await lista(CAD, 'Usuarios', f(`LOWER({Email}) = '${emailEsc}'`))).length === 1);
    confere('aspas escapadas', (await lista(CAD, 'Usuarios', f("LOWER({Email}) = 'o\\'brien@teste.com'"))).length === 0);
    confere("{Chave} = 'principal'", (await lista(FIN, 'Config_Financeiro', f("{Chave} = 'principal'"))).length === 2);
    confere("{Situacao}='Em andamento'", Array.isArray(await lista(CAD, 'Visitas', f("{Situacao}='Em andamento'"))));
    confere('fórmula inválida = 422', (await api('GET', `/v0/${CAD}/Chamados?filterByFormula=` + encodeURIComponent("AND({Status}='x'"))).status === 422);
    confere('campo desconhecido = 422', (await api('GET', `/v0/${CAD}/Chamados?filterByFormula=` + encodeURIComponent("{Nao_Existe}='x'"))).status === 422);
    confere('função desconhecida = 422', (await api('GET', `/v0/${CAD}/Chamados?filterByFormula=` + encodeURIComponent("REGEX_MATCH({Status},'x')"))).status === 422);
    confere('sem token = 401', (await fetch(`http://127.0.0.1:5690/v0/${CAD}/Chamados`)).status === 401);
    confere('registro inexistente = 404', (await api('GET', `/v0/${CAD}/tbltipxOIw8F96QHO/recNaoExiste00000`)).status === 404);

    // ---- ordenação, campos e páginas ----
    const desp = await lista(FIN, 'Despesas', '&sort%5B0%5D%5Bfield%5D=Vencimento&sort%5B0%5D%5Bdirection%5D=asc');
    confere('ordem por Vencimento', desp.every((d, i) => i === 0 || desp[i - 1].fields.Vencimento <= d.fields.Vencimento));
    const forn = await lista(FIN, 'Fornecedores', '&sort[0][field]=Nome&sort[0][direction]=desc');
    confere('ordem desc por Nome', forn.every((d, i) => i === 0 || forn[i - 1].fields.Nome.localeCompare(d.fields.Nome, 'pt-BR') >= 0));
    const soDois = (await api('GET', `/v0/${CAD}/tbltipxOIw8F96QHO?pageSize=100&fields%5B%5D=Status&fields%5B%5D=Numero_Chamado`)).json;
    confere('fields[] limita os campos', soDois.records.every((r) => Object.keys(r.fields).every((k) => ['Status', 'Numero_Chamado'].includes(k))));
    let todos = [], offset = '';
    do {
      const p = (await api('GET', `/v0/${CAD}/Entidades_Cadastradas?pageSize=10` + (offset ? '&offset=' + offset : ''))).json;
      todos = todos.concat(p.records); offset = p.offset || '';
    } while (offset);
    confere('páginas de 10 cobrem tudo', todos.length === antes.Entidades_Cadastradas && new Set(todos.map((x) => x.id)).size === todos.length);

    // ---- gravações (só registros de teste) ----
    const ent = (await api('POST', `/v0/${CAD}/Entidades_Cadastradas`, { typecast: true, fields: { Razao_Social_Nome: 'TESTE MIGRACAO (apagar)', CPF_CNPJ: '00000000000191', Tipo_Documento: 'CNPJ - Empresa', Status: 'Ativo', Observacoes: '' } })).json;
    confere('cria entidade', /^rec/.test(ent.id) && ent.fields.Razao_Social_Nome === 'TESTE MIGRACAO (apagar)' && !('Observacoes' in ent.fields), ent);
    const loc = (await api('POST', `/v0/${CAD}/Locais_Atendimento`, { typecast: true, records: [{ fields: { Nome_do_Local: 'TESTE local', Cliente_Vinculado: [ent.id], Status: 'Ativo' } }] })).json;
    confere('cria local vinculado (lote)', loc.records && loc.records[0].fields.Cliente_Vinculado[0] === ent.id, loc);
    const con = (await api('POST', `/v0/${CAD}/Contatos_Solicitantes`, { typecast: true, fields: { Nome_Contato: 'TESTE contato', Entidades_Vinculadas: [ent.id], Cargo_Funcao: 'Síndico' } })).json;
    const entLida = (await api('GET', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`)).json;
    confere('lado mãe mostra local e contato', entLida.fields.Locais_Atendimento[0] === loc.records[0].id && entLida.fields.Contatos_Solicitantes[0] === con.id, entLida);
    confere('consulta Contatos_Nomes', JSON.stringify(entLida.fields.Contatos_Nomes) === '["TESTE contato"]', entLida.fields);
    const alt = (await api('PATCH', `/v0/${CAD}/Entidades_Cadastradas`, { typecast: true, records: [{ id: ent.id, fields: { Observacoes: 'obs teste', Status: 'Inativo' } }] })).json;
    confere('altera em lote', alt.records[0].fields.Observacoes === 'obs teste' && alt.records[0].fields.Status === 'Inativo' && alt.records[0].fields.CPF_CNPJ === '00000000000191', alt);
    const alt2 = (await api('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`, { fields: { Observacoes: '' } })).json;
    confere('apagar texto some do registro', !('Observacoes' in alt2.fields), alt2);
    confere('campo desconhecido na gravação = 422', (await api('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`, { fields: { Nao_Existe: 1 } })).status === 422);
    confere('nome de campo especial (__proto__) = 422', (await api('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`, { fields: JSON.parse('{"__proto__": {"x": 1}, "constructor": 1}') })).status === 422);
    confere('fórmula com campo especial = 422', (await api('GET', `/v0/${CAD}/Chamados?filterByFormula=` + encodeURIComponent("{__proto__}='x'"))).status === 422);
    confere('campo calculado na gravação = 422', (await api('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`, { fields: { Contatos_Nomes: ['x'] } })).status === 422);
    confere('vínculo para id inexistente = 422', (await api('POST', `/v0/${CAD}/Locais_Atendimento`, { fields: { Cliente_Vinculado: ['recAAAAAAAAAAAAAA'] } })).status === 422);
    const tira = (await api('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`, { fields: { Locais_Atendimento: [] } })).json;
    const locLido = (await api('GET', `/v0/${CAD}/Locais_Atendimento/${loc.records[0].id}`)).json;
    confere('desvincular pelo lado mãe', !tira.fields.Locais_Atendimento && !locLido.fields.Cliente_Vinculado, { tira: tira.fields, locLido: locLido.fields });
    await api('PATCH', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`, { fields: { Locais_Atendimento: [loc.records[0].id] } });
    confere('vincular pelo lado mãe', (await api('GET', `/v0/${CAD}/Locais_Atendimento/${loc.records[0].id}`)).json.fields.Cliente_Vinculado[0] === ent.id);

    // datas e caixinhas (usuário de teste)
    const u = (await api('POST', `/v0/${CAD}/Usuarios`, { typecast: true, fields: { Nome: 'TESTE', Email: 'teste-migracao@exemplo.invalid', Ativo: true, Codigo_Tentativas: '2', Codigo_Expira_Em: '2026-10-27T12:00:00' } })).json;
    confere('data sem fuso vira UTC, número de texto vira número', u.fields.Codigo_Expira_Em === '2026-10-27T12:00:00.000Z' && u.fields.Codigo_Tentativas === 2 && u.fields.Ativo === true && /Z$/.test(u.fields.Criado_Em), u.fields);
    const u2 = (await api('PATCH', `/v0/${CAD}/Usuarios/${u.id}`, { fields: { Ativo: false } })).json;
    confere('caixinha desmarcada some', !('Ativo' in u2.fields));
    confere('e-mail repetido = 422', (await api('POST', `/v0/${CAD}/Usuarios`, { fields: { Email: 'TESTE-migracao@exemplo.invalid' } })).status === 422);
    const s = (await api('POST', `/v0/${CAD}/Sessoes`, { typecast: true, fields: { Token: 'tok-teste', Usuario: [u.id], Expira_Em: '2026-11-01T00:00:00.000Z' } })).json;
    confere('sessão aparece no usuário', (await api('GET', `/v0/${CAD}/Usuarios/${u.id}`)).json.fields.Sessoes[0] === s.id);
    confere('{Token} =', (await lista(CAD, 'Sessoes', f("{Token} = 'tok-teste'"))).length === 1);
    const desp1 = (await api('POST', `/v0/${FIN}/tblNduEKl2jY280V0`, { typecast: true, records: [{ fields: { Descricao: 'TESTE despesa', Valor: '12.5', Vencimento: '2026-10-31', Status: 'Pendente' } }] })).json;
    confere('data só dia e valor', desp1.records[0].fields.Vencimento === '2026-10-31' && desp1.records[0].fields.Valor === 12.5, desp1);

    // apagando: lote com records[] e individual
    const delLote = (await api('DELETE', `/v0/${CAD}/Locais_Atendimento?records[]=${loc.records[0].id}`)).json;
    confere('apaga em lote', delLote.records[0].deleted === true, delLote);
    await api('DELETE', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`);
    const conLido = (await api('GET', `/v0/${CAD}/Contatos_Solicitantes/${con.id}`)).json;
    confere('apagar entidade solta o contato', !conLido.fields.Entidades_Vinculadas, conLido.fields);
    await api('DELETE', `/v0/${CAD}/Contatos_Solicitantes/${con.id}`);
    await api('DELETE', `/v0/${CAD}/Usuarios/${u.id}`);
    confere('sessão some junto com o usuário de teste', (await api('GET', `/v0/${CAD}/Sessoes/${s.id}`)).status === 404);
    await api('DELETE', `/v0/${FIN}/Despesas?records%5B%5D=${desp1.records[0].id}`);
    confere('apagar de novo = 404', (await api('DELETE', `/v0/${CAD}/Usuarios/${u.id}`)).status === 404);
  } finally {
    // os chamados de teste (nº 990001 a 990005) somem mesmo se algo acima quebrar: senão o
    // próximo chamado real nasceria com número 990006
    for (const c of await lista(CAD, 'Chamados', f('AND({Numero_Chamado} >= 990001, {Numero_Chamado} <= 990005)'))) {
      await api('DELETE', `/v0/${CAD}/Chamados/${c.id}`);
    }
  }

  const depois = await contar();
  confere('quantidades voltaram ao que eram', JSON.stringify(antes) === JSON.stringify(depois), { antes, depois });
  console.log(`\n${ok} testes ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})();
