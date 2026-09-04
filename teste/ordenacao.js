/* Ordenacao das listas (decisao 11 e secao 6 da spec).
   Funcoes puras — nao encostam no banco. Rodar com: node teste/ordenacao.js */

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

// atalho para montar pendencia
function p(id, opcoes) {
  return Object.assign({
    id: id, texto: id, origem: 'minha', contexto: 'campo',
    prazo: { tipo: 'nenhum' },
    prioridade: { ehTop3: false, data: null },
    status: 'ativa',
    criadoEm: '2026-09-01T08:00:00.000Z'
  }, opcoes || {});
}

const ordem = (lista, agora) => N.ordenar(lista, agora).map((x) => x.id);

const QUARTA = new Date(2026, 8, 9, 10, 0);   // 09/09/2026, quarta
const QUINTA = new Date(2026, 8, 10, 10, 0);  // 10/09/2026, quinta

console.log('\n1. as 3 do dia vem primeiro');
{
  const top = p('top', { prioridade: { ehTop3: true, data: '2026-09-09' } });
  const urgente = p('urgente', { prazo: { tipo: 'data', data: '2026-09-09' } });
  conf('top3 antes do prazo de hoje', ordem([urgente, top], QUARTA), ['top', 'urgente']);
}

console.log('\n2. as 3 do dia de ONTEM nao valem hoje');
{
  const velho = p('ontem', { prioridade: { ehTop3: true, data: '2026-09-08' } });
  const urgente = p('urgente', { prazo: { tipo: 'data', data: '2026-09-09' } });
  conf('prioridade de ontem e ignorada', ordem([velho, urgente], QUARTA), ['urgente', 'ontem']);
  conf('peso do de ontem e o de fundo de fila', N.pesoOrdem(velho, QUARTA), 3);
}

console.log('\n3. prazo entra na ordenacao 2 dias antes');
{
  const daqui2 = p('daqui2', { prazo: { tipo: 'data', data: '2026-09-11' } });
  const daqui3 = p('daqui3', { prazo: { tipo: 'data', data: '2026-09-12' } });
  conf('11/09 (2 dias) ja prioriza', N.pesoOrdem(daqui2, QUARTA), 1);
  conf('12/09 (3 dias) ainda nao', N.pesoOrdem(daqui3, QUARTA), 3);
  conf('ordem entre eles', ordem([daqui3, daqui2], QUARTA), ['daqui2', 'daqui3']);
}

console.log('\n4. prazo ja vencido no momento da criacao (caso do testador)');
{
  const vencido = p('vencido', { prazo: { tipo: 'data', data: '2026-09-01' } });
  const hoje = p('hoje', { prazo: { tipo: 'data', data: '2026-09-09' } });
  conf('vencido prioriza', N.pesoOrdem(vencido, QUARTA), 1);
  conf('mais vencido primeiro', ordem([hoje, vencido], QUARTA), ['vencido', 'hoje']);
}

console.log('\n5. "esta semana" so ganha prioridade a partir de quinta');
{
  const semana = p('semana', { prazo: { tipo: 'semana' } });
  conf('na quarta, sem prioridade', N.pesoOrdem(semana, QUARTA), 3);
  conf('na quinta, prioriza', N.pesoOrdem(semana, QUINTA), 2);
  const solto = p('solto');
  conf('quarta: empata e desempata por idade', ordem([semana, solto], QUARTA), ['semana', 'solto']);
  conf('quinta: semana passa na frente', ordem([solto, semana], QUINTA), ['semana', 'solto']);
}

console.log('\n6. empate resolve pelo mais antigo');
{
  const a = p('antigo', { criadoEm: '2026-08-20T08:00:00.000Z' });
  const b = p('novo', { criadoEm: '2026-09-08T08:00:00.000Z' });
  conf('mais antigo primeiro', ordem([b, a], QUARTA), ['antigo', 'novo']);
}

console.log('\n7. a ordem completa das quatro faixas');
{
  const lista = [
    p('semfaixa'),
    p('semana', { prazo: { tipo: 'semana' } }),
    p('prazo', { prazo: { tipo: 'data', data: '2026-09-10' } }),
    p('top', { prioridade: { ehTop3: true, data: '2026-09-10' } })
  ];
  conf('3 do dia, prazo, semana, resto', ordem(lista, QUINTA),
       ['top', 'prazo', 'semana', 'semfaixa']);
}

console.log('\n8. indicador de idade');
{
  const item = p('x', { criadoEm: new Date(2026, 8, 9, 10, 0).toISOString() });
  conf('recem criado', N.idadeDias(item, QUARTA), 0);
  const velho = p('y', { criadoEm: new Date(2026, 7, 26, 10, 0).toISOString() });
  conf('14 dias', N.idadeDias(velho, QUARTA), 14);
  conf('limite do alerta', N.IDADE_ALERTA, 14);
}

console.log('\n9. as 3 do dia e a virada da meia-noite');
{
  const hoje = p('hoje', { prioridade: { ehTop3: true, data: '2026-09-09' } });
  const ontem = p('ontem', { prioridade: { ehTop3: true, data: '2026-09-08' } });
  const nunca = p('nunca');
  conf('marcada hoje vale', N.ehTop3(hoje, QUARTA), true);
  conf('marcada ontem nao vale hoje', N.ehTop3(ontem, QUARTA), false);
  conf('sem marca', N.ehTop3(nunca, QUARTA), false);

  // o mesmo item, um dia depois: a marca expira sozinha, sem ninguem limpar
  conf('a de hoje expira amanha', N.ehTop3(hoje, QUINTA), false);

  // prioridade quebrada (item antigo, campo faltando) nao pode derrubar nada
  conf('prioridade ausente', N.ehTop3({ criadoEm: 'x' }, QUARTA), false);
  conf('prioridade nula', N.ehTop3({ prioridade: null }, QUARTA), false);
  conf('ehTop3 sem data', N.ehTop3({ prioridade: { ehTop3: true } }, QUARTA), false);
}

console.log('\n10. trocar uma das 3 nao pode apagar a que ja saiu');
{
  const D = N.definidasAposTroca;
  // escolheu A, B, C; concluiu A; trocou C por D
  conf('a concluida continua definida', D(['B', 'D'], ['A']), ['B', 'D', 'A']);
  conf('placar do dia', D(['B', 'D'], ['A']).length, 3);

  conf('nada concluido ainda', D(['A', 'B', 'C'], []), ['A', 'B', 'C']);
  conf('nao duplica a que segue marcada', D(['A', 'B'], ['A']), ['A', 'B']);
  conf('tirou tudo, sobra o que ja saiu', D([], ['A', 'B']), ['A', 'B']);
  conf('as tres sairam', D([], ['A', 'B', 'C']).length, 3);
  conf('tolera campos ausentes', D(null, null), []);
}

console.log('\n11. ordenar nao altera a lista original');
{
  const original = [p('b'), p('a', { criadoEm: '2026-08-01T08:00:00.000Z' })];
  N.ordenar(original, QUARTA);
  conf('lista intacta', original.map((x) => x.id), ['b', 'a']);
}

console.log(falhas === 0 ? '\nTODOS OS CASOS PASSARAM\n' : '\n' + falhas + ' FALHA(S)\n');
process.exit(falhas ? 1 : 0);
