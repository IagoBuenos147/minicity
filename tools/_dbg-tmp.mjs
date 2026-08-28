// Teste de CAMERA: raio que acerta o boneco NU tem que acertar tambem o vestido.
import * as THREE from 'three'
import { createCharacter } from '../src/player/character.js'
const app={cabeca:0,olhos:0,pupila:0,nariz:0,boca:0,barba:0,cabelo:0,pele:3,corCabelo:1,sobrancelha:0,corBarba:0,chapeu:0,calcado:0,blusa:0,calca:0,colar:0,anelAcess:0,tatuagem:0,relogio:0}
const alvo=process.argv[2]||'blusa'
const NI=+process.argv[3]||4
const faixa = alvo==='calca' ? [0.02,0.95] : [0.70,1.45]
function malhasDe(ch){const m=[];ch.root.traverse(x=>{if(x.isMesh&&x.visible)m.push(x)});return m}
const raios=[]
for(const camY of [1.05,1.55,2.20,0.35]){
  for(let a=0;a<20;a++){
    const ang=(a/20)*Math.PI*2
    const cam=new THREE.Vector3(Math.sin(ang)*3,camY,Math.cos(ang)*3)
    for(let iy=0;iy<=60;iy++){
      const y=faixa[0]+(faixa[1]-faixa[0])*(iy/60)
      for(let ix=-9;ix<=9;ix++){
        const lat=new THREE.Vector3(Math.cos(ang),0,-Math.sin(ang)).multiplyScalar(ix*0.020)
        const p=new THREE.Vector3(lat.x,y,lat.z)
        raios.push([cam,p.clone().sub(cam).normalize(),y,ix*0.020,ang])
      }
    }
  }
}
// referencia = corpo NU DE VERDADE: apaga toda roupa e devolve toda a pele
const SLOTS=['blusa','calca','calcado','chapeu','colar','anelAcess','tatuagem','relogio']
const nu=createCharacter({appearance:app})
const roupaNu=new Set(); for(const k of SLOTS) for(const o of nu.pecasDe(k)) o.traverse(x=>{if(x.isMesh)roupaNu.add(x)})
nu.root.traverse(x=>{ if(x.isMesh) x.visible=!roupaNu.has(x) })
nu.root.updateMatrixWorld(true)
const mNu=malhasDe(nu)
const rc=new THREE.Raycaster(); rc.far=6
const bons=[]
for(const R of raios){ rc.set(R[0],R[1]); if(rc.intersectObjects(mNu,false).length) bons.push(R) }
console.log('raios que acertam o boneco nu: '+bons.length)
for(let idx=0;idx<NI;idx++){
  const ch=createCharacter({appearance:Object.assign({},app,{[alvo]:idx})})
  ch.root.updateMatrixWorld(true)
  const m=malhasDe(ch)
  let vaza=0, ex=[]
  const hist={}
  for(const R of bons){ rc.set(R[0],R[1])
    if(!rc.intersectObjects(m,false).length){ vaza++
      const k='alvo y='+R[2].toFixed(3)+' lat='+R[3].toFixed(3)+' camY='+R[0].y.toFixed(2)+' az='+R[4].toFixed(2)
      hist[k]=(hist[k]||0)+1 } }
  ex=Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,6).map(e=>e[0]+' x'+e[1])
  console.log(alvo+' '+idx+': raios que VAZAM (nu tapava, vestido nao): '+vaza+(ex.length?'  ex '+ex.join(' | '):''))
}
