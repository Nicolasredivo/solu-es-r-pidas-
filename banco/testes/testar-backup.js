// Roda o fluxo "App - Backup de tudo" (webhook fazer-backup) e confere o arquivo gerado.
// Uso: node banco/testes/testar-backup.js
const fs = require('fs');
const t = require('./comum');
const { FIN, CAD, lista, chamar, confere } = t;

(async () => {
  // O fluxo está desligado de propósito desde 27/10/2026 (decisão do dono); desde 14/11/2026 o backup é do banco
  // inteiro (banco/backup-banco.js, teste testar-backup-banco.js). Desligado = nada a testar aqui.
  const fluxo = (await t.n8n('GET', '/workflows?limit=250')).data.find((w) => w.name === 'App - Backup de tudo');
  if (!fluxo || !fluxo.active) {
    console.log('"App - Backup de tudo" está desligado de propósito (o backup agora é o do banco inteiro): nada a testar.');
    return;
  }
  await t.entrarComUsuarioDeTeste();
  try {
    const r = await chamar('fazer-backup');
    confere('fazer-backup responde', r.ok === true, r);
    const arq = 'C:/Users/rediv/.n8n-files/backups-sistema/' + r.dia + '.json';
    const b = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const conteudo = Array.isArray(b) ? b[0] : b;
    const esperado = {
      'Financeiro / Despesas': (await lista(FIN, 'Despesas')).length,
      'Financeiro / Config_Financeiro': (await lista(FIN, 'Config_Financeiro')).length,
      'cadastro / Entidades_Cadastradas': (await lista(CAD, 'Entidades_Cadastradas')).length,
      'cadastro / Locais_Atendimento': (await lista(CAD, 'Locais_Atendimento')).length,
      'cadastro / Contatos_Solicitantes': (await lista(CAD, 'Contatos_Solicitantes')).length,
    };
    for (const [k, n] of Object.entries(esperado)) confere(`backup tem ${k} (${n})`, conteudo.tabelas[k] === n, conteudo.tabelas);
    console.log('arquivo:', arq, fs.statSync(arq).size, 'bytes; total', conteudo.total_de_registros, 'registros');
  } finally {
    await t.sairEApagarUsuarioDeTeste();
    const p = t.placar();
    console.log(`\n${p.ok} ok, ${p.falhas} falha(s).`);
    process.exitCode = p.falhas ? 1 : 0;
  }
})();
