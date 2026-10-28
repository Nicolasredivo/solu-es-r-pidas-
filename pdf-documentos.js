// PDFs padrão da Soluções Rápidas: comunicado, laudo, recibo e orçamento.
//
// Cópia fiel, medida por medida, do gerador em Python da skill
// "pdf-solucoes-rapidas" (scripts/gerar_documento.py). O layout é travado
// pelo dono: não mudar visual, textos fixos, cores ou posições sem ele pedir
// -- e, se mudar aqui, mudar lá também, para os dois continuarem iguais.
//
// As contas são as do Python (pontos, origem embaixo à esquerda, como no
// reportlab); só na hora de desenhar o y é virado para o jsPDF, que conta de
// cima. A fonte é a Helvetica padrão dos dois, então as larguras de texto (e
// portanto as quebras de linha) batem.
//
// Uso: DocumentosPdf.gerar(tipo, dados, logos) -> { doc, nomeArquivo }
//   logos = { principal: { img, largura, altura }, selo: { img } }
(function () {
  const CM = 72 / 2.54;
  const W = 595.2755905511812; // A4 em pontos, igual ao reportlab
  const H = 841.8897637795277;
  const NAVY = [0.07, 0.10, 0.18];
  const GRAY = [0.14, 0.16, 0.20];
  const ACCENT = [0.16, 0.36, 0.62];
  const BLACK = [0.10, 0.10, 0.10];
  const RED = [0.80, 0.05, 0.05];
  const WHITE = [1, 1, 1];
  const LEFT_M = 2 * CM;
  const RIGHT_M = 2 * CM;
  const MAX_W = W - LEFT_M - RIGHT_M;

  const RESPONSAVEL_PADRAO = "Cirlei Luis Zomer"; // Luis com S

  const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira",
    "quinta-feira", "sexta-feira", "sábado"];

  const FONTES = {
    "Helvetica": ["helvetica", "normal"],
    "Helvetica-Bold": ["helvetica", "bold"],
    "Helvetica-BoldOblique": ["helvetica", "bolditalic"],
  };

  // ------------------------------------------------------------ utilidades

  // "07/10/2026" -> "07/10/2026 (quarta-feira)". Fora do formato, volta igual.
  // Espaço não-quebrável ( ) entre os dois, como no Python: a data e o
  // dia da semana nunca se separam na quebra de linha.
  function comDiaSemana(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim());
    if (!m) return s;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (d.getMonth() !== Number(m[2]) - 1) return s;
    return `${m[0]} (${DIAS_SEMANA[d.getDay()]})`;
  }

  // "1.234,56" / "1234.56" / "350" / 350 -> número
  function paraNumero(txt) {
    if (typeof txt === "number") return txt;
    let t = String(txt).replace("R$", "").replace(/\s/g, "");
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    return Number(t);
  }

  function reais(v) {
    const [inteiro, centavos] = Math.abs(v).toFixed(2).split(".");
    const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `R$ ${v < 0 ? "-" : ""}${milhar},${centavos}`;
  }

  // "<tipo> <prédio/cliente>" em minúsculas.
  function nomeArquivo(tipo, nomeCliente) {
    const nome = `${tipo} ${String(nomeCliente || "").trim()}`.trim().toLowerCase();
    return nome.replace(/[\\/:*?"<>|]/g, "-") + ".pdf";
  }

  // Quantidade como o Python mostra ("2", "1,5").
  function qtdTexto(q) {
    return String(Number(q.toPrecision(6))).replace(".", ",");
  }

  function criarPagina(logos) {
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: [W, H], compress: true });

    const cor = (c) => c.map((v) => Math.round(v * 255));
    const p = {
      doc,
      fonte(nome, tamanho) {
        const [familia, estilo] = FONTES[nome];
        doc.setFont(familia, estilo);
        doc.setFontSize(tamanho);
      },
      largura(texto, nome, tamanho) {
        const [familia, estilo] = FONTES[nome];
        doc.setFont(familia, estilo);
        return doc.getStringUnitWidth(String(texto)) * tamanho;
      },
      corTexto(c) { doc.setTextColor(...cor(c)); },
      corLinha(c) { doc.setDrawColor(...cor(c)); },
      corFundo(c) { doc.setFillColor(...cor(c)); },
      espessura(e) { doc.setLineWidth(e); },
      texto(s, x, y) { doc.text(String(s), x, H - y); },
      textoCentro(s, x, y) { doc.text(String(s), x, H - y, { align: "center" }); },
      textoDireita(s, x, y) { doc.text(String(s), x, H - y, { align: "right" }); },
      linha(x1, y1, x2, y2) { doc.line(x1, H - y1, x2, H - y2); },
      retangulo(x, y, w, h, contorno, preenche) {
        const estilo = contorno && preenche ? "FD" : preenche ? "F" : "S";
        doc.rect(x, H - y - h, w, h, estilo);
      },
      imagem(img, x, y, w, h) { doc.addImage(img, "JPEG", x, H - y - h, w, h); },
      logos,
    };
    return p;
  }

  function quebrar(p, texto, fonte, tamanho, maxW) {
    const linhas = [];
    let atual = "";
    for (const w of String(texto).split(" ")) {
      const tentativa = (atual + " " + w).trim();
      if (p.largura(tentativa, fonte, tamanho) > maxW && atual) {
        linhas.push(atual);
        atual = w;
      } else {
        atual = tentativa;
      }
    }
    if (atual || !linhas.length) linhas.push(atual);
    return linhas;
  }

  // -------------------------------------------------------- cabeçalho fixo

  // Marca d'água central, bloco da empresa e selo. Devolve o y da base da marca.
  function desenharCabecalho(p) {
    const { img, largura: iw, altura: ih } = p.logos.principal;
    const targetW = W * 0.70;
    const targetH = targetW * ih / iw;
    const x = (W - targetW) / 2;
    const y = H - targetH - 0.5 * CM;
    p.imagem(img, x, y, targetW, targetH);

    const left = 1.5 * CM;
    const top = H - 1.3 * CM;
    const barX = left - 0.28 * CM;
    const linhas = [
      ["SOLUÇÕES RÁPIDAS", "Helvetica-Bold", 11.5, NAVY, 0.54 * CM],
      ["Rua Canelinha, 68 – Bairro São Marcos", "Helvetica-Bold", 8, GRAY, 0.38 * CM],
      ["CEP: 89.214-155 – Joinville/SC", "Helvetica-Bold", 8, GRAY, 0.38 * CM],
      ["CNPJ: 11.338.567/0001-99", "Helvetica-Bold", 8, GRAY, 0.42 * CM],
      ["E-mail: solucoes-rapidas@hotmail.com", "Helvetica-Bold", 8, GRAY, 0.36 * CM],
      ["           adm.solucoes.rapidas@gmail.com", "Helvetica-Bold", 8, GRAY, 0.42 * CM],
      ["Fone: (47) 99667-0900", "Helvetica-Bold", 8, GRAY, 0.36 * CM],
      ["           (47) 99208-1047", "Helvetica-Bold", 8, GRAY, 0],
    ];
    let cy = top;
    for (const [texto, fonte, tamanho, c, passo] of linhas) {
      p.fonte(fonte, tamanho);
      p.corTexto(c);
      p.texto(texto, left, cy);
      cy -= passo;
    }
    p.corLinha(ACCENT);
    p.espessura(1.4);
    p.linha(barX, top + 0.28 * CM, barX, cy + 0.05 * CM);

    const d = 3.8 * CM;
    p.imagem(p.logos.selo.img, W - 1.5 * CM - d, H - 1.0 * CM - d, d, d);
    return y;
  }

  // Rótulo em negrito + valor (quebra linha se não couber). Devolve o y seguinte.
  function campo(p, rotulo, valor, y, { tamanho = 11.5, passo = 0.6 * CM, fonteRotulo = "Helvetica-Bold", fonte = "Helvetica" } = {}) {
    p.fonte(fonteRotulo, tamanho);
    p.corTexto(BLACK);
    p.texto(rotulo, LEFT_M, y);
    const valorX = LEFT_M + p.largura(rotulo, fonteRotulo, tamanho) + 0.25 * CM;
    const maxX = W - RIGHT_M;
    const linhas = [];
    let atual = "";
    for (const w of String(valor || "").split(" ")) {
      const tentativa = (atual + " " + w).trim();
      const limite = !linhas.length ? maxX - valorX : maxX - LEFT_M;
      if (p.largura(tentativa, fonte, tamanho) > limite && atual) {
        linhas.push(atual);
        atual = w;
      } else {
        atual = tentativa;
      }
    }
    if (atual || !linhas.length) linhas.push(atual);
    p.fonte(fonte, tamanho);
    let yy = y;
    linhas.forEach((ln, i) => {
      p.texto(ln, i === 0 ? valorX : LEFT_M, yy);
      yy -= passo;
    });
    return yy;
  }

  // Parágrafo com trechos de cores diferentes: [[texto, cor], ...]. Devolve o y seguinte.
  function paragrafoColorido(p, segmentos, y, { fonte = "Helvetica", tamanho = 11, alturaLinha = 0.56 * CM } = {}) {
    const completo = segmentos.map(([t]) => t).join("");
    const cores = [];
    segmentos.forEach(([t, c]) => { for (let k = 0; k < t.length; k++) cores.push(c); });
    const palavras = [];
    let buf = "", bufCor = null, i = 0;
    while (i < completo.length) {
      const ch = completo[i];
      if (ch === " ") {
        while (i < completo.length && completo[i] === " ") { buf += " "; i++; }
        palavras.push([buf, bufCor || BLACK]);
        buf = ""; bufCor = null;
      } else {
        if (bufCor === null) bufCor = cores[i];
        buf += ch;
        i++;
      }
    }
    if (buf) palavras.push([buf, bufCor || BLACK]);

    const desenharLinha = (ws, yy) => {
      let cx = LEFT_M;
      for (const [w, c] of ws) {
        p.corTexto(c);
        p.texto(w, cx, yy);
        cx += p.largura(w, fonte, tamanho);
      }
    };

    p.fonte(fonte, tamanho);
    let curX = LEFT_M, curY = y, ws = [];
    for (const [w, c] of palavras) {
      const ww = p.largura(w, fonte, tamanho);
      if (curX + ww > LEFT_M + MAX_W && ws.length) {
        p.fonte(fonte, tamanho);
        desenharLinha(ws, curY);
        curY -= alturaLinha;
        curX = LEFT_M;
        ws = [];
      }
      ws.push([w, c]);
      curX += ww;
    }
    if (ws.length) {
      p.fonte(fonte, tamanho);
      desenharLinha(ws, curY);
      curY -= alturaLinha;
    }
    return curY;
  }

  // ----------------------------------------------------------- documentos

  function gerarComunicado(p, a) {
    const y = desenharCabecalho(p);
    p.fonte("Helvetica-Bold", 27);
    p.corTexto(RED);
    const tituloY = y - 4.2 * CM;
    p.textoCentro("COMUNICADO IMPORTANTE!", W / 2, tituloY);
    const data = a.data ? comDiaSemana(a.data) : "__/__/____";
    paragrafoColorido(p, [
      ["Comunicamos que no dia ", BLACK],
      [data + " ", BLACK],
      ["será realizada a limpeza dos reservatórios de água do condomínio, portanto ", BLACK],
      ["haverá falta de água a partir das 8h30.", RED],
      [" Pedimos para que ", BLACK],
      ["não utilizem água após esse horário", RED],
      [" para evitar entrada de ar nas tubulações.", BLACK],
    ], tituloY - 2.3 * CM, { tamanho: 11.5, alturaLinha: 0.62 * CM });
    const kw = { tamanho: 11, passo: 0.5 * CM };
    campo(p, "Solicitante:", a.solicitante, 5.2 * CM, kw);
    campo(p, "Responsável pela execução:", a.responsavel || RESPONSAVEL_PADRAO, 3.85 * CM, kw);
    campo(p, "Endereço:", a.endereco, 2.5 * CM, kw);
    campo(p, "Cliente:", a.cliente, 1.15 * CM, kw);
    return nomeArquivo("comunicado", a.cliente || a.endereco);
  }

  function gerarLaudo(p, a) {
    const y = desenharCabecalho(p);
    const tamanho = 11, alturaLinha = 0.56 * CM, gap = 0.30 * CM;
    p.fonte("Helvetica-Bold", 18);
    p.corTexto(NAVY);
    const tituloY = y - 1.2 * CM;
    p.textoCentro("CERTIFICADO DE LIMPEZA DE CAIXA D'ÁGUA", W / 2, tituloY);

    const data = a.data ? comDiaSemana(a.data) : "__/__/____";
    const edificio = a.edificio || "..............................";
    const endereco = a.endereco || "....................................................................................";
    const opc = { tamanho, alturaLinha };
    let cur = paragrafoColorido(p, [
      ["Informamos que ", BLACK],
      ["foi realizada a limpeza dos reservatórios ", RED],
      ["de água no dia " + data + ", no Edifício " + edificio + ", endereço " + endereco + ", "
        + "a limpeza do reservatório foi realizada em conformidade com o disposto no ", BLACK],
      ["Art. 77 do Decreto Estadual nº 1.846/2018", RED],
      [" de Santa Catarina.", BLACK],
    ], tituloY - 1.0 * CM, opc);
    cur -= gap;
    for (const texto of [
      "As etapas do procedimento seguiram os critérios técnicos definidos pela ABNT NBR 5626:2020, "
        + "incluindo esvaziamento completo, escovação interna com utensílios não abrasivos, aplicação de "
        + "solução clorada, enxágue, inspeção final e reabastecimento com água potável.",
      "Este serviço visa garantir a segurança sanitária da água armazenada, conforme preconizado pelas "
        + "boas práticas da Vigilância Sanitária e pela legislação vigente.",
      "A limpeza foi executada com os produtos homologados e autorizados pela Anvisa, indicados pela "
        + "Vigilância Sanitária, garantindo a segurança e qualidade da água destinada ao consumo.",
    ]) {
      cur = paragrafoColorido(p, [[texto, BLACK]], cur, opc) - gap;
    }
    cur -= gap * 0.6;

    const rotulo = "Responsável pela execução: ";
    p.fonte("Helvetica-Bold", tamanho);
    p.corTexto(BLACK);
    p.texto(rotulo, LEFT_M, cur);
    p.fonte("Helvetica", tamanho);
    p.texto(a.responsavel || RESPONSAVEL_PADRAO, LEFT_M + p.largura(rotulo, "Helvetica-Bold", tamanho), cur);
    cur -= alturaLinha + gap * 1.6;

    cur = paragrafoColorido(p, [["Este laudo serve como comprovação para fins de fiscalização sanitária "
      + "e segurança dos usuários.", BLACK]], cur, opc);
    cur -= gap * 2.2;
    p.fonte("Helvetica-BoldOblique", 12);
    p.corTexto(ACCENT);
    p.textoCentro("Qualidade e compromisso com sua saúde.", W / 2, cur);
    return nomeArquivo("laudo limpeza caixa", a.edificio);
  }

  function gerarRecibo(p, a) {
    const y = desenharCabecalho(p);
    p.fonte("Helvetica-Bold", 22);
    p.corTexto(NAVY);
    const tituloY = y - 1.2 * CM;
    p.textoCentro("RECIBO", W / 2, tituloY);

    let ny = campo(p, "Referente a:", a.referente, tituloY - 1.4 * CM);
    ny = campo(p, "Data:", comDiaSemana(a.data), ny - 0.3 * CM);
    ny = campo(p, "Solicitante:", a.solicitante, ny - 0.3 * CM);
    ny = campo(p, "Cliente:", a.cliente, ny - 0.3 * CM);
    ny = campo(p, "Endereço do serviço prestado:", a.endereco, ny - 0.3 * CM);

    ny -= 0.5 * CM;
    const valor = a.valor ? reais(paraNumero(a.valor)) : "R$ ______________";
    campo(p, "Valor total:", valor, ny);

    ny -= 1.1 * CM;
    p.fonte("Helvetica-Bold", 12.5);
    p.corTexto(NAVY);
    p.texto("DADOS PARA PAGAMENTO", LEFT_M, ny);
    ny -= 0.65 * CM;
    for (const [rotulo, valorFixo] of [
      ["Chave Pix (CNPJ): ", "11.338.567/0001-99"],
      ["Banco: ", "Inter (077)"],
      ["Titular: ", "Cirlei Luis Zomer — CNPJ: 11.338.567/0001-99"],
      ["Agência: ", "0001"],
      ["Conta: ", "43090549-1"],
    ]) {
      p.fonte("Helvetica-Bold", 10.5);
      p.corTexto(BLACK);
      p.texto(rotulo, LEFT_M, ny);
      p.fonte("Helvetica", 10.5);
      p.texto(valorFixo, LEFT_M + p.largura(rotulo, "Helvetica-Bold", 10.5), ny);
      ny -= 0.5 * CM;
    }
    return nomeArquivo("recibo", a.cliente || a.solicitante);
  }

  function gerarOrcamento(p, a) {
    const y = desenharCabecalho(p);
    p.fonte("Helvetica-Bold", 22);
    p.corTexto(NAVY);
    const tituloY = y - 1.2 * CM;
    p.textoCentro("ORÇAMENTO", W / 2, tituloY);

    let ny = campo(p, "Cliente:", a.cliente, tituloY - 1.4 * CM);
    ny = campo(p, "Solicitante:", a.solicitante, ny - 0.3 * CM);
    ny = campo(p, "Endereço:", a.endereco, ny - 0.3 * CM);
    ny = campo(p, "Data:", comDiaSemana(a.data), ny - 0.3 * CM);
    if (!a.semValidade) ny = campo(p, "Validade da proposta:", a.validade || "10 dias", ny - 0.3 * CM);

    const itens = (a.itens || []).map(({ desc, qtd, unit }) => {
      const q = qtd === "" || qtd == null ? 1 : paraNumero(qtd);
      const u = unit === "" || unit == null ? null : paraNumero(unit);
      return [desc, q, u, u === null ? null : q * u];
    });

    const tx = LEFT_M, tw = W - LEFT_M - RIGHT_M;
    const cw = [tw * 0.55, tw * 0.12, tw * 0.165];
    cw.push(tw - cw[0] - cw[1] - cw[2]);
    const colx = [tx, tx + cw[0], tx + cw[0] + cw[1], tx + cw[0] + cw[1] + cw[2]];
    const headerH = 0.8 * CM, rowH = 0.85 * CM;
    const descFonte = "Helvetica", descTamanho = 10;

    // Altura de cada linha (descrição longa quebra em mais linhas).
    const alturas = [], descLinhas = [];
    for (const [desc] of itens) {
      const ls = quebrar(p, desc, descFonte, descTamanho, cw[0] - 0.5 * CM);
      descLinhas.push(ls);
      alturas.push(Math.max(rowH, 0.45 * CM * ls.length + 0.4 * CM));
    }
    let nVazias = Math.max(0, 5 - itens.length);
    const tTop = ny - 0.7 * CM;
    // Textos longos (condições, observações, responsável) empurram a assinatura:
    // tira linhas vazias da tabela até tudo caber, sem mexer em mais nada.
    const rodape = ["Condições de pagamento: " + (a.condicoes || ""), "Observações: " + (a.obs || "")];
    if (a.responsavel) rodape.push("Responsável pela execução: " + a.responsavel);
    const textoH = 1.0 * CM + rodape.reduce((s, t) => s + quebrar(p, t, "Helvetica", 11, MAX_W).length * 0.55 * CM + 0.3 * CM, 0);
    const somaAlturas = () => alturas.reduce((s, h) => s + h, 0);
    while (nVazias > 0 && (tTop - headerH - somaAlturas() - nVazias * rowH - 0.9 * CM - textoH) < 4.2 * CM) nVazias--;
    for (let k = 0; k < nVazias; k++) alturas.push(rowH);

    const tBot = tTop - headerH - somaAlturas();
    p.corLinha(NAVY);
    p.espessura(1.1);
    p.retangulo(tx, tBot, tw, tTop - tBot, true, false);
    p.corFundo(NAVY);
    p.retangulo(tx, tTop - headerH, tw, headerH, false, true);
    p.fonte("Helvetica-Bold", 10);
    p.corTexto(WHITE);
    ["Descrição do serviço/material", "Qtd.", "Valor Unit.", "Valor Total"].forEach((h, i) => {
      if (i === 0) p.texto(h, colx[0] + 0.25 * CM, tTop - headerH + 0.28 * CM);
      else p.textoCentro(h, colx[i] + cw[i] / 2, tTop - headerH + 0.28 * CM);
    });
    p.corLinha(NAVY);
    p.espessura(0.8);
    for (const x of colx.slice(1)) p.linha(x, tBot, x, tTop);

    let ry = tTop - headerH;
    alturas.forEach((alt, idx) => {
      if (idx < itens.length) {
        const [, qtd, unit, tot] = itens[idx];
        const ty = ry - 0.55 * CM;
        p.corTexto(BLACK);
        p.fonte(descFonte, descTamanho);
        descLinhas[idx].forEach((ln, k) => p.texto(ln, colx[0] + 0.25 * CM, ty - k * 0.45 * CM));
        p.textoCentro(qtdTexto(qtd), colx[1] + cw[1] / 2, ty);
        if (unit !== null) {
          p.textoDireita(reais(unit), colx[2] + cw[2] - 0.2 * CM, ty);
          p.textoDireita(reais(tot), colx[3] + cw[3] - 0.2 * CM, ty);
        }
      }
      ry -= alt;
      if (idx < alturas.length - 1) {
        p.corLinha(GRAY);
        p.espessura(0.6);
        p.linha(tx, ry, tx + tw, ry);
      }
    });

    const totY = tBot - 0.9 * CM;
    let total;
    if (a.total) total = reais(paraNumero(a.total));
    else if (itens.length && itens.every((it) => it[3] !== null)) total = reais(itens.reduce((s, it) => s + it[3], 0));
    else total = "R$ ______________";
    campo(p, "Total geral:", total, totY);
    let ny2 = campo(p, "Condições de pagamento:", a.condicoes, totY - 1.0 * CM);
    ny2 = campo(p, "Observações:", a.obs, ny2 - 0.3 * CM);
    if (a.responsavel) ny2 = campo(p, "Responsável pela execução:", a.responsavel, ny2 - 0.3 * CM);

    const sigY = Math.max(ny2 - 2.0 * CM, 2.2 * CM);
    const sigW = 8 * CM;
    p.corLinha(BLACK);
    p.espessura(0.8);
    p.linha((W - sigW) / 2, sigY, (W + sigW) / 2, sigY);
    p.fonte("Helvetica-Bold", 11);
    p.corTexto(BLACK);
    p.textoCentro("Soluções Rápidas", W / 2, sigY - 0.5 * CM);
    p.fonte("Helvetica", 9.5);
    p.corTexto(GRAY);
    p.textoCentro("CNPJ: 11.338.567/0001-99", W / 2, sigY - 0.92 * CM);
    return nomeArquivo("orcamento", a.cliente || a.solicitante);
  }

  const GERADORES = { comunicado: gerarComunicado, laudo: gerarLaudo, recibo: gerarRecibo, orcamento: gerarOrcamento };

  function gerar(tipo, dados, logos) {
    const p = criarPagina(logos);
    const nome = GERADORES[tipo](p, dados);
    return { doc: p.doc, nomeArquivo: nome };
  }

  const api = { gerar, comDiaSemana, paraNumero, reais, RESPONSAVEL_PADRAO };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.DocumentosPdf = api;
})();
