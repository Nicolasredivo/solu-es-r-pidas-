// "NFS-e local": monta a DPS (o pedido de nota) e entrega ao banco/nfse-assinar.ps1, que assina com o
// certificado instalado no Windows e envia à Sefin Nacional. Os fluxos do n8n falam só com este serviço.
//
// O ambiente vem do "ambiente" em nfse-config.json: "restrita" (testes do governo, tpAmb 2, sem
// validade; é o padrão) ou "producao" (nota de verdade, tpAmb 1). Os dois têm layout próprio.
//
// Escuta só em 127.0.0.1 e exige o token do Airtable local (C:\Users\rediv\senha-banco.txt).
// O CNPJ da empresa fica em C:\Users\rediv\nfse-config.json, fora do repositório.
// Uso: node banco/nfse-local.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORTA = Number(process.env.NFSE_PORTA) || 5691;
const LIMITE_CORPO = 256 * 1024;
const LIMITE_DESCRICAO = 1100; // regra do dono: acima disso o PDF da nota pode cortar o texto
const SCRIPT = path.join(__dirname, 'nfse-assinar.ps1');
const NS = 'http://www.sped.fazenda.gov.br/nfse';

const TOKEN = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8').match(/^token do airtable local:\s*(\S+)/m)[1];
const CONFIG = JSON.parse(fs.readFileSync('C:/Users/rediv/nfse-config.json', 'utf8').replace(/^\uFEFF/, ''));
const AMBIENTE = CONFIG.ambiente === undefined ? 'restrita' : CONFIG.ambiente;
if (!['restrita', 'producao'].includes(AMBIENTE)) throw new Error('ambiente desconhecido em nfse-config.json');

const escapar = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = (v) => String(v == null ? '' : v).replace(/\D/g, '');

function cnpjValido(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * ((n - i - 1) % 8 + 2);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

function cpfValido(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

// Hora de Brasília. A Sefin recusa emissão no futuro; a folga cobre relógio um pouco adiantado.
function agoraBrasilia() {
  const d = new Date(Date.now() - 3 * 3600 * 1000 - 60 * 1000).toISOString();
  return { dhEmi: d.slice(0, 19) + '-03:00', dCompet: d.slice(0, 10) };
}

function enderecoXml(e) {
  return `<xLgr>${escapar(e.logradouro)}</xLgr><nro>${escapar(e.numero)}</nro>`
    + (e.complemento ? `<xCpl>${escapar(e.complemento)}</xCpl>` : '') + `<xBairro>${escapar(e.bairro)}</xBairro>`;
}

function conferirEndereco(e, nome, erros) {
  if (!e || !/^\d{8}$/.test(so(e.cep))) erros.push(`${nome}: CEP inválido`);
  if (!e || !String(e.logradouro || '').trim()) erros.push(`${nome}: falta a rua`);
  if (!e || !String(e.numero || '').trim()) erros.push(`${nome}: falta o número`);
  if (!e || !String(e.bairro || '').trim()) erros.push(`${nome}: falta o bairro`);
}

// Devolve a lista do que está faltando ou errado, em português, antes de gastar uma ida ao governo.
function conferirPedido(p) {
  const erros = [];
  if (!/^[1-9]\d{0,14}$/.test(String(p.numero == null ? '' : p.numero))) erros.push('número da DPS inválido');
  if (!String(p.descricao || '').trim()) erros.push('falta a descrição do serviço');
  if (String(p.descricao || '').length > LIMITE_DESCRICAO) erros.push(`descrição acima de ${LIMITE_DESCRICAO} caracteres`);
  if (!/^\d+\.\d{2}$/.test(String(p.valor || '')) || Number(p.valor) <= 0) erros.push('valor inválido (formato 123.45)');
  if (p.tomador) {
    if (p.tomador.cpf ? !cpfValido(so(p.tomador.cpf)) : !cnpjValido(so(p.tomador.cnpj))) erros.push(p.tomador.cpf ? 'tomador: CPF inválido' : 'tomador: CNPJ inválido');
    if (!String(p.tomador.nome || '').trim()) erros.push('tomador: falta o nome');
    conferirEndereco(p.tomador.endereco, 'tomador', erros);
    if (!/^\d{7}$/.test(so(p.tomador.endereco && p.tomador.endereco.municipioIbge))) erros.push('tomador: código do município inválido');
  }
  conferirEndereco(p.obra, 'obra', erros); // obrigatória no 070501
  return erros;
}

function idDaDps(numero) {
  return 'DPS' + CONFIG.municipioIbge + '2' + CONFIG.cnpj + String(CONFIG.serie).padStart(5, '0') + String(numero).padStart(15, '0');
}

// Os layouts mudam pouco: o de testes (esquema de 20/10/2026) exige finNFSe e põe cNBS antes da
// descrição; o de produção é o das notas reais aceitas em 04/11/2026, sem finNFSe e com cNBS depois.
function montarDps(p, ambiente = AMBIENTE) {
  const producao = ambiente === 'producao';
  const id = idDaDps(p.numero);
  const { dhEmi, dCompet } = agoraBrasilia();
  const toma = p.tomador
    ? `<toma>${p.tomador.cpf ? `<CPF>${so(p.tomador.cpf)}</CPF>` : `<CNPJ>${so(p.tomador.cnpj)}</CNPJ>`}<xNome>${escapar(p.tomador.nome)}</xNome><end><endNac><cMun>${so(p.tomador.endereco.municipioIbge)}</cMun><CEP>${so(p.tomador.endereco.cep)}</CEP></endNac>${enderecoXml(p.tomador.endereco)}</end></toma>`
    : '';
  const contato = (CONFIG.fone ? `<fone>${escapar(CONFIG.fone)}</fone>` : '') + (CONFIG.email ? `<email>${escapar(CONFIG.email)}</email>` : '');
  const descricao = `<xDescServ>${escapar(p.descricao)}</xDescServ>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><DPS versao="1.01" xmlns="${NS}"><infDPS Id="${id}">`
    + `<tpAmb>${producao ? 1 : 2}</tpAmb><dhEmi>${dhEmi}</dhEmi><verAplic>SolRapidas_1.0</verAplic><serie>${CONFIG.serie}</serie><nDPS>${p.numero}</nDPS>`
    + `<dCompet>${dCompet}</dCompet><tpEmit>1</tpEmit>${producao ? '' : '<finNFSe>0</finNFSe>'}<cLocEmi>${CONFIG.municipioIbge}</cLocEmi>`
    + `<prest><CNPJ>${CONFIG.cnpj}</CNPJ>${contato}<regTrib><opSimpNac>2</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>${toma}`
    + `<serv><locPrest><cLocPrestacao>${CONFIG.municipioIbge}</cLocPrestacao></locPrest>`
    + `<cServ><cTribNac>070501</cTribNac>${producao ? `${descricao}<cNBS>101011200</cNBS>` : `<cNBS>101011200</cNBS>${descricao}`}</cServ>`
    + `<obra><end><CEP>${so(p.obra.cep)}</CEP>${enderecoXml(p.obra)}</end></obra></serv>`
    + `<valores><vServPrest><vServ>${p.valor}</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>`
    + '</infDPS></DPS>';
  return { id, xml };
}

function falarComSefin(pedido) {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], { windowsHide: true });
    const saida = [];
    const relogio = setTimeout(() => ps.kill(), 90000);
    ps.stdout.on('data', (b) => saida.push(b));
    ps.stderr.on('data', () => {});
    ps.on('error', (e) => { clearTimeout(relogio); resolve({ falha: e.message }); });
    ps.on('close', () => {
      clearTimeout(relogio);
      try { resolve(JSON.parse(Buffer.concat(saida).toString('utf8'))); } catch (e) { resolve({ falha: 'sem resposta do assinador' }); }
    });
    ps.stdin.end(JSON.stringify({ cnpj: CONFIG.cnpj, ambiente: AMBIENTE, ...pedido }));
  });
}

const tag = (xml, nome) => (xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`)) || [])[1] || '';

async function emitir(p) {
  const erros = conferirPedido(p);
  if (erros.length) return { http: 400, ok: false, erros: erros.map((d) => ({ descricao: d })) };
  const { id, xml } = montarDps(p);
  const r = await falarComSefin({ metodo: 'POST', caminho: '/nfse', id, xml });
  // Sem resposta a nota pode ter saído: quem chamou consulta /dps/<id> antes de tentar de novo.
  if (r.falha) return { http: 502, ok: false, idDps: id, semResposta: true, erros: [{ descricao: r.falha }] };
  let j = {};
  try { j = JSON.parse(r.corpo); } catch (e) { /* resposta fora do padrão: cai no erro abaixo */ }
  if (r.status === 201 && j.chaveAcesso && j.nfseXmlGZipB64) {
    const nota = zlib.gunzipSync(Buffer.from(j.nfseXmlGZipB64, 'base64')).toString('utf8');
    return {
      http: 201, ok: true, idDps: id, chaveAcesso: j.chaveAcesso, ambiente: j.tipoAmbiente,
      numeroNota: tag(nota, 'nNFSe'), situacao: tag(nota, 'cStat'), nfseXml: nota, alertas: j.alertas || [],
    };
  }
  const lista = j.erros || j.Erros || [];
  return {
    http: 422, ok: false, idDps: id, statusSefin: r.status,
    erros: lista.length ? lista.map((e) => ({ codigo: e.Codigo, descricao: e.Descricao, complemento: e.Complemento })) : [{ descricao: `resposta inesperada (HTTP ${r.status})` }],
  };
}

async function consultarDps(id) {
  if (!/^DPS\d{42}$/.test(id)) return { http: 400, ok: false, erros: [{ descricao: 'identificador inválido' }] };
  const r = await falarComSefin({ metodo: 'GET', caminho: '/dps/' + id });
  if (r.falha) return { http: 502, ok: false, erros: [{ descricao: r.falha }] };
  let j = {};
  try { j = JSON.parse(r.corpo); } catch (e) { /* fica sem chave */ }
  if (r.status !== 200 && r.status !== 404) return { http: 502, ok: false, erros: [{ descricao: `resposta inesperada (HTTP ${r.status})` }] };
  const existe = r.status === 200 && Boolean(j.chaveAcesso);
  const resposta = { http: 200, ok: true, existe, chaveAcesso: j.chaveAcesso || '', statusSefin: r.status };
  if (!existe) return resposta;
  // A nota existe: traz número e XML para quem ficou sem resposta na hora de emitir.
  const n = await falarComSefin({ metodo: 'GET', caminho: '/nfse/' + j.chaveAcesso });
  try {
    const nota = zlib.gunzipSync(Buffer.from(JSON.parse(n.corpo).nfseXmlGZipB64, 'base64')).toString('utf8');
    return { ...resposta, numeroNota: tag(nota, 'nNFSe'), situacao: tag(nota, 'cStat'), nfseXml: nota };
  } catch (e) { return resposta; }
}

function autorizado(req) {
  const recebido = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const esperado = Buffer.from(TOKEN);
  return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
}

function responder(res, obj) {
  const { http: status = 200, ...resto } = obj;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(resto));
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/saude') return responder(res, { ok: true, ambiente: AMBIENTE, serie: Number(CONFIG.serie) });
  if (!autorizado(req)) return responder(res, { http: 401, ok: false, erros: [{ descricao: 'não autorizado' }] });
  const dps = url.pathname.match(/^\/dps\/([A-Za-z0-9]+)$/);
  if (req.method === 'GET' && dps) return consultarDps(dps[1]).then((r) => responder(res, r));
  // Pelo número: quem ficou sem resposta na hora de emitir não chegou a receber o identificador.
  const porNumero = url.pathname.match(/^\/dps-numero\/([1-9]\d{0,14})$/);
  if (req.method === 'GET' && porNumero) return consultarDps(idDaDps(porNumero[1])).then((r) => responder(res, r));
  if (req.method !== 'POST' || url.pathname !== '/emitir') return responder(res, { http: 404, ok: false, erros: [{ descricao: 'rota inexistente' }] });
  const partes = [];
  let tamanho = 0;
  req.on('data', (b) => { tamanho += b.length; if (tamanho <= LIMITE_CORPO) partes.push(b); });
  req.on('end', () => {
    let pedido;
    try {
      if (tamanho > LIMITE_CORPO) throw new Error('grande');
      pedido = JSON.parse(Buffer.concat(partes).toString('utf8'));
    } catch (e) { return responder(res, { http: 400, ok: false, erros: [{ descricao: 'pedido inválido' }] }); }
    return emitir(pedido).then((r) => responder(res, r)).catch((e) => responder(res, { http: 500, ok: false, erros: [{ descricao: e.message }] }));
  });
  return undefined;
});

if (require.main === module) {
  servidor.listen(PORTA, '127.0.0.1', () => console.log(new Date().toISOString(), `NFS-e local ouvindo em http://127.0.0.1:${PORTA} (ambiente: ${AMBIENTE})`));
}
module.exports = { montarDps, conferirPedido };
