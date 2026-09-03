/* Casos do testador (secao 10) aplicados a varredura de rituais. */

const fs = require('fs');
const vm = require('vm');
const { criar } = require('./idb-falso');

const fonte = fs.readFileSync('C:/Users/MarcosWarllem/Documents/Mynote/nucleo.js', 'utf8');

let falhas = 0;
function conf(nome, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { console.log('  ok   ' + nome + '  ' + a); }
  else { falhas++; console.log('  FALHA ' + nome + '  esperado ' + b + ' obtido ' + a); }
}

function novoNucleo() {
  const ctx = { console, setTimeout, indexedDB: criar(), Promise, Date, JSON };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fonte, ctx);
  return ctx.Nucleo;
}

const D = (s) => new Date(s);           // horario local
const resumo = (acoes) => acoes.map(a => a.ritual + ':' + a.tipo + (a.tipo === 'ausente' ? '' : '+' + a.atrasoMin));

(async () => {
  console.log('\n1. instalado segunda 06:00, SW acorda 06:30 — nada devido ainda');
  {
    const N = novoNucleo();
    await N.escreverConfig('ultimaVarredura', D('2026-09-07T06:00:00').toISOString());
    conf('nenhuma acao', resumo(await N.varrer(D('2026-09-07T06:30:00'), 'sw')), []);
  }

  console.log('\n2. SW acorda 07:05 — disparo sozinho com 5 min de atraso');
  {
    const N = novoNucleo();
    await N.escreverConfig('ultimaVarredura', D('2026-09-07T06:00:00').toISOString());
    conf('um disparo sw', resumo(await N.varrer(D('2026-09-07T07:05:00'), 'sw')), ['abertura:sw+5']);
    console.log('   e acorda de novo as 07:40:');
    conf('nao repete', resumo(await N.varrer(D('2026-09-07T07:40:00'), 'sw')), []);
  }

  console.log('\n3. SW nunca acorda; app aberto as 14:00 — 07:00 perdido, 13:00 recuperado');
  {
    const N = novoNucleo();
    await N.escreverConfig('ultimaVarredura', D('2026-09-07T06:00:00').toISOString());
    conf('ausente + app', resumo(await N.varrer(D('2026-09-07T14:00:00'), 'app')),
         ['abertura:ausente', 'replanejamento:app+60']);
  }

  console.log('\n4. app so abre as 22:00 — os tres do dia perdidos');
  {
    const N = novoNucleo();
    await N.escreverConfig('ultimaVarredura', D('2026-09-07T06:00:00').toISOString());
    conf('tres ausentes', resumo(await N.varrer(D('2026-09-07T22:00:00'), 'app')),
         ['abertura:ausente', 'replanejamento:ausente', 'fechamento:ausente']);
  }

  console.log('\n5. sabado e domingo nao geram ritual');
  {
    const N = novoNucleo();
    await N.escreverConfig('ultimaVarredura', D('2026-09-11T18:00:00').toISOString()); // sexta
    conf('nada no fim de semana', resumo(await N.varrer(D('2026-09-13T20:00:00'), 'app')), []);
  }

  console.log('\n6. virada de meia-noite com o app aberto');
  {
    const N = novoNucleo();
    await N.escreverConfig('ultimaVarredura', D('2026-09-07T17:00:00').toISOString());
    conf('23:59 nada', resumo(await N.varrer(D('2026-09-07T23:59:00'), 'app')), []);
    conf('00:01 nada', resumo(await N.varrer(D('2026-09-08T00:01:00'), 'app')), []);
    conf('07:02 do dia seguinte dispara', resumo(await N.varrer(D('2026-09-08T07:02:00'), 'app')),
         ['abertura:app+2']);
  }

  console.log('\n7. aparelho desligado um mes — teto de 14 dias evita enxurrada');
  {
    const N = novoNucleo();
    await N.escreverConfig('ultimaVarredura', D('2026-08-01T08:00:00').toISOString());
    const acoes = await N.varrer(D('2026-09-07T20:00:00'), 'app');
    const dias = new Set(acoes.map(a => a.dia));
    conf('so ausentes', [...new Set(acoes.map(a => a.tipo))], ['ausente']);
    conf('dias distintos <= 11', dias.size <= 11, true);
    conf('mais antigo dentro de 14 dias', [...dias].sort()[0] >= '2026-08-24', true);
  }

  console.log('\n8. primeira execucao sem marca d\'agua nao inventa historico');
  {
    const N = novoNucleo();
    conf('nada antes da instalacao', resumo(await N.varrer(D('2026-09-07T09:00:00'), 'app')), []);
    console.log('   e o 13:00 do mesmo dia dispara normalmente:');
    conf('13:05 dispara', resumo(await N.varrer(D('2026-09-07T13:05:00'), 'app')),
         ['replanejamento:app+5']);
  }

  console.log('\n9. limite exato da janela de 90 min');
  {
    const N = novoNucleo();
    await N.escreverConfig('ultimaVarredura', D('2026-09-07T06:00:00').toISOString());
    conf('08:30 ainda dispara', resumo(await N.varrer(D('2026-09-07T08:30:00'), 'app')),
         ['abertura:app+90']);
    const M = novoNucleo();
    await M.escreverConfig('ultimaVarredura', D('2026-09-07T06:00:00').toISOString());
    conf('08:31 ja e perdido', resumo(await M.varrer(D('2026-09-07T08:31:00'), 'app')),
         ['abertura:ausente']);
  }

  console.log('\n10. SW dispara e o app varre logo depois — nao conta duas vezes');
  {
    const N = novoNucleo();
    await N.escreverConfig('ultimaVarredura', D('2026-09-07T06:00:00').toISOString());
    await N.varrer(D('2026-09-07T07:01:00'), 'sw');
    conf('app nao duplica', resumo(await N.varrer(D('2026-09-07T07:03:00'), 'app')), []);
    const log = await N.lerTudo('log');
    conf('um unico registro', log.length, 1);
    conf('creditado ao sw', log[0].tipo, 'sw');
  }

  console.log('\n11. fuso: horario e sempre local, sem conversao para UTC');
  {
    const N = novoNucleo();
    const inst = N.instanteRitual(D('2026-09-07T00:00:00'), N.RITUAIS[0]);
    conf('07:00 local', inst.getHours() + ':' + N.pad(inst.getMinutes()), '7:00');
  }

  console.log(falhas === 0 ? '\nTODOS OS CASOS PASSARAM\n' : '\n' + falhas + ' FALHA(S)\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(1); });
