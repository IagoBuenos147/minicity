import * as THREE from 'three'
import { mergeGeometries } from '../world/bake.js'

// ---------------------------------------------------------------------------
// "Forno" de PERSONAGEM: funde, DENTRO DE CADA JUNTA, os meshes que sao
// rigidos em relacao a ela.
//
// Por que isso existe: cada boneco e uma arvore de juntas e cada junta carrega
// um punhado de meshes soltos (olho, pupila, palpebra, nariz, boca, cabelo,
// blusa, calca...). Sao ~85 draw calls por NPC. Como esses meshes NAO se mexem
// em relacao a junta que os segura, da pra colar todos num mesh so por
// material: a junta continua girando, o esqueleto continua igual e a animacao
// nao percebe diferenca.
//
// Diferenca para world/bake.js (bakeStatic): la a subarvore inteira vira um
// grupo chapado, aqui a HIERARQUIA DE JUNTAS E PRESERVADA — so o que esta
// pendurado em cada junta e que e colado. Por isso o forno de personagem e um
// arquivo proprio e nao um modo do bake.
//
// So vale para NPC de aparencia FIXA. Depois de congelar, os meshes das pecas
// nao moram mais dentro dos slots, entao setAppearance/clearSlot nao conseguem
// mais desmontar o que foi fundido — o jogador (que troca de roupa no
// customizador) nunca pode passar por aqui.
//
// CUIDADO COM GEOMETRIA COMPARTILHADA. O forno NUNCA toca na geometria de um
// mesh: ele clona, assa o clone e larga a original de lado. E que boa parte
// delas e reaproveitada e continua sendo desenhada por outro boneco:
//   - GEO_MAO (character.js): a mao com dedos e feita UMA vez pro modulo
//     inteiro e usada pelas duas maos de TODO personagem — jogador, os 4 NPCs,
//     o zumbi, os avatares remotos. Nem o character.dispose() mexe nela.
//   - por personagem, mas dividida entre varios meshes dele: earGeo (2
//     orelhas), upperArm/foreArm/elbow (2 bracos), thigh/shin/knee (2 pernas),
//     pe/dedao (2 pes). Dono: o character.dispose() daquele boneco.
//   - os materiais vem todos do cache de materials.js e sao globais.
// Dar dispose em qualquer uma delas aqui apagaria a mao (ou a orelha, ou a
// perna) de todo mundo que ainda esta na cena. Por isso o unico dispose deste
// arquivo e o dos clones descartaveis, la embaixo.
// ---------------------------------------------------------------------------

/** Marcas que dizem "alguem anima este no": nunca fundir por cima delas. */
function marcado(o) {
  const u = o.userData
  if (!u) return false
  if (u.anima || u.dynamic || u.noBake) return true
  return typeof u.update === 'function' || typeof u.setPhase === 'function'
}

/** Aceita array, Set ou o objeto `character.parts` (nome -> Object3D). */
function conjuntoDeJuntas(v) {
  if (!v) return null
  if (v instanceof Set) return v
  const s = new Set()
  if (Array.isArray(v)) { for (const o of v) if (o && o.isObject3D) s.add(o) }
  else for (const k in v) { const o = v[k]; if (o && o.isObject3D) s.add(o) }
  return s.size ? s : null
}

/**
 * Dois materiais que so diferem na COR podem virar um material so com
 * vertexColors: a cor de cada vertice multiplica a cor base, entao pintando a
 * base de branco o resultado e pixel a pixel identico. Rugosidade, metalness e
 * emissivo NAO cabem no vertice, entao entram na chave. Material com textura
 * ou transparencia fica fora: a ordem de desenho e o UV dele sao dele.
 */
function chaveMaterial(m, corPorVertice) {
  if (!m) return 'nulo'
  if (!corPorVertice || !m.isMeshStandardMaterial) return m.uuid
  if (m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.alphaMap
    || m.emissiveMap || m.aoMap || m.bumpMap || m.displacementMap
    || m.lightMap || m.clearcoatMap) return m.uuid
  if (m.transparent || m.alphaTest > 0 || m.wireframe) return m.uuid
  return 'vc|' + m.type + '|' + m.roughness + '|' + m.metalness
    + '|' + m.emissive.getHex() + '|' + m.emissiveIntensity
    + '|' + m.side + '|' + m.flatShading + '|' + m.opacity
    + '|' + m.depthWrite + '|' + m.envMapIntensity + '|' + m.toneMapped
}

/** Inverte a volta dos triangulos (escala espelhada vira malha do avesso). */
function inverterVolta(g) {
  const idx = g.index
  if (!idx) return
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1)
    idx.setX(i + 1, idx.getX(i + 2))
    idx.setX(i + 2, b)
  }
  idx.needsUpdate = true
}

function contarMeshes(raiz) {
  let n = 0
  raiz.traverse((o) => { if (o.isMesh) n++ })
  return n
}

/**
 * Funde no lugar os meshes rigidos de cada junta de `raiz`.
 *
 * opts.juntas         array/Set/objeto de Object3D que NAO podem ser fundidos
 *                     (o natural e passar `character.parts`). Sem isso o forno
 *                     e conservador e trata todo no COM NOME como junta.
 * opts.manter(no)     predicado extra: devolve true e o no vira junta.
 * opts.corPorVertice  false desliga a fusao de materiais que so diferem na cor.
 *
 * Devolve { antes, depois, fundidos }.
 */
export function congelarPersonagem(raiz, opts = {}) {
  if (!raiz || !raiz.isObject3D) return { antes: 0, depois: 0, fundidos: 0 }
  raiz.updateMatrixWorld(true)

  const juntas = conjuntoDeJuntas(opts.juntas)
  const extra = typeof opts.manter === 'function' ? opts.manter : null
  const corPorVertice = opts.corPorVertice !== false
  const antes = contarMeshes(raiz)

  function ehJunta(o) {
    if (o === raiz) return true
    if (marcado(o)) return true
    if (extra && extra(o)) return true
    if (juntas) return juntas.has(o)
    // Sem lista: todo no com nome (juntas E slots) sobrevive como junta. Perde
    // um pouco de fusao mas nunca move o que alguem procura pelo nome.
    return !!o.name
  }

  /** Mesh que da pra colar noutro mesh sem mudar nada do que se ve. */
  function podeFundir(o) {
    if (!o.isMesh) return false
    if (o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return false
    if (marcado(o)) return false            // palpebra, peito que respira...
    if (o.name) return false                // alguem pode procurar por ele
    if (o.visible === false) return false   // pele coberta: some junto se fundir
    if (!o.material || Array.isArray(o.material)) return false
    const g = o.geometry
    if (!g || !g.attributes || !g.attributes.position) return false
    // Os `groups` da geometria (as 6 faces de um BoxGeometry, os 3 aneis de um
    // CylinderGeometry) so viram draw calls separados quando o material e um
    // ARRAY — e array ja saiu acima. Com material unico o renderer desenha a
    // geometria inteira de uma vez, entao os grupos podem ser descartados.
    return true
  }

  const vivos = new Set()
  const baldes = new Map()
  const inversas = new Map()   // junta -> inverso do matrixWorld (cache)
  const local = new THREE.Matrix4()

  function inversaDe(junta) {
    let m = inversas.get(junta)
    if (!m) {
      m = new THREE.Matrix4().copy(junta.matrixWorld).invert()
      inversas.set(junta, m)
    }
    return m
  }

  function manterSubarvore(o) { o.traverse((n) => vivos.add(n)) }

  function empilhar(mesh, junta) {
    // CLONE, sempre. A geometria original pode ser COMPARTILHADA (ver o aviso
    // no topo do arquivo) e ainda vai ser desenhada por outro personagem;
    // applyMatrix4 nela deformaria o boneco dos outros. O clone e descartavel:
    // existe so pra ser assado e morre logo depois do merge.
    const g = mesh.geometry.clone()
    if (!g.attributes.normal) g.computeVertexNormals()
    local.copy(inversaDe(junta)).multiply(mesh.matrixWorld)
    g.applyMatrix4(local)
    if (local.determinant() < 0) inverterVolta(g)
    const mat = mesh.material
    const chave = junta.uuid + '|' + chaveMaterial(mat, corPorVertice)
      + '|' + (mesh.castShadow ? 'c' : '-') + (mesh.receiveShadow ? 'r' : '-')
      + '|' + (g.attributes.uv ? 'uv' : 'sem')
    let b = baldes.get(chave)
    if (!b) {
      b = {
        junta, geos: [], mats: [], contas: [],
        cast: !!mesh.castShadow, receive: !!mesh.receiveShadow,
      }
      baldes.set(chave, b)
    }
    b.geos.push(g)
    b.mats.push(mat)
    b.contas.push(g.attributes.position.count)
  }

  /**
   * Devolve true se o no sobrevive. `junta` e a junta mais proxima acima, que e
   * para onde os meshes rigidos deste galho vao.
   */
  function visitar(o, junta) {
    // No invisivel fica INTACTO: fundir os filhos dele numa junta visivel
    // acima faria aparecer o que estava escondido.
    if (o !== raiz && o.visible === false) { manterSubarvore(o); return true }

    const souJunta = ehJunta(o)
    const alvo = souJunta ? o : junta
    let filhoVivo = false
    const filhos = o.children.slice()
    for (const c of filhos) if (visitar(c, alvo)) filhoVivo = true

    if (souJunta) { vivos.add(o); return true }
    if (!filhoVivo && podeFundir(o) && junta) { empilhar(o, junta); return false }
    if (o.isMesh || o.isLight || o.isSprite || o.isPoints || o.isLine) { vivos.add(o); return true }
    // Group/Object3D so sobrevive se tem nome (fpAnchor, slot:*) ou se ainda
    // carrega alguem. Container vazio vira lixo e sai da arvore.
    if (o.name || filhoVivo) { vivos.add(o); return true }
    return false
  }

  visitar(raiz, null)

  // Tira da arvore o que foi fundido e os containers que ficaram vazios.
  // SEM dispose nas geometrias ORIGINAIS destes meshes: elas seguem vivas e
  // sendo desenhadas por outro personagem (ver o aviso no topo do arquivo).
  // O forno so para de usa-las; quem e dono delas e o character.dispose().
  function limpar(o) {
    for (const c of o.children.slice()) {
      if (!vivos.has(c)) o.remove(c)
      else limpar(c)
    }
  }
  limpar(raiz)

  let fundidos = 0
  for (const b of baldes.values()) {
    const geo = mergeGeometries(b.geos)
    // Estes sao os CLONES que empilhar() fabricou, nao as geometrias dos
    // meshes: ninguem mais tem referencia pra eles e o merge ja os copiou.
    // Sao os UNICOS dispose que o forno tem direito de dar.
    for (const g of b.geos) g.dispose()
    if (!geo) continue

    // Um material so no balde inteiro? Usa ele cru. Varios (mesmo acabamento,
    // cores diferentes)? A cor vira atributo de vertice.
    let mat = b.mats[0]
    let variasCores = false
    for (let i = 1; i < b.mats.length; i++) if (b.mats[i] !== mat) { variasCores = true; break }
    if (variasCores) {
      const total = geo.attributes.position.count
      const cores = new Float32Array(total * 3)
      let o3 = 0
      for (let i = 0; i < b.contas.length; i++) {
        const c = b.mats[i].color   // ja esta no espaco linear de trabalho
        for (let k = 0; k < b.contas[i]; k++) {
          cores[o3] = c.r; cores[o3 + 1] = c.g; cores[o3 + 2] = c.b
          o3 += 3
        }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cores, 3))
      mat = mat.clone()
      mat.color.setRGB(1, 1, 1)   // branco: quem pinta agora e o vertice
      mat.vertexColors = true
    }

    const m = new THREE.Mesh(geo, mat)
    m.castShadow = b.cast
    m.receiveShadow = b.receive
    m.name = 'congelado'
    b.junta.add(m)
    fundidos++
  }

  return { antes, depois: contarMeshes(raiz), fundidos }
}

export default congelarPersonagem
