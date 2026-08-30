import * as THREE from 'three'
import { tex } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/render/fumaca.js — FUMACA, EM UMA MALHA SO.
//
// Nasceu pro morador do cortico fumando no sofa, mas nao conhece cigarro
// nenhum: recebe um ponto e uma direcao e solta baforada.
//
// TRES DECISOES, e as tres sao sobre custo:
//
//   1. UMA InstancedMesh, e nao N sprites. Sprite no three e um Mesh com
//      material proprio; vinte deles sao vinte draw calls por baforada. Aqui
//      sao vinte instancias de um quad so — um draw call, e as inativas ficam
//      com escala zero em vez de sair da malha (mexer na contagem por quadro
//      custaria upload de matriz inteiro).
//
//   2. O BILLBOARD E COPIADO DA CAMERA, nao calculado por particula. Todas as
//      baforadas encaram a mesma direcao (a da lente), entao a rotacao e UMA
//      leitura do quaternion da camera por quadro, repetida nas instancias.
//      `lookAt` por particula seria vinte matrizes de rotacao por quadro pra
//      chegar no mesmo resultado.
//
//   3. NAO E ADITIVA. A tentacao e ligar AdditiveBlending porque fica "bonito"
//      — mas aditivo CLAREIA o que esta atras, e fumaca de cigarro num quarto
//      escuro faz o contrario: ela ESCONDE. Com mistura normal e cor cinza a
//      baforada passa na frente da TV e apaga a TV, que e o que ela faz na vida
//      real. Aditiva, a TV brilharia ATRAVES dela.
//
// A textura e um borrao radial desenhado em canvas — mesma regra do resto do
// projeto, nenhum asset externo.
// ---------------------------------------------------------------------------

function fumacaTex() {
  return tex('fumaca-borrao', 64, (g, s) => {
    // O borrao NAO e um gradiente radial limpo: fumaca de verdade tem miolo
    // irregular, e um circulo perfeito le como bolha de sabao. Sao quatro
    // gradientes deslocados, somados.
    g.clearRect(0, 0, s, s)
    const bolhas = [
      [0.50, 0.50, 0.46, 0.55],
      [0.40, 0.44, 0.30, 0.40],
      [0.60, 0.56, 0.26, 0.34],
      [0.46, 0.62, 0.22, 0.28],
    ]
    for (const [cx, cy, r, a] of bolhas) {
      const gr = g.createRadialGradient(cx * s, cy * s, 0, cx * s, cy * s, r * s)
      gr.addColorStop(0, 'rgba(255,255,255,' + a + ')')
      gr.addColorStop(0.45, 'rgba(255,255,255,' + (a * 0.45) + ')')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, s, s)
    }
  })
}

/**
 * @param opts.camera  a camera do jogo (pro billboard)
 * @param opts.n       quantas baforadas vivas ao mesmo tempo (padrao 20)
 * @param opts.cor     tom da fumaca
 */
export function criarFumaca({ camera, n = 20, cor = 0xd8d4cc } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1)
  const mat = new THREE.MeshBasicMaterial({
    map: fumacaTex(),
    color: cor,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    // MeshBasic e nao MeshStandard de proposito: fumaca de cigarro num quarto
    // com uma lampada so nao tem realce especular nem sombreamento util, e
    // Standard poria esta malha na conta de luzes de TODO material da cena.
    fog: true,
  })
  const malha = new THREE.InstancedMesh(geo, mat, n)
  malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  malha.frustumCulled = false
  malha.castShadow = false
  malha.receiveShadow = false
  malha.renderOrder = 4
  // cor por instancia: e ela que faz a baforada SUMIR (alfa vai na cor porque
  // InstancedMesh nao tem opacidade por instancia)
  malha.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
  malha.instanceColor.setUsage(THREE.DynamicDrawUsage)

  const vivas = []
  for (let i = 0; i < n; i++) {
    vivas.push({ ativa: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, dur: 1, r0: 0.02, r1: 0.3, giro: 0 })
  }
  let proxima = 0
  const _d = new THREE.Object3D()
  const _q = new THREE.Quaternion()
  const _c = new THREE.Color()

  function nascer() {
    // fila circular: a baforada mais velha cede o lugar. Sem isso, fumar por
    // dez minutos precisaria de uma lista que cresce.
    const p = vivas[proxima]
    proxima = (proxima + 1) % n
    return p
  }

  const api = {
    grupo: malha,

    /**
     * Uma baforada.
     * @param pos    THREE.Vector3, em coordenadas de MUNDO
     * @param dir    pra onde ela sai (normalizado ou nao)
     * @param forca  0.3 = fiapo do cigarro aceso; 1 = tragada solta pela boca
     */
    soprar(pos, dir, forca = 1) {
      const f = Math.max(0.15, forca)
      const quantas = f > 0.6 ? 4 : 1
      for (let k = 0; k < quantas; k++) {
        const p = nascer()
        p.ativa = true
        p.t = 0
        p.dur = (1.9 + Math.random() * 1.5) * (0.6 + f * 0.6)
        p.x = pos.x + (Math.random() - 0.5) * 0.02
        p.y = pos.y + (Math.random() - 0.5) * 0.02
        p.z = pos.z + (Math.random() - 0.5) * 0.02
        const esp = 0.22 * f
        p.vx = (dir ? dir.x : 0) * 0.42 * f + (Math.random() - 0.5) * esp
        p.vy = (dir ? dir.y : 0) * 0.30 * f + 0.10 + Math.random() * 0.08
        p.vz = (dir ? dir.z : 0) * 0.42 * f + (Math.random() - 0.5) * esp
        p.r0 = 0.018 + Math.random() * 0.02
        p.r1 = (0.20 + Math.random() * 0.22) * (0.5 + f * 0.7)
        p.giro = (Math.random() - 0.5) * 0.9
      }
    },

    atualizar(dt) {
      const d = Math.min(dt || 0, 0.06)
      if (camera) camera.getWorldQuaternion(_q)
      let alguma = false
      for (let i = 0; i < n; i++) {
        const p = vivas[i]
        if (!p.ativa) {
          _d.position.set(0, -999, 0)
          _d.scale.setScalar(0.0001)
          _d.quaternion.identity()
          _d.updateMatrix()
          malha.setMatrixAt(i, _d.matrix)
          continue
        }
        alguma = true
        p.t += d
        const k = p.t / p.dur
        if (k >= 1) {
          p.ativa = false
          _d.position.set(0, -999, 0)
          _d.scale.setScalar(0.0001)
          _d.updateMatrix()
          malha.setMatrixAt(i, _d.matrix)
          continue
        }
        // o ar segura a baforada: a velocidade cai, mas a subida por conveccao
        // ganha forca enquanto ela esquenta o ar em volta
        const arrasto = Math.exp(-1.6 * d)
        p.vx *= arrasto
        p.vz *= arrasto
        p.vy = p.vy * arrasto + 0.16 * d
        p.x += p.vx * d
        p.y += p.vy * d
        p.z += p.vz * d

        const r = p.r0 + (p.r1 - p.r0) * Math.pow(k, 0.6)
        // some cedo: fumaca que vive ate o fim com alfa alto vira nuvem de
        // vapor. O pico e no primeiro quinto e depois e so desaparecer.
        const a = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.42
        _d.position.set(p.x, p.y, p.z)
        _d.quaternion.copy(_q)
        _d.rotateZ(p.giro * p.t)
        _d.scale.set(r, r, r)
        _d.updateMatrix()
        malha.setMatrixAt(i, _d.matrix)
        _c.setScalar(Math.max(0, a))
        malha.setColorAt(i, _c)
      }
      malha.instanceMatrix.needsUpdate = true
      if (malha.instanceColor) malha.instanceColor.needsUpdate = true
      malha.visible = alguma
    },

    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }

  // arranca invisivel: sem isso as N instancias aparecem empilhadas na origem
  api.atualizar(0)
  return api
}

export default criarFumaca
