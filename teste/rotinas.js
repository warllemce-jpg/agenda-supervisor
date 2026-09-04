/* Rotinas: quando vencem, e o caso do testador de concluir duas vezes no mesmo
   dia. Rodar com: node teste/rotinas.js */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'nucleo.js'), 'utf8');
const ctx = { console, setTimeout, Promise, Date, JSON, indexedDB: null };
ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fonte, ctx);
const N = ctx.Nucleo;

let falhas = 0;
function conf(nome, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) console.log('  ok   ' + nome + '  ' + a);
  else { falhas++; console.log('  FALHA ' + nome + '  esperado ' + b + ' obtido ' + a); }
}

// As 4 rotinas de fabrica, exatamente como a spec manda (secao 4)
const FABRICA = {
  horas:    { id: 'r1', texto: 'Revisar horas dos colaboradores', contexto: 'computador', frequencia: 'semanal', diaSemana: 5, ultimaExecucao: null },
  material: { id: 'r2', texto: 'Levantar material a comprar da semana', contexto: 'computador', frequencia: 'semanal', diaSemana: 1, ultimaExecucao: null },
  status:   { id: 'r3', texto: 'Atualizar status dos projetos', contexto: 'computador', frequencia: 'semanal', diaSemana: 3, ultimaExecucao: null },
  campo:    { id: 'r4', texto: 'Passar na frente de serviço', contexto: 'campo', frequencia: 'diaria', diaSemana: null, ultimaExecucao: null }
};
const copia = (r, extra) => Object.assign({}, r, extra || {});

const SEGUNDA = new Date(2026, 8, 7, 9, 0);
const QUARTA  = new Date(2026, 8, 9, 9, 0);
const SEXTA   = new Date(2026, 8, 11, 9, 0);
const SABADO  = new Date(2026, 8, 12, 9, 0);
const DOMINGO = new Date(2026, 8, 13, 9, 0);

console.log('\n1. semanal vence so no seu dia');
{
  conf('horas (sexta) na sexta', N.rotinaVenceHoje(FABRICA.horas, SEXTA), true);
  conf('horas (sexta) na quarta', N.rotinaVenceHoje(FABRICA.horas, QUARTA), false);
  conf('material (segunda) na segunda', N.rotinaVenceHoje(FABRICA.material, SEGUNDA), true);
  conf('status (quarta) na quarta', N.rotinaVenceHoje(FABRICA.status, QUARTA), true);
}

console.log('\n2. diaria vence todo dia util');
{
  conf('segunda', N.rotinaVenceHoje(FABRICA.campo, SEGUNDA), true);
  conf('quarta', N.rotinaVenceHoje(FABRICA.campo, QUARTA), true);
  conf('sexta', N.rotinaVenceHoje(FABRICA.campo, SEXTA), true);
}

console.log('\n3. nada vence no fim de semana');
{
  conf('diaria no sabado', N.rotinaVenceHoje(FABRICA.campo, SABADO), false);
  conf('diaria no domingo', N.rotinaVenceHoje(FABRICA.campo, DOMINGO), false);
  const sabadista = copia(FABRICA.horas, { diaSemana: 6 });
  conf('semanal marcada para sabado tambem nao', N.rotinaVenceHoje(sabadista, SABADO), false);
}

console.log('\n4. CASO DO TESTADOR: rotina concluida duas vezes no mesmo dia');
{
  const antes = copia(FABRICA.campo);
  conf('antes de cumprir, vence', N.rotinaVenceHoje(antes, QUARTA), true);

  const depois = copia(FABRICA.campo, { ultimaExecucao: '2026-09-09' });
  conf('depois de cumprir, nao vence mais', N.rotinaVenceHoje(depois, QUARTA), false);

  // some da lista, entao nao ha segundo toque possivel
  conf('e no dia seguinte volta a vencer', N.rotinaVenceHoje(depois, new Date(2026, 8, 10, 9, 0)), true);
}

console.log('\n5. semanal cumprida nao reaparece no mesmo dia');
{
  const feita = copia(FABRICA.horas, { ultimaExecucao: '2026-09-11' });
  conf('sexta, ja cumprida', N.rotinaVenceHoje(feita, SEXTA), false);
  conf('sexta seguinte volta', N.rotinaVenceHoje(feita, new Date(2026, 8, 18, 9, 0)), true);
}

console.log('\n6. rotina nao se acumula');
{
  // sexta 11/09 passou em branco: nao reaparece na segunda seguinte
  const perdida = copia(FABRICA.horas, { ultimaExecucao: '2026-09-04' });
  conf('segunda depois da sexta perdida', N.rotinaVenceHoje(perdida, new Date(2026, 8, 14, 9, 0)), false);
  conf('so na proxima sexta', N.rotinaVenceHoje(perdida, new Date(2026, 8, 18, 9, 0)), true);
}

console.log('\n7. mensal');
{
  const mensal = { id: 'm', frequencia: 'mensal', diaMes: 9, ultimaExecucao: null };
  conf('no dia 9', N.rotinaVenceHoje(mensal, QUARTA), true);
  conf('no dia 11', N.rotinaVenceHoje(mensal, SEXTA), false);
  const dia12 = { id: 'm', frequencia: 'mensal', diaMes: 12, ultimaExecucao: null };
  conf('dia 12 caindo no sabado nao vence', N.rotinaVenceHoje(dia12, SABADO), false);
}

console.log('\n8. dados estranhos nao derrubam nada');
{
  conf('rotina nula', N.rotinaVenceHoje(null, QUARTA), false);
  conf('frequencia desconhecida', N.rotinaVenceHoje({ frequencia: 'anual' }, QUARTA), false);
  conf('semanal sem diaSemana', N.rotinaVenceHoje({ frequencia: 'semanal' }, QUARTA), false);
}

console.log(falhas === 0 ? '\nTODOS OS CASOS PASSARAM\n' : '\n' + falhas + ' FALHA(S)\n');
process.exit(falhas ? 1 : 0);
