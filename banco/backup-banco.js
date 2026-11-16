// Backup do banco INTEIRO (14/11/2026, autorizado pelo dono na auditoria geral).
//
// Até aqui só os cadastros de clientes tinham cópia fora do notebook (a planilha de banco/backup-excel.js).
// Financeiro, chamados, notas, veículo e usuários moravam só no banco deste PC: um disco estragado ou um
// notebook roubado levava tudo. Aqui sai uma cópia completa do banco, feita com a ferramenta do próprio
// PostgreSQL (pg_dump), que vai para as duas nuvens do dono (OneDrive e Google Drive), mais os arquivos
// anexados (fotos e PDFs), que vão só para o Google Drive (lá não ocupam espaço no notebook).
//
// Regras:
// - um arquivo por dia ("banco-AAAA-MM-DD.dump"); no mesmo dia, uma cópia mais nova troca a anterior;
// - a cópia só vale depois de CONFERIDA (o próprio PostgreSQL lê o arquivo e lista as tabelas): uma cópia
//   com defeito nunca troca uma boa;
// - ficam as 30 cópias diárias mais novas e mais uma cópia por mês dos últimos 12 meses (a guarda é por
//   quantidade: PC desligado por um tempo não faz as cópias antigas sumirem);
// - as sessões abertas (tabela Sessoes) não entram: são senhas temporárias de quem está logado, e não devem
//   ir para a nuvem. Depois de restaurar, é só entrar de novo;
// - pasta que falha (nuvem fora do ar, disco do Drive ainda não montado) não derruba as outras; quem chamou
//   recebe a lista do que falhou e tenta de novo depois.
// Como restaurar: ver CONTEXTO.md, "Backup do banco inteiro".
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PG_BIN = 'C:/Users/rediv/postgresql/bin';
const PASTA_LOCAL = 'C:/Users/rediv/banco-solucoes/backups/diario';
const PASTA_ONEDRIVE = 'C:/Users/rediv/OneDrive/Backup do sistema';
const PASTA_ANEXOS = 'C:/Users/rediv/banco-solucoes/anexos';
const NOME_NA_NUVEM = 'Backup do sistema';
const DIAS_GUARDADOS = 30;
const MESES_GUARDADOS = 12;
const TABELAS_MINIMAS = 20;
const RE_ARQUIVO = /^banco-(\d{4}-\d{2}-\d{2})\.dump$/;

const LEIA_ME = `BACKUP DO SISTEMA - Soluções Rápidas

Esta pasta é preenchida sozinha pelo sistema. Não precisa mexer em nada aqui.

O QUE TEM AQUI
- banco-ANO-MÊS-DIA.dump: cópia de TUDO o que o sistema guardava naquele dia (clientes, financeiro,
  chamados, notas fiscais, veículo e usuários). É um arquivo técnico: não abre no Excel. Serve para
  recuperar o sistema se o computador quebrar, for roubado ou perder os dados.
- pasta "anexos" (só no Google Drive): as fotos e os PDFs anexados no sistema.

QUANDO É FEITO
Sozinho, poucos minutos depois de qualquer alteração no sistema, e pelo menos uma vez por dia com o
computador ligado.

QUANTO TEMPO FICA GUARDADO
As 30 cópias diárias mais novas, mais uma cópia por mês dos últimos 12 meses.

PARA RECUPERAR
Peça ao Claude: "restaurar o backup do sistema", e diga de que dia.

PARA LER OS CLIENTES NO DIA A DIA
Use a planilha da pasta "beckup clientes" (Google Drive) ou "Backup de clientes" (OneDrive).
`;

// Data de hoje em Brasília (AAAA-MM-DD).
const hojeBrasilia = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

// Raízes do Google Drive para computador ("Meu Drive" ou "My Drive" de qualquer disco montado).
function raizesDoDrive() {
  const lista = [];
  for (const letra of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const meu of ['Meu Drive', 'My Drive']) {
      const raiz = `${letra}:/${meu}`;
      try { if (fs.existsSync(raiz)) lista.push(raiz); } catch (e) { /* disco sem leitura */ }
    }
  }
  return lista;
}

function rodar(programa, args, { env, limiteMs = 120000 } = {}) {
  return new Promise((resolve) => {
    let saida = '', erro = '';
    let p;
    try { p = spawn(programa, args, { env: { ...process.env, ...(env || {}) }, windowsHide: true }); }
    catch (e) { return resolve({ codigo: -1, saida: '', erro: String(e && e.message) }); }
    const relogio = setTimeout(() => { try { p.kill(); } catch (e) { /* já acabou */ } }, limiteMs);
    p.stdout.on('data', (b) => { if (saida.length < 2e6) saida += b; });
    p.stderr.on('data', (b) => { if (erro.length < 20000) erro += b; });
    p.on('error', (e) => { clearTimeout(relogio); resolve({ codigo: -1, saida, erro: String(e && e.message) }); });
    p.on('close', (codigo) => { clearTimeout(relogio); resolve({ codigo, saida, erro }); });
  });
}

// Quais arquivos de uma pasta podem sair: tudo que não está entre os 30 mais novos nem é a primeira cópia
// de um dos últimos 12 meses. Devolve a lista dos nomes a apagar (não apaga nada).
function sobrando(nomes, hoje) {
  const datas = nomes.map((n) => (RE_ARQUIVO.exec(n) || [])[1]).filter(Boolean).sort();
  const novos = new Set(datas.slice(-DIAS_GUARDADOS));
  const [ano, mes] = hoje.split('-').map(Number);
  const limite = new Date(Date.UTC(ano, mes - 1 - (MESES_GUARDADOS - 1), 1)).toISOString().slice(0, 7); // AAAA-MM mais antigo que fica
  const primeiraDoMes = new Map();
  for (const d of datas) { const m = d.slice(0, 7); if (!primeiraDoMes.has(m)) primeiraDoMes.set(m, d); }
  const mensais = new Set([...primeiraDoMes].filter(([m]) => m >= limite).map(([, d]) => d));
  return datas.filter((d) => !novos.has(d) && !mensais.has(d)).map((d) => `banco-${d}.dump`);
}

function limparAntigos(pasta, hoje) {
  let apagados = 0;
  try {
    for (const nome of sobrando(fs.readdirSync(pasta), hoje)) { try { fs.unlinkSync(path.join(pasta, nome)); apagados++; } catch (e) { /* em uso: fica para a próxima */ } }
  } catch (e) { /* pasta sem leitura: nada a limpar */ }
  return apagados;
}

// Copia trocando de uma vez só (grava ao lado e renomeia): quem lê nunca vê arquivo pela metade.
function copiarInteiro(origem, destino) {
  const temp = destino + '.novo';
  fs.copyFileSync(origem, temp);
  fs.renameSync(temp, destino);
}

function gravarLeiaMe(pasta) {
  const arq = path.join(pasta, 'LEIA-ME.txt');
  let atual = null;
  try { atual = fs.readFileSync(arq, 'utf8'); } catch (e) { atual = null; }
  if (atual !== LEIA_ME) fs.writeFileSync(arq, LEIA_ME);
}

// Leva para a pasta de destino os anexos que ainda não estão lá (ou estão com tamanho diferente).
// Nunca apaga nada no destino: anexo tirado do sistema continua guardado no backup.
function copiarAnexos(origem, destino) {
  let copiados = 0, total = 0;
  if (!fs.existsSync(origem)) return { copiados, total };
  fs.mkdirSync(destino, { recursive: true });
  for (const nome of fs.readdirSync(origem)) {
    const de = path.join(origem, nome);
    let info;
    try { info = fs.statSync(de); } catch (e) { continue; }
    if (!info.isFile() || /\.novo$/.test(nome)) continue;
    total++;
    const para = path.join(destino, nome);
    let la = null;
    try { la = fs.statSync(para); } catch (e) { la = null; }
    if (la && la.size === info.size) continue;
    copiarInteiro(de, para);
    copiados++;
  }
  return { copiados, total };
}

// Faz a cópia completa, confere e distribui. Nunca lança erro: devolve { ok, ... } com o que aconteceu.
// opcoes (os testes usam): agora, pastasDump, pastasAnexos, pastaLocal, pastaAnexosOrigem, pgBin, banco, usuario.
async function fazerBackupDoBanco(senha, opcoes = {}) {
  const agora = opcoes.agora || new Date();
  const hoje = hojeBrasilia(agora);
  const pgBin = opcoes.pgBin || PG_BIN;
  const pastaLocal = opcoes.pastaLocal || PASTA_LOCAL;
  const drives = opcoes.pastasDump ? [] : raizesDoDrive();
  const pastasDump = opcoes.pastasDump || [PASTA_ONEDRIVE, ...drives.map((r) => `${r}/${NOME_NA_NUVEM}`)];
  const pastasAnexos = opcoes.pastasAnexos || drives.map((r) => `${r}/${NOME_NA_NUVEM}/anexos`);
  const nome = `banco-${hoje}.dump`;
  const resumo = { ok: false, feito_em: agora.toISOString(), arquivo: nome, tamanho: 0, tabelas: 0, pastas: [], falhas: [], anexos: { copiados: 0, total: 0 }, semGoogleDrive: !opcoes.pastasDump && !drives.length };

  let temp;
  try {
    fs.mkdirSync(pastaLocal, { recursive: true });
    temp = path.join(pastaLocal, '_em-andamento.dump');
    try { fs.unlinkSync(temp); } catch (e) { /* não existia */ }

    const dump = await rodar(path.join(pgBin, 'pg_dump.exe'), ['-h', '127.0.0.1', '-p', '5432', '-U', opcoes.usuario || 'n8n_app',
      '-d', opcoes.banco || 'solucoes', '-Fc', '--exclude-table-data=public."Sessoes"', '-f', temp], { env: { PGPASSWORD: senha } });
    if (dump.codigo !== 0) throw new Error('o pg_dump falhou: ' + (dump.erro || 'código ' + dump.codigo).slice(0, 300));

    // Conferência: o próprio PostgreSQL lê o arquivo e lista o que tem dentro.
    const tamanho = fs.statSync(temp).size;
    const lista = await rodar(path.join(pgBin, 'pg_restore.exe'), ['--list', temp]);
    const tabelas = (lista.saida.match(/ TABLE DATA /g) || []).length;
    if (lista.codigo !== 0 || tamanho < 2000 || tabelas < TABELAS_MINIMAS || !lista.saida.includes('Entidades_Cadastradas')) {
      throw new Error(`a cópia não passou na conferência (tamanho ${tamanho}, ${tabelas} tabelas)`);
    }
    resumo.tamanho = tamanho;
    resumo.tabelas = tabelas;

    // Cópia boa: fica uma no próprio PC e vai para as nuvens (mesma regra de guarda em todas).
    for (const pasta of [pastaLocal, ...pastasDump]) {
      try {
        fs.mkdirSync(pasta, { recursive: true });
        copiarInteiro(temp, path.join(pasta, nome));
        limparAntigos(pasta, hoje);
        if (pasta !== pastaLocal) gravarLeiaMe(pasta);
        resumo.pastas.push(pasta);
      } catch (e) { resumo.falhas.push({ pasta, erro: String(e && e.message).slice(0, 200) }); }
    }

    // Anexos (fotos e PDFs): só o que ainda não está lá.
    for (const pasta of pastasAnexos) {
      try {
        const r = copiarAnexos(opcoes.pastaAnexosOrigem || PASTA_ANEXOS, pasta);
        resumo.anexos.copiados += r.copiados;
        resumo.anexos.total = r.total;
      } catch (e) { resumo.falhas.push({ pasta, erro: String(e && e.message).slice(0, 200) }); }
    }

    // "ok" = existe pelo menos uma cópia boa fora do arquivo temporário.
    resumo.ok = resumo.pastas.length > 0;
  } catch (e) {
    resumo.erro = String(e && e.message);
  } finally {
    if (temp) { try { fs.unlinkSync(temp); } catch (e) { /* já saiu */ } }
  }
  return resumo;
}

module.exports = { fazerBackupDoBanco, raizesDoDrive, sobrando, limparAntigos, copiarAnexos, hojeBrasilia, PASTA_ONEDRIVE, PASTA_LOCAL, NOME_NA_NUVEM };
