// Testa o fluxo "App - Asaas Extrato" (webhook asaas-extrato). SÓ LEITURA no Asaas: o fluxo faz apenas GET em
// /v3/financialTransactions das duas contas. Entra com o usuário de teste de sempre (criado e apagado no fim).
// Imprime só formato, contagens e totais: nada de nome de cliente nem documento.
// Uso: node banco/testes/testar-asaas-extrato.js [inicio fim]   (datas AAAA-MM-DD para o teste do período longo)
const t = require('./comum');
const { chamar, confere } = t;

const c = (v) => Math.round(Number(v) * 100);
function resumo(r) {
  const it = r.itens || [];
  const porConta = {}, tipos = {};
  for (const x of it) { porConta[x.conta] = (porConta[x.conta] || 0) + 1; tipos[x.tipo] = (tipos[x.tipo] || 0) + 1; }
  return { inicio: r.inicio, fim: r.fim, erros: r.erros, incompleto: r.incompleto, totais: r.totais, itens: it.length, porConta, tipos,
    comCliente: it.filter((x) => x.cliente).length };
}
function confereLista(nome, r) {
  const it = r.itens || [];
  confere(`${nome}: respondeu ok`, r.ok === true, r);
  if (!r.ok) return;
  confere(`${nome}: as duas contas lidas`, Array.isArray(r.erros) && r.erros.length === 0, r.erros);
  confere(`${nome}: mais novo primeiro`, it.every((x, i) => i === 0 || x.data <= it[i - 1].data));
  confere(`${nome}: sem repetidos`, new Set(it.map((x) => x.conta + x.id)).size === it.length);
  confere(`${nome}: tudo dentro do período`, it.every((x) => x.data >= r.inicio && x.data <= r.fim));
  confere(`${nome}: cada linha com conta, data e valor`, it.every((x) => ['CNPJ 1', 'CNPJ 2'].includes(x.conta) && /^\d{4}-\d{2}-\d{2}$/.test(x.data) && typeof x.valor === 'number'));
  const entrou = it.filter((x) => x.valor > 0).reduce((s, x) => s + c(x.valor), 0);
  const saiu = it.filter((x) => x.valor < 0).reduce((s, x) => s - c(x.valor), 0);
  confere(`${nome}: totais batem com as linhas`, entrou === c(r.totais.entrou) && saiu === c(r.totais.saiu) && entrou - saiu === c(r.totais.saldo) && r.totais.quantidade === it.length, r.totais);
  console.log('      ', JSON.stringify(resumo(r)));
}

(async () => {
  const inicio = new Date().toISOString();
  const negado = await chamar('asaas-extrato', {});
  confere('sem login: acesso negado', negado.ok === false && negado.acessoNegado === true, negado);
  await t.entrarComUsuarioDeTeste();
  try {
    const trocadas = await chamar('asaas-extrato', { inicio: '2026-11-20', fim: '2026-11-01' });
    confere('datas trocadas: recusa', trocadas.ok === false && /início/.test(trocadas.mensagem || ''), trocadas);
    const ruim = await chamar('asaas-extrato', { inicio: '2026-02-30', fim: '2026-03-01' });
    confere('data que não existe: recusa', ruim.ok === false, ruim);
    const meia = await chamar('asaas-extrato', { inicio: '2026-11-01', fim: '' });
    confere('só uma data: recusa', meia.ok === false, meia);

    let t0 = Date.now();
    const padrao = await chamar('asaas-extrato', {});
    confere('sem datas: últimos 30 dias até hoje', padrao.ok === true && padrao.fim === t.hojeISO()
      && Math.round((Date.parse(padrao.fim) - Date.parse(padrao.inicio)) / 86400000) === 29, { inicio: padrao.inicio, fim: padrao.fim });
    confereLista(`padrão (${Date.now() - t0} ms)`, padrao);

    const [de, ate] = [process.argv[2] || '2026-01-01', process.argv[3] || t.hojeISO()];
    t0 = Date.now();
    const longo = await chamar('asaas-extrato', { inicio: de, fim: ate });
    confereLista(`período ${de} a ${ate} (${Date.now() - t0} ms)`, longo);
    if (longo.ok && padrao.ok) confere('o período longo contém o padrão', padrao.itens.every((x) => longo.itens.some((y) => y.id === x.id && y.conta === x.conta)));
  } finally {
    await t.sairEApagarUsuarioDeTeste();
  }
  const erros = await t.errosDesde(inicio);
  confere('n8n sem execução com erro', !erros.length, erros);
  console.log(t.placar());
})().catch((e) => { console.error('ERRO', e.message); process.exitCode = 1; });
