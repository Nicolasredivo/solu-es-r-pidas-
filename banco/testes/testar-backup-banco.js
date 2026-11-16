// Backup do banco inteiro (14/11/2026): banco/backup-banco.js.
// Faz a cópia de verdade do banco (só LEITURA no banco do sistema) para pastas temporárias, confere o arquivo,
// as regras de guarda (30 dias + 1 por mês), a cópia dos anexos, as falhas (ferramenta ausente, pasta com
// defeito) e, por fim, RESTAURA a cópia num banco de rascunho ("teste_restauracao_backup", criado e apagado
// aqui) e compara a quantidade de linhas de cada tabela com o banco de verdade.
// Não grava nada no banco do sistema, não toca nas pastas da nuvem.
// Uso: node banco/testes/testar-backup-banco.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { fazerBackupDoBanco, sobrando, hojeBrasilia } = require('../backup-banco.js');

const segredos = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8');
const SENHA_N8N = segredos.match(/^senha do n8n:\s*(\S+)/m)[1];
const ADMIN = (segredos.match(/^usuario:\s*(\S+)/m) || [])[1];
const SENHA_ADMIN = (segredos.match(/^senha:\s*(\S+)/m) || [])[1];
const PG = 'C:/Users/rediv/postgresql/bin';
const RASCUNHO = 'teste_restauracao_backup';

let ok = 0, falhas = 0;
const confere = (nome, cond, detalhe) => {
  if (cond) { ok++; console.log('ok    ', nome); }
  else { falhas++; console.log('FALHOU', nome, detalhe === undefined ? '' : JSON.stringify(detalhe).slice(0, 400)); }
};
const psql = (usuario, senha, banco, sql) => {
  const r = spawnSync(path.join(PG, 'psql.exe'), ['-h', '127.0.0.1', '-p', '5432', '-U', usuario, '-d', banco, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { env: { ...process.env, PGPASSWORD: senha, PGCLIENTENCODING: 'UTF8' }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('psql: ' + String(r.stderr).slice(0, 300));
  return r.stdout.trim();
};
const contagens = (usuario, senha, banco) => {
  const tabelas = psql(usuario, senha, banco, "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1").split(/\r?\n/).filter(Boolean);
  const q = {};
  for (const t of tabelas) q[t] = Number(psql(usuario, senha, banco, `select count(*) from "${t}"`));
  return q;
};

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'teste-backup-banco-'));
  const A = path.join(base, 'nuvem A'), B = path.join(base, 'nuvem B'), LOCAL = path.join(base, 'local');
  const ORIGEM = path.join(base, 'anexos origem'), ANEXOS = path.join(base, 'nuvem B', 'anexos');
  fs.mkdirSync(ORIGEM, { recursive: true });
  fs.writeFileSync(path.join(ORIGEM, 'att00000000000000000000000000000001'), Buffer.alloc(1500, 1));
  fs.writeFileSync(path.join(ORIGEM, 'att00000000000000000000000000000001.json'), '{"filename":"teste.pdf"}');
  const op = { pastasDump: [A, B], pastasAnexos: [ANEXOS], pastaLocal: LOCAL, pastaAnexosOrigem: ORIGEM };
  const hoje = hojeBrasilia();
  try {
    // ---------- cópia normal ----------
    const r = await fazerBackupDoBanco(SENHA_N8N, op);
    const arq = `banco-${hoje}.dump`;
    confere('a cópia completa deu certo', r.ok === true && !r.erro, r);
    confere('o arquivo do dia está nas duas pastas de nuvem e na pasta local', [A, B, LOCAL].every((p) => fs.existsSync(path.join(p, arq))), r.pastas);
    confere('a cópia tem todas as tabelas (20 ou mais) e tamanho de verdade', r.tabelas >= 20 && r.tamanho > 2000, { tabelas: r.tabelas, tamanho: r.tamanho });
    confere('não sobra arquivo temporário nem ".novo"', [A, B, LOCAL].every((p) => !fs.readdirSync(p).some((n) => /\.novo$|_em-andamento/.test(n))));
    confere('as pastas de nuvem ganham o LEIA-ME; a local não', fs.existsSync(path.join(A, 'LEIA-ME.txt')) && fs.existsSync(path.join(B, 'LEIA-ME.txt')) && !fs.existsSync(path.join(LOCAL, 'LEIA-ME.txt')));
    confere('os anexos foram copiados (2 arquivos)', r.anexos.copiados === 2 && fs.existsSync(path.join(ANEXOS, 'att00000000000000000000000000000001')), r.anexos);

    const lista = spawnSync(path.join(PG, 'pg_restore.exe'), ['--list', path.join(A, arq)], { encoding: 'utf8' }).stdout;
    confere('as sessões abertas NÃO vão na cópia (a tabela vai, os dados não)', /TABLE public Sessoes/.test(lista) && !/TABLE DATA public Sessoes/.test(lista));
    confere('usuários e clientes vão na cópia', /TABLE DATA public Usuarios/.test(lista) && /TABLE DATA public Entidades_Cadastradas/.test(lista));

    // ---------- de novo no mesmo dia: troca o arquivo, não duplica; anexos não se repetem ----------
    const antes = fs.readdirSync(A).filter((n) => n.endsWith('.dump')).length;
    fs.writeFileSync(path.join(ORIGEM, 'att00000000000000000000000000000002'), Buffer.alloc(700, 2));
    const r2 = await fazerBackupDoBanco(SENHA_N8N, op);
    confere('segunda cópia no mesmo dia troca o arquivo (continua um só)', r2.ok && fs.readdirSync(A).filter((n) => n.endsWith('.dump')).length === antes);
    confere('só o anexo novo é copiado', r2.anexos.copiados === 1 && r2.anexos.total === 3, r2.anexos);
    fs.unlinkSync(path.join(ORIGEM, 'att00000000000000000000000000000002'));
    const r3 = await fazerBackupDoBanco(SENHA_N8N, op);
    confere('anexo tirado do sistema continua guardado no backup', r3.ok && fs.existsSync(path.join(ANEXOS, 'att00000000000000000000000000000002')));

    // ---------- guarda: 30 dias + a primeira cópia de cada um dos últimos 12 meses ----------
    const nomes = [];
    for (let d = 0; d < 430; d++) nomes.push('banco-' + new Date(Date.UTC(2026, 10, 14) - d * 86400000).toISOString().slice(0, 10) + '.dump');
    const saem = new Set(sobrando([...nomes, 'LEIA-ME.txt', 'outro-arquivo.dump'], '2026-11-14'));
    const ficam = nomes.filter((n) => !saem.has(n)).sort();
    confere('ficam os 30 dias mais novos', ficam.filter((n) => n >= 'banco-2026-10-16.dump').length === 30, ficam.slice(-31));
    confere('mais a primeira cópia de cada mês, por 12 meses (dez/2025 a nov/2026)',
      ['2025-12-01', '2026-01-01', '2026-06-01', '2026-10-01'].every((d) => ficam.includes(`banco-${d}.dump`)) && !ficam.includes('banco-2025-11-01.dump'), ficam.slice(0, 14));
    confere('total guardado = 30 + 11 meses anteriores', ficam.length === 41, ficam.length);
    confere('arquivo que não é cópia do banco nunca entra na lista de apagar', !saem.has('LEIA-ME.txt') && !saem.has('outro-arquivo.dump'));
    // na pasta de verdade (temporária): com 35 cópias velhas de mentira + a de hoje, ficam as 30 mais novas
    // (a guarda é por quantidade, não por idade: PC desligado por meses não faz as cópias antigas sumirem).
    for (let d = 1; d <= 35; d++) fs.writeFileSync(path.join(A, 'banco-' + new Date(Date.UTC(2024, 0, d)).toISOString().slice(0, 10) + '.dump'), 'velho');
    const r4 = await fazerBackupDoBanco(SENHA_N8N, op);
    const restam = fs.readdirSync(A).filter((n) => n.endsWith('.dump')).sort();
    confere('cópias além das 30 mais novas são apagadas da pasta (as mais velhas primeiro)',
      r4.ok && restam.length === 30 && !restam.includes('banco-2024-01-06.dump') && restam.includes('banco-2024-01-07.dump') && restam.includes(arq), restam.slice(0, 3));

    // ---------- falhas ----------
    const bom = fs.statSync(path.join(A, arq));
    const r5 = await fazerBackupDoBanco(SENHA_N8N, { ...op, pgBin: path.join(base, 'nao-existe') });
    const depois = fs.statSync(path.join(A, arq));
    confere('ferramenta ausente: avisa o erro e NÃO troca a cópia boa', r5.ok === false && Boolean(r5.erro) && depois.size === bom.size && depois.mtimeMs === bom.mtimeMs, r5);
    const r6 = await fazerBackupDoBanco('senha-errada-de-proposito', op);
    confere('senha do banco errada: avisa o erro e não troca a cópia boa', r6.ok === false && fs.statSync(path.join(A, arq)).mtimeMs === bom.mtimeMs, r6.erro);
    const ruim = path.join(base, 'arquivo-no-lugar-da-pasta');
    fs.writeFileSync(ruim, 'x');
    const r7 = await fazerBackupDoBanco(SENHA_N8N, { ...op, pastasDump: [path.join(ruim, 'dentro'), B] });
    confere('uma pasta com defeito não derruba as outras', r7.ok === true && r7.falhas.length === 1 && r7.pastas.includes(B), r7);

    // ---------- restauração de verdade, num banco de rascunho ----------
    if (!ADMIN || !SENHA_ADMIN) {
      confere('restauração (precisa do usuário administrador do banco)', false, 'não achei usuario/senha no arquivo de senhas');
    } else {
      psql(ADMIN, SENHA_ADMIN, 'postgres', `drop database if exists ${RASCUNHO}`);
      psql(ADMIN, SENHA_ADMIN, 'postgres', `create database ${RASCUNHO}`);
      try {
        const reais = contagens('n8n_app', SENHA_N8N, 'solucoes');
        const r8 = await fazerBackupDoBanco(SENHA_N8N, op);
        const rest = spawnSync(path.join(PG, 'pg_restore.exe'), ['-h', '127.0.0.1', '-p', '5432', '-U', ADMIN, '-d', RASCUNHO, '--exit-on-error', path.join(A, arq)],
          { env: { ...process.env, PGPASSWORD: SENHA_ADMIN }, encoding: 'utf8' });
        confere('a cópia restaura sem nenhum erro', r8.ok && rest.status === 0, String(rest.stderr).slice(0, 300));
        const restauradas = contagens(ADMIN, SENHA_ADMIN, RASCUNHO);
        const diferentes = Object.keys(reais).filter((t) => t !== 'Sessoes' && reais[t] !== restauradas[t]);
        confere(`todas as ${Object.keys(reais).length} tabelas voltam com a mesma quantidade de linhas`, Object.keys(restauradas).length === Object.keys(reais).length && !diferentes.length, diferentes);
        confere('a tabela de sessões volta vazia (quem estava logado entra de novo)', restauradas.Sessoes === 0, restauradas.Sessoes);
        const fn = psql(ADMIN, SENHA_ADMIN, RASCUNHO, "select count(*) from pg_proc where proname = 'novo_id'");
        confere('a função que cria os códigos dos registros volta junto', fn === '1', fn);
      } finally {
        psql(ADMIN, SENHA_ADMIN, 'postgres', `drop database if exists ${RASCUNHO}`);
      }
      const sobrou = psql(ADMIN, SENHA_ADMIN, 'postgres', `select count(*) from pg_database where datname = '${RASCUNHO}'`);
      confere('o banco de rascunho foi apagado no fim', sobrou === '0', sobrou);
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  if (falhas) process.exitCode = 1;
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
