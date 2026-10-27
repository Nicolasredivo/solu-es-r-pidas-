// Testa o caminho de um anexo: sobe pelo Airtable local, aparece no Listar chamados com
// endereço completo e abre pelo webhook "anexo" (como a foto abriria no celular).
// Uso: node banco/testes/testar-anexos.js
const fs = require('fs');
const t = require('./comum');
const { CAD, local, chamar, confere } = t;

(async () => {
  const inicio = new Date().toISOString();
  const antes = await t.contarTudo();
  let ent, ch, attId;
  await t.entrarComUsuarioDeTeste();
  try {
    ent = await local('POST', `/v0/${CAD}/Entidades_Cadastradas`, { fields: { Razao_Social_Nome: 'TESTE MIGRACAO anexo' } });
    ch = await local('POST', `/v0/${CAD}/Chamados`, { fields: { Numero_Chamado: 999999, Cliente_Ref: [ent.id], Cliente_Nome: 'TESTE MIGRACAO anexo', Status: 'Agendado', Descricao_Solicitacao: 'TESTE MIGRACAO anexo' } });
    const bytes = Buffer.from('foto de teste ' + Date.now());
    const up = await local('POST', `/v0/${CAD}/${ch.id}/Anexos/uploadAttachment`, { contentType: 'image/jpeg', file: bytes.toString('base64'), filename: 'foto teste.jpg' });
    attId = up.fields && up.fields.Anexos && up.fields.Anexos[0].id;
    confere('anexo sobe pelo Airtable local', /^att[0-9a-f]{32}$/.test(attId || ''), up);

    // como o celular chega pelo túnel: o Cloudflare manda o endereço público nesses cabeçalhos
    const r = await fetch('http://localhost:5678/webhook/listar-chamados', {
      method: 'POST',
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'exemplo.trycloudflare.com' },
      body: new URLSearchParams({ tokenAcesso: t.sessao.tokenAcesso }),
    });
    const lista = await r.json();
    const meu = [...(lista.semData || []), ...(lista.comData || [])].find((c) => c.id === ch.id);
    const url = meu && meu.anexos[0] && meu.anexos[0].url;
    confere('Listar chamados manda o endereço completo do anexo', url === 'https://exemplo.trycloudflare.com/webhook/anexo?id=' + attId, { url });

    const baixado = await fetch('http://localhost:5678/webhook/anexo?id=' + attId);
    const corpo = Buffer.from(await baixado.arrayBuffer());
    confere('anexo abre pelo webhook, igualzinho', baixado.status === 200 && corpo.equals(bytes) && /image\/jpeg/.test(baixado.headers.get('content-type') || ''), { status: baixado.status, tipo: baixado.headers.get('content-type'), n: corpo.length });
    confere('anexo vem com proteção nosniff', baixado.headers.get('x-content-type-options') === 'nosniff');

    // Página da web disfarçada de anexo não pode abrir na tela (rodaria no endereço do n8n).
    const html = Buffer.from('<script>alert(1)</script>');
    const up2 = await local('POST', `/v0/${CAD}/${ch.id}/Anexos/uploadAttachment`, { contentType: 'text/html', file: html.toString('base64'), filename: 'pagina.html' });
    const htmlId = up2.fields.Anexos.find((a) => a.filename === 'pagina.html').id;
    const pagina = await fetch('http://localhost:5678/webhook/anexo?id=' + htmlId);
    confere('anexo HTML vai como download, nunca como página', pagina.status === 200 && !/html/i.test(pagina.headers.get('content-type') || '') && pagina.headers.get('x-content-type-options') === 'nosniff', { tipo: pagina.headers.get('content-type') });
    for (const ext of ['', '.json']) fs.rmSync('C:/Users/rediv/banco-solucoes/anexos/' + htmlId + ext, { force: true });

    const inventado = await fetch('http://localhost:5678/webhook/anexo?id=att' + '0'.repeat(32));
    confere('código inventado não abre nada (resposta do próprio fluxo)', inventado.status === 404 && (await inventado.text()) === 'Anexo não encontrado.');
    const torto = await fetch('http://localhost:5678/webhook/anexo?id=' + encodeURIComponent('../../senha-banco.txt'));
    confere('código fora do formato não abre nada (resposta do próprio fluxo)', torto.status === 404 && (await torto.text()) === 'Anexo não encontrado.');
  } finally {
    if (ch) await local('DELETE', `/v0/${CAD}/Chamados/${ch.id}`);
    if (ent) await local('DELETE', `/v0/${CAD}/Entidades_Cadastradas/${ent.id}`);
    if (attId) for (const ext of ['', '.json']) fs.rmSync('C:/Users/rediv/banco-solucoes/anexos/' + attId + ext, { force: true });
    await t.sairEApagarUsuarioDeTeste();
    await t.esperar(1000);
    confere('quantidades voltaram ao que eram', JSON.stringify(antes) === JSON.stringify(await t.contarTudo()));
    const erros = await t.errosDesde(inicio);
    confere('n8n sem execuções com erro (fora os 404 de propósito)', erros.length === 0, erros);
    const p = t.placar();
    console.log(`\n${p.ok} ok, ${p.falhas} falha(s).`);
    process.exitCode = p.falhas ? 1 : 0;
  }
})();
