# Outro Lado — Painel de Ameaças

Extensão para Owlbear Rodeo voltada ao gerenciamento privado de fichas de Ameaças de Ordem Paranormal pelo Mestre.

## Instalação

Manifesto da pasta:

    https://cdn.jsdelivr.net/gh/Onze1Onze/Sistema-Utilidade@main/outro-lado-painel-ameacas/manifest.json

No Owlbear Rodeo, abra **Extras → Extensions → Add**, cole a URL do manifesto e ative a extensão na sala. A ação **Painel de Ameaças** aparece na barra superior.

## Privacidade

- A interface consulta `OBR.player.getRole()` antes de abrir o armazenamento privado.
- Para uma sessão com papel `PLAYER`, a ação é fechada e a interface exibe somente a mensagem de acesso restrito.
- Fichas, estado atual, condições, recursos e histórico são persistidos no IndexedDB do navegador do Mestre, com fallback para `localStorage`.
- A extensão não grava fichas em metadados da sala, não usa broadcast para as fichas e não envia os dados para serviços externos.
- O armazenamento é local ao navegador/perfil que está atuando como Mestre; não é sincronizado entre dispositivos. Exporte JSON para fazer cópias de segurança ou transferir fichas.

## Fluxo JSON

O botão `+` abre o modelo completo. Preencha o JSON externamente ou diretamente no editor e use **Validar e importar**. A edição funciona pelo mesmo editor: exporte, altere e salve. O formato mantém `creature` (dados-base) separado de `state` (vida atual, condições, recursos e histórico).

O schema é versionado (`schemaVersion: 1`) e mantém propriedades desconhecidas dentro do objeto da criatura, permitindo estender a ficha sem perder campos futuros.

## Sistemas implementados

- Bandeja vertical com busca e cartões das ameaças.
- Criação, importação, edição, duplicação, exclusão e exportação JSON.
- Validação com caminho do campo e mensagem do formato esperado.
- Vida atual/máxima, aplicação de dano e cura com limites.
- Condições criadas pelo Mestre com modificadores numéricos para Defesa, salvaguardas, sentidos, deslocamento, ataques, dano, atributos e quantidade de dados.
- Exibição de valor-base e valor modificado; remover uma condição recalcula os valores derivados.
- Recursos mutáveis, ataques e habilidades interativos.
- Parser e rolador para expressões como `1d20`, `2d20+10`, `4d6`, `2d8+7` e expressões compostas com soma/subtração.
- Feedback animado de rolagem e histórico local de alterações relevantes.
- Interface responsiva com estrutura e linguagem visual inspiradas na ficha de referência anexada, reconstruídas em HTML/CSS.

## Estrutura

- `manifest.json` — manifesto do Owlbear.
- `index.html` / `styles.css` — interface e layout.
- `src/main.js` — integração com o SDK e eventos da interface.
- `src/threat-engine.js` — modelo, validação, condições, modificadores e rolagens.
- `src/dice.js` — execução de ataques e habilidades.
- `src/storage.js` — persistência privada local.
- `tests/threat-engine.test.js` — testes automatizados da lógica.

## Desenvolvimento e testes

O SDK Owlbear é importado estaticamente na versão 3.1.0, seguindo o padrão já usado no repositório. Para executar os testes de lógica com Node.js 20 ou superior:

    node --test outro-lado-painel-ameacas/tests/*.test.js

A extensão é estática e não requer etapa de build. As rolagens e modificadores são genéricos e configuráveis; a extensão não define regras oficiais de condições nem preenche estatísticas de criaturas que não foram fornecidas pelo Mestre.
