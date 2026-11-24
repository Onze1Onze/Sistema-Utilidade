# Outro Lado — Painel de Ameaças

Versão 1.4.0. Extensão para Owlbear Rodeo voltada ao gerenciamento privado de fichas de Ameaças de Ordem Paranormal pelo Mestre.

## Instalação

Manifesto da pasta:

    https://raw.githubusercontent.com/Onze1Onze/Sistema-Utilidade/main/outro-lado-painel-ameacas/manifest.json

No Owlbear Rodeo, abra **Extras → Extensions → Add**, cole a URL do manifesto e ative a extensão na sala. A ação **Painel de Ameaças** aparece na barra superior.

## Privacidade

- A interface consulta `OBR.player.getRole()` antes de abrir o armazenamento privado.
- Para uma sessão com papel `PLAYER`, a ação é fechada e a interface exibe somente a mensagem de acesso restrito.
- Fichas, estado atual, condições, recursos e histórico são persistidos no IndexedDB do navegador do Mestre, com fallback para `localStorage`.
- A extensão não grava fichas em metadados da sala, não usa broadcast para as fichas e não envia os dados para serviços externos.
- O armazenamento é local ao navegador/perfil que está atuando como Mestre; não é sincronizado entre dispositivos. Exporte JSON para fazer cópias de segurança ou transferir fichas.

## Fluxo JSON

O botão `+` abre o modelo completo. Preencha o JSON externamente ou diretamente no editor e use **Validar e importar**. A edição funciona pelo mesmo editor: exporte, altere e salve. O formato mantém `creature` (dados-base) separado de `state` (vida atual, condições, recursos, histórico e histórico de rolagens).

A nova lista `creature.skillTests` permite registrar testes de perícia com `name`, `attribute`, `test` e `damage`. Para testes de Percepção, o campo opcional `senseUse` aceita `"observe"` ou `"hear"`, permitindo que Cego impeça observação sem impedir audição e que Surdo impeça somente testes para ouvir. Os botões de teste e dano são separados na ficha. Cada ataque também oferece ações independentes para rolar o teste e o dano. Para ações puramente mentais sob Paralisado, marque `mental: true` no registro de habilidade/ação. Para ataques com armas leves sob Agarrado, identifique a arma com `weaponType: "light"` ou `isLightWeapon: true`.

O schema é versionado (`schemaVersion: 1`) e mantém propriedades desconhecidas dentro do objeto da criatura, permitindo estender a ficha sem perder campos futuros.

As condições são selecionadas em uma lista com descrição e grupo; clicar aplica imediatamente os modificadores e as regras predefinidas, e o botão × na ficha remove a condição. Reaplicações permitidas avançam para o agravamento previsto; opções já ativas sem agravamento ficam indisponíveis até serem removidas. Não existe mais entrada manual de condições pela interface.

## Sistemas implementados

- Bandeja vertical com busca e cartões das ameaças.
- Criação, importação, edição, duplicação, exclusão e exportação JSON.
- Validação com caminho do campo e mensagem do formato esperado.
- Vida atual/máxima com indicação vermelha ao atingir a faixa de Machucado (limite configurado em `creature.hp.woundedAt` ou metade dos PV quando não informado).
- Dano vindo de rolagens é aplicado diretamente aos PV após seleção de um dos 13 tipos; RD específica e universal é calculada automaticamente, imunidades anulam o dano e a caixa `Ignorar RD` ignora somente reduções, nunca imunidades.
- Cura Acelerada recebe um botão próprio que cura automaticamente a quantidade configurada; não há campo para digitar valores manuais de dano ou cura.
- Condições criadas pelo Mestre com modificadores numéricos para Defesa, salvaguardas, sentidos, deslocamento, ataques, dano, atributos e quantidade de dados.
- Exibição de valor-base e valor modificado; remover uma condição recalcula os valores derivados.
- Campo JSON `skillTests` com atributo associado, expressão de teste e expressão de dano separadas; a ficha apresenta botões independentes para testar perícias e rolar dano.
- Rolagens de ataques divididas em ações independentes de teste e dano.
- Rolagem apresentada em painel compacto não modal, sem escurecer a ficha; histórico de resultados individual por ameaça, com dados e totais persistidos no JSON.
- Temas visuais e SVGs próprios para Sangue (vermelho), Morte (preto), Conhecimento (dourado), Energia (rosa/ciano) e Medo (branco).
- Seletor visual de 17 condições predefinidas: clique em uma opção para aplicar automaticamente; condições ativas aparecem na ficha e podem ser removidas individualmente. Não há formulário para escrever condições ou modificadores manualmente. Catálogo: Agarrado, Caído, Cego, Debilitado, Desprevenido, Enredado, Exausto, Fatigado, Fraco, Inconsciente, Indefeso, Ofuscado, Paralisado, Petrificado, Surdo, Surpreendido e Vulnerável. Modificadores de Defesa situacional, atributos, salvaguardas, testes, deslocamento, restrições e resistência são calculados sem alterar os valores-base.
- Reaplicações de Fraco, Debilitado, Fatigado e Exausto avançam para o agravamento descrito; estágios mais graves substituem os menos graves e impedem rebaixamento automático.
- Recursos mutáveis, ataques e habilidades interativos.
- Parser e rolador para expressões como `1d20`, `2d20+10`, `4d6`, `2d8+7` e expressões compostas com soma/subtração.
- Feedback animado de rolagem e histórico local de alterações relevantes.
- Interface responsiva com estrutura e linguagem visual inspiradas na ficha de referência anexada, reconstruídas em HTML/CSS.

## Diagnóstico de inicialização

O carregador do SDK tenta provedores independentes em ordem e apresenta a URL/origem e a mensagem de erro de cada tentativa quando todas falham. Não existe mais preload obrigatório do jsDelivr; uma falha 503 isolada desse provedor não interrompe o carregamento.

## Estrutura

- `manifest.json` — manifesto do Owlbear.
- `index.html` / `styles.css` — interface e layout.
- `src/main.js` — integração com o SDK e eventos da interface.
- `src/threat-engine.js` — modelo, validação, condições, modificadores e rolagens.
- `src/dice.js` — execução de ataques, testes de perícia, salvaguardas e dano.
- `src/conditions.js` — catálogo de condições, modificadores automáticos e agravamentos por reaplicação.
- `assets/elements/` — emblemas vetoriais por elemento paranormal.
- `src/storage.js` — persistência privada local.
- `tests/threat-engine.test.js` / `tests/conditions.test.js` — testes automatizados da lógica e condições.
- `tests/assets.test.js` / `tests/manifest.test.js` — conferência de assets, imports e manifesto.

## Desenvolvimento e testes

O SDK oficial do Owlbear (3.1.0) é carregado com fallback entre esm.sh, jsDelivr e Skypack. O handshake `OBR_READY` é armazenado antes do carregamento e reentregue ao SDK, pois o Owlbear envia esse evento uma única vez. O link do manifesto usa diretamente `raw.githubusercontent.com` (origem do GitHub, sem CDN); os arquivos da interface são servidos por `raw.githack` com tipos MIME próprios para HTML, CSS, JavaScript e SVG. Para executar os testes de lógica com Node.js 20 ou superior:

    cd outro-lado-painel-ameacas && npm test && npm run check

A extensão é estática e não requer etapa de build. As condições predefinidas implementam os efeitos explicitados na lista configurada no projeto. Restrições que dependem de contexto externo à ficha — como escolher o alvo errado em um ataque à distância contra alguém envolvido em agarrar, perceber inimigos no mapa ou resolver camuflagem total — aparecem como avisos operacionais para o Mestre; não são decididas automaticamente sem integração com o sistema de alvos do Owlbear. Lentidão é representada como metade do deslocamento, e imóvel como deslocamento zero.


## Modelo de dados 1.3.0

O modelo padrão de criação agora segue a estrutura organizada por grupos: `abilities` usa `damageDice`, `dt` e `savingThrow`; `actions` é um objeto com as listas `agredir` e `other`. Cada ação de Agredir possui teste, dano, margem e multiplicador críticos, alcance, efeitos e descrição. O formulário também apresenta essas informações e rolagens separadas na ficha.

Fichas antigas que usam `actions` como array são migradas automaticamente para `actions.other`; as entradas existentes são preservadas. O campo legado `skillTests` continua sendo aceito na importação, mas não aparece no novo modelo padrão.

## Sistema de dano 1.4.0

Os botões de rolagem de ataque, habilidade e dano exibem a ação **Aplicar dano à vida** quando há um resultado de dano. Selecione um tipo (Corte, Impacto, Balístico, Perfurante, Elétrico, Ácido, Frio, Fogo, Energia, Sangue, Conhecimento, Morte ou Medo) e aplique o total rolado. As resistências podem ser descritas como texto (por exemplo, `RD 5 contra Corte e Impacto`) ou objetos (`{"type":"Balístico","amount":8}`). É aplicada a maior RD que corresponda ao tipo, incluindo RD universal de condições. Imunidades anulam o dano mesmo com **Ignorar RD** marcado.

A Cura Acelerada pode ser informada em `creature.hp.fastHealing` como inteiro. Também é reconhecida em características/ações com texto como `Cura Acelerada 10`; nesse caso aparece um botão para curar automaticamente essa quantidade, respeitando o PV máximo.
