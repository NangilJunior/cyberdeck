# DK-11 · Cyberdeck VAIO Duo 11 — visualizador 3D

Site estático para mostrar o projeto: modelo 3D para girar, abrir/fechar a tela, vista explodida,
raio-X, ficha de cada peça, lista de materiais, FAQ e chat opcional com o Claude.

## Ver no computador

O navegador bloqueia `fetch` quando a página é aberta direto do arquivo, então sirva a pasta:

```sh
cd web
python3 -m http.server 8765
# abra http://127.0.0.1:8765
```

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `dk11-cyberdeck`).
2. Envie **o conteúdo desta pasta `web/`** para a raiz do repositório:
   ```sh
   cd web
   git init -b main
   git add .
   git commit -m "Visualizador do cyberdeck DK-11"
   git remote add origin git@github.com:SEU_USUARIO/dk11-cyberdeck.git
   git push -u origin main
   ```
3. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `/ (root)`**.
4. Em ~1 minuto o site fica em `https://SEU_USUARIO.github.io/dk11-cyberdeck/` (este: https://nangiljunior.github.io/cyberdeck/).

O arquivo `.nojekyll` evita que o GitHub processe a pasta com Jekyll.

## Atualizar depois de mudar o modelo

Quando o modelo do FreeCAD mudar (medidas, tela escolhida…), regenere os dados e envie de novo:

```sh
cd ..                     # pasta do projeto (CyberdeckVaioDuo11)
freecadcmd exportar_web.py
cd web && git add data && git commit -m "Atualiza modelo" && git push
```

## Chat com o Claude

O FAQ funciona sem nada. O chat "Perguntar ao Claude" usa a **chave da API de quem está perguntando**:
ela fica só no navegador da pessoa (opcionalmente lembrada no `localStorage`) e vai direto para
`api.anthropic.com` — o site não tem servidor e não guarda nada. Modelo: Claude Opus 5.5, esforço baixo
(respostas rápidas), com fallback automático do servidor caso uma pergunta seja recusada.
O conhecimento do projeto (peças, lista de materiais, verificação, FAQ, README) vai no prompt de sistema
com cache, então perguntas seguidas saem mais baratas.

Não coloque uma chave sua no código: em site público ela fica visível para qualquer um.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html`, `style.css`, `app.js` | o site (three.js via CDN, sem build) |
| `data/modelo.bin` | malhas de todas as peças (binário, ~2 MB) |
| `data/modelo.json` | manifesto das peças: material, origem, cor, vetor da vista explodida |
| `data/projeto.json` | specs, lista de materiais, verificação técnica, FAQ e README do projeto |
