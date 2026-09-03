# Especificação — Agenda pessoal do supervisor de elétrica

**Versão:** 1.0 · fechada em 02/09/2026
**Origem:** entrevista de requisitos, 21 decisões fechadas
**Status:** pronta para implementação da Etapa 1

---

## 1. Quem usa e qual é o problema

Supervisor de elétrica, expediente das 07h às 17h, almoço das 12h às 13h. Celular Poco X8 Pro (Android/Chrome), na mão o dia inteiro.

O problema, nas palavras dele: faz muita coisa durante o dia e chega ao fim com a sensação de não ter feito nada, porque o que gostaria de ter feito não fez. Atividades aleatórias roubam o tempo. Tem dificuldade de foco. Hoje anota mandando mensagem para o próprio número no WhatsApp — e nunca revisita.

**Diagnóstico que orientou o desenho:** não falta acesso ao celular nem falta tempo livre. Falta *gatilho*. O celular está sempre na mão, mas quem ganha a atenção é o WhatsApp, porque ele vibra. E falta a distinção entre trabalho próprio e demanda de terceiro, que é provavelmente a causa real da sensação de vazio no fim do dia.

**Princípio norteador, que vale para toda decisão futura:**
> Ao abrir o app existem só dois motivos possíveis — ou tenho algo para despejar, ou quero saber o que fazer. Tudo que não serve a esses dois é distração.

---

## 2. Não-objetivos

Explicitamente **fora** do projeto. Se surgir sugestão de incluir qualquer um destes durante a implementação, a resposta é não.

- Uso por mais de uma pessoa, login, conta, permissões
- Servidor próprio, banco de dados remoto, backend
- Versão para desktop ou sincronização entre aparelhos
- Fotos, anexos, arquivos
- Projetos, subtarefas, dependências entre tarefas, tags livres
- Gráficos de produtividade fora do relatório mensal especificado
- Integração com calendário, e-mail, WhatsApp ou qualquer sistema da empresa
- Gamificação, streaks, pontuação, conquistas

---

## 3. As 21 decisões fechadas

| # | Decisão |
|---|---|
| 1 | Agenda **pessoal**. Sem servidor, sem login, sem conta. Dados no aparelho. |
| 2 | **Celular é o único lugar oficial.** Consulta no PC, se precisar, sai por exportação de texto. |
| 3 | Alvo único: **Android / Chrome**, Poco X8 Pro. Não fazer concessões a iOS. |
| 4 | O app precisa **interromper por conta própria**. Ícone fica ao lado do WhatsApp na tela inicial. |
| 5 | Três rituais: **07:00** abertura (4 min), **13:00** replanejamento (2 min), **16:40** fechamento (2 min). Nenhum outro. |
| 6 | Dois tipos apenas: **pendência** e **rotina**. Mais uma marcação binária na pendência: **minha demanda** ou **demanda de terceiro**. |
| 7 | Prazo **opcional**: sem prazo (padrão) / esta semana / data marcada. Hora opcional. Aviso 2 dias antes do prazo. |
| 8 | Três contextos: **computador**, **campo**, **telefone/pessoa**. Marcados na triagem, **nunca** na captura. |
| 9 | Tela de abertura com duas ações lado a lado: **anotar** e **onde estou**. |
| 10 | Ao escolher o contexto, mostrar a **lista** daquele contexto, ordenada pelo app. Não mostrar item único. |
| 11 | Ordenação: **3 do dia → prazo chegando → mais antigo primeiro.** Indicador de idade aos 14 dias, pergunta de faxina aos 21. |
| 12 | Captura por **texto**, teclado aberto e cursor no campo ao abrir a tela. Voz fica por conta do microfone do teclado do sistema. |
| 13 | **Sem fotos.** |
| 14 | Marcação **"esperando resposta"**: ao concluir, perguntar em quantos dias cobrar de novo (2/3/7). Item volta sozinho na data. Lista própria exibida no ritual das 13h. |
| 15 | **Notificação do app** é o mecanismo principal. Badge no ícone é bônus. Sem alarme de relógio na v1. |
| 16 | Notificações trazem **números concretos**, nunca texto genérico. |
| 17 | Fechamento em 3 passos, **foco no que foi concluído**. Pendências comuns não cobram. |
| 18 | Relatório mensal: **composição em cima, volume embaixo**. Sem estimativa de tempo na v1. |
| 19 | App nasce com **as 4 rotinas** cadastradas e nada mais. Sem carga inicial de pendências. |
| 20 | Hospedagem: **GitHub Pages**. |
| 21 | Entrega em **duas etapas**. Notificação entra já na Etapa 1. |

---

## 4. Modelo de dados

```
Pendencia {
  id            string
  texto         string
  origem        'minha' | 'terceiro'          // marcado na triagem
  contexto      'computador' | 'campo' | 'pessoa' | null
  prazo         { tipo: 'nenhum' | 'semana' | 'data',
                  data?: 'AAAA-MM-DD', hora?: 'HH:MM' }
  prioridade    { ehTop3: bool, data: 'AAAA-MM-DD' }   // as 3 do dia, válido só naquele dia
  status        'nova' | 'ativa' | 'esperando' | 'concluida' | 'descartada'
  espera        { desde, retornaEm, historicoCobrancas: [datas] }
  criadoEm      timestamp
  concluidoEm   timestamp | null
  revisadaEm    'AAAA-MM-DD' | null            // última vez que passou pela faxina dos 21 dias
}

Rotina {
  id          string
  texto       string
  contexto    'computador' | 'campo' | 'pessoa'
  frequencia  'diaria' | 'semanal' | 'mensal'
  diaSemana   0..6        // se semanal
  diaMes      1..28       // se mensal
  ultimaExecucao 'AAAA-MM-DD' | null
}

Config {
  rituais { abertura: '07:00', replanejamento: '13:00', fechamento: '16:40' }
  diasUteis [1,2,3,4,5]
  avisoPrazoDias 2
  idadeAlerta 14
  idadeFaxina 21
  ultimoBackup 'AAAA-MM-DD'
}

Historico {
  'AAAA-MM-DD': {
    concluidas: [ {id, texto, origem, contexto, tipo: 'pendencia'|'rotina'} ],
    top3Definidas: [ids],
    top3Concluidas: [ids],
    descartadas: n
  }
}
```

**Rotinas cadastradas de fábrica:**

| Texto | Contexto | Frequência |
|---|---|---|
| Revisar horas dos colaboradores | computador | semanal, sexta |
| Levantar material a comprar da semana | computador | semanal, segunda |
| Atualizar status dos projetos em andamento | computador | semanal, quarta |
| Passar na frente de serviço e anotar pendências | campo | diária |

**Persistência:** IndexedDB, não localStorage. Chamar `navigator.storage.persist()` na primeira execução para reduzir o risco de o Android limpar os dados quando o aparelho encher.

---

## 5. Telas

### 5.1 Abertura

Duas ações grandes, lado a lado, ocupando a parte de cima da tela: **ANOTAR** e **ONDE ESTOU**.

Abaixo, só informação, sem exigir ação: quantas concluídas hoje, quantas das 3 do dia saíram, quantas anotações aguardam triagem.

Se houver ritual pendente no horário, aparece uma faixa no topo levando direto para ele.

### 5.2 Anotar

Abre com **teclado aberto e cursor no campo**. Um campo de texto e um botão de salvar. Nada mais — sem categoria, sem contexto, sem prazo, sem prioridade. Ao salvar, o app volta sozinho para a abertura. A pendência nasce com `status: 'nova'` e vai para a fila de triagem.

Meta de desempenho: dois toques da tela inicial do celular até estar digitando.

### 5.3 Onde estou

Três botões: **computador**, **campo**, **telefone/pessoa**. Ao escolher, mostra a lista das pendências ativas daquele contexto, na ordem definida na decisão 11.

Cada item da lista traz: o texto, um indicador de origem (minha / terceiro), o prazo se houver, e o indicador de idade se passou de 14 dias. Concluir é um toque.

### 5.4 Ritual das 07:00 — abertura (4 min)

1. O que ficou de ontem, se houver: as 3 do dia não concluídas, com opção de repuxar.
2. Rotinas que vencem hoje.
3. Triagem das anotações novas: para cada uma, marcar contexto, origem e prazo. Três toques por item.
4. Escolher as 3 do dia.

### 5.5 Ritual das 13:00 — replanejamento (2 min)

1. Placar da manhã: quantas das 3 saíram.
2. **Esperando terceiros**: lista das pendências com espera vencida, para cobrar ou reagendar.
3. Triagem do que foi anotado durante a manhã.
4. Se alguma das 3 do dia claramente não vai sair, permitir trocar por outra — sem penalidade nem alerta.

### 5.6 Ritual das 16:40 — fechamento (2 min)

1. **O que saiu.** Lista das concluídas do dia, total em destaque. Inclui rotinas cumpridas. Só isso na primeira tela.
2. **As 3 do dia que não saíram.** Só as três. Cada uma com dois botões: vai para amanhã, ou volta para a lista geral.
3. **Encerrado.** Tela de fim. O app não mostra mais nada até as 07:00 do dia seguinte.

Pendências comuns não concluídas **não aparecem** neste ritual e nunca ficam vermelhas.

Na sexta-feira, o passo 3 inclui o lembrete de backup.

### 5.7 Relatório mensal

**Composição, em cima:**
- Minha demanda × demanda de terceiro (percentual)
- Distribuição entre computador, campo e telefone
- Rotinas cumpridas sobre rotinas devidas
- Itens descartados na faxina

**Volume, embaixo:**
- Total de concluídas, média por dia útil, comparação com o mês anterior

---

## 6. Comportamentos que não estão nas telas

- **Faxina dos 21 dias.** Pendência ativa sem prioridade parada há 21 dias aparece uma vez no ritual da manhã com a pergunta: "isso está aqui há três semanas. Ainda precisa ser feito?" Duas respostas: mantém (zera o contador) ou descarta. Não repetir a pergunta no mesmo ciclo.
- **Prazo.** Item com data marcada entra na ordenação 2 dias antes. Item "esta semana" ganha prioridade a partir de quinta.
- **As 3 do dia** valem só para aquele dia. Não sobrevivem à virada sem passar pelo ritual.
- **Esperando resposta.** Ao concluir uma pendência marcada, perguntar o retorno (2/3/7 dias). O item sai de vista e volta na data com o histórico de cobranças anterior visível.
- **Backup.** Botão que gera arquivo com todos os dados. Botão de restaurar do outro lado, com confirmação explícita antes de sobrescrever, mostrando a data do arquivo e a data dos dados atuais.

---

## 7. Risco técnico principal — leia antes de começar

**Agendar notificação local em horário fixo, num PWA sem servidor, é a parte genuinamente difícil deste projeto.** Não é detalhe de implementação; é o requisito que sustenta todo o resto, porque sem gatilho o usuário não abre o app. Tratar como primeira tarefa da Etapa 1, não como última.

O que **não** resolve: `setTimeout` só roda com o app aberto. A Notification Triggers API não foi adotada. Periodic Background Sync tem intervalo mínimo alto e depende de heurística de engajamento do Chrome — pode funcionar, mas não em horário preciso.

Três planos, nesta ordem:

**Plano A** — Service worker com Periodic Background Sync, mais verificação de rituais pendentes a cada abertura do app. Barato de implementar. Testar por uma semana e **medir**: quantos dos 15 disparos úteis da semana realmente aconteceram no horário.

**Plano B** — Web Push com VAPID, disparado por um cron de GitHub Actions três vezes por dia. Sem servidor próprio, dentro da cota gratuita, e usa infraestrutura que o projeto já tem por causa do GitHub Pages. Mais trabalho e exige guardar a subscription. É o plano correto se o A falhar.

**Plano C** — Três alarmes no relógio do Android, criados na mão. Feio, mas nunca falha. Rede de segurança, não solução.

**Passo obrigatório de instalação, independente do plano:** liberar o app em Configurações → Apps → Economia de bateria → Sem restrições, e travar na multitarefa. Xiaomi/HyperOS mata processo em segundo plano com agressividade e sem isso a notificação morre em poucos dias.

**Badge no ícone:** implementar via Badging API, mas tratar como bônus. Suporte irregular em PWA no Android. Se não aparecer, não é defeito.

---

## 8. Escopo das etapas

### Etapa 1 — o osso

- Captura em dois toques
- Triagem: contexto, origem, prazo
- Onde estou → lista ordenada por contexto
- As 3 do dia
- Rotinas com as 4 de fábrica
- Os três rituais completos
- Notificação nos três horários (ver seção 7)
- Instalação na tela inicial com ícone próprio
- Funcionamento offline

### Etapa 2 — depois de uma semana de uso real

- Esperando terceiros, com retorno automático
- Relatório mensal
- Backup e restauração
- Faxina dos 21 dias
- Ajustes que o uso da Etapa 1 revelar

Metade das decisões desta especificação foi tomada sem o usuário nunca ter usado o app. A semana entre as etapas existe para corrigir isso com informação real: se três rituais são demais ou de menos, se os três contextos bastam, se 21 dias é curto.

---

## 9. Stack

- Sem framework. HTML, CSS e JavaScript direto.
- Service worker para offline e notificação.
- Manifest com ícone próprio, `display: standalone`.
- IndexedDB com persistência solicitada.
- Estrutura de poucos arquivos, legível, sem etapa de build.

Motivo: o dono do projeto não é desenvolvedor e vai voltar a mexer nisso daqui a meses. Qualquer coisa que exija `npm install` para rodar é dívida.

---

## 10. Instruções para a implementação em quatro perfis

O trabalho deve ser conduzido por quatro perfis que conversam entre si. A regra que faz isso valer alguma coisa:

> **Só se manifesta quem tem objeção.** Nada de rodada de aprovação. Silêncio quer dizer que está bom. O valor de ter quatro perfis está no atrito entre eles — se os quatro só concordam em sequência, é texto triplicado sem ganho.

**Designer de interação.** Não cuida de estética; cuida de atrito. As perguntas dele são "quantos toques", "isso é legível com o celular na mão, no sol, com pressa" e "isso pode ser feito com uma mão só". Se ele começar a discutir paleta ou animação, está no assunto errado.

**Analista guardião da especificação.** Trabalho único e estreito: impedir que o escopo cresça. Quando surgir "já que estamos aqui, dava para colocar tal coisa", ele responde se está ou não está neste documento. Não reabre requisito fechado — isso já foi decidido.

**Desenvolvedor.** Implementa. Levanta impedimento técnico assim que o vê, especialmente na seção 7.

**Testador.** O trabalho dele é quebrar, e ele deve ser ouvido antes de cada entrega. Casos mínimos a cobrir:
- virada de meia-noite com o app aberto
- app aberto sem sinal
- notificação bloqueada pela Xiaomi
- rotina concluída duas vezes no mesmo dia
- restauração de backup por cima de dados mais novos
- item com prazo já vencido no momento da criação
- as 3 do dia escolhidas e o dia virando sem ritual de fechamento
- fuso e horário de verão
- armazenamento cheio ou dados limpos pelo sistema

**O usuário é a quinta voz e tem veto sobre todos.** Ele é o dono do produto e o único usuário. Nenhum perfil decide prioridade por ele.
