// "Airtable local": entende os mesmos pedidos da API do Airtable (v0) que os fluxos do n8n
// já fazem, mas lê e grava no banco PostgreSQL deste PC. Assim os fluxos continuam iguais;
// só o endereço muda de https://api.airtable.com para http://127.0.0.1:5690.
//
// O que ele imita do Airtable (porque os fluxos contam com isso):
// - registro no formato { id, createdTime, fields }, sem os campos vazios (texto vazio,
//   caixinha desmarcada, lista vazia não aparecem);
// - vínculo como lista de ids, dos dois lados (o banco guarda só no lado "filho");
// - campos de consulta (Contatos_Nomes, Fornecedor_Nome) e a fórmula Criado_Em;
// - filterByFormula com as funções usadas pelos fluxos; sort, fields[], pageSize/offset;
// - criar, alterar (PATCH/PUT), apagar (records[]) e subir anexo (uploadAttachment).
// Fora do Airtable: GET /anexos/<id> (entrega anexo) e POST /backup-cadastros (arquivo único
// com clientes, endereços e contatos; chamado pelo "App - Salvar entidade").
// Extra: com ?_itens=1 a busca devolve uma lista pura de registros (o nó HTTP do n8n vira
// um item por registro, igual ao nó do Airtable que ele substitui).
//
// Escuta só em 127.0.0.1 e exige o token guardado em C:\Users\rediv\senha-banco.txt.
// Uso: node banco/airtable-local.js   (o atalho "Servidor n8n" já liga sozinho)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool, types } = require('C:/Users/rediv/AppData/Roaming/npm/node_modules/n8n/node_modules/pg');

const PORTA = 5690;
const PASTA_ANEXOS = 'C:/Users/rediv/banco-solucoes/anexos';
const LIMITE_CORPO = 30 * 1024 * 1024;

types.setTypeParser(1082, (v) => v); // date: fica "AAAA-MM-DD", sem conversão de fuso
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric vira número

const segredos = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8');
const SENHA_DB = segredos.match(/^senha do n8n:\s*(\S+)/m)[1];
const TOKEN = segredos.match(/^token do airtable local:\s*(\S+)/m)[1];

const pool = new Pool({ host: '127.0.0.1', port: 5432, database: 'solucoes', user: 'n8n_app', password: SENHA_DB, max: 10 });

const BASES = {
  app6PyYmtFduIMp7B: {
    Entidades_Cadastradas: 'tbl5Joji6gAir3mNh', Locais_Atendimento: 'tblffVczCf1VeNxs7',
    Contatos_Solicitantes: 'tblXXOEOCwQnC2qFX', Chamados: 'tbltipxOIw8F96QHO', Usuarios: 'tblucYjrD3SKf1azh',
    Sessoes: 'tblYDslwEMH6tKfzL', Visitas: 'tblmeNdVfOE9AYptk',
    // Tabelas novas (28/10/2026), sem par no Airtable: os códigos foram escolhidos aqui.
    Sindicaturas: 'tblSindicatura001', Administradoras: 'tblAdministrad001',
  },
  appjAmWXV7Zr33UqE: {
    Despesas: 'tblNduEKl2jY280V0', Fornecedores: 'tblhsabIIg8SLqMMj', Recorrentes: 'tblb8QplhcGRP6SZ7',
    Recebimentos: 'tbl4tMnm3t3peeLYo', Config_Financeiro: 'tbl3uT9h7ZYXnfR7E', Conferencias: 'tblIrMrXYI6FZdKfS',
    Retiradas: 'tblh3m5JB6N2sNs5i', Cartoes: 'tblzJwNGcTpvGmYiM', Pagamentos_Fatura: 'tbldfftPos0qX7nlm',
  },
};

// Vínculo guardado no lado "filho" (coluna) e mostrado também no lado "mãe", como no Airtable.
const VINCULOS = [
  { mae: 'Entidades_Cadastradas', campoMae: 'Locais_Atendimento', filho: 'Locais_Atendimento', campoFilho: 'Cliente_Vinculado' },
  { mae: 'Entidades_Cadastradas', campoMae: 'Contatos_Solicitantes', filho: 'Contatos_Solicitantes', campoFilho: 'Entidades_Vinculadas', lista: true },
  { mae: 'Entidades_Cadastradas', campoMae: 'Chamados', filho: 'Chamados', campoFilho: 'Cliente_Ref' },
  { mae: 'Chamados', campoMae: 'Visitas', filho: 'Visitas', campoFilho: 'Chamado' },
  { mae: 'Usuarios', campoMae: 'Sessoes', filho: 'Sessoes', campoFilho: 'Usuario' },
  { mae: 'Fornecedores', campoMae: 'Recorrentes', filho: 'Recorrentes', campoFilho: 'Fornecedor_Ref' },
  { mae: 'Fornecedores', campoMae: 'Despesas', filho: 'Despesas', campoFilho: 'Fornecedor_Ref' },
  { mae: 'Recorrentes', campoMae: 'Despesas', filho: 'Despesas', campoFilho: 'Recorrente_Ref' },
  { mae: 'Recebimentos', campoMae: 'Despesas', filho: 'Despesas', campoFilho: 'Servico_Ref' },
  { mae: 'Cartoes', campoMae: 'Pagamentos_Fatura', filho: 'Pagamentos_Fatura', campoFilho: 'Cartao_Ref' },
  { mae: 'Cartoes', campoMae: 'Despesas', filho: 'Despesas', campoFilho: 'Cartao_Ref' },
];
// Campos de consulta (só leitura): valores de um campo dos registros vinculados.
const CONSULTAS = [
  { tabela: 'Entidades_Cadastradas', campo: 'Contatos_Nomes', vinculo: 'Contatos_Solicitantes', origem: 'Contatos_Solicitantes', campoOrigem: 'Nome_Contato' },
  { tabela: 'Despesas', campo: 'Fornecedor_Nome', vinculo: 'Fornecedor_Ref', origem: 'Fornecedores', campoOrigem: 'Nome' },
];
// No Airtable, Usuarios e Sessoes têm um campo-fórmula "Criado_Em" (data de criação).
const CRIADO_EM_VISIVEL = new Set(['Usuarios', 'Sessoes']);

class ErroApi extends Error {
  constructor(status, tipo, mensagem) { super(mensagem); this.status = status; this.tipo = tipo; }
}
const erro422 = (tipo, msg) => new ErroApi(422, tipo, msg);

// ---------- esquema (lido do banco ao ligar) ----------

const ESQUEMA = {}; // tabela -> { campos: { nome: { tipo, coluna?, vinculoPara?, mae?, consulta?, calculado? } } }

function tipoDaColuna(dataType) {
  return {
    text: 'texto', ARRAY: 'lista', jsonb: 'anexos', boolean: 'caixa', integer: 'inteiro', numeric: 'numero',
    date: 'data', 'timestamp with time zone': 'datahora',
  }[dataType];
}

async function carregarEsquema() {
  const r = await pool.query("select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' order by ordinal_position");
  for (const c of r.rows) {
    const t = (ESQUEMA[c.table_name] = ESQUEMA[c.table_name] || { campos: {} });
    if (c.column_name === 'id') continue;
    if (c.column_name === 'Criado_Em') {
      if (CRIADO_EM_VISIVEL.has(c.table_name)) t.campos.Criado_Em = { tipo: 'datahora', coluna: 'Criado_Em', calculado: true };
      continue;
    }
    const tipo = tipoDaColuna(c.data_type);
    if (!tipo) throw new Error('Tipo de coluna sem tradução: ' + c.table_name + '.' + c.column_name + ' ' + c.data_type);
    t.campos[c.column_name] = { tipo, coluna: c.column_name };
  }
  for (const v of VINCULOS) {
    ESQUEMA[v.filho].campos[v.campoFilho].vinculoPara = v.mae;
    ESQUEMA[v.mae].campos[v.campoMae] = { tipo: 'mae', mae: v };
  }
  for (const c of CONSULTAS) ESQUEMA[c.tabela].campos[c.campo] = { tipo: 'consulta', consulta: c, calculado: true };
  for (const base of Object.values(BASES)) for (const t of Object.keys(base)) if (!ESQUEMA[t]) throw new Error('Tabela sem esquema no banco: ' + t);
}

function acharTabela(baseId, tabela) {
  const base = BASES[baseId];
  if (!base) throw ApiNaoAchou();
  const nome = Object.keys(base).find((n) => n === tabela || base[n] === tabela);
  if (!nome) throw new ErroApi(404, 'TABLE_NOT_FOUND', `Could not find table ${tabela} in application ${baseId}`);
  return nome;
}
function ApiNaoAchou() { return new ErroApi(404, 'NOT_FOUND', 'Could not find what you are looking for'); }
// Só campos que a tabela tem de verdade (nome como "__proto__" ou "constructor" não passa).
const campoDa = (esq, nome) => (Object.prototype.hasOwnProperty.call(esq.campos, nome) ? esq.campos[nome] : undefined);
const ehDataIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

// ---------- leitura no formato do Airtable ----------

function valorParaAirtable(campo, v) {
  if (v === null || v === undefined) return undefined;
  switch (campo.tipo) {
    case 'texto':
      if (campo.vinculoPara) return [v];
      return v === '' ? undefined : v;
    case 'lista': return v.length ? v : undefined;
    case 'anexos': return Array.isArray(v) && v.length ? v : undefined;
    case 'caixa': return v ? true : undefined;
    case 'inteiro': case 'numero': return v;
    case 'data': return v;
    case 'datahora': return new Date(v).toISOString();
    default: return v;
  }
}

async function lerRegistros(cli, tabela, ids) {
  const esq = ESQUEMA[tabela];
  const linhas = (await cli.query(
    `select * from "${tabela}"` + (ids ? ' where id = any($1)' : '') + ' order by "Criado_Em", id', ids ? [ids] : [])).rows;
  const meusIds = linhas.map((l) => l.id);

  // Lado "mãe" dos vínculos: quem aponta para cada registro, na ordem de criação.
  const maes = {};
  for (const v of VINCULOS.filter((x) => x.mae === tabela)) {
    const cond = v.lista ? `"${v.campoFilho}" && $1::text[]` : `"${v.campoFilho}" = any($1)`;
    const filhos = (await cli.query(`select id, "${v.campoFilho}" as ref from "${v.filho}" where ${cond} order by "Criado_Em", id`, [meusIds])).rows;
    const mapa = {};
    for (const f of filhos) for (const ref of [].concat(f.ref || [])) (mapa[ref] = mapa[ref] || []).push(f.id);
    maes[v.campoMae] = mapa;
  }

  const registros = linhas.map((l) => {
    const fields = {};
    for (const [nome, campo] of Object.entries(esq.campos)) {
      let val;
      if (campo.tipo === 'mae') { const lst = (maes[nome] || {})[l.id]; val = lst && lst.length ? lst : undefined; }
      else if (campo.tipo === 'consulta') continue;
      else val = valorParaAirtable(campo, l[campo.coluna]);
      if (val !== undefined) fields[nome] = val;
    }
    return { id: l.id, createdTime: new Date(l.Criado_Em).toISOString(), fields };
  });

  // Campos de consulta (ex.: nomes dos contatos vinculados).
  for (const c of CONSULTAS.filter((x) => x.tabela === tabela)) {
    const todos = [...new Set(registros.flatMap((r) => r.fields[c.vinculo] || []))];
    if (!todos.length) continue;
    const nomes = {};
    for (const o of (await cli.query(`select id, "${c.campoOrigem}" as v from "${c.origem}" where id = any($1)`, [todos])).rows) nomes[o.id] = o.v;
    for (const r of registros) {
      const vals = (r.fields[c.vinculo] || []).map((id) => nomes[id]).filter((x) => x !== null && x !== undefined && x !== '');
      if (vals.length) r.fields[c.campo] = vals;
    }
  }
  return registros;
}

function soCampos(registro, campos) {
  if (!campos || !campos.length) return registro;
  const fields = {};
  for (const c of campos) if (registro.fields[c] !== undefined) fields[c] = registro.fields[c];
  return { ...registro, fields };
}

// ---------- fórmulas (filterByFormula) ----------

function tokenizar(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '{') {
      const j = s.indexOf('}', i);
      if (j < 0) throw erroFormula(s);
      toks.push({ t: 'campo', v: s.slice(i + 1, j) }); i = j + 1; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1, out = '';
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\' && j + 1 < s.length) { out += s[j + 1]; j += 2; } else out += s[j++];
      }
      if (j >= s.length) throw erroFormula(s);
      toks.push({ t: 'texto', v: out }); i = j + 1; continue;
    }
    let m;
    if ((m = /^(\d+(\.\d+)?|\.\d+)/.exec(s.slice(i)))) { toks.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)))) { toks.push({ t: 'nome', v: m[0].toUpperCase() }); i += m[0].length; continue; }
    const dois = s.slice(i, i + 2);
    if (['!=', '<=', '>=', '<>'].includes(dois)) { toks.push({ t: 'op', v: dois === '<>' ? '!=' : dois }); i += 2; continue; }
    if ('=<>&+-*/'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    if ('(),'.includes(c)) { toks.push({ t: c }); i++; continue; }
    throw erroFormula(s);
  }
  return toks;
}
function erroFormula(f, extra) {
  return erro422('INVALID_FILTER_BY_FORMULA', `The formula for filtering records is invalid: ${extra || 'Invalid formula'}. Please check your formula text.`);
}

function analisar(formula) {
  const toks = tokenizar(formula);
  let p = 0;
  const ver = () => toks[p];
  const pegar = (t, v) => {
    const k = toks[p];
    if (!k || k.t !== t || (v !== undefined && k.v !== v)) throw erroFormula(formula);
    p++; return k;
  };
  const nivel = (ops, prox) => () => {
    let esq = prox();
    while (ver() && ver().t === 'op' && ops.includes(ver().v)) { const op = toks[p++].v; esq = { op, esq, dir: prox() }; }
    return esq;
  };
  const primario = () => {
    const k = ver();
    if (!k) throw erroFormula(formula);
    if (k.t === 'op' && k.v === '-') { p++; return { op: 'neg', arg: primario() }; }
    if (k.t === 'num' || k.t === 'texto') { p++; return { lit: k.v }; }
    if (k.t === 'campo') { p++; return { campo: k.v }; }
    if (k.t === '(') { p++; const e = expr(); pegar(')'); return e; }
    if (k.t === 'nome') {
      p++;
      if (ver() && ver().t === '(') {
        p++;
        const args = [];
        if (!(ver() && ver().t === ')')) {
          args.push(expr());
          while (ver() && ver().t === ',') { p++; args.push(expr()); }
        }
        pegar(')');
        return { fn: k.v, args };
      }
      if (k.v === 'TRUE' || k.v === 'FALSE') return { fn: k.v, args: [] };
    }
    throw erroFormula(formula);
  };
  const produto = nivel(['*', '/'], primario);
  const soma = nivel(['+', '-'], produto);
  const concat = nivel(['&'], soma);
  const expr = nivel(['=', '!=', '<', '>', '<=', '>='], concat);
  const arvore = expr();
  if (p !== toks.length) throw erroFormula(formula);
  return arvore;
}

const FUNCOES = new Set(['AND', 'OR', 'NOT', 'IF', 'TRUE', 'FALSE', 'BLANK', 'RECORD_ID', 'LOWER', 'UPPER', 'TRIM', 'LEN',
  'FIND', 'SEARCH', 'CONCATENATE', 'ARRAYJOIN', 'IS_AFTER', 'IS_BEFORE', 'IS_SAME', 'VALUE']);

function conferirArvore(no, esq) {
  if (no.campo !== undefined && !campoDa(esq, no.campo)) throw erroFormula('', `Unknown field names: ${no.campo.toLowerCase()}`);
  if (no.fn && !FUNCOES.has(no.fn)) throw erroFormula('', `Unknown function names: ${no.fn}`);
  for (const filho of [no.esq, no.dir, no.arg, ...(no.args || [])]) if (filho) conferirArvore(filho, esq);
}

const texto = (v) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(texto).join(', ');
  if (v === true) return '1';
  if (v === false) return '0';
  return String(v);
};
const verdade = (v) => !(v === null || v === undefined || v === '' || v === 0 || v === false || (Array.isArray(v) && !v.length));
const ehNumero = (v) => typeof v === 'number' || typeof v === 'boolean';
const data = (v) => { const d = new Date(texto(v)); return isNaN(d) ? null : d; };

function avaliar(no, reg) {
  if (no.lit !== undefined) return no.lit;
  if (no.campo !== undefined) { const v = reg.fields[no.campo]; return v === undefined ? null : v; }
  if (no.op === 'neg') return -Number(avaliar(no.arg, reg));
  if (no.op) {
    const a = avaliar(no.esq, reg), b = avaliar(no.dir, reg);
    switch (no.op) {
      case '&': return texto(a) + texto(b);
      case '+': return Number(a) + Number(b);
      case '-': return Number(a) - Number(b);
      case '*': return Number(a) * Number(b);
      case '/': return Number(a) / Number(b);
    }
    let x = a, y = b;
    if (ehNumero(a) && ehNumero(b)) { x = Number(a); y = Number(b); }
    else if ((ehNumero(a) && (b === null || b === undefined)) || ((a === null || a === undefined) && ehNumero(b))) { x = Number(a || 0); y = Number(b || 0); }
    else { x = texto(a); y = texto(b); }
    switch (no.op) {
      case '=': return x === y;
      case '!=': return x !== y;
      case '<': return x < y;
      case '>': return x > y;
      case '<=': return x <= y;
      case '>=': return x >= y;
    }
  }
  const args = no.args;
  const arg = (i) => avaliar(args[i], reg);
  switch (no.fn) {
    case 'AND': return args.every((a) => verdade(avaliar(a, reg)));
    case 'OR': return args.some((a) => verdade(avaliar(a, reg)));
    case 'NOT': return !verdade(arg(0));
    case 'IF': return verdade(arg(0)) ? (args[1] ? arg(1) : null) : (args[2] ? arg(2) : null);
    case 'TRUE': return true;
    case 'FALSE': return false;
    case 'BLANK': return null;
    case 'RECORD_ID': return reg.id;
    case 'LOWER': return texto(arg(0)).toLowerCase();
    case 'UPPER': return texto(arg(0)).toUpperCase();
    case 'TRIM': return texto(arg(0)).trim();
    case 'LEN': return texto(arg(0)).length;
    case 'FIND': { const i = texto(arg(1)).indexOf(texto(arg(0)), args[2] ? Math.max(0, Number(arg(2)) - 1) : 0); return i + 1; }
    case 'SEARCH': { const i = texto(arg(1)).indexOf(texto(arg(0)), args[2] ? Math.max(0, Number(arg(2)) - 1) : 0); return i < 0 ? null : i + 1; }
    case 'CONCATENATE': return args.map((a) => texto(avaliar(a, reg))).join('');
    case 'ARRAYJOIN': { const v = arg(0); return (Array.isArray(v) ? v : [v]).filter((x) => x !== null).map(texto).join(args[1] ? texto(arg(1)) : ', '); }
    case 'IS_AFTER': { const a = data(arg(0)), b = data(arg(1)); return !!(a && b && a > b); }
    case 'IS_BEFORE': { const a = data(arg(0)), b = data(arg(1)); return !!(a && b && a < b); }
    case 'IS_SAME': { const a = data(arg(0)), b = data(arg(1)); return !!(a && b && a.getTime() === b.getTime()); }
    case 'VALUE': { const n = Number(texto(arg(0)).replace(/[^\d.-]/g, '')); return isNaN(n) ? null : n; }
  }
  throw erroFormula('', 'Unknown function names: ' + no.fn);
}

// ---------- gravação ----------

const ehId = (v) => typeof v === 'string' && /^rec[A-Za-z0-9]{14}$/.test(v);

async function conferirIds(cli, tabela, ids) {
  if (!ids.length) return;
  const achados = new Set((await cli.query(`select id from "${tabela}" where id = any($1)`, [ids])).rows.map((r) => r.id));
  const falta = ids.filter((id) => !achados.has(id));
  if (falta.length) throw erro422('ROW_DOES_NOT_EXIST', `Record ID ${falta[0]} does not exist in this table`);
}

function listaDeIds(nome, valor) {
  if (valor === null || valor === undefined || valor === '') return [];
  const lst = Array.isArray(valor) ? valor : [valor];
  const ids = lst.map((x) => (x && typeof x === 'object' ? x.id : x));
  for (const id of ids) if (!ehId(id)) throw erro422('INVALID_VALUE_FOR_COLUMN', `Value "${id}" is not a valid record ID for field "${nome}"`);
  return [...new Set(ids)];
}

// Converte o valor que veio no pedido para o valor da coluna (ou erro, como o Airtable faria).
async function valorParaColuna(cli, nome, campo, valor) {
  const vazio = valor === null || valor === undefined || valor === '';
  switch (campo.tipo) {
    case 'texto':
      if (campo.vinculoPara) {
        const ids = listaDeIds(nome, valor);
        if (ids.length > 1) throw erro422('INVALID_VALUE_FOR_COLUMN', `Field "${nome}" aceita só um vínculo neste banco (vieram ${ids.length})`);
        await conferirIds(cli, campo.vinculoPara, ids);
        return ids[0] || null;
      }
      if (vazio) return null;
      if (typeof valor === 'object') throw erro422('INVALID_VALUE_FOR_COLUMN', `Field "${nome}" cannot accept the provided value`);
      return String(valor);
    case 'lista': {
      const ids = listaDeIds(nome, valor);
      await conferirIds(cli, campo.vinculoPara || 'Entidades_Cadastradas', ids);
      return ids;
    }
    case 'anexos':
      if (vazio) return '[]';
      if (!Array.isArray(valor)) throw erro422('INVALID_ATTACHMENT_OBJECT', `Field "${nome}" precisa de uma lista de anexos`);
      return JSON.stringify(valor);
    case 'caixa':
      if (vazio) return false;
      if (typeof valor === 'boolean') return valor;
      if (valor === 'true' || valor === 1 || valor === '1') return true;
      if (valor === 'false' || valor === 0 || valor === '0') return false;
      throw erro422('INVALID_VALUE_FOR_COLUMN', `Field "${nome}" cannot accept the provided value`);
    case 'inteiro': case 'numero': {
      if (vazio) return null;
      const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
      if (!isFinite(n)) throw erro422('INVALID_VALUE_FOR_COLUMN', `Field "${nome}" cannot accept the provided value "${valor}"`);
      return campo.tipo === 'inteiro' ? Math.round(n) : n;
    }
    case 'data': {
      if (vazio) return null;
      const s = String(valor);
      if (!/^\d{4}-\d{2}-\d{2}/.test(s) || isNaN(new Date(s.slice(0, 10)))) throw erro422('INVALID_VALUE_FOR_COLUMN', `Field "${nome}" cannot accept the provided value "${valor}"`);
      return s.slice(0, 10);
    }
    case 'datahora': {
      if (vazio) return null;
      let s = String(valor);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00.000Z';
      else if (/T\d{2}:\d{2}/.test(s) && !/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'; // sem fuso: o Airtable entende como UTC
      const d = new Date(s);
      if (isNaN(d)) throw erro422('INVALID_VALUE_FOR_COLUMN', `Field "${nome}" cannot accept the provided value "${valor}"`);
      return d.toISOString();
    }
  }
  throw erro422('INVALID_VALUE_FOR_COLUMN', `Field "${nome}" cannot accept a value`);
}

const vazioDaColuna = (campo) => (campo.tipo === 'caixa' ? false : campo.tipo === 'lista' ? [] : campo.tipo === 'anexos' ? '[]' : null);

// Separa os campos do pedido em colunas da própria tabela e vínculos do lado "mãe".
async function prepararCampos(cli, tabela, fields, destrutivo) {
  const esq = ESQUEMA[tabela];
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) throw erro422('INVALID_REQUEST_UNKNOWN', 'Invalid request: parameter validation failed. Check your request data.');
  const colunas = {}, maes = {};
  for (const [nome, valor] of Object.entries(fields)) {
    const campo = campoDa(esq, nome);
    if (!campo) throw erro422('UNKNOWN_FIELD_NAME', `Unknown field name: "${nome}"`);
    if (campo.calculado) throw erro422('INVALID_VALUE_FOR_COLUMN', `Field "${nome}" cannot accept a value because the field is computed`);
    if (campo.tipo === 'mae') maes[nome] = listaDeIds(nome, valor);
    else colunas[campo.coluna] = await valorParaColuna(cli, nome, campo, valor);
  }
  if (destrutivo) {
    for (const [nome, campo] of Object.entries(esq.campos)) {
      if (campo.calculado || nome in fields) continue;
      if (campo.tipo === 'mae') maes[nome] = [];
      else colunas[campo.coluna] = vazioDaColuna(campo);
    }
  }
  return { colunas, maes };
}

async function gravarMaes(cli, tabela, id, maes) {
  for (const [nome, ids] of Object.entries(maes)) {
    const v = ESQUEMA[tabela].campos[nome].mae;
    await conferirIds(cli, v.filho, ids);
    const fk = `"${v.campoFilho}"`;
    if (v.lista) {
      await cli.query(`update "${v.filho}" set ${fk} = array_remove(${fk}, $1) where $1 = any(${fk}) and not (id = any($2))`, [id, ids]);
      await cli.query(`update "${v.filho}" set ${fk} = array_append(${fk}, $1) where id = any($2) and not ($1 = any(${fk}))`, [id, ids]);
    } else {
      await cli.query(`update "${v.filho}" set ${fk} = null where ${fk} = $1 and not (id = any($2))`, [id, ids]);
      await cli.query(`update "${v.filho}" set ${fk} = $1 where id = any($2)`, [id, ids]);
    }
  }
}

async function criar(cli, tabela, fields) {
  const { colunas, maes } = await prepararCampos(cli, tabela, fields || {}, false);
  const nomes = Object.keys(colunas);
  const sql = nomes.length
    ? `insert into "${tabela}" (${nomes.map((n) => `"${n}"`).join(', ')}) values (${nomes.map((_, i) => '$' + (i + 1)).join(', ')}) returning id`
    : `insert into "${tabela}" default values returning id`;
  const id = (await cli.query(sql, nomes.map((n) => colunas[n]))).rows[0].id;
  await gravarMaes(cli, tabela, id, maes);
  return id;
}

async function alterar(cli, tabela, id, fields, destrutivo) {
  if (!ehId(id)) throw new ErroApi(404, 'NOT_FOUND', 'Could not find what you are looking for');
  const existe = (await cli.query(`select 1 from "${tabela}" where id = $1`, [id])).rowCount;
  if (!existe) throw new ErroApi(404, 'NOT_FOUND', 'Could not find what you are looking for');
  const { colunas, maes } = await prepararCampos(cli, tabela, fields || {}, destrutivo);
  const nomes = Object.keys(colunas);
  if (nomes.length) {
    await cli.query(`update "${tabela}" set ${nomes.map((n, i) => `"${n}" = $${i + 1}`).join(', ')} where id = $${nomes.length + 1}`,
      [...nomes.map((n) => colunas[n]), id]);
  }
  await gravarMaes(cli, tabela, id, maes);
}

async function apagar(cli, tabela, id) {
  if (!ehId(id)) throw new ErroApi(404, 'NOT_FOUND', 'Could not find what you are looking for');
  // Vínculos em lista não somem sozinhos (os de coluna simples o banco limpa sozinho).
  for (const v of VINCULOS.filter((x) => x.mae === tabela && x.lista)) {
    await cli.query(`update "${v.filho}" set "${v.campoFilho}" = array_remove("${v.campoFilho}", $1) where $1 = any("${v.campoFilho}")`, [id]);
  }
  const r = await cli.query(`delete from "${tabela}" where id = $1`, [id]);
  if (!r.rowCount) throw new ErroApi(404, 'NOT_FOUND', 'Could not find what you are looking for');
}

async function emTransacao(fn) {
  const cli = await pool.connect();
  try {
    await cli.query('begin');
    const r = await fn(cli);
    await cli.query('commit');
    return r;
  } catch (e) {
    await cli.query('rollback').catch(() => {});
    throw e;
  } finally {
    cli.release();
  }
}

// ---------- listagem ----------

function lerOrdenacao(q) {
  const ords = [];
  for (const [k, v] of q.entries()) {
    const m = /^sort\[(\d+)\]\[(field|direction)\]$/.exec(k);
    if (!m) continue;
    const o = (ords[m[1]] = ords[m[1]] || { direction: 'asc' });
    o[m[2]] = v;
  }
  return ords.filter(Boolean);
}

function comparar(a, b) {
  const va = a === undefined ? null : a, vb = b === undefined ? null : b;
  if (va === null && vb === null) return 0;
  if (va === null) return -1; // vazio primeiro, como no Airtable
  if (vb === null) return 1;
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  if (ehDataIso(va) && ehDataIso(vb)) return va < vb ? -1 : va > vb ? 1 : 0;
  return texto(va).localeCompare(texto(vb), 'pt-BR');
}

async function listar(tabela, q) {
  const esq = ESQUEMA[tabela];
  const formula = q.get('filterByFormula') || '';
  const ords = lerOrdenacao(q);
  const campos = q.getAll('fields[]');
  for (const o of ords) if (!campoDa(esq, o.field)) throw erro422('UNKNOWN_FIELD_NAME', `Unknown field name: "${o.field}"`);
  for (const c of campos) if (!campoDa(esq, c)) throw erro422('UNKNOWN_FIELD_NAME', `Unknown field name: "${c}"`);
  if (q.get('returnFieldsByFieldId') === 'true') throw erro422('INVALID_REQUEST_UNKNOWN', 'returnFieldsByFieldId não é usado neste banco');
  if (q.get('view')) throw erro422('VIEW_NAME_NOT_FOUND', 'Este banco não tem visões (views)');

  let arvore = null;
  if (formula.trim()) { arvore = analisar(formula); conferirArvore(arvore, esq); }

  const cli = await pool.connect();
  let registros;
  try { registros = await lerRegistros(cli, tabela); } finally { cli.release(); }
  if (arvore) registros = registros.filter((r) => verdade(avaliar(arvore, r)));
  if (ords.length) {
    registros.sort((a, b) => {
      for (const o of ords) {
        const c = comparar(a.fields[o.field], b.fields[o.field]);
        if (c) return o.direction === 'desc' ? -c : c;
      }
      return 0;
    });
  }
  const max = Number(q.get('maxRecords')) || 0;
  if (max > 0) registros = registros.slice(0, max);
  registros = registros.map((r) => soCampos(r, campos));

  if (q.get('_itens') === '1') return registros; // lista pura: o nó HTTP vira um item por registro
  const tamanho = Math.min(Math.max(Number(q.get('pageSize')) || 100, 1), 100);
  const inicio = Number((q.get('offset') || '').replace(/^itr/, '')) || 0;
  const pagina = registros.slice(inicio, inicio + tamanho);
  const resp = { records: pagina };
  if (inicio + tamanho < registros.length) resp.offset = 'itr' + (inicio + tamanho);
  return resp;
}

// ---------- anexos ----------

async function subirAnexo(baseId, recordId, nomeCampo, corpo) {
  if (!BASES[baseId] || !ehId(recordId)) throw ApiNaoAchou();
  let tabela = null;
  for (const t of Object.keys(BASES[baseId])) {
    if ((await pool.query(`select 1 from "${t}" where id = $1`, [recordId])).rowCount) { tabela = t; break; }
  }
  if (!tabela) throw ApiNaoAchou();
  const campo = campoDa(ESQUEMA[tabela], nomeCampo);
  if (!campo || campo.tipo !== 'anexos') throw erro422('UNKNOWN_FIELD_NAME', `Unknown field name: "${nomeCampo}"`);
  if (!corpo || typeof corpo.file !== 'string' || !corpo.file) throw erro422('INVALID_REQUEST_UNKNOWN', 'Anexo sem arquivo');
  const bytes = Buffer.from(corpo.file, 'base64');
  const attId = 'att' + crypto.randomBytes(16).toString('hex');
  const filename = String(corpo.filename || 'arquivo').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 150);
  fs.mkdirSync(PASTA_ANEXOS, { recursive: true });
  fs.writeFileSync(path.join(PASTA_ANEXOS, attId), bytes);
  fs.writeFileSync(path.join(PASTA_ANEXOS, attId + '.json'), JSON.stringify({ filename, type: String(corpo.contentType || 'application/octet-stream'), size: bytes.length, tabela, recordId, campo: nomeCampo }));
  // Endereço relativo: o "App - Listar chamados" completa com o endereço do túnel.
  const anexo = { id: attId, url: '/webhook/anexo?id=' + attId, filename, size: bytes.length, type: String(corpo.contentType || 'application/octet-stream') };
  return emTransacao(async (cli) => {
    await cli.query(`update "${tabela}" set "${campo.coluna}" = "${campo.coluna}" || $1::jsonb where id = $2`, [JSON.stringify([anexo]), recordId]);
    const [reg] = await lerRegistros(cli, tabela, [recordId]);
    return { id: reg.id, createdTime: reg.createdTime, fields: { [nomeCampo]: reg.fields[nomeCampo] || [] } };
  });
}

function servirAnexo(res, attId) {
  if (!/^att[0-9a-f]{32}$/.test(attId)) throw ApiNaoAchou();
  const arq = path.join(PASTA_ANEXOS, attId);
  if (!fs.existsSync(arq)) throw ApiNaoAchou();
  const meta = JSON.parse(fs.readFileSync(arq + '.json', 'utf8'));
  // O tipo veio de quem enviou: só foto e PDF abrem na tela. Qualquer outro (inclusive HTML ou
  // SVG, que podem ter código) vai como download, para não rodar no endereço do n8n/túnel.
  const abreNaTela = /^(image\/(jpeg|png|gif|webp|heic|heif)|application\/pdf)$/i.test(String(meta.type));
  res.writeHead(200, {
    'Content-Type': abreNaTela ? meta.type : 'application/octet-stream',
    'Content-Length': meta.size,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${abreNaTela ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
  });
  fs.createReadStream(arq).pipe(res);
}

// ---------- backup dos cadastros ----------
// Um arquivo só (regra do dono, 27/10/2026): refeito quando entra cliente novo, trocando o
// anterior. Quem sumiu do sistema desde o último backup não some do arquivo: fica em
// "apagados_do_sistema", senão um apagado sem querer seguido de um cliente novo perderia a
// única cópia. Se a leitura do banco falhar, o arquivo anterior fica como está.

const ARQ_BACKUP_CADASTROS = 'C:/Users/rediv/banco-solucoes/backup-cadastros.json';
const TABELAS_CADASTRO = ['Entidades_Cadastradas', 'Locais_Atendimento', 'Contatos_Solicitantes', 'Sindicaturas', 'Administradoras'];

async function backupCadastros() {
  const atuais = {};
  const cli = await pool.connect();
  try {
    for (const t of TABELAS_CADASTRO) atuais[t] = await lerRegistros(cli, t);
  } finally {
    cli.release();
  }
  let anterior = null;
  try { anterior = JSON.parse(fs.readFileSync(ARQ_BACKUP_CADASTROS, 'utf8')); } catch (e) { anterior = null; }
  const agora = new Date().toISOString();
  const apagados = {};
  for (const t of TABELAS_CADASTRO) {
    const existe = new Set(atuais[t].map((r) => r.id));
    const jaGuardados = ((anterior && anterior.apagados_do_sistema) || {})[t] || [];
    const sumiramAgora = (((anterior && anterior.tabelas) || {})[t] || [])
      .filter((r) => !existe.has(r.id))
      .map((r) => ({ ...r, apagadoNoSistemaEm: agora }));
    const porId = new Map();
    for (const r of [...jaGuardados, ...sumiramAgora]) if (!existe.has(r.id) && !porId.has(r.id)) porId.set(r.id, r);
    apagados[t] = [...porId.values()];
  }
  const conteudo = {
    feito_em: agora,
    explicacao: 'Backup dos cadastros (clientes, endereços e contatos), refeito quando entra cliente novo. '
      + '"tabelas" é como estava no sistema nessa hora; "apagados_do_sistema" guarda quem foi apagado depois de um backup.',
    tabelas: atuais,
    apagados_do_sistema: apagados,
  };
  const temp = ARQ_BACKUP_CADASTROS + '.novo';
  fs.writeFileSync(temp, JSON.stringify(conteudo, null, 1));
  fs.renameSync(temp, ARQ_BACKUP_CADASTROS); // troca o anterior de uma vez só
  return {
    ok: true, arquivo: ARQ_BACKUP_CADASTROS, feito_em: agora,
    clientes: atuais.Entidades_Cadastradas.length, locais: atuais.Locais_Atendimento.length, contatos: atuais.Contatos_Solicitantes.length,
    sindicaturas: atuais.Sindicaturas.length, administradoras: atuais.Administradoras.length,
    apagados_guardados: TABELAS_CADASTRO.reduce((s, t) => s + apagados[t].length, 0),
  };
}

// ---------- servidor ----------

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tam = 0;
    req.on('data', (c) => {
      tam += c.length;
      if (tam > LIMITE_CORPO) { reject(new ErroApi(413, 'REQUEST_TOO_LARGE', 'Request body too large')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      const txt = Buffer.concat(partes).toString('utf8');
      if (!txt.trim()) return resolve({});
      try { resolve(JSON.parse(txt)); } catch { reject(erro422('INVALID_REQUEST_BODY', 'Could not parse request body')); }
    });
    req.on('error', reject);
  });
}

function tokenConfere(req) {
  const h = String(req.headers.authorization || '');
  const recebido = Buffer.from(h.replace(/^Bearer\s+/i, ''));
  const esperado = Buffer.from(TOKEN);
  return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
}

function responder(res, status, corpo) {
  const txt = JSON.stringify(corpo);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(txt) });
  res.end(txt);
}

async function tratar(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (req.method === 'GET' && url.pathname === '/saude') {
    await pool.query('select 1');
    return responder(res, 200, { ok: true });
  }
  if (!tokenConfere(req)) throw new ErroApi(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');

  if (partes[0] === 'anexos' && partes.length === 2 && req.method === 'GET') return servirAnexo(res, partes[1]);
  if (url.pathname === '/backup-cadastros' && req.method === 'POST') return responder(res, 200, await backupCadastros());
  if (partes[0] !== 'v0' || partes.length < 3) throw ApiNaoAchou();
  const [, baseId, alvo, id, extra] = partes;

  if (partes.length === 5 && extra === 'uploadAttachment' && req.method === 'POST') {
    return responder(res, 200, await subirAnexo(baseId, alvo, id, await lerCorpo(req)));
  }
  if (partes.length > 4) throw ApiNaoAchou();
  const tabela = acharTabela(baseId, alvo);

  if (req.method === 'GET' && !id) return responder(res, 200, await listar(tabela, url.searchParams));
  if (req.method === 'GET' && id) {
    if (!ehId(id)) throw ApiNaoAchou();
    const cli = await pool.connect();
    let regs;
    try { regs = await lerRegistros(cli, tabela, [id]); } finally { cli.release(); }
    if (!regs.length) throw ApiNaoAchou();
    return responder(res, 200, regs[0]);
  }

  if (req.method === 'POST' && !id) {
    const corpo = await lerCorpo(req);
    if (Array.isArray(corpo.records)) {
      const regs = await emTransacao(async (cli) => {
        const ids = [];
        for (const r of corpo.records) ids.push(await criar(cli, tabela, r && r.fields));
        const lidos = await lerRegistros(cli, tabela, ids);
        return ids.map((i) => lidos.find((r) => r.id === i));
      });
      return responder(res, 200, { records: regs });
    }
    const reg = await emTransacao(async (cli) => (await lerRegistros(cli, tabela, [await criar(cli, tabela, corpo.fields)]))[0]);
    return responder(res, 200, reg);
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const corpo = await lerCorpo(req);
    const destrutivo = req.method === 'PUT';
    if (corpo.performUpsert) throw erro422('INVALID_REQUEST_UNKNOWN', 'performUpsert não é usado neste banco');
    if (id) {
      const reg = await emTransacao(async (cli) => { await alterar(cli, tabela, id, corpo.fields, destrutivo); return (await lerRegistros(cli, tabela, [id]))[0]; });
      return responder(res, 200, reg);
    }
    if (!Array.isArray(corpo.records)) throw erro422('INVALID_REQUEST_MISSING_FIELDS', 'Could not find field "records" in the request body');
    const regs = await emTransacao(async (cli) => {
      for (const r of corpo.records) await alterar(cli, tabela, r && r.id, r && r.fields, destrutivo);
      const ids = corpo.records.map((r) => r.id);
      const lidos = await lerRegistros(cli, tabela, ids);
      return ids.map((i) => lidos.find((r) => r.id === i));
    });
    return responder(res, 200, { records: regs });
  }

  if (req.method === 'DELETE') {
    if (id) {
      await emTransacao((cli) => apagar(cli, tabela, id));
      return responder(res, 200, { id, deleted: true });
    }
    const ids = url.searchParams.getAll('records[]');
    if (!ids.length) throw erro422('INVALID_REQUEST_MISSING_FIELDS', 'Could not find field "records" in the request');
    await emTransacao(async (cli) => { for (const i of ids) await apagar(cli, tabela, i); });
    return responder(res, 200, { records: ids.map((i) => ({ id: i, deleted: true })) });
  }

  throw new ErroApi(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
}

const servidor = http.createServer((req, res) => {
  const t0 = Date.now();
  tratar(req, res)
    .catch((e) => {
      if (e instanceof ErroApi) return responder(res, e.status, { error: { type: e.tipo, message: e.message } });
      if (e && e.code === '23503') return responder(res, 422, { error: { type: 'ROW_DOES_NOT_EXIST', message: 'Vínculo para registro que não existe' } });
      if (e && e.code === '23505') return responder(res, 422, { error: { type: 'DUPLICATE_VALUE', message: 'Já existe um registro com esse valor (' + (e.constraint || '') + ')' } });
      console.error(new Date().toISOString(), 'ERRO', req.method, req.url.split('?')[0], e && e.stack);
      return responder(res, 500, { error: { type: 'SERVER_ERROR', message: 'Erro no banco local' } });
    })
    .finally(() => {
      console.log(new Date().toISOString(), req.method, req.url.split('?')[0], res.statusCode, (Date.now() - t0) + 'ms');
    });
});

carregarEsquema()
  .then(() => servidor.listen(PORTA, '127.0.0.1', () => console.log(new Date().toISOString(), `Airtable local ouvindo em http://127.0.0.1:${PORTA}`)))
  .catch((e) => { console.error('Não consegui ligar:', e); process.exit(1); });

module.exports = { analisar, avaliar, tokenizar };
