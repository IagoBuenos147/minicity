// Fotos das TELAS do jogo (menu, criacao de personagem, cutscene, tutorial).
//
//   node tools/shot-tela.mjs             -> tira todas
//   node tools/shot-tela.mjs menu        -> so o grupo 'menu'
//
// Por que este arquivo existe separado de tools/shot-clima.mjs: aquele salva o
// CANVAS (toDataURL), que e o certo pra fotografar o mundo 3D e nada mais. As
// telas deste jogo sao DOM por cima do canvas — menu, painel de customizacao,
// baloes da cutscene, HUD. Num toDataURL do canvas elas simplesmente nao
// existem. Aqui a foto e page.screenshot(), que compoe as duas camadas.
//
// O outro motivo: page.screenshot() FORCA um quadro. Em headless a aba nao
// compoe sozinha e o requestAnimationFrame do jogo nao dispara — e por isso
// que cada tomada aqui pede um punhado de quadros na mao antes de clicar.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'

// Cada tomada: { nome, antes, quadros, espera }
//   antes    codigo rodado na pagina (recebe G = window.__game)
//   quadros  quantos quadros do jogo forcar antes de clicar
//   espera   ms de relogio depois do 'antes' (pra transicao de CSS terminar)
export const GRUPOS = {
  menu: [
    { nome: 'tela-01-menu', antes: "G.menu.abrir('principal')", espera: 900 },
    { nome: 'tela-02-modo', antes: "G.menu.abrir('modo')", espera: 700 },
    {
      nome: 'tela-03-lobby',
      antes: `G.menu.abrir('lobby')
        G.menu.setSala({ fase:'lobby', anfitriao:1, meuId:1, jogadores:[
          { id:1, nome:'Iago', pronto:false }, { id:2, nome:'Irmao', pronto:false } ] })
        G.menu.setMensagem('')`,
      espera: 700,
    },
    { nome: 'tela-04-opcoes', antes: "G.menu.abrir('opcoes')", espera: 700 },
  ],
  criacao: [
    {
      // A ABA DE OLHOS com a BARRA da palpebra, e o olho da referencia
      // escolhido — o pedido "crie um sistema na propria customizacao onde eu
      // fecho os olhos com uma barra".
      nome: 'tela-05b-olhos',
      antes: `G.fluxo.solo()
        setTimeout(() => {
          const b = [...document.querySelectorAll('.mcrp-cri .cz-tab')]
          const alvo = b.find(x => /^OLHOS$/i.test((x.textContent || '').trim()))
          if (alvo) alvo.click()
          setTimeout(() => {
            const cards = [...document.querySelectorAll('.mcrp-cri .cz-sec.is-active .cz-card')]
            if (cards[5]) cards[5].click()
            setTimeout(() => {
              const r = document.querySelector('.mcrp-cri .cz-sec.is-active .cz-range')
              if (r) { r.value = '4'; r.dispatchEvent(new Event('input', { bubbles: true })) }
            }, 260)
          }, 200)
        }, 40)`,
      quadros: 90, espera: 1600,
    },
    {
      // A ABA DE COR com as TRES listas (cabelo, barba e pele), que era o pedido
      // "na aba cor vai ter cor de cabelo, cor de barba e cor de pele, tudo em
      // uma aba".
      nome: 'tela-05c-cor',
      antes: `G.fluxo.solo()
        setTimeout(() => {
          const b = [...document.querySelectorAll('.mcrp-cri .cz-tab')]
          const alvo = b.find(x => /^COR$/i.test((x.textContent || '').trim()))
          if (alvo) alvo.click()
        }, 40)`,
      quadros: 60, espera: 1200,
    },
    {
      nome: 'tela-05-criacao',
      // pelo FLUXO de verdade (o mesmo que o botao SOLO do menu dispara), e
      // nao abrindo o painel na mao: e o estado 'criacao' que faz o laco
      // desenhar o palco em vez da cidade
      antes: 'G.fluxo.solo()',
      quadros: 60, espera: 900,
    },
    {
      nome: 'tela-06-criacao-roupa',
      antes: `G.criacao.abrir({ modo:'coop', nome:'Iago', prontos:1, total:3 })
        G.criacao.setJogadores([{id:1,nome:'Iago',pronto:true},
          {id:2,nome:'Irmao',pronto:false},{id:3,nome:'Primo',pronto:false}])
        G.criacao.setProntos(1, 3)`,
      quadros: 40, espera: 900,
    },
  ],
  casa: [
    {
      nome: 'tela-07-casa-fora',
      antes: `G.fluxo.foto(true)
        const p = G.casa && G.casa.poseDaCutscene
        const c = G.camera
        if (p) { c.position.set(p.x, p.y, p.z); c.lookAt(p.olharX, p.olharY, p.olharZ) }
        else { c.position.set(44, 2.0, 6); c.lookAt(44, 2.0, 14) }
        c.fov = 62; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.30); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
    {
      nome: 'tela-08a-porta-fechada',
      antes: `const c = G.camera
        c.position.set(44.6, 1.72, 8.6); c.lookAt(43.2, 1.6, 12.1)
        c.fov = 68; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      nome: 'tela-08b-porta-aberta',
      antes: `const it = G.interaction.items.find(i=>i.id==='casa-porta')
        if (it) it.onInteract(G)
        for (let i=0;i<180;i++) G.casa.update(1/60, G)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      nome: 'tela-08-casa-dentro',
      antes: `const c = G.camera
        c.position.set(39.6, 1.75, 13.2); c.lookAt(45.6, 1.35, 20.5)
        c.fov = 74; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
    {
      nome: 'tela-09-casa-corredor',
      antes: `const c = G.camera
        c.position.set(49.0, 1.75, 19.0); c.lookAt(43.0, 1.30, 22.6)
        c.fov = 74; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
  ],
  // O painel de DENTRO do jogo (barbeiro / provador), que era a queixa da
  // camera com movel na frente.
  barbeiro: [
    {
      nome: 'tela-12-barbeiro',
      antes: `G.fluxo.jogar()
        G.player.teleport(22, -20, 0)
        G.openCustomizer('rosto')`,
      quadros: 60, espera: 900,
    },
    {
      nome: 'tela-13-roupa',
      antes: `G.openCustomizer('roupa')`,
      quadros: 60, espera: 900,
    },
    {
      nome: 'tela-14-roupa-calcado',
      antes: `const b = [...document.querySelectorAll('.mcrp-cz button, .mcrp-cz [role=tab], .mcrp-cz .cz-aba')]
        const alvo = b.find(x => /CALCADO/i.test(x.textContent || ''))
        if (alvo) alvo.click()`,
      quadros: 60, espera: 900,
    },
  ],
  // contato das miniaturas: uma folha com todas as fotos de alguns campos
  minis: [
    {
      nome: 'minis-1-rosto',
      antes: `G.fluxo.foto(true)
        const campos = ['olhos','pupila','boca','cabelo','sobrancelha','barba','nariz','colar','tatuagem']
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:12px monospace;color:#ddd;padding:6px'
        for (const f of campos) {
          const lin = document.createElement('div')
          lin.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px'
          const t = document.createElement('b'); t.textContent = f; t.style.width='90px'
          lin.appendChild(t)
          for (let i=0;i<8;i++) {
            const u = G.provador.miniatura(f, i)
            if (!u) continue
            const im = document.createElement('img'); im.src = u
            im.style.cssText = 'width:88px;height:88px;background:#222;border:1px solid #444'
            lin.appendChild(im)
          }
          d.appendChild(lin)
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
    {
      nome: 'minis-2-pupilas',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:12px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:3px'
        for (let i=0;i<22;i++) {
          const u = G.provador.miniatura('pupila', i)
          if (!u) continue
          const im = document.createElement('img'); im.src = u
          im.style.cssText = 'width:150px;height:150px;background:#222;border:1px solid #444'
          d.appendChild(im)
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
  ],
  // ==========================================================================
  // A REFORMA DO PERSONAGEM
  //
  // Uma folha de contato por aba. Nao sao fotos "bonitas": sao as fotos que
  // mostram se a peca esta GRUDADA NA PELE nos seis cranios, que e o unico jeito
  // de pegar um traco flutuando sem abrir o jogo item por item.
  // ==========================================================================
  cranio: [
    {
      nome: 'p1-cranios',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        const base = { chapeu:0, cabelo:0, barba:0, blusa:1, nariz:1, olhos:0, boca:0, sobrancelha:0 }
        for (const gi of [0, 1.05]) {
          for (let cb = 0; cb < 6; cb++) {
            const w = document.createElement('div')
            const lb = document.createElement('div'); lb.textContent = 'cabeca ' + cb + (gi ? ' (perfil)' : ' (frente)')
            G.provador.setAparencia(Object.assign({}, G.appearance, base, { cabeca: cb }))
            G.provador.focar('rosto', true)
            G.provador.girar(gi - (G.__giroAnt || 0)); G.__giroAnt = gi
            G.provador.atualizar(0.6); G.provador.render()
            const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
            im.style.cssText = 'width:300px;height:300px;object-fit:contain;background:#222;border:1px solid #444'
            w.appendChild(lb); w.appendChild(im); d.appendChild(w)
          }
        }
        G.provador.girar(-(G.__giroAnt || 0)); G.__giroAnt = 0
        document.body.appendChild(d)`,
      espera: 1400, semQuadro: true,
    },
  ],
  olhos: [
    {
      nome: 'p2-olhos',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        for (let i = 0; i < 5; i++) {
          const w = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = 'olho ' + i
          G.provador.setAparencia(Object.assign({}, G.appearance, { olhos:i, chapeu:0, cabelo:0, barba:0, nariz:1 }))
          G.provador.focar('rosto', true)
          G.provador.atualizar(0.6); G.provador.render()
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:420px;height:300px;object-fit:none;object-position:50% 38%;background:#222;border:1px solid #444'
          w.appendChild(lb); w.appendChild(im); d.appendChild(w)
        }
        document.body.appendChild(d)`,
      espera: 1400, semQuadro: true,
    },
  ],
  // O OLHO E O NARIZ DA REFERENCIA (Rick & Morty), e a barra da palpebra.
  cartoon: [
    {
      nome: 'p15-olho-cartoon',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        const base = { olhos:5, nariz:4, chapeu:0, cabelo:0, barba:0, boca:0, sobrancelha:0 }
        for (const k of [0, 2, 4, 5, 7, 10]) {
          const w = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = 'palpebra ' + k
          G.provador.setAparencia(Object.assign({}, G.appearance, base, { palpebra: k }))
          G.provador.focar('rosto', true)
          G.provador.atualizar(0.6); G.provador.render()
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:420px;height:300px;object-fit:none;object-position:50% 38%;background:#222;border:1px solid #444'
          w.appendChild(lb); w.appendChild(im); d.appendChild(w)
        }
        document.body.appendChild(d)`,
      espera: 1600, semQuadro: true,
    },
    {
      nome: 'p16-cartoon-rosto',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        const tiros = [
          ['rosto inteiro aberto', { olhos:5, nariz:4, palpebra:0 }],
          ['rosto inteiro meio',   { olhos:5, nariz:4, palpebra:4 }],
          ['nariz cartoon so',     { olhos:0, nariz:4, palpebra:0 }],
          ['persiana no olho 0',   { olhos:0, nariz:1, palpebra:5 }],
          ['persiana no olho 2',   { olhos:2, nariz:1, palpebra:5 }],
          ['persiana no olho 4',   { olhos:4, nariz:1, palpebra:5 }],
        ]
        for (const [lb0, patch] of tiros) {
          const w = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = lb0
          G.provador.setAparencia(Object.assign({}, G.appearance, { chapeu:0, cabelo:0, barba:0 }, patch))
          G.provador.focar('rosto', true)
          G.provador.atualizar(0.6); G.provador.render()
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:400px;height:360px;object-fit:contain;background:#222;border:1px solid #444'
          w.appendChild(lb); w.appendChild(im); d.appendChild(w)
        }
        document.body.appendChild(d)`,
      espera: 1600, semQuadro: true,
    },
  ],
  traco: [
    {
      nome: 'p3-nariz-boca',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        const tiros = []
        for (let i = 0; i < 4; i++) tiros.push(['nariz ' + i, { nariz:i }])
        for (let i = 0; i < 3; i++) tiros.push(['boca ' + i, { boca:i, nariz:0 }])
        for (const [lb0, patch] of tiros) {
          const w = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = lb0
          G.provador.setAparencia(Object.assign({}, G.appearance, { chapeu:0, cabelo:0, barba:0, nariz:1 }, patch))
          G.provador.focar('rosto', true)
          G.provador.atualizar(0.6); G.provador.render()
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:360px;height:300px;object-fit:none;object-position:50% ' + (lb0.startsWith('boca') ? '58%' : '42%') + ';background:#222;border:1px solid #444'
          w.appendChild(lb); w.appendChild(im); d.appendChild(w)
        }
        document.body.appendChild(d)`,
      espera: 1400, semQuadro: true,
    },
    {
      nome: 'p4-pelo',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        const tiros = []
        for (let i = 1; i < 4; i++) tiros.push(['barba ' + i, { barba:i }])
        for (let i = 0; i < 3; i++) tiros.push(['cabelo ' + i, { cabelo:i }])
        for (let i = 0; i < 3; i++) tiros.push(['sobrancelha ' + i, { sobrancelha:i, cabelo:2 }])
        for (const [lb0, patch] of tiros) {
          const w = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = lb0
          G.provador.setAparencia(Object.assign({}, G.appearance, { chapeu:0, cabelo:0, barba:0, nariz:1, corBarba:0 }, patch))
          G.provador.focar('rosto', true)
          G.provador.atualizar(0.6); G.provador.render()
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:360px;height:360px;object-fit:contain;background:#222;border:1px solid #444'
          w.appendChild(lb); w.appendChild(im); d.appendChild(w)
        }
        document.body.appendChild(d)`,
      espera: 1600, semQuadro: true,
    },
  ],
  // O CORPO: o que o dono fotografou (listra no peito, braco listrado, ombro e
  // cotovelo quadrados, mao feia). A camera e a DO JOGO, colocada na mao: o
  // enquadramento do provador e largo demais pra ver acabamento, e o que se quer
  // aqui e justamente ver de perto o que estava feio.
  corpo: [
    {
      nome: 'p5-corpo',
      antes: `G.fluxo.jogar()
        G.fluxo.foto(true)
        G.player.teleport(43, 6, 0)
        const ch = G.character
        const c = G.camera
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        function tira(lb0, ang, alvoY, dist, fov) {
          ch.root.rotation.y = 0
          ch.root.updateMatrixWorld(true)
          const p = ch.root.position
          c.position.set(p.x + Math.sin(ang) * dist, p.y + alvoY + dist * 0.10, p.z + Math.cos(ang) * dist)
          c.lookAt(p.x, p.y + alvoY, p.z)
          c.fov = fov; c.updateProjectionMatrix()
          G.lighting.setTimeOfDay(0.32); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
          G.engine.render()
          const w = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = lb0
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:300px;height:420px;object-fit:none;object-position:50% 50%;background:#222;border:1px solid #444'
          w.appendChild(lb); w.appendChild(im); d.appendChild(w)
        }
        for (const [nome, roupa] of [['nu', 0], ['vestido', 1]]) {
          G.setAppearance({ blusa: roupa, calca: 0, calcado: roupa ? 1 : 0 })
          for (const [vn, ang] of [['frente', 0], ['3/4', 0.9], ['perfil', 1.57], ['costas', 3.14]]) {
            tira(vn + ' ' + nome, ang, 0.95, 2.1, 40)
          }
        }
        document.body.appendChild(d)`,
      espera: 1800, semQuadro: true,
    },
    {
      nome: 'p6-detalhe',
      antes: `G.fluxo.foto(true)
        G.setAppearance({ blusa: 0, calca: 0, calcado: 0 })
        const ch = G.character
        const c = G.camera
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        function perto(lb0, alvoY, ang, dist, fov) {
          ch.root.rotation.y = 0
          ch.root.updateMatrixWorld(true)
          const p = ch.root.position
          c.position.set(p.x + Math.sin(ang) * dist, p.y + alvoY, p.z + Math.cos(ang) * dist)
          c.lookAt(p.x, p.y + alvoY, p.z)
          c.fov = fov; c.updateProjectionMatrix()
          G.lighting.setTarget(c.position); G.lighting.update(0.0001)
          G.engine.render()
          const w = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = lb0
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:340px;height:340px;object-fit:none;object-position:50% 50%;background:#222;border:1px solid #444'
          w.appendChild(lb); w.appendChild(im); d.appendChild(w)
        }
        perto('peito frente', 1.25, 0, 0.85, 44)
        perto('peito 3/4', 1.25, 0.9, 0.85, 44)
        perto('ombro/braco', 1.28, 1.30, 0.70, 40)
        perto('cotovelo', 1.00, 1.45, 0.55, 40)
        perto('mao', 0.66, 1.62, 0.60, 30)
        perto('mao de tras', 0.66, 4.60, 0.60, 30)
        perto('quadril/coxa', 0.72, 0.5, 0.95, 44)
        perto('joelho', 0.47, 1.20, 0.55, 40)
        perto('pe', 0.14, 0.8, 0.55, 40)
        perto('costas', 1.15, 3.14, 1.10, 46)
        document.body.appendChild(d)`,
      espera: 1800, semQuadro: true,
    },
  ],
  // A VISTA QUE O JOGADOR TEM O TEMPO TODO: 3a pessoa, no meio da rua.
  jogo: [
    {
      nome: 'p11-terceira-pessoa',
      antes: `G.fluxo.jogar()
        G.player.teleport(43, 4, Math.PI)
        for (let i = 0; i < 90; i++) G.player.update(1/60)`,
      quadros: 40, espera: 700,
    },
    {
      nome: 'p12-primeira-pessoa',
      antes: `G.player.setMode ? G.player.setMode('first') : G.player.toggleMode()
        for (let i = 0; i < 60; i++) G.player.update(1/60)`,
      quadros: 30, espera: 500,
    },
  ],
  // AS ROUPAS: uma folha por aba, com a camera do jogo apontada na parte certa.
  // O provador enquadra largo demais pra ver acabamento de costura e de sola.
  roupa: [
    {
      nome: 'p8-camisa-calca',
      antes: `G.fluxo.jogar()
        G.fluxo.foto(true)
        G.player.teleport(43, 6, 0)
        const ch = G.character
        const c = G.camera
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        function tira(lb0, alvoY, ang, dist, fov, w, h) {
          ch.root.rotation.y = 0   // o boneco olha pra +Z: com ang 0 a camera fica de frente
          ch.root.updateMatrixWorld(true)
          const p = ch.root.position
          c.position.set(p.x + Math.sin(ang) * dist, p.y + alvoY + dist * 0.06, p.z + Math.cos(ang) * dist)
          c.lookAt(p.x, p.y + alvoY, p.z)
          c.fov = fov; c.updateProjectionMatrix()
          G.lighting.setTimeOfDay(0.32); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
          G.engine.render()
          const wr = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = lb0
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:' + w + 'px;height:' + h + 'px;object-fit:none;object-position:50% 50%;background:#222;border:1px solid #444'
          wr.appendChild(lb); wr.appendChild(im); d.appendChild(wr)
        }
        for (let i = 1; i < 4; i++) {
          G.setAppearance({ blusa: i, calca: 0 })
          tira('camisa ' + i, 1.15, 0, 2.6, 38, 300, 460)
          tira('camisa ' + i + ' 3/4', 1.15, 1.0, 2.6, 38, 300, 460)
        }
        G.setAppearance({ blusa: 1 })
        for (let i = 0; i < 3; i++) {
          G.setAppearance({ calca: i })
          tira('calca ' + i, 0.55, 0, 2.2, 38, 300, 460)
        }
        document.body.appendChild(d)`,
      espera: 1800, semQuadro: true,
    },
    {
      nome: 'p9-chapeu-calcado',
      antes: `G.fluxo.foto(true)
        const ch = G.character
        const c = G.camera
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        function tira(lb0, alvoY, ang, dist, fov, w, h) {
          ch.root.rotation.y = 0   // o boneco olha pra +Z: com ang 0 a camera fica de frente
          ch.root.updateMatrixWorld(true)
          const p = ch.root.position
          c.position.set(p.x + Math.sin(ang) * dist, p.y + alvoY + dist * 0.10, p.z + Math.cos(ang) * dist)
          c.lookAt(p.x, p.y + alvoY, p.z)
          c.fov = fov; c.updateProjectionMatrix()
          G.lighting.setTarget(c.position); G.lighting.update(0.0001)
          G.engine.render()
          const wr = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = lb0
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:' + w + 'px;height:' + h + 'px;object-fit:none;object-position:50% 50%;background:#222;border:1px solid #444'
          wr.appendChild(lb); wr.appendChild(im); d.appendChild(wr)
        }
        G.setAppearance({ chapeu: 0 })
        for (let i = 1; i < 5; i++) {
          G.setAppearance({ calcado: i })
          tira('calcado ' + i, 0.11, 0.9, 1.05, 32, 330, 330)
          tira('calcado ' + i + ' de tras', 0.11, 3.6, 1.05, 32, 330, 330)
        }
        for (let i = 1; i < 4; i++) {
          G.setAppearance({ calcado: 1, blusa: i })
          tira('camisa ' + i + ' costas', 1.15, 3.14, 2.6, 38, 300, 420)
        }
        G.setAppearance({ blusa: 1 })
        document.body.appendChild(d)`,
      espera: 1800, semQuadro: true,
    },
    {
      nome: 'p10-acessorios',
      antes: `G.fluxo.foto(true)
        G.setAppearance({ chapeu: 0, calcado: 1, blusa: 1 })
        const ch = G.character
        const c = G.camera
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        function tira(lb0, alvoY, ang, dist, fov) {
          ch.root.rotation.y = 0
          ch.root.updateMatrixWorld(true)
          const p = ch.root.position
          c.position.set(p.x + Math.sin(ang) * dist, p.y + alvoY + dist * 0.06, p.z + Math.cos(ang) * dist)
          c.lookAt(p.x, p.y + alvoY, p.z)
          c.fov = fov; c.updateProjectionMatrix()
          G.lighting.setTarget(c.position); G.lighting.update(0.0001)
          G.engine.render()
          const wr = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = lb0
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:320px;height:320px;object-fit:none;object-position:50% 50%;background:#222;border:1px solid #444'
          wr.appendChild(lb); wr.appendChild(im); d.appendChild(wr)
        }
        for (let i = 1; i < 4; i++) { G.setAppearance({ colar: i }); tira('colar ' + i, 1.28, 0.30, 1.05, 30) }
        G.setAppearance({ colar: 0 })
        for (let i = 1; i < 4; i++) { G.setAppearance({ relogio: i }); tira('relogio ' + i, 0.76, 1.50, 0.75, 26) }
        G.setAppearance({ relogio: 0 })
        for (let i = 1; i < 4; i++) { G.setAppearance({ anelAcess: i }); tira('anel ' + i, 0.64, 1.50, 0.52, 22) }
        G.setAppearance({ anelAcess: 0, blusa: 0 })
        for (let i = 1; i < 4; i++) { G.setAppearance({ tatuagem: i }); tira('tatuagem ' + i, 1.15, 0.6, 2.20, 36) }
        document.body.appendChild(d)`,
      espera: 2000, semQuadro: true,
    },
  ],
  // A PASSADA: oito instantes de um ciclo, andando e correndo, vistos de lado.
  // Uma folha assim mostra em segundos o que so se ve no jogo prestando muita
  // atencao — se o pe planta, se o joelho amortece, se o braco acompanha.
  passada: [
    {
      nome: 'p7-passada',
      antes: `G.fluxo.jogar()
        G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:3px'
        const ch = G.character
        const c = G.camera
        // camera de perfil, presa no personagem
        function tira(lb0) {
          ch.root.updateMatrixWorld(true)
          const p = ch.root.position
          c.position.set(p.x + 3.2, p.y + 0.95, p.z)
          c.lookAt(p.x, p.y + 0.90, p.z)
          c.fov = 40; c.updateProjectionMatrix()
          G.lighting.setTarget(c.position); G.lighting.update(0.0001)
          G.engine.render()
          const w = document.createElement('div')
          const lb = document.createElement('div'); lb.textContent = lb0
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:250px;height:560px;object-fit:none;object-position:50% 50%;background:#222;border:1px solid #444'
          w.appendChild(lb); w.appendChild(im); d.appendChild(w)
        }
        for (const [nome, vel, correndo] of [['anda', 1.6, false], ['padrao', 3.1, false], ['corre', 6.2, true]]) {
          for (let i = 0; i < 8; i++) {
            for (let k = 0; k < 5; k++) G.player.animator.update(1 / 60, { speed: vel, moving: true, running: correndo, grounded: true, vy: 0 })
            tira(nome + ' ' + i)
          }
        }
        document.body.appendChild(d)`,
      espera: 1800, semQuadro: true,
    },
  ],
  colar: [
    {
      nome: 'colar-1-combos',
      antes: `G.fluxo.foto(true)
        const combos = [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[0,10],[12,3],[12,5],[12,8],[12,10],[2,4],[9,7]]
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        for (const [bl,co] of combos) {
          const w = document.createElement('div')
          const t = document.createElement('div'); t.textContent = 'blusa '+bl+' colar '+co
          G.provador.setAparencia(Object.assign({}, G.appearance, {blusa:bl, colar:co}))
          G.provador.focar('tronco', true)
          G.provador.atualizar(0.5)
          G.provador.render()
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:196px;height:172px;object-fit:cover;object-position:50% 30%;background:#222;border:1px solid #444'
          w.appendChild(t); w.appendChild(im); d.appendChild(w)
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
  ],
  tatu: [
    {
      nome: 'tatu-1-corpo',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        for (const pele of [0]) {
          for (let t = 1; t < 11; t++) {
            const w = document.createElement('div')
            const lb = document.createElement('div'); lb.textContent = 'pele '+pele+' tatu '+t
            G.provador.setAparencia(Object.assign({}, G.appearance, {blusa:0, tatuagem:t, pele:pele}))
            G.provador.focar('tronco', true)
            G.provador.atualizar(0.5); G.provador.render()
            const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
            im.style.cssText = 'width:300px;height:340px;object-fit:none;object-position:50% 70%;background:#222;border:1px solid #444'
            w.appendChild(lb); w.appendChild(im); d.appendChild(w)
          }
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
  ],
  chapeu: [
    {
      nome: 'chapeu-1-cabelo',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        for (const ch of [8, 2, 10]) {
          for (const cb of [12, 4, 0]) {
            const w = document.createElement('div')
            const lb = document.createElement('div'); lb.textContent = 'chapeu '+ch+' cabeca '+cb
            G.provador.setAparencia(Object.assign({}, G.appearance, {chapeu:ch, cabelo:0, sobrancelha:3, cabeca:cb}))
            G.provador.focar('rosto', true)
            G.provador.atualizar(0.5); G.provador.render()
            const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
            im.style.cssText = 'width:400px;height:300px;object-fit:contain;background:#222;border:1px solid #444'
            w.appendChild(lb); w.appendChild(im); d.appendChild(w)
          }
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
  ],
  // A coluna do canto: mao, dinheiro e as nove vagas da mochila.
  // A troca de cenario: a cidade, o quarteirao de Paracatu e o vazio.
  cenario: [
    {
      nome: 'cenario-1-cidade',
      antes: `G.fluxo.jogar()
        G.cenarios.mostrar('cidade')
        G.fluxo.foto(true)
        const c = G.camera
        c.position.set(43, 12, 30); c.lookAt(40, 2, 6)`,
      quadros: 20, espera: 500,
    },
    {
      nome: 'cenario-2-hudson-alto',
      antes: `G.cenarios.mostrar('hudson')
        G.fluxo.foto(true)
        const c = G.camera
        c.position.set(-96, 62, 104); c.lookAt(0, 0, 0)`,
      quadros: 20, espera: 900,
    },
    {
      nome: 'cenario-3-caldas',
      antes: `const c = G.camera
        c.position.set(66, 1.9, 46); c.lookAt(63, 2.2, -30)`,
      quadros: 14, espera: 400,
    },
    {
      nome: 'cenario-4-caixeta',
      antes: `const c = G.camera
        c.position.set(-40, 1.9, 68); c.lookAt(40, 2.4, 66)`,
      quadros: 14, espera: 400,
    },
    {
      nome: 'cenario-5-caixito',
      antes: `const c = G.camera
        c.position.set(-40, 2.0, -70); c.lookAt(40, 3.0, -68)`,
      quadros: 14, espera: 400,
    },
    {
      nome: 'cenario-6-josino',
      antes: `const c = G.camera
        c.position.set(-66, 1.9, -40); c.lookAt(-63, 2.2, 40)`,
      quadros: 14, espera: 400,
    },
    {
      nome: 'cenario-7-casa-perto',
      antes: `const c = G.camera
        c.position.set(70, 2.6, 10); c.lookAt(58, 2.0, 2)`,
      quadros: 14, espera: 400,
    },
    {
      nome: 'cenario-9-pintura',
      antes: `G.cenarios.mostrar('hudson')
        G.fluxo.foto(true)
        const c = G.camera
        c.position.set(66, 26, 4); c.lookAt(66, 0, 4.001)
        c.rotation.z = 0`,
      quadros: 14, espera: 400,
    },
    {
      nome: 'cenario-8-vazio',
      antes: `G.cenarios.mostrar('cidade')
        G.cenarios.sumir(true)
        const c = G.camera
        c.position.set(43, 12, 30); c.lookAt(40, 2, 6)`,
      quadros: 20, espera: 500,
    },
  ],
  // A tela dos cinco lugares de save.
  save: [
    {
      nome: 'save-1-continuar',
      antes: `localStorage.removeItem('mcrp-saves')
        G.fluxo.jogar()
        // Tres lugares com historias diferentes, pra tela nao aparecer vazia:
        // um jogo de hoje, um de ontem e um de tres meses atras.
        G.carteira.ganharOuro(2480)
        G.carteira.depositar(15300)
        G.inventario.adicionar('sinuca-bar', 1)
        G.inventario.adicionar('jukebox', 1)
        G.save.comecarEm(0, 'Iago')
        G.save.salvar(0, 'Iago', true)
        G.carteira.gastarOuro(2000)
        G.save.comecarEm(1, 'Rafa')
        G.save.salvar(1, 'Rafa', true)
        G.carteira.ganharOuro(120000)
        G.save.comecarEm(3, 'Duda')
        G.save.salvar(3, 'Duda', true)
        // Envelhece os cards na mao: o texto "Ontem" / "Ha 3 meses" so aparece
        // com data velha, e nao da pra esperar tres meses por um screenshot.
        const cru = JSON.parse(localStorage.getItem('mcrp-saves'))
        const DIA = 86400000
        cru[0].segundos = 11532
        cru[1].jogadoEm -= DIA; cru[1].criadoEm -= DIA * 2; cru[1].segundos = 743
        cru[3].jogadoEm -= DIA * 96; cru[3].criadoEm -= DIA * 130; cru[3].segundos = 152400
        localStorage.setItem('mcrp-saves', JSON.stringify(cru))
        G.fluxo.menu()
        G.saveUI.abrir('continuar')`,
      espera: 900, semQuadro: true,
    },
    {
      nome: 'save-2-salvar',
      antes: `G.saveUI.fechar()
        G.saveUI.abrir('salvar')`,
      espera: 700, semQuadro: true,
    },
  ],
  mochila: [
    {
      nome: 'mochila-1-hud',
      antes: `G.fluxo.jogar()
        G.inventario.adicionar('sinuca-bar', 1)
        G.inventario.adicionar('jukebox', 1)
        G.inventario.adicionar('maleta-300', 1)
        G.inventario.adicionar('ficha-sinuca', 25)
        G.inventario.adicionar('baralho-estrela', 3)
        G.carteira.ganharOuro(320)
        G.carteira.depositar(900)
        G.carteira.ganharFichas(140)
        G.player.teleport(43, 8.8, Math.PI)`,
      quadros: 30, espera: 900,
    },
  ],
  // A janela da loja de jogos.
  loja: [
    {
      nome: 'loja-1-vitrine',
      antes: `G.fluxo.jogar()
        G.carteira.ganharOuro(900)
        G.carteira.depositar(600)
        G.loja.abrir()
        for (let i=0;i<20;i++) G.loja.atualizar(1/60)`,
      espera: 1400, semQuadro: true,
    },
    {
      nome: 'loja-3-fora',
      antes: `G.loja.fechar()
        G.fluxo.foto(true)
        const c = G.camera
        c.position.set(42.4, 2.4, -6.0); c.lookAt(42.0, 2.2, -13.0)
        c.fov = 62; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.30); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 500, semQuadro: true,
    },
    {
      nome: 'loja-4-dentro',
      antes: `const c = G.camera
        c.position.set(42.0, 1.75, -14.4); c.lookAt(42.0, 1.35, -27.0)
        c.fov = 74; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        for (let i=0;i<40;i++) G.lojaMundo.update(1/60, G)
        G.engine.render()`,
      espera: 500, semQuadro: true,
    },
    {
      nome: 'loja-2-carrinho',
      antes: `G.loja.abrir()
        for (let i=0;i<20;i++) G.loja.atualizar(1/60)
        const cards = document.querySelectorAll('.mcrp-loja .card')
        if (cards[7]) cards[7].click()
        if (cards[0]) cards[0].click()
        if (cards[5]) { cards[5].click(); cards[5].click(); cards[5].click() }`,
      espera: 700, semQuadro: true,
    },
  ],
  // O modo de encaixe: fantasma verde, pegada no chao e a moldura do volume.
  encaixe: [
    {
      nome: 'encaixe-1-verde',
      antes: `G.fluxo.foto(true)
        G.inventario.adicionar('sinuca-bar', 1)
        G.player.teleport(44.6, 22.6, 0)
        G.encaixe.entrar(0, 'sinuca-bar')
        const c = G.camera
        c.position.set(45.6, 2.40, 23.6); c.lookAt(43.0, 0.35, 21.0)
        c.fov = 74; c.updateProjectionMatrix(); c.updateMatrixWorld(true)
        const nada = { wasPressed: () => false, isDown: () => false }
        for (let i=0;i<6;i++) G.encaixe.atualizar(1/60, nada)
        G.lighting.setTimeOfDay(0.30); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 600, semQuadro: true,
    },
    {
      nome: 'encaixe-2-vermelho',
      antes: `const c = G.camera
        c.position.set(45.6, 2.40, 23.6); c.lookAt(42.0, 0.35, 18.9)
        c.updateProjectionMatrix(); c.updateMatrixWorld(true)
        const nada = { wasPressed: () => false, isDown: () => false }
        for (let i=0;i<6;i++) G.encaixe.atualizar(1/60, nada)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
    {
      nome: 'encaixe-3-posta',
      antes: `const c = G.camera
        c.position.set(45.6, 2.40, 23.6); c.lookAt(43.0, 0.35, 21.0)
        c.updateProjectionMatrix(); c.updateMatrixWorld(true)
        const nada = { wasPressed: () => false, isDown: () => false }
        for (let i=0;i<6;i++) G.encaixe.atualizar(1/60, nada)
        G.encaixe.confirmar()
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
  ],
  // As teias de perto: silhueta rasgada, aranha e o balanco de vento.
  teia: [
    {
      nome: 'teia-1-canto',
      antes: `G.fluxo.foto(true)
        const c = G.camera
        c.position.set(38.6, 2.15, 17.0); c.lookAt(37.4, 2.75, 17.4)
        c.fov = 46; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.28); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        for (let i=0;i<60;i++) G.casa.update(1/60, G)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
    {
      nome: 'teia-2-fachada',
      antes: `const c = G.camera
        c.position.set(41.4, 2.05, 10.9); c.lookAt(40.2, 2.45, 12.1)
        c.fov = 48; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
  ],
  // Dentro da casa velha, de dia e de noite. E o par que mostra se a luz
  // interna resolve o "ta muito escuro dentro da casa".
  // Dentro da casa velha, de dia e de noite. E o par que mostra se a luz
  // interna resolve o "ta muito escuro dentro da casa".
  casaluz: [
    {
      nome: 'casa-luz-1-noite',
      antes: `G.fluxo.foto(true)
        G.lighting.pauseCycle = true
        const c = G.camera
        c.position.set(46.4, 1.95, 15.9); c.lookAt(40.6, 0.95, 13.1)
        c.fov = 70; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.80); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 500, semQuadro: true,
    },
    {
      nome: 'casa-luz-2-dia',
      antes: `const c = G.camera
        G.lighting.setTimeOfDay(0.22); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      nome: 'casa-luz-3-porta-noite',
      antes: `const c = G.camera
        c.position.set(44.2, 1.76, 15.4); c.lookAt(42.6, 0.45, 12.5)
        c.fov = 74; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.80); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      // A fachada VISTA DE FORA, a noite. A PointLight de dentro nao projeta
      // sombra (uma PointLight com sombra sao seis mapas por quadro), entao ela
      // atravessa a parede: esta foto e quem diz se o vazamento aparece.
      nome: 'casa-luz-5-fora-noite',
      antes: `const c = G.camera
        c.position.set(43.6, 2.20, 4.4); c.lookAt(43.2, 1.70, 12.0)
        c.fov = 58; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.80); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      nome: 'casa-luz-4-porta-dia',
      antes: `const c = G.camera
        G.lighting.setTimeOfDay(0.22); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
  ],
  cutscene: [
    {
      nome: 'tela-10-porao',
      // Pelo FLUXO de verdade: comecarPartida poe o jogo em 'abertura', e e
      // esse estado que faz o laco desenhar o porao em vez da cidade.
      //
      // As duas primeiras linhas desfazem o que os grupos ANTERIORES deixaram:
      // 'casa', 'barbeiro' e 'casaluz' chamam fluxo.foto(true), que trava a
      // camera e poe o estado em 'jogo' — e comecarPartida comeca com
      // `if (estado === 'abertura' || estado === 'jogo') return`. Rodando a
      // ferramenta SEM ARGUMENTO (todos os grupos em sequencia) a cutscene nao
      // saia do lugar e G.abertura ficava undefined. 'casaluz' ainda deixa o
      // ciclo de dia pausado no meio da noite.
      antes: `G.fluxo.foto(false)
        G.fluxo.menu()
        G.lighting.pauseCycle = false
        G.fluxo.comecar([
          { id:1, nome:'Iago',  aparencia:G.appearance, anfitriao:true },
          { id:2, nome:'Irmao', aparencia:Object.assign({}, G.appearance, {cabeca:4,cabelo:6,pele:5,blusa:9,calca:4,chapeu:2}), anfitriao:false },
          { id:3, nome:'Primo', aparencia:Object.assign({}, G.appearance, {cabeca:9,cabelo:3,pele:8,blusa:14,calca:7,colar:3}), anfitriao:false },
          { id:4, nome:'Amigo', aparencia:Object.assign({}, G.appearance, {cabeca:6,cabelo:8,pele:3,blusa:5,calca:9,chapeu:4}), anfitriao:false },
        ])
        for (let i=0;i<90;i++) G.abertura.atualizar(1/60)`,
      quadros: 3, espera: 500,
    },
    {
      nome: 'tela-11-porao-fala',
      antes: 'for (let i=0;i<450;i++) G.abertura.atualizar(1/60)',
      quadros: 3, espera: 400,
    },
    {
      // o instante do CASSINO: e onde todos falam e (agora) levantam juntos
      nome: 'tela-12-porao-cassino',
      antes: 'for (let i=0;i<1890;i++) G.abertura.atualizar(1/60)',
      quadros: 3, espera: 400,
    },
    {
      // a parte 2: a fila em frente a casa
      nome: 'tela-13-rua-fila',
      antes: 'for (let i=0;i<780;i++) G.abertura.atualizar(1/60)',
      quadros: 3, espera: 400,
    },
    {
      // O PRIMEIRO QUADRO DE JOGO, logo depois da cutscene. E a foto que prova
      // que o jogador nasce em 3a pessoa OLHANDO PRA CASA: com o yaw errado a
      // camera ia parar dentro da porta e a tela virava uma tabua.
      nome: 'tela-15-jogo-comeco',
      antes: `G.abertura.pular()
        for (let i=0;i<40;i++) G.player.update(1/60)
        G.player.mode = 'third'
        for (let i=0;i<40;i++) G.player.update(1/60)`,
      quadros: 8, espera: 600,
    },
    {
      // SOLO: um jogador so no sofa de quatro. E o caso que o dono nao ve, mas
      // que e o padrao pra quem joga sozinho.
      nome: 'tela-14-porao-solo',
      antes: `G.fluxo.foto(false)
        G.fluxo.menu()
        G.fluxo.comecar([{ id:1, nome:'Iago', aparencia:G.appearance, anfitriao:true }])
        for (let i=0;i<2430;i++) G.abertura.atualizar(1/60)`,
      quadros: 3, espera: 500,
    },
  ],
}

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

function acharNavegador() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado; defina CHROME_PATH')
}

const pedidos = process.argv.slice(2)
const grupos = pedidos.length ? pedidos.filter((g) => GRUPOS[g]) : Object.keys(GRUPOS)
const tomadas = grupos.flatMap((g) => GRUPOS[g])
if (!tomadas.length) {
  console.error('grupos validos: ' + Object.keys(GRUPOS).join(' '))
  process.exit(1)
}

const PORT = 9533 + (process.pid % 300)
const filho = spawn(acharNavegador(), [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-tela-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720',
  'about:blank',
], { stdio: 'ignore', detached: false })

async function esperarDebugger() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch (err) { void err }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('navegador nao abriu a porta de debug')
}

const browser = await puppeteer.connect({ browserWSEndpoint: await esperarDebugger() })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !/404|favicon|WebSocket/.test(m.text())) erros.push(m.text()) })

  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.menu', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2500))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  for (const t of tomadas) {
    await page.evaluate((codigo) => {
      const G = window.__game
      new Function('G', codigo)(G)
    }, t.antes)

    // Quadros forcados: em headless o rAF do jogo nao roda sozinho, entao as
    // transicoes que dependem do laco (o palco chegando no foco, a camera do
    // passeio) nunca sairiam do lugar.
    if (!t.semQuadro) {
      await page.evaluate((n) => new Promise((res) => {
        let i = 0
        const f = () => { (++i >= (n || 20)) ? res(i) : requestAnimationFrame(f) }
        requestAnimationFrame(f)
      }), t.quadros || 20)
    }
    if (t.espera) await new Promise((r) => setTimeout(r, t.espera))

    const arq = path.join(dir, t.nome.replace(/[^a-z0-9_-]/gi, '') + '.png')
    await page.screenshot({ path: arq })
    console.log(arq)
    const diag = await page.evaluate(() => window.__diagTexto || '')
    if (diag) { console.log(diag); await page.evaluate(() => { window.__diagTexto = '' }) }
  }

  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 12).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
}
