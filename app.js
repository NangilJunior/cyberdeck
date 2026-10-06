// DK-11 · visualizador do cyberdeck (three.js, sem build: roda direto no GitHub Pages)
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { criarTelas } from "./telas.js?v=202610060952";
import { iniciarXR } from "./xr.js?v=202610060952";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const PADRAO = { abertura: 110, explodir: 0, raiox: false, comp: true, paraf: true, arestas: true, telas: true };
const estado = { ...PADRAO, sel: null, ocultos: new Set(), isolado: null };
const CARCACA = new Set(["usinado", "comprado", "acabamento"]);
let modelo, projeto, telas, malhas = [];

// ------------------------------------------------------------------ cena
const canvas = $("#cena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const cena = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
cena.add(new THREE.HemisphereLight(0xdfe6d0, 0x1a1d16, 0.6));
const sol = new THREE.DirectionalLight(0xffffff, 1.6);
sol.position.set(300, 600, 350);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -450, right: 450, top: 450, bottom: -450, near: 10, far: 2000 });
sol.shadow.bias = -0.0004;
cena.add(sol);

const chao = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), new THREE.ShadowMaterial({ opacity: 0.32 }));
chao.rotation.x = -Math.PI / 2;
chao.receiveShadow = true;
cena.add(chao);
const grade = new THREE.GridHelper(1400, 56, 0x2d3426, 0x1c2118);
grade.position.y = 0.05;
cena.add(grade);

const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
camera.position.set(430, 360, 560);
const controles = new OrbitControls(camera, canvas);
controles.enableDamping = true;
controles.target.set(0, 60, 0);
controles.maxDistance = 3000;
controles.minDistance = 80;

// FreeCAD é Z para cima; three.js é Y para cima
const mundo = new THREE.Group();          // escala/posição do conjunto (1 = mm no desktop; 0,001 = metros no AR/VR)
cena.add(mundo);
const raiz = new THREE.Group();
raiz.rotation.x = -Math.PI / 2;
mundo.add(raiz);
const base = new THREE.Group();
const pivoTampa = new THREE.Group();
const tampa = new THREE.Group();
raiz.add(base, pivoTampa);
pivoTampa.add(tampa);

function redimensionar() {
  const palco = $("#palco");
  const w = palco.clientWidth, h = palco.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(redimensionar).observe($("#palco"));

// ------------------------------------------------------------------ carregamento
async function baixarBinario(url, aoProgredir) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
  const total = Number(resp.headers.get("content-length")) || 0;
  if (!resp.body || !total) return resp.arrayBuffer();
  const leitor = resp.body.getReader();
  const pedacos = [];
  let lido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value);
    lido += value.length;
    aoProgredir(Math.min(1, lido / total));
  }
  const tudo = new Uint8Array(lido);
  let pos = 0;
  for (const p of pedacos) { tudo.set(p, pos); pos += p.length; }
  return tudo.buffer;
}

async function carregar() {
  const [m, pj, buf] = await Promise.all([
    fetch("data/modelo.json?v=202610060952").then((r) => r.json()),
    fetch("data/projeto.json?v=202610060952").then((r) => r.json()),
    baixarBinario("data/modelo.bin?v=202610060952", (f) => ($("#progresso").style.width = `${f * 100}%`)),
  ]);
  modelo = m;
  projeto = pj;
  const [W, D] = modelo.caixa;
  raiz.position.set(-W / 2, 0, D / 2);
  pivoTampa.position.set(0, modelo.eixo.y, modelo.eixo.z);
  tampa.position.set(0, -modelo.eixo.y, -modelo.eixo.z);

  const matLinha = new THREE.LineBasicMaterial({ color: 0x050605, transparent: true, opacity: 0.55 });
  for (const p of modelo.pecas) {
    const pos = new Float32Array(buf, p.v[0], p.v[1] * 3);
    const idx = new Uint32Array(buf, p.i[0], p.i[1]);
    let g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const arestas = p.tipo === "acabamento" ? null : new THREE.EdgesGeometry(g, 28);
    g = toCreasedNormals(g, THREE.MathUtils.degToRad(32));
    const [metal, rugos] = modelo.acabamentos[p.acab];
    const mat = new THREE.MeshStandardMaterial({
      color: p.cor, metalness: metal, roughness: rugos,
      transparent: p.transp > 0, opacity: 1 - p.transp,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    const malha = new THREE.Mesh(g, mat);
    malha.castShadow = malha.receiveShadow = p.tipo !== "acabamento";
    malha.userData = { p, explodir: new THREE.Vector3(...p.explodir), opacidade: mat.opacity, transp: mat.transparent };
    if (arestas) {
      const linhas = new THREE.LineSegments(arestas, matLinha);
      linhas.raycast = () => {};
      malha.add(linhas);
      malha.userData.linhas = linhas;
    }
    (p.grupo === "tampa" ? tampa : base).add(malha);
    malhas.push(malha);
  }
  telas = criarTelas(modelo, malhas);
  corAtual = corSalva();
  montarPaleta();
  $("#carregando").hidden = true;
  const ok = projeto.verificacao.ok;
  $("#status").textContent = `${modelo.pecas.length} peças · verificação ${ok ? "OK" : "com pendências"}`;
  $("#status").classList.toggle("ok", ok);
  montarListaPecas();
  montarMateriais();
  montarFaq();
  montarProjeto();
  aplicarCor(corAtual, false);
  aplicarTudo();
  irPara("iso", false);
}

// ------------------------------------------------------------------ estado -> cena
function aplicarAbertura() {
  pivoTampa.rotation.x = -THREE.MathUtils.degToRad(estado.abertura);
  $("#valAbertura").textContent = `${Math.round(estado.abertura)}°`;
  $("#abertura").value = estado.abertura;
}

function aplicarExplodir() {
  const t = estado.explodir / 100;
  for (const m of malhas) m.position.copy(m.userData.explodir).multiplyScalar(t);
  $("#valExplodir").textContent = `${Math.round(estado.explodir)}%`;
  $("#explodir").value = estado.explodir;
}

function visivel(p) {
  if (estado.isolado) return p.nome === estado.isolado;
  if (estado.ocultos.has(p.nome)) return false;
  if (p.tipo === "referencia" && !estado.comp) return false;
  if (p.tipo === "fixador" && !estado.paraf) return false;
  return true;
}

function aplicarVisibilidade() {
  for (const m of malhas) {
    const p = m.userData.p;
    m.visible = visivel(p);
    const mat = m.material;
    const fantasma = estado.raiox && CARCACA.has(p.tipo) && !estado.isolado;
    mat.transparent = fantasma || m.userData.transp;
    mat.opacity = fantasma ? 0.1 : m.userData.opacidade;
    mat.depthWrite = !fantasma;
    m.castShadow = !fantasma && p.tipo !== "acabamento";
    if (m.userData.linhas) m.userData.linhas.visible = estado.arestas && !fantasma;
    mat.needsUpdate = true;
  }
  if (telas) telas.ligadas = estado.telas;
  for (const [id, chave] of [["#tRaiox", "raiox"], ["#tComp", "comp"], ["#tParaf", "paraf"], ["#tArestas", "arestas"],
    ["#tTelas", "telas"]]) {
    $(id).setAttribute("aria-pressed", String(estado[chave]));
  }
  $$(".item[data-nome]").forEach((el) => el.classList.toggle("oculto", estado.ocultos.has(el.dataset.nome)));
  $("#isolar").textContent = estado.isolado ? "Mostrar tudo" : "Isolar";
}

function aplicarTudo() { aplicarAbertura(); aplicarExplodir(); aplicarVisibilidade(); }

// ------------------------------------------------------------------ animações
const tweens = new Map();
function animar(chave, de, para, ms, aoAtualizar, aoTerminar) {
  const t0 = performance.now();
  tweens.set(chave, (agora) => {
    const k = Math.min(1, (agora - t0) / ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    aoAtualizar(de + (para - de) * e, e);
    if (k >= 1) { tweens.delete(chave); aoTerminar?.(); }
  });
}

function animarValor(campo, alvo, ms = 1200) {
  const de = estado[campo];
  animar(campo, de, alvo, ms, (v) => {
    estado[campo] = v;
    campo === "abertura" ? aplicarAbertura() : aplicarExplodir();
  });
}

// ------------------------------------------------------------------ vistas de câmera
const VISTAS = {
  iso: [0.72, 0.58, 1], frente: [0, 0.12, 1], topo: [0, 1, 0.0001], lado: [1, 0.12, 0], tras: [-0.35, 0.4, -1],
};
let vistaAtual = "iso";
function irPara(nome, suave = true) {
  vistaAtual = nome;
  $$(".vistas button[data-vista]").forEach((b) => b.classList.toggle("ativo", b.dataset.vista === nome));
  const caixa = new THREE.Box3();
  malhas.filter((m) => m.visible).forEach((m) => caixa.expandByObject(m));
  const esfera = caixa.getBoundingSphere(new THREE.Sphere());
  const dist = esfera.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  const dir = new THREE.Vector3(...VISTAS[nome]).normalize();
  const alvo = esfera.center.clone();
  const destino = alvo.clone().addScaledVector(dir, dist);
  if (!suave) { camera.position.copy(destino); controles.target.copy(alvo); return; }
  const p0 = camera.position.clone(), t0 = controles.target.clone();
  animar("camera", 0, 1, 900, (_, e) => {
    camera.position.lerpVectors(p0, destino, e);
    controles.target.lerpVectors(t0, alvo, e);
  });
}

// ------------------------------------------------------------------ seleção
const raio = new THREE.Raycaster();
const ponteiro = new THREE.Vector2();
let apertou = null;
canvas.addEventListener("pointerdown", (e) => (apertou = [e.clientX, e.clientY]));
canvas.addEventListener("pointerup", (e) => {
  if (!apertou || Math.hypot(e.clientX - apertou[0], e.clientY - apertou[1]) > 5) return;
  const r = canvas.getBoundingClientRect();
  ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  cena.updateMatrixWorld();                // aba em segundo plano pausa o laço: matrizes podem estar velhas
  camera.updateMatrixWorld();
  raio.setFromCamera(ponteiro, camera);
  let alvos = malhas.filter((m) => m.visible);
  if (telas?.clicar(raio, alvos)) return;      // botão da barra de controle
  if (estado.raiox) {
    const internos = alvos.filter((m) => !CARCACA.has(m.userData.p.tipo));
    const acerto = raio.intersectObjects(internos, false)[0];
    if (acerto) return selecionar(acerto.object.userData.p.nome);
  }
  const acerto = raio.intersectObjects(alvos, false).find((a) => a.object.userData.p.tipo !== "acabamento")
    ?? raio.intersectObjects(alvos, false)[0];
  selecionar(acerto ? acerto.object.userData.p.nome : null);
});

const COR_SEL = new THREE.Color(0xffb21f);
function selecionar(nome) {
  for (const m of malhas) m.material.emissive?.setRGB(0, 0, 0);
  estado.sel = nome;
  $$(".item[data-nome]").forEach((el) => el.classList.toggle("sel", el.dataset.nome === nome));
  if (!nome) { $("#ficha").hidden = true; return; }
  const m = malhas.find((x) => x.userData.p.nome === nome);
  m.material.emissive.copy(COR_SEL).multiplyScalar(0.35);
  mostrarFicha(m.userData.p);
  document.querySelector(`.item[data-nome="${CSS.escape(nome)}"]`)?.scrollIntoView({ block: "nearest" });
}

function mostrarFicha(p) {
  $("#ficha").hidden = false;
  $("#fichaCat").textContent = `${p.categoria} · ${p.grupo === "tampa" ? "tampa" : "base"}`;
  $("#fichaNome").textContent = p.rotulo;
  const linhas = [];
  if (p.tipo === "fixador") {
    linhas.push(["Norma", p.obs], ["Material", p.material]);
  } else if (p.tipo === "referencia") {
    linhas.push(["Item", p.material]);
    if (p.origem) linhas.push(["Origem", p.origem]);
  } else {
    linhas.push(["Material", comCor(p.material)]);
    if (p.obs) linhas.push(["Função", p.obs]);
  }
  linhas.push(["Medidas", `${p.medidas.join(" × ")} mm`]);
  if (p.massa_g > 0) linhas.push(["Massa", p.massa_g >= 1000 ? `${(p.massa_g / 1000).toFixed(2)} kg` : `${p.massa_g} g`]);
  $("#fichaDados").innerHTML = linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}

// ------------------------------------------------------------------ painel: peças
const ORDEM = ["Peça usinada", "Comprada", "Componente", "Parafuso", "Gravação"];
function montarListaPecas(filtro = "") {
  const q = normalizar(filtro);
  const grupos = new Map(ORDEM.map((c) => [c, []]));
  for (const p of modelo.pecas) {
    const texto = normalizar(`${p.rotulo} ${p.material} ${p.obs} ${p.categoria}`);
    if (q && !q.split(/\s+/).every((t) => texto.includes(t))) continue;
    grupos.get(p.categoria)?.push(p);
  }
  let html = "";
  for (const [cat, lista] of grupos) {
    if (!lista.length) continue;
    const corpo = lista.map((p) => `
      <div class="item${estado.sel === p.nome ? " sel" : ""}${estado.ocultos.has(p.nome) ? " oculto" : ""}" data-nome="${esc(p.nome)}">
        <span class="cor" style="background:${p.cor}"></span>
        <span class="nome" title="${esc(p.rotulo)}">${esc(p.rotulo)}</span>
        <button class="olho" data-olho="${esc(p.nome)}" title="Mostrar/esconder">◉</button>
      </div>`).join("");
    const longo = (cat === "Parafuso" || cat === "Gravação") && !q;
    html += longo
      ? `<details><summary class="grupo-titulo"><span>${cat}s</span><span>${lista.length}</span></summary>${corpo}</details>`
      : `<div class="grupo-titulo"><span>${cat === "Comprada" ? "Compradas" : cat + "s"}</span><span>${lista.length}</span></div>${corpo}`;
  }
  $("#listaPecas").innerHTML = html || `<p class="nota">Nada encontrado.</p>`;
}

$("#listaPecas").addEventListener("click", (e) => {
  const olho = e.target.closest("[data-olho]");
  if (olho) {
    const n = olho.dataset.olho;
    estado.ocultos.has(n) ? estado.ocultos.delete(n) : estado.ocultos.add(n);
    aplicarVisibilidade();
    return;
  }
  const item = e.target.closest(".item");
  if (item) selecionar(item.dataset.nome);
});
$("#buscaPecas").addEventListener("input", (e) => montarListaPecas(e.target.value));

// ------------------------------------------------------------------ cor da carcaça (acabamento Cerakote)
// Tons aproximados das cores reais da Cerakote série H, só para a visualização — confirme na carta física.
const CORES = [
  { cod: "H-236", nome: "O.D. Green", hex: "#545c42" },
  { cod: "H-267", nome: "MagPul Flat Dark Earth", hex: "#8a7557" },
  { cod: "H-234", nome: "Sniper Grey", hex: "#6c7073" },
  { cod: "H-237", nome: "Tungsten", hex: "#55585a" },
  { cod: "H-146", nome: "Graphite Black", hex: "#2a2d2e" },
  { cod: "H-148", nome: "Burnt Bronze", hex: "#5e4433" },
  { cod: "H-171", nome: "NRA Blue", hex: "#23476e" },
  { cod: "H-221", nome: "Crimson", hex: "#7d2b33" },
  { cod: "H-122", nome: "Gold", hex: "#977c35" },
  { cod: "H-168", nome: "Zombie Green", hex: "#76913a" },
  { cod: "H-151", nome: "Satin Aluminum", hex: "#a6a8aa", metal: 0.55, rugos: 0.45 },
  { cod: "H-297", nome: "Stormtrooper White", hex: "#e4e4df" },
  { cod: "—", nome: "Sem pintura (anodizado natural)", hex: "#b9bcbe", metal: 0.78, rugos: 0.3 },
];
let corAtual = 0;

function corSalva() {
  try {
    const i = CORES.findIndex((c) => c.cod === localStorage.getItem("dk11-cor"));
    return i < 0 ? 0 : i;
  } catch { return 0; }
}

function eVerde(p) { return p.acab === "verde"; }

function nomeCor(i) { const c = CORES[i]; return c.cod === "—" ? c.nome : `Cerakote ${c.cod} ${c.nome}`; }

/** Troca o nome do acabamento nos textos do projeto pela cor escolhida. */
function comCor(txt) {
  if (!txt || corAtual === 0) return txt;
  const c = CORES[corAtual];
  const fosco = /\(fosco\)/.test(txt) ? " (fosco)" : "";
  const novo = c.cod === "—" ? "anodização natural, sem pintura" : `Cerakote ${c.cod} ${c.nome}${fosco}`;
  return txt.replace(/Cerakote[^,;+]*/g, (m) => novo + (m.endsWith(" ") ? " " : ""));
}

function aplicarCor(i, guardar = true) {
  corAtual = i;
  const c = CORES[i];
  for (const m of malhas) {
    if (!eVerde(m.userData.p)) continue;
    m.material.color.set(c.hex);
    m.material.metalness = c.metal ?? modelo.acabamentos.verde[0];
    m.material.roughness = c.rugos ?? modelo.acabamentos.verde[1];
    m.material.needsUpdate = true;
    m.userData.p.cor = c.hex;
  }
  $$("#paletaCores button").forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
  $("#corNome").textContent = nomeCor(i);
  $$(".item[data-nome]").forEach((el) => {
    const p = modelo.pecas.find((x) => x.nome === el.dataset.nome);
    if (p && eVerde(p)) el.querySelector(".cor").style.background = c.hex;
  });
  if (estado.sel) {
    const p = modelo.pecas.find((x) => x.nome === estado.sel);
    if (p && eVerde(p)) mostrarFicha(p);
  }
  montarMateriais();
  montarProjeto();
  if (guardar) { try { localStorage.setItem("dk11-cor", c.cod); } catch { /* sem storage */ } }
}

function montarPaleta() {
  $("#paletaCores").innerHTML = CORES.map((c, i) => `
    <button data-cor="${i}" aria-pressed="${i === corAtual}" title="${esc(nomeCor(i))}"
      style="background:${c.hex}"><span class="sr">${esc(nomeCor(i))}</span></button>`).join("");
  $("#paletaCores").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cor]");
    if (b) aplicarCor(+b.dataset.cor);
  });
}

// ------------------------------------------------------------------ painel: materiais
function montarMateriais() {
  const ordem = ["Usinar", "Comprar", "Reaproveitar do Duo 11", "Parafusos"];
  const grupos = new Map(ordem.map((c) => [c, []]));
  for (const l of projeto.lista_materiais) (grupos.get(l.categoria) ?? grupos.set(l.categoria, []).get(l.categoria)).push(l);
  $("#tabelaMateriais").innerHTML = [...grupos].filter(([, l]) => l.length).map(([cat, l]) => `
    <div class="tabela-grupo"><h4>${esc(cat)}</h4><table>${l.map((x) => `
      <tr><td>${esc(comCor(x.item))}${x.material ? `<small>${esc(comCor(x.material))}</small>` : ""}</td><td class="qtd">${x.qtd}×</td></tr>`).join("")}
    </table></div>`).join("");
}

// ------------------------------------------------------------------ painel: dúvidas (FAQ offline)
function montarFaq(consulta = "") {
  const termos = normalizar(consulta).split(/\s+/).filter((t) => t.length > 2);
  let itens = projeto.faq.map((f) => {
    const texto = normalizar(`${f.p} ${f.p} ${f.r}`);
    return { ...f, nota: termos.reduce((s, t) => s + (texto.includes(t) ? 1 : 0), 0) };
  });
  if (termos.length) itens = itens.filter((f) => f.nota > 0).sort((a, b) => b.nota - a.nota);
  const pecas = termos.length ? modelo.pecas.filter((p) => p.tipo !== "acabamento" && p.tipo !== "fixador")
    .map((p) => ({ p, nota: termos.reduce((s, t) => s + (normalizar(`${p.rotulo} ${p.material} ${p.obs}`).includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.nota > 0).sort((a, b) => b.nota - a.nota).slice(0, 6) : [];
  let html = itens.map((f, i) => `<details${termos.length && i === 0 ? " open" : ""}><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join("");
  if (!itens.length) html = `<p class="vazio">Não achei no FAQ. Pergunte ao Claude aqui embaixo.</p>`;
  if (pecas.length) html += `<p class="pecas-rel">Peças relacionadas: ${pecas.map((x) => `<button data-ver="${esc(x.p.nome)}">${esc(x.p.rotulo)}</button>`).join(" ")}</p>`;
  $("#listaFaq").innerHTML = html;
}
$("#buscaFaq").addEventListener("input", (e) => montarFaq(e.target.value));
$("#listaFaq").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ver]");
  if (b) selecionar(b.dataset.ver);
});

// ------------------------------------------------------------------ painel: projeto
function montarProjeto() {
  const v = projeto.verificacao;
  const relatorio = v.relatorio.filter((l) => !/^=+$/.test(l)).join("\n");
  $("#resumoProjeto").innerHTML = `
    <p class="nota">${esc(projeto.resumo)}</p>
    <dl class="specs">${projeto.specs.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(comCor(val))}</dd>`).join("")}</dl>
    <div class="verif${v.ok ? " ok" : ""}"><h4>${v.ok ? "✓ Verificação técnica OK" : "Verificação com pendências"}</h4><pre>${esc(relatorio)}</pre></div>
    <div class="doc">${markdown(projeto.readme)}</div>`;
}

// ------------------------------------------------------------------ chat com o Claude (chave do próprio visitante)
const MODELO = "claude-opus-5-5";
const historico = [];
let SDK = null;
let sistema = null;

function chaveSalva() {
  try { return localStorage.getItem("dk11-chave") || sessionStorage.getItem("dk11-chave") || ""; } catch { return ""; }
}
function guardarChave(chave, lembrar) {
  try {
    localStorage.removeItem("dk11-chave");
    sessionStorage.removeItem("dk11-chave");
    if (chave) (lembrar ? localStorage : sessionStorage).setItem("dk11-chave", chave);
  } catch { /* navegador sem storage: a chave vale só nesta página */ }
  chaveMemoria = chave;
}
let chaveMemoria = chaveSalva();

function promptSistema() {
  if (sistema) return sistema;
  const pecas = modelo.pecas.filter((p) => p.tipo !== "acabamento").map((p) =>
    `- ${p.rotulo} [${p.categoria}, ${p.grupo}] ${p.material}${p.obs ? " — " + p.obs : ""}; ${p.medidas.join("×")} mm${p.massa_g ? "; " + p.massa_g + " g" : ""}`);
  sistema = [
    "Você é o assistente do site do projeto DK-11, um cyberdeck em alumínio usinado feito com a placa-mãe de um Sony VAIO Duo 11.",
    "Quem pergunta são amigos do autor vendo o modelo 3D. Responda em português do Brasil, direto e curto (até ~150 palavras, salvo se pedirem detalhe).",
    "Baseie-se só nos dados abaixo. Se algo é provisório (a medir, a definir), diga isso; não invente preços, medidas nem peças.",
    "Se a pergunta citar uma peça, explique para que ela serve e por que foi escolhida.",
    "", "<projeto>", JSON.stringify({ titulo: projeto.titulo, resumo: projeto.resumo, specs: projeto.specs,
      lista_materiais: projeto.lista_materiais, verificacao: projeto.verificacao.relatorio, faq: projeto.faq }), "</projeto>",
    "", "<pecas>", ...pecas, "</pecas>", "", "<readme>", projeto.readme, "</readme>",
  ].join("\n");
  return sistema;
}

function balao(classe, html) {
  const d = document.createElement("div");
  d.className = `msg ${classe}`;
  d.innerHTML = html;
  $("#chatMsgs").append(d);
  d.scrollIntoView({ block: "nearest" });
  return d;
}

$("#configChat").addEventListener("click", () => {
  $("#chatConfig").hidden = !$("#chatConfig").hidden;
  $("#chaveApi").value = chaveMemoria;
  try { $("#lembrarChave").checked = !!localStorage.getItem("dk11-chave"); } catch { /* sem storage */ }
});
$("#salvarChave").addEventListener("click", () => {
  guardarChave($("#chaveApi").value.trim(), $("#lembrarChave").checked);
  $("#chatConfig").hidden = true;
});
$("#chatTexto").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chatForm").requestSubmit(); }
});

$("#chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = $("#chatTexto").value.trim();
  if (!texto) return;
  if (!chaveMemoria) { $("#chatConfig").hidden = false; $("#chaveApi").focus(); return; }
  $("#chatTexto").value = "";
  balao("eu", esc(texto));
  const sel = estado.sel ? modelo.pecas.find((p) => p.nome === estado.sel) : null;
  historico.push({ role: "user", content: sel ? `(Peça selecionada no visualizador: ${sel.rotulo})\n${texto}` : texto });
  const resp = balao("ia pensando", "pensando…");
  $("#chatEnviar").disabled = true;
  try {
    SDK ??= (await import("https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm")).default;
    const cliente = new SDK({ apiKey: chaveMemoria, dangerouslyAllowBrowser: true });
    const stream = cliente.beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      system: [{ type: "text", text: promptSistema(), cache_control: { type: "ephemeral" } }],
      messages: historico,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    let acumulado = "";
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        acumulado += ev.delta.text;
        resp.className = "msg ia";
        resp.innerHTML = markdown(acumulado);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      historico.pop();
      resp.className = "msg ia erro";
      resp.textContent = "O modelo recusou essa pergunta. Tente reformular.";
      return;
    }
    historico.push({ role: "assistant", content: final.content });
    if (!acumulado) resp.innerHTML = markdown(final.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"));
  } catch (err) {
    historico.pop();
    resp.className = "msg ia erro";
    if (SDK && err instanceof SDK.AuthenticationError) resp.textContent = "Chave da API inválida. Confira em “chave da API”.";
    else if (SDK && err instanceof SDK.RateLimitError) resp.textContent = "Limite de uso da API atingido. Espere um pouco e tente de novo.";
    else if (SDK && err instanceof SDK.APIError) resp.textContent = `Erro da API (${err.status ?? "rede"}): ${err.message}`;
    else resp.textContent = `Não consegui falar com a API: ${err.message}`;
  } finally {
    $("#chatEnviar").disabled = false;
  }
});

// ------------------------------------------------------------------ utilidades
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function normalizar(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
}
function markdown(md) {
  const linhas = String(md).split("\n");
  let html = "", lista = false, tabela = false;
  const fechar = () => {
    if (lista) { html += "</ul>"; lista = false; }
    if (tabela) { html += "</table>"; tabela = false; }
  };
  for (const l of linhas) {
    const t = l.trim();
    if (/^\|/.test(t)) {
      if (/^\|[\s:|-]+\|$/.test(t)) continue;
      if (!tabela) { fechar(); html += "<table>"; tabela = true; }
      html += `<tr>${t.slice(1, -1).split("|").map((c) => `<td>${inline(c.trim())}</td>`).join("")}</tr>`;
    } else if (/^#{1,3}\s/.test(t)) {
      fechar();
      const n = Math.min(3, t.match(/^#+/)[0].length + 1);
      html += `<h${n}>${inline(t.replace(/^#+\s*/, ""))}</h${n}>`;
    } else if (/^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
      if (tabela) fechar();
      if (!lista) { html += "<ul>"; lista = true; }
      html += `<li>${inline(t.replace(/^([-*]|\d+\.)\s+/, ""))}</li>`;
    } else if (lista && /^\s{2,}\S/.test(l)) {
      html = html.replace(/<\/li>$/, ` ${inline(t)}</li>`);
    } else if (!t) {
      fechar();
    } else {
      fechar();
      html += `<p>${inline(t)}</p>`;
    }
  }
  fechar();
  return html;
}

// ------------------------------------------------------------------ controles da interface
$("#abertura").addEventListener("input", (e) => { tweens.delete("abertura"); estado.abertura = +e.target.value; aplicarAbertura(); });
$("#explodir").addEventListener("input", (e) => { tweens.delete("explodir"); estado.explodir = +e.target.value; aplicarExplodir(); });
for (const [id, chave] of [["#tRaiox", "raiox"], ["#tComp", "comp"], ["#tParaf", "paraf"], ["#tArestas", "arestas"],
  ["#tTelas", "telas"]]) {
  $(id).addEventListener("click", () => { estado[chave] = !estado[chave]; aplicarVisibilidade(); });
}
$("#animar").addEventListener("click", () => animarValor("abertura", estado.abertura > 5 ? 0 : PADRAO.abertura, 1600));
$("#animarExplodir").addEventListener("click", () => {
  animarValor("explodir", estado.explodir > 50 ? 0 : 100, 1400);
  setTimeout(() => irPara(vistaAtual), 1450);   // reenquadra: explodida ocupa bem mais espaço
});
$("#resetar").addEventListener("click", () => {
  Object.assign(estado, PADRAO, { isolado: null });
  estado.ocultos.clear();
  selecionar(null);
  aplicarTudo();
  irPara("iso");
});
$$(".vistas button[data-vista]").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.vista)));
$("#fecharFicha").addEventListener("click", () => selecionar(null));
$("#isolar").addEventListener("click", () => {
  estado.isolado = estado.isolado ? null : estado.sel;
  aplicarVisibilidade();
  irPara("iso");
});
$("#esconder").addEventListener("click", () => {
  if (!estado.sel) return;
  estado.ocultos.add(estado.sel);
  if (estado.isolado === estado.sel) estado.isolado = null;
  selecionar(null);
  aplicarVisibilidade();
});
$("#perguntarPeca").addEventListener("click", () => {
  const p = modelo.pecas.find((x) => x.nome === estado.sel);
  abrirAba("duvidas");
  $("#chatTexto").value = `Para que serve “${p.rotulo}” e por que foi escolhida assim?`;
  $("#chatTexto").focus();
});

function abrirAba(nome) {
  $$(".abas button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === nome));
  $$(".aba").forEach((s) => (s.hidden = s.id !== `aba-${nome}`));
  $("#painel").classList.add("aberto");
}
$$(".abas button").forEach((b) => b.addEventListener("click", () => abrirAba(b.dataset.aba)));
$("#abrirPainel").addEventListener("click", () => $("#painel").classList.toggle("aberto"));

// ------------------------------------------------------------------ realidade aumentada / virtual
const SOMBRA_DESKTOP = { left: -450, right: 450, top: 450, bottom: -450, near: 10, far: 2000 };
const xr = iniciarXR({
  renderer, cena, camera, mundo, malhas,
  telas: () => telas,
  alternarTampa: () => animarValor("abertura", estado.abertura > 5 ? 0 : PADRAO.abertura, 1600),
  aoEntrar(modo) {
    chao.visible = grade.visible = false;
    if (modo === "immersive-vr") cena.background = new THREE.Color(0x0d100b);
    controles.enabled = false;
    selecionar(null);
    // no XR a unidade é metro: o plano de corte de 1 (mm no desktop) cortaria tudo a menos de 1 m dos olhos
    camera.near = 0.02;
    camera.far = 50;
    camera.updateProjectionMatrix();
    Object.assign(sol.shadow.camera, { left: -0.4, right: 0.4, top: 0.4, bottom: -0.4, near: 0.01, far: 3 });
    sol.shadow.camera.updateProjectionMatrix();
    sol.shadow.bias = -0.0002;
  },
  aoSair() {
    chao.visible = grade.visible = true;
    cena.background = null;
    controles.enabled = true;
    camera.near = 1;
    camera.far = 20000;
    camera.updateProjectionMatrix();
    Object.assign(sol.shadow.camera, SOMBRA_DESKTOP);
    sol.shadow.camera.updateProjectionMatrix();
    sol.shadow.bias = -0.0004;
    sol.position.set(300, 600, 350);
    sol.target.position.set(0, 0, 0);
    irPara(vistaAtual, false);
  },
});
cena.add(sol.target);
const solXR = new THREE.Vector3(0.3, 0.6, 0.35);

async function prepararBotoesXR() {
  const modos = await xr.suportes();
  for (const [id, modo] of [["#botaoAR", "immersive-ar"], ["#botaoVR", "immersive-vr"]]) {
    const b = $(id);
    const ok = modos.includes(modo);
    b.hidden = !ok && !(modo === "immersive-ar" && !modos.length);   // sem WebXR: mostra só o AR (explica ao clicar)
    b.addEventListener("click", async () => {
      if (!ok) {
        $("#dica").textContent = "Realidade aumentada: abra esta página no navegador do Meta Quest (ou no Chrome do Android com ARCore).";
        $("#dica").classList.add("destaque");
        return;
      }
      if (renderer.xr.isPresenting) return xr.sair();
      try { await xr.entrar(modo); } catch (err) {
        console.error(err);
        $("#dica").textContent = `Não consegui iniciar o ${modo === "immersive-ar" ? "AR" : "VR"} (${err.message}).`;
      }
    });
  }
}
prepararBotoesXR();

// ------------------------------------------------------------------ laço
renderer.setAnimationLoop((agora, frame) => {
  for (const f of [...tweens.values()]) f(agora);
  if (renderer.xr.isPresenting) {
    xr.quadro(frame);
    sol.position.copy(mundo.position).add(solXR);
    sol.target.position.copy(mundo.position);
  } else {
    controles.update();
  }
  telas?.atualizar(agora);
  renderer.render(cena, camera);
});

redimensionar();
carregar().catch((err) => {
  console.error(err);
  $("#carregando").innerHTML = `<span>Não consegui carregar o modelo (${esc(err.message)}).<br>
    Abra por um servidor (ex.: <code>python3 -m http.server</code>) — direto do arquivo o navegador bloqueia.</span>`;
});
