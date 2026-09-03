# Agenda do supervisor — esqueleto do Dia 0

Isto **não é o app**. É o esqueleto que existe para responder a uma pergunta e só ela:

> O Chrome do Poco consegue disparar um aviso às 07:00, às 13:00 e às 16:40, sozinho, sem eu abrir nada?

A seção 7 da especificação chama isso de Plano A e manda medir por uma semana antes de
decidir. São **15 disparos úteis** por semana (3 rituais × 5 dias úteis). Este esqueleto
os conta.

O que ele já faz de verdade: **anotar**. Foi incluído porque, sem uso, o Chrome rebaixa
o app na heurística de engajamento — e é justamente dessa heurística que o disparo em
segundo plano depende. Medir com o app parado mediria o pior caso, não o seu.

---

## Critério, fechado antes de medir

**13 dos 15 disparos da semana precisam sair sozinhos, com no máximo 15 minutos de atraso.**

Abaixo disso, Plano B (Web Push com cron do GitHub Actions). O número está escrito aqui
de propósito: se for definido depois de ver o resultado, vai ser definido para justificar
o que já está pronto.

---

## Publicar

O app precisa estar num endereço que comece com `https://`. Não funciona abrindo o
arquivo direto no computador — o pedaço que dispara o aviso só roda em site publicado.
O lugar é o GitHub Pages, como manda a decisão 20 da especificação.

**Isto é feito uma vez só, junto com o Claude.** Os passos que exigem você (criar a
conta, fazer login, apertar botão no site do GitHub) são guiados na conversa, um de cada
vez. O resto é comando, e o Claude roda.

Quando terminar, o endereço vai ser algo como
`https://SEU-USUARIO.github.io/agenda-supervisor/` — é esse endereço que você abre no
celular para instalar.

---

## Instalar no Poco X8 Pro

A ordem importa. O passo 4 é o que faz a diferença entre o aviso durar uma semana ou
morrer na quarta-feira.

1. Abrir o endereço no **Chrome** (não no Mi Browser).
2. Menu ⋮ → **Instalar aplicativo** / **Adicionar à tela inicial**. Colocar o ícone
   laranja ao lado do WhatsApp.
3. Abrir **pelo ícone**, não pela aba do Chrome. Na tela de boas-vindas, tocar
   **Ativar avisos** e aceitar.
4. **Ajustes → Apps → Agenda → Economia de bateria → Sem restrições.**
   Depois abrir a multitarefa e **trancar** o app no cadeado.
   Sem isto o HyperOS mata o processo e o aviso some em poucos dias — e a semana de
   medição mede a configuração errada, não o Plano A.
5. Marcar *Já fiz* e tocar **Começar**.

O `periodicSync` só é liberado para app instalado na tela inicial. Se o passo 2 for
pulado, a tela de medição vai mostrar `permissão denied` e não há o que medir.

---

## Durante a semana

Use normalmente: sempre que pensar em algo, ícone → ANOTAR → digitar → SALVAR.
Não precisa fazer nada com o que for anotado — a triagem é da Etapa 1. As anotações
ficam guardadas e esperam.

Quando o aviso aparecer, **toque nele**. Isso registra que o aviso chegou até você,
que é diferente de ele ter sido disparado.

## No fim da semana

Abertura → **medição do gatilho**. A tela mostra:

| cor | significa |
|---|---|
| verde `sozinho` | o service worker disparou em segundo plano — **é isto que conta** |
| laranja `só ao abrir` | ninguém disparou; o app correu atrás quando você o abriu |
| vermelho `não saiu` | a janela de 90 min fechou sem nada. Perdido |

O botão **Copiar relatório** gera o texto linha a linha para conferir fora do celular.

---

## O que tem dentro

| arquivo | o que é |
|---|---|
| `index.html` | as telas, todas em um arquivo |
| `styles.css` | contraste alto para ler no sol; botões no alcance do polegar |
| `nucleo.js` | datas, banco e a varredura de rituais — **compartilhado** entre a página e o service worker |
| `app.js` | as telas e o relógio de primeiro plano |
| `sw.js` | offline e o disparo em segundo plano |
| `manifest.json` | ícone, nome, tela cheia |
| `teste/rituais.js` | os casos do testador (seção 10) |

Sem framework, sem `npm install`, sem etapa de build. Abrir e ler.

Os testes rodam com `node teste/rituais.js` e cobrem virada de meia-noite, fim de
semana, aparelho desligado por um mês, o limite exato da janela de 90 minutos e o caso
de o service worker e a página varrerem quase ao mesmo tempo sem contar duas vezes.

---

## O que ainda NÃO existe

Triagem, contextos, as 3 do dia, os passos dos rituais, rotinas na tela, relatório,
backup. Tudo isso é Etapa 1 e Etapa 2, e entra depois que a pergunta do Dia 0 tiver
resposta. As 4 rotinas de fábrica já estão gravadas no banco, mas não aparecem em
lugar nenhum ainda.

O botão **ONDE ESTOU** e os três contextos estão na tela desligados de propósito: o que
está sendo testado ali é o alcance do polegar, não a lista.
