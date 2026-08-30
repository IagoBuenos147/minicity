import * as THREE from 'three'
import { CALCADOS_EXTRA2 } from '../src/player/roupa/calcados-extra2.js'

const SOLA_Y = -0.0875

function ctxFake(corCalcado) {
  const parts = {}
  return {
    medida: { SOLA_Y },
    cor: { calcado: corCalcado },
    montar(obj, nome) {
      if (!parts[nome]) parts[nome] = new THREE.Group()
      parts[nome].add(obj)
      return obj
    },
    parts,
  }
}

const canvas = document.getElementById('c')
const W = 900, H = 700
canvas.width = W
canvas.height = H
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(W, H, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.enabled = true

const cores = { 'bota-cauboi': 0x3b6fd6, 'tenis-cano-alto': 0xd63b3b, 'bota-chelsea': 0x3ba05a }

function cenaDoItem(item) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x15161a)

  const chao = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.9 }),
  )
  chao.rotation.x = -Math.PI / 2
  chao.position.y = SOLA_Y
  chao.receiveShadow = true
  scene.add(chao)

  const key = new THREE.DirectionalLight(0xffeacd, 2.6)
  key.position.set(-1.2, 1.6, 1.5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x9dbcf0, 0.7)
  fill.position.set(1.4, 0.8, 1.0)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0xffd9a8, 1.6)
  rim.position.set(0.4, 1.3, -1.6)
  scene.add(rim)
  scene.add(new THREE.HemisphereLight(0xa8bde4, 0x1b1810, 0.55))

  const ctx = ctxFake(cores[item.id] || 0x808080)
  const obj = item.build(ctx)
  const grupo = new THREE.Group()
  if (obj) grupo.add(obj)
  if (ctx.parts.footL) grupo.add(ctx.parts.footL)
  grupo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  scene.add(grupo)

  const box = new THREE.Box3().setFromObject(grupo)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maior = Math.max(size.x, size.y, size.z * 0.6)

  const camera = new THREE.PerspectiveCamera(34, W / H, 0.01, 10)
  const yaw = 0.30, pitch = 0.10
  const dist = (maior * 1.55) / Math.tan((34 * Math.PI / 180) / 2)
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  camera.position.copy(center).addScaledVector(dir, dist)
  camera.lookAt(center)

  return { scene, camera }
}

const saidas = {}
for (const item of CALCADOS_EXTRA2) {
  const { scene, camera } = cenaDoItem(item)
  renderer.render(scene, camera)
  saidas[item.id] = canvas.toDataURL('image/png')
}
window.__qc_saidas = saidas
window.__qc_ready = true
