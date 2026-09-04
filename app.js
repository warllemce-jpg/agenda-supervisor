/* app.js — a pagina. Tres telas de verdade (primeira execucao, abertura, anotar),
   duas de esqueleto (onde estou, ritual) e a tela de medicao, que e o motivo do
   Dia 0 existir.

   Ordem de leitura: rotas -> primeira execucao -> abertura -> anotar -> relogio
   -> medicao. */

'use strict';

const tela = (id) => document.getElementById('tela-' + id);
const el = (id) => document.getElementById(id);

const TELAS = ['primeira', 'abertura', 'anotar', 'onde', 'ritual', 'triagem', 'medicao'];
let telaAtual = null;

function mostrar(nome) {
  TELAS.forEach((t) => { tela(t).hidden = (t !== nome); });
  telaAtual = nome;
  window.scrollTo(0, 0);
}

function toque(msg) {
  const d = document.createElement('div');
  d.className = 'aviso-toque';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1600);
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

async function pintarAbertura() {
  const n = await Nucleo.contarTriagem();
  el('info-triagem').textContent = n === 0
    ? 'Nada aguardando triagem.'
    : n + (n === 1 ? ' anotação aguardando triagem' : ' anotações aguardando triagem');
  await pintarFaixa();
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
  el('triar-quantas').textContent = naFila ? '(' + naFila + ')' : '';
  el('btn-triar').disabled = naFila === 0;
  el('ritual-restante').textContent = naFila === 0
    ? 'Nada para triar. Os outros passos do ritual entram em seguida.'
    : 'Os outros passos do ritual entram em seguida.';

  mostrar('ritual');
}

function fonteEmPalavras(tipo) {
  if (tipo === 'sw') return 'sozinho, em segundo plano';
  if (tipo === 'app') return 'só quando o app abriu';
  return tipo;
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
let gravando = false;   // trava contra toque duplo, ver talvezConcluir()

async function abrirTriagem() {
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
  escolha = { contexto: null, origem: null, prazo: null, data: null };

  el('triagem-progresso').textContent = (posicao + 1) + ' de ' + fila.length;
  el('triagem-texto').textContent = p.texto;

  document.querySelectorAll('#tela-triagem .opcoes button')
    .forEach((b) => b.classList.remove('escolhido'));
  el('triagem-data').hidden = true;
  el('triagem-data').value = '';
}

function ligarGrupo(id, campo) {
  el(id).addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    el(id).querySelectorAll('button').forEach((x) => x.classList.remove('escolhido'));
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

  posicao++;
  if (posicao < fila.length) { pintarItem(); return; }

  await pintarAbertura();
  mostrar('abertura');
  toque(fila.length === 1 ? 'Triado.' : fila.length + ' triados.');
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

el('btn-anotar').addEventListener('click', abrirAnotar);
el('btn-salvar').addEventListener('click', salvarAnotacao);
el('btn-voltar-anotar').addEventListener('click', async () => {
  el('campo').blur();
  await pintarAbertura();
  mostrar('abertura');
});
el('btn-onde').addEventListener('click', () => mostrar('onde'));
el('btn-medicao').addEventListener('click', async () => {
  await pintarMedicao();
  mostrar('medicao');
});
el('btn-copiar').addEventListener('click', copiarRelatorio);
el('btn-triar').addEventListener('click', abrirTriagem);
el('btn-ritual-teste').addEventListener('click', () => abrirRitual('abertura'));

ligarGrupo('triagem-contexto', 'contexto');
ligarGrupo('triagem-origem', 'origem');
ligarGrupo('triagem-prazo', 'prazo');

el('triagem-data').addEventListener('change', (ev) => {
  if (!escolha || !ev.target.value) return;
  escolha.data = ev.target.value;
  talvezConcluir();
});

document.querySelectorAll('.voltar').forEach((b) => {
  b.addEventListener('click', async () => {
    await pintarAbertura();
    mostrar('abertura');
  });
});

iniciar();
