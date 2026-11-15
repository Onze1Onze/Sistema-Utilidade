# Sistema de Fechaduras — Owlbear Rodeo

Extensão com três minijogos controlados pelo mestre:

- **Abrir Fechadura:** ajuste angular, zona de acerto configurável e ferramentas limitadas.
- **Hacking:** matriz de códigos com alternância entre coluna e linha, sequência-alvo e buffer.
- **Painel Numérico:** senha definida pelo mestre e validada no cliente do mestre.

## Instalação

1. No Owlbear Rodeo, abra **Extras → Extensions → Add**.
2. Use o manifesto: `https://cdn.jsdelivr.net/gh/Onze1Onze/Sistema-Utilidade@main/manifest.json`.
3. Ative a extensão na sala.
4. O mestre abre a ação, escolhe um minijogo, configura e seleciona **Preparar e liberar**.
5. A tela dos jogadores é aberta quando a sessão é publicada. O mestre pode encerrá-la a qualquer momento.

## Desenvolvimento e testes

A lógica independente do Owlbear SDK está em `game-logic.js`. Para rodar os testes com Node.js 20 ou superior:

`node --test tests/game-logic.test.mjs`

A interface usa o SDK oficial `@owlbear-rodeo/sdk` 3.1.0 via esm.sh, sem etapa de compilação. Os arquivos são estáticos e carregados pelo jsDelivr a partir deste repositório.

## Sincronização e privacidade

O estado público mínimo da sessão fica no metadado da sala. A senha numérica e o ângulo secreto da fechadura ficam no `localStorage` do dispositivo do mestre. As tentativas são enviadas por `OBR.broadcast` e validadas pelo processo de fundo do mestre; a senha nunca é incluída nos metadados públicos. O minijogo de hacking publica a matriz e a sequência-alvo, pois ambos são pistas que o próprio jogador precisa ver.

A validação do painel e da fechadura depende do processo de fundo do Owlbear permanecer carregado no navegador do mestre. A extensão não usa servidor externo próprio.
