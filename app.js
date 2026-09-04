/* app.js — a pagina. Tres telas de verdade (primeira execucao, abertura, anotar),
   duas de esqueleto (onde estou, ritual) e a tela de medicao, que e o motivo do
   Dia 0 existir.

   Ordem de leitura: rotas -> primeira execucao -> abertura -> anotar -> relogio
   -> medicao. */

'use strict';

const tela = (id) => document.getElementById('tela-' + id);
const el = (id) => document.getElementById(id);

const TELAS = ['primeira', 'abertura', 'anotar', 'onde', 'lista',
               'ritual', 'triagem', 'escolher', 'medicao'];
let telaAtual = null;

/* Toda leitura de elemento aqui tolera o elemento nao existir.

   Motivo, aprendido na marra: o service worker atualiza os arquivos um a um,
   entao existe uma janela em que o app.js novo roda com o index.html velho. Se
   o codigo novo procurar uma tela que ainda nao existe no HTML e estourar, o
   app nao desenha NADA — tela branca, sem botao, sem saida. Melhor um botao que
   ainda nao funciona do que um app que nao abre. */

function mostrar(nome) {
  TELAS.forEach((t) => { const s = tela(t); if (s) s.hidden = (t !== nome); });
  telaAtual = nome;
  window.scrollTo(0, 0);
}

// Executa fn(elemento) so se o elemento existir.
function com(id, fn) {
  const alvo = el(id);
  if (!alvo) { console.warn('elemento ausente (versao em transicao):', id); return; }
  fn(alvo);
}

function ligar(id, evento, fn) {
  com(id, (alvo) => alvo.addEventListener(evento, fn));
}

let avisoAberto = null;

function toque(msg, ms) {
  mostrarAviso(msg, null, null, ms || 1600);
}

/* Aviso com uma saida. Nasceu do "concluir e um toque" da spec 5.3: um toque so
   e rapido, mas tambem e o que o dedo faz sem querer com o celular no bolso, e
   nao havia volta. Cinco segundos, e nao tres, porque o app e usado em pe e
   com pressa. */
function toqueComAcao(msg, rotulo, fn) {
  mostrarAviso(msg, rotulo, fn, 5000);
}

function mostrarAviso(msg, rotulo, fn, ms) {
  if (avisoAberto) { avisoAberto.remove(); avisoAberto = null; }

  const d = document.createElement('div');
  d.className = 'aviso-toque';
  const txt = document.createElement('span');
  txt.textContent = msg;
  d.appendChild(txt);

  if (rotulo && fn) {
    const b = document.createElement('button');
    b.textContent = rotulo;
    b.addEventListener('click', () => {
      d.remove();
      if (avisoAberto === d) avisoAberto = null;
      fn();
    });
    d.appendChild(b);
  }

  document.body.appendChild(d);
  avisoAberto = d;
  setTimeout(() => {
    d.remove();
    if (avisoAberto === d) avisoAberto = null;
  }, ms);
}

/* =====================================================================
   1. Arranque
   ===================================================================== */

async function iniciar() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('service worker nao registrou', e);
    }
  }

  const instalado = await Nucleo.lerConfig('instalado', false);
  if (!instalado) {
    await semearRotinas();
    prepararPrimeiraVez();
    mostrar('primeira');
    return;
  }

  await abrirRotaInicial();
  ligarRelogio();
}

// Decisao 19: o app nasce com as 4 rotinas e nada mais.
async function semearRotinas() {
  const jaTem = await Nucleo.lerTudo('rotinas');
  if (jaTem.length) return;
  const fabrica = [
    { id: 'r1', texto: 'Revisar horas dos colaboradores',            contexto: 'computador', frequencia: 'semanal', diaSemana: 5 },
    { id: 'r2', texto: 'Levantar material a comprar da semana',      contexto: 'computador', frequencia: 'semanal', diaSemana: 1 },
    { id: 'r3', texto: 'Atualizar status dos projetos em andamento', contexto: 'computador', frequencia: 'semanal', diaSemana: 3 },
    { id: 'r4', texto: 'Passar na frente de serviço e anotar pendências', contexto: 'campo', frequencia: 'diaria', diaSemana: null }
  ];
  for (const r of fabrica) {
    await Nucleo.gravar('rotinas', Object.assign({ diaMes: null, ultimaExecucao: null }, r));
  }
}

async function abrirRotaInicial() {
  const p = new URLSearchParams(location.search);
  const ritual = p.get('ritual');
  const t = p.get('tela');

  // Limpa a query para o app nao reabrir o ritual a cada refresh.
  if (location.search) history.replaceState(null, '', location.pathname);

  if (ritual) { await abrirRitual(ritual); return; }
  if (t === 'anotar') { await pintarAbertura(); abrirAnotar(); return; }
  await pintarAbertura();
  mostrar('abertura');
}

/* =====================================================================
   2. Primeira execucao — a unica tela que pede alguma coisa
   ===================================================================== */

function prepararPrimeiraVez() {
  const estado = el('estado-permissao');
  const btn = el('btn-permitir');

  if (Notification.permission === 'granted') {
    estado.textContent = 'Avisos ativados.';
    estado.className = 'estado bom';
    btn.disabled = true;
  }

  btn.addEventListener('click', async () => {
    // requestPermission precisa do gesto do usuario: chamada direta, sem await antes.
    let resposta;
    try {
      resposta = await Notification.requestPermission();
    } catch (e) {
      resposta = 'denied';
    }
    if (resposta === 'granted') {
      estado.textContent = 'Avisos ativados.';
      estado.className = 'estado bom';
      btn.disabled = true;
      await pedirPersistencia();
      await registrarSyncPeriodico();
    } else {
      estado.textContent = 'Bloqueado. Sem isto o app não interrompe — '
                         + 'libere em Ajustes → Apps → Agenda → Notificações.';
      estado.className = 'estado ruim';
    }
  });

  el('btn-comecar').addEventListener('click', async () => {
    await Nucleo.escreverConfig('bateriaLiberada', el('chk-bateria').checked);
    await Nucleo.escreverConfig('instalado', true);
    await Nucleo.escreverConfig('instaladoEm', new Date().toISOString());
    // Marca d'agua: nada antes da instalacao conta como ritual perdido.
    await Nucleo.escreverConfig('ultimaVarredura', new Date().toISOString());
    await pintarAbertura();
    mostrar('abertura');
    ligarRelogio();
  });

  pedirPersistencia();
}

async function pedirPersistencia() {
  const alvo = el('estado-persistencia');
  if (!navigator.storage || !navigator.storage.persist) {
    alvo.textContent = 'Não suportado neste navegador.';
    alvo.className = 'estado ruim';
    await Nucleo.escreverConfig('persistencia', 'nao suportado');
    return;
  }
  let ok = await navigator.storage.persisted();
  if (!ok) ok = await navigator.storage.persist();
  alvo.textContent = ok ? 'Dados protegidos.' : 'O Android pode apagar os dados se o aparelho encher.';
  alvo.className = ok ? 'estado bom' : 'estado ruim';
  await Nucleo.escreverConfig('persistencia', ok ? 'concedida' : 'negada');
}

/* Plano A da secao 7. O Chrome decide o intervalo real — pedimos 30 min sabendo
   que ele provavelmente vai dar muito mais. E exatamente essa diferenca que a
   semana de medicao existe para revelar. */
async function registrarSyncPeriodico() {
  let resultado;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) {
      resultado = 'não suportado neste Chrome';
    } else {
      const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (perm.state !== 'granted') {
        resultado = 'permissão ' + perm.state + ' (o app precisa estar instalado na tela inicial)';
      } else {
        await reg.periodicSync.register('rituais', { minInterval: 30 * 60 * 1000 });
        resultado = 'registrado';
      }
    }
  } catch (e) {
    resultado = 'falhou: ' + (e && e.message ? e.message : e);
  }
  await Nucleo.escreverConfig('periodicSync', resultado);
  return resultado;
}

/* =====================================================================
   3. Abertura
   ===================================================================== */

/* Abaixo dos dois botoes so entra informacao, nunca acao (spec 5.1). Ele bate o
   olho e sabe como esta o dia; se quiser fazer algo, os dois botoes estao la em
   cima. A ordem e a da spec: o que saiu primeiro, a fila depois. */
async function pintarAbertura() {
  const hoje = Nucleo.dataISO(new Date());
  const dia = await lerDia(hoje);
  const feitas = dia.concluidas.length;
  const naFila = await Nucleo.contarTriagem();

  com('info-triagem', (x) => {
    const base = feitas === 0
      ? 'Nada concluído hoje ainda.'
      : feitas + (feitas === 1 ? ' concluída hoje' : ' concluídas hoje');
    // Placar das 3, so quando ha 3 definidas. Sem elas, o numero seria ruido.
    x.textContent = dia.top3Definidas.length
      ? base + '  ·  ' + dia.top3Concluidas.length + ' de ' + dia.top3Definidas.length + ' do dia'
      : base;
  });
  com('info-etapa', (x) => {
    x.textContent = naFila === 0
      ? 'Nada aguardando triagem.'
      : naFila + (naFila === 1 ? ' anotação aguardando triagem' : ' anotações aguardando triagem');
  });

  await pintarFaixa();
  await pintarHome();
}

/* A lista na abertura foi pedida pelo dono em 04/09/2026, contra a decisao 9 e
   a spec 5.1, que reservam a abertura para duas acoes e tres numeros. A objecao
   do guardiao foi feita e vencida pelo argumento certo: "saber o que fazer" e
   metade do principio norteador e estava a tres toques de distancia.

   Mistura os tres contextos, por isso cada linha diz de qual e — o "onde estou"
   continua sendo o caminho para filtrar quando ele esta num lugar so. */
async function pintarHome() {
  const alvo = el('home-lista');
  if (!alvo) return;

  const todas = await Nucleo.lerTudo('pendencias');
  const agora = new Date();
  const ativas = todas.filter((p) => p.status === 'ativa');
  const lista = Nucleo.ordenar(ativas, agora);

  const escolhidas = lista.filter((p) => Nucleo.ehTop3(p, agora)).length;
  com('home-cabecalho', (x) => { x.hidden = lista.length === 0; });
  com('home-placar', (x) => {
    x.textContent = escolhidas === 0 ? 'as 3 do dia' : escolhidas + ' do dia escolhidas';
  });
  com('btn-escolher3', (x) => { x.textContent = escolhidas === 0 ? 'escolher' : 'trocar'; });

  alvo.innerHTML = '';
  if (!lista.length) {
    const vazio = document.createElement('p');
    vazio.className = 'vazio';
    vazio.textContent = ativas.length === 0 && todas.length === 0
      ? 'Nada anotado ainda.'
      : 'Nada em aberto.';
    alvo.appendChild(vazio);
    return;
  }

  lista.forEach((p) => alvo.appendChild(
    linhaDoItem(p, agora, { contexto: true, repintar: pintarAbertura })
  ));
}

async function pintarFaixa() {
  const faixa = el('faixa-ritual');
  const hoje = Nucleo.dataISO(new Date());
  const log = await Nucleo.lerTudo('log');
  const aberto = await Nucleo.lerConfig('ultimoRitualAberto', null);

  const disparadosHoje = log
    .filter((r) => r.dia === hoje && (r.tipo === 'sw' || r.tipo === 'app'))
    .sort((a, b) => a.esperadoEm.localeCompare(b.esperadoEm));

  const pendente = disparadosHoje[disparadosHoje.length - 1];
  if (!pendente || pendente.chaveRitual === aberto) {
    faixa.hidden = true;
    return;
  }
  const ritual = Nucleo.RITUAIS.find((r) => r.id === pendente.ritual);
  faixa.hidden = false;
  faixa.textContent = ritual.hora + ' · ' + ritual.nome + ' — abrir';
  faixa.onclick = () => abrirRitual(ritual.id);
}

/* =====================================================================
   4. Anotar — dois toques da tela inicial ate estar digitando
   ===================================================================== */

function abrirAnotar() {
  const campo = el('campo');
  mostrar('anotar');
  campo.value = '';
  // focus() sincrono dentro do gesto: e o que faz o teclado do Android subir.
  // Qualquer await antes daqui e o teclado nao abre.
  campo.focus();
}

async function salvarAnotacao() {
  const campo = el('campo');
  const texto = campo.value.trim();
  if (!texto) { campo.focus(); return; }

  await Nucleo.gravar('pendencias', {
    id: 'p' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    texto: texto,
    origem: null,        // marcado na triagem, nunca na captura (decisao 8)
    contexto: null,
    prazo: { tipo: 'nenhum' },
    prioridade: { ehTop3: false, data: null },
    status: 'nova',
    espera: null,        // Etapa 2
    criadoEm: new Date().toISOString(),
    concluidoEm: null,
    revisadaEm: null     // Etapa 2
  });

  campo.value = '';
  campo.blur();
  await pintarAbertura();
  mostrar('abertura');
  toque('Anotado.');
}

/* =====================================================================
   5. Ritual — esqueleto instrumentado
   ===================================================================== */

async function abrirRitual(id) {
  const ritual = Nucleo.RITUAIS.find((r) => r.id === id) || Nucleo.RITUAIS[0];
  const hoje = Nucleo.dataISO(new Date());
  const chave = Nucleo.chaveRitual(hoje, ritual.id);

  const registros = await Nucleo.logDoRitual(chave);
  const disparo = registros.find((r) => r.tipo === 'sw' || r.tipo === 'app');

  el('ritual-titulo').textContent = ritual.hora + ' · ' + ritual.nome;
  if (disparo) {
    const atrasoAviso = disparo.atrasoMin;
    const atrasoAbertura = Nucleo.minutosEntre(new Date(disparo.esperadoEm), new Date());
    el('ritual-corpo').textContent =
      'Aviso saiu ' + atrasoAviso + ' min depois da hora (' + fonteEmPalavras(disparo.tipo) + '). '
      + 'Você chegou aqui ' + atrasoAbertura + ' min depois da hora.';
  } else {
    el('ritual-corpo').textContent = 'Aberto na mão, sem aviso.';
  }

  await Nucleo.gravar('log', {
    chaveRitual: chave + '#aberto',
    tipo: 'aberto', ritual: ritual.id, dia: hoje,
    esperadoEm: Nucleo.instanteRitual(new Date(), ritual).toISOString(),
    realEm: new Date().toISOString(),
    atrasoMin: Nucleo.minutosEntre(Nucleo.instanteRitual(new Date(), ritual), new Date()),
    detectadoPor: 'app'
  });
  await Nucleo.escreverConfig('ultimoRitualAberto', chave);

  const naFila = await Nucleo.contarTriagem();
  com('triar-quantas', (x) => { x.textContent = naFila ? '(' + naFila + ')' : ''; });
  com('btn-triar', (x) => { x.disabled = naFila === 0; });
  com('ritual-restante', (x) => {
    x.textContent = naFila === 0
      ? 'Nada para triar. Os outros passos do ritual entram em seguida.'
      : 'Os outros passos do ritual entram em seguida.';
  });

  mostrar('ritual');
}

function fonteEmPalavras(tipo) {
  if (tipo === 'sw') return 'sozinho, em segundo plano';
  if (tipo === 'app') return 'só quando o app abriu';
  return tipo;
}

/* =====================================================================
   4b. Onde estou — a outra metade do princípio norteador (spec 5.3)

   "Ao abrir o app existem so dois motivos possiveis: ou tenho algo para
   despejar, ou quero saber o que fazer."  ANOTAR era a primeira metade.
   Esta e a segunda.

   O contexto e escolhido primeiro porque e a unica coisa que o app nao tem
   como saber: se ele esta na frente do computador, no campo ou no telefone.
   Sabendo isso, o resto da ordem ele resolve sozinho (decisoes 10 e 11).
   ===================================================================== */

const NOME_CONTEXTO = {
  computador: 'Computador',
  campo: 'Campo',
  pessoa: 'Telefone / pessoa'
};

let contextoAberto = null;

async function abrirLista(contexto) {
  contextoAberto = contexto;
  com('lista-titulo', (x) => { x.textContent = NOME_CONTEXTO[contexto] || contexto; });
  mostrar('lista');
  await pintarLista();
}

async function pintarLista() {
  const alvo = el('lista-itens');
  if (!alvo) return;

  const todas = await Nucleo.lerTudo('pendencias');
  const agora = new Date();
  const ativas = todas.filter((p) => p.status === 'ativa' && p.contexto === contextoAberto);
  const lista = Nucleo.ordenar(ativas, agora);

  alvo.innerHTML = '';
  if (!lista.length) {
    const vazio = document.createElement('p');
    vazio.className = 'vazio';
    vazio.textContent = 'Nada aqui.';
    alvo.appendChild(vazio);
    return;
  }

  lista.forEach((p) => alvo.appendChild(
    linhaDoItem(p, agora, { contexto: false, repintar: pintarLista })
  ));
}

/* opcoes.contexto  — mostra em qual contexto o item esta (lista da abertura,
                       que mistura os tres; na lista de um contexto seria ruido)
   opcoes.repintar   — o que redesenhar depois de concluir, desfazer ou editar */
function linhaDoItem(p, agora, opcoes) {
  opcoes = opcoes || {};
  const top3 = Nucleo.ehTop3(p, agora);
  const item = document.createElement('div');
  item.className = 'item'
    + (p.origem === 'terceiro' ? ' terceiro' : '')
    + (top3 ? ' top3' : '');

  const corpo = document.createElement('div');
  corpo.className = 'item-corpo';
  corpo.addEventListener('click', () => abrirTriagemDe(p.id, opcoes.repintar));

  if (top3) {
    const tarja = document.createElement('span');
    tarja.className = 'tarja3';
    tarja.textContent = 'HOJE';
    corpo.appendChild(tarja);
  }

  const txt = document.createElement('p');
  txt.className = 'item-txt';
  txt.textContent = p.texto;
  corpo.appendChild(txt);

  const meta = document.createElement('p');
  meta.className = 'item-meta';

  const quem = document.createElement('span');
  quem.className = 'quem';
  quem.textContent = p.origem === 'terceiro' ? 'de terceiro' : 'minha';
  meta.appendChild(quem);

  if (opcoes.contexto) {
    meta.appendChild(document.createTextNode(' · '));
    const c = document.createElement('span');
    c.className = 'contexto-tag';
    c.textContent = NOME_CONTEXTO[p.contexto] || p.contexto || 'sem contexto';
    meta.appendChild(c);
  }

  if (p.prazo && p.prazo.tipo === 'data' && p.prazo.data) {
    meta.appendChild(document.createTextNode(' · '));
    const v = document.createElement('span');
    v.className = 'vence';
    v.textContent = (p.prazo.data < Nucleo.dataISO(agora) ? 'venceu ' : 'vence ')
                  + dataCurta(p.prazo.data);
    meta.appendChild(v);
  } else if (p.prazo && p.prazo.tipo === 'semana') {
    meta.appendChild(document.createTextNode(' · esta semana'));
  }

  // Indicador de idade aos 14 dias (decisao 11). E so um numero: a pergunta de
  // faxina, aos 21, e da Etapa 2.
  const idade = Nucleo.idadeDias(p, agora);
  if (idade >= Nucleo.IDADE_ALERTA) {
    meta.appendChild(document.createTextNode(' · '));
    const i = document.createElement('span');
    i.className = 'idade';
    i.textContent = idade + ' dias';
    meta.appendChild(i);
  }

  corpo.appendChild(meta);
  item.appendChild(corpo);

  const ok = document.createElement('button');
  ok.className = 'concluir';
  ok.textContent = '✓';
  ok.setAttribute('aria-label', 'concluir');
  ok.addEventListener('click', () => concluir(p.id, opcoes.repintar));
  item.appendChild(ok);

  return item;
}

function dataCurta(iso) {
  const partes = String(iso).split('-');
  return partes[2] + '/' + partes[1];
}

let concluindo = false;

async function concluir(id, repintar) {
  if (concluindo) return;   // mesma trava da triagem: dedo rapido nao conclui dois
  concluindo = true;
  try {
    const todas = await Nucleo.lerTudo('pendencias');
    const p = todas.find((x) => x.id === id);
    if (!p || p.status !== 'ativa') return;

    const agora = new Date();
    p.status = 'concluida';
    p.concluidoEm = agora.toISOString();
    await Nucleo.gravar('pendencias', p);
    await registrarNoHistorico(p, agora);

    await (repintar || pintarLista)();
    toqueComAcao('Feito.', 'desfazer', () => desfazerConclusao(id, repintar));
  } finally {
    concluindo = false;
  }
}

async function desfazerConclusao(id, repintar) {
  const todas = await Nucleo.lerTudo('pendencias');
  const p = todas.find((x) => x.id === id);
  if (!p || p.status !== 'concluida') return;

  const quando = new Date(p.concluidoEm || Date.now());
  p.status = 'ativa';
  p.concluidoEm = null;
  await Nucleo.gravar('pendencias', p);
  await removerDoHistorico(id, quando);

  await (repintar || pintarLista)();
  toque('Voltou para a lista.');
}

/* O historico e o que alimenta o fechamento das 16:40 e o relatorio mensal.
   Sem gravar aqui, no momento da conclusao, nao ha como montar depois: a lista
   de concluidas do dia nao pode ser reconstruida a partir das pendencias, que
   so guardam o estado final. */
async function lerDia(data) {
  const todos = await Nucleo.lerTudo('historico');
  const achado = todos.find((h) => h.data === data);
  if (achado) {
    // Registros gravados antes de as 3 do dia existirem nao tem estes campos.
    achado.top3Definidas = achado.top3Definidas || [];
    achado.top3Concluidas = achado.top3Concluidas || [];
    return achado;
  }
  return { data: data, concluidas: [], top3Definidas: [], top3Concluidas: [], descartadas: 0 };
}

async function registrarNoHistorico(p, agora) {
  const registro = await lerDia(Nucleo.dataISO(agora));

  if (registro.concluidas.some((c) => c.id === p.id)) return;   // nao conta duas vezes
  registro.concluidas.push({
    id: p.id, texto: p.texto, origem: p.origem,
    contexto: p.contexto, tipo: 'pendencia'
  });

  if (Nucleo.ehTop3(p, agora) && registro.top3Concluidas.indexOf(p.id) === -1) {
    registro.top3Concluidas.push(p.id);
  }

  await Nucleo.gravar('historico', registro);
}

/* O desfazer usa a data em que o item FOI concluido, nao a de hoje. Concluir as
   23h58 e desfazer as 00h02 tem que apagar do dia certo, senao o contador do dia
   anterior fica com um item que nao existe mais. */
async function removerDoHistorico(id, quando) {
  const registro = await lerDia(Nucleo.dataISO(quando));
  registro.concluidas = registro.concluidas.filter((c) => c.id !== id);
  registro.top3Concluidas = registro.top3Concluidas.filter((x) => x !== id);
  await Nucleo.gravar('historico', registro);
}

/* =====================================================================
   4c. As 3 do dia (spec 5.4 passo 4, decisao 11, secao 6)

   Tres, e nao uma lista de prioridades: o problema que abriu o projeto e chegar
   ao fim do dia sem saber o que se fez, e uma lista longa de "importantes" nao
   responde isso. Tres cabem na cabeca.

   Valem so hoje. Nao ha rotina de limpeza noturna — a marca carrega a data em
   que foi dada e simplesmente para de valer (Nucleo.ehTop3).
   ===================================================================== */

const MAX_TOP3 = 3;
let selecao = [];

/* As 3 do dia que JA foram concluidas hoje. Elas nao aparecem nesta tela — ja
   sairam, nao ha o que trocar — mas continuam ocupando vaga e continuam
   contando no placar do dia. Sem guardar isso aqui, concluir uma das 3 e
   depois trocar outra apagaria a concluida do registro, e o placar mostraria
   menos do que ele entregou de verdade. */
let top3Travadas = [];

async function abrirEscolha() {
  const todas = await Nucleo.lerTudo('pendencias');
  const agora = new Date();
  const hoje = Nucleo.dataISO(agora);
  const ativas = Nucleo.ordenar(todas.filter((p) => p.status === 'ativa'), agora);

  const dia = await lerDia(hoje);
  top3Travadas = dia.top3Concluidas.slice();

  if (!ativas.length) {
    toque(top3Travadas.length ? 'Tudo do dia já saiu.' : 'Nada triado para escolher.');
    return;
  }

  // Já escolhidas hoje vêm marcadas: esta mesma tela serve para trocar uma que
  // claramente não vai sair (spec 5.5 passo 4), sem penalidade nem alerta.
  selecao = ativas.filter((p) => Nucleo.ehTop3(p, agora)).map((p) => p.id);

  const alvo = el('escolher-lista');
  if (!alvo) return;
  alvo.innerHTML = '';
  ativas.forEach((p) => alvo.appendChild(linhaDeEscolha(p, agora)));

  atualizarContador();
  mostrar('escolher');
}

function vagas() {
  return MAX_TOP3 - top3Travadas.length;
}

function linhaDeEscolha(p, agora) {
  const b = document.createElement('button');
  b.className = 'escolha' + (selecao.indexOf(p.id) !== -1 ? ' marcada' : '');
  b.dataset.id = p.id;

  const marca = document.createElement('span');
  marca.className = 'marca';
  marca.textContent = '✓';
  b.appendChild(marca);

  const txt = document.createElement('span');
  txt.className = 'txt';
  const forte = document.createElement('b');
  forte.textContent = p.texto;
  txt.appendChild(forte);

  const meta = document.createElement('span');
  const partes = [p.origem === 'terceiro' ? 'de terceiro' : 'minha',
                  NOME_CONTEXTO[p.contexto] || p.contexto];
  if (p.prazo && p.prazo.tipo === 'data' && p.prazo.data) partes.push('vence ' + dataCurta(p.prazo.data));
  else if (p.prazo && p.prazo.tipo === 'semana') partes.push('esta semana');
  meta.textContent = partes.join(' · ');
  txt.appendChild(meta);

  b.appendChild(txt);
  b.addEventListener('click', () => alternarEscolha(p.id, b));
  return b;
}

function alternarEscolha(id, botao) {
  const i = selecao.indexOf(id);
  if (i !== -1) {
    selecao.splice(i, 1);
    botao.classList.remove('marcada');
  } else {
    if (selecao.length >= vagas()) {
      toque(vagas() === 0 ? 'As 3 de hoje já saíram.' : 'Toque numa marcada para tirar.');
      return;
    }
    selecao.push(id);
    botao.classList.add('marcada');
  }
  atualizarContador();
}

function atualizarContador() {
  const jaSairam = top3Travadas.length;
  com('escolher-contador', (x) => {
    if (vagas() === 0) {
      x.textContent = 'As 3 de hoje já saíram. Amanhã tem três novas.';
      return;
    }
    const sufixo = jaSairam ? '  (' + jaSairam + ' já saiu hoje)' : '';
    x.textContent = (selecao.length === 0
      ? 'Escolha até ' + vagas() + '. Valem só hoje.'
      : selecao.length + ' de ' + vagas() + ' escolhidas.') + sufixo;
  });
}

async function confirmarEscolha() {
  const agora = new Date();
  const hoje = Nucleo.dataISO(agora);
  const todas = await Nucleo.lerTudo('pendencias');

  for (const p of todas) {
    if (p.status !== 'ativa') continue;
    const marcada = selecao.indexOf(p.id) !== -1;
    const eraMarcada = Nucleo.ehTop3(p, agora);
    if (marcada === eraMarcada) continue;          // nada mudou, nao regrava
    p.prioridade = marcada ? { ehTop3: true, data: hoje }
                           : { ehTop3: false, data: null };
    await Nucleo.gravar('pendencias', p);
  }

  const dia = await lerDia(hoje);
  // top3Concluidas nao se mexe — apagar de la seria apagar trabalho feito.
  dia.top3Definidas = Nucleo.definidasAposTroca(selecao, dia.top3Concluidas);
  await Nucleo.gravar('historico', dia);

  await pintarAbertura();
  mostrar('abertura');
  const n = selecao.length;
  toque(n === 0 ? 'Nenhuma escolhida.' : n + (n === 1 ? ' escolhida.' : ' escolhidas.'));
}

/* =====================================================================
   5b. Triagem — passo 3 do ritual das 07:00 (spec 5.4)

   Tres toques por item: onde, de quem, quando. No terceiro toque o item e
   gravado e o proximo aparece sozinho — nao ha botao de confirmar, porque
   confirmar seria um quarto toque em cima de uma decisao ja tomada.

   Contexto e origem so sao marcados AQUI, nunca na captura (decisoes 6 e 8):
   na hora de anotar, parar para classificar e o que faz a pessoa desistir de
   anotar.
   ===================================================================== */

let fila = [];
let posicao = 0;
let escolha = null;
let gravando = false;      // trava contra toque duplo, ver talvezConcluir()
let editando = false;      // um item ja triado, aberto para correcao
let retornoTriagem = null; // para onde voltar quando terminar

/* Edicao de um item ja triado. Chega-se aqui tocando no texto do item em
   qualquer lista. Nao estava na spec; foi pedido pelo dono em 04/09/2026,
   depois de a triagem existir e ficar claro que "marquei campo e era
   computador" nao tinha conserto. */
async function abrirTriagemDe(id, repintar) {
  const todas = await Nucleo.lerTudo('pendencias');
  const p = todas.find((x) => x.id === id);
  if (!p) return;

  fila = [p];
  posicao = 0;
  editando = true;
  retornoTriagem = repintar || pintarLista;
  mostrar('triagem');
  pintarItem();
}

async function abrirTriagem() {
  editando = false;
  retornoTriagem = null;
  const todas = await Nucleo.lerTudo('pendencias');
  fila = todas
    .filter((p) => p.status === 'nova')
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));  // mais antigo primeiro
  posicao = 0;

  if (!fila.length) {
    await pintarAbertura();
    mostrar('abertura');
    toque('Nada para triar.');
    return;
  }
  mostrar('triagem');
  pintarItem();
}

function pintarItem() {
  const p = fila[posicao];

  escolha = editando
    ? {
        contexto: p.contexto,
        origem: p.origem,
        prazo: (p.prazo && p.prazo.tipo) || 'nenhum',
        data: (p.prazo && p.prazo.data) || null
      }
    : { contexto: null, origem: null, prazo: null, data: null };

  com('triagem-progresso', (x) => {
    x.textContent = editando ? 'corrigindo' : (posicao + 1) + ' de ' + fila.length;
  });
  com('triagem-texto', (x) => { x.textContent = p.texto; });

  document.querySelectorAll('#tela-triagem .opcoes button')
    .forEach((b) => b.classList.remove('escolhido'));
  com('triagem-data', (x) => { x.hidden = true; x.value = ''; });

  // No modo edicao nao ha gravacao automatica no terceiro toque — os tres campos
  // ja vem preenchidos, e gravar sozinho impediria trocar dois de uma vez.
  com('btn-salvar-triagem', (x) => { x.hidden = !editando; });

  if (!editando) return;

  marcarBotao('triagem-contexto', escolha.contexto);
  marcarBotao('triagem-origem', escolha.origem);
  marcarBotao('triagem-prazo', escolha.prazo);
  if (escolha.prazo === 'data' && escolha.data) {
    com('triagem-data', (x) => { x.hidden = false; x.value = escolha.data; });
  }
}

function marcarBotao(idGrupo, valor) {
  com(idGrupo, (g) => {
    g.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('escolhido', b.dataset.v === valor);
    });
  });
}

function ligarGrupo(id, campo) {
  const grupo = el(id);
  if (!grupo) return;
  grupo.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    grupo.querySelectorAll('button').forEach((x) => x.classList.remove('escolhido'));
    b.classList.add('escolhido');
    escolha[campo] = b.dataset.v;

    if (campo === 'prazo') {
      const entrada = el('triagem-data');
      if (b.dataset.v === 'data') {
        // Data marcada e o caminho raro: ganha um toque a mais, e so ele.
        entrada.hidden = false;
        if (entrada.showPicker) { try { entrada.showPicker(); } catch (e) { entrada.focus(); } }
        else entrada.focus();
        return;
      }
      entrada.hidden = true;
      entrada.value = '';
      escolha.data = null;
    }
    talvezConcluir();
  });
}

function talvezConcluir() {
  if (!escolha) return;
  if (editando) return;   // ali quem grava e o botao SALVAR
  if (!escolha.contexto || !escolha.origem || !escolha.prazo) return;
  if (escolha.prazo === 'data' && !escolha.data) return;
  // Dedo rapido no terceiro botao dispara dois cliques antes de o primeiro
  // gravar. Sem esta trava, o contador avanca duas vezes e um item da fila
  // e pulado sem nunca ter sido triado.
  if (gravando) return;
  gravando = true;
  gravarItem().finally(() => { gravando = false; });
}

async function gravarItem() {
  const p = fila[posicao];
  p.contexto = escolha.contexto;
  p.origem = escolha.origem;
  p.prazo = escolha.prazo === 'data'
    ? { tipo: 'data', data: escolha.data }
    : { tipo: escolha.prazo };
  p.status = 'ativa';
  await Nucleo.gravar('pendencias', p);

  if (editando) {
    const voltar = retornoTriagem || pintarLista;
    editando = false;
    retornoTriagem = null;
    await voltar();
    mostrar(voltar === pintarLista ? 'lista' : 'abertura');
    toque('Corrigido.');
    return;
  }

  posicao++;
  if (posicao < fila.length) { pintarItem(); return; }

  await pintarAbertura();
  mostrar('abertura');
  toque(fila.length === 1 ? 'Triado.' : fila.length + ' triados.');
}

async function salvarEdicao() {
  if (!escolha || !escolha.contexto || !escolha.origem || !escolha.prazo) {
    toque('Falta marcar alguma coisa.');
    return;
  }
  if (escolha.prazo === 'data' && !escolha.data) {
    toque('Escolha a data.');
    return;
  }
  if (gravando) return;
  gravando = true;
  gravarItem().finally(() => { gravando = false; });
}

/* =====================================================================
   6. Relogio — varredura a cada minuto, a cada volta do segundo plano
      e a cada abertura. Reavalia a data toda vez, entao a virada de
      meia-noite com o app aberto nao escapa.
   ===================================================================== */

let ticker = null;

function ligarRelogio() {
  if (ticker) clearInterval(ticker);
  varrerAgora();
  ticker = setInterval(varrerAgora, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') varrerAgora();
  });
  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data && ev.data.tipo === 'irParaRitual') abrirRitual(ev.data.ritual);
  });
}

async function varrerAgora() {
  try {
    // Com o app na frente o aviso e a faixa, nao a notificacao.
    const acoes = await Nucleo.varrer(new Date(), 'app', async () => {});
    if (acoes.length && telaAtual === 'abertura') await pintarAbertura();
  } catch (e) {
    console.warn('varredura falhou', e);
  }
}

/* =====================================================================
   7. Medicao — a razao de o Dia 0 existir
   ===================================================================== */

async function pintarMedicao() {
  const log = await Nucleo.lerTudo('log');
  const sync = await Nucleo.lerConfig('periodicSync', 'não registrado');
  const persist = await Nucleo.lerConfig('persistencia', '?');
  const bateria = await Nucleo.lerConfig('bateriaLiberada', false);

  const disparos = log.filter((r) => r.tipo === 'sw' || r.tipo === 'app' || r.tipo === 'ausente');
  const sw = disparos.filter((r) => r.tipo === 'sw');
  const noPrazo = sw.filter((r) => r.atrasoMin <= 15);
  const app = disparos.filter((r) => r.tipo === 'app');
  const ausentes = disparos.filter((r) => r.tipo === 'ausente');

  el('medicao-resumo').innerHTML =
    '<b>' + noPrazo.length + '</b> disparos sozinhos com até 15 min de atraso.<br>'
    + sw.length + ' sozinhos no total · ' + app.length + ' só ao abrir o app · '
    + ausentes.length + ' perdidos<br>'
    + '<span class="sussurro">periodicSync: ' + sync + ' · armazenamento: ' + persist
    + ' · bateria liberada: ' + (bateria ? 'sim' : 'não confirmado') + '</span>';

  const porDia = {};
  log.slice().sort((a, b) => b.realEm.localeCompare(a.realEm)).forEach((r) => {
    (porDia[r.dia] = porDia[r.dia] || []).push(r);
  });

  const alvo = el('medicao-lista');
  alvo.innerHTML = '';
  Object.keys(porDia).sort().reverse().forEach((dia) => {
    const bloco = document.createElement('div');
    bloco.className = 'dia-bloco';
    const h = document.createElement('h2');
    h.textContent = dia;
    bloco.appendChild(h);
    porDia[dia].forEach((r) => {
      const linha = document.createElement('div');
      linha.className = 'reg ' + r.tipo;
      const esq = document.createElement('span');
      const nome = (Nucleo.RITUAIS.find((x) => x.id === r.ritual) || {}).nome || '—';
      esq.textContent = nome + ' · ' + rotulo(r.tipo);
      const dir = document.createElement('b');
      dir.textContent = r.tipo === 'ausente'
        ? 'perdido'
        : Nucleo.horaCurta(r.realEm) + ' (+' + r.atrasoMin + ')';
      linha.appendChild(esq);
      linha.appendChild(dir);
      bloco.appendChild(linha);
    });
    alvo.appendChild(bloco);
  });

  if (!log.length) alvo.innerHTML = '<p class="sussurro">Nada registrado ainda.</p>';
}

function rotulo(tipo) {
  return { sw: 'sozinho', app: 'só ao abrir', ausente: 'não saiu',
           aberto: 'ritual aberto', erro: 'erro' }[tipo] || tipo;
}

async function copiarRelatorio() {
  const log = await Nucleo.lerTudo('log');
  const sync = await Nucleo.lerConfig('periodicSync', '?');
  const linhas = ['medição do gatilho — ' + new Date().toISOString(),
                  'periodicSync: ' + sync, ''];
  log.slice().sort((a, b) => a.realEm.localeCompare(b.realEm)).forEach((r) => {
    linhas.push([r.dia, r.ritual, r.tipo, r.atrasoMin + 'min', r.realEm].join('\t'));
  });
  const texto = linhas.join('\n');
  try {
    await navigator.clipboard.writeText(texto);
    toque('Relatório copiado.');
  } catch (e) {
    console.log(texto);
    toque('Não copiou. Está no console.');
  }
}

/* =====================================================================
   8. Ligacoes
   ===================================================================== */

function ligarTudo() {
  ligar('btn-anotar', 'click', abrirAnotar);
  ligar('btn-salvar', 'click', salvarAnotacao);
  ligar('btn-voltar-anotar', 'click', async () => {
    com('campo', (c) => c.blur());
    await pintarAbertura();
    mostrar('abertura');
  });
  ligar('btn-onde', 'click', () => mostrar('onde'));
  ligar('contextos', 'click', (ev) => {
    const b = ev.target.closest('button');
    if (b && b.dataset.v) abrirLista(b.dataset.v);
  });
  ligar('btn-voltar-lista', 'click', () => mostrar('onde'));
  ligar('btn-medicao', 'click', async () => {
    await pintarMedicao();
    mostrar('medicao');
  });
  ligar('btn-copiar', 'click', copiarRelatorio);
  ligar('btn-triar', 'click', abrirTriagem);
  ligar('btn-salvar-triagem', 'click', salvarEdicao);
  ligar('btn-escolher3', 'click', abrirEscolha);
  ligar('btn-confirmar3', 'click', confirmarEscolha);
  ligar('btn-ritual-teste', 'click', () => abrirRitual('abertura'));

  ligarGrupo('triagem-contexto', 'contexto');
  ligarGrupo('triagem-origem', 'origem');
  ligarGrupo('triagem-prazo', 'prazo');

  ligar('triagem-data', 'change', (ev) => {
    if (!escolha || !ev.target.value) return;
    escolha.data = ev.target.value;
    talvezConcluir();
  });

  document.querySelectorAll('.voltar').forEach((b) => {
    b.addEventListener('click', async () => {
      // Sair no meio de uma correcao descarta a correcao, nao o item.
      editando = false;
      retornoTriagem = null;
      await pintarAbertura();
      mostrar('abertura');
    });
  });
}

// As ligacoes vem antes de iniciar(), entao um erro aqui deixaria o app sem
// desenhar nada. iniciar() roda de qualquer jeito.
try { ligarTudo(); } catch (e) { console.error('falha ao ligar os botoes', e); }

iniciar();
