// NFS-e local: emite notas só no ambiente de testes do governo (sem validade), com cliente e endereço
// fictícios. Liga o serviço numa porta própria durante o teste e desliga no fim.
// Uso: node banco/testes/testar-nfse-local.js
// O teste nunca pode emitir nota de verdade: força o ambiente de testes mesmo com o config em produção.
process.env.NFSE_AMBIENTE = 'restrita';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const PORTA = 5699;
const BASE = `http://127.0.0.1:${PORTA}`;
const TOKEN = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8').match(/^token do airtable local:\s*(\S+)/m)[1];
let ok = 0;
let falhas = 0;
const confere = (nome, cond, extra) => {
  if (cond) { ok++; console.log('ok   ', nome); } else { falhas++; console.log('FALHA', nome, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); }
};
const pedir = async (caminho, corpo, token = TOKEN) => {
  const r = await fetch(BASE + caminho, {
    method: corpo ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, ...(await r.json()) };
};

const END = { cep: '89201000', logradouro: 'Rua de Teste', numero: '1', bairro: 'Centro' };
const TOMADOR = { cnpj: '11222333000181', nome: 'CLIENTE FICTICIO DE TESTE', endereco: { ...END, municipioIbge: '4209102' } };
const NUMERO = 500000 + Math.floor(Math.random() * 400000);
const pedido = (extra) => ({
  numero: NUMERO, descricao: 'TESTE SEM VALIDADE JURIDICA. Valor total = R$ 1,00. Texto com & e acentuação.',
  valor: '1.00', tomador: TOMADOR, obra: END, ...extra,
});

(async () => {
  const serv = spawn('node', [path.join(__dirname, '..', 'nfse-local.js')], { env: { ...process.env, NFSE_PORTA: String(PORTA), NFSE_AMBIENTE: 'restrita' }, windowsHide: true });
  try {
    for (let i = 0; i < 30; i++) {
      try { if ((await fetch(BASE + '/saude')).ok) break; } catch (e) { /* ainda ligando */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    const montarDpsPronto = (p) => require('../nfse-local.js').montarDps(p, 'restrita');
    const saude = await pedir('/saude');
    confere('saude: só ambiente de testes', saude.ok && saude.ambiente === 'restrita', saude);
    if (saude.ambiente !== 'restrita') throw new Error('PARADO: o serviço de teste não está no ambiente de testes do governo');
    confere('saude: informa a série', saude.serie === 1, saude);
    confere('saude: informa os dois emissores', saude.emissores && saude.emissores['CNPJ 1'] && saude.emissores['CNPJ 2'] && saude.emissores['CNPJ 2'].serie === 1, saude);
    confere('sem o token é recusado', (await pedir('/emitir', pedido(), 'errado')).status === 401);

    // ---- conferência antes de ir ao governo ----
    const recusa = async (nome, extra) => confere(`recusa local: ${nome}`, (await pedir('/emitir', pedido(extra))).status === 400);
    await recusa('CNPJ do tomador inválido', { tomador: { ...TOMADOR, cnpj: '11222333000182' } });
    await recusa('sem endereço da obra', { obra: null });
    await recusa('obra sem CEP', { obra: { ...END, cep: '123' } });
    await recusa('valor zero', { valor: '0.00' });
    await recusa('valor com vírgula', { valor: '1,00' });
    await recusa('descrição vazia', { descricao: '  ' });
    await recusa('descrição acima de 1100', { descricao: 'x'.repeat(1101) });
    await recusa('número da DPS inválido', { numero: 'abc' });
    await recusa('CPF do tomador inválido', { tomador: { nome: 'X', cpf: '52998224726', endereco: TOMADOR.endereco } });
    await recusa('CPF com todos os dígitos iguais', { tomador: { nome: 'X', cpf: '11111111111', endereco: TOMADOR.endereco } });

    // ---- nota de teste com tomador ----
    const n = await pedir('/emitir', pedido());
    confere('emitiu no ambiente de testes', n.status === 201 && n.ok && n.chaveAcesso, n);
    confere('ambiente devolvido = 2 (testes)', n.ambiente === 2, n.ambiente);
    confere('situação 107 (NFS-e MEI)', n.situacao === '107', n.situacao);
    const xml = n.nfseXml || '';
    confere('nota tem tpAmb 2', xml.includes('<tpAmb>2</tpAmb>'));
    confere('nota tem o tomador', xml.includes('<xNome>CLIENTE FICTICIO DE TESTE</xNome>'));
    confere('nota tem a obra', xml.includes('<obra>') && xml.includes('Rua de Teste'));
    confere('nota tem o valor', xml.includes('<vServ>1.00</vServ>'));
    confere('caractere especial na descrição', xml.includes('&amp; e acentuação'));

    // ---- segundo emissor (CNPJ 2, fase 4, 13/11/2026): certificado e numeração próprios ----
    const cnpj2 = JSON.parse(fs.readFileSync('C:/Users/rediv/nfse-config.json', 'utf8').replace(/^﻿/, '')).emissores['CNPJ 2'].cnpj;
    const cnpj1 = JSON.parse(fs.readFileSync('C:/Users/rediv/nfse-config.json', 'utf8').replace(/^﻿/, '')).emissores['CNPJ 1'].cnpj;
    await recusa('emissor desconhecido', { emissor: 'CNPJ 3' });
    const e2 = await pedir('/emitir', pedido({ emissor: 'CNPJ 2', numero: NUMERO + 2 }));
    confere('CNPJ 2 emitiu no ambiente de testes', e2.status === 201 && e2.ok && e2.chaveAcesso, e2);
    confere('CNPJ 2: o prestador da nota é o CNPJ 2', String(e2.nfseXml).includes(`<CNPJ>${cnpj2}</CNPJ>`) && !String(e2.nfseXml).includes(`<emit><CNPJ>${cnpj1}`), String(e2.nfseXml).slice(0, 300));
    confere('CNPJ 2: o identificador leva o CNPJ 2', String(e2.idDps).includes(cnpj2) && !String(e2.idDps).includes(cnpj1), e2.idDps);
    const c2 = await pedir('/dps/' + e2.idDps + '?emissor=CNPJ%202');
    confere('CNPJ 2: consulta acha a nota pelo emissor', c2.existe && c2.chaveAcesso === e2.chaveAcesso, c2);
    const c2n = await pedir('/dps-numero/' + (NUMERO + 2) + '?emissor=CNPJ%202');
    confere('CNPJ 2: consulta pelo número acha a nota', c2n.existe && c2n.chaveAcesso === e2.chaveAcesso, c2n);
    const c1n = await pedir('/dps-numero/' + (NUMERO + 2));
    confere('o mesmo número no CNPJ 1 não existe (numeração separada)', c1n.ok && !c1n.existe, c1n);
    const d1 = montarDpsPronto(pedido());
    const d2 = montarDpsPronto(pedido({ emissor: 'CNPJ 2' }));
    confere('XML do CNPJ 1 e do CNPJ 2 só diferem no prestador e no identificador', d1.xml.replace(new RegExp(cnpj1, 'g'), 'X') === d2.xml.replace(new RegExp(cnpj2, 'g'), 'X'), { a: d1.id, b: d2.id });

    // ---- tomador com CPF ----
    const nCpf = await pedir('/emitir', pedido({ numero: NUMERO + 1, tomador: { cpf: '52998224725', nome: 'PESSOA FICTICIA DE TESTE', endereco: TOMADOR.endereco } }));
    // O governo confere o CPF na Receita: CPF fictício só chega até esta recusa, que prova que o XML foi entendido.
    confere('CPF: o governo entende o campo e consulta a Receita (E0207)', nCpf.status === 422 && nCpf.erros.some((e) => e.codigo === 'E0207'), nCpf);

    // ---- não duplica, e dá para saber se a nota saiu ----
    const rep = await pedir('/emitir', pedido());
    confere('mesmo número é recusado (E0014)', rep.status === 422 && rep.erros.some((e) => e.codigo === 'E0014'), rep);
    const c = await pedir('/dps/' + n.idDps);
    confere('consulta acha a nota pelo número', c.existe && c.chaveAcesso === n.chaveAcesso, c);
    confere('consulta traz número e XML da nota', c.numeroNota === n.numeroNota && c.situacao === '107' && String(c.nfseXml).includes(n.chaveAcesso), { numero: c.numeroNota, situacao: c.situacao });
    const nada = await pedir('/dps/' + n.idDps.slice(0, -6) + '999999');
    confere('consulta de número não usado: não existe', nada.ok && !nada.existe, nada);
    confere('consulta com id inválido é recusada', (await pedir('/dps/abc')).status === 400);

    // ---- produção: nada é enviado; só o XML montado e as travas do assinador ----
    const { montarDps } = require('../nfse-local.js');
    const REAL = 'C:/Users/rediv/nfse-notas-api/dps-1.enviada'; // a nota real aceita em 04/11/2026
    if (fs.existsSync(REAL)) {
      const x = fs.readFileSync(REAL, 'utf8');
      const t = (nome) => (x.match(new RegExp(`<${nome}>([^<]*)</${nome}>`)) || [])[1];
      const end = { cep: t('CEP'), logradouro: t('xLgr'), numero: t('nro'), bairro: t('xBairro') };
      const montado = montarDps({ numero: t('nDPS'), descricao: t('xDescServ'), valor: t('vServ'),
        tomador: { cnpj: x.match(/<toma><CNPJ>(\d+)/)[1], nome: x.match(/<toma><CNPJ>\d+<\/CNPJ><xNome>([^<]*)/)[1], endereco: { ...end, municipioIbge: t('cMun') } }, obra: end }, 'producao');
      const semData = (s) => s.replace(/<dhEmi>[^<]*/, '<dhEmi>').replace(/<dCompet>[^<]*/, '<dCompet>');
      confere('XML de produção é igual ao da nota real aceita', semData(montado.xml) === semData(x), montado.xml.slice(0, 400));
    } else console.log('(sem o arquivo da nota real: comparação de produção pulada)');
    const padrao = montarDps(pedido());
    confere('sem pedir produção, o XML sai como teste', padrao.xml.includes('<tpAmb>2</tpAmb>') && padrao.xml.includes('<finNFSe>0</finNFSe>'));
    const assinador = (entrada) => JSON.parse(spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'nfse-assinar.ps1')], { input: JSON.stringify(entrada) }).stdout.toString('utf8'));
    const trava = (e) => assinador({ cnpj: '11222333000181', metodo: 'POST', caminho: '/nfse', id: 'X', ...e }).falha || '';
    confere('assinador: nota de teste não vai para produção', /nao e deste ambiente|certificado/.test(trava({ ambiente: 'producao', xml: '<x><tpAmb>2</tpAmb></x>' })));
    confere('assinador: ambiente desconhecido é recusado', /ambiente desconhecido/.test(trava({ ambiente: 'outro', xml: '<x/>' })));
    confere('assinador: "Producao" com maiúscula é recusado', /ambiente desconhecido/.test(trava({ ambiente: 'Producao', xml: '<x/>' })));
  } finally {
    serv.kill();
  }
  console.log(`\n${ok} ok, ${falhas} falha(s).`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('ERRO', e); process.exitCode = 1; });
