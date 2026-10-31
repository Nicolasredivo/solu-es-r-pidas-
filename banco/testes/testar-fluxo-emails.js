// Fluxo "App - E-mails" (Cadastro de e-mails, 31/10/2026): listar puxa sozinho os e-mails dos
// clientes, contatos e administradoras; salvar não repete; editar troca o e-mail também onde é
// usado; excluir tira de onde é usado. Só com cadastros e e-mails de teste, apagados no fim.
// Rodar depois que todos os e-mails reais já entraram no cadastro (o primeiro listar faz isso).
// Uso: node banco/testes/testar-fluxo-emails.js
const fs = require('fs');
const t = require('./comum');
const { CAD, local, lista, chamar, confere } = t;

const ARQ_BACKUP = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const DOMINIO = '@teste-emails.invalid';
const m = (nome) => nome + DOMINIO;
const campo = async (tabela, id, nome) => ((await local('GET', `/v0/${CAD}/${tabela}/${id}`)).fields || {})[nome] || '';

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const backupAntes = fs.existsSync(ARQ_BACKUP) ? fs.readFileSync(ARQ_BACKUP) : null;
  const apagar = []; // [tabela, id]

  try {
    await t.entrarComUsuarioDeTeste();

    const cli = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: {
      Razao_Social_Nome: 'TESTE EMAILS Cliente', Status: 'Ativo', Emails_Financeiro_NFE: [m('fin'), m('dupla')].join('\n') } });
    const con = await local('POST', `/v0/${CAD}/Contatos_Solicitantes`, { fields: {
      Nome_Contato: 'TESTE EMAILS Contato', Status: 'Ativo', Emails: [m('pessoa'), m('DUPLA')].join('\n') } });
    const adm = await local('POST', `/v0/${CAD}/Administradoras`, { fields: { Nome: 'TESTE EMAILS Administradora', Emails: m('adm') } });
    apagar.push(['Contatos_Solicitantes', con.id], ['Entidades_Cadastradas', cli.id], ['Administradoras', adm.id]);

    // ---- listar: os e-mails de teste entram sozinhos, sem repetir (dupla@ = DUPLA@) ----
    const l1 = await chamar('emails', { acao: 'listar' });
    const deTeste = (l) => (l.emails || []).filter((x) => x.email.toLowerCase().endsWith(DOMINIO));
    const achados = deTeste(l1);
    achados.forEach((x) => x.id && apagar.unshift(['Emails', x.id]));
    confere('listar: respondeu ok', l1.ok === true, l1);
    confere('listar: os 4 e-mails de teste entraram, sem repetir', achados.length === 4 && achados.every((x) => x.id), achados);
    const dupla = achados.find((x) => x.email.toLowerCase() === m('dupla'));
    confere('listar: mostra onde é usado', dupla && dupla.usadoEm.length === 2
      && dupla.usadoEm.some((u) => u.tipo === 'Cliente') && dupla.usadoEm.some((u) => u.tipo === 'Contato'), dupla);
    const l2 = await chamar('emails', { acao: 'listar' });
    confere('listar de novo: não cria outra vez', deTeste(l2).length === 4, deTeste(l2));

    // ---- salvar ----
    const s1 = await chamar('emails', { acao: 'salvar', email: m('novo'), pertence: 'Fulano Teste' });
    if (s1.email && s1.email.id) apagar.unshift(['Emails', s1.email.id]);
    confere('salvar: ok, com a quem pertence', s1.ok === true && s1.email && s1.email.pertence === 'Fulano Teste', s1);
    const s2 = await chamar('emails', { acao: 'salvar', email: m('NOVO') });
    confere('salvar: repetido é recusado', s2.ok === false && s2.jaExiste === true, s2);
    const s3 = await chamar('emails', { acao: 'salvar', email: 'sem-arroba' });
    confere('salvar: e-mail inválido é recusado', s3.ok === false, s3);

    // ---- editar: troca no cliente e no contato, sem repetir onde o novo já está ----
    const e1 = await chamar('emails', { acao: 'editar', id: dupla.id, email: m('trocado'), pertence: 'Dono Teste' });
    confere('editar: ok', e1.ok === true && e1.email && e1.email.email === m('trocado'), e1);
    confere('editar: trocou no financeiro do cliente', await campo('Entidades_Cadastradas', cli.id, 'Emails_Financeiro_NFE') === [m('fin'), m('trocado')].join('\n'));
    confere('editar: trocou nos e-mails do contato', await campo('Contatos_Solicitantes', con.id, 'Emails') === [m('pessoa'), m('trocado')].join('\n'));
    const fin = achados.find((x) => x.email.toLowerCase() === m('fin'));
    const e2 = await chamar('emails', { acao: 'editar', id: fin.id, email: m('pessoa') });
    confere('editar: para um e-mail que já existe é recusado', e2.ok === false, e2);
    const e3 = await chamar('emails', { acao: 'editar', id: fin.id, email: m('fin'), pertence: 'Só o dono' });
    confere('editar: só a quem pertence, sem mexer nos cadastros', e3.ok === true
      && await campo('Entidades_Cadastradas', cli.id, 'Emails_Financeiro_NFE') === [m('fin'), m('trocado')].join('\n'), e3);

    // ---- excluir: sai do cadastro e de onde é usado ----
    const x1 = await chamar('emails', { acao: 'excluir', id: dupla.id });
    confere('excluir: ok', x1.ok === true, x1);
    confere('excluir: saiu do cliente', await campo('Entidades_Cadastradas', cli.id, 'Emails_Financeiro_NFE') === m('fin'));
    confere('excluir: saiu do contato', await campo('Contatos_Solicitantes', con.id, 'Emails') === m('pessoa'));
    const sobra = await local('GET', `/v0/${CAD}/Emails/${dupla.id}`);
    confere('excluir: saiu do cadastro de e-mails', Boolean(sobra.error), sobra);
    const x2 = await chamar('emails', { acao: 'excluir', id: dupla.id });
    confere('excluir de novo: avisa que não existe mais', x2.ok === false, x2);
  } finally {
    // E-mails de teste que tenham sobrado (pelo domínio), depois os cadastros.
    for (const r of await lista(CAD, 'Emails')) {
      if (String(r.fields.Email || '').toLowerCase().endsWith(DOMINIO)) await local('DELETE', `/v0/${CAD}/Emails/${r.id}`).catch(() => {});
    }
    for (const [tabela, id] of apagar.filter((a) => a[0] !== 'Emails')) await local('DELETE', `/v0/${CAD}/${tabela}/${id}`).catch(() => {});
    await t.sairEApagarUsuarioDeTeste();
    await t.esperar(1500);
    if (backupAntes) fs.writeFileSync(ARQ_BACKUP, backupAntes);
  }

  const depois = await t.contarTudo();
  confere('nenhuma tabela mudou de tamanho', JSON.stringify(antes) === JSON.stringify(depois), { antes, depois });
  if (backupAntes) confere('backup dos cadastros voltou a ser o de antes', fs.readFileSync(ARQ_BACKUP).equals(backupAntes));
  const erros = await t.errosDesde(inicio);
  confere('nenhuma execução com erro no n8n', !erros.length, erros);
  const { ok, falhas } = t.placar();
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e); process.exitCode = 1; });
