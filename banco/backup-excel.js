// Backup dos cadastros em Excel (13/11/2026): um arquivo organizado, fácil de ler, com TODOS os dados do
// cadastro de cada cliente. Refeito pelo "Airtable local" (banco/airtable-local.js) toda vez que um cliente,
// endereço ou contato muda; as pastas de destino (OneDrive, e o Google Drive para computador, se instalado)
// levam o arquivo para a nuvem sozinhas.
//
// Abas: Leia-me, Clientes (um por linha, com o resumo dos endereços e contatos), Endereços, Contatos e Apagados.
// Cada linha mostra "Atualizado em" (só muda quando aquela linha mudou). Quem foi apagado do sistema não aparece
// nas abas principais, mas continua guardado na aba "Apagados". Uma cópia por dia fica em "Historico" (30 dias).
//
// Recebe os dados já lidos (mesmo formato do backup JSON); não fala com o banco. Falha aqui nunca derruba o
// backup JSON nem os fluxos: quem chama captura o erro.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// A biblioteca de Excel fica fora do OneDrive e só é carregada na hora de gerar: se ela faltar um dia, o erro fica
// contido no backup (quem chama captura) e não derruba o banco local ao ligar.
const BIBLIOTECA_EXCEL = 'C:/Users/rediv/banco-solucoes/modulos/node_modules/exceljs';
let ExcelJS = null;
const excelJS = () => (ExcelJS = ExcelJS || require(BIBLIOTECA_EXCEL));

const ESTADO = 'C:/Users/rediv/banco-solucoes/backup-excel-estado.json';
const NOME_ARQUIVO = 'Backup de clientes - Soluções Rápidas.xlsx';
const PASTA_ONEDRIVE = 'C:/Users/rediv/OneDrive/Backup de clientes';
const DIAS_DE_HISTORICO = 30;

// Pastas de destino: a do OneDrive sempre; e, se o Google Drive para computador estiver instalado
// (ele aparece como um disco, "Meu Drive" ou "My Drive"), a pasta "beckup clientes" do Drive.
function destinos() {
  const lista = [PASTA_ONEDRIVE];
  for (const letra of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const meu of ['Meu Drive', 'My Drive']) {
      const raiz = `${letra}:/${meu}`;
      try { if (fs.existsSync(raiz)) lista.push(`${raiz}/beckup clientes`); } catch (e) { /* disco sem leitura */ }
    }
  }
  return lista;
}

// ---------- formatação dos dados ----------

const txt = (v) => (v === undefined || v === null ? '' : String(v)).replace(/\r/g, '').trim();
const linhas = (v) => txt(v).split('\n').map((s) => s.trim()).filter(Boolean);

function cnpjCpf(v) {
  const d = txt(v).replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return txt(v);
}

function telefone(v) {
  const d = txt(v).replace(/\D/g, '');
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d) || /^(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  if (!m) return txt(v);
  return `${d.startsWith('55') && d.length >= 12 ? '+55 ' : ''}(${m[1]}) ${m[2]}-${m[3]}`;
}

const lista = (v, f) => linhas(v).map(f || ((s) => s)).join('\n');

function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return txt(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}

const hashDe = (valores) => crypto.createHash('sha1').update(JSON.stringify(valores)).digest('hex');

// ---------- montagem das linhas ----------

function montar(atuais, apagados) {
  const clientes = atuais.Entidades_Cadastradas || [];
  const locais = atuais.Locais_Atendimento || [];
  const contatos = atuais.Contatos_Solicitantes || [];
  const nomeDoCliente = new Map();
  [...clientes, ...((apagados && apagados.Entidades_Cadastradas) || [])].forEach((c) => {
    const f = c.fields || {};
    nomeDoCliente.set(c.id, txt(f.Razao_Social_Nome) || txt(f.Nome_Fantasia_Identificador) || '(sem nome)');
  });

  const locaisDoCliente = new Map();
  locais.forEach((l) => {
    const dono = ((l.fields || {}).Cliente_Vinculado || [])[0];
    if (!dono) return;
    if (!locaisDoCliente.has(dono)) locaisDoCliente.set(dono, []);
    locaisDoCliente.get(dono).push(l);
  });
  const contatosDoCliente = new Map();
  contatos.forEach((c) => {
    ((c.fields || {}).Entidades_Vinculadas || []).forEach((dono) => {
      if (!contatosDoCliente.has(dono)) contatosDoCliente.set(dono, []);
      contatosDoCliente.get(dono).push(c);
    });
  });

  const resumoLocais = (id) => (locaisDoCliente.get(id) || [])
    .map((l) => [txt((l.fields || {}).Nome_do_Local), txt((l.fields || {}).Endereco_Completo), txt((l.fields || {}).Bairro_Cidade)].filter(Boolean).join(' — ')).join('\n');
  const resumoContatos = (id) => (contatosDoCliente.get(id) || []).map((c) => {
    const f = c.fields || {};
    const emails = linhas(f.Emails).join(', ');
    const fones = linhas(f.WhatsApps).map(telefone).join(', ');
    return [txt(f.Nome_Contato), txt(f.Cargo_Funcao) && `(${txt(f.Cargo_Funcao)})`, emails, fones].filter(Boolean).join(' · ');
  }).join('\n');

  const abas = { clientes: [], enderecos: [], contatos: [], apagados: [] };
  clientes.forEach((c) => {
    const f = c.fields || {};
    abas.clientes.push({ id: c.id, valores: [
      txt(f.Razao_Social_Nome), txt(f.Nome_Fantasia_Identificador), cnpjCpf(f.CPF_CNPJ), txt(f.Tipo_Documento), txt(f.Exigencia_Fiscal),
      txt(f.Atendido_Por) || 'CNPJ 1', txt(f.Status), txt(f.Administradora), txt(f.Empresa_Sindicos), lista(f.Emails_Financeiro_NFE),
      telefone(f.WhatsApp_CNPJ), txt(f.Observacoes), resumoLocais(c.id), resumoContatos(c.id), txt(f.Asaas_Conta) || '', txt(f.Asaas_Customer_Id),
      quando(c.createdTime),
    ] });
  });
  locais.forEach((l) => {
    const f = l.fields || {};
    const dono = (f.Cliente_Vinculado || [])[0] || '';
    abas.enderecos.push({ id: l.id, valores: [nomeDoCliente.get(dono) || '(cliente apagado)', txt(f.Nome_do_Local), txt(f.Endereco_Completo), txt(f.Bairro_Cidade),
      txt(f.Observacoes_Acesso), txt(f.Status), txt(f.Observacoes), quando(l.createdTime), dono] });
  });
  contatos.forEach((c) => {
    const f = c.fields || {};
    const donos = f.Entidades_Vinculadas || [];
    abas.contatos.push({ id: c.id, valores: [donos.map((d) => nomeDoCliente.get(d) || '(cliente apagado)').join('\n'), txt(f.Nome_Contato), txt(f.Cargo_Funcao), txt(f.Empresas),
      lista(f.Emails), lista(f.WhatsApps, telefone), txt(f.Status), txt(f.Observacoes), quando(c.createdTime), donos.join('\n')] });
  });

  // o que saiu do sistema (guardado pelo backup anterior): aba à parte, para não poluir as outras
  const ap = apagados || {};
  (ap.Entidades_Cadastradas || []).forEach((r) => {
    const f = r.fields || {};
    abas.apagados.push({ id: r.id, em: r.apagadoNoSistemaEm, valores: ['Cliente', txt(f.Razao_Social_Nome) || txt(f.Nome_Fantasia_Identificador) || '(sem nome)',
      [cnpjCpf(f.CPF_CNPJ), txt(f.Tipo_Documento), txt(f.Administradora), txt(f.Empresa_Sindicos)].filter(Boolean).join(' · ')] });
  });
  (ap.Locais_Atendimento || []).forEach((r) => {
    const f = r.fields || {};
    abas.apagados.push({ id: r.id, em: r.apagadoNoSistemaEm, valores: ['Endereço', txt(f.Nome_do_Local) || '(sem nome)', [txt(f.Endereco_Completo), txt(f.Bairro_Cidade)].filter(Boolean).join(' — ')] });
  });
  (ap.Contatos_Solicitantes || []).forEach((r) => {
    const f = r.fields || {};
    abas.apagados.push({ id: r.id, em: r.apagadoNoSistemaEm, valores: ['Contato', txt(f.Nome_Contato) || '(sem nome)',
      [txt(f.Cargo_Funcao), txt(f.Empresas), linhas(f.Emails).join(', '), linhas(f.WhatsApps).map(telefone).join(', ')].filter(Boolean).join(' · ')] });
  });

  const por = (ia) => (a, b) => ia.map((i) => a.valores[i].localeCompare(b.valores[i], 'pt')).find((x) => x) || 0;
  abas.clientes.sort(por([0]));
  abas.enderecos.sort(por([0, 1]));
  abas.contatos.sort(por([1]));
  abas.apagados.sort((a, b) => String(b.em).localeCompare(String(a.em)) || por([0, 1])(a, b));
  return abas;
}

const DEF = {
  clientes: { nome: 'Clientes', cab: ['Cliente', 'Nome fantasia', 'CPF / CNPJ', 'Tipo', 'Exigência fiscal', 'Atendido por', 'Situação', 'Administradora', 'Empresa dos síndicos',
    'E-mails (financeiro / nota)', 'WhatsApp do CNPJ', 'Observações', 'Endereços de atendimento', 'Contatos', 'Cobrança (Asaas): conta', 'Cobrança (Asaas): código do cliente', 'Cadastrado em'],
    larg: [34, 24, 20, 18, 18, 12, 11, 22, 26, 38, 20, 34, 52, 52, 14, 24, 17], neg: [0] },
  enderecos: { nome: 'Endereços', cab: ['Cliente', 'Local', 'Endereço', 'Bairro / Cidade', 'Como entrar (observações de acesso)', 'Situação', 'Observações', 'Cadastrado em', 'ID do cliente (sistema)'],
    larg: [34, 22, 44, 30, 36, 11, 30, 17, 20], neg: [0] },
  contatos: { nome: 'Contatos', cab: ['Cliente(s)', 'Contato', 'Cargo / função', 'Empresa', 'E-mails', 'WhatsApps', 'Situação', 'Observações', 'Cadastrado em', 'ID do(s) cliente(s) (sistema)'],
    larg: [40, 26, 16, 26, 38, 26, 11, 30, 17, 20], neg: [1] },
};
DEF.apagados = { nome: 'Apagados', cab: ['Tipo', 'Nome', 'Dados que tinha'], larg: [12, 36, 90], neg: [1] };
const TECNICAS = ['Atualizado em', 'ID no sistema'];

// ---------- planilha ----------

function construir(abas, estadoNovo, agora) {
  const wb = new (excelJS().Workbook)();
  wb.creator = 'Soluções Rápidas (sistema)';
  wb.created = new Date(agora);

  // As abas com os dados vêm primeiro (o arquivo abre direto em "Clientes"); o "Leia-me" fica por último.
  const abasDeDados = {};
  for (const chave of ['clientes', 'enderecos', 'contatos', 'apagados']) {
    abasDeDados[chave] = wb.addWorksheet(DEF[chave].nome, { views: [{ state: 'frozen', ySplit: 1, xSplit: chave === 'apagados' ? 0 : 1 }] });
  }
  const leia = wb.addWorksheet('Leia-me', { properties: { tabColor: { argb: 'FF1F3B73' } } });
  leia.getColumn(1).width = 110;
  const texto = [
    ['Backup dos cadastros — Soluções Rápidas', 't'],
    ['Última atualização: ' + quando(agora), ''],
    ['', ''],
    ['O que é: uma cópia de segurança de todos os cadastros do sistema (clientes, endereços de atendimento e contatos), em linhas, para ler e procurar.', ''],
    ['Como atualiza: sozinho. Quando algo é cadastrado ou alterado no sistema, este arquivo é refeito em poucos segundos. A coluna "Atualizado em" de cada linha só muda quando aquela linha mudou.', ''],
    ['Abas: "Clientes" (um cliente por linha, com o resumo dos endereços e dos contatos), "Endereços" (um local por linha) e "Contatos" (um contato por linha).', ''],
    ['Quem foi apagado no sistema sai das abas acima, mas continua guardado na aba "Apagados" (com a data em que saiu): o backup não perde nada.', ''],
    ['Na pasta "Historico" fica uma cópia de cada dia (os últimos ' + DIAS_DE_HISTORICO + ' dias), para voltar atrás se precisar.', ''],
    ['', ''],
    ['IMPORTANTE: não edite este arquivo. Mudanças feitas aqui NÃO voltam para o sistema e serão apagadas na próxima atualização. Para mudar um dado, mude no sistema.', 'a'],
  ];
  texto.forEach(([t, estilo], i) => {
    const c = leia.getCell(i + 1, 1);
    c.value = t;
    c.alignment = { wrapText: true, vertical: 'top' };
    if (estilo === 't') c.font = { size: 16, bold: true, color: { argb: 'FF1F3B73' } };
    if (estilo === 'a') c.font = { bold: true, color: { argb: 'FFB3261E' } };
  });

  for (const chave of ['clientes', 'enderecos', 'contatos', 'apagados']) {
    const d = DEF[chave];
    const ws = abasDeDados[chave];
    const cab = [...d.cab, ...(chave === 'apagados' ? ['Apagado do sistema em', 'ID no sistema'] : TECNICAS)];
    ws.columns = cab.map((h, i) => ({ header: h, width: i < d.larg.length ? d.larg[i] : 18 }));
    const topo = ws.getRow(1);
    topo.height = 34;
    topo.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3B73' } };
      c.alignment = { wrapText: true, vertical: 'middle' };
    });
    abas[chave].forEach((l, i) => {
      const estado = estadoNovo[`${chave}:${l.id}`];
      const linha = ws.addRow([...l.valores, chave === 'apagados' ? quando(l.em) : quando(estado.em), l.id]);
      linha.alignment = { wrapText: true, vertical: 'top' };
      d.neg.forEach((n) => { linha.getCell(n + 1).font = { bold: true }; });
      const nTec = d.cab.length;
      linha.getCell(nTec + 1).font = { color: { argb: 'FF6B7280' } };
      linha.getCell(nTec + 2).font = { color: { argb: 'FF9CA3AF' }, size: 9 };
      if (i % 2 === 1) linha.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6FB' } }; });
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cab.length } };
  }
  return wb;
}

// ---------- gravação ----------

function gravarEm(pasta, nome, buffer) {
  fs.mkdirSync(pasta, { recursive: true });
  const alvo = path.join(pasta, nome);
  const temp = alvo + '.novo';
  fs.writeFileSync(temp, buffer);
  fs.renameSync(temp, alvo); // troca de uma vez, para a nuvem nunca levar um arquivo pela metade
}

function limparHistorico(pasta) {
  try {
    const arqs = fs.readdirSync(pasta).filter((f) => /^Clientes \d{4}-\d{2}-\d{2}\.xlsx$/.test(f)).sort();
    arqs.slice(0, Math.max(0, arqs.length - DIAS_DE_HISTORICO)).forEach((f) => fs.unlinkSync(path.join(pasta, f)));
  } catch (e) { /* sem histórico ainda */ }
}

async function gerarBackupExcel(atuais, apagados, opcoes = {}) {
  const agora = opcoes.agora || new Date().toISOString();
  const pastas = opcoes.pastas || destinos();
  const abas = montar(atuais, apagados);

  // "Atualizado em": só muda para quem mudou (impressão digital de cada linha, guardada entre uma vez e outra)
  const arqEstado = opcoes.estado || ESTADO;
  let antigo = {};
  try { antigo = JSON.parse(fs.readFileSync(arqEstado, 'utf8')); } catch (e) { antigo = {}; }
  const novo = {};
  let mudou = Boolean(antigo._pendente);
  for (const chave of Object.keys(abas)) {
    for (const l of abas[chave]) {
      const k = `${chave}:${l.id}`;
      const h = hashDe([l.valores, l.em || '']);
      const a = antigo[k];
      novo[k] = a && a.h === h ? a : { h, em: agora };
      if (!a || a.h !== h) mudou = true;
    }
  }
  if (Object.keys(antigo).some((k) => k !== '_pendente' && !novo[k])) mudou = true;

  // Nada mudou desde a última vez e o arquivo já está em todas as pastas: não regrava (a nuvem não sobe de novo à toa).
  const linhasAgora = { clientes: abas.clientes.length, enderecos: abas.enderecos.length, contatos: abas.contatos.length, apagados: abas.apagados.length };
  if (!mudou && !opcoes.forcar && pastas.every((pasta) => fs.existsSync(path.join(pasta, NOME_ARQUIVO)))) {
    return { ok: true, pastas, linhas: linhasAgora, mudou: false, pulou: true };
  }

  const wb = construir(abas, novo, agora);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const gravados = [];
  const falhas = [];
  for (const pasta of pastas) {
    try {
      gravarEm(pasta, NOME_ARQUIVO, buffer);
      gravarEm(path.join(pasta, 'Historico'), `Clientes ${hoje}.xlsx`, buffer);
      limparHistorico(path.join(pasta, 'Historico'));
      gravados.push(pasta);
    } catch (e) { falhas.push(pasta); /* esta pasta falhou (ex.: arquivo aberto no Excel, disco desconectado): as outras seguem */ }
  }
  // Se alguma pasta falhou, o estado fica marcado como pendente: a próxima geração regrava mesmo sem mudança.
  if (falhas.length) novo._pendente = true;
  fs.writeFileSync(arqEstado + '.novo', JSON.stringify(novo));
  fs.renameSync(arqEstado + '.novo', arqEstado);
  return { ok: gravados.length > 0, falhas, pastas: gravados, linhas: { clientes: abas.clientes.length, enderecos: abas.enderecos.length, contatos: abas.contatos.length, apagados: abas.apagados.length }, mudou };
}

module.exports = { gerarBackupExcel, montar, destinos, NOME_ARQUIVO };
