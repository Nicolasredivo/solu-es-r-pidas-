// Compara o que o "Airtable local" devolve com os dados exportados do Airtable de verdade,
// registro por registro e campo por campo (no formato da API pública do Airtable).
// Uso: node banco/testes/comparar-com-airtable.js <pasta com os .json exportados>
const fs = require('fs');
const path = require('path');

const pasta = process.argv[2];
const token = fs.readFileSync('C:/Users/rediv/senha-banco.txt', 'utf8').match(/^token do airtable local:\s*(\S+)/m)[1];

(async () => {
  let problemas = 0, conferidos = 0;
  for (const arq of fs.readdirSync(pasta).filter((n) => n.endsWith('.json'))) {
    const exp = JSON.parse(fs.readFileSync(path.join(pasta, arq), 'utf8'));
    for (const [nome, t] of Object.entries(exp.tabelas)) {
      const tipos = Object.fromEntries(t.campos.map((c) => [c.nome, c.tipo]));
      const r = await fetch(`http://127.0.0.1:5690/v0/${exp.base}/${t.id}?_itens=1`, { headers: { Authorization: 'Bearer ' + token } });
      const locais = await r.json();
      if (!Array.isArray(locais)) { console.log(nome, 'ERRO', JSON.stringify(locais)); problemas++; continue; }
      const porId = Object.fromEntries(locais.map((x) => [x.id, x]));
      if (locais.length !== t.registros.length) { console.log(`${nome}: quantidade ${t.registros.length} x ${locais.length}`); problemas++; }
      for (const reg of t.registros) {
        const loc = porId[reg.id];
        if (!loc) { console.log(`${nome} ${reg.id}: não veio`); problemas++; continue; }
        if (loc.createdTime !== reg.criado) { console.log(`${nome} ${reg.id}: createdTime ${reg.criado} x ${loc.createdTime}`); problemas++; }
        const nomes = new Set([...Object.keys(reg.campos), ...Object.keys(loc.fields)]);
        for (const c of nomes) {
          let a = reg.campos[c];
          const b = loc.fields[c];
          if (tipos[c] === 'lookup') continue; // formato interno diferente; conferido abaixo
          if (tipos[c] === 'date' && typeof a === 'string' && a.endsWith('T00:00:00.000Z') && !String(b).includes('T')) a = a.slice(0, 10);
          if (a === '' || a === false || (Array.isArray(a) && !a.length)) a = undefined;
          const iguais = Array.isArray(a) && Array.isArray(b)
            ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
            : JSON.stringify(a) === JSON.stringify(b);
          conferidos++;
          if (!iguais) { console.log(`${nome} ${reg.id} ${c}: Airtable ${JSON.stringify(a)?.slice(0, 80)} x local ${JSON.stringify(b)?.slice(0, 80)}`); problemas++; }
        }
      }
      // Campos de consulta: conferem com os registros vinculados?
      if (nome === 'Entidades_Cadastradas') {
        for (const x of locais) {
          const esperado = (x.fields.Contatos_Solicitantes || []).length;
          const veio = (x.fields.Contatos_Nomes || []).length;
          if (esperado !== veio) { console.log(`Contatos_Nomes ${x.id}: ${esperado} contatos, ${veio} nomes`); problemas++; }
        }
      }
    }
  }
  console.log(`\n${conferidos} valores conferidos, ${problemas} diferença(s).`);
})();
