# Sistema de Fechaduras — Owlbear Rodeo

Extensão para Owlbear Rodeo com três minijogos controlados pelo mestre: abrir fechadura, hacking de matriz e painel numérico.

## Instalação — versão 1.0.3

O manifesto atualizado está no repositório:
`https://cdn.jsdelivr.net/gh/Onze1Onze/Sistema-Utilidade@main/manifest.json`

1. No Owlbear Rodeo, abra **Extras → Extensions → Add**.
2. Cole a URL do manifesto.
3. Ative a extensão na sala.
4. O mestre abre a ação, escolhe o minijogo, configura a dificuldade e seleciona **Preparar e liberar**.
5. Os jogadores recebem somente a tela do minijogo ativo. Sem sessão liberada, a janela dos jogadores permanece vazia.

## Inicialização do Owlbear SDK

O SDK oficial `@owlbear-rodeo/sdk` 3.1.0 é importado estaticamente no início dos módulos de interface e de fundo. Não usar `import()` dinâmico para o SDK: ele instala o listener de `window.message` durante a avaliação do módulo e precisa receber o evento único `OBR_READY` enviado pelo host.

O HTML registra um listener inline antes dos módulos e guarda o evento `OBR_READY` se o SDK ainda não estiver carregado. Após a avaliação do módulo, o evento é reentregue ao SDK com a origem original. O SDK então valida essa origem contra a origem decodificada do parâmetro `obrref` na URL do iframe. A interface é renderizada antes da conexão; ações que necessitam do Owlbear aguardam a inicialização em vez de falhar imediatamente.

## Minijogos

- **Abrir Fechadura:** ajuste angular, margem de acerto, tentativas limitadas e cinco presets de dificuldade.
- **Hacking:** matriz de códigos, sequência-alvo, seleção alternada entre coluna e linha e buffer configurável.
- **Painel Numérico:** senha definida pelo mestre, teclado numérico e validação no processo de fundo do mestre.

## Desenvolvimento e testes

A lógica de geração do hacking está em `game-logic.js`. Os testes de lógica e de handshake podem ser executados com Node.js 20 ou superior:

`npm test`

A interface não exige etapa de compilação. O SDK é carregado da distribuição ESM do jsDelivr; os arquivos da extensão são estáticos.

## Sincronização e privacidade

O estado público mínimo da sessão fica nos metadados da sala. A senha numérica e o ângulo secreto da fechadura ficam no `localStorage` do dispositivo do mestre. As tentativas são enviadas por `OBR.broadcast` e validadas pelo processo de fundo do mestre. A senha não é incluída nos metadados públicos. A matriz e a sequência-alvo do hacking são visíveis para os jogadores porque fazem parte do desafio.

A validação do painel e da fechadura depende do processo de fundo do Owlbear permanecer conectado na sessão do mestre. A extensão não usa servidor externo próprio.
