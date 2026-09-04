/* sw.js — service worker. Duas responsabilidades, nada alem disso:
   1. deixar o app funcionar sem sinal (cache do esqueleto);
   2. acordar em segundo plano e disparar o ritual — o Plano A da secao 7.

   O que este arquivo NAO faz e proposital: setTimeout nao sobrevive ao SW ser
   morto, e a Notification Triggers API nunca foi adotada. O unico gancho de
   segundo plano disponivel hoje e o periodicsync abaixo, e e exatamente ele que
   a semana de medicao esta julgando. */

importScripts('./nucleo.js');

/* SUBIR ESTE NUMERO A CADA PUBLICACAO.

   O cache novo e montado inteiro de uma vez (addAll no install) e o antigo e
   apagado no activate, entao HTML, CSS e JS trocam juntos. Sem isso os arquivos
   chegam um a um e existe uma janela em que o app.js novo roda com o index.html
   velho — foi o que deu tela branca em 04/09/2026. */
var CACHE = 'agenda-v5';

var ESQUELETO = [
  './',
  './index.html',
  './styles.css',
  './nucleo.js',
  './app.js',
  './manifest.json',
  './icone-192.png',
  './icone-512.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ESQUELETO); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) {
        if (n !== CACHE) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Responde do cache na hora e busca a versao nova por tras, para a proxima
   abertura. Cache puro abriria rapido e offline, mas prenderia o aparelho numa
   versao velha justo durante a semana em que o app vai ser corrigido; rede
   primeiro travaria a abertura no campo, sem sinal. Este e o meio termo:
   sempre abre, e se atualiza sozinho um lancamento depois. */
self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET') return;
  if (new URL(ev.request.url).origin !== self.location.origin) return;

  ev.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(ev.request).then(function (guardado) {
        var daRede = fetch(ev.request).then(function (resp) {
          if (resp && resp.ok) c.put(ev.request, resp.clone());
          return resp;
        }).catch(function () {
          return guardado || c.match('./index.html');
        });
        return guardado || daRede;
      });
    })
  );
});

/* ---------- o gatilho ---------- */

function avisar(ritual, registro) {
  return Nucleo.textoNotificacao(ritual).then(function (t) {
    return self.registration.showNotification(t.titulo, {
      body: t.corpo,
      icon: './icone-192.png',
      badge: './icone-192.png',
      tag: 'ritual-' + ritual.id,
      renotify: true,
      requireInteraction: true,   // nao pode sumir sozinha; o gatilho e o produto
      vibrate: [200, 100, 200],
      data: { ritual: ritual.id, dia: registro.dia }
    });
  });
}

self.addEventListener('periodicsync', function (ev) {
  if (ev.tag !== 'rituais') return;
  ev.waitUntil(
    Nucleo.varrer(new Date(), 'sw', avisar).catch(function (e) {
      return Nucleo.gravar('log', {
        chaveRitual: 'erro#' + Date.now(), tipo: 'erro', ritual: null,
        dia: Nucleo.dataISO(new Date()), realEm: new Date().toISOString(),
        detalhe: String(e && e.message ? e.message : e), detectadoPor: 'sw'
      });
    })
  );
});

/* Com o app aberto quem varre e a propria pagina (app.js), e o aviso vira faixa
   na tela em vez de notificacao — nao faz sentido notificar quem ja esta olhando.
   Por isso nao ha listener de 'message' aqui: seria um segundo caminho capaz de
   disparar a mesma notificacao duas vezes. */

self.addEventListener('notificationclick', function (ev) {
  ev.notification.close();
  var ritual = ev.notification.data && ev.notification.data.ritual;
  // Objecao do designer: a notificacao abre DENTRO do ritual, nao na abertura.
  // Um toque a menos as 7 da manha, com pressa.
  var destino = './?ritual=' + (ritual || '');
  ev.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (janelas) {
        for (var i = 0; i < janelas.length; i++) {
          if ('focus' in janelas[i]) {
            janelas[i].postMessage({ tipo: 'irParaRitual', ritual: ritual });
            return janelas[i].focus();
          }
        }
        return self.clients.openWindow(destino);
      })
  );
});
