// PDF da NFS-e (DANFSe v2.0) gerado aqui, a partir do XML da nota (16/11/2026).
//
// Por quê: a API oficial do DANFSe foi desativada pelo governo em 03/08/2026 (adn.nfse.gov.br/danfse responde 503)
// e quem emite por sistema passou a gerar o PDF (NT 008). O layout abaixo copia, medida por medida, o DANFSe v2.0 que
// o portal entrega no "Download DANFS-e" (conferido com o PDF oficial da nota 441, de 04/11/2026): mesmas caixas,
// mesmos rótulos, mesmo QR Code (consulta pública com a chave de acesso). Todos os dados vêm do XML que o governo
// devolveu ao emitir, nada é digitado de novo.
//
// Uso: const { gerarDanfse } = require('./nfse-danfse.js'); const pdf = gerarDanfse(xml); → Buffer do PDF
//      opcoes.municipios = { '<código IBGE>': 'Nome' } para tomador de outra cidade (o XML só traz o código).
const fs = require('fs');
const path = require('path');

const MODULOS = 'C:/Users/rediv/banco-solucoes/modulos/node_modules';
// Logo oficial da NFS-e (tirado do DANFSe do portal), já sobre o cinza do cabeçalho: sem transparência.
const LOGO = path.join(__dirname, '..', 'imagens', 'nfse-logo.png');
let jsPDF = null, QRCode = null;
// Carregados só na primeira nota (se faltar a biblioteca, só o PDF falha; o resto do serviço segue).
function bibliotecas() {
  if (!jsPDF) jsPDF = require(path.join(__dirname, '..', 'vendor', 'jspdf.umd.min.js')).jsPDF;
  if (!QRCode) QRCode = require(MODULOS + '/qrcode');
}

// ---------- leitura do XML (uma árvore simples: a nota do governo é XML bem formado, sem CDATA) ----------

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTIDADES[e.toLowerCase()];
});

function lerXml(xml) {
  const raiz = { nome: '#', filhos: [], texto: '', attrs: {} };
  const pilha = [raiz];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([A-Za-z0-9_:.-]+)\s*>|<([A-Za-z0-9_:.-]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const topo = pilha[pilha.length - 1];
    if (m[1]) { if (pilha.length > 1) pilha.pop(); continue; }
    if (m[2]) {
      const attrs = {};
      for (const a of (m[3] || '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = desescapar(a[2] !== undefined ? a[2] : a[3]);
      const no = { nome: m[2].replace(/^.*:/, ''), filhos: [], texto: '', attrs };
      topo.filhos.push(no);
      if (!m[4]) pilha.push(no);
      continue;
    }
    if (m[5] && topo !== raiz) topo.texto += desescapar(m[5]);
  }
  return raiz;
}

// Primeiro nó que casa com o caminho ("infNFSe/emit/CNPJ"), procurando a partir de qualquer profundidade.
function achar(no, caminho) {
  const partes = caminho.split('/');
  const desce = (atual, i) => {
    if (i === partes.length) return atual;
    for (const f of atual.filhos) if (f.nome === partes[i]) { const r = desce(f, i + 1); if (r) return r; }
    return null;
  };
  const busca = (atual) => {
    if (atual.nome === partes[0]) { const r = desce(atual, 1); if (r) return r; }
    for (const f of atual.filhos) { const r = busca(f); if (r) return r; }
    return null;
  };
  return busca(no);
}
const valor = (no, caminho) => { const n = no && achar(no, caminho); return n ? n.texto.trim() : ''; };

// ---------- formatos (iguais aos do DANFSe do portal) ----------

const so = (v) => String(v || '').replace(/\D/g, '');
const ou = (v) => (v === undefined || v === null || String(v).trim() === '' ? '-' : String(v));
function documento(v) {
  const d = so(v);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return ou(v);
}
function telefone(v) {
  const d = so(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return ou(v);
}
const cep = (v) => { const d = so(v); return d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : ou(v); };
const ibge = (v) => { const d = so(v); return d.length === 7 ? `${d.slice(0, 2)}.${d.slice(2)}` : ou(v); };
const data = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ou(v); };
// A hora sai como veio no XML (já é a de Brasília, com o "-03:00"): nada de converter fuso.
const dataHora = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/.exec(v || ''); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : ou(v); };
function reais(v) {
  if (v === '' || v === undefined || v === null || isNaN(Number(v))) return '-';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const porcento = (v) => (v === '' || isNaN(Number(v)) ? '-' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%');
const codTrib = (v) => { const d = so(v); return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : ou(v); };
const nbs = (v) => { const d = so(v); return d.length === 9 ? `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}` : ou(v); };

const UF_PELO_IBGE = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE',
  27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF',
};
const ufDoIbge = (codigo) => UF_PELO_IBGE[String(codigo || '').slice(0, 2)] || '';

const EMITENTE = { 1: 'Prestador', 2: 'Tomador', 3: 'Intermediário' };
const SITUACAO = { 100: 'NFS-e Gerada', 101: 'NFS-e de Substituição Gerada', 102: 'NFS-e de Decisão Judicial', 103: 'NFS-e Avulsa', 107: 'NFS-e MEI' };
const SIMPLES = { 1: 'Não Optante', 2: 'Optante - Microempreendedor Individual (MEI)', 3: 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)' };
const TRIB_ISSQN = { 1: 'Operação Tributável', 2: 'Imunidade', 3: 'Exportação de Serviço', 4: 'Não Incidência' };
const RETENCAO = { 1: 'Não Retido', 2: 'Retido pelo Tomador', 3: 'Retido pelo Intermediário' };

// As fontes padrão do PDF só têm o alfabeto latino básico: o resto vira um equivalente simples (ou "?").
function texto(v) {
  return String(v || '').replace(/\r/g, '').replace(/[\u2013\u2014]/g, '-').replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2022/g, '-').replace(/\u2026/g, '...').replace(/\u20AC/g, 'EUR').replace(/[\t\u00A0]/g, ' ')
    .replace(/[^\n\u0020-\u007E\u00A1-\u00FF]/gu, '?'); // "u": um emoji (dois pedaços por dentro) vira um "?" só
}

// ---------- os dados do DANFSe, tirados do XML ----------

function dadosDaNota(xml, opcoes = {}) {
  const raiz = lerXml(String(xml || ''));
  const inf = achar(raiz, 'NFSe/infNFSe');
  if (!inf) throw new Error('XML sem a NFS-e (infNFSe)');
  const dps = achar(inf, 'DPS/infDPS');
  if (!dps) throw new Error('XML sem a DPS');
  const v = (c) => valor(inf, c);
  const d = (c) => valor(dps, c);

  // Nomes de município: o XML traz só alguns (emissão, prestação, incidência); os outros vêm do chamador.
  const nomes = { ...(opcoes.municipios || {}) };
  if (d('cLocEmi') && v('xLocEmi')) nomes[d('cLocEmi')] = v('xLocEmi');
  if (d('serv/locPrest/cLocPrestacao') && v('xLocPrestacao')) nomes[d('serv/locPrest/cLocPrestacao')] = v('xLocPrestacao');
  if (v('cLocIncid') && v('xLocIncid')) nomes[v('cLocIncid')] = v('xLocIncid');
  const municipio = (codigo) => (codigo ? `${nomes[codigo] || '-'} / ${ufDoIbge(codigo) || '-'}` : '-');

  const chave = (inf.attrs.Id || '').replace(/^NFS/, '');
  const endereco = (no) => {
    if (!no) return '-';
    const partes = [valor(no, 'xLgr'), valor(no, 'nro'), valor(no, 'xCpl'), valor(no, 'xBairro')].filter(Boolean);
    return partes.length ? partes.join(', ') : '-';
  };

  const emit = achar(inf, 'emit');
  const emitEnd = emit && achar(emit, 'enderNac');
  const prestCMun = (emitEnd && valor(emitEnd, 'cMun')) || d('cLocEmi');
  const prestador = {
    documento: documento(d('prest/CNPJ') || d('prest/CPF') || valor(emit, 'CNPJ') || valor(emit, 'CPF')),
    im: ou(d('prest/IM') || valor(emit, 'IM')),
    telefone: telefone(d('prest/fone') || valor(emit, 'fone')),
    nome: ou(valor(emit, 'xNome') || d('prest/xNome')),
    municipio: municipio(prestCMun),
    ibgeCep: `${ibge(prestCMun)} / ${cep(emitEnd ? valor(emitEnd, 'CEP') : '')}`,
    endereco: endereco(emitEnd),
    email: ou((d('prest/email') || valor(emit, 'email')).toLowerCase()),
    simples: ou(SIMPLES[d('prest/regTrib/opSimpNac')]),
    regimeSN: ou(d('prest/regTrib/regApTribSN')),
  };

  const toma = achar(dps, 'toma');
  let tomador = null;
  if (toma) {
    const endNac = achar(toma, 'end/endNac');
    const cMun = endNac ? valor(endNac, 'cMun') : '';
    tomador = {
      documento: documento(valor(toma, 'CNPJ') || valor(toma, 'CPF') || valor(toma, 'NIF')),
      im: ou(valor(toma, 'IM')),
      telefone: telefone(valor(toma, 'fone')),
      nome: ou(valor(toma, 'xNome')),
      municipio: endNac ? municipio(cMun) : '-',
      ibgeCep: endNac ? `${ibge(cMun)} / ${cep(valor(endNac, 'CEP'))}` : '-',
      endereco: endereco(achar(toma, 'end')),
      email: ou(valor(toma, 'email').toLowerCase()),
    };
  }

  const cLocPrest = d('serv/locPrest/cLocPrestacao');
  const vServ = d('valores/vServPrest/vServ');
  const totTrib = achar(dps, 'valores/trib/totTrib');
  let totais = 'Federais: -; Estaduais: -; Municipais: -;';
  if (totTrib && achar(totTrib, 'vTotTrib')) {
    totais = `Federais: ${reais(valor(totTrib, 'vTotTribFed'))}; Estaduais: ${reais(valor(totTrib, 'vTotTribEst'))}; Municipais: ${reais(valor(totTrib, 'vTotTribMun'))};`;
  } else if (totTrib && achar(totTrib, 'pTotTrib')) {
    totais = `Federais: ${porcento(valor(totTrib, 'pTotTribFed'))}; Estaduais: ${porcento(valor(totTrib, 'pTotTribEst'))}; Municipais: ${porcento(valor(totTrib, 'pTotTribMun'))};`;
  }
  const complemento = d('serv/infoCompl/xInfComp');

  return {
    chave,
    tpAmb: d('tpAmb') || '1',
    ambGer: v('ambGer') || '-',
    cabecalhoMunicipio: `${v('xLocEmi') || '-'} - ${ufDoIbge(d('cLocEmi')) || (emitEnd ? valor(emitEnd, 'UF') : '') || '-'}`,
    numero: ou(v('nNFSe')),
    competencia: data(d('dCompet')),
    emissaoNfse: dataHora(v('dhProc')),
    numeroDps: ou(d('nDPS')),
    serieDps: ou(String(Number(d('serie')) || d('serie') || '')),
    emissaoDps: dataHora(d('dhEmi')),
    emitente: ou(EMITENTE[d('tpEmit')]),
    situacao: ou(SITUACAO[v('cStat')] || v('cStat')),
    finalidade: d('finNFSe') === '' ? '-' : (d('finNFSe') === '0' ? 'NFS-e regular' : d('finNFSe')),
    prestador,
    tomador,
    codTrib: `${codTrib(d('serv/cServ/cTribNac'))} / ${ou(d('serv/cServ/cTribMun'))}`,
    nbs: nbs(d('serv/cServ/cNBS')),
    localPrestacao: `${municipio(cLocPrest)} / -`,
    xTribNac: ou(v('xTribNac')),
    descricao: d('serv/cServ/xDescServ'),
    tribIssqn: ou(TRIB_ISSQN[d('valores/trib/tribMun/tribISSQN')]),
    incidencia: `${municipio(v('cLocIncid') || cLocPrest)} / -`,
    bcIssqn: v('valores/vBC') ? reais(v('valores/vBC')) : '-',
    aliquota: v('valores/pAliqAplic') ? porcento(v('valores/pAliqAplic')) : '-',
    retencao: ou(RETENCAO[d('valores/trib/tribMun/tpRetISSQN')]),
    issqn: v('valores/vISSQN') ? reais(v('valores/vISSQN')) : '-',
    irrf: d('valores/trib/tribFed/vRetIRRF') ? reais(d('valores/trib/tribFed/vRetIRRF')) : '-',
    cp: d('valores/trib/tribFed/vRetCP') ? reais(d('valores/trib/tribFed/vRetCP')) : '-',
    csll: d('valores/trib/tribFed/vRetCSLL') ? reais(d('valores/trib/tribFed/vRetCSLL')) : '-',
    pis: d('valores/trib/tribFed/piscofins/vPis') ? reais(d('valores/trib/tribFed/piscofins/vPis')) : '-',
    cofins: d('valores/trib/tribFed/piscofins/vCofins') ? reais(d('valores/trib/tribFed/piscofins/vCofins')) : '-',
    valorServico: reais(vServ),
    descIncond: d('valores/vDescCondIncond/vDescIncond') ? reais(d('valores/vDescCondIncond/vDescIncond')) : '-',
    descCond: d('valores/vDescCondIncond/vDescCond') ? reais(d('valores/vDescCondIncond/vDescCond')) : '-',
    totalRetencoes: v('valores/vTotalRet') ? reais(v('valores/vTotalRet')) : '-',
    valorLiquido: reais(v('valores/vLiq') || vServ),
    totais,
    complemento,
  };
}

// ---------- desenho (pontos de PDF; A4 = 595 x 842; medidas tiradas do DANFSe oficial) ----------

const COL = [11.9, 156.5, 301.0, 445.6]; // onde começa o texto de cada coluna
const ESQ = 8.5, DIR = 586.8, CENTRO = 297.6;
const LARG_COL = 133; // largura útil de uma coluna de texto (o oficial corta "Microempreendedor Individua..." aqui)
const CINZA = 242; // 0,949 do oficial

function gerarDanfse(xml, opcoes = {}) {
  bibliotecas();
  const n = dadosDaNota(xml, opcoes);
  // compactar: false deixa o texto legível dentro do arquivo (só os testes usam, para conferir o conteúdo).
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: opcoes.compactar !== false });
  doc.setProperties({ title: `NFS-e ${n.numero} - DANFSe`, subject: 'Documento Auxiliar da NFS-e', creator: 'Sistema Soluções Rápidas' });
  doc.setLineWidth(0.5);
  doc.setDrawColor(0);
  doc.setTextColor(0);

  const escrever = (t, x, y, tam, negrito, largura) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(tam);
    let s = texto(t);
    if (largura && doc.getTextWidth(s) > largura) {
      while (s.length > 1 && doc.getTextWidth(s + '...') > largura) s = s.slice(0, -1);
      s = s.trimEnd() + '...';
    }
    doc.text(s, x, y);
  };
  const centro = (t, y, tam, negrito) => { doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(tam); doc.text(texto(t), CENTRO, y, { align: 'center' }); };
  const linha = (y) => doc.line(ESQ, y, DIR, y);
  const cinza = (x0, y0, x1, y1) => { doc.setFillColor(CINZA, CINZA, CINZA); doc.rect(x0, y0, x1 - x0, y1 - y0, 'F'); };
  // Um campo: rótulo pequeno em negrito e o valor embaixo (rótulo largo pode ocupar mais de uma coluna).
  const campo = (col, y, rotulo, val, largRotulo) => {
    escrever(rotulo, COL[col], y, 6, true, largRotulo || LARG_COL);
    escrever(val, COL[col], y + 7.7, 7, false, largRotulo || LARG_COL);
  };
  // Seção com faixa cinza no título (primeira coluna) e linha em cima.
  const secao = (y, titulo) => { cinza(ESQ, y + 0.2, 153.1, y + 19.3); linha(y); escrever(titulo, COL[0], y + 6.8, 7, true, LARG_COL); };

  // Cabeçalho
  cinza(ESQ, 5.7, DIR, 39.7);
  try { doc.addImage(fs.readFileSync(LOGO).toString('base64'), 'PNG', 11.9, 10.3, 115.7, 22.9); } catch (e) { escrever('NFS-e', 11.9, 26, 14, true); }
  centro('DANFSe v2.0', 20.8, 9, true);
  centro('Documento Auxiliar da NFS-e', 31.1, 9, true);
  escrever(`Município: ${n.cabecalhoMunicipio}`, 445.6, 18.7, 8, false, 140);
  escrever(`Ambiente Gerador: ${n.ambGer}`, 445.6, 25.9, 6, false);
  escrever(`Tipo de Ambiente: ${n.tpAmb}`, 445.6, 32.7, 6, false);
  linha(39.9);

  // Identificação da nota
  escrever('CHAVE DE ACESSO DA NFS-e', COL[0], 51.0, 7, true);
  escrever(n.chave, COL[0], 58.9, 7, false);
  const par = (col, y, rotulo, val) => { escrever(rotulo, COL[col], y, 7, true, LARG_COL); escrever(val, COL[col], y + 7.9, 7, false, LARG_COL); };
  par(0, 71.2, 'NÚMERO DA NFS-e', n.numero);
  par(1, 71.2, 'COMPETÊNCIA DA NFS-e', n.competencia);
  par(2, 71.2, 'DATA E HORA DA EMISSÃO DA NFS-e', n.emissaoNfse);
  par(0, 91.5, 'NÚMERO DA DPS', n.numeroDps);
  par(1, 91.5, 'SÉRIE DA DPS', n.serieDps);
  par(2, 91.5, 'DATA E HORA DA EMISSÃO DA DPS', n.emissaoDps);
  cinza(ESQ, 105.1, 153.1, 125.3);
  par(0, 111.7, 'EMITENTE DA NFS-e', n.emitente);
  par(1, 111.7, 'SITUAÇÃO DA NFS-e', n.situacao);
  par(2, 111.7, 'FINALIDADE', n.finalidade);

  // QR Code: consulta pública da nota no portal nacional, pela chave de acesso
  const qr = QRCode.create(`https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=${n.chave}`, { errorCorrectionLevel: 'M' });
  const tam = qr.modules.size, lado = 45, passo = lado / tam;
  doc.setFillColor(0, 0, 0);
  for (let l = 0; l < tam; l++) for (let c = 0; c < tam; c++) if (qr.modules.get(l, c)) doc.rect(492.0 + c * passo, 44.8 + l * passo, passo + 0.02, passo + 0.02, 'F');
  escrever('A autenticidade desta NFS-e pode ser verificada', 445.6, 97.4, 6, false);
  escrever('pela leitura deste código QR ou pela consulta da', 445.6, 104.2, 6, false);
  escrever('chave de acesso no portal nacional da NFS-e', 445.6, 111.0, 6, false);

  // Prestador
  let y = 125.6;
  const p = n.prestador;
  secao(y, 'PRESTADOR / FORNECEDOR');
  campo(1, y + 5.9, 'CNPJ / CPF / NIF', p.documento);
  campo(2, y + 5.9, 'Indicador Municipal (Inscrição)', p.im);
  campo(3, y + 5.9, 'Telefone', p.telefone);
  campo(0, y + 24.9, 'Nome / Nome Empresarial', p.nome, 285);
  campo(2, y + 24.9, 'Município / Sigla UF', p.municipio);
  campo(3, y + 24.9, 'Código IBGE / CEP', p.ibgeCep);
  campo(0, y + 44.0, 'Endereço', p.endereco, 285);
  campo(2, y + 44.0, 'E-mail', p.email, 285);
  campo(0, y + 63.1, 'Simples Nacional na Data de Competência', p.simples);
  campo(1, y + 63.1, 'Regime de Apuração Tributária pelo SN', p.regimeSN);
  y += 76.8;

  // Tomador
  if (n.tomador) {
    const t = n.tomador;
    secao(y, 'TOMADOR / ADQUIRENTE');
    campo(1, y + 5.9, 'CNPJ / CPF / NIF', t.documento);
    campo(2, y + 5.9, 'Indicador Municipal (Inscrição)', t.im);
    campo(3, y + 5.9, 'Telefone', t.telefone);
    campo(0, y + 24.9, 'Nome / Nome Empresarial', t.nome, 285);
    campo(2, y + 24.9, 'Município / Sigla UF', t.municipio);
    campo(3, y + 24.9, 'Código IBGE / CEP', t.ibgeCep);
    campo(0, y + 44.0, 'Endereço', t.endereco, 285);
    campo(2, y + 44.0, 'E-mail', t.email, 285);
    y += 57.7;
  } else {
    linha(y);
    centro('TOMADOR / ADQUIRENTE NÃO IDENTIFICADO NA NFS-e', y + 6.7, 7, false);
    y += 8.4;
  }
  linha(y);
  centro('DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e', y + 6.7, 7, false);
  y += 8.4;
  linha(y);
  centro('INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e', y + 6.7, 7, false);
  y += 8.4;

  // Serviço prestado
  secao(y, 'SERVIÇO PRESTADO');
  campo(1, y + 5.9, 'Código de Tributação Nacional/Municipal', n.codTrib);
  campo(2, y + 5.9, 'Código da NBS', n.nbs);
  campo(3, y + 5.9, 'Local da Prestação / Sigla UF / País', n.localPrestacao);
  escrever(n.xTribNac, COL[0], y + 25.8, 7, false, 545);
  escrever('Descrição do Serviço', COL[0], y + 37.2, 6, true);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const linhas = doc.splitTextToSize(texto(n.descricao || '-'), 575);
  let yt = y + 44.9;
  linhas.forEach((l, i) => { doc.text(l, COL[0], yt + i * 7.9); });
  y = yt + (linhas.length - 1) * 7.9 + 6.0;

  // Tributação municipal
  secao(y, 'TRIBUTAÇÃO MUNICIPAL (ISSQN)');
  campo(1, y + 5.9, 'Tipo de Tributação do ISSQN', n.tribIssqn);
  campo(2, y + 5.9, 'Município / Sigla UF / País de Incidência do ISSQN', n.incidencia, 285);
  campo(0, y + 24.9, 'BC ISSQN', n.bcIssqn);
  campo(1, y + 24.9, 'Alíquota Aplicada', n.aliquota);
  campo(2, y + 24.9, 'Retenção do ISSQN', n.retencao);
  campo(3, y + 24.9, 'ISSQN Apurado', n.issqn);
  y += 38.6;

  // Tributação federal
  secao(y, 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)');
  campo(1, y + 5.9, 'IRRF', n.irrf);
  campo(2, y + 5.9, 'Contribuição Previdenciária - Retida', n.cp);
  campo(3, y + 5.9, 'Contribuições Sociais - Retidas', n.csll);
  campo(0, y + 25.0, 'PIS - Débito Apuração Própria', n.pis);
  campo(1, y + 25.0, 'COFINS - Débito Apuração Própria', n.cofins);
  campo(2, y + 25.0, 'Descrição Contrib. Sociais - Retidas', '-');
  y += 38.7;

  // IBS/CBS: o MEI não destaca até 2027; o DANFSe do portal mostra os campos assim, vazios.
  secao(y, 'TRIBUTAÇÃO IBS/CBS');
  campo(1, y + 5.9, 'CST / cClassTrib', '- / -');
  campo(2, y + 5.9, 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', '- / - / - / -', 285);
  campo(0, y + 24.9, 'Exclusões e Reduções da Base de Cálculo', 'R$ 0,00');
  campo(1, y + 24.9, 'Base de Cálculo Após Exclusões e Reduções', '-');
  campo(2, y + 24.9, 'Red. Alíquota IBS / Red. Alíquota CBS', '- / - / -');
  campo(3, y + 24.9, 'Alíquota - IBS UF / IBS Mun', '- / -');
  campo(0, y + 44.0, 'Alíq. Efetiva Municipal - IBS', '-');
  campo(1, y + 44.0, 'Valor Apurado Municipal - IBS', '-');
  campo(2, y + 44.0, 'Alíq. Efetiva Estadual - IBS', '-');
  campo(3, y + 44.0, 'Valor Apurado Estadual - IBS', '-');
  campo(0, y + 63.1, 'Valor Total Apurado - IBS', '-');
  campo(1, y + 63.1, 'Alíquota - CBS', '-');
  campo(2, y + 63.1, 'Alíquota Efetiva - CBS', '-');
  campo(3, y + 63.1, 'Valor Total Apurado - CBS', '-');
  y += 76.8;

  // Valor total
  secao(y, 'VALOR TOTAL DA NFS-e');
  campo(1, y + 5.9, 'VALOR DA OPERAÇÃO / SERVIÇO', n.valorServico);
  campo(2, y + 5.9, 'Desconto Incondicionado', n.descIncond);
  campo(3, y + 5.9, 'Desconto Condicionado', n.descCond);
  cinza(442.2, y + 19.3, DIR, y + 38.4);
  campo(0, y + 24.9, 'Total das Retenções (ISSQN / Federais)', n.totalRetencoes);
  campo(1, y + 24.9, 'VALOR LÍQUIDO DA NFS-e', n.valorLiquido);
  campo(2, y + 24.9, 'Total do IBS/CBS', 'R$ 0,00');
  campo(3, y + 24.9, 'VALOR LÍQUIDO DA NFS-e + IBS/CBS', 'R$ 0,00');
  y += 38.6;
  linha(y);

  // Informações complementares
  escrever('INFORMAÇÕES COMPLEMENTARES', COL[0], y + 6.9, 7, true);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const info = [n.complemento, `Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: ${n.totais}`].filter(Boolean).join('\n');
  doc.splitTextToSize(texto(info), 575).forEach((l, i) => doc.text(l, COL[0], y + 27.0 + i * 7.9));

  // Canhoto
  doc.line(9.0, 795.8, 9.0, 815.9);
  doc.line(153.6, 795.8, 153.6, 815.9);
  doc.line(298.1, 795.8, 298.1, 815.9);
  doc.line(587.3, 795.8, 587.3, 815.9);
  doc.line(8.5, 795.8, 587.8, 795.8);
  doc.line(8.5, 815.9, 587.8, 815.9);
  escrever('DATA CIENTIFICAÇÃO:', 12.9, 801.9, 6, true);
  escrever('IDENTIFICAÇÃO E ASSINATURA', 157.5, 801.9, 6, true);
  escrever('N° NFS-e / CHAVE NFS-e', 302.0, 801.9, 6, true);
  escrever(`${n.numero} / ${n.chave}`, 302.0, 809.7, 7, false, 283);

  // Nota do ambiente de testes do governo: deixa claro, na própria página, que não vale.
  if (n.tpAmb === '2') {
    doc.setTextColor(200, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.text('AMBIENTE DE TESTES - SEM VALOR FISCAL', CENTRO, 680, { align: 'center', angle: 18 });
    doc.setTextColor(0);
  }

  // Moldura da página
  doc.setLineWidth(1);
  doc.rect(5, 5, 585, 832, 'S');
  return Buffer.from(doc.output('arraybuffer'));
}

// Nome do arquivo: "NFS-e 123 - CONDOMINIO EXEMPLO.pdf" (sem caracteres que o Windows recusa).
function nomeDoPdf(xml) {
  try {
    const n = dadosDaNota(xml);
    const quem = n.tomador && n.tomador.nome !== '-' ? ' - ' + n.tomador.nome : '';
    return `NFS-e ${n.numero}${quem}.pdf`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 150);
  } catch (e) { return 'NFS-e.pdf'; }
}

module.exports = { gerarDanfse, dadosDaNota, nomeDoPdf };
