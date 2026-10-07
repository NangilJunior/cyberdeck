# Cyberdecks DK-11 e DK-16 — visualizador 3D

Site estático para mostrar os projetos: modelo 3D para girar, abrir/fechar a tela, vista explodida,
raio-X, ficha de cada peça, lista de materiais, FAQ e chat opcional com o Claude.

Dois projetos, um seletor no topo da página:

| Projeto | Endereço | Dados | Origem |
|---|---|---|---|
| **DK-11** · placa do VAIO Duo 11 (o padrão) | `/` | `data/` | `CyberdeckVaioDuo11/exportar_web.py` |
| **DK-16** · dock para ROG Ally | `/?p=dk16` | `data/dk16/` | `CyberdeckAllyDock/exportar_web.py` |

O DK-16 tem uma peça articulada a mais, o **berço** do Ally (grupo `berco` no `modelo.json`, com
eixo e ângulos próprios em `modelo.berco`). O slider "Inclinação do berço" só aparece quando o
modelo tem berço, e com o berço deitado o Ally some (premissa do projeto: para fechar, ele sai).

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

Quando um modelo do FreeCAD mudar (medidas, tela escolhida…), regenere os dados daquele projeto e
envie de novo. Cada exportador só escreve na pasta de dados do seu projeto:

```sh
cd ..                     # DK-11: pasta CyberdeckVaioDuo11  →  escreve web/data/
freecadcmd exportar_web.py
# DK-16: cd ../CyberdeckAllyDock && freecadcmd exportar_web.py  →  escreve web/data/dk16/
cd web
python3 versionar.py      # carimba ?v=<data-hora> nas URLs (ver "Cache" abaixo)
git add -A && git commit -m "Atualiza modelo" && git push
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
| `data/dk16/…` | os mesmos três arquivos, do DK-16 |

## Realidade aumentada (WebXR)

Abra o site no **navegador do Meta Quest** (ou no Chrome do Android com ARCore) e toque em **AR**
(ou **VR**) no canto de cima. O cyberdeck aparece **em tamanho real** sobre a primeira superfície
detectada (mesa), virado para você.

- gatilho / pinça na **barra de 8,8"** → aperta os botões (tema, bloquear, brilho…)
- gatilho / pinça no **cyberdeck** → abre / fecha a tampa
- gatilho / pinça **fora dele** → muda de lugar (para onde está a mira)
- **grip** (botão lateral) segurando → pega na mão e solta onde quiser

Precisa de HTTPS (o GitHub Pages já é). Código em `xr.js`.

## Cor da carcaça

Nos controles tem a paleta **Cor da carcaça**: troca o acabamento das peças pintadas (deck e casco da
tampa) entre 12 tons da Cerakote série H e a opção sem pintura (anodizado natural, que também muda o
brilho do material). A escolha fica guardada no navegador e aparece também nos textos de material da
ficha da peça, da aba Materiais e da aba Projeto. Os tons são aproximações para a visualização —
confirme na carta de cores física antes de fechar o acabamento.

## Cache do GitHub Pages

O Pages serve tudo com `Cache-Control: max-age=600` e **cada arquivo expira num horário diferente**:
dá para o navegador pegar o `index.html` novo junto com o `app.js` velho, e a página abre pela metade
(foi o que aconteceu quando a paleta de cores subiu: a caixa aparecia vazia).

`python3 versionar.py` resolve isso carimbando `?v=<data-hora>` nas referências de `style.css`,
`app.js`, `telas.js`, `xr.js` e dos arquivos de dados (as do `app.js` são montadas como
`` `${DADOS}modelo.json?v=…` `` e têm regra própria). Como o HTML novo passa a apontar para URLs
novas, o navegador é obrigado a baixar tudo junto. **Rodar sempre antes do commit do site.**
