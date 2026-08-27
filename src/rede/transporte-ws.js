/* =========================================================
   rede/transporte-ws.js — WebSocket.

   O que ele é: confiável e ordenado (roda sobre TCP).
   O que isso custa: se um pacote se perde, TODOS os que vieram
   depois ficam presos esperando a retransmissão. É o famoso
   head-of-line blocking. Numa rede boa você nem nota; com 5% de
   perda o boneco dos outros trava por 100-200 ms de vez em quando,
   e é exatamente aí que o empurrão parece quebrado.

   Serve muito bem para começar: funciona em qualquer lugar, o
   servidor é trivial e não precisa de certificado especial nem
   de porta UDP aberta. É o plano B honesto para quando o UDP
   estiver bloqueado (Wi-Fi corporativo, algumas operadoras).

   Aqui os dois canais são o mesmo canal. A distinção
   confiável/não-confiável só passa a existir de verdade em
   transporte-wt.js — mas o jogo já é escrito respeitando ela.

   ESTE ARQUIVO RODA NOS DOIS MUNDOS:
   no navegador usa o WebSocket nativo; no Node usa a biblioteca
   `ws`. É de propósito: assim o teste headless fala com o
   servidor pelo MESMO caminho que o jogo de verdade, inclusive
   com permessage-deflate negociado igual. Teste que usa outro
   transporte mede outra coisa.
   ========================================================= */
// ADAPTADO DO mago-pvp: corpo identico, invólucro trocado.
// O ramo Node com require('ws') saiu: aqui este arquivo so roda no navegador
// (o servidor fala com a lib "ws" direto, sem passar por este transporte).
// Sem efeito colateral no topo: quem carrega chama registrarWebSocket(T).
// Registrar durante a avaliacao do modulo criava ciclo com transporte.js e o
// bundle quebrava com "Cannot access ... before initialization".
export function registrarWebSocket(T) {
  'use strict';
  if (!T) throw new Error('carregue transporte.js antes de transporte-ws.js');

  const noNode = false;   // este arquivo so roda no navegador
  const WS = typeof WebSocket !== 'undefined' ? WebSocket : undefined;

  /* A mesma compressão que o servidor oferece. No navegador quem
     negocia é o próprio Chrome/Firefox e não dá para configurar —
     por isso o servidor é que manda no threshold. */
  const DEFLATE_CLIENTE = {
    zlibDeflateOptions: { level: 3, memLevel: 8 },
    zlibInflateOptions: { chunkSize: 16 * 1024 },
    clientNoContextTakeover: false,
    serverNoContextTakeover: false,
    threshold: 48,
  };

  function criar(opcoes) {
    opcoes = opcoes || {};
    const t = {
      estado: 'desligado',
      aoAbrir: null, aoReceber: null, aoFechar: null,
      _ws: null,
      bytesRecebidos: 0,
    };

    t.conectar = function (url) {
      return new Promise(function (ok, falha) {
        try {
          t.estado = 'ligando';
          const ws = noNode
            ? new WS(url, { perMessageDeflate: opcoes.comprimir === false ? false : DEFLATE_CLIENTE })
            : new WS(url);
          if (!noNode) ws.binaryType = 'arraybuffer';
          t._ws = ws;

          function abriu() {
            t.estado = 'ligado';
            if (t.aoAbrir) t.aoAbrir();
            ok();
          }
          function chegou(dados) {
            if (!t.aoReceber) return;
            let dv;
            if (typeof dados === 'string') return;          /* o jogo só fala binário */
            if (dados instanceof ArrayBuffer) dv = new DataView(dados);
            else if (ArrayBuffer.isView(dados)) dv = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);
            else return;
            t.bytesRecebidos += dv.byteLength;
            /* No WebSocket TUDO chega confiável, queira você ou não.
               O 'true' aqui é honesto: é o que este transporte entrega. */
            t.aoReceber(dv, true);
          }
          function fechou(motivo) {
            const antes = t.estado;
            t.estado = 'caiu';
            if (t.aoFechar) t.aoFechar(motivo || '');
            if (antes === 'ligando') falha(new Error('conexao fechou durante o aperto de mao'));
          }

          if (noNode) {
            ws.on('open', abriu);
            ws.on('message', function (d, bin) { if (bin !== false) chegou(d); });
            ws.on('error', function (e) { if (t.estado === 'ligando') falha(e); });
            ws.on('close', function (c, r) { fechou(String(r || '')); });
          } else {
            ws.onopen = abriu;
            ws.onmessage = function (ev) { chegou(ev.data); };
            ws.onerror = function () { if (t.estado === 'ligando') falha(new Error('nao conectou')); };
            ws.onclose = function (ev) { fechou(ev.reason); };
          }
        } catch (e) { t.estado = 'caiu'; falha(e); }
      });
    };

    /* 'confiavel' é ignorado: no TCP tudo é confiável. O jogo manda
       o parâmetro assim mesmo, porque no dia em que isto virar
       datagrama o jogo não pode precisar mudar. */
    t.enviar = function (buf) {
      const ws = t._ws;
      if (!ws) return false;
      const pronto = noNode ? ws.readyState === 1 : ws.readyState === 1;
      if (!pronto) return false;
      /* bufferedAmount subindo = o TCP está engasgado. Segurar aqui é
         melhor que empilhar estado velho que já vai nascer atrasado. */
      const buf_ = noNode ? ws.bufferedAmount : ws.bufferedAmount;
      if (buf_ > 262144) return false;
      try { noNode ? ws.send(Buffer.from(new Uint8Array(buf))) : ws.send(buf); }
      catch (e) { return false; }
      return true;
    };

    t.fechar = function () {
      if (t._ws) { try { t._ws.close(); } catch (e) { /* já estava fechado */ } }
      t._ws = null;
      t.estado = 'desligado';
    };

    return t;
  }

  criar.suportado = function () { return typeof WS !== 'undefined'; };

  T.registrar('websocket', criar);
  return T;
}

export default registrarWebSocket;
