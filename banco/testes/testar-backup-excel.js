// Backup em Excel dos cadastros (13/11/2026): banco/backup-excel.js, com dados FICTÍCIOS numa pasta temporária.
// Confere: conteúdo e formato, "Atualizado em" só muda para quem mudou, não duplica, apagados vão para a aba
// própria, cópia diária com limite de 30, pasta com defeito não derruba as outras e nada é regravado sem mudança.
// Não fala com o banco nem com a nuvem; não toca em nada de verdade.
// Uso: node banco/testes/testar-backup-excel.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('C:/Users/rediv/banco-solucoes/modulos/node_modules/exceljs');
const { gerarBackupExcel } = require('../backup-excel.js');

let ok = 0, falhas = 0;
const confere = (nome, cond, extra) => {
  if (cond) { ok++; console.log('ok   ', nome); } else { falhas++; console.log('FALHA', nome, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); }
};

const cliente = (id, nome, extra = {}) => ({ id, createdTime: '2026-08-10T15:00:00.000Z', fields: { Razao_Social_Nome: nome, Nome_Fantasia_Identificador: nome, CPF_CNPJ: '11222333000181',
  Tipo_Documento: 'CNPJ - Condomínio', Exigencia_Fiscal: 'Exige Nota Fiscal', Status: 'Ativo', Emails_Financeiro_NFE: 'a@exemplo.invalid\nb@exemplo.invalid', WhatsApp_CNPJ: '554738017621', ...extra } });
const local = (id, dono, nome, end) => ({ id, createdTime: '2026-08-10T15:00:00.000Z', fields: { Nome_do_Local: nome, Endereco_Completo: end, Bairro_Cidade: 'CENTRO / JOINVILLE - SC', Cliente_Vinculado: [dono], Status: 'Ativo' } });
const contato = (id, donos, nome) => ({ id, createdTime: '2026-08-10T15:00:00.000Z', fields: { Nome_Contato: nome, Cargo_Funcao: 'Síndico', Entidades_Vinculadas: donos, Emails: 'c@exemplo.invalid', WhatsApps: '5547996104320', Status: 'Ativo' } });

const ler = async (arq) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(arq); return wb; };
const linhasDe = (ws) => { const o = []; ws.eachRow((r, n) => { if (n > 1) o.push(r.values.slice(1)); }); return o; };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-excel-'));
  const pasta = path.join(tmp, 'saida');
  const estado = path.join(tmp, 'estado.json');
  const arquivo = path.join(pasta, 'Backup de clientes - Soluções Rápidas.xlsx');
  const gerar = (atuais, apagados, agora, extra) => gerarBackupExcel(atuais, apagados || {}, { pastas: [pasta], estado, agora, ...extra });

  const A = cliente('recAAAAAAAAAAAAAA', 'RESIDENCIAL ALFA');
  const B = cliente('recBBBBBBBBBBBBBB', 'EDIFICIO BETA', { Administradora: 'Adm Teste', Atendido_Por: 'CNPJ 2' });
  const dados1 = { Entidades_Cadastradas: [B, A], Locais_Atendimento: [local('recLLLLLLLLLLLLL1', A.id, 'Endereço do CNPJ', 'RUA X, 10'), local('recLLLLLLLLLLLLL2', B.id, 'Endereço do CNPJ', 'RUA Y, 20')],
    Contatos_Solicitantes: [contato('recCCCCCCCCCCCCC1', [A.id, B.id], 'Maria Teste')] };

  // ---- primeira geração ----
  let r = await gerar(dados1, {}, '2026-11-13T15:00:00.000Z');
  confere('gera o arquivo e a cópia do dia', r.ok && r.mudou && fs.existsSync(arquivo) && fs.readdirSync(path.join(pasta, 'Historico')).length === 1, r);
  let wb = await ler(arquivo);
  confere('abas: abre em Clientes e o Leia-me fica por último', wb.worksheets.map((w) => w.name).join(',') === 'Clientes,Endereços,Contatos,Apagados,Leia-me', wb.worksheets.map((w) => w.name));
  let cl = wb.getWorksheet('Clientes');
  let linhasCl = linhasDe(cl);
  confere('clientes em ordem de nome, uma linha cada', linhasCl.length === 2 && linhasCl[0][0] === 'EDIFICIO BETA' && linhasCl[1][0] === 'RESIDENCIAL ALFA', linhasCl.map((l) => l[0]));
  confere('CNPJ e telefone formatados', linhasCl[0][2] === '11.222.333/0001-81' && linhasCl[0][10] === '+55 (47) 3801-7621', { cnpj: linhasCl[0][2], fone: linhasCl[0][10] });
  confere('"Atendido por" (padrão CNPJ 1) e administradora', linhasCl[0][5] === 'CNPJ 2' && linhasCl[1][5] === 'CNPJ 1' && linhasCl[0][7] === 'Adm Teste', linhasCl.map((l) => [l[5], l[7]]));
  confere('e-mails em linhas separadas', linhasCl[0][9] === 'a@exemplo.invalid\nb@exemplo.invalid', linhasCl[0][9]);
  confere('resumo de endereços e contatos na linha do cliente', /RUA Y, 20/.test(linhasCl[0][12]) && /Maria Teste · \(Síndico\) · c@exemplo.invalid · \+55 \(47\) 99610-4320/.test(linhasCl[0][13]), [linhasCl[0][12], linhasCl[0][13]]);
  confere('contato ligado a dois clientes aparece nos dois', /Maria Teste/.test(linhasCl[0][13]) && /Maria Teste/.test(linhasCl[1][13]));
  const ct = linhasDe(wb.getWorksheet('Contatos'));
  confere('aba Contatos: um contato, com os dois clientes', ct.length === 1 && /EDIFICIO BETA\nRESIDENCIAL ALFA|RESIDENCIAL ALFA\nEDIFICIO BETA/.test(ct[0][0]), ct[0] && ct[0][0]);
  const en = linhasDe(wb.getWorksheet('Endereços'));
  confere('aba Endereços: um por linha, com o nome do cliente', en.length === 2 && en[0][0] === 'EDIFICIO BETA' && en[0][2] === 'RUA Y, 20', en.map((l) => [l[0], l[2]]));
  confere('cabeçalho congelado e com filtro', cl.views[0].state === 'frozen' && cl.views[0].ySplit === 1 && Boolean(cl.autoFilter));
  const horaA = linhasCl[1][17], horaB = linhasCl[0][17];
  confere('"Atualizado em" preenchido', /^13\/11\/2026 12:00$/.test(horaA) && horaA === horaB, [horaA, horaB]);

  // ---- nada mudou: não regrava ----
  const mtime = fs.statSync(arquivo).mtimeMs;
  await new Promise((ok2) => setTimeout(ok2, 30));
  r = await gerar(dados1, {}, '2026-11-13T16:00:00.000Z');
  confere('sem mudança: pula e não regrava o arquivo', r.pulou === true && r.mudou === false && fs.statSync(arquivo).mtimeMs === mtime, r);

  // ---- muda só um cliente ----
  const A2 = cliente(A.id, 'RESIDENCIAL ALFA', { Observacoes: 'Portaria muda às 18h' });
  r = await gerar({ ...dados1, Entidades_Cadastradas: [B, A2] }, {}, '2026-11-13T17:00:00.000Z');
  wb = await ler(arquivo); linhasCl = linhasDe(wb.getWorksheet('Clientes'));
  confere('mudou um cliente: regravou', r.ok && r.mudou && !r.pulou, r);
  confere('só a linha que mudou ganha "Atualizado em" novo', linhasCl[1][17] === '13/11/2026 14:00' && linhasCl[0][17] === '13/11/2026 12:00', [linhasCl[1][17], linhasCl[0][17]]);
  confere('a observação nova aparece, sem duplicar o cliente', linhasCl.length === 2 && linhasCl[1][11] === 'Portaria muda às 18h', linhasCl.map((l) => l[0]));
  confere('as outras abas não mudaram de hora', linhasDe(wb.getWorksheet('Endereços')).every((l) => l[7 + 1] === '13/11/2026 12:00' || true) && linhasDe(wb.getWorksheet('Endereços')).every((l) => l[9] === '13/11/2026 12:00'), linhasDe(wb.getWorksheet('Endereços')).map((l) => l[9]));

  // ---- cliente novo ----
  const C = cliente('recCCCCCCCCCCCCCC', 'CONDOMINIO GAMA');
  r = await gerar({ ...dados1, Entidades_Cadastradas: [B, A2, C] }, {}, '2026-11-13T18:00:00.000Z');
  wb = await ler(arquivo); linhasCl = linhasDe(wb.getWorksheet('Clientes'));
  confere('cliente novo entra no lugar certo (ordem de nome)', linhasCl.map((l) => l[0]).join('|') === 'CONDOMINIO GAMA|EDIFICIO BETA|RESIDENCIAL ALFA', linhasCl.map((l) => l[0]));
  confere('ids sem repetição nas abas', ['Clientes', 'Endereços', 'Contatos'].every((n) => { const ids = linhasDe(wb.getWorksheet(n)).map((l) => l[l.length - 1]); return new Set(ids).size === ids.length; }));
  confere('cliente novo com hora própria, os outros mantêm a deles', linhasCl[0][17] === '13/11/2026 15:00' && linhasCl[2][17] === '13/11/2026 14:00', linhasCl.map((l) => l[17]));

  // ---- cliente apagado do sistema: sai das abas e vai para "Apagados" ----
  const apag = { Entidades_Cadastradas: [{ ...C, apagadoNoSistemaEm: '2026-11-13T19:00:00.000Z' }] };
  r = await gerar({ ...dados1, Entidades_Cadastradas: [B, A2] }, apag, '2026-11-13T19:00:00.000Z');
  wb = await ler(arquivo); linhasCl = linhasDe(wb.getWorksheet('Clientes'));
  const ap = linhasDe(wb.getWorksheet('Apagados'));
  confere('apagado some da aba Clientes', linhasCl.length === 2 && !linhasCl.some((l) => l[0] === 'CONDOMINIO GAMA'), linhasCl.map((l) => l[0]));
  confere('apagado fica guardado na aba Apagados, com a data', ap.length === 1 && ap[0][0] === 'Cliente' && ap[0][1] === 'CONDOMINIO GAMA' && ap[0][3] === '13/11/2026 16:00', ap);
  confere('os que continuam não mudaram de hora', linhasCl[1][17] === '13/11/2026 14:00' && linhasCl[0][17] === '13/11/2026 12:00');

  // ---- cópia diária: mantém só os últimos 30 dias ----
  const hist = path.join(pasta, 'Historico');
  for (let d = 1; d <= 35; d++) fs.writeFileSync(path.join(hist, `Clientes 2026-09-${String(d % 28 + 1).padStart(2, '0')}-x${d}.xlsx`), 'x'); // nome fora do padrão: não pode ser apagado
  for (let d = 1; d <= 35; d++) { const dt = new Date(Date.UTC(2026, 9, d)).toISOString().slice(0, 10); fs.writeFileSync(path.join(hist, `Clientes ${dt}.xlsx`), 'x'); }
  await gerar({ ...dados1, Entidades_Cadastradas: [B, A2, C] }, {}, '2026-11-13T20:00:00.000Z', { forcar: true });
  const copias = fs.readdirSync(hist).filter((f) => /^Clientes \d{4}-\d{2}-\d{2}\.xlsx$/.test(f));
  confere('histórico: no máximo 30 cópias, as mais novas ficam', copias.length === 30 && copias.includes('Clientes 2026-11-13.xlsx'), copias.length);
  confere('histórico: arquivo fora do padrão não é apagado', fs.readdirSync(hist).some((f) => /-x1\.xlsx$/.test(f)));

  // ---- pasta com defeito não derruba as outras ----
  const bloqueio = path.join(tmp, 'arquivo-no-lugar-da-pasta');
  fs.writeFileSync(bloqueio, 'x');
  const pasta2 = path.join(tmp, 'outra');
  r = await gerarBackupExcel(dados1, {}, { pastas: [path.join(bloqueio, 'dentro'), pasta2], estado: path.join(tmp, 'estado2.json'), agora: '2026-11-13T21:00:00.000Z' });
  confere('uma pasta com defeito não impede as outras', r.ok === true && r.pastas.length === 1 && fs.existsSync(path.join(pasta2, 'Backup de clientes - Soluções Rápidas.xlsx')), r);
  r = await gerarBackupExcel(dados1, {}, { pastas: [path.join(bloqueio, 'dentro')], estado: path.join(tmp, 'estado3.json') });
  confere('todas as pastas com defeito: avisa que não gravou', r.ok === false && r.pastas.length === 0, r);

  // ---- arquivo travado (aberto no Excel): não perde a atualização, regrava assim que soltar ----
  const pastaT = path.join(tmp, 'travada');
  const estadoT = path.join(tmp, 'estado-travada.json');
  const arqT = path.join(pastaT, 'Backup de clientes - Soluções Rápidas.xlsx');
  await gerarBackupExcel(dados1, {}, { pastas: [pastaT], estado: estadoT, agora: '2026-11-13T22:00:00.000Z' });
  const A3 = cliente(A.id, 'RESIDENCIAL ALFA', { Observacoes: 'mudou com o arquivo travado' });
  const dados3 = { ...dados1, Entidades_Cadastradas: [B, A3] };
  const original = fs.renameSync;
  fs.renameSync = (de, para) => { if (String(para).endsWith('.xlsx')) { const e = new Error('EBUSY: arquivo aberto'); e.code = 'EBUSY'; throw e; } return original(de, para); };
  let rT;
  try { rT = await gerarBackupExcel(dados3, {}, { pastas: [pastaT], estado: estadoT, agora: '2026-11-13T23:00:00.000Z' }); } finally { fs.renameSync = original; }
  confere('arquivo travado: avisa a pasta que falhou', rT.ok === false && rT.falhas.length === 1, rT);
  rT = await gerarBackupExcel(dados3, {}, { pastas: [pastaT], estado: estadoT, agora: '2026-11-14T00:00:00.000Z' });
  const wbT = await ler(arqT);
  const obsT = linhasDe(wbT.getWorksheet('Clientes')).find((l) => l[0] === 'RESIDENCIAL ALFA');
  confere('depois de soltar o arquivo, a atualização que ficou pendente é gravada (mesmo sem mudança nova)', rT.ok === true && !rT.pulou && obsT && obsT[11] === 'mudou com o arquivo travado', [rT, obsT && obsT[11]]);
  rT = await gerarBackupExcel(dados3, {}, { pastas: [pastaT], estado: estadoT, agora: '2026-11-14T01:00:00.000Z' });
  confere('e volta a não regravar quando está tudo em dia', rT.pulou === true, rT);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e); process.exitCode = 1; });
