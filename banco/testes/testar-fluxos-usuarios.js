// Testa os fluxos de usuários: convidar, criar conta com código, entrar, desativar/reativar,
// recuperar senha e cancelar convite. Os que mandam e-mail rodam em CÓPIAS, com o e-mail
// simulado (o código é lido do registro da execução da cópia). Usuários de teste só,
// apagados no fim. Uso: node banco/testes/testar-fluxos-usuarios.js
const crypto = require('crypto');
const t = require('./comum');
const { CAD, local, lista, chamar, confere, sessao } = t;

const CONVIDADO = 'convidado-migracao@exemplo.invalid';
const OUTRO = 'convite-cancelado-migracao@exemplo.invalid';

async function codigoDaCopia(copiaId, noComCodigo) {
  for (let i = 0; i < 20; i++) {
    const r = await t.n8n('GET', `/executions?workflowId=${copiaId}&includeData=true&limit=5`);
    for (const e of r.data) {
      const run = ((e.data || {}).resultData || {}).runData || {};
      const saida = run[noComCodigo] && run[noComCodigo][0].data.main[0][0].json;
      if (saida && saida.codigo) return saida.codigo;
    }
    await t.esperar(500);
  }
  return '';
}

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  const copias = [];
  let erros = [];
  await t.entrarComUsuarioDeTeste();
  const tokenDono = sessao.tokenAcesso;
  try {
    for (const e of [CONVIDADO, OUTRO]) for (const v of await lista(CAD, 'Usuarios', `LOWER({Email})='${e}'`)) await local('DELETE', `/v0/${CAD}/Usuarios/${v.id}`);

    const cv = await chamar('convidar-usuario', { nome: 'Convidado Teste', email: CONVIDADO, papel: 'Usuario', senhaConfirmacao: sessao.senha });
    const [conv] = await lista(CAD, 'Usuarios', `LOWER({Email})='${CONVIDADO}'`);
    confere('convidar-usuario', cv.ok === true && conv && conv.fields.Nome === 'Convidado Teste' && conv.fields.Papel === 'Usuario' && !conv.fields.Senha_Hash && !conv.fields.Ativo, { cv, f: conv && conv.fields });
    const lu = await chamar('listar-usuarios');
    confere('listar-usuarios mostra o convite', lu.ok === true && JSON.stringify(lu).includes(CONVIDADO), { ok: lu.ok });

    // ---- criar conta: código por e-mail (simulado na cópia) ----
    const iniciar = await t.copiaDeTeste('ZN76LeBdtmgk3pRT', { simulacoes: { 'Envia codigo': 'return $input.all();' } });
    copias.push(iniciar);
    const ci = await chamar(iniciar.caminho, { email: CONVIDADO });
    const codigo = await codigoDaCopia(iniciar.id, 'Decide');
    const conv2 = await local('GET', `/v0/${CAD}/Usuarios/${conv.id}`);
    confere('cadastro-iniciar (cópia): código gerado e gravado', ci.ok !== false && /^\d{6}$/.test(codigo)
      && conv2.fields.Codigo_Recuperacao_Hash === crypto.createHash('sha256').update(codigo).digest('hex'), { ci, temCodigo: !!codigo });
    const vr = await chamar('cadastro-verificar', { email: CONVIDADO, codigo });
    confere('cadastro-verificar', vr.ok === true, vr);
    const vrErrado = await chamar('cadastro-verificar', { email: CONVIDADO, codigo: codigo === '000000' ? '111111' : '000000' });
    const conv3 = await local('GET', `/v0/${CAD}/Usuarios/${conv.id}`);
    confere('cadastro-verificar com código errado conta a tentativa', vrErrado.ok !== true && conv3.fields.Codigo_Tentativas === 1, { vrErrado, n: conv3.fields.Codigo_Tentativas });
    const senhaConvidado = crypto.randomBytes(12).toString('base64url');
    sessao.tokenAcesso = '';
    const cc = await chamar('cadastro-concluir', { email: CONVIDADO, codigo, senha: senhaConvidado, nome: 'Convidado Teste', dispositivo: 'teste da migração' });
    const conv4 = await local('GET', `/v0/${CAD}/Usuarios/${conv.id}`);
    confere('cadastro-concluir ativa a conta e cria a sessão', cc.ok === true && !!cc.tokenAcesso && conv4.fields.Ativo === true && !!conv4.fields.Senha_Hash && (conv4.fields.Sessoes || []).length === 1, { cc: { ok: cc.ok, msg: cc.mensagem }, f: { Ativo: conv4.fields.Ativo, s: conv4.fields.Sessoes } });
    const lg = await chamar('login', { email: CONVIDADO, senha: senhaConvidado, dispositivo: 'teste' });
    confere('login do convidado com a senha nova', lg.ok === true, { ok: lg.ok });

    // ---- desativar e reativar (como Dono) ----
    sessao.tokenAcesso = tokenDono;
    const des = await chamar('gerenciar-usuario', { usuarioId: conv.id, ativo: 'false', senhaConfirmacao: sessao.senha });
    await t.esperar(1500);
    const conv5 = await local('GET', `/v0/${CAD}/Usuarios/${conv.id}`);
    confere('gerenciar-usuario: desativar tira de todos os aparelhos', des.ok === true && !conv5.fields.Ativo && !(conv5.fields.Sessoes || []).length, { des, f: { Ativo: conv5.fields.Ativo, s: conv5.fields.Sessoes } });
    const lgDesativado = await chamar('login', { email: CONVIDADO, senha: senhaConvidado, dispositivo: 'teste' });
    confere('conta desativada não entra', lgDesativado.ok !== true, lgDesativado);
    const rea = await chamar('gerenciar-usuario', { usuarioId: conv.id, ativo: 'true', senhaConfirmacao: sessao.senha });
    confere('gerenciar-usuario: reativar', rea.ok === true && (await local('GET', `/v0/${CAD}/Usuarios/${conv.id}`)).fields.Ativo === true, rea);

    // ---- recuperar senha: código por e-mail (simulado na cópia) ----
    const solicitar = await t.copiaDeTeste('N8TJAOvnBa31Dnwk', { simulacoes: { 'Envia codigo': 'return $input.all();' } });
    copias.push(solicitar);
    sessao.tokenAcesso = '';
    const sr = await chamar(solicitar.caminho, { email: CONVIDADO });
    const codigo2 = await codigoDaCopia(solicitar.id, 'Gera codigo');
    confere('solicitar-recuperacao (cópia): código gerado', sr.ok !== false && /^\d{6}$/.test(codigo2), { sr, temCodigo: !!codigo2 });
    const vc = await chamar('verificar-codigo', { email: CONVIDADO, codigo: codigo2 });
    confere('verificar-codigo', vc.ok === true, vc);
    const senhaNova = crypto.randomBytes(12).toString('base64url');
    const rs = await chamar('redefinir-senha', { email: CONVIDADO, codigo: codigo2, novaSenha: senhaNova });
    await t.esperar(1500);
    confere('redefinir-senha', rs.ok === true, rs);
    confere('entra com a senha nova', (await chamar('login', { email: CONVIDADO, senha: senhaNova, dispositivo: 'teste' })).ok === true);
    confere('não entra com a senha antiga', (await chamar('login', { email: CONVIDADO, senha: senhaConvidado, dispositivo: 'teste' })).ok !== true);

    // ---- convite cancelado ----
    sessao.tokenAcesso = tokenDono;
    await chamar('convidar-usuario', { nome: 'Outro Teste', email: OUTRO, papel: 'Usuario', senhaConfirmacao: sessao.senha });
    const [outro] = await lista(CAD, 'Usuarios', `LOWER({Email})='${OUTRO}'`);
    const can = outro ? await chamar('gerenciar-usuario', { usuarioId: outro.id, acao: 'cancelar_convite', senhaConfirmacao: sessao.senha }) : {};
    await t.esperar(1000);
    confere('gerenciar-usuario: cancelar convite apaga o convite', outro && can.ok === true && !(await lista(CAD, 'Usuarios', `LOWER({Email})='${OUTRO}'`)).length, { can });
  } finally {
    await t.esperar(1000);
    erros = await t.errosDesde(inicio);
    await t.apagarCopias(copias);
    for (const e of [CONVIDADO, OUTRO]) for (const v of await lista(CAD, 'Usuarios', `LOWER({Email})='${e}'`)) await local('DELETE', `/v0/${CAD}/Usuarios/${v.id}`);
    await t.sairEApagarUsuarioDeTeste();
    await t.esperar(1000);
    const depois = await t.contarTudo();
    confere('quantidades voltaram ao que eram', JSON.stringify(antes) === JSON.stringify(depois), { antes, depois });
    confere('n8n sem execuções com erro', erros.length === 0, erros);
    const restantes = (await t.n8n('GET', '/workflows?limit=100')).data.filter((w) => w.name.startsWith('TMP teste migracao'));
    confere('nenhuma cópia de teste sobrou no n8n', restantes.length === 0, restantes.map((w) => w.name));
    const p = t.placar();
    console.log(`\n${p.ok} ok, ${p.falhas} falha(s).`);
    process.exitCode = p.falhas ? 1 : 0;
  }
})();
