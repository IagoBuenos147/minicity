import * as THREE from 'three'
import { createCharacter } from '../src/player/character.js'
const app={cabeca:0,olhos:0,pupila:0,nariz:0,boca:0,barba:0,cabelo:0,pele:3,corCabelo:1,sobrancelha:0,corBarba:0,chapeu:0,calcado:0,blusa:0,calca:0,colar:0,anelAcess:0,tatuagem:0,relogio:0}
const SLOTS=['blusa','calca','calcado','chapeu','colar','anelAcess','tatuagem','relogio']
function nome(o){let s=[],p=o;while(p){s.push(p.name||'?');p=p.parent}return s.join('<')}
const nu=createCharacter({appearance:app})
const rn=new Set(); for(const k of SLOTS) for(const o of nu.pecasDe(k)) o.traverse(x=>{if(x.isMesh)rn.add(x)})
nu.root.traverse(x=>{if(x.isMesh)x.visible=!rn.has(x)})
nu.root.updateMatrixWorld(true)
const ch=createCharacter({appearance:Object.assign({},app,{blusa:3})})
ch.root.updateMatrixWorld(true)
const mNu=[];nu.root.traverse(x=>{if(x.isMesh&&x.visible)mNu.push(x)})
const m=[];ch.root.traverse(x=>{if(x.isMesh&&x.visible)m.push(x)})
const rc=new THREE.Raycaster();rc.far=6
for(const [ang,camY,y,lat] of [[0,1.05,1.275,0.16],[0,1.05,1.275,-0.16],[0.31,1.05,1.275,0.16]]){
  const cam=new THREE.Vector3(Math.sin(ang)*3,camY,Math.cos(ang)*3)
  const p=new THREE.Vector3(Math.cos(ang)*lat,y,-Math.sin(ang)*lat)
  const dir=p.clone().sub(cam).normalize()
  rc.set(cam,dir)
  const a=rc.intersectObjects(mNu,false), b=rc.intersectObjects(m,false)
  console.log('alvo',y,lat,'camY',camY)
  console.log('   NU  :',a.map(h=>h.distance.toFixed(3)+' '+nome(h.object)).join(' | ')||'nada')
  console.log('   VEST:',b.map(h=>h.distance.toFixed(3)+' '+nome(h.object)).join(' | ')||'nada')
}
