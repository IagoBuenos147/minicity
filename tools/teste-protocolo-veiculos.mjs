// ---------------------------------------------------------------------------
// Ida e volta das mensagens de VEICULO, mais o comportamento da sala.
//
//   node tools/teste-protocolo-veiculos.mjs
//
// Por que um teste so de ida e volta importa: o protocolo e o unico ponto do
// jogo em que um erro nao aparece como erro. Um offset trocado nao lanca
// excecao — ele entrega um numero errado, o carro anda pra dentro do predio na
// tela do outro, e nao ha nada no console. Escrever e ler de volta e a unica
// forma de pegar isso antes do jogador.
//
// Sai com codigo 1 se algum caso falhar.
// ---------------------------------------------------------------------------

import * as Proto from '../src/comum/protocolo.js'
import { criarSala } from '../servidor/sala.js'
import { VERSAO_PROTOCOLO, VEICULOS, HELI_ID_MIN, HELI_ID_MAX } from '../src/comum/mundo.js'

const casos = []
function ok(nome, passou, detalhe) {
  casos.push({ nome, passou })
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}

/** i16 = rad*1000: o erro maximo de um angulo que voltou e meio milesimo. */
const PERTO = (a, b, tol = 0.001) => Math.abs(a - b) <= tol
/* f32 e MENOS preciso que o double do JS: 0.16 escrito em f32 e lido de volta
   nao e o 0.16 do JS, e nunca vai ser. Comparar com === aqui reprovaria o
   protocolo por fazer exatamente o que ele promete (~7 casas decimais). */
const F32 = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))
const dv = (buf) => new DataView(buf)

// ---------------------------------------------------------------- 1. numeros
ok('tipos novos batem com o contrato',
  Proto.P.ENTRAR_VEICULO === 14 && Proto.P.SAIR_VEICULO === 15
  && Proto.P.VEICULO_POS === 16 && Proto.P.CRIAR_HELI === 17
  && Proto.P.VEICULO_DONO === 141 && Proto.P.HELI_CRIADO === 142,
  '14,15,16,17,141,142')

ok('canal: so VEICULO_POS e nao confiavel',
  Proto.ehConfiavel(Proto.P.ENTRAR_VEICULO) === true
  && Proto.ehConfiavel(Proto.P.SAIR_VEICULO) === true
  && Proto.ehConfiavel(Proto.P.CRIAR_HELI) === true
  && Proto.ehConfiavel(Proto.P.VEICULO_POS) === false
  && Proto.ehConfiavel(Proto.P.VEICULO_DONO) === true
  && Proto.ehConfiavel(Proto.P.HELI_CRIADO) === true)

ok('faixas de id', Proto.ehIdDeVeiculo(4000) && Proto.ehIdDeVeiculo(4999)
  && !Proto.ehIdDeVeiculo(3999) && !Proto.ehIdDeVeiculo(5000)
  && Proto.ehIdDeHeli(HELI_ID_MIN) && Proto.ehIdDeHeli(HELI_ID_MAX)
  && !Proto.ehIdDeHeli(4000))

// ------------------------------------------------------------ 2. ida e volta
{
  const b = Proto.escreverEntrarVeiculo(4001)
  const m = Proto.lerEntrarVeiculo(dv(b))
  ok('ENTRAR_VEICULO ida e volta', b.byteLength === 3 && m && m.veicId === 4001,
    b.byteLength + ' bytes, veicId ' + (m && m.veicId))
}
{
  const b = Proto.escreverSairVeiculo(4002)
  const m = Proto.lerSairVeiculo(dv(b))
  ok('SAIR_VEICULO ida e volta', b.byteLength === 3 && m && m.veicId === 4002,
    b.byteLength + ' bytes, veicId ' + (m && m.veicId))
}
{
  // rolagem negativa de proposito: a moto deitando pra esquerda e o caso que
  // um u16 no lugar do i16 quebraria em silencio
  const b = Proto.escreverVeiculoPos(4123, -12.5, 3.25, 40.75, 2.4, -0.618)
  const m = Proto.lerVeiculoPos(dv(b))
  ok('VEICULO_POS ida e volta', b.byteLength === 19 && m
    && m.veicId === 4123 && m.x === -12.5 && m.y === 3.25 && m.z === 40.75
    && PERTO(m.yaw, 2.4) && PERTO(m.rolagem, -0.618),
    b.byteLength + ' bytes, rolagem ' + (m && m.rolagem.toFixed(3)))
}
{
  const b = Proto.escreverCriarHeli(8.5, 0.16, -20.25, -3.1)
  const m = Proto.lerCriarHeli(dv(b))
  ok('CRIAR_HELI ida e volta', b.byteLength === 15 && m
    && m.x === 8.5 && F32(m.y, 0.16) && m.z === -20.25 && PERTO(m.yaw, -3.1),
    b.byteLength + ' bytes')
}
{
  const b = Proto.escreverVeiculoDono(4000, 7, 3.2, 0, -5.4, Math.PI / 2)
  const m = Proto.lerVeiculoDono(dv(b))
  ok('VEICULO_DONO ida e volta', b.byteLength === 19 && m
    && m.veicId === 4000 && m.donoId === 7
    && F32(m.x, 3.2) && F32(m.z, -5.4) && PERTO(m.yaw, Math.PI / 2),
    b.byteLength + ' bytes')
}
{
  const b = Proto.escreverHeliCriado(4100, 3, 1.5, 0.16, 2.5, 0.75)
  const m = Proto.lerHeliCriado(dv(b))
  ok('HELI_CRIADO ida e volta', b.byteLength === 19 && m
    && m.veicId === 4100 && m.dono === 3 && PERTO(m.yaw, 0.75),
    b.byteLength + ' bytes')
}

// ------------------------------------------------- 3. pacote torto vira null
{
  // A regra 3 do protocolo: leitor confere byteLength e devolve NULL. Um
  // leitor que lanca excecao derruba o laco de rede inteiro por um byte.
  const curto = Proto.escreverVeiculoPos(4000, 1, 2, 3, 0, 0).slice(0, 12)
  const trocado = Proto.escreverEntrarVeiculo(4000)
  let lancou = false
  let r1, r2, r3
  try {
    r1 = Proto.lerVeiculoPos(curto)
    r2 = Proto.lerSairVeiculo(trocado)      // tipo 14 lido como 15
    r3 = Proto.lerHeliCriado(new ArrayBuffer(0))
  } catch (e) { lancou = true }
  ok('pacote curto / tipo trocado / vazio devolvem null sem lancar',
    !lancou && r1 === null && r2 === null && r3 === null)
}
{
  // NaN nao pode atravessar: viraria um veiculo no infinito, que some da tela
  const m = Proto.lerVeiculoPos(dv(Proto.escreverVeiculoPos(4000, NaN, Infinity, 3, NaN, 0)))
  ok('NaN/Infinito viram 0 na saida', m && m.x === 0 && m.y === 0 && m.z === 3 && m.yaw === 0)
}

// --------------------------------------------------- 4. a sala de verdade
// Conexoes de mentira: guardam o que receberiam. Nao ha socket nenhum aqui.
function conFalsa(nome) {
  return {
    nome, jogador: null, recebidos: [],
    enviar(buf) { this.recebidos.push(new DataView(buf)) },
    fechar() { },
    /** Ultimo pacote de um tipo, ja lido. null se nunca chegou. */
    ultimo(tipo, ler) {
      for (let i = this.recebidos.length - 1; i >= 0; i--) {
        if (this.recebidos[i].getUint8(0) === tipo) return ler(this.recebidos[i])
      }
      return null
    },
    conta(tipo) {
      let n = 0
      for (const d of this.recebidos) if (d.getUint8(0) === tipo) n++
      return n
    },
  }
}

const sala = criarSala({})
const A = conFalsa('A'), B = conFalsa('B')
const ja = sala.entrar(A, { versao: VERSAO_PROTOCOLO, nome: 'Ana', aparencia: {} })
const jb = sala.entrar(B, { versao: VERSAO_PROTOCOLO, nome: 'Beto', aparencia: {} })
// os dois estao no spawn (2, 0, 9); o carro esta a poucos metros
ja.x = 3.2; ja.z = -5.4
jb.x = 3.2; jb.z = -5.4

const CARRO = VEICULOS[0].id, MOTO = VEICULOS[1].id
const envia = (jog, buf) => sala.aoPacote(jog.con, new DataView(buf))

// -- A entra no carro
envia(ja, Proto.escreverEntrarVeiculo(CARRO))
{
  const naA = A.ultimo(Proto.P.VEICULO_DONO, Proto.lerVeiculoDono)
  const naB = B.ultimo(Proto.P.VEICULO_DONO, Proto.lerVeiculoDono)
  ok('entrar avisa TODOS quem e o dono',
    naA && naA.veicId === CARRO && naA.donoId === ja.id
    && naB && naB.donoId === ja.id, 'dono ' + (naA && naA.donoId))
}

// -- B pede o mesmo carro: NEGADO, e o dono nao muda
B.recebidos.length = 0
envia(jb, Proto.escreverEntrarVeiculo(CARRO))
{
  const neg = B.ultimo(Proto.P.NEGADO, Proto.lerNegado)
  ok('segundo a pedir leva NEGADO e o dono nao muda',
    neg && neg.oque === Proto.NEGADO_VEICULO && neg.id === CARRO
    && sala.veiculos.get(CARRO).dono === ja.id)
}

// -- A manda a pose: chega em B, e NAO volta pra A
A.recebidos.length = 0; B.recebidos.length = 0
envia(ja, Proto.escreverVeiculoPos(CARRO, 11.5, 0, -5.4, 1.25, -0.4))
{
  const emB = B.ultimo(Proto.P.VEICULO_POS, Proto.lerVeiculoPos)
  ok('VEICULO_POS do dono e reenviado aos OUTROS (e nao a ele mesmo)',
    emB && emB.veicId === CARRO && emB.x === 11.5 && PERTO(emB.rolagem, -0.4)
    && A.conta(Proto.P.VEICULO_POS) === 0,
    'x ' + (emB && emB.x) + ', voltou pro dono: ' + A.conta(Proto.P.VEICULO_POS))
}

// -- B tenta dirigir o carro de A: silencio total
A.recebidos.length = 0; B.recebidos.length = 0
envia(jb, Proto.escreverVeiculoPos(CARRO, -99, 0, -99, 0, 0))
{
  const v = sala.veiculos.get(CARRO)
  ok('VEICULO_POS de quem nao e dono e ignorado EM SILENCIO',
    v.x === 11.5 && A.recebidos.length === 0 && B.recebidos.length === 0)
}

// -- A entra na moto sem sair do carro: o carro e liberado sozinho
A.recebidos.length = 0; B.recebidos.length = 0
ja.x = 7; ja.z = -5.4
envia(ja, Proto.escreverEntrarVeiculo(MOTO))
{
  const carro = sala.veiculos.get(CARRO), moto = sala.veiculos.get(MOTO)
  // o carro tem que ter ficado ONDE PAROU, nao onde estava estacionado
  ok('entrar noutro veiculo larga o primeiro, onde ele parou',
    carro.dono === 0 && carro.x === 11.5 && moto.dono === ja.id
    && B.conta(Proto.P.VEICULO_DONO) === 2, 'carro x ' + carro.x)
}

// -- sair duas vezes: a segunda nao faz nada (idempotente)
B.recebidos.length = 0
envia(ja, Proto.escreverSairVeiculo(MOTO))
envia(ja, Proto.escreverSairVeiculo(MOTO))
ok('SAIR_VEICULO e idempotente',
  sala.veiculos.get(MOTO).dono === 0 && B.conta(Proto.P.VEICULO_DONO) === 1,
  'avisos: ' + B.conta(Proto.P.VEICULO_DONO))

// -- cair a conexao libera na hora
envia(jb, Proto.escreverEntrarVeiculo(CARRO))
A.recebidos.length = 0
sala.sair(jb)
ok('cair a conexao libera o veiculo e avisa todos',
  sala.veiculos.get(CARRO).dono === 0
  && A.ultimo(Proto.P.VEICULO_DONO, Proto.lerVeiculoDono).donoId === 0)

// -- helicoptero: o id sai do servidor, na faixa, e nasce LIVRE
A.recebidos.length = 0
envia(ja, Proto.escreverCriarHeli(ja.x + 3, 0, ja.z, 1.0))
const hc = A.ultimo(Proto.P.HELI_CRIADO, Proto.lerHeliCriado)
ok('CRIAR_HELI: id do servidor na faixa 4100..4999, dono = quem montou, livre',
  hc && Proto.ehIdDeHeli(hc.veicId) && hc.dono === ja.id
  && sala.veiculos.get(hc.veicId).dono === 0, 'id ' + (hc && hc.veicId))

// -- dois helicopteros nunca herdam o mesmo id
envia(ja, Proto.escreverCriarHeli(ja.x + 3, 0, ja.z, 0))
const heli2 = [...sala.veiculos.values()].filter((v) => v.heli)
ok('ids de helicoptero nao se repetem',
  heli2.length === 2 && heli2[0].id !== heli2[1].id,
  heli2.map((v) => v.id).join(', '))

// -- quem entra depois recebe o que ja existe
envia(ja, Proto.escreverEntrarVeiculo(hc.veicId))
const C = conFalsa('C')
sala.entrar(C, { versao: VERSAO_PROTOCOLO, nome: 'Caio', aparencia: {} })
{
  const iHeli = C.recebidos.findIndex((d) => d.getUint8(0) === Proto.P.HELI_CRIADO
    && Proto.lerHeliCriado(d).veicId === hc.veicId)
  const iDono = C.recebidos.findIndex((d) => d.getUint8(0) === Proto.P.VEICULO_DONO
    && Proto.lerVeiculoDono(d).veicId === hc.veicId)
  ok('quem entra depois recebe os helicopteros vivos, e o HELI_CRIADO vem ANTES do dono',
    C.conta(Proto.P.HELI_CRIADO) === 2 && iHeli >= 0 && iDono > iHeli,
    'helis ' + C.conta(Proto.P.HELI_CRIADO) + ', ordem ' + iHeli + ' < ' + iDono)
}

// -- veiculo livre e parado nao gasta banda nenhuma
ok('veiculo NAO entra no snapshot',
  !(new DataView(Proto.escreverSnapshot(1, [], [], [])).byteLength > 8)
  && C.conta(Proto.P.VEICULO_DONO) === 1,
  'so o ocupado foi anunciado')

// ---------------------------------------------------------------------------
const falhas = casos.filter((c) => !c.passou).length
console.log('\n' + (casos.length - falhas) + '/' + casos.length + ' casos passaram')
process.exit(falhas ? 1 : 0)
