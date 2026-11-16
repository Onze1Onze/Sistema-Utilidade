# Sistema de Fechaduras — Owlbear Rodeo

Extensão para Owlbear Rodeo com três minijogos controlados pelo mestre: abrir fechadura, hacking de matriz e painel numérico.

## Instalação — versão 1.0.6

Use o manifesto da branch principal:
`https://cdn.jsdelivr.net/gh/Onze1Onze/Sistema-Utilidade@ff3cd5927e2a769f89ce2f627a3a341851bb0c7d/manifest.json`

1. No Owlbear Rodeo, abra **Extras → Extensions → Add**.
2. Cole a URL do manifesto.
3. Ative a extensão na sala.
4. O mestre abre a ação, escolhe o minijogo, configura a dificuldade e seleciona **Preparar e liberar**.
5. Os jogadores recebem somente a tela do minijogo ativo. Sem sessão liberada, a janela dos jogadores permanece vazia.

## Inicialização do Owlbear SDK

O SDK oficial `@owlbear-rodeo/sdk` 3.1.0 é importado estaticamente no início dos módulos de interface e de fundo. Não usar `import()` dinâmico para o SDK: ele instala o listener de `window.message` durante a avaliação do módulo e precisa receber o evento único `OBR_READY` enviado pelo host.

O HTML registra um listener inline antes dos módulos e guarda o evento `OBR_READY` se o SDK ainda não estiver carregado. Após a avaliação do módulo, o evento é reentregue ao SDK com a origem original. O SDK então valida essa origem contra a origem decodificada do parâmetro `obrref` na URL do iframe. A interface é renderizada antes da conexão; ações que necessitam do Owlbear aguardam a inicialização em vez de falhar imediatamente.

## Minijogos

- **Abrir Fechadura:** minijogo de pinos inspirado em Oblivion. Cada pino segue um movimento suave e desacelera perto do topo. A faixa de acerto é mais ampla e aceita cliques tanto na subida quanto na descida. Cinco presets equilibram a quantidade de pinos, as gazuas, o tamanho da faixa e a velocidade; os ajustes avançados também permitem ampliar a janela e reduzir a velocidade. Os níveis difíceis continuam exigindo atenção, mas deixam margem para erros.
- **Hacking:** matriz de códigos, sequência-alvo, seleção alternada entre coluna e linha e buffer configurável.
- **Painel Numérico:** senha definida pelo mestre, teclado numérico e validação no processo de fundo do mestre.

## Comunicação entre jogador e mestre

A conexão usa o canal `com.onze11.sistema-utilidade/v1` do `OBR.broadcast`.

1. O jogador envia uma tentativa para os demais participantes com `destination: "REMOTE"`, incluindo sessão, jogo e um `requestId` único.
2. O processo de fundo do mestre assina o canal, identifica o remetente pelo `event.connectionId`, lê o segredo privado da sessão e valida a tentativa com `resolvePlayerAttempt`.
3. A resposta é enviada por `REMOTE` com `targetConnectionId`; cada interface de jogador só aceita a resposta que corresponde à sua própria conexão, sessão e `requestId`.
4. O resultado também é enviado com `destination: "LOCAL"` para atualizar a interface do mestre, que mostra quem tentou, a resposta e as tentativas restantes.
5. O processamento é serializado para evitar que duas tentativas simultâneas sobrescrevam o estado secreto.

A senha numérica, o estado autoritativo dos pinos e a quantidade de gazuas restantes ficam no dispositivo do mestre e não são enviados aos metadados públicos da sala. A configuração pública contém as velocidades/fases para animar cada pino e o limiar de precisão, que também define a faixa luminosa visível ao jogador. O mestre valida o clique contra sua cópia privada desse limiar. A matriz e a sequência do hacking são públicas porque são pistas do desafio.

## Desenvolvimento e testes

A lógica de validação está em `game-logic.js`. Execute com Node.js 20 ou superior:

`npm test`

A suíte cobre geração de matrizes, movimento suave e faixa de acerto dos pinos nos dois sentidos, margem de gazuas por dificuldade, quebra de gazuas, conclusão de fechaduras, validação das três modalidades, handshake do SDK, arbitragem de tentativas, entrega de resposta ao jogador e atualização visual do mestre. O GitHub Actions executa os testes em cada push e pull request.

A interface não exige etapa de compilação. O SDK é importado da distribuição ESM do jsDelivr; os arquivos da extensão são estáticos.
