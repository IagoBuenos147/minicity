import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import * as N from './nucleo.js'
import {
  cranio, boca, altoDaCopa, noCranio, grade, paineis, doAltoPraBaixo,
} from './chapeus.js'
import { soldarNormais, smoothstep } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/chapeus-extra.js — ancora: head (mesma convencao de
// chapeus.js: origem no CENTRO do cranio, +Z = frente).
//
// CINCO chapeus novos, pensados como peca RARA/ELITE do catalogo — mais
// trabalhados que a media, com um detalhe que o item "normal" da mesma
// familia nao tem. Reaproveita as FERRAMENTAS de chapeus.js (cranio, boca,
// altoDaCopa, noCranio, grade, paineis, doAltoPraBaixo) em vez de reescrever
// a medida do cranio: sao exportadas de la exatamente pra isso (ver o
// comentario "MEDIDA DO CRANIO ATIVO" naquele arquivo).
//
//   cowboy-elite  grade parametrica (a mesma familia do cowboy comum) com aba
//                 de CURVA DUPLA (sobe nas laterais, desce na frente — o
//                 cowboy comum so sobe nas laterais), telescope crown e
//                 costura pontilhada na borda — nenhum dos tres existe no
//                 cowboy comum.
//   gorro-elite   casca de revolucao com NERVURA CRUZADA (duas familias de
//                 rib diagonal que se cruzam = losango de trico trancado,
//                 nao a canelada de familia unica do gorro comum) e barra
//                 dobrada com o AVESSO da dobra visivel. Sem pompom.
//   bone-novo     CINCO gomos (o bone antigo, removido do catalogo por
//                 pedido do dono, era seis) com aba de curvatura dupla de
//                 verdade (a antiga era uma chapa que so caia pra frente) e
//                 um patch redondo em RELEVO (geometria, nao textura de
//                 canvas) na frente.
//   boina         disco de la caido, method NOVO no catalogo de chapeus (nao
//                 e lathe fechado nem casca com nervura: e um perfil
//                 revolvido e DEPOIS deformado por um lobulo assimetrico que
//                 derruba um lado so — e o que faz a boina cair pro lado em
//                 vez de sentar simetrica como um gorro).
//   capacete      casco duro (material de baixa rugosidade, quase laca) com
//                 pala frontal em arco parcial, friso central e duas
//                 entradas de ar — a UNICA peca do catalogo que nao e feita
//                 de pano, couro ou trico.
//
// A REGRA DO OLHO vale pros cinco: nenhum pano por cima do olho abaixo de
// y = 0.136 (tools/diag-chapeu.mjs, coluna panoAcimaDoOlho). O padrao usado
// em chapeus.js pros seis chapeus antigos se repete aqui: yFit mede a
// largura da cabeca na altura ANATOMICA de sempre (pra nao afinar a peca), e
// a variavel que POSICIONA o perfil (yA ou yB) nasce ja alta o bastante —
// diferente dos seis antigos, que nasceram baixos e precisaram de conserto.
// ---------------------------------------------------------------------------

/**
 * NERVURA CRUZADA: duas familias de rib diagonal (uma sobe girando pra +az
 * conforme y cresce, a outra pra -az) deslocando o raio da casca. A crista
 * de cada ponto e o MAIOR das duas cristas — onde elas se cruzam nasce o
 * losango do trico trancado. E a mesma ideia de nervurar() (chapeus.js), so
 * que aquela tem UMA familia (cosseno unico = canelada reta); com duas
 * familias cruzando o padrao vira trancado de verdade.
 */
function nervuraCruzada(geo, n, amp, ky, desde, ate) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const y = p.getY(i)
    const d = Math.hypot(x, z)
    if (d < 1e-5) continue
    const az = Math.atan2(x, z)
    const c1 = Math.cos(n * az + ky * y)
    const c2 = Math.cos(n * az - ky * y)
    const bump = Math.max(c1, c2)
    const f = 1 + amp * bump * smoothstep(desde, ate, y)
    p.setX(i, x * f)
    p.setZ(i, z * f)
  }
  p.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  return geo
}

/** Estrela de N pontas, achatada no plano XY (usada pelo patch do bone-novo). */
function formaEstrela(rOut, rIn, pontas) {
  const forma = new THREE.Shape()
  const n = pontas * 2
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? rOut : rIn
    const x = Math.cos(ang) * r
    const y = Math.sin(ang) * r
    if (i === 0) forma.moveTo(x, y)
    else forma.lineTo(x, y)
  }
  forma.closePath()
  return forma
}

export const CHAPEUS_EXTRA = [
  // -------------------------------------------------------------------------
  // a) COWBOY-ELITE — mesma familia do cowboy comum (grade parametrica), mas
  // com aba de curva dupla, telescope crown e costura pontilhada.
  // -------------------------------------------------------------------------
  {
    id: 'cowboy-elite',
    nome: 'Cowboy Elite',
    metodo: 'grade parametrica (mesma familia do cowboy comum) com aba de CURVA DUPLA (sobe nas laterais e desce na frente — o comum so sobe nas laterais), telescope crown, faixa de couro com fivela de pino em relevo e costura pontilhada na borda da aba',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const cor = 0x4a3420                // feltro escuro: nao e o marrom claro do cowboy comum
      const feltro = N.tecido(cor, 0.90)

      // yFit mede a largura na altura ANTIGA (a do cowboy comum); yA e quem
      // sobe pra tirar a aba de cima da bola do olho (regra: nada por cima
      // do olho abaixo de 0.136 — ver o cabecalho do arquivo).
      const yFit = 0.098
      const yA = 0.134
      const B = boca(K, yFit, 1.09)
      const rb = B.rx
      const kz = B.rz / rb
      const yT = altoDaCopa(K, yA, 0.030, 0.145)
      const hc = yT - yA

      const fundo = Math.max(0, Math.min(hc * 0.20, yT - K.topo - 0.026))
      const copa = grade(30, 11, (u, v, out) => {
        const az = u * Math.PI * 2
        const sa = Math.sin(az)
        const q = 1 - v
        const y0 = yA + hc * q
        const perfil = Math.pow(Math.max(0, 1 - Math.pow(q, 3.0)), 1 / 2.2)
        const base = rb * perfil * (1 + 0.030 * (1 - q))
          * (1 - 0.26 * Math.exp(-Math.pow((q - 0.70) / 0.22, 2)) * sa * sa)
        const s = noCranio(K, y0)
        const x = Math.max(base, s.rx * 1.06) * sa
        const z = Math.max(base * kz, s.rz * 1.06) * Math.cos(az)
        const vinco = Math.exp(-Math.pow(x / (rb * 0.36), 2)) * smoothstep(0.50, 0.95, q)
        // TELESCOPE CROWN: sulco fino e raso na base da copa, dando a volta
        // inteira — o detalhe que separa um cowboy "de verdade" de um balde
        // com aba. Nao concorre com o vinco pelo mesmo orcamento de altura
        // do cranio porque e raso (0.4x o fundo do vinco).
        const telescope = Math.exp(-Math.pow((q - 0.16) / 0.05, 2))
        out.set(x, y0 - fundo * vinco - fundo * telescope * 0.4, z)
      })
      g.add(N.sh(new THREE.Mesh(copa, feltro)))

      // ABA DE CURVA DUPLA: sa*sa ainda levanta os lados (igual ao cowboy
      // comum); o termo NOVO e frenteMask (so ca>0, ou seja so na FRENTE),
      // que puxa a aba pra baixo — a assinatura do chapeu "cattleman", que o
      // cowboy comum nao tem (la a frente fica neutra, nem sobe nem desce).
      const L0 = 0.158
      const ESP = 0.015
      const aba = grade(40, 9, (u, v, out) => {
        const az = u * Math.PI * 2
        const sa = Math.sin(az)
        const ca = Math.cos(az)
        const frenteMask = Math.max(0, ca)
        const s = Math.sin(Math.PI * v)
        const off = Math.cos(Math.PI * v) * ESP * 0.5
        const L = L0 * (1 + 0.14 * Math.cos(2 * az))
        const y = yA - 0.004 - 0.020 * s * s
          + 0.088 * s * s * sa * sa
          - 0.040 * s * s * frenteMask * frenteMask
          + off
        out.set((rb * 1.020 + L * s) * sa, y, (rb * kz * 1.020 + L * s) * Math.cos(az))
      })
      g.add(N.sh(new THREE.Mesh(aba, N.tecido2(N.esc(cor, 0.94), 0.90))))

      // COSTURA PONTILHADA na borda da aba: tracinhos seguindo a MESMA curva
      // da ponta (v = 1, s = 0, off = 0) — o cowboy comum nao tem nenhuma.
      const NPT = 56
      const pontos = N.tecido(N.esc(cor, 1.55), 0.7)
      for (let i = 0; i < NPT; i++) {
        const az = (i / NPT) * Math.PI * 2
        const sa = Math.sin(az)
        const ca = Math.cos(az)
        const frenteMask = Math.max(0, ca)
        const L = L0 * (1 + 0.14 * Math.cos(2 * az))
        const y = yA - 0.004 + 0.088 * sa * sa - 0.040 * frenteMask * frenteMask
        const r = rb * 1.020 + L
        const p = N.caixa(0.008, 0.003, 0.003, pontos)
        p.position.set(r * sa * 0.985, y + 0.001, r * kz * ca * 0.985)
        p.rotation.y = az
        g.add(p)
      }

      // Faixa de couro com fivela — igual em espirito ao cowboy comum, mas
      // com um PINO em relevo cruzando a fivela (o comum e uma chapa lisa).
      const couro = N.couro(0x241811)
      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 1.028, yA + 0.050],
        [rb * 1.048, yA + 0.040],
        [rb * 1.048, yA + 0.016],
        [rb * 1.032, yA + 0.008],
      ], 30, kz), couro)))
      const fivela = N.caixa(0.007, 0.026, 0.022, N.metal(0xd4b866))
      fivela.position.set(rb * 1.03, yA + 0.028, rb * kz * 0.42)
      fivela.rotation.y = 0.72
      g.add(fivela)
      const pino = N.tubo(0.0022, 0.0022, 0.020, N.metal(0xd4b866), 6)
      pino.rotation.z = Math.PI / 2
      pino.position.set(rb * 1.036, yA + 0.028, rb * kz * 0.42)
      pino.rotation.y = 0.72
      g.add(pino)

      g.rotation.x = 0.035
      return g
    },
  },

  // -------------------------------------------------------------------------
  // b) GORRO-ELITE — trico masculino com trancado de verdade (nervura
  // cruzada) e barra dobrada com o avesso visivel. Sem pompom.
  // -------------------------------------------------------------------------
  {
    id: 'gorro-elite',
    nome: 'Gorro Elite',
    metodo: 'casca de revolucao com NERVURA CRUZADA (duas familias de rib diagonal que se cruzam — losango de trico trancado, nao a canelada de familia unica do gorro comum) e barra dobrada GROSSA com o avesso da dobra visivel; sem pompom',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const cor = 0x33382f                // verde-carvao masculino, discreto
      const la = N.tecido(cor, 0.95)
      // avesso do trico: mais claro e mais fosco, e o lado de dentro da la
      const avesso = N.tecido2(N.esc(cor, 1.42), 1.0)

      // yBFit mede a largura na altura ANTIGA (a do gorro comum); yB e quem
      // sobe pra tirar a barra de cima da bola do olho.
      const yBFit = 0.076
      const yB = 0.140
      const yC = yB + 0.016
      const Bb = boca(K, yBFit - 0.010, 1.075)
      const Bc = boca(K, yBFit + 0.016, 1.065)
      const rb = Bb.rx
      const kzB = Bb.rz / rb
      const rc = Bc.rx
      const kzC = Bc.rz / rc
      const yT = altoDaCopa(K, yB, 0.022, 0.070)

      const casca = grade(44, 12, (u, v, out) => {
        const az = u * Math.PI * 2
        const q = Math.cos(v * Math.PI / 2)
        const y = yC + (yT - yC) * q
        const forma = rc * Math.pow(Math.sin(v * Math.PI / 2), 0.90)
        const s = noCranio(K, y)
        out.set(Math.max(forma, s.rx * 1.05) * Math.sin(az), y,
          Math.max(forma * kzC, s.rz * 1.05) * Math.cos(az))
      })
      // NERVURA CRUZADA na casca inteira (a mesma tabela az/y da grade acima,
      // entao o losango do trico acompanha a curva da touca sem distorcer).
      nervuraCruzada(casca, 7, 0.022, 9.5, yC - 0.006, yC + 0.10)
      g.add(N.sh(new THREE.Mesh(casca, la)))

      // BARRA DOBRADA GROSSA: mesma familia da barra do gorro comum (dobra
      // com espessura de verdade, nao anel colado), 40% mais funda — "grossa"
      // — e com a nervura cruzada tambem, mais fraca, atravessando a dobra
      // sem emenda (mesmo truque de nervurar() em chapeus.js).
      const barra = doAltoPraBaixo([
        [rb * 1.000, yB + 0.096],
        [rb * 1.058, yB + 0.086],
        [rb * 1.082, yB + 0.040],
        [rb * 1.074, yB + 0.006],
        [rb * 1.024, yB - 0.010],
        [rb * 0.982, yB + 0.010],
        [rb * 0.970, yB + 0.066],
      ], 44, kzB)
      nervuraCruzada(barra, 7, 0.016, 9.5, yB - 0.20, yB - 0.16)
      g.add(N.sh(new THREE.Mesh(barra, la)))

      // AVESSO VISIVEL: a pontinha da dobra (o ultimo trecho do perfil
      // acima) e o forro que vira pra fora quando a barra se dobra — um
      // segundo anel, um pouco por dentro, num tom mais claro e mais fosco,
      // exatamente nessa faixa. E o detalhe que a barra do gorro comum (uma
      // cor so) nao tem.
      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 0.978, yB + 0.064],
        [rb * 0.992, yB + 0.040],
        [rb * 0.998, yB + 0.014],
        [rb * 0.986, yB + 0.004],
      ], 44, kzB), avesso)))

      return g
    },
  },

  // -------------------------------------------------------------------------
  // c) BONE-NOVO — cinco gomos, aba SO NA FRENTE (140 graus, morre nas
  // laterais) com curva em U, patch redondo em relevo e etiqueta lateral.
  // Substitui o `bone` (removido do catalogo).
  // -------------------------------------------------------------------------
  {
    id: 'bone-novo',
    nome: 'Bone Novo',
    metodo: 'CINCO gomos (paineis independentes, normais nao soldadas = quina de verdade na costura, com costura estreita em cada fronteira) + aba SO NA FRENTE (140 graus de azimute, morre nas laterais) com curva em U de verdade (cai pra frente e pras duas pontas laterais) + botao proud no topo + patch redondo em RELEVO (geometria, nao textura) + etiqueta lateral',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const cor = 0xba7f30                // caramelo/mostarda
      const m = N.tecido(cor, 0.88)
      const escuro = N.tecido(N.esc(cor, 0.70), 0.85)

      // yFit mede a largura na altura ANTIGA (a do bone comum); yB e quem
      // sobe pra tirar a aba de cima da bola do olho.
      const yFit = 0.086
      const yB = 0.138
      const B = boca(K, yFit, 1.10)
      const rb = B.rx
      const kz = B.rz / rb
      const yT = altoDaCopa(K, yB, 0.020, 0.072)

      // raioEm(v): mesma tecnica do bone comum, silhueta = MAXIMO entre a
      // elipse desenhada e o cranio medido. v = 0 na carneira, 1 no topo.
      const raioEm = (v) => {
        const y = yB + (yT - yB) * Math.cos(v * Math.PI / 2)
        const forma = rb * Math.sin(v * Math.PI / 2)
        const s = noCranio(K, y)
        return { y, rx: Math.max(forma, s.rx * 1.06), rz: Math.max(forma * kz, s.rz * 1.06) }
      }

      // CINCO gomos, centrados de proposito: o gomo k fica centrado no
      // azimute k*passo, entao o gomo 0 cai EXATAMENTE na frente (az = 0) —
      // e onde o patch e a costura da frente do bone comum sempre nasceram.
      // Com passo IMPAR (5) isso so funciona centrando cada gomo no proprio
      // eixo em vez de repetir o deslocamento do bone comum (6 gomos, par).
      const GOMOS = 5
      const VAO = 0.030
      const passo = (Math.PI * 2) / GOMOS
      const meiaLarg = (passo - VAO) / 2
      const crown = paineis(GOMOS, 5, 8, (k, u, v, out) => {
        const az = k * passo - meiaLarg + u * (2 * meiaLarg)
        const e = raioEm(v)
        const f = 1 + 0.032 * Math.sin(Math.PI * u) * v
        out.set(e.rx * f * Math.sin(az), e.y, e.rz * f * Math.cos(az))
      })
      g.add(N.sh(new THREE.Mesh(crown, m)))

      // Costuras entre os gomos (mesma tecnica do bone comum).
      const meridiano = []
      let kzCostura = kz
      for (let i = 1; i <= 9; i++) {
        const e = raioEm(i / 9)
        meridiano.push([e.rx * 1.020 + 0.0012, e.y])
        if (e.rz / e.rx > kzCostura) kzCostura = e.rz / e.rx
      }
      // Cada costura fica NA FRONTEIRA entre dois gomos (k*passo + meiaLarg
      // — os paineis nascem CENTRADOS em k*passo, entao a fronteira e meio
      // passo adiante), como uma TIRA ESTREITA de 0.058 rad (~3,3 graus).
      // A versao anterior usava phiLen = 2*meiaLarg (a largura do GOMO
      // inteiro): a "costura" virava uma segunda casca cobrindo quase todo
      // o painel, indistinguivel dele — por isso a quina nao aparecia na
      // foto.
      for (let k = 0; k < GOMOS; k++) {
        const centro = k * passo + meiaLarg
        g.add(N.sh(new THREE.Mesh(
          doAltoPraBaixo(meridiano, 2, kzCostura, centro - 0.029, 0.058),
          escuro,
        )))
      }

      // Botao maior, mais redondo (0.72 em vez de 0.60) e PROUD do apice —
      // antes ficava embutido (yT - 0.002) e quase sumia contra a copa.
      const botao = N.bola(0.023, escuro, 12)
      botao.scale.y = 0.72
      botao.position.y = yT + 0.004
      g.add(botao)

      // ABA SO NA FRENTE: 140 graus de azimute (+-70), morrendo nas
      // laterais — exatamente o ponto da foto de referencia do dono. A
      // versao anterior ia ate +-88,8 graus com um piso de 28% no
      // comprimento em qualquer t, e de frente aquilo lia como aba dando a
      // volta inteira (boonie/safari), nao bone: faltava so 1,2 grau pra
      // fechar em cada lado, e mesmo o que faltava ainda tinha 28% do
      // comprimento. Aqui o comprimento cai a 8% de L0 bem em +-70 graus —
      // o painel lateral (k=1 e k=4) nasce praticamente SEM ABA.
      const ANG = 1.222                    // 70 graus
      const L0 = 0.150
      const ESP = 0.014
      const aba = grade(28, 10, (u, v, out) => {
        const t = u * 2 - 1
        const a = t * ANG
        const s = Math.sin(Math.PI * v)
        const off = Math.cos(Math.PI * v) * ESP * 0.5
        const L = L0 * (0.08 + 0.92 * Math.pow(Math.cos(t * Math.PI / 2), 0.85))
        // CURVA EM U DE VERDADE: a ponta cai pra frente (s*s, como antes) E
        // as DUAS PONTAS LATERAIS da aba caem em relacao ao centro (t*t) —
        // sem nenhuma "calha" cancelando a queda pela metade, que era o que
        // a versao anterior fazia (por isso saia quase reta na foto).
        const y = yB + 0.004 - 0.026 * s * s - 0.060 * t * t * s + off
        out.set((rb * 0.995 + L * s) * Math.sin(a), y, (rb * kz * 0.995 + L * s) * Math.cos(a))
      })
      g.add(N.sh(new THREE.Mesh(aba, N.tecido2(N.esc(cor, 0.88), 0.85))))

      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 1.004, yB + 0.024],
        [rb * 1.032, yB + 0.011],
        [rb * 1.032, yB - 0.011],
        [rb * 0.994, yB - 0.020],
      ], 26, kz), escuro)))

      const fecho = N.caixa(0.054, 0.017, 0.010, escuro)
      fecho.position.set(0, yB + 0.026, -(rb * kz + 0.006))
      g.add(fecho)

      // PATCH REDONDO EM RELEVO, na frente da copa (o gomo 0, ver acima). A
      // posicao sai da MESMA raioEm() da copa, entao cola na casca em vez de
      // flutuar num raio escolhido a olho — o mesmo principio de frenteXZ()
      // em roupa/nucleo.js pro bolso da camisa.
      //
      // "RELEVO, NAO TEXTURA": cada anel do patch (aro, miolo, texto, coroa)
      // e uma PECA solida propria, empilhada em Z crescente — nao ha canvas
      // nenhum aqui, ao contrario de listrasMat/xadrezMat (roupa/nucleo.js).
      const eP = raioEm(0.40)
      const zP = eP.rz * 0.985
      const yP = eP.y
      const RAIO = 0.026
      const aro = N.tubo(RAIO, RAIO, 0.005, N.tecido(0x1c130a, 0.55), 28)
      aro.rotation.x = Math.PI / 2
      aro.position.set(0, yP, zP + 0.0025)
      g.add(aro)
      const miolo = N.tubo(RAIO * 0.72, RAIO * 0.72, 0.004, N.tecido(0x0a0a0a, 0.55), 24)
      miolo.rotation.x = Math.PI / 2
      miolo.position.set(0, yP, zP + 0.0025 + 0.0025 + 0.002)
      g.add(miolo)
      // coroa: tres pontas simples erguidas do miolo (mais legivel que uma
      // estrela nesta escala de patch) — a base fecha o anel, as pontas sobem
      const zCoroa = zP + 0.0025 + 0.004 + 0.0015
      const coroaBase = N.tubo(RAIO * 0.30, RAIO * 0.34, 0.003, N.metal(0xceab52), 16)
      coroaBase.rotation.x = Math.PI / 2
      coroaBase.position.set(0, yP, zCoroa)
      g.add(coroaBase)
      for (const dx of [-1, 0, 1]) {
        const altura = RAIO * (dx === 0 ? 0.62 : 0.42)
        // cone de PE (eixo Y, o padrao dele): a base encosta no anel da
        // coroa e a ponta sobe dali — nao gira, "sobe" tem que ficar em Y
        const ponta = new THREE.Mesh(new THREE.ConeGeometry(RAIO * 0.09, altura, 6), N.metal(0xceab52))
        ponta.position.set(dx * RAIO * 0.22, yP + RAIO * 0.30 + altura / 2, zCoroa)
        g.add(N.sh(ponta))
      }
      // "texto em volta": tracinhos radiais entre o aro e o miolo — sugerem
      // letras sem precisar de fonte 3D (o projeto nao tem TextGeometry).
      const NTXT = 22
      const corTxt = N.tecido(0xe4d9b8, 0.6)
      for (let i = 0; i < NTXT; i++) {
        const ang = (i / NTXT) * Math.PI * 2
        // dois vazios (em cima e embaixo do aro) pra imitar o espaco onde a
        // coroa/estrela central "interrompe" o texto num patch de verdade
        if (Math.abs(Math.sin(ang)) < 0.06) continue
        const r = RAIO * 0.855
        const trc = N.caixa(0.0062, 0.0032, 0.0018, corTxt)
        trc.position.set(r * Math.sin(ang), yP + r * Math.cos(ang), zP + 0.0025 + 0.0016)
        trc.rotation.z = -ang
        g.add(trc)
      }

      // ETIQUETA RETANGULAR PEQUENA NA LATERAL — no gomo vizinho (temporal
      // esquerda), colada na casca do mesmo jeito que o patch.
      const azTag = -passo
      const eT = raioEm(0.30)
      const xT = eT.rx * Math.sin(azTag) * 0.99
      const zT = eT.rz * Math.cos(azTag) * 0.99
      const tag = N.caixa(0.024, 0.013, 0.003, N.tecido(0x241a10, 0.75))
      tag.position.set(xT, eT.y, zT)
      tag.rotation.y = azTag
      g.add(tag)
      const tagMiolo = N.caixa(0.016, 0.007, 0.0015, escuro)
      tagMiolo.position.set(xT + Math.sin(azTag) * 0.0018, eT.y, zT + Math.cos(azTag) * 0.0018)
      tagMiolo.rotation.y = azTag
      g.add(tagMiolo)

      return g
    },
  },

  // -------------------------------------------------------------------------
  // d) BOINA — escolha livre. NAO repete nenhuma silhueta do catalogo: nao e
  // lathe fechado (chapeu/cartola), nem gomos (bone-novo), nem casca com
  // nervura presa ao cranio (gorro/gorro-elite/touca) — e um disco LARGO e
  // MOLE que sobra muito alem da cabeca e cai pra um lado so. Metodo NOVO:
  // perfil revolvido e DEPOIS deformado por um lobulo assimetrico (a mesma
  // ideia de nervurar(), mas de UM lado so em vez de periodica em volta).
  // -------------------------------------------------------------------------
  {
    id: 'boina',
    nome: 'Boina',
    metodo: 'lathe largo (pano sobrando alem do cranio) deformado por um LOBULO ASSIMETRICO que derruba um lado so — o metodo que da a queda de boina de verdade, que nenhum outro chapeu do catalogo usa — mais banda de couro e rabinho no topo',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const cor = 0x5a1f28                 // bordo — nenhum chapeu do catalogo usa esta cor
      const la = N.tecido(cor, 0.93)

      // yFit mede a largura na altura tipica de banda (a mesma area que os
      // outros chapeus usam); yB e a banda de verdade, ja alta o bastante
      // pra nao tampar o olho (regra: nada por cima do olho abaixo de 0.136).
      const yFit = 0.088
      const yB = 0.144
      const B = boca(K, yFit, 1.05)
      const rb = B.rx
      const kz = B.rz / rb
      // a boina e MUITO mais larga que a cabeca: e o pano sobrando que da a
      // queda. 1.9x o raio da banda e o tanto que sobra sem virar sombrinha.
      const rBoina = rb * 1.90
      const yT = altoDaCopa(K, yB, 0.016, 0.048)

      const perfil = [
        [0.0000, yT + 0.006],
        [rBoina * 0.32, yT],
        [rBoina * 0.66, yT - 0.010],
        [rBoina * 0.90, yT - 0.022],
        [rBoina * 1.00, yT - 0.032],        // aba mais larga do pano — ainda bem acima da cabeca
        [rBoina * 0.92, yB + 0.020],        // cai de volta em direcao a cabeca
        [rb * 1.035, yB + 0.008],
        [rb * 1.035, yB - 0.006],           // banda (o couro cobre este trecho)
        [rb * 0.965, yB - 0.002],
        [rb * 0.900, yB + 0.012],           // forro interno
      ]
      const geo = doAltoPraBaixo(perfil, 40, kz)

      // O LOBULO: um lado so cai mais fundo. azCentro aponta pra
      // tras-esquerda (a queda classica de boina militar); a distancia
      // angular (d, corrigida pro intervalo -pi..pi) vira uma gaussiana de
      // UM LOBO SO — nada parecido com nervurar()/nervuraCruzada(), que
      // repetem em volta do eixo inteiro.
      const azCentro = 2.85
      const forca = 0.052
      const r0 = rb * 1.10                  // dentro deste raio (perto da banda) nao cai nada
      {
        const p = geo.attributes.position
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
          const r = Math.hypot(x, z)
          if (r < r0) continue
          let d = Math.atan2(x, z) - azCentro
          while (d > Math.PI) d -= Math.PI * 2
          while (d < -Math.PI) d += Math.PI * 2
          const lobo = Math.exp(-Math.pow(d / 1.05, 2))
          const t = smoothstep(r0, r0 * 1.30, r)
          p.setY(i, y - forca * lobo * t)
        }
        p.needsUpdate = true
        geo.computeVertexNormals()
        soldarNormais(geo)
      }
      g.add(N.sh(new THREE.Mesh(geo, la)))

      // Banda de couro, na mesma carneira do perfil acima.
      const couro = N.couro(0x1c1210)
      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 1.038, yB + 0.012],
        [rb * 1.048, yB + 0.002],
        [rb * 1.048, yB - 0.010],
        [rb * 1.030, yB - 0.016],
      ], 32, kz), couro)))

      // Rabinho: o nozinho de la no topo, deslocado do centro (o topo real
      // de uma boina nunca fecha exatamente no eixo).
      const rabinho = N.bola(0.008, N.tecido(N.esc(cor, 0.85), 0.9), 8)
      rabinho.scale.set(1, 0.7, 1)
      rabinho.position.set(rBoina * 0.06, yT + 0.007, -rBoina * 0.05)
      g.add(rabinho)

      return g
    },
  },

  // -------------------------------------------------------------------------
  // e) CAPACETE — escolha livre. A UNICA peca do catalogo que nao e pano,
  // couro ou trico: casco duro e liso (material de baixa rugosidade, quase
  // laca), pala frontal em arco parcial, friso central e duas entradas de
  // ar. Nenhuma silhueta parecida no resto do catalogo.
  // -------------------------------------------------------------------------
  {
    id: 'capacete',
    nome: 'Capacete',
    metodo: 'casco duro de baixa rugosidade (a unica peca do catalogo que nao e pano/couro/trico) com pala frontal em arco parcial, friso central (cumeeira) montado em segmentos que seguem a curva do casco, duas entradas de ar e estrela extrudada (THREE.Shape) em relevo',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const casca = solid(0x141c24, 0.16, 0.22)      // laca escura, quase sem textura de pano
      const trim = solid(0x74787e, 0.30, 0.55)        // aro/pala/friso em gunmetal

      // yFit mede a largura na altura tipica de banda; yB e a borda de
      // verdade do casco, ja alta o bastante pra nao tampar o olho.
      const yFit = 0.100
      const yB = 0.142
      const B = boca(K, yFit, 1.05)
      const rb = B.rx
      const kz = B.rz / rb
      const yT = altoDaCopa(K, yB, 0.026, 0.078)

      const raioCasco = (v) => {
        const q = Math.cos(v * Math.PI / 2)
        const y = yB + (yT - yB) * q
        const forma = rb * Math.sin(v * Math.PI / 2) * 1.015
        const s = noCranio(K, y)
        return { y, rx: Math.max(forma, s.rx * 1.05), rz: Math.max(forma * kz, s.rz * 1.05) }
      }
      const casco = grade(36, 12, (u, v, out) => {
        const az = u * Math.PI * 2
        const e = raioCasco(v)
        out.set(e.rx * Math.sin(az), e.y, e.rz * Math.cos(az))
      })
      g.add(N.sh(new THREE.Mesh(casco, casca)))

      // Aro de base, contrastando com o casco.
      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 1.020, yB + 0.014],
        [rb * 1.034, yB + 0.004],
        [rb * 1.034, yB - 0.008],
        [rb * 1.016, yB - 0.014],
      ], 32, kz), trim)))

      // PALA FRONTAL: arco parcial (t = u*2-1 varre so um LEQUE na frente,
      // nao a volta inteira) — a mesma tecnica da aba do bone-novo, so que
      // curta e reta feito viseira de capacete, nao aba de chapeu.
      const ANGV = 0.80
      const LV0 = 0.046
      const ESPV = 0.007
      const pala = grade(22, 5, (u, v, out) => {
        const t = u * 2 - 1
        const a = t * ANGV
        const s = Math.sin(Math.PI * v)
        const off = Math.cos(Math.PI * v) * ESPV * 0.5
        const L = LV0 * (1 - 0.18 * t * t)
        const y = yB - 0.006 - 0.008 * s * s + off
        out.set((rb * 1.01 + L * s) * Math.sin(a), y, (rb * kz * 1.01 + L * s) * Math.cos(a))
      })
      g.add(N.sh(new THREE.Mesh(pala, trim)))

      // FRISO CENTRAL (cumeeira): segmentos que seguem a curva do casco na
      // frente E atras (az = 0 e az = pi), empurrados pra fora ao longo do
      // proprio raio — nao e uma tira reta colada por cima, acompanha a
      // curvatura real da copa em cada cranio.
      for (const az of [0, Math.PI]) {
        const sA = Math.sin(az)
        const cA = Math.cos(az)
        const NSEG = 9
        for (let i = 0; i < NSEG; i++) {
          const eA = raioCasco(i / NSEG)
          const eB = raioCasco((i + 1) / NSEG)
          const a = { x: eA.rx * sA, y: eA.y, z: eA.rz * cA }
          const b = { x: eB.rx * sA, y: eB.y, z: eB.rz * cA }
          const dy = b.y - a.y
          const dz = b.z - a.z
          const comp = Math.hypot(dy, dz)
          const seg = N.caixa(0.011, comp * 1.08, 0.009, trim)
          seg.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2 + cA * 0.005)
          seg.rotation.x = Math.atan2(dz, dy)
          g.add(seg)
        }
      }

      // DUAS ENTRADAS DE AR, uma de cada lado.
      for (const sgn of [1, -1]) {
        const az = sgn * 1.25
        const e = raioCasco(0.55)
        const vent = N.bloco(0.026, 0.010, 0.016, 0.004, trim)
        vent.position.set(e.rx * Math.sin(az) * 1.02, e.y, e.rz * Math.cos(az) * 1.02)
        vent.rotation.y = az
        g.add(vent)
      }

      // Estrela extrudada (relevo de verdade, THREE.Shape + ExtrudeGeometry,
      // nao textura) colada no lado direito — o distintivo que marca a peca
      // como elite.
      const estrelaGeo = new THREE.ExtrudeGeometry(formaEstrela(0.0105, 0.0044, 5), {
        depth: 0.003, bevelEnabled: false,
      })
      const eE = raioCasco(0.60)
      const azE = -1.65
      const estrela = new THREE.Mesh(estrelaGeo, N.metal(0xe8e8ec))
      estrela.position.set(eE.rx * Math.sin(azE) * 1.01, eE.y, eE.rz * Math.cos(azE) * 1.01)
      estrela.rotation.y = azE
      g.add(N.sh(estrela))

      return g
    },
  },
]

export default CHAPEUS_EXTRA
