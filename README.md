# 🌍 GeoTreino

Jogo de silhuetas de países para treinar geografia (estilo GeoGuessr). Clique em um
país no mapa e acerte a bandeira e o nome corretos. Site 100% estático — roda no
navegador, sem servidor.

## Como jogar

- Clique em um país no mapa para abrir o quiz e escolha a resposta certa.
- Use a **roda do mouse** para dar zoom (útil para os microestados, que têm um marcador circular).
- Você tem **3 vidas**; acertos em sequência valem pontos extras.
- Antes de cada partida você escolhe o **idioma** (Português / English) e a **dificuldade**:
  - **Fácil** — distratores de qualquer lugar do mundo
  - **Médio** — distratores do mesmo continente
  - **Difícil** — distratores entre os países mais próximos (vizinhos)

## Rodar localmente

Como tudo é carregado por `<script src>` (sem `fetch`), basta **abrir o `index.html`**
no navegador. Precisa de internet para as bibliotecas (d3/topojson via CDN) e as
bandeiras (flagcdn).

## Tecnologia

- [D3.js](https://d3js.org/) + [TopoJSON](https://github.com/topojson) para o mapa
- Polígonos: [Natural Earth](https://www.naturalearthdata.com/) 1:50m (via `world-atlas`), Tuvalu do 1:10m
- Bandeiras: [flagcdn.com](https://flagcdn.com/)

## Publicação (GitHub Pages)

O repositório serve direto pelo GitHub Pages (branch `main`, pasta raiz). O arquivo
`.nojekyll` desativa o processamento Jekyll.
