// Lê os dados do documento do veículo (CRLV-e, o PDF da Carteira Digital de
// Trânsito) a partir do texto do PDF, com a posição de cada pedaço de texto.
// No documento, cada dado fica logo ABAIXO do nome dele, na mesma coluna.
// Então: acha o nome ("PLACA", "CHASSI"...) e pega a linha de baixo, entre o
// começo dele e o próximo nome da mesma linha.
//
// Funciona no navegador (window.LerCRLV) e no Node (module.exports), para
// poder ser conferido com o PDF de verdade fora do app.
//
// Entrada: páginas no formato do pdf.js -> [{ largura, altura, itens: [{ str, transform, width, height }] }]
// Saída: { campos: { Placa: "...", ... }, achados: <quantos campos vieram> }
(function (raiz) {
  // Campo do banco -> nomes como aparecem no documento (sem acento, maiúsculo).
  const ROTULOS = {
    Renavam: ["CODIGO RENAVAM", "RENAVAM"],
    Placa: ["PLACA"],
    Exercicio: ["EXERCICIO"],
    Ano_Fabricacao: ["ANO FABRICACAO", "ANO DE FABRICACAO", "ANO FAB"],
    Ano_Modelo: ["ANO MODELO", "ANO MOD"],
    Numero_CRV: ["NUMERO DO CRV", "NUMERO CRV", "N DO CRV"],
    Codigo_Seguranca_CLA: ["CODIGO DE SEGURANCA DO CLA", "CODIGO SEGURANCA CLA", "COD SEGURANCA CLA"],
    CAT: ["CAT"],
    Marca_Modelo: ["MARCA/MODELO/VERSAO", "MARCA/MODELO", "MARCA / MODELO / VERSAO"],
    Especie_Tipo: ["ESPECIE/TIPO", "ESPECIE / TIPO"],
    Placa_Anterior: ["PLACA ANTERIOR/UF", "PLACA ANTERIOR / UF", "PLACA ANTERIOR"],
    Chassi: ["CHASSI"],
    Cor: ["COR PREDOMINANTE", "COR"],
    Combustivel: ["COMBUSTIVEL"],
    Categoria: ["CATEGORIA"],
    Capacidade: ["CAPACIDADE"],
    Potencia_Cilindrada: ["POTENCIA/CILINDRADA", "POTENCIA / CILINDRADA", "POT/CIL"],
    Peso_Bruto_Total: ["PESO BRUTO TOTAL", "PBT"],
    Motor: ["MOTOR", "NUMERO DO MOTOR"],
    CMT: ["CMT"],
    Eixos: ["EIXOS"],
    Lotacao: ["LOTACAO"],
    Carroceria: ["CARROCERIA"],
    Proprietario_Nome: ["NOME"],
    Proprietario_Documento: ["CPF/CNPJ", "CPF / CNPJ"],
    Local: ["LOCAL"],
    Data_Documento: ["DATA"],
    Observacoes: ["OBSERVACOES DO VEICULO", "OBSERVACOES"],
  };

  // Nomes que existem no documento mas não viram campo: servem só para saber
  // onde termina a coluna do vizinho.
  const OUTROS_ROTULOS = ["MENSAGENS SENATRAN", "ASSINATURA", "VIA", "QR CODE"];

  const normal = (s) => String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[º°]/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/[.:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Dado vazio no documento costuma vir como "*****" ou "-".
  const vazio = (s) => !s || /^[\s*\-–_.]*$/.test(s);

  // Junta os pedaços de texto da mesma linha que estão encostados (o pdf.js
  // às vezes quebra "CÓDIGO RENAVAM" em dois pedaços).
  function linhasDaPagina(pagina) {
    const pedacos = (pagina.itens || [])
      .filter((i) => i && typeof i.str === "string" && i.str.trim())
      .map((i) => {
        const t = i.transform || [1, 0, 0, 1, 0, 0];
        const altura = Math.abs(i.height || t[3] || 8) || 8;
        return { str: i.str, x: t[4], y: pagina.altura - t[5], fim: t[4] + (i.width || 0), altura };
      })
      .sort((a, b) => (Math.abs(a.y - b.y) > 1.5 ? a.y - b.y : a.x - b.x));
    const runs = [];
    for (const p of pedacos) {
      const ult = runs[runs.length - 1];
      const mesmaLinha = ult && Math.abs(ult.y - p.y) <= 1.5;
      const encostado = mesmaLinha && p.x - ult.fim < Math.max(2.5, p.altura * 0.6);
      if (encostado) {
        ult.str += (p.x - ult.fim > 0.8 && !/\s$/.test(ult.str) && !/^\s/.test(p.str) ? " " : "") + p.str;
        ult.fim = Math.max(ult.fim, p.fim);
      } else {
        runs.push({ ...p });
      }
    }
    runs.forEach((r) => { r.norm = normal(r.str); });
    return runs;
  }

  function ehRotulo(norm) {
    for (const [campo, nomes] of Object.entries(ROTULOS)) {
      for (const nome of nomes) if (norm === nome) return { campo, nome };
    }
    for (const nome of OUTROS_ROTULOS) if (norm === nome) return { campo: null, nome };
    return null;
  }

  function lerPagina(pagina, campos) {
    const runs = linhasDaPagina(pagina);
    const rotulos = [];
    runs.forEach((r) => {
      const achado = ehRotulo(r.norm);
      if (achado) { r.rotulo = achado; rotulos.push(r); }
    });
    // No documento, o dado começa alinhado à esquerda com o nome dele (diferença
    // de 1 ou 2 pontos). Texto que começa em outro lugar é de outra coluna (o
    // quadro do seguro DPVAT, o "assinado digitalmente"...), mesmo estando perto.
    const ALINHADO = 6;
    for (const rot of rotulos) {
      if (!rot.rotulo.campo || campos[rot.rotulo.campo]) continue;
      // Fim da coluna: o próximo nome à direita, na mesma linha.
      const vizinho = rotulos
        .filter((o) => o !== rot && Math.abs(o.y - rot.y) <= 2 && o.x > rot.x + 1)
        .sort((a, b) => a.x - b.x)[0];
      const limite = vizinho ? vizinho.x - 1 : Infinity;
      // O próximo nome da MESMA coluna encerra o dado deste.
      const proximoRotulo = rotulos
        .filter((o) => o.y > rot.y + 1 && Math.abs(o.x - rot.x) <= ALINHADO)
        .sort((a, b) => a.y - b.y)[0];
      const corte = Math.min(proximoRotulo ? proximoRotulo.y - 0.5 : Infinity, rot.y + Math.max(rot.altura, 5) * 5);
      const abaixo = runs.filter((r) => !r.rotulo && r.y > rot.y + 1 && r.y < corte && r.x < limite);
      const linhas = [];
      abaixo.sort((a, b) => a.y - b.y || a.x - b.x).forEach((r) => {
        const linha = linhas.find((l) => Math.abs(l.y - r.y) <= 1.5);
        if (linha) linha.partes.push(r); else linhas.push({ y: r.y, partes: [r] });
      });
      // Em cada linha, só o trecho que começa alinhado ao nome e segue encostado.
      const trechos = [];
      for (const l of linhas) {
        const partes = l.partes.sort((a, b) => a.x - b.x);
        const i = partes.findIndex((p) => Math.abs(p.x - rot.x) <= ALINHADO);
        if (i < 0) continue;
        const pegar = [partes[i]];
        for (let j = i + 1; j < partes.length && partes[j].x - pegar[pegar.length - 1].fim < 15; j += 1) pegar.push(partes[j]);
        trechos.push(pegar.map((p) => p.str.trim()).join(" "));
      }
      if (!trechos.length) continue;
      // Observações podem ter várias linhas; o resto é uma linha só.
      const usar = rot.rotulo.campo === "Observacoes" ? trechos.slice(0, 4) : trechos.slice(0, 1);
      const texto = usar.join(" ").replace(/\s+/g, " ").trim();
      if (!vazio(texto)) campos[rot.rotulo.campo] = texto;
    }
    return runs;
  }

  // Ajustes finais: formato da placa, só números onde é número.
  function arrumar(campos, textoTodo) {
    const so = (s) => String(s || "").replace(/\s+/g, "");
    if (campos.Placa) campos.Placa = so(campos.Placa).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (campos.Chassi) campos.Chassi = so(campos.Chassi).toUpperCase();
    if (campos.Renavam) campos.Renavam = campos.Renavam.replace(/\D/g, "") || campos.Renavam;
    // Se a posição não deu, tenta pelo formato no texto todo.
    if (!campos.Placa) {
      const m = /\b([A-Z]{3})-?(\d[A-Z0-9]\d{2})\b/.exec(textoTodo);
      if (m) campos.Placa = m[1] + m[2];
    }
    if (!campos.Chassi) {
      const m = /\b([A-HJ-NPR-Z0-9]{17})\b/.exec(textoTodo);
      if (m && /\d/.test(m[1]) && /[A-Z]/.test(m[1])) campos.Chassi = m[1];
    }
    if (!campos.Renavam) {
      const m = /\b(\d{11})\b/.exec(textoTodo);
      if (m) campos.Renavam = m[1];
    }
    for (const k of Object.keys(campos)) campos[k] = String(campos[k]).slice(0, 300);
    return campos;
  }

  function lerCRLV(paginas) {
    const campos = {};
    let textoTodo = "";
    for (const pagina of paginas) {
      const runs = lerPagina(pagina, campos);
      textoTodo += " " + runs.map((r) => r.str).join(" ");
    }
    arrumar(campos, textoTodo.toUpperCase());
    return { campos, achados: Object.keys(campos).length, temTexto: textoTodo.trim().length > 20 };
  }

  // Do PDF (bytes) às páginas no formato acima, usando o pdf.js já carregado.
  async function paginasDoPdf(pdfjs, bytes) {
    const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
    const paginas = [];
    for (let n = 1; n <= Math.min(doc.numPages, 3); n += 1) {
      const pag = await doc.getPage(n);
      const vista = pag.getViewport({ scale: 1 });
      const conteudo = await pag.getTextContent();
      paginas.push({ largura: vista.width, altura: vista.height, itens: conteudo.items });
    }
    await doc.destroy();
    return paginas;
  }

  const api = { lerCRLV, paginasDoPdf, ROTULOS, CAMPOS: Object.keys(ROTULOS) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.LerCRLV = api;
})(typeof window !== "undefined" ? window : globalThis);
