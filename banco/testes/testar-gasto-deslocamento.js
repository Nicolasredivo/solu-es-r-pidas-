// Gasto de deslocamento (09/11/2026): fluxo "Veículo - Gasto do dia" (webhook "gasto-deslocamento").
// Monta um dia de teste (02/01/2001, sem nenhum atendimento de verdade) com 3 chamados de teste:
// dois endereços públicos de Joinville e um que não existe. Confere a rota (km de cada um, a volta à
// base no último achado), o custo (pelo consumo/preço/pneus salvos hoje), o motivo do não achado,
// o resumo do mês pelo "App - Veículo" e que nada de verdade mudou. Apaga tudo no fim.
// Usa os serviços gratuitos de mapa (OpenStreetMap e OSRM) de verdade.
// Uso: node banco/testes/testar-gasto-deslocamento.js
const t = require('./comum');
const { CAD, local, chamar, confere } = t;

const DIA = '2001-01-02';
const MARCA = '__TESTE_AUTOMATICO_DESLOCAMENTO__';
const ENDERECOS = [
  ['Rua XV de Novembro, 1000, CEP 89201-600', '09:00'],
  ['Rua Dona Francisca, 800, CEP 89201-250', '11:00'],
  ['Rua Zzqx Inexistente Teste, 99999, CEP 00000-000', '14:00'],
];

(async () => {
  const antes = await t.contarTudo();
  const visitasReaisAntes = JSON.stringify(await t.lista(CAD, 'Visitas'));
  const geoAntes = new Set((await t.lista(CAD, 'Geo_Enderecos')).map((g) => g.id));
  const chamadosTeste = [];
  const visitasTeste = [];
  try {
    const semToken = await (await fetch('http://localhost:5678/webhook/gasto-deslocamento', { method: 'POST', body: new URLSearchParams({ dia: DIA }) })).json();
    confere('sem token: acesso negado', semToken.acessoNegado === true, semToken);
    await t.entrarComUsuarioDeTeste();

    let r = await chamar('gasto-deslocamento', { dia: '2001-02-30' });
    confere('dia inválido: recusado', r.ok === false && /Dia inválido/.test(r.mensagem), r);

    // ---- dia de teste ----
    for (const [i, [end, hora]] of ENDERECOS.entries()) {
      const ch = await local('POST', `/v0/${CAD}/Chamados`, { fields: { Cliente_Nome: MARCA + ' ' + (i + 1), Endereco_Copia: end, Status: 'Concluído', Tipo_Chamado: 'Atendimento' } });
      chamadosTeste.push(ch.id);
      const v = await local('POST', `/v0/${CAD}/Visitas`, { fields: { Visita: MARCA, Chamado: [ch.id], Situacao: 'Concluída', Inicio_Real: `${DIA}T${hora}:00-03:00` } });
      visitasTeste.push(v.id);
    }
    confere('dia de teste montado', chamadosTeste.length === 3 && visitasTeste.every((id) => /^rec/.test(id || '')), visitasTeste);

    r = await chamar('gasto-deslocamento', { dia: DIA });
    confere('cálculo do dia: ok', r.ok === true && r.dia === DIA && r.atendimentos === 3, r);
    confere('cálculo: 2 com rota, 1 não achado', r.calculados === 2 && (r.avisos || []).some((a) => /não achado/.test(a)), r);

    const lidas = await Promise.all(visitasTeste.map((id) => local('GET', `/v0/${CAD}/Visitas/${id}`)));
    const det = lidas.map((v) => { try { return JSON.parse(v.fields.Custo_Detalhe || '{}'); } catch (e) { return {}; } });
    const km = lidas.map((v) => v.fields.Km_Deslocamento);
    confere('1º atendimento: km da base até ele', km[0] > 1 && km[0] < 40 && det[0].de === 'base' && det[0].voltaBase === false, { km: km[0], det: det[0] });
    confere('2º atendimento: km do anterior + volta à base', km[1] > 1 && km[1] < 60 && det[1].voltaBase === true, { km: km[1], det: det[1] });
    confere('3º (endereço inexistente): sem km, com o motivo', (km[2] === null || km[2] === undefined) && det[2].motivo === 'endereço não achado no mapa', { km: km[2], det: det[2] });
    const custoKm = Object.values(det[0].porKm || {}).reduce((a, b) => a + b, 0);
    const custo1 = lidas[0].fields.Custo_Deslocamento;
    confere('custo = km × custo do km (por partes)', custoKm > 0 ? Math.abs(custo1 - km[0] * custoKm) < 0.05 : (custo1 === null || custo1 === undefined), { custo1, km: km[0], porKm: det[0].porKm });
    confere('custo do km inclui a manutenção salva (13/11/2026)', det[0].porKm && typeof det[0].porKm.manutencao === 'number' && det[0].porKm.manutencao > 0, det[0].porKm);
    confere('resumo: soma dos km', Math.abs(r.km - (km[0] + km[1])) < 0.2, { resumo: r.km, soma: km[0] + km[1] });
    confere('endereços guardados (3, um como não achado)', (await t.lista(CAD, 'Geo_Enderecos')).filter((g) => !geoAntes.has(g.id)).length === 3);

    // De novo: usa as coordenadas guardadas (não cria endereço novo) e dá o mesmo km.
    r = await chamar('gasto-deslocamento', { dia: DIA });
    const lidas2 = await Promise.all(visitasTeste.map((id) => local('GET', `/v0/${CAD}/Visitas/${id}`)));
    confere('recalcular: mesmo km, sem endereço novo', r.ok && lidas2[0].fields.Km_Deslocamento === km[0] && lidas2[1].fields.Km_Deslocamento === km[1]
      && (await t.lista(CAD, 'Geo_Enderecos')).filter((g) => !geoAntes.has(g.id)).length === 3, r);

    // Resumo do mês no "App - Veículo" (só leitura).
    r = await chamar('veiculo', { acao: 'carregar', mes: '2001-01' });
    const d = r.deslocamento || {};
    confere('Veículo: resumo de jan/2001 com os 3 atendimentos', r.ok && d.atendimentos === 3 && d.itens[2].motivo === 'endereço não achado no mapa'
      && Math.abs(d.km - (km[0] + km[1])) < 0.2, d);
  } finally {
    for (const id of visitasTeste) await local('DELETE', `/v0/${CAD}/Visitas/${id}`);
    for (const id of chamadosTeste) await local('DELETE', `/v0/${CAD}/Chamados/${id}`);
    for (const g of await t.lista(CAD, 'Geo_Enderecos')) if (!geoAntes.has(g.id)) await local('DELETE', `/v0/${CAD}/Geo_Enderecos/${g.id}`);
    await t.sairEApagarUsuarioDeTeste();
  }
  confere('atendimentos de verdade idênticos', JSON.stringify(await t.lista(CAD, 'Visitas')) === visitasReaisAntes);
  const depois = await t.contarTudo();
  confere('nada sobrou nas tabelas', JSON.stringify(depois) === JSON.stringify(antes), { antes, depois });
  const { ok, falhas } = t.placar();
  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e); process.exitCode = 1; });
