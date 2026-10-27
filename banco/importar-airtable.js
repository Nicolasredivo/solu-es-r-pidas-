// Importa no banco local os dados exportados do Airtable (arquivos JSON gerados pelo
// site do Airtable, sem gastar a cota da API) e confere se tudo chegou.
//
// Uso:  node banco/importar-airtable.js <pasta com os .json> [--substituir]
//
// Por segurança, só importa se as tabelas estiverem vazias. Com --substituir, apaga o
// que houver no banco antes (use só enquanto o banco novo ainda não estiver em uso).
// Tudo roda numa transação: se der qualquer erro, nada é gravado.

const fs = require('fs');
const path = require('path');
const { Client } = require('C:/Users/rediv/AppData/Roaming/npm/node_modules/n8n/node_modules/pg');

const pasta = process.argv[2];
const substituir = process.argv.includes('--substituir');
if (!pasta) { console.error('Informe a pasta dos arquivos .json'); process.exit(1); }

// Ordem de gravação: primeiro as tabelas "mãe", depois as que apontam para elas.
const ORDEM = [
  'Entidades_Cadastradas', 'Locais_Atendimento', 'Contatos_Solicitantes', 'Chamados', 'Visitas',
  'Usuarios', 'Sessoes',
  'Fornecedores', 'Cartoes', 'Recorrentes', 'Recebimentos', 'Despesas',
  'Config_Financeiro', 'Conferencias', 'Retiradas', 'Pagamentos_Fatura',
];

// Vínculos que ficam no banco (lado "filho") e a tabela para onde apontam.
const VINCULOS = {
  'Locais_Atendimento.Cliente_Vinculado': 'Entidades_Cadastradas',
  'Contatos_Solicitantes.Entidades_Vinculadas': 'Entidades_Cadastradas',
  'Chamados.Cliente_Ref': 'Entidades_Cadastradas',
  'Visitas.Chamado': 'Chamados',
  'Sessoes.Usuario': 'Usuarios',
  'Recorrentes.Fornecedor_Ref': 'Fornecedores',
  'Despesas.Fornecedor_Ref': 'Fornecedores',
  'Despesas.Recorrente_Ref': 'Recorrentes',
  'Despesas.Servico_Ref': 'Recebimentos',
  'Despesas.Cartao_Ref': 'Cartoes',
  'Pagamentos_Fatura.Cartao_Ref': 'Cartoes',
};

function senhaDoN8n() {
  const txt = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8');
  return txt.match(/^senha do n8n:\s*(\S+)/m)[1];
}

const vazio = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

(async () => {
  // Junta as tabelas de todos os arquivos exportados.
  const dados = {};
  for (const arq of fs.readdirSync(pasta).filter(n => n.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(pasta, arq), 'utf8'));
    for (const [nome, t] of Object.entries(j.tabelas)) dados[nome] = t.registros;
  }
  const faltando = ORDEM.filter(t => !dados[t]);
  if (faltando.length) throw new Error('Faltam no arquivo exportado: ' + faltando.join(', '));

  const db = new Client({ host: 'localhost', port: 5432, database: 'solucoes', user: 'n8n_app', password: senhaDoN8n() });
  await db.connect();

  const colunas = {};
  for (const r of (await db.query(
    "select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' order by ordinal_position")).rows) {
    (colunas[r.table_name] = colunas[r.table_name] || []).push(r);
  }

  const ids = Object.fromEntries(ORDEM.map(t => [t, new Set(dados[t].map(r => r.id))]));
  const avisos = [];
  const ignorados = {};

  function converter(tabela, col, valor) {
    const chaveVinculo = tabela + '.' + col.column_name;
    const destino = VINCULOS[chaveVinculo];
    switch (col.data_type) {
      case 'ARRAY': {
        let lista = Array.isArray(valor) ? valor : (vazio(valor) ? [] : [valor]);
        if (destino) {
          const sumidos = lista.filter(id => !ids[destino].has(id));
          if (sumidos.length) avisos.push(`${chaveVinculo}: vínculo para registro inexistente removido (${sumidos.join(', ')})`);
          lista = lista.filter(id => ids[destino].has(id));
        }
        return lista;
      }
      case 'jsonb': return JSON.stringify(vazio(valor) ? [] : valor);
      case 'boolean': return valor === true;
      case 'integer': return vazio(valor) ? null : Math.round(Number(valor));
      case 'numeric': return vazio(valor) ? null : Number(valor);
      case 'date': return vazio(valor) ? null : String(valor).slice(0, 10);
      case 'timestamp with time zone': return vazio(valor) ? null : valor;
      default: { // text
        if (Array.isArray(valor)) {
          if (valor.length > 1) avisos.push(`${chaveVinculo}: tinha ${valor.length} vínculos, ficou só o primeiro`);
          valor = valor[0];
          if (destino && valor && !ids[destino].has(valor)) {
            avisos.push(`${chaveVinculo}: vínculo para registro inexistente removido (${valor})`);
            valor = null;
          }
        } else if (valor !== null && typeof valor === 'object') {
          valor = JSON.stringify(valor);
        }
        return vazio(valor) ? null : String(valor);
      }
    }
  }

  await db.query('begin');
  try {
    const comDados = [];
    for (const t of ORDEM) if (Number((await db.query(`select count(*) from "${t}"`)).rows[0].count)) comDados.push(t);
    if (comDados.length) {
      if (!substituir) throw new Error('O banco já tem dados em: ' + comDados.join(', ') + '. Nada foi feito.');
      for (const t of [...ORDEM].reverse()) await db.query(`delete from "${t}"`);
    }

    for (const t of ORDEM) {
      const cols = colunas[t];
      const nomesCols = new Set(cols.map(c => c.column_name));
      for (const reg of dados[t]) {
        for (const k of Object.keys(reg.campos)) if (!nomesCols.has(k)) (ignorados[t] = ignorados[t] || new Set()).add(k);
        const valores = cols.map(c => {
          if (c.column_name === 'id') return reg.id;
          if (c.column_name === 'Criado_Em') return reg.criado;
          return converter(t, c, reg.campos[c.column_name]);
        });
        const lista = cols.map(c => `"${c.column_name}"`).join(', ');
        const marcadores = cols.map((_, i) => '$' + (i + 1)).join(', ');
        await db.query(`insert into "${t}" (${lista}) values (${marcadores})`, valores);
      }
    }

    // Conferência: quantidade de registros e, campo a campo, quantos têm valor.
    const problemas = [];
    console.log('Tabela                    Airtable  Banco');
    for (const t of ORDEM) {
      const noBanco = Number((await db.query(`select count(*) from "${t}"`)).rows[0].count);
      console.log(t.padEnd(26) + String(dados[t].length).padStart(8) + String(noBanco).padStart(7) + (noBanco === dados[t].length ? '' : '  <-- DIFERENTE'));
      if (noBanco !== dados[t].length) problemas.push(t + ': quantidade diferente');
      for (const c of colunas[t]) {
        if (c.column_name === 'id' || c.column_name === 'Criado_Em' || c.data_type === 'boolean') continue;
        const esperado = dados[t].filter(r => !vazio(r.campos[c.column_name])).length;
        const sql = c.data_type === 'ARRAY' ? `cardinality("${c.column_name}") > 0`
          : c.data_type === 'jsonb' ? `jsonb_array_length("${c.column_name}") > 0`
          : `"${c.column_name}" is not null`;
        const obtido = Number((await db.query(`select count(*) from "${t}" where ${sql}`)).rows[0].count);
        if (obtido !== esperado) problemas.push(`${t}.${c.column_name}: Airtable ${esperado}, banco ${obtido}`);
      }
    }
    const verdadeiros = async (t, c) => Number((await db.query(`select count(*) from "${t}" where "${c}"`)).rows[0].count);
    for (const t of ORDEM) for (const c of colunas[t].filter(c => c.data_type === 'boolean')) {
      const esperado = dados[t].filter(r => r.campos[c.column_name] === true).length;
      const obtido = await verdadeiros(t, c.column_name);
      if (obtido !== esperado) problemas.push(`${t}.${c.column_name} (marcados): Airtable ${esperado}, banco ${obtido}`);
    }

    console.log('\nCampos do Airtable que não viram coluna (vínculos do lado "mãe" e consultas):');
    for (const [t, s] of Object.entries(ignorados)) console.log('  ' + t + ': ' + [...s].join(', '));
    if (avisos.length) { console.log('\nAvisos:'); for (const a of avisos) console.log('  ' + a); }

    if (problemas.length) {
      console.log('\nPROBLEMAS (nada foi gravado):'); for (const p of problemas) console.log('  ' + p);
      throw new Error('Conferência falhou');
    }
    await db.query('commit');
    console.log('\nImportação concluída e conferida.');
  } catch (e) {
    await db.query('rollback');
    console.error('\nERRO: ' + e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
