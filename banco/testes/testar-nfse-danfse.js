// PDF da NFS-e (DANFSe v2.0) gerado do XML (16/11/2026): banco/nfse-danfse.js.
// Usa só uma nota FICTÍCIA montada aqui (CNPJs de exemplo, cliente inventado): não lê nem grava nada de verdade.
// Confere: os dados tirados do XML e os formatos do DANFSe oficial, o PDF (uma página, com os textos certos),
// nota sem tomador, nota do ambiente de testes (marca "sem valor"), descrição longa e caracteres especiais.
// Uso: node banco/testes/testar-nfse-danfse.js
const { gerarDanfse, dadosDaNota, nomeDoPdf } = require('../nfse-danfse.js');

let ok = 0, falhas = 0;
const confere = (nome, cond, detalhe) => {
  if (cond) { ok++; console.log('ok    ', nome); }
  else { falhas++; console.log('FALHOU', nome, detalhe === undefined ? '' : JSON.stringify(detalhe).slice(0, 400)); }
};

const CHAVE = '42091022211222333000181000000000012326111234567890';
function xmlDeTeste({ tpAmb = '1', tomador = true, descricao = 'Troca de 2 lâmpadas na garagem & conserto do portão.', cStat = '107' } = {}) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${CHAVE}">`
    + '<xLocEmi>Joinville</xLocEmi><xLocPrestacao>Joinville</xLocPrestacao><nNFSe>123</nNFSe><cLocIncid>4209102</cLocIncid><xLocIncid>Joinville</xLocIncid>'
    + '<xTribNac>Reparação, conservação e reforma de edifícios e congêneres</xTribNac><verAplic>SefinNacional_1.6.0</verAplic><ambGer>2</ambGer>'
    + `<tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>${cStat}</cStat><dhProc>2026-11-16T09:15:07-03:00</dhProc><nDFSe>1</nDFSe>`
    + '<emit><CNPJ>11222333000181</CNPJ><xNome>11.222.333 EMPRESA DE TESTE</xNome><enderNac><xLgr>RUA DE TESTE</xLgr><nro>10</nro><xBairro>CENTRO</xBairro>'
    + '<cMun>4209102</cMun><UF>SC</UF><CEP>89200000</CEP></enderNac><fone>4733334444</fone><email>TESTE@EXEMPLO.INVALID</email></emit>'
    + '<valores><vLiq>1290.50</vLiq></valores>'
    + `<DPS versao="1.01"><infDPS Id="DPS420910221122233300018100001000000000000005"><tpAmb>${tpAmb}</tpAmb><dhEmi>2026-11-16T09:14:01-03:00</dhEmi>`
    + '<verAplic>SolRapidas_1.0</verAplic><serie>1</serie><nDPS>5</nDPS><dCompet>2026-11-16</dCompet><tpEmit>1</tpEmit><cLocEmi>4209102</cLocEmi>'
    + '<prest><CNPJ>11222333000181</CNPJ><fone>47999998888</fone><email>teste@exemplo.invalid</email><regTrib><opSimpNac>2</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>'
    + (tomador ? '<toma><CNPJ>44555666000199</CNPJ><xNome>CONDOMINIO FICTICIO DE TESTE</xNome><end><endNac><cMun>4209102</cMun><CEP>89201100</CEP></endNac>'
      + '<xLgr>RUA DO CLIENTE</xLgr><nro>200</nro><xCpl>BLOCO B</xCpl><xBairro>AMERICA</xBairro></end></toma>' : '')
    + `<serv><locPrest><cLocPrestacao>4209102</cLocPrestacao></locPrest><cServ><cTribNac>070501</cTribNac><xDescServ>${esc(descricao)}</xDescServ><cNBS>101011200</cNBS></cServ>`
    + '<obra><end><CEP>89201100</CEP><xLgr>RUA DO CLIENTE</xLgr><nro>200</nro><xBairro>AMERICA</xBairro></end></obra></serv>'
    + '<valores><vServPrest><vServ>1290.50</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>'
    + '</infDPS><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>abc</SignatureValue></Signature></DPS></infNFSe></NFSe>';
}
// Texto que aparece no PDF (gerado sem compactar): o jsPDF escreve cada linha como (texto) Tj.
const textoDoPdf = (buf) => buf.toString('latin1');
const paginas = (buf) => (buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;

// ---------- dados ----------
const d = dadosDaNota(xmlDeTeste());
confere('chave de acesso tirada do Id', d.chave === CHAVE, d.chave);
confere('número, competência, série e DPS', d.numero === '123' && d.competencia === '16/11/2026' && d.serieDps === '1' && d.numeroDps === '5', d);
confere('datas e horas como no portal (sem mudar o fuso)', d.emissaoNfse === '16/11/2026 09:15:07' && d.emissaoDps === '16/11/2026 09:14:01');
confere('situação MEI e emitente prestador', d.situacao === 'NFS-e MEI' && d.emitente === 'Prestador' && d.finalidade === '-');
confere('prestador: CNPJ, telefone da DPS, e-mail em minúsculas', d.prestador.documento === '11.222.333/0001-81' && d.prestador.telefone === '(47) 99999-8888' && d.prestador.email === 'teste@exemplo.invalid', d.prestador);
confere('prestador: município, IBGE e CEP no formato do DANFSe', d.prestador.municipio === 'Joinville / SC' && d.prestador.ibgeCep === '42.09102 / 89.200-000', d.prestador);
confere('prestador: endereço e Simples', d.prestador.endereco === 'RUA DE TESTE, 10, CENTRO' && d.prestador.simples === 'Optante - Microempreendedor Individual (MEI)', d.prestador);
confere('tomador: CNPJ, nome, endereço com complemento', d.tomador.documento === '44.555.666/0001-99' && d.tomador.nome === 'CONDOMINIO FICTICIO DE TESTE' && d.tomador.endereco === 'RUA DO CLIENTE, 200, BLOCO B, AMERICA', d.tomador);
confere('tomador: sem telefone e sem e-mail vira "-"', d.tomador.telefone === '-' && d.tomador.email === '-');
confere('serviço: códigos formatados', d.codTrib === '07.05.01 / -' && d.nbs === '1.0101.12.00' && d.localPrestacao === 'Joinville / SC / -', d);
confere('descrição com acento e "&" volta certa', d.descricao === 'Troca de 2 lâmpadas na garagem & conserto do portão.', d.descricao);
confere('ISSQN: tributável, não retido, incidência em Joinville', d.tribIssqn === 'Operação Tributável' && d.retencao === 'Não Retido' && d.incidencia === 'Joinville / SC / -');
confere('valores em reais com milhar', d.valorServico === 'R$ 1.290,50' && d.valorLiquido === 'R$ 1.290,50', [d.valorServico, d.valorLiquido]);
confere('totais aproximados sem valor (indTotTrib 0)', d.totais === 'Federais: -; Estaduais: -; Municipais: -;');
confere('nome do arquivo', nomeDoPdf(xmlDeTeste()) === 'NFS-e 123 - CONDOMINIO FICTICIO DE TESTE.pdf', nomeDoPdf(xmlDeTeste()));

// ---------- PDF ----------
const pdf = gerarDanfse(xmlDeTeste(), { compactar: false });
const txt = textoDoPdf(pdf);
confere('é um PDF de uma página', pdf.slice(0, 5).toString() === '%PDF-' && paginas(pdf) === 1, paginas(pdf));
for (const t of ['DANFSe v2.0', 'Documento Auxiliar da NFS-e', 'CHAVE DE ACESSO DA NFS-e', CHAVE, 'PRESTADOR / FORNECEDOR', 'TOMADOR / ADQUIRENTE',
  'CONDOMINIO FICTICIO DE TESTE', 'SERVI\xC7O PRESTADO', 'VALOR TOTAL DA NFS-e', 'R$ 1.290,50', 'INFORMA\xC7\xD5ES COMPLEMENTARES', `123 / ${CHAVE}`]) {
  confere(`o PDF mostra "${t.slice(0, 40)}"`, txt.includes(t));
}
confere('o logo da NFS-e vai no cabeçalho', /\/Subtype \/Image/.test(txt));
confere('nota de produção não leva a marca de teste', !txt.includes('SEM VALOR FISCAL'));
const comprimido = gerarDanfse(xmlDeTeste());
confere('o PDF normal sai compactado e pequeno', comprimido.length < pdf.length && comprimido.length < 40000, comprimido.length);

// ---------- casos especiais ----------
const teste = textoDoPdf(gerarDanfse(xmlDeTeste({ tpAmb: '2' }), { compactar: false }));
confere('nota do ambiente de testes leva "SEM VALOR FISCAL" e "Tipo de Ambiente: 2"', teste.includes('AMBIENTE DE TESTES - SEM VALOR FISCAL') && teste.includes('Tipo de Ambiente: 2'));
const semTomador = textoDoPdf(gerarDanfse(xmlDeTeste({ tomador: false }), { compactar: false }));
confere('nota sem tomador diz que não foi identificado', semTomador.includes('TOMADOR / ADQUIRENTE N\xC3O IDENTIFICADO NA NFS-e') && dadosDaNota(xmlDeTeste({ tomador: false })).tomador === null);
const longa = 'Serviço com texto comprido. '.repeat(39).trim(); // ~1100 caracteres, o limite das notas
const pdfLongo = gerarDanfse(xmlDeTeste({ descricao: longa }), { compactar: false });
confere('descrição de 1100 caracteres cabe numa página', longa.length >= 1050 && paginas(pdfLongo) === 1, longa.length);
const especial = dadosDaNota(xmlDeTeste({ descricao: 'Aspas “curvas”, travessão — e emoji 🔧 no texto' }));
const pdfEspecial = textoDoPdf(gerarDanfse(xmlDeTeste({ descricao: especial.descricao }), { compactar: false }));
confere('caracteres fora do alfabeto do PDF viram equivalentes simples', pdfEspecial.includes('Aspas "curvas", travess\xE3o - e emoji ? no texto'));
confere('situação desconhecida aparece pelo código', dadosDaNota(xmlDeTeste({ cStat: '999' })).situacao === '999');
let erro = '';
try { gerarDanfse('<qualquer>coisa</qualquer>'); } catch (e) { erro = e.message; }
confere('XML que não é nota é recusado com motivo claro', /sem a NFS-e/.test(erro), erro);

console.log(`\n${ok} ok, ${falhas} falha(s).`);
process.exitCode = falhas ? 1 : 0;
