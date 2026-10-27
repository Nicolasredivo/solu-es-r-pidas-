// Testa os fluxos do n8n que só leem, chamando os webhooks do jeito que o app chama.
// Entra com um usuário de teste (criado aqui, com senha gerada aqui) e o apaga no fim.
// Uso: node banco/testes/testar-fluxos-leitura.js
const fs = require('fs');
const crypto = require('crypto');

const token = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8').match(/^token do airtable local:\s*(\S+)/m)[1];
const CAD = 'app6PyYmtFduIMp7B', FIN = 'appjAmWXV7Zr33UqE';
const EMAIL_TESTE = 'teste-migracao@exemplo.invalid';

async function local(metodo, caminho, corpo) {
  const r = await fetch('http://127.0.0.1:5690' + caminho, {
    method: metodo, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return r.json();
}
const lista = (base, t, extra = '') => local('GET', `/v0/${base}/${t}?_itens=1${extra}`);

let tokenAcesso = '';
async function chamar(caminho, dados = {}) {
  // igual ao app (fetchN8n): formulário simples, todos os valores como texto
  const r = await fetch('http://localhost:5678/webhook/' + caminho, {
    method: 'POST',
    body: new URLSearchParams({ ...dados, tokenAcesso }),
  });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return { _status: r.status, _texto: txt.slice(0, 200) }; }
}

let ok = 0, falhas = 0;
function confere(nome, cond, detalhe) {
  if (cond) { ok++; console.log('ok    ', nome); }
  else { falhas++; console.log('FALHOU', nome, detalhe === undefined ? '' : JSON.stringify(detalhe).slice(0, 400)); }
}

(async () => {
  // usuário de teste com senha gerada agora (fica só na memória deste teste)
  const senha = crypto.randomBytes(18).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = salt + ':' + crypto.scryptSync(senha, salt, 64).toString('hex');
  const velho = await lista(CAD, 'Usuarios', '&filterByFormula=' + encodeURIComponent(`LOWER({Email})='${EMAIL_TESTE}'`));
  for (const v of velho) await local('DELETE', `/v0/${CAD}/Usuarios/${v.id}`);
  const usu = await local('POST', `/v0/${CAD}/Usuarios`, { fields: { Nome: 'TESTE MIGRACAO', Email: EMAIL_TESTE, Papel: 'Dono', Ativo: true, Senha_Hash: hash } });
  let tokenSessao = '';
  try {
    const login = await chamar('login', { email: EMAIL_TESTE.toUpperCase(), senha, dispositivo: 'teste da migração' });
    confere('login com usuário de teste', login.ok === true && !!login.tokenAcesso && !!login.tokenSessao, login);
    tokenAcesso = login.tokenAcesso; tokenSessao = login.tokenSessao;
    const ruim = await chamar('login', { email: EMAIL_TESTE, senha: senha + 'x', dispositivo: 'teste' });
    confere('login com senha errada é recusado', ruim.ok !== true, ruim);
    const sess = await lista(CAD, 'Sessoes', '&filterByFormula=' + encodeURIComponent(`{Token}='${tokenSessao}'`));
    confere('login gravou a sessão no banco', sess.length === 1 && sess[0].fields.Usuario[0] === usu.id, sess);

    const ren = await chamar('renovar-token', { tokenSessao });
    confere('renovar-token', ren.ok === true && !!ren.tokenAcesso, ren);
    if (ren.tokenAcesso) tokenAcesso = ren.tokenAcesso;
    confere('testar-conexao', (await chamar('testar-conexao')).ok === true);

    const ents = await lista(CAD, 'Entidades_Cadastradas');
    const lc = await chamar('listar-cadastros');
    confere('listar-cadastros', lc.ok === true && Array.isArray(lc.cadastros) && lc.cadastros.length >= ents.length - 1, { ok: lc.ok, n: lc.cadastros && lc.cadastros.length, banco: ents.length });
    const e = ents.find((x) => (x.fields.Locais_Atendimento || []).length && (x.fields.Contatos_Solicitantes || []).length && x.fields.CPF_CNPJ);
    const det = await chamar('detalhe-cadastro', { id: e.id, documento: e.fields.CPF_CNPJ });
    confere('detalhe-cadastro', det.ok === true && JSON.stringify(det).includes(e.fields.CPF_CNPJ), { ok: det.ok, msg: det.mensagem });
    const ll = await chamar('listar-locais', { entidadeId: e.id });
    confere('listar-locais', ll.ok === true && ll.locais.length === e.fields.Locais_Atendimento.length, ll);
    const lco = await chamar('listar-contatos', { entidadeId: e.id });
    confere('listar-contatos', lco.ok === true && lco.contatos.length === e.fields.Contatos_Solicitantes.length, lco);
    const cd = await chamar('consultar-documento', { documento: e.fields.CPF_CNPJ });
    confere('consultar-documento (já cadastrado)', JSON.stringify(cd).includes(e.id) || cd.existe === true || cd.jaExiste === true, cd);

    const chamados = await lista(CAD, 'Chamados');
    const lch = await chamar('listar-chamados');
    const abertos = chamados.filter((c) => c.fields.Status !== 'Concluído').length;
    confere('listar-chamados', lch.ok === true && lch.semData.length + lch.comData.length === abertos, { ok: lch.ok, n: lch.semData && lch.semData.length + lch.comData.length, abertos });

    const cont = async (b, t) => (await lista(b, t)).length;
    const ld = await chamar('listar-despesas');
    confere('listar-despesas', ld.ok === true && ld.despesas.length === await cont(FIN, 'Despesas'), { ok: ld.ok, n: ld.despesas && ld.despesas.length });
    const lf = await chamar('listar-fornecedores');
    confere('listar-fornecedores', lf.ok === true && lf.fornecedores.length === await cont(FIN, 'Fornecedores'), lf);
    const lr = await chamar('listar-recorrentes');
    confere('listar-recorrentes', lr.ok === true && lr.recorrentes.length === await cont(FIN, 'Recorrentes'), { ok: lr.ok, n: lr.recorrentes && lr.recorrentes.length });
    const lrec = await chamar('listar-recebimentos');
    confere('listar-recebimentos', lrec.ok === true && Array.isArray(lrec.recebimentos || lrec.receitas), lrec);
    const lcfg = await chamar('listar-config');
    confere('listar-config (linha com os dados dos sócios)', lcfg.ok === true && lcfg.config && !!(lcfg.config.socio1Nome || lcfg.config.Socio_1_Nome || JSON.stringify(lcfg.config).match(/socio/i)), lcfg);
    confere('listar-conferencias', (await chamar('listar-conferencias')).ok === true);
    confere('listar-retiradas', (await chamar('listar-retiradas')).ok === true);
    confere('listar-cartoes', (await chamar('listar-cartoes')).ok === true);
    confere('listar-pagamentos-fatura', (await chamar('listar-pagamentos-fatura')).ok === true);
    const lu = await chamar('listar-usuarios');
    confere('listar-usuarios', lu.ok === true && JSON.stringify(lu).includes('TESTE MIGRACAO'), { ok: lu.ok, msg: lu.mensagem });
    const at = await chamar('atendimento', { acao: 'listar' });
    confere('atendimento (listar)', at.ok === true && Array.isArray(at.visitas), at);
  } finally {
    // encerra a sessão pelo fluxo do app e apaga o usuário de teste
    if (tokenSessao) {
      const enc = await chamar('encerrar-sessao', { tokenSessao });
      // o fluxo responde ao app primeiro e apaga a sessão logo depois
      let resto = [];
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        resto = await lista(CAD, 'Sessoes', '&filterByFormula=' + encodeURIComponent(`{Token}='${tokenSessao}'`));
        if (!resto.length) break;
      }
      confere('encerrar-sessao apaga a sessão', resto.length === 0, { enc, resto: resto.length });
    }
    await local('DELETE', `/v0/${CAD}/Usuarios/${usu.id}`);
    const sobra = await lista(CAD, 'Usuarios', '&filterByFormula=' + encodeURIComponent(`LOWER({Email})='${EMAIL_TESTE}'`));
    confere('usuário de teste apagado', sobra.length === 0);
    console.log(`\n${ok} ok, ${falhas} falha(s).`);
    process.exitCode = falhas ? 1 : 0;
  }
})();
