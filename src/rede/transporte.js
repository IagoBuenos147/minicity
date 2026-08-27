/* =========================================================
   rede/transporte.js — a fronteira do transporte.

   O jogo inteiro só conhece isto:

       t.conectar(url)
       t.enviar(buffer, confiavel)
       t.aoAbrir / t.aoReceber / t.aoFechar
       t.fechar()

   Nada além deste arquivo e dos seus irmãos sabe se por baixo
   tem WebSocket, WebTransport ou WebRTC. Trocar de transporte
   é trocar uma string em Transporte.criar().

   DUAS DECISÕES QUE PRECISAM SER TOMADAS AGORA, NÃO DEPOIS:

   1. enviar(buf, confiavel) tem DOIS canais desde o começo.
      Estado e input vão no canal NÃO confiável (o mais novo manda,
      perdeu tudo bem). Entrar na sala, morrer, começar a partida
      vão no confiável. No WebSocket os dois são a mesma coisa —
      mas o dia em que virar datagrama, o jogo não muda.

   2. O jogo é escrito assumindo que pacote SE PERDE, DUPLICA e
      CHEGA FORA DE ORDEM — mesmo rodando em WebSocket, que não
      faz nada disso. Se você programar confiando na ordem do TCP,
      trocar para datagrama depois quebra tudo de uma vez.
      Por isso existe o simulador logo abaixo: ligue a perda em 5%
      no primeiro dia e programe contra a rede ruim desde já.
   ========================================================= */
// ADAPTADO DO mago-pvp: o corpo e identico, so o invólucro mudou.
// La era UMD (module.exports / raiz.Transporte). Aqui o cliente e ESM
// empacotado pelo Vite, e o "require" do ramo Node vazava para o bundle
// ("ReferenceError: require is not defined" no navegador). Entao o invólucro
// virou export ESM. Continua registrando em globalThis.Transporte para quem
// preferir ler de la.
export const Transporte = (function () {
  'use strict';

  const T = {};
  const motores = {};

  /* Um motor de transporte se registra aqui. transporte-ws.js e
     transporte-wt.js fazem isso ao carregar. */
  T.registrar = function (nome, fabrica) { motores[nome] = fabrica; };
  T.disponiveis = function () { return Object.keys(motores); };

  /* Quais dão para usar NESTE navegador, agora. */
  T.suportados = function () {
    const fora = [];
    for (const nome in motores) {
      const f = motores[nome];
      if (!f.suportado || f.suportado()) fora.push(nome);
    }
    return fora;
  };

  /* Cria um transporte. Se pedir 'auto', pega o melhor disponível
     na ordem de preferência. */
  T.criar = function (nome, opcoes) {
    opcoes = opcoes || {};
    if (nome === 'auto') {
      const ordem = opcoes.ordem || ['webtransport', 'websocket'];
      for (let i = 0; i < ordem.length; i++) {
        const f = motores[ordem[i]];
        if (f && (!f.suportado || f.suportado())) { nome = ordem[i]; break; }
      }
      if (nome === 'auto') throw new Error('nenhum transporte disponível');
    }
    const fabrica = motores[nome];
    if (!fabrica) throw new Error('transporte desconhecido: ' + nome);

    const base = fabrica(opcoes);
    base.nome = nome;
    /* o simulador embrulha o motor real e devolve a MESMA interface */
    return opcoes.simular ? T.simular(base, opcoes.simular) : base;
  };

  /* =======================================================
     SIMULADOR DE REDE RUIM

     Embrulha qualquer transporte e atrasa, perde, embaralha e
     duplica pacotes nos dois sentidos. É a peça que faz você
     descobrir os bugs de rede na sua máquina, hoje, e não no
     dia do lançamento.
     ======================================================= */
  T.simular = function (alvo, cfg) {
    cfg = cfg || {};
    /* Quem decide se um pacote pode se perder é o PROTOCOLO, pelo
       tipo dele — não o transporte, que não sabe o que é importante,
       nem o chamador, que esqueceria. Sem isto o simulador só
       derruba o que sai, e o teste de 5% de perda vira 2,5%. */
    const ehConfiavel = cfg.ehConfiavel || function () { return false; };
    const s = {
      latencia: cfg.latencia || 0,      /* ms de ida (RTT = 2x) */
      jitter: cfg.jitter || 0,          /* variação, ms */
      perda: cfg.perda || 0,            /* 0..1 */
      duplicar: cfg.duplicar || 0,      /* 0..1 */
      ligado: cfg.ligado !== false,
    };

    const env = {
      nome: alvo.nome, sim: s, base: alvo,
      aoAbrir: null, aoReceber: null, aoFechar: null,
      get estado() { return alvo.estado; },
    };

    function atraso() {
      if (!s.ligado || s.latencia <= 0) return 0;
      const j = s.jitter ? (Math.random() * 2 - 1) * s.jitter : 0;
      return Math.max(0, s.latencia + j);
    }
    function passa() { return !s.ligado || s.perda <= 0 || Math.random() >= s.perda; }

    /* setTimeout com atrasos diferentes já reordena os pacotes
       sozinho, que é justo o que uma rede real faz. */
    function agendar(fn) {
      const d = atraso();
      if (d <= 0) fn(); else setTimeout(fn, d);
    }

    alvo.aoAbrir = function () { if (env.aoAbrir) env.aoAbrir(); };
    alvo.aoFechar = function (m) { if (env.aoFechar) env.aoFechar(m); };
    alvo.aoReceber = function (dv) {
      /* canal confiável nunca perde nem reordena, nem no simulador:
         é o que o transporte real garante. Só atrasa. */
      const confiavel = ehConfiavel(dv);
      if (confiavel) { agendar(function () { if (env.aoReceber) env.aoReceber(dv, true); }); return; }
      if (!passa()) return;
      agendar(function () { if (env.aoReceber) env.aoReceber(dv, false); });
      if (s.ligado && s.duplicar > 0 && Math.random() < s.duplicar) {
        agendar(function () { if (env.aoReceber) env.aoReceber(dv, false); });
      }
    };

    env.conectar = function (url) { return alvo.conectar(url); };
    env.fechar = function () { return alvo.fechar(); };
    env.enviar = function (buf, confiavel) {
      if (confiavel === undefined) confiavel = ehConfiavel(buf);
      if (confiavel) { agendar(function () { alvo.enviar(buf, true); }); return; }
      if (!passa()) return;
      agendar(function () { alvo.enviar(buf, false); });
      if (s.ligado && s.duplicar > 0 && Math.random() < s.duplicar) {
        agendar(function () { alvo.enviar(buf, false); });
      }
    };

    return env;
  };

  return T;
})();

if (typeof globalThis !== 'undefined') globalThis.Transporte = Transporte;
export default Transporte;
