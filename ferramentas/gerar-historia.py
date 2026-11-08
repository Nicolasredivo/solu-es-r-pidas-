# Gera a seção "Do susto ao resolvido" (HTML + SVG da cena).
# Coordenadas do "mundo" da cena: chão (calçada) em y=1000, prédio
# principal de x 700 a 1100 (+ lateral até 1134), 5 andares de 100.
import random, math, sys

R = random.Random(20261108)
ANDARES = (400, 500, 600, 700, 800)        # topo de cada andar (5º ... 1º)
UNIDADES = (708, 918)                      # início de cada apartamento no andar
J = (1056, 667)                            # porca do sifão que vaza (3º andar, direita)


def n(v):
    if isinstance(v, float):
        s = ('%.1f' % v).rstrip('0').rstrip('.')
        return s if s not in ('-0', '') else '0'
    return str(v)


def caixa_arvore(x, k):
    return (x - 50 * k, 862, x + 50 * k, 1004)


def caixa_poste(x):
    return (x - 6, 860, x + 38, 1004)


PREDIO = (688, 290, 1142, 1004)
ARVORES = [(590, 1.0), (1212, 1.05), (1440, .92), (318, .95), (1700, 1.0), (40, .9), (-260, 1.0), (1950, .95)]
POSTES = (640, 1160)
MEDIOS = [  # x, topo, largura, cor da fachada
    (-120, 610, 180, '#cfdbe7'),
    (150, 640, 170, '#d5e0ea'),
    (352, 560, 178, '#cbd8e5'),
    (528, 690, 156, '#c4d3e1'),
    (1150, 520, 172, '#d2deea'),
    (1314, 655, 150, '#c5d3e1'),
    (1466, 600, 166, '#cdd9e5'),
    (1640, 690, 160, '#c7d4e2'),
    (1810, 580, 170, '#d0dce8'),
]


def cruza(x, y, w, h, caixas):
    for (a, b, c, d) in caixas:
        if x < c and x + w > a and y < d and y + h > b:
            return True
    return False


FRENTE = [PREDIO] + [caixa_arvore(x, k) for x, k in ARVORES] + [caixa_poste(x) for x in POSTES]
CAIXAS_MEDIOS = [(x, t, x + w, 1000) for (x, t, w, _) in MEDIOS]

defs, ceu, mundo, noite, sol, raiox, sala = [], [], [], [], [], [], []

# ------------------------------------------------------------------ defs
defs.append('''<linearGradient id="hx-ceu-noite" gradientUnits="userSpaceOnUse" x1="0" y1="-300" x2="0" y2="1000">
  <stop offset="0" stop-color="#1a3f73"/><stop offset=".7" stop-color="#2a568f"/><stop offset="1" stop-color="#3d6ea9"/>
</linearGradient>
<linearGradient id="hx-ceu-dia" gradientUnits="userSpaceOnUse" x1="0" y1="-300" x2="0" y2="1000">
  <stop offset="0" stop-color="#4f9fe0"/><stop offset=".62" stop-color="#a6d4f4"/><stop offset="1" stop-color="#eaf6fd"/>
</linearGradient>
<radialGradient id="hx-aurora" cx=".5" cy="1" r=".62">
  <stop offset="0" stop-color="#ffb176" stop-opacity=".95"/><stop offset=".45" stop-color="#ff8fa3" stop-opacity=".4"/><stop offset="1" stop-color="#ff8fa3" stop-opacity="0"/>
</radialGradient>
<radialGradient id="hx-brilho-quente"><stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
<radialGradient id="hx-brilho-lua"><stop offset="0" stop-color="#f6f1e1" stop-opacity=".38"/><stop offset="1" stop-color="#f6f1e1" stop-opacity="0"/></radialGradient>
<radialGradient id="hx-brilho-sol"><stop offset="0" stop-color="#fff3c8" stop-opacity=".95"/><stop offset=".3" stop-color="#ffd46b" stop-opacity=".5"/><stop offset="1" stop-color="#ffd46b" stop-opacity="0"/></radialGradient>
<radialGradient id="hx-alerta"><stop offset="0" stop-color="#ff6b5a" stop-opacity=".85"/><stop offset="1" stop-color="#ff6b5a" stop-opacity="0"/></radialGradient>
<radialGradient id="hx-luz-teto"><stop offset="0" stop-color="#fff6dc" stop-opacity=".6"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient>
<linearGradient id="hx-vidro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dcf0fc"/><stop offset="1" stop-color="#8dbde3"/></linearGradient>
<linearGradient id="hx-interior" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffdc94"/><stop offset="1" stop-color="#f0a24c"/></linearGradient>
<linearGradient id="hx-interior-frio" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3e8ff"/><stop offset="1" stop-color="#4f9fe0"/></linearGradient>
<linearGradient id="hx-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd98f" stop-opacity=".5"/><stop offset="1" stop-color="#ffd98f" stop-opacity="0"/></linearGradient>
<linearGradient id="hx-farol" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff3c4" stop-opacity=".7"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></linearGradient>
<linearGradient id="hx-caixa" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b6c5d4"/><stop offset=".35" stop-color="#eef3f8"/><stop offset="1" stop-color="#a6b7c8"/></linearGradient>
<linearGradient id="hx-lateral" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bfcedc"/><stop offset="1" stop-color="#d6e0e9"/></linearGradient>
<linearGradient id="hx-espelho" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eaf5fd"/><stop offset="1" stop-color="#9fc3e0"/></linearGradient>
<linearGradient id="hx-scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cd3ff" stop-opacity="0"/><stop offset=".85" stop-color="#7cd3ff" stop-opacity=".42"/><stop offset="1" stop-color="#ffffff" stop-opacity=".95"/></linearGradient>
<pattern id="hx-ripado" width="7" height="80" patternUnits="userSpaceOnUse" x="712" y="912"><rect width="3.2" height="80" fill="#b9845a"/></pattern>
<pattern id="hx-calcada" width="40" height="24" patternUnits="userSpaceOnUse" x="0" y="1000"><path d="M0 0V24" stroke="#cdd4db" stroke-width="1"/></pattern>
<pattern id="hx-faixa" width="64" height="3" patternUnits="userSpaceOnUse" x="0" y="1074"><rect width="32" height="3" fill="#e9eef2"/></pattern>
<pattern id="hx-azulejo" width="10" height="10" patternUnits="userSpaceOnUse" x="926" y="610"><path d="M10 0V10M0 10H10" stroke="#d1e0ec" stroke-width=".6" fill="none"/></pattern>
<pattern id="hx-grade" width="20" height="20" patternUnits="userSpaceOnUse" x="692" y="296"><path d="M20 0V20M0 20H20" stroke="#7cd3ff" stroke-width=".5" opacity=".2" fill="none"/></pattern>
<clipPath id="hx-clip-scan"><rect id="hx-scan-rect" x="680" y="296" width="470" height="0"/></clipPath>''')

# ------------------------------------------------------------------ céu
ceu.append('<rect x="-2000" y="-1600" width="6000" height="2700" fill="url(#hx-ceu-noite)"/>')
ceu.append('<rect class="hx-dia" x="-2000" y="-1600" width="6000" height="2700" fill="url(#hx-ceu-dia)"/>')
ceu.append('<ellipse class="hx-aurora" cx="1150" cy="1000" rx="1500" ry="560" fill="url(#hx-aurora)"/>')


def nuvem(x, y, k):
    return (f'<g transform="translate({x} {y}) scale({k})"><ellipse cx="0" cy="0" rx="74" ry="15"/>'
            '<circle cx="-30" cy="-8" r="20"/><circle cx="2" cy="-18" r="27"/><circle cx="34" cy="-6" r="18"/></g>')


ceu.append('<g class="hx-nuvens" fill="#ffffff">' + ''.join(
    nuvem(*c) for c in [(470, 300, 1.1), (1020, 236, .8), (1390, 420, 1.15), (230, 440, .9), (1660, 330, 1), (-200, 280, 1.1)]) + '</g>')


# ------------------------------------------------------------------ cidade ao fundo
def horizonte(hmin, hmax, wmin, wmax):
    res, x = [], -2000
    while x < 4000:
        w, h = R.randint(wmin, wmax), R.randint(hmin, hmax)
        res.append((x, 1000 - h, w, h))
        x += w + R.randint(-6, 6)
    return res


fundo1 = horizonte(180, 340, 50, 120)
fundo2 = horizonte(90, 220, 40, 100)
mundo.append('<path fill="#c3d5e5" d="' + ''.join(f'M{x} {y}h{w}v{h}h{-w}z' for x, y, w, h in fundo1) + '"/>')
mundo.append('<path stroke="#c3d5e5" stroke-width="2" d="' + ''.join(
    f'M{x + w // 2} {y}v-24' for x, y, w, h in fundo1 if h > 310) + '"/>')
mundo.append('<path fill="#aec4d8" d="' + ''.join(f'M{x} {y}h{w}v{h}h{-w}z' for x, y, w, h in fundo2) + '"/>')

pontos_fundo = []
for fila, frente in ((fundo1, fundo2), (fundo2, [])):
    for x, y, w, h in fila:
        for _ in range(R.randint(0, 3)):
            if w < 18 or h < 70:
                continue
            px, py = x + R.uniform(6, w - 10), y + R.uniform(14, h - 40)
            frente_rects = [(a, b, a + c, b + d) for a, b, c, d in frente]
            if cruza(px, py, 3, 4, FRENTE + CAIXAS_MEDIOS + frente_rects):
                continue
            pontos_fundo.append(f'M{n(round(px, 1))} {n(round(py, 1))}h3v4h-3z')

# ------------------------------------------------------------------ prédios do meio
janelas_medias = []
for k, (x, t, w, cor) in enumerate(MEDIOS):
    h = 1000 - t
    cols, rows = (w - 24) // 28, (h - 64) // 34
    gx, gy = x + 12, t + 18
    defs.append(f'<pattern id="hx-jm-{k}" x="{gx}" y="{gy}" width="28" height="34" patternUnits="userSpaceOnUse">'
                '<rect x="4" y="4" width="18" height="24" rx="1.5" fill="#eef5fb"/><rect x="4" y="4" width="18" height="5" fill="#ffffff" opacity=".7"/></pattern>')
    mundo.append(f'<rect x="{x - 3}" y="{t - 7}" width="{w + 6}" height="8" fill="#b4c5d6"/>'
                 f'<rect x="{x}" y="{t}" width="{w}" height="{h}" fill="{cor}"/>'
                 f'<rect x="{gx}" y="{gy}" width="{cols * 28}" height="{rows * 34}" fill="url(#hx-jm-{k})"/>'
                 f'<rect x="{x + w - 10}" y="{t}" width="10" height="{h}" fill="#0b1e3d" opacity=".06"/>'
                 f'<rect x="{x}" y="962" width="{w}" height="38" fill="#b9c8d6"/>'
                 f'<rect x="{x + w // 2 - 12}" y="972" width="24" height="28" fill="#8ea6bd"/>')
    for i in range(cols):
        for j in range(rows):
            if R.random() < .24:
                wx, wy = gx + 28 * i + 4, gy + 34 * j + 4
                if not cruza(wx, wy, 18, 24, FRENTE):
                    janelas_medias.append((wx, wy, R.random() < .6))

# ------------------------------------------------------------------ prédio principal
P = mundo


def planta(px, by):
    return (f'<rect x="{px - 6}" y="{by - 10}" width="12" height="10" rx="1.5" fill="#c7714a"/>'
            f'<g fill="#3f9b6e"><ellipse cx="{px - 6}" cy="{by - 22}" rx="5" ry="11" transform="rotate(-25 {px - 6} {by - 22})"/>'
            f'<ellipse cx="{px + 6}" cy="{by - 22}" rx="5" ry="11" transform="rotate(25 {px + 6} {by - 22})"/>'
            f'<ellipse cx="{px}" cy="{by - 26}" rx="5" ry="13"/></g><ellipse cx="{px - 1}" cy="{by - 29}" rx="2" ry="7" fill="#5bb383"/>')


PLANTAS = {(400, 918): 1060, (500, 708): 730, (700, 708): 850, (800, 918): 940, (600, 708): 862}

P.append('<polygon points="1100,386 1134,402 1134,1000 1100,1000" fill="url(#hx-lateral)"/>')
for f in ANDARES:
    P.append(f'<path d="M1100 {f + 93}L1134 {f + 96}V{f + 100}L1100 {f + 100}Z" fill="#aebfcf"/>')
P.append('<rect x="700" y="400" width="400" height="500" fill="#eef2f6"/>')
P.append('<rect x="694" y="384" width="412" height="16" rx="2" fill="#dce4ec"/><rect x="694" y="384" width="412" height="3" fill="#ffffff" opacity=".8"/>')
P.append('<rect x="890" y="400" width="20" height="500" fill="#1c4e85"/>')
for f in ANDARES:
    P.append(f'<rect x="895" y="{f + 22}" width="10" height="46" rx="1.5" fill="#8fc4f0" opacity=".55"/>')
for f in ANDARES:
    P.append(f'<rect x="700" y="{f + 93}" width="400" height="7" fill="#d5dee7"/>')
    for ux in UNIDADES:
        wx, wy = ux + 8, f + 12
        P.append(f'<rect x="{wx}" y="{wy}" width="158" height="74" fill="url(#hx-vidro)"/>')
        P.append(f'<path d="M{wx + 18} {wy + 74}L{wx + 48} {wy}H{wx + 64}L{wx + 34} {wy + 74}ZM{wx + 72} {wy + 74}L{wx + 102} {wy}H{wx + 108}L{wx + 78} {wy + 74}Z" fill="#ffffff" opacity=".3"/>')
        P.append(f'<path d="M{wx + 52.7} {wy}V{wy + 74}M{wx + 105.3} {wy}V{wy + 74}" stroke="#f7fafc" stroke-width="2.2"/>')
        P.append(f'<rect x="{wx}" y="{wy}" width="158" height="74" fill="none" stroke="#e2e8ee" stroke-width="2.5"/>')
        if (f, ux) in PLANTAS:
            P.append(planta(PLANTAS[(f, ux)], f + 86))
        P.append(f'<rect x="{ux + 2}" y="{f + 56}" width="170" height="32" fill="#ffffff" opacity=".24"/>')
        P.append(f'<rect x="{ux + 2}" y="{f + 55}" width="170" height="2.6" fill="#cfd9e3"/>')
        P.append(f'<rect x="{ux + 2}" y="{f + 55}" width="2.4" height="33" fill="#cfd9e3"/><rect x="{ux + 169.6}" y="{f + 55}" width="2.4" height="33" fill="#cfd9e3"/>')
        P.append(f'<rect x="{ux - 2}" y="{f + 86}" width="178" height="8" rx="1" fill="#e6ecf2"/>')
        P.append(f'<rect x="{ux - 2}" y="{f + 94}" width="178" height="4" fill="#0b1e3d" opacity=".07"/>')

# térreo
P.append('<rect x="700" y="900" width="400" height="100" fill="#e3e9ef"/>')
P.append('<rect x="712" y="912" width="132" height="80" fill="#8f5e3d"/><rect x="712" y="912" width="132" height="80" fill="url(#hx-ripado)"/>')
P.append('<rect x="956" y="912" width="132" height="80" fill="#8f5e3d"/><rect x="956" y="912" width="132" height="80" fill="url(#hx-ripado)"/>')
P.append('<rect x="856" y="920" width="88" height="80" fill="url(#hx-vidro)"/>')
P.append('<path d="M900 920V1000" stroke="#0b1e3d" stroke-width="2"/><rect x="856" y="920" width="88" height="80" fill="none" stroke="#0b1e3d" stroke-width="2.6"/>')
P.append('<path d="M894 950V970M906 950V970" stroke="#c9d3dc" stroke-width="1.6" stroke-linecap="round"/>')
P.append('<rect x="842" y="905" width="116" height="10" rx="1.5" fill="#0b1e3d"/>')
P.append('<text x="900" y="912.6" text-anchor="middle" font-family="Saira, sans-serif" font-size="5.6" font-weight="700" letter-spacing="1.6" fill="#ffffff">EDIFÍCIO HORIZONTE</text>')
for px in (846, 954):
    P.append(f'<rect x="{px - 7}" y="986" width="14" height="14" rx="1.5" fill="#3b4a5c"/>'
             f'<circle cx="{px}" cy="980" r="8" fill="#3f9b6e"/><circle cx="{px - 3}" cy="976.5" r="4.4" fill="#5bb383"/>')

# telhado: caixa d'água, placas solares, casa de máquinas, antena
P.append('<path d="M778 362V372H884V386" fill="none" stroke="#9fb0c1" stroke-width="3"/>')
P.append('<rect x="752" y="362" width="4" height="24" fill="#9fb0c1"/><rect x="800" y="362" width="4" height="24" fill="#9fb0c1"/>')
P.append('<rect x="746" y="358" width="64" height="6" rx="1" fill="#b9c7d5"/>')
P.append('<rect x="750" y="304" width="56" height="56" rx="5" fill="url(#hx-caixa)"/>')
P.append('<path d="M751 320H805M751 336H805M751 352H805" stroke="#a8b8c8" stroke-width="1.2"/>')
P.append('<ellipse cx="778" cy="304" rx="28" ry="4.5" fill="#dde6ee"/><rect x="770" y="298.5" width="16" height="4" rx="1" fill="#c9d5e1"/>')
for x0 in (826, 870):
    P.append(f'<path d="M{x0} 384L{x0 + 10} 368H{x0 + 42}L{x0 + 32} 384Z" fill="#1f3f6a"/>'
             f'<path d="M{x0 + 5} 376H{x0 + 37}M{x0 + 16} 368L{x0 + 10} 384M{x0 + 27} 368L{x0 + 21} 384" stroke="#4f7db3" stroke-width=".8"/>')
P.append('<rect x="950" y="346" width="80" height="40" fill="#e3e9ef"/><rect x="946" y="341" width="88" height="6" rx="1" fill="#cfd9e3"/>')
P.append('<rect x="994" y="360" width="16" height="26" fill="#c3cfdb"/><path d="M960 356H984M960 361H984M960 366H984" stroke="#c3cfdb" stroke-width="1.6"/>')
P.append('<path d="M1066 386V310M1058 330H1074M1060 346H1072" stroke="#8fa1b3" stroke-width="2"/>')

# calçada e rua
mundo.append('<rect x="-2000" y="1000" width="6000" height="24" fill="#dfe4e9"/><rect x="-2000" y="1000" width="6000" height="24" fill="url(#hx-calcada)"/>')
mundo.append('<rect x="-2000" y="1024" width="6000" height="5" fill="#bac3cc"/><rect x="-2000" y="1029" width="6000" height="96" fill="#4b5664"/>')
mundo.append('<rect x="-2000" y="1074" width="6000" height="3" fill="url(#hx-faixa)"/>')
mundo.append('<rect x="-2000" y="1125" width="6000" height="5" fill="#bac3cc"/><rect x="-2000" y="1130" width="6000" height="30" fill="#dfe4e9"/>')
mundo.append('<rect x="-2000" y="1160" width="6000" height="1900" fill="#b9cdb4"/>')


def arvore(x, k):
    by = 1004
    return (f'<ellipse cx="{x}" cy="{by}" rx="{n(30 * k)}" ry="{n(4 * k)}" fill="#0b1e3d" opacity=".12"/>'
            f'<path d="M{n(x - 3 * k)} {by}L{n(x - 2 * k)} {n(by - 60 * k)}H{n(x + 2 * k)}L{n(x + 3 * k)} {by}Z" fill="#6b4b35"/>'
            f'<g fill="#3c8a5f"><circle cx="{x}" cy="{n(by - 86 * k)}" r="{n(30 * k)}"/><circle cx="{n(x - 24 * k)}" cy="{n(by - 66 * k)}" r="{n(22 * k)}"/>'
            f'<circle cx="{n(x + 25 * k)}" cy="{n(by - 68 * k)}" r="{n(24 * k)}"/><circle cx="{n(x + 4 * k)}" cy="{n(by - 112 * k)}" r="{n(20 * k)}"/></g>'
            f'<g fill="#57a97a"><circle cx="{n(x - 9 * k)}" cy="{n(by - 96 * k)}" r="{n(14 * k)}"/><circle cx="{n(x - 28 * k)}" cy="{n(by - 72 * k)}" r="{n(10 * k)}"/>'
            f'<circle cx="{n(x - 2 * k)}" cy="{n(by - 118 * k)}" r="{n(9 * k)}"/></g>')


for x, k in ARVORES:
    mundo.append(arvore(x, k))
for x in POSTES:
    mundo.append(f'<rect x="{x - 2}" y="880" width="4" height="122" fill="#5d6b7a"/>'
                 f'<path d="M{x} 886Q{x} 874 {x + 12} 874H{x + 24}" fill="none" stroke="#5d6b7a" stroke-width="3"/>'
                 f'<rect x="{x + 20}" y="871" width="16" height="6" rx="2" fill="#3d4855"/><rect x="{x - 4}" y="998" width="8" height="5" rx="1" fill="#4a5664"/>')

# van da Soluções Rápidas (o landing.js move o grupo e gira as rodas)
VAN = ('<g id="hx-van" transform="translate(640 1062)">'
       '<ellipse cx="88" cy="0" rx="84" ry="5" fill="#0b1e3d" opacity=".2"/>'
       '<circle cx="36" cy="-12" r="15" fill="#2a3340"/><circle cx="136" cy="-12" r="15" fill="#2a3340"/>'
       '<path d="M2 -16V-58Q2 -68 12 -68H112Q122 -68 128 -61L150 -38Q153 -35 158 -34L166 -32Q172 -30 172 -24V-16Q172 -11 166 -11H8Q2 -11 2 -16Z" fill="#f7f9fb"/>'
       '<rect x="2" y="-16" width="170" height="5" fill="#dfe5eb"/>'
       '<rect x="2" y="-30" width="164" height="5" fill="#1c4e85"/><rect x="2" y="-25" width="166" height="3" fill="#3e8fd1"/>'
       '<path d="M118 -62H126L146 -40H118Z" fill="#24456e"/><path d="M121 -60H125L131 -53H121Z" fill="#ffffff" opacity=".35"/>'
       '<rect x="96" y="-62" width="18" height="20" rx="2" fill="#24456e"/>'
       '<path d="M93 -66V-14" stroke="#d3dbe3" stroke-width="1"/><rect x="84" y="-46" width="6" height="1.8" rx=".9" fill="#b3bfcb"/>'
       '<image href="imagens/logo.png" x="7" y="-62" width="42" height="26"/>'
       '<text x="52" y="-49" font-family="Saira, sans-serif" font-size="7.4" font-weight="700" fill="#0b1e3d">SOLUÇÕES</text>'
       '<text x="52" y="-41" font-family="Saira, sans-serif" font-size="7.4" font-weight="700" fill="#1c4e85">RÁPIDAS</text>'
       '<text x="52" y="-35.5" font-family="Saira, sans-serif" font-size="3.4" font-weight="600" letter-spacing=".6" fill="#6d7c8d">MANUTENÇÃO PREDIAL</text>'
       '<rect x="166" y="-35" width="6" height="5" rx="1" fill="#ffe9a8"/><rect x="2" y="-40" width="3" height="8" rx="1" fill="#d9534f"/>'
       '<g id="hx-roda-1" transform="translate(36 -12)"><circle r="12.5" fill="#1b2433"/><circle r="6.2" fill="#c9d3dc"/>'
       '<path d="M0 -5.6V5.6M-4.8 -2.8L4.8 2.8M-4.8 2.8L4.8 -2.8" stroke="#7d8a98" stroke-width="1.3"/><circle r="1.8" fill="#5d6b7a"/></g>'
       '<g id="hx-roda-2" transform="translate(136 -12)"><circle r="12.5" fill="#1b2433"/><circle r="6.2" fill="#c9d3dc"/>'
       '<path d="M0 -5.6V5.6M-4.8 -2.8L4.8 2.8M-4.8 2.8L4.8 -2.8" stroke="#7d8a98" stroke-width="1.3"/><circle r="1.8" fill="#5d6b7a"/></g>'
       '</g>')
mundo.append(VAN)

# ------------------------------------------------------------------ noite (por cima do "filtro" escuro)
estrelas, brilhantes = [], []
while len(estrelas) + len(brilhantes) < 64:
    x, y = R.uniform(-300, 2100), R.uniform(-260, 470)
    if 680 < x < 1150 and y > 280:
        continue
    if math.hypot(x - 1150, y - 330) < 70:
        continue
    r = R.choice([.7, .9, 1.1, 1.4])
    if len(brilhantes) < 12 and R.random() < .25:
        brilhantes.append(f'<circle class="hx-brilha" style="animation-delay:{n(round(R.uniform(0, 3), 2))}s" cx="{n(round(x, 1))}" cy="{n(round(y, 1))}" r="{n(r + .3)}"/>')
    else:
        estrelas.append(f'M{n(round(x - r, 1))} {n(round(y, 1))}a{r} {r} 0 1 0 {n(2 * r)} 0a{r} {r} 0 1 0 {n(-2 * r)} 0z')
noite.append('<g fill="#ffffff"><path d="' + ''.join(estrelas) + '" opacity=".85"/>' + ''.join(brilhantes) + '</g>')
noite.append('<circle cx="1150" cy="330" r="80" fill="url(#hx-brilho-lua)"/><circle cx="1150" cy="330" r="21" fill="#f4efe0"/>'
             '<circle cx="1143" cy="325" r="4" fill="#e3dcc8" opacity=".7"/><circle cx="1156" cy="337" r="3" fill="#e3dcc8" opacity=".7"/>'
             '<circle cx="1157" cy="322" r="2" fill="#e3dcc8" opacity=".6"/>')
noite.append('<path fill="#ffd98f" opacity=".7" d="' + ''.join(pontos_fundo) + '"/>')
noite.append('<path fill="#ffd98f" d="' + ''.join(f'M{x} {y}h18v24h-18z' for x, y, forte in janelas_medias if forte) + '"/>')
noite.append('<path fill="#ffc46b" opacity=".72" d="' + ''.join(f'M{x} {y}h18v24h-18z' for x, y, forte in janelas_medias if not forte) + '"/>')

# núcleo (escada) com luz fria
for f in ANDARES:
    noite.append(f'<rect x="895" y="{f + 22}" width="10" height="46" rx="1.5" fill="#bfe6ff" opacity=".8"/>')

ACESAS = {(400, 708): 'sofa', (500, 918): 'tv', (600, 708): 'pessoa', (600, 918): 'abajur', (700, 918): 'sofa', (800, 708): 'pessoa'}


def interior(ux, f, tipo):
    wx, wy = ux + 8, f + 12
    s = []
    if tipo == 'tv':
        s.append(f'<rect class="hx-tv" x="{wx}" y="{wy}" width="158" height="74" fill="url(#hx-interior-frio)"/>')
    else:
        s.append(f'<rect x="{wx}" y="{wy}" width="158" height="74" fill="url(#hx-interior)"/>')
    s.append(f'<rect x="{wx}" y="{wy + 58}" width="158" height="16" fill="#9a5a22" opacity=".3"/>')
    m = '#6e3c17'
    if tipo in ('sofa', 'tv'):
        s.append(f'<rect x="{wx + 20}" y="{wy + 44}" width="62" height="16" rx="5" fill="{m}" opacity=".45"/>'
                 f'<rect x="{wx + 16}" y="{wy + 38}" width="70" height="9" rx="4.5" fill="{m}" opacity=".38"/>')
    if tipo == 'tv':
        s.append(f'<circle cx="{wx + 38}" cy="{wy + 32}" r="5" fill="{m}" opacity=".5"/><circle cx="{wx + 60}" cy="{wy + 33}" r="5" fill="{m}" opacity=".5"/>')
    if tipo in ('sofa', 'abajur'):
        s.append(f'<path d="M{wx + 100} {wy + 60}V{wy + 30}" stroke="{m}" stroke-width="1.6" opacity=".5"/>'
                 f'<path d="M{wx + 92} {wy + 30}H{wx + 108}L{wx + 104} {wy + 20}H{wx + 96}Z" fill="#fff4dc"/>'
                 f'<circle cx="{wx + 100}" cy="{wy + 30}" r="16" fill="#fff4dc" opacity=".25"/>')
    if tipo == 'abajur':
        s.append(f'<rect x="{wx + 18}" y="{wy + 14}" width="34" height="22" rx="1.5" fill="{m}" opacity=".3"/>'
                 f'<rect x="{wx + 30}" y="{wy + 44}" width="44" height="16" rx="2" fill="{m}" opacity=".38"/>')
    if tipo == 'pessoa':
        s.append(f'<rect x="{wx + 20}" y="{wy + 16}" width="30" height="20" rx="1.5" fill="{m}" opacity=".28"/>'
                 f'<g fill="{m}" opacity=".5"><circle cx="{wx + 78}" cy="{wy + 26}" r="6"/>'
                 f'<path d="M{wx + 68} {wy + 60}V{wy + 42}Q{wx + 68} {wy + 33} {wx + 78} {wy + 33}Q{wx + 88} {wy + 33} {wx + 88} {wy + 42}V{wy + 60}Z"/></g>')
    s.append(f'<rect x="{wx + 124}" y="{wy}" width="30" height="74" fill="#fff1d6" opacity=".85"/>'
             f'<path d="M{wx + 131} {wy}V{wy + 74}M{wx + 139} {wy}V{wy + 74}M{wx + 147} {wy}V{wy + 74}" stroke="#e6cb9b" stroke-width="1"/>')
    s.append(f'<path d="M{wx + 52.7} {wy}V{wy + 74}M{wx + 105.3} {wy}V{wy + 74}" stroke="#ffe9c2" stroke-width="2" opacity=".5"/>'
             f'<rect x="{wx}" y="{wy}" width="158" height="74" fill="none" stroke="#2a3f5c" stroke-width="2.5"/>')
    if (f, ux) in PLANTAS:
        s.append(planta(PLANTAS[(f, ux)], f + 86).replace('#3f9b6e', '#2c5a47').replace('#5bb383', '#3b7457').replace('#c7714a', '#6f4a35'))
    s.append(f'<rect x="{ux + 2}" y="{f + 56}" width="170" height="32" fill="#ffffff" opacity=".07"/>'
             f'<rect x="{ux + 2}" y="{f + 55}" width="170" height="2.6" fill="#9fb4c9"/>'
             f'<rect x="{ux + 2}" y="{f + 55}" width="2.4" height="33" fill="#9fb4c9"/><rect x="{ux + 169.6}" y="{f + 55}" width="2.4" height="33" fill="#9fb4c9"/>')
    return ''.join(s)


for (f, ux), tipo in ACESAS.items():
    noite.append(interior(ux, f, tipo))

noite.append('<rect x="856" y="920" width="88" height="80" fill="#ffe2a3" opacity=".92"/>'
             '<path d="M900 920V1000" stroke="#2a3f5c" stroke-width="2"/><rect x="856" y="920" width="88" height="80" fill="none" stroke="#2a3f5c" stroke-width="2.6"/>'
             '<ellipse cx="900" cy="921" rx="48" ry="10" fill="url(#hx-brilho-quente)"/>'
             '<circle cx="985" cy="994" r="16" fill="url(#hx-brilho-quente)"/><circle cx="1045" cy="994" r="16" fill="url(#hx-brilho-quente)"/>')
for x in POSTES:
    noite.append(f'<polygon points="{x + 22},878 {x + 34},878 {x + 70},1026 {x - 14},1026" fill="url(#hx-cone)"/>'
                 f'<circle cx="{x + 28}" cy="878" r="34" fill="url(#hx-brilho-quente)"/><rect x="{x + 22}" y="876.5" width="12" height="2.2" rx="1" fill="#fff3c4"/>')
noite.append('<circle cx="1066" cy="309" r="9" fill="#ff5a5a" opacity=".25" class="hx-pisca"/><circle cx="1066" cy="309" r="2.8" fill="#ff5a5a" class="hx-pisca"/>')

VAN_LUZ = ('<g id="hx-van-luz" transform="translate(640 1062)">'
           '<polygon points="172,-33 340,-50 340,8 172,-28" fill="url(#hx-farol)" opacity=".6"/>'
           '<circle cx="170" cy="-32" r="11" fill="url(#hx-brilho-quente)"/><circle cx="3" cy="-36" r="8" fill="#ff5a5a" opacity=".35"/></g>')

# ------------------------------------------------------------------ sol e pássaros (dia)
sol.append('<g class="hx-sol"><circle cx="1185" cy="300" r="150" fill="url(#hx-brilho-sol)"/><circle cx="1185" cy="300" r="30" fill="#ffd56e"/>'
           '<circle cx="1185" cy="300" r="22" fill="#ffe7a0"/></g>')
sol.append('<g class="hx-passaros" fill="none" stroke="#2b4a6b" stroke-width="1.6" stroke-linecap="round"><g class="hx-voo">'
           '<path d="M520 270q5 -5 10 0q5 -5 10 0"/><path d="M552 252q4 -4 8 0q4 -4 8 0"/><path d="M506 246q4 -4 8 0q4 -4 8 0"/></g></g>')

# ------------------------------------------------------------------ raio-x (revelado pelo scanner)
canos = 'M778 362V372H900V996'
for f in ANDARES:
    canos += f'M900 {f + 67}H732V{f + 80}'
    canos += f'M900 {f + 67}H{J[0]}' if f == 600 else f'M900 {f + 67}H1056V{f + 80}'
elet = 'M880 996V404' + ''.join(f'M880 {f + 36}H760M880 {f + 36}H1040' for f in ANDARES)
raiox.append('<g class="hx-raiox" clip-path="url(#hx-clip-scan)">'
             '<rect x="692" y="296" width="446" height="706" fill="#05183a" opacity=".86"/>'
             '<rect x="692" y="296" width="446" height="706" fill="url(#hx-grade)"/>'
             '<g fill="none" stroke="#7cd3ff" stroke-width="1" opacity=".6">'
             '<rect x="700" y="400" width="400" height="600"/><path d="M1100 386L1134 402V1000M694 384H1106V400"/>'
             + ''.join(f'<path d="M700 {f + 100}H1100"/>' for f in ANDARES) +
             '<path d="M890 400V900M910 400V900"/><rect x="750" y="304" width="56" height="58" rx="5"/>'
             '<rect x="950" y="346" width="80" height="40"/><rect x="856" y="920" width="88" height="80"/></g>'
             f'<path d="{canos}" fill="none" stroke="#7cd3ff" stroke-width="7" opacity=".18" stroke-linecap="round" stroke-linejoin="round"/>'
             f'<path d="{canos}" fill="none" stroke="#a6e3ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
             f'<path d="{elet}" fill="none" stroke="#ffc861" stroke-width="1.5" stroke-dasharray="5 4"/>'
             '<rect x="872" y="958" width="16" height="26" rx="2" fill="none" stroke="#ffc861" stroke-width="1.5"/>'
             '<g fill="#a6e3ff">' + ''.join(f'<circle cx="900" cy="{f + 67}" r="2.6"/>' for f in ANDARES) + '</g>'
             '<text x="712" y="420" font-family="Saira, sans-serif" font-size="9" font-weight="700" letter-spacing="2" fill="#a6e3ff">HIDRÁULICA</text>'
             '<text x="712" y="434" font-family="Saira, sans-serif" font-size="9" font-weight="700" letter-spacing="2" fill="#ffc861">ELÉTRICA</text>'
             '</g>')
raiox.append('<g id="hx-scanner" class="hx-scanner" transform="translate(0 296)">'
             '<rect x="686" y="-46" width="460" height="46" fill="url(#hx-scan)"/>'
             '<path d="M686 0H1146" stroke="#ffffff" stroke-width="1.6"/><circle cx="686" cy="0" r="3" fill="#ffffff"/><circle cx="1146" cy="0" r="3" fill="#ffffff"/></g>')
raiox.append(f'<g class="hx-marcador"><circle class="hx-onda" cx="{J[0]}" cy="{J[1]}" r="12" fill="none" stroke="#ff6b5a" stroke-width="2"/>'
             f'<circle class="hx-onda" style="animation-delay:.8s" cx="{J[0]}" cy="{J[1]}" r="12" fill="none" stroke="#ff6b5a" stroke-width="2"/>'
             f'<circle cx="{J[0]}" cy="{J[1]}" r="5" fill="#ff6b5a"/><circle cx="{J[0]}" cy="{J[1]}" r="1.8" fill="#ffffff"/>'
             f'<path d="M{J[0] + 4} {J[1] - 4}L{J[0] + 16} {J[1] - 20}H{J[0] + 22}" fill="none" stroke="#ff6b5a" stroke-width="1.4"/>'
             f'<rect x="{J[0] + 22}" y="{J[1] - 29}" width="66" height="18" rx="9" fill="#ff6b5a"/>'
             f'<text x="{J[0] + 55}" y="{J[1] - 16.6}" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" font-weight="600" fill="#ffffff">Vazamento</text></g>')
raiox.append('<g class="hx-ok-fachada"><circle class="hx-onda-verde" cx="1005" cy="649" r="13" fill="none" stroke="#1fa855" stroke-width="2"/>'
             '<circle cx="1005" cy="649" r="13" fill="#1fa855" stroke="#ffffff" stroke-width="2.4"/>'
             '<path d="M999 649.5L1003 653.5L1011 645" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></g>')

# ------------------------------------------------------------------ o banheiro (corte do 3º andar)
TRAP = 'M1056 661V670Q1056 677 1063 677Q1070 677 1070 670V668H1084'


def planta_sala(x, y):
    return (f'<rect x="{x - 5}" y="{y - 9}" width="10" height="9" rx="1.5" fill="#c7714a"/>'
            f'<g fill="#3f9b6e"><ellipse cx="{x - 4}" cy="{y - 18}" rx="3.4" ry="8" transform="rotate(-22 {x - 4} {y - 18})"/>'
            f'<ellipse cx="{x + 4}" cy="{y - 18}" rx="3.4" ry="8" transform="rotate(22 {x + 4} {y - 18})"/><ellipse cx="{x}" cy="{y - 21}" rx="3.4" ry="10"/></g>')


MORADORA = ('<g transform="translate(1012 690)">'
            '<path d="M-3.4 -23V-1.5M3.4 -23V-1.5" stroke="#2b3a55" stroke-width="5" stroke-linecap="round"/>'
            '<ellipse cx="-3.8" cy="-.4" rx="4" ry="1.5" fill="#1b2433"/><ellipse cx="4.6" cy="-.4" rx="4" ry="1.5" fill="#1b2433"/>'
            '<path d="M-8.5 -41.5Q-8.5 -45 -5 -45H5Q8.5 -45 8.5 -41.5L7.4 -22.5H-7.4Z" fill="#f08a5d"/>'
            '<path d="M-7.6 -41L-10 -31.5L-8.6 -24.5" fill="none" stroke="#e37a4d" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>'
            '<circle cx="-8.5" cy="-23.6" r="1.8" fill="#e0a982"/>'
            '<rect x="-1.7" y="-48.5" width="3.4" height="4.5" rx="1" fill="#d99a73"/>'
            '<circle cx="0" cy="-52" r="5.4" fill="#e0a982"/>'
            '<path d="M-5.8 -50.6Q-6.6 -58.8 .3 -58.6Q6.6 -58.4 5.9 -51.8Q4.6 -55.4 .4 -55.2Q-3.4 -55 -4.2 -50Q-4.4 -45.6 -6.6 -44.8Q-6.3 -48 -5.8 -50.6Z" fill="#3b2a20"/>'
            '<path d="M7.2 -41L9.8 -33.6L5.2 -35.4" fill="none" stroke="#e37a4d" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>'
            '<rect x="2" y="-40.2" width="3.8" height="6.4" rx=".9" fill="#0b1e3d"/><rect x="2.5" y="-39.6" width="2.8" height="5" rx=".6" fill="#8fd3ff"/>'
            '<circle cx="5" cy="-35.4" r="1.8" fill="#e0a982"/></g>')

TECNICO = ('<g class="hx-tecnico">'
           '<rect x="1024" y="682" width="18" height="8.5" rx="1.4" fill="#1c4e85"/><rect x="1024" y="680.6" width="18" height="2.6" rx="1" fill="#0b1e3d"/>'
           '<path d="M1029 680.6V678.4H1037V680.6" fill="none" stroke="#0b1e3d" stroke-width="1.2"/><rect x="1024" y="685.4" width="18" height="1.4" fill="#3e8fd1"/>'
           '<g transform="translate(1073 689)">'
           '<path d="M8 -20L2.5 -2.5L15.5 -1.5" fill="none" stroke="#163f6e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'
           '<path d="M8 -20L-5.5 -17L-7.5 -2" fill="none" stroke="#1c4e85" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'
           '<ellipse cx="-9" cy="-.6" rx="4.6" ry="1.7" fill="#1b2433"/><ellipse cx="17.5" cy="-1" rx="3.4" ry="1.6" fill="#1b2433"/>'
           '<path d="M9 -19.5L3.5 -38.5" stroke="#1c4e85" stroke-width="13" stroke-linecap="round"/>'
           '<path d="M12 -26L4.6 -28.2" stroke="#7cc8ff" stroke-width="2" stroke-linecap="round"/>'
           '<path d="M5 -36L-1 -27.5L-6.5 -21" fill="none" stroke="#163f6e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
           '<circle cx="-.5" cy="-45.5" r="5.3" fill="#c98b62"/>'
           '<path d="M-6 -46.6Q-5.8 -52.8 .2 -52.8Q5.8 -52.6 5.6 -46.8Z" fill="#0b1e3d"/>'
           '<path d="M-5.6 -47.2L-11 -46.4Q-11.6 -45 -9.8 -44.9L-4.6 -45.6Z" fill="#0b1e3d"/>'
           '<path d="M2.5 -36.5L-5 -27L-10.5 -19" fill="none" stroke="#1c4e85" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>'
           '<circle cx="-11.5" cy="-18" r="2" fill="#c98b62"/>'
           '</g></g>')

CHAVE = ('<g class="hx-chave"><g class="hx-chave-gira">'
         f'<path transform="translate({J[0]} {J[1]}) scale(-.5 .5) translate(-17.5 -6.5)" '
         'd="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" '
         'fill="#cfd8e1" stroke="#5d6b7a" stroke-width="1.4" stroke-linejoin="round"/></g></g>')

sala.append('<g class="hx-sala">')
sala.append('<polygon points="912,600 1098,600 1084,610 926,610" fill="#eef2f5"/>')
sala.append('<polygon points="912,600 926,610 926,681 912,693" fill="#d3e0eb"/>')
sala.append('<polygon points="1098,600 1084,610 1084,681 1098,693" fill="#c8d7e5"/>')
sala.append('<polygon points="926,681 1084,681 1098,693 912,693" fill="#c3cdd7"/>')
sala.append('<path d="M952 681L947 693M978 681L976 693M1005 681V693M1032 681L1034 693M1058 681L1063 693M919 687H1091" stroke="#aeb9c4" stroke-width=".6"/>')
sala.append('<rect x="926" y="610" width="158" height="71" fill="#eef5fb"/><rect x="926" y="610" width="158" height="71" fill="url(#hx-azulejo)"/>')
sala.append('<ellipse cx="1005" cy="628" rx="80" ry="36" fill="url(#hx-luz-teto)"/><rect x="994" y="609.5" width="22" height="2.5" rx="1" fill="#fffbe8"/>')
sala.append('<rect x="934" y="678" width="56" height="4" rx="1" fill="#e3eaf0"/>')
sala.append('<path d="M962 610.5V616Q962 619 965 619H972" fill="none" stroke="#9fb0c1" stroke-width="1.8" stroke-linecap="round"/>'
            '<rect x="970" y="618" width="11" height="3.2" rx="1.6" fill="#8fa1b3"/>')
sala.append('<rect x="936" y="613" width="52" height="65" fill="#d6ecff" opacity=".3" stroke="#b5d3ea" stroke-width="1"/>'
            '<path d="M942 676L956 616M948 676L962 616" stroke="#ffffff" stroke-width="1.2" opacity=".55"/>')
sala.append('<path d="M992 634H1006" stroke="#9fb0c1" stroke-width="1.4" stroke-linecap="round"/>'
            '<rect x="993.5" y="634" width="11" height="22" rx="1.2" fill="#3e8fd1"/><rect x="993.5" y="650" width="11" height="2" fill="#ffffff" opacity=".6"/>')
sala.append('<rect x="1036" y="616" width="40" height="28" rx="3" fill="url(#hx-espelho)" stroke="#c3d1de" stroke-width="1.2"/>'
            '<path d="M1042 642L1053 618H1059L1048 642Z" fill="#ffffff" opacity=".5"/><rect x="1040" y="612.5" width="32" height="2" rx="1" fill="#fff6dc"/>')
sala.append('<path class="hx-mancha" d="M1047 681C1043 671 1050 662 1059 664C1067 657 1081 663 1080 673C1084 678 1079 681 1072 681Z" fill="#7d95aa"/>')
sala.append('<path d="M1034 648H1078Q1078 659 1067 661H1045Q1034 659 1034 648Z" fill="#ffffff" stroke="#cdd8e2" stroke-width="1"/>'
            '<path d="M1034 648H1078" stroke="#e3e9ee" stroke-width="2.2"/>'
            '<path d="M1056 648V642Q1056 639 1059 639H1064" fill="none" stroke="#8fa1b3" stroke-width="2.2" stroke-linecap="round"/>')
sala.append(f'<path d="{TRAP}" fill="none" stroke="#93a5b7" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{TRAP}" fill="none" stroke="#e4eaf0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
            '<rect x="1052" y="664.5" width="8" height="4.5" rx="1" fill="#b8c6d3" stroke="#93a5b7" stroke-width=".6"/>'
            f'<path class="hx-brilho-cano" d="{TRAP}" fill="none" stroke="#7cd3ff" stroke-width="1.3" stroke-linecap="round"/>')
sala.append('<ellipse class="hx-poca" cx="1058" cy="689" rx="20" ry="3.2" fill="#8fd3ff" opacity=".6"/>')
sala.append(f'<g class="hx-vaz"><circle class="hx-alerta-sala" cx="{J[0]}" cy="{J[1]}" r="18" fill="url(#hx-alerta)"/>'
            '<circle class="hx-gota" cx="1056" cy="671" r="1.5" fill="#8fd3ff"/>'
            '<circle class="hx-gota" style="animation-delay:.33s" cx="1056" cy="671" r="1.3" fill="#8fd3ff"/>'
            '<circle class="hx-gota" style="animation-delay:.66s" cx="1056" cy="671" r="1.4" fill="#8fd3ff"/></g>')
sala.append(planta_sala(919, 692))
sala.append(MORADORA)
sala.append(TECNICO)
sala.append(CHAVE)
sala.append(f'<g class="hx-ok-sala"><circle cx="{J[0]}" cy="{J[1]}" r="6.5" fill="#1fa855" stroke="#ffffff" stroke-width="1.4"/>'
            '<path d="M1053 667.2L1055.2 669.4L1059.2 665" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>')
sala.append('<rect x="912" y="600" width="186" height="93" fill="none" stroke="#e7edf2" stroke-width="3.2"/>')
sala.append('</g>')

svg = ('<svg class="historia-svg" id="historia-svg" viewBox="355 210 1100 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
       '<defs>' + ''.join(defs) + '</defs>'
       + ''.join(ceu) + ''.join(mundo)
       + '<rect class="hx-tinta" x="-2000" y="-1600" width="6000" height="4700" fill="#071733"/>'
       + '<g class="hx-noite">' + ''.join(noite) + VAN_LUZ + '</g>'
       + ''.join(sol) + ''.join(raiox) + ''.join(sala) + '</svg>')

ICONE_GOTA = '<svg viewBox="0 0 24 24"><path d="M12 3c3.3 3.8 6 7.4 6 10.6A6 6 0 0 1 6 13.6C6 10.4 8.7 6.8 12 3Z" /></svg>'
ICONE_VAN = '<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /></svg>'
ICONE_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>'

html = f'''  <!-- ===================== História: do susto ao resolvido =====================
       Uma cena só (cidade à noite, o prédio, o banheiro do 3º andar),
       contada pela rolagem: o scanner acha o vazamento, a câmera entra no
       banheiro, a van chega, o técnico conserta, o dia amanhece. A cena é
       gerada por um script (não editar o SVG à mão: coordenadas casadas
       com o roteiro da câmera no landing.js). Sem JS, com "menos movimento"
       ou em tela baixa, vira uma cena parada no final feliz. -->
  <section class="historia" id="historia" aria-labelledby="historia-titulo">
    <div class="historia-palco">
      <div class="historia-tela">
        {svg}

        <div class="historia-avisos" aria-hidden="true">
          <p class="aviso atual">
            <span class="aviso-icone aviso-alerta">{ICONE_GOTA}</span>
            <span class="aviso-corpo"><span class="aviso-app">Soluções Rápidas · agora</span><strong>Chamado aberto</strong>Vazamento no banheiro, 3º andar</span>
          </p>
          <p class="aviso">
            <span class="aviso-icone aviso-agenda">{ICONE_VAN}</span>
            <span class="aviso-corpo"><span class="aviso-app">Soluções Rápidas · agora</span><strong>Visita agendada</strong>Técnico a caminho</span>
          </p>
          <p class="aviso">
            <span class="aviso-icone aviso-ok">{ICONE_OK}</span>
            <span class="aviso-corpo"><span class="aviso-app">Soluções Rápidas · agora</span><strong>Resolvido</strong>Relatório salvo no histórico</span>
          </p>
        </div>

        <div class="historia-painel">
          <p class="historia-rotulo">Na prática</p>
          <h2 class="historia-titulo" id="historia-titulo">Do susto ao <em>resolvido</em>.</h2>

          <ol class="historia-atos">
            <li class="ato atual">
              <p class="ato-passo">O aviso</p>
              <h3>Um pingo hoje vira infiltração amanhã.</h3>
              <p>Você chama no WhatsApp ou abre o chamado no site. Daí pra frente, é com a gente.</p>
            </li>
            <li class="ato">
              <p class="ato-passo">A visita</p>
              <h3>Hora marcada, material certo.</h3>
              <p>O técnico chega no combinado, resolve e entrega o local limpo.</p>
            </li>
            <li class="ato">
              <p class="ato-passo">O resolvido</p>
              <h3>Resolvido. E lembrado.</h3>
              <p>Relatório e nota fiscal ficam no histórico do prédio, e a IA avisa antes do próximo.</p>
            </li>
          </ol>

          <div class="historia-rodape">
            <div class="historia-passos" role="group" aria-label="Ir para um momento da história">
              <span class="historia-trilho" aria-hidden="true"><span class="historia-trilho-cheio"></span></span>
              <button type="button" class="historia-passo atual" data-ir="0">Aviso</button>
              <button type="button" class="historia-passo" data-ir="1">Visita</button>
              <button type="button" class="historia-passo" data-ir="2">Resolvido</button>
            </div>
            <a class="botao historia-cta" href="https://wa.me/554792081047" target="_blank" rel="noopener">
              Abrir um chamado <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>

'''
open(sys.argv[1], 'w', encoding='utf-8', newline='\n').write(html)
print('ok', len(html), 'caracteres;', html.count('<'), 'tags')
