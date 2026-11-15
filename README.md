# Sistema de Fechaduras — Owlbear Rodeo

Extensão para Owlbear Rodeo com três minijogos controlados pelo mestre: abrir fechadura, hacking de matriz e painel numérico.

## Instalação — versão 1.0.2

Manifesto:
`https://cdn.jsdelivr.net/gh/Onze1Onze/Sistema-Utilidade@586ccc53727f03d748e47623a7e9ebb5afa9842a/manifest.json`

1. No Owlbear Rodeo, abra **Extras → Extensions → Add**.
2. Cole o link do manifesto.
3. Ative a extensão na sala.
4. O mestre abre a ação, escolhe um minijogo, configura a dificuldade e seleciona **Preparar e liberar**.
5. Os jogadores recebem somente a tela do minijogo ativo. Sem sessão liberada, a janela dos jogadores permanece vazia.

## Inicialização

A interface é desenhada imediatamente pelo próprio `app.js`, sem aguardar o SDK ou outro módulo remoto. A conexão com o Owlbear é inicializada em segundo plano usando duas fontes de SDK em sequência, com timeout e mensagem de erro recuperável. Assim, uma falha de CDN não deixa a janela presa em um texto de carregamento.

## Minijogos

- **Abrir Fechadura:** ajuste angular, margem de acerto, tentativas limitadas e cinco presets de dificuldade.
- **Hacking:** matriz de códigos, sequência-alvo, seleção alternada entre coluna e linha e buffer configurável.
- **Painel Numérico:** senha definida pelo mestre, teclado numérico e validação no processo de fundo do mestre.

## Desenvolvimento e testes

A lógica de geração do hacking é compartilhada com `game-logic.js`. Para executar os testes com Node.js 20 ou superior:

`npm test`

A extensão utiliza `@owlbear-rodeo/sdk` 3.1.0. Não há etapa de compilação; os arquivos são estáticos.

## Sincronização e privacidade

O estado público mínimo da sessão fica nos metadados da sala. A senha numérica e o ângulo secreto da fechadura ficam no `localStorage` do dispositivo do mestre. As tentativas são enviadas por `OBR.broadcast` e validadas pelo processo de fundo do mestre. A senha não é incluída nos metadados públicos. A matriz e a sequência-alvo do hacking são visíveis para os jogadores porque fazem parte do desafio.

A validação do painel e da fechadura depende do processo de fundo do Owlbear permanecer conectado na sessão do mestre. A extensão não usa servidor externo próprio.
