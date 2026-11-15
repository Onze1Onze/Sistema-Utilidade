# Sistema de Fechaduras — Owlbear Rodeo

Extensão com três minijogos controlados pelo mestre:

- **Abrir Fechadura:** ajuste angular, zona de acerto configurável e ferramentas limitadas.
- **Hacking:** matriz de códigos com alternância entre coluna e linha, sequência-alvo e buffer.
- **Painel Numérico:** senha definida pelo mestre e validada no cliente do mestre.

## Instalação

Use a URL do manifesto mostrada na página do repositório. A versão atual utiliza o host `rawcdn.githack.com` para as páginas HTML porque o jsDelivr entrega arquivos `.html` com `Content-Type: text/plain`, fazendo o navegador exibir o código-fonte em vez de renderizar a interface.

1. No Owlbear Rodeo, abra **Extras → Extensions → Add**.
2. Cole a URL do `manifest.json`.
3. Ative a extensão na sala.
4. O mestre abre a ação, escolhe o minijogo, configura e seleciona **Preparar e liberar**.
5. A tela dos jogadores é aberta quando a sessão é publicada. Os jogadores recebem somente a tela do minijogo, sem o menu de configuração do mestre.

## Desenvolvimento e testes

A lógica independente do Owlbear SDK está em `game-logic.js`. Para executar os testes com Node.js 20 ou superior:

`npm test`

A interface usa o SDK oficial `@owlbear-rodeo/sdk` 3.1.0 via esm.sh, sem etapa de compilação.

## Sincronização e privacidade

O estado público mínimo da sessão fica no metadado da sala. A senha numérica e o ângulo secreto da fechadura ficam no `localStorage` do dispositivo do mestre. As tentativas são enviadas por `OBR.broadcast` e validadas pelo processo de fundo do mestre; a senha nunca é incluída nos metadados públicos. A matriz e a sequência-alvo do hacking são visíveis para os jogadores porque fazem parte do próprio desafio.

A validação do painel e da fechadura depende do processo de fundo do Owlbear permanecer carregado no navegador do mestre. A extensão não usa servidor externo próprio.
