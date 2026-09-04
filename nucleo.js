/* nucleo.js — logica compartilhada entre a pagina (app.js) e o service worker (sw.js).
   Carregado como script classico nos dois lados. Nao depende de nada externo.

   FUSO: todos os horarios sao horario local do aparelho. O Brasil esta em UTC-3
   fixo desde 2019 (nao ha mais horario de verao). Este arquivo nunca converte para
   UTC — se o fuso voltar a mudar, e o unico lugar que precisa saber. */

(function (escopo) {
  'use strict';

  var DB_NOME = 'agenda';
  var DB_VERSAO = 1;

  // Decisao 5 da spec. Nenhum outro horario.
  var RITUAIS = [
    { id: 'abertura',       hora: '07:00', nome: 'Abertura' },
    { id: 'replanejamento', hora: '13:00', nome: 'Replanejamento' },
    { id: 'fechamento',     hora: '16:40', nome: 'Fechamento' }
  ];

  var DIAS_UTEIS = [1, 2, 3, 4, 5];

  // Quanto tempo depois do horario ainda vale disparar. Passado disso, o ritual
  // conta como AUSENTE na medicao. 90 min = ainda util (07:00 pego as 08:20 serve).
  var JANELA_MIN = 90;

  // Ate onde para tras a varredura procura ritual nao disparado. Impede que um
  // aparelho desligado por um mes gere 60 ausencias de uma vez.
  var VARREDURA_MAX_DIAS = 14;

  /* ---------- datas ---------- */

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function dataISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function ehDiaUtil(d) {
    return DIAS_UTEIS.indexOf(d.getDay()) !== -1;
  }

  // Instante local do ritual num dia especifico.
  function instanteRitual(d, ritual) {
    var partes = ritual.hora.split(':');
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                    parseInt(partes[0], 10), parseInt(partes[1], 10), 0, 0);
  }

  function minutosEntre(a, b) { return Math.round((b - a) / 60000); }

  function horaCurta(iso) {
    var d = new Date(iso);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ---------- IndexedDB ---------- */

  function abrirDB() {
    return new Promise(function (ok, erro) {
      var req = indexedDB.open(DB_NOME, DB_VERSAO);
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains('pendencias')) {
          var p = db.createObjectStore('pendencias', { keyPath: 'id' });
          p.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('rotinas')) {
          db.createObjectStore('rotinas', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('historico')) {
          db.createObjectStore('historico', { keyPath: 'data' });
        }
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'chave' });
        }
        // Registro de medicao do Dia 0. Ver secao 7 da spec.
        if (!db.objectStoreNames.contains('log')) {
          var l = db.createObjectStore('log', { keyPath: 'id', autoIncrement: true });
          l.createIndex('chaveRitual', 'chaveRitual', { unique: false });
        }
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { erro(req.error); };
    });
  }

  function lerTudo(store) {
    return abrirDB().then(function (db) {
      return new Promise(function (ok, erro) {
        var t = db.transaction(store, 'readonly');
        var r = t.objectStore(store).getAll();
        r.onsuccess = function () { db.close(); ok(r.result); };
        r.onerror = function () { db.close(); erro(r.error); };
      });
    });
  }

  function gravar(store, registro) {
    return abrirDB().then(function (db) {
      return new Promise(function (ok, erro) {
        var t = db.transaction(store, 'readwrite');
        var r = t.objectStore(store).put(registro);
        r.onsuccess = function () { db.close(); ok(r.result); };
        r.onerror = function () { db.close(); erro(r.error); };
      });
    });
  }

  /* ---------- config ---------- */

  function lerConfig(chave, padrao) {
    return abrirDB().then(function (db) {
      return new Promise(function (ok, erro) {
        var t = db.transaction('config', 'readonly');
        var r = t.objectStore('config').get(chave);
        r.onsuccess = function () {
          db.close();
          ok(r.result ? r.result.valor : padrao);
        };
        r.onerror = function () { db.close(); erro(r.error); };
      });
    });
  }

  function escreverConfig(chave, valor) {
    return gravar('config', { chave: chave, valor: valor });
  }

  /* ---------- log de medicao ----------

     Tres tipos de registro, e a distincao entre eles e o ponto inteiro do Dia 0:

       'sw'      o service worker disparou sozinho, em segundo plano.
                 E ISTO que a semana de medicao esta contando.
       'app'     ninguem disparou; o usuario abriu o app e a verificacao de
                 abertura correu atras. O aviso saiu, mas nao houve gatilho.
       'ausente' a janela de 90 min fechou sem nenhum dos dois. Perdido.

     Sem essa separacao nao da para distinguir "nao disparou" de "disparou e
     ninguem anotou", e a semana de medicao nao decide nada. */

  function chaveRitual(dia, ritualId) { return dia + '#' + ritualId; }

  function logDoRitual(chave) {
    return abrirDB().then(function (db) {
      return new Promise(function (ok, erro) {
        var t = db.transaction('log', 'readonly');
        var r = t.objectStore('log').index('chaveRitual').getAll(chave);
        r.onsuccess = function () { db.close(); ok(r.result); };
        r.onerror = function () { db.close(); erro(r.error); };
      });
    });
  }

  /* ---------- varredura de rituais ----------

     Uma unica funcao, usada pelos dois lados:
       - o service worker chama com fonte 'sw' quando o periodicsync acorda;
       - a pagina chama com fonte 'app' a cada abertura, a cada volta do segundo
         plano, e de minuto em minuto enquanto estiver aberta.

     'aoDisparar' recebe (ritual, registro) e decide como avisar: notificacao no
     SW, faixa na tela no app. Resolve com a lista do que aconteceu. */

  function varrer(agora, fonte, aoDisparar) {
    return lerConfig('ultimaVarredura', null).then(function (marca) {
      // Sem marca d'agua nao ha nada a recuperar: o app acabou de ser instalado
      // e um ritual anterior a instalacao nao pode contar como perdido. Isso
      // manteria a medicao da semana suja logo no primeiro dia.
      var inicio = marca ? new Date(marca) : new Date(agora.getTime());
      var limite = new Date(agora.getTime() - VARREDURA_MAX_DIAS * 86400000);
      if (inicio < limite) inicio = limite;

      var candidatos = [];
      var d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
      var fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
      while (d <= fim) {
        if (ehDiaUtil(d)) {
          for (var i = 0; i < RITUAIS.length; i++) {
            var quando = instanteRitual(d, RITUAIS[i]);
            // A comparacao e com o INSTANTE da marca, nao com o dia dela: um
            // ritual que ja tinha passado quando a varredura anterior rodou nao
            // volta a ser candidato.
            if (quando > inicio && quando <= agora) {
              candidatos.push({ ritual: RITUAIS[i], esperado: quando, dia: dataISO(d) });
            }
          }
        }
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      }

      var acoes = [];
      var encadeado = Promise.resolve();
      candidatos.forEach(function (c) {
        encadeado = encadeado.then(function () {
          var chave = chaveRitual(c.dia, c.ritual.id);
          return logDoRitual(chave).then(function (existente) {
            if (existente && existente.length) return null;  // ja resolvido
            var atraso = minutosEntre(c.esperado, agora);
            if (atraso <= JANELA_MIN) {
              var reg = {
                chaveRitual: chave, tipo: fonte, ritual: c.ritual.id,
                dia: c.dia, esperadoEm: c.esperado.toISOString(),
                realEm: agora.toISOString(), atrasoMin: atraso
              };
              return gravar('log', reg).then(function () {
                acoes.push(reg);
                return aoDisparar ? aoDisparar(c.ritual, reg) : null;
              });
            }
            var falta = {
              chaveRitual: chave, tipo: 'ausente', ritual: c.ritual.id,
              dia: c.dia, esperadoEm: c.esperado.toISOString(),
              realEm: agora.toISOString(), atrasoMin: atraso, detectadoPor: fonte
            };
            return gravar('log', falta).then(function () { acoes.push(falta); });
          });
        });
      });

      return encadeado
        .then(function () { return escreverConfig('ultimaVarredura', agora.toISOString()); })
        .then(function () { return acoes; });
    });
  }

  /* ---------- ordenacao das listas (decisao 11) ----------

     "3 do dia -> prazo chegando -> mais antigo primeiro."

     Quem ordena e o app, nunca o usuario: a decisao 10 manda mostrar a lista do
     contexto ja ordenada, e nao um item de cada vez. Ele bate o olho e ve o que
     vem primeiro, sem ter que escolher.

     Funcao pura, sem banco, para poder ser testada em node. */

  var IDADE_ALERTA = 14;      // a partir daqui a lista mostra a idade do item
  var AVISO_PRAZO_DIAS = 2;   // item com data entra na ordenacao 2 dias antes

  /* "As 3 do dia valem so para aquele dia. Nao sobrevivem a virada sem passar
     pelo ritual" (secao 6). A marca fica gravada no item com a data em que foi
     dada; virou o dia, ela deixa de valer sozinha, sem ninguem precisar limpar
     nada. Uma marca de ontem encontrada hoje e simplesmente ignorada. */
  function ehTop3(p, agora) {
    return !!(p.prioridade && p.prioridade.ehTop3
              && p.prioridade.data === dataISO(agora));
  }

  function pesoOrdem(p, agora) {
    // 1. as 3 do dia — e so as de hoje
    if (ehTop3(p, agora)) return 0;

    // 2. prazo chegando, ou ja vencido
    if (p.prazo && p.prazo.tipo === 'data' && p.prazo.data) {
      var limite = dataISO(new Date(agora.getFullYear(), agora.getMonth(),
                                    agora.getDate() + AVISO_PRAZO_DIAS));
      if (p.prazo.data <= limite) return 1;
    }

    // 3. "esta semana" ganha prioridade a partir de quinta (secao 6)
    if (p.prazo && p.prazo.tipo === 'semana' && agora.getDay() >= 4) return 2;

    return 3;
  }

  function ordenar(lista, agora) {
    return lista.slice().sort(function (a, b) {
      var pa = pesoOrdem(a, agora), pb = pesoOrdem(b, agora);
      if (pa !== pb) return pa - pb;

      var da = (a.prazo && a.prazo.tipo === 'data' && a.prazo.data) ? a.prazo.data : '9999-12-31';
      var db = (b.prazo && b.prazo.tipo === 'data' && b.prazo.data) ? b.prazo.data : '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;

      return String(a.criadoEm).localeCompare(String(b.criadoEm));  // mais antigo primeiro
    });
  }

  function idadeDias(p, agora) {
    return Math.floor((agora - new Date(p.criadoEm)) / 86400000);
  }

  /* Quais sao "as 3 do dia" depois de uma troca (spec 5.5 passo 4).

     A tela de troca so mostra o que ainda esta ativo, entao uma das 3 que ja foi
     concluida nao aparece nela e nao entra na nova selecao. Se o registro do dia
     virasse so a selecao, essa concluida sumiria — e o placar mostraria menos do
     que ele entregou. Ela nao ocupa mais decisao nenhuma, mas continua definida
     para o dia. */
  function definidasAposTroca(selecao, jaConcluidas) {
    var fora = (jaConcluidas || []).filter(function (id) {
      return (selecao || []).indexOf(id) === -1;
    });
    return (selecao || []).concat(fora);
  }

  /* ---------- numero concreto para a notificacao ----------
     Decisao 16: a notificacao traz numero, nunca texto generico.
     No Dia 0 o unico numero real que existe e a fila de triagem. */

  function contarTriagem() {
    return lerTudo('pendencias').then(function (lista) {
      return lista.filter(function (p) { return p.status === 'nova'; }).length;
    }).catch(function () { return 0; });
  }

  function textoNotificacao(ritual) {
    return contarTriagem().then(function (n) {
      var corpo;
      if (ritual.id === 'abertura') {
        corpo = n === 0 ? 'Fila vazia. Escolher as 3 do dia.'
                        : n + (n === 1 ? ' anotação para triar' : ' anotações para triar');
      } else if (ritual.id === 'replanejamento') {
        corpo = n === 0 ? 'Placar da manhã. 2 minutos.'
                        : n + (n === 1 ? ' anotação nova na fila' : ' anotações novas na fila');
      } else {
        corpo = 'Fechar o dia. 2 minutos.';
      }
      return { titulo: ritual.hora + ' · ' + ritual.nome, corpo: corpo };
    });
  }

  escopo.Nucleo = {
    RITUAIS: RITUAIS, JANELA_MIN: JANELA_MIN, DIAS_UTEIS: DIAS_UTEIS,
    dataISO: dataISO, ehDiaUtil: ehDiaUtil, instanteRitual: instanteRitual,
    minutosEntre: minutosEntre, pad: pad, horaCurta: horaCurta,
    abrirDB: abrirDB, lerTudo: lerTudo, gravar: gravar,
    lerConfig: lerConfig, escreverConfig: escreverConfig,
    chaveRitual: chaveRitual, logDoRitual: logDoRitual,
    varrer: varrer, contarTriagem: contarTriagem, textoNotificacao: textoNotificacao,
    IDADE_ALERTA: IDADE_ALERTA, AVISO_PRAZO_DIAS: AVISO_PRAZO_DIAS,
    pesoOrdem: pesoOrdem, ordenar: ordenar, idadeDias: idadeDias, ehTop3: ehTop3, definidasAposTroca: definidasAposTroca
  };
})(typeof self !== 'undefined' ? self : this);
