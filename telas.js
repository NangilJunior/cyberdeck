// DK-11 · telas "ligadas": interface DK//OS na tela principal, painel de controle tátil na barra de 8,8"
// e legendas retroiluminadas no teclado. Tudo desenhado em <canvas> e aplicado como textura.
import * as THREE from "three";

const MONO = "'IBM Plex Mono', monospace";
const COND = "'Barlow Semi Condensed', sans-serif";
const TEMAS = {
  ciano: { pri: "#47f5d4", pri2: "#1b8f7c", fundo: "#03090a", acento: "#ffb21f", alerta: "#ff4d5e" },
  ambar: { pri: "#ffb21f", pri2: "#8a5a0c", fundo: "#0a0703", acento: "#47f5d4", alerta: "#ff4d5e" },
};

// estado compartilhado entre as telas (os botões da barra mexem na tela principal)
const sis = {
  tema: "ciano", brilho: 0.9, volume: 0.6, mudo: false, wifi: true, bt: true, noturno: false,
  vent: false, gravando: false, terminal: true, bloqueado: false, perf: false,
  log: [], toque: { i: -1, t: 0 }, aviso: { txt: "", t: 0 },
};
const BOTOES = [
  { id: "wifi", rot: "WI-FI", tipo: "liga" }, { id: "bt", rot: "BLUETOOTH", tipo: "liga" },
  { id: "mudo", rot: "MUDO", tipo: "liga" }, { id: "volm", rot: "VOL −", tipo: "acao" },
  { id: "volp", rot: "VOL +", tipo: "acao" }, { id: "brilho", rot: "BRILHO", tipo: "acao" },
  { id: "tema", rot: "TEMA", tipo: "acao" }, { id: "noturno", rot: "NOTURNO", tipo: "liga" },
  { id: "vent", rot: "VENT. MÁX", tipo: "liga" }, { id: "gravando", rot: "GRAVAR", tipo: "liga" },
  { id: "terminal", rot: "TERMINAL", tipo: "liga" }, { id: "bloqueado", rot: "BLOQUEAR", tipo: "liga" },
];
const tema = () => TEMAS[sis.tema];
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const pad = (n, k = 2) => String(n).padStart(k, "0");
const ruido = (t, s) => Math.sin(t * 1.3 + s) * 0.5 + Math.sin(t * 0.37 + s * 2.1) * 0.3 + Math.sin(t * 3.1 + s * 0.7) * 0.2;

function registrar(txt) {
  const d = new Date();
  sis.log.push(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}  ${txt}`);
  if (sis.log.length > 40) sis.log.shift();
}
const BOOT = [
  "DK//OS 11.4 kernel 7.2.3-dk carregado", "CPU i7-3537U ULV · 4 threads ok", "HM76 / RAM 8 GB soldada ok",
  "mSATA THNSNS128 montado em /", "eDP OLED 13,3\" 1920x1080 @60", "HDMI-1 barra 1920x480 @60 · tátil",
  "Southco E6 · torque 1,8 N·m", "Wi-Fi Intel 6235 · link 300 Mb/s", "bateria VGP-BPS31 · 37 Wh",
  "sensores: 6 térmicos online", "malha criptografada estabelecida",
];
BOOT.forEach(registrar);
const EVENTOS = [
  "sincronizando nós da malha…", "pacote 0x%h verificado", "varredura RF: 14 redes", "cache de mapas atualizado",
  "telemetria enviada ao nó ALFA-3", "ventoinha %r rpm", "temperatura CPU %t °C", "chave de sessão rotacionada",
  "ping nó BRAVO-7 %p ms", "GPS fix 3D · 11 satélites", "backup incremental concluído",
];

// ------------------------------------------------------------------ helpers de desenho
function moldura(g, x, y, w, h, titulo) {
  const T = tema();
  g.fillStyle = rgba(T.pri, 0.035);
  g.fillRect(x, y, w, h);
  g.strokeStyle = rgba(T.pri, 0.35);
  g.lineWidth = 1.5;
  const c = 14;
  g.beginPath();
  g.moveTo(x + c, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h);
  g.lineTo(x, y + h); g.lineTo(x, y + c); g.closePath();
  g.stroke();
  g.strokeStyle = T.pri;
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, y + c + 22); g.lineTo(x, y + c); g.lineTo(x + c, y); g.lineTo(x + c + 40, y); g.stroke();
  if (titulo) {
    g.fillStyle = T.pri;
    g.font = `600 17px ${MONO}`;
    g.textBaseline = "middle";
    g.fillText(titulo, x + c + 50, y + 1);
    const tw = g.measureText(titulo).width;
    g.fillStyle = T.fundo;
    g.fillRect(x + c + 44, y - 2, 4, 4);
    g.fillRect(x + c + 56 + tw, y - 2, 4, 4);
  }
}

function medidor(g, cx, cy, r, v, rot, valor) {
  const T = tema();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  g.lineCap = "butt";
  g.strokeStyle = rgba(T.pri, 0.14);
  g.lineWidth = 10;
  g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  g.strokeStyle = v > 0.85 ? T.alerta : T.pri;
  g.shadowColor = g.strokeStyle; g.shadowBlur = 14;
  g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * v); g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = rgba(T.pri, 0.4); g.lineWidth = 1;
  for (let k = 0; k <= 20; k++) {
    const a = a0 + (a1 - a0) * k / 20, r1 = r + 9, r2 = r + (k % 5 ? 13 : 18);
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
  }
  g.fillStyle = "#e9fffa"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `600 30px ${MONO}`; g.fillText(valor, cx, cy - 2);
  g.fillStyle = T.pri; g.font = `600 15px ${COND}`; g.fillText(rot, cx, cy + 28);
  g.textAlign = "left";
}

function grafico(g, x, y, w, h, serie, cor, preencher) {
  g.beginPath();
  serie.forEach((v, i) => {
    const px = x + w * i / (serie.length - 1), py = y + h - v * h;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.strokeStyle = cor; g.lineWidth = 2; g.shadowColor = cor; g.shadowBlur = 8; g.stroke(); g.shadowBlur = 0;
  if (preencher) {
    g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, rgba(cor, 0.35)); gr.addColorStop(1, rgba(cor, 0));
    g.fillStyle = gr; g.fill();
  }
}

function varredura(g, w, h) {
  g.fillStyle = "rgba(0,0,0,0.16)";
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = v; g.fillRect(0, 0, w, h);
}

function fundo(g, w, h, passo) {
  const T = tema();
  g.fillStyle = T.fundo; g.fillRect(0, 0, w, h);
  g.strokeStyle = rgba(T.pri, 0.05); g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x < w; x += passo) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); }
  for (let y = 0; y < h; y += passo) { g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); }
  g.stroke();
}

// ------------------------------------------------------------------ tela principal (1600 × 900)
const serieRede = Array.from({ length: 90 }, () => 0.3), serieRede2 = Array.from({ length: 90 }, () => 0.2);
let proximoEvento = 0;

function desenharPrincipal(g, W, H, t, rotulo = "11.4 · SVD11 · NÓ TANGO-11") {
  const T = tema();
  fundo(g, W, H, 40);
  const d = new Date();

  // barra superior
  g.fillStyle = rgba(T.pri, 0.08); g.fillRect(0, 0, W, 54);
  g.fillStyle = T.pri; g.fillRect(0, 54, W, 2);
  g.font = `700 28px ${COND}`; g.textBaseline = "middle"; g.fillStyle = "#e9fffa";
  g.fillText("DK//OS", 28, 28);
  g.fillStyle = T.pri; g.font = `500 16px ${MONO}`; g.fillText(rotulo, 130, 29);
  ["NAV", "SIS", "COMMS", "OPS", "ARQ"].forEach((aba, i) => {
    const x = 560 + i * 110, ativo = i === 1;
    g.fillStyle = ativo ? T.pri : rgba(T.pri, 0.5);
    g.font = `600 18px ${COND}`; g.fillText(aba, x, 28);
    if (ativo) g.fillRect(x - 6, 46, 60, 4);
  });
  g.textAlign = "right"; g.fillStyle = "#e9fffa"; g.font = `600 26px ${MONO}`;
  g.fillText(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`, W - 28, 28);
  g.fillStyle = T.pri; g.font = `500 15px ${MONO}`;
  g.fillText(`${sis.wifi ? "WLAN ▮▮▮▯" : "WLAN —"}  ${sis.bt ? "BT ●" : "BT ○"}  BAT 87%`, W - 180, 29);
  g.textAlign = "left";

  // coluna esquerda: medidores + log
  moldura(g, 24, 80, 400, 330, "SISTEMA");
  const cpu = 0.35 + 0.25 * ruido(t, 1) + (sis.perf ? 0.3 : 0), gpu = 0.3 + 0.2 * ruido(t, 5);
  const temp = (sis.vent ? 48 : 58) + 9 * ruido(t * 0.4, 9), ram = 0.52 + 0.04 * ruido(t * 0.2, 3);
  medidor(g, 124, 175, 56, Math.max(0, Math.min(1, cpu)), "CPU", `${Math.round(cpu * 100)}%`);
  medidor(g, 324, 175, 56, Math.max(0, Math.min(1, gpu)), "GPU HD4000", `${Math.round(gpu * 100)}%`);
  medidor(g, 124, 320, 56, temp / 100, "TEMP °C", `${Math.round(temp)}`);
  medidor(g, 324, 320, 56, ram, "RAM 8G", `${Math.round(ram * 100)}%`);

  moldura(g, 24, 434, 400, 410, sis.terminal ? "TERMINAL" : "TERMINAL · OFF");
  if (sis.terminal) {
    if (t > proximoEvento) {
      const e = EVENTOS[Math.floor(Math.random() * EVENTOS.length)]
        .replace("%h", Math.floor(Math.random() * 65535).toString(16).toUpperCase())
        .replace("%r", sis.vent ? 5200 : 3100 + Math.round(Math.random() * 400))
        .replace("%t", Math.round(temp)).replace("%p", 8 + Math.round(Math.random() * 30));
      registrar(e);
      proximoEvento = t + 1.2 + Math.random() * 1.6;
    }
    g.font = `400 15px ${MONO}`;
    const linhas = sis.log.slice(-17);
    linhas.forEach((l, i) => {
      g.fillStyle = i === linhas.length - 1 ? "#e9fffa" : rgba(T.pri, 0.45 + 0.55 * i / linhas.length);
      g.fillText(l.slice(0, 44), 42, 470 + i * 21);
    });
    if (Math.floor(t * 2) % 2) { g.fillStyle = T.pri; g.fillRect(42, 470 + linhas.length * 21 - 8, 10, 16); }
  }

  // centro: globo em wireframe + radar
  const cx = 800, cy = 455, R = 270;
  moldura(g, 446, 80, 708, 764, "LINK ORBITAL");
  g.save();
  g.beginPath(); g.arc(cx, cy, R + 60, 0, Math.PI * 2); g.clip();
  const rot = t * 0.25, inc = 0.38;
  const proj = (lat, lon) => {
    const x = Math.cos(lat) * Math.sin(lon + rot), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon + rot);
    const y2 = y * Math.cos(inc) - z * Math.sin(inc), z2 = y * Math.sin(inc) + z * Math.cos(inc);
    return [cx + x * R, cy - y2 * R, z2];
  };
  g.lineWidth = 1.2;
  const linha = (pts) => {
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1, z1] = pts[i - 1], [x2, y2] = pts[i];
      g.strokeStyle = rgba(T.pri, z1 > 0 ? 0.55 : 0.12);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
  };
  for (let la = -75; la <= 75; la += 15) {
    const pts = [];
    for (let lo = 0; lo <= 360; lo += 8) pts.push(proj(la * Math.PI / 180, lo * Math.PI / 180));
    linha(pts);
  }
  for (let lo = 0; lo < 360; lo += 20) {
    const pts = [];
    for (let la = -90; la <= 90; la += 8) pts.push(proj(la * Math.PI / 180, lo * Math.PI / 180));
    linha(pts);
  }
  // nós na superfície
  [[0.6, 1.2], [-0.3, 2.4], [0.9, 4.1], [0.1, 5.3], [-0.7, 0.4], [0.35, 3.3]].forEach(([la, lo], i) => {
    const [x, y, z] = proj(la, lo);
    if (z < 0) return;
    const p = (Math.sin(t * 3 + i) + 1) / 2;
    g.fillStyle = i === 2 ? T.acento : "#e9fffa";
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = rgba(i === 2 ? T.acento : T.pri, 1 - p); g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 6 + p * 18, 0, Math.PI * 2); g.stroke();
    g.font = `500 13px ${MONO}`; g.fillStyle = rgba(T.pri, 0.9);
    g.fillText(["ALFA-3", "BRAVO-7", "ALVO", "DELTA-1", "ECO-9", "FOX-2"][i], x + 10, y - 10);
  });
  // feixe do radar
  const a = t * 1.4;
  const feixe = g.createConicGradient ? g.createConicGradient(a - 0.6, cx, cy) : null;
  if (feixe) {
    feixe.addColorStop(0, rgba(T.pri, 0)); feixe.addColorStop(0.095, rgba(T.pri, 0.28)); feixe.addColorStop(0.1, rgba(T.pri, 0));
    g.fillStyle = feixe; g.beginPath(); g.arc(cx, cy, R + 50, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  g.strokeStyle = rgba(T.pri, 0.5); g.lineWidth = 1.5;
  [R + 20, R + 50].forEach((r, i) => {
    g.setLineDash(i ? [4, 10] : []);
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  });
  g.setLineDash([]);
  g.strokeStyle = T.pri; g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    const aa = k * Math.PI / 2 + t * 0.2;
    g.beginPath(); g.arc(cx, cy, R + 34, aa, aa + 0.35); g.stroke();
  }
  g.font = `500 16px ${MONO}`; g.fillStyle = T.pri;
  g.fillText(`LAT -23.5505  LON -46.6333  ALT 760 m`, 470, 806);
  g.textAlign = "right"; g.fillText(`AZ ${pad(Math.round((a * 180 / Math.PI) % 360), 3)}°  ELEV 41°`, 1134, 806); g.textAlign = "left";

  // coluna direita: rede + nós
  moldura(g, 1176, 80, 400, 250, "REDE · MALHA");
  serieRede.push(sis.wifi ? Math.max(0.05, 0.45 + 0.35 * ruido(t * 3, 2)) : 0.02); serieRede.shift();
  serieRede2.push(sis.wifi ? Math.max(0.03, 0.25 + 0.2 * ruido(t * 2.4, 7)) : 0.02); serieRede2.shift();
  grafico(g, 1196, 120, 360, 150, serieRede, T.pri, true);
  grafico(g, 1196, 120, 360, 150, serieRede2, T.acento, false);
  g.font = `500 15px ${MONO}`; g.fillStyle = T.pri;
  g.fillText(`↓ ${(serieRede.at(-1) * 120).toFixed(1)} Mb/s`, 1196, 300);
  g.fillStyle = T.acento; g.fillText(`↑ ${(serieRede2.at(-1) * 60).toFixed(1)} Mb/s`, 1386, 300);

  moldura(g, 1176, 354, 400, 260, "NÓS");
  [["ALFA-3", "ONLINE", 12], ["BRAVO-7", "ONLINE", 27], ["CHARLIE", "SILÊNCIO", 0], ["DELTA-1", "ONLINE", 41],
   ["ECO-9", "SINCRON.", 88], ["FOX-2", "ONLINE", 19]].forEach(([n, st, p], i) => {
    const y = 392 + i * 36;
    g.fillStyle = st === "SILÊNCIO" ? T.alerta : st === "SINCRON." ? T.acento : T.pri;
    g.fillRect(1196, y - 5, 10, 10);
    g.fillStyle = "#e9fffa"; g.font = `600 16px ${MONO}`; g.fillText(n, 1218, y);
    g.fillStyle = rgba(T.pri, 0.8); g.font = `500 14px ${MONO}`; g.fillText(st, 1340, y);
    g.textAlign = "right"; g.fillText(p ? `${p + Math.round(4 * ruido(t, i))} ms` : "—", 1556, y); g.textAlign = "left";
  });

  moldura(g, 1176, 638, 400, 206, "ENERGIA");
  g.font = `600 44px ${MONO}`; g.fillStyle = "#e9fffa"; g.fillText("87%", 1200, 700);
  g.font = `500 15px ${MONO}`; g.fillStyle = T.pri;
  g.fillText(sis.perf ? "MODO DESEMPENHO" : "MODO EQUILIBRADO", 1340, 690);
  g.fillText(`${(9.5 + 2 * ruido(t * 0.3, 4)).toFixed(1)} W · 4h12 restantes`, 1340, 714);
  for (let k = 0; k < 20; k++) {
    g.fillStyle = k < 17 ? rgba(T.pri, 0.35 + 0.65 * (k / 17)) : rgba(T.pri, 0.12);
    g.fillRect(1200 + k * 18, 748, 13, 64);
  }

  // rodapé
  g.fillStyle = rgba(T.pri, 0.08); g.fillRect(0, H - 40, W, 40);
  g.font = `500 15px ${MONO}`; g.fillStyle = rgba(T.pri, 0.85);
  const tick = "SVD11 // CYBERDECK MK-I  ·  CANAL SEGURO AES-256  ·  SENSORES NOMINAIS  ·  PRÓXIMA JANELA ORBITAL 00:14:32  ·  ";
  const off = (t * 60) % g.measureText(tick).width;
  g.save(); g.beginPath(); g.rect(0, H - 40, W, 40); g.clip();
  for (let x = -off; x < W; x += g.measureText(tick).width) g.fillText(tick, x, H - 20);
  g.restore();

  if (sis.gravando) {
    g.fillStyle = Math.floor(t * 2) % 2 ? T.alerta : rgba(T.alerta, 0.3);
    g.beginPath(); g.arc(1120, 28, 9, 0, Math.PI * 2); g.fill();
    g.font = `600 16px ${MONO}`; g.fillText("REC", 1136, 29);
  }
  aviso(g, W, H, t);
  if (sis.bloqueado) bloqueio(g, W, H, t);
  varredura(g, W, H);
}

function aviso(g, W, H, t) {
  const k = 1 - (t - sis.aviso.t) / 1.6;
  if (k <= 0 || !sis.aviso.txt) return;
  const T = tema();
  g.globalAlpha = Math.min(1, k * 2);
  g.fillStyle = rgba(T.fundo, 0.9); g.strokeStyle = T.pri; g.lineWidth = 2;
  g.fillRect(W / 2 - 220, H - 150, 440, 64); g.strokeRect(W / 2 - 220, H - 150, 440, 64);
  g.fillStyle = "#e9fffa"; g.font = `600 26px ${COND}`; g.textAlign = "center";
  g.fillText(sis.aviso.txt, W / 2, H - 117); g.textAlign = "left";
  g.globalAlpha = 1;
}

function bloqueio(g, W, H, t) {
  const T = tema();
  g.fillStyle = "rgba(0,0,0,0.82)"; g.fillRect(0, 0, W, H);
  g.strokeStyle = T.pri; g.lineWidth = 6;
  g.beginPath(); g.arc(W / 2, H / 2 - 70, 46, Math.PI, 0); g.stroke();
  g.fillStyle = T.pri; g.fillRect(W / 2 - 70, H / 2 - 70, 140, 110);
  g.fillStyle = T.fundo; g.fillRect(W / 2 - 6, H / 2 - 40, 12, 40);
  g.fillStyle = "#e9fffa"; g.font = `700 44px ${COND}`; g.textAlign = "center";
  g.fillText("DK//OS · BLOQUEADO", W / 2, H / 2 + 110);
  g.fillStyle = rgba(T.pri, 0.5 + 0.5 * Math.sin(t * 3)); g.font = `500 18px ${MONO}`;
  g.fillText("toque em BLOQUEAR na barra para liberar", W / 2, H / 2 + 156);
  g.textAlign = "left";
}

// ------------------------------------------------------------------ barra de controle (1920 × 480)
const BX = 380, BY = 34, BW = 1180, BH = 412, COLS = 6, LINHAS = 2, GAP = 14;
const celula = (i) => {
  const w = (BW - GAP * (COLS - 1)) / COLS, h = (BH - GAP * (LINHAS - 1)) / LINHAS;
  return [BX + (i % COLS) * (w + GAP), BY + Math.floor(i / COLS) * (h + GAP), w, h];
};

function icone(g, id, cx, cy, cor) {
  g.strokeStyle = cor; g.fillStyle = cor; g.lineWidth = 7; g.lineCap = "round"; g.lineJoin = "round";
  const arco = (r, a0, a1) => { g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); };
  switch (id) {
    case "wifi":
      [18, 38, 58].forEach((r) => arco(r, -Math.PI * 0.75, -Math.PI * 0.25));
      g.beginPath(); g.arc(cx, cy + 4, 6, 0, Math.PI * 2); g.fill(); break;
    case "bt":
      g.beginPath(); g.moveTo(cx - 20, cy - 16); g.lineTo(cx + 18, cy + 18); g.lineTo(cx, cy + 36); g.lineTo(cx, cy - 36);
      g.lineTo(cx + 18, cy - 18); g.lineTo(cx - 20, cy + 16); g.stroke(); break;
    case "mudo": case "volm": case "volp":
      g.beginPath(); g.moveTo(cx - 40, cy - 12); g.lineTo(cx - 24, cy - 12); g.lineTo(cx - 4, cy - 32); g.lineTo(cx - 4, cy + 32);
      g.lineTo(cx - 24, cy + 12); g.lineTo(cx - 40, cy + 12); g.closePath(); g.fill();
      if (id === "mudo") { g.beginPath(); g.moveTo(cx + 12, cy - 16); g.lineTo(cx + 40, cy + 16); g.moveTo(cx + 40, cy - 16); g.lineTo(cx + 12, cy + 16); g.stroke(); }
      if (id === "volm") { g.beginPath(); g.moveTo(cx + 12, cy); g.lineTo(cx + 40, cy); g.stroke(); }
      if (id === "volp") { g.beginPath(); g.moveTo(cx + 12, cy); g.lineTo(cx + 40, cy); g.moveTo(cx + 26, cy - 14); g.lineTo(cx + 26, cy + 14); g.stroke(); }
      break;
    case "brilho":
      g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28); g.lineTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); g.stroke();
      }
      break;
    case "tema":
      g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx, cy, 34, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill(); break;
    case "noturno":
      g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill();
      g.save(); g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.arc(cx + 18, cy - 14, 28, 0, Math.PI * 2); g.fill(); g.restore(); break;
    case "vent":
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + performance.now() / (sis.vent ? 90 : 400);
        g.beginPath(); g.ellipse(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, 20, 9, a, 0, Math.PI * 2); g.fill();
      }
      g.beginPath(); g.arc(cx, cy, 42, 0, Math.PI * 2); g.lineWidth = 4; g.stroke(); break;
    case "gravando":
      g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, 38, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx, cy, 24, 0, Math.PI * 2); g.fill(); break;
    case "terminal":
      g.lineWidth = 5; g.strokeRect(cx - 44, cy - 32, 88, 64);
      g.lineWidth = 7; g.beginPath(); g.moveTo(cx - 28, cy - 12); g.lineTo(cx - 12, cy); g.lineTo(cx - 28, cy + 12); g.stroke();
      g.beginPath(); g.moveTo(cx - 2, cy + 14); g.lineTo(cx + 24, cy + 14); g.stroke(); break;
    case "bloqueado":
      g.fillRect(cx - 30, cy - 6, 60, 46);
      g.beginPath(); g.arc(cx, cy - 8, 20, Math.PI, 0); g.stroke(); break;
  }
}

function desenharBarra(g, W, H, t) {
  const T = tema();
  fundo(g, W, H, 32);
  const d = new Date();
  // bloco esquerdo: relógio
  g.textBaseline = "middle";
  g.fillStyle = "#e9fffa"; g.font = `600 92px ${MONO}`;
  g.fillText(`${pad(d.getHours())}:${pad(d.getMinutes())}`, 30, 140);
  g.fillStyle = T.pri; g.font = `500 26px ${MONO}`;
  g.fillText(`:${pad(d.getSeconds())}`, 300, 160);
  g.font = `600 30px ${COND}`;
  g.fillText(d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase(), 32, 222);
  g.fillStyle = rgba(T.pri, 0.6); g.font = `500 22px ${MONO}`;
  g.fillText("PAINEL DE CONTROLE", 32, 300);
  g.fillText(`CPU ${Math.round(48 + 9 * ruido(t * 0.4, 9))}°C  ${sis.perf ? "PERF" : "EQUIL"}`, 32, 336);
  g.fillText(`WLAN ${sis.wifi ? "ON " : "OFF"}  BT ${sis.bt ? "ON" : "OFF"}`, 32, 372);
  g.fillStyle = T.pri; g.fillRect(30, 410, 320, 4);
  g.fillStyle = T.acento; g.fillRect(30, 410, 320 * ((t * 0.08) % 1), 4);

  // botões
  BOTOES.forEach((b, i) => {
    const [x, y, w, h] = celula(i);
    const ligado = b.tipo === "liga" ? !!sis[b.id] : false;
    const toque = sis.toque.i === i ? Math.max(0, 1 - (t - sis.toque.t) / 0.45) : 0;
    const cor = b.id === "gravando" && ligado ? T.alerta : T.pri;
    g.fillStyle = ligado ? rgba(cor, 0.2 + 0.1 * toque) : rgba(T.pri, 0.04 + 0.25 * toque);
    g.fillRect(x, y, w, h);
    g.strokeStyle = ligado || toque ? cor : rgba(T.pri, 0.3);
    g.lineWidth = ligado ? 3 : 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = cor;
    g.fillRect(x, y, 22, 4); g.fillRect(x, y, 4, 22);
    g.fillRect(x + w - 22, y + h - 4, 22, 4); g.fillRect(x + w - 4, y + h - 22, 4, 22);
    if (ligado) { g.shadowColor = cor; g.shadowBlur = 22; }
    icone(g, b.id, x + w / 2, y + h / 2 - 20, ligado || toque ? cor : rgba(T.pri, 0.75));
    g.shadowBlur = 0;
    g.fillStyle = ligado ? "#e9fffa" : rgba(T.pri, 0.85);
    g.font = `600 24px ${COND}`; g.textAlign = "center";
    g.fillText(b.rot, x + w / 2, y + h - 30);
    if (b.tipo === "liga") {
      g.fillStyle = ligado ? cor : rgba(T.pri, 0.2);
      g.beginPath(); g.arc(x + w - 22, y + 22, 7, 0, Math.PI * 2); g.fill();
    }
    g.textAlign = "left";
  });

  // sliders verticais: volume e brilho
  [["VOL", sis.mudo ? 0 : sis.volume], ["BRILHO", sis.brilho]].forEach(([rot, v], k) => {
    const x = 1610 + k * 150, y0 = 60, h = 330;
    g.fillStyle = rgba(T.pri, 0.1); g.fillRect(x, y0, 56, h);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const on = i < Math.round(v * n);
      g.fillStyle = on ? (i > n * 0.8 && k === 0 ? T.acento : T.pri) : rgba(T.pri, 0.12);
      g.fillRect(x + 6, y0 + h - 6 - (i + 1) * (h - 12) / n + 3, 44, (h - 12) / n - 6);
    }
    g.fillStyle = "#e9fffa"; g.font = `600 22px ${COND}`; g.textAlign = "center";
    g.fillText(rot, x + 28, 420); g.textAlign = "left";
  });
  varredura(g, W, H);
}

function acionar(i, t) {
  const b = BOTOES[i];
  sis.toque = { i, t };
  if (b.tipo === "liga") sis[b.id] = !sis[b.id];
  if (b.id === "volm") { sis.volume = Math.max(0, sis.volume - 0.1); sis.mudo = false; }
  if (b.id === "volp") { sis.volume = Math.min(1, sis.volume + 0.1); sis.mudo = false; }
  if (b.id === "brilho") sis.brilho = sis.brilho >= 0.99 ? 0.35 : Math.min(1, sis.brilho + 0.2);
  if (b.id === "tema") sis.tema = sis.tema === "ciano" ? "ambar" : "ciano";
  if (b.id === "vent") sis.perf = sis.vent;
  const txt = {
    volm: `VOLUME ${Math.round(sis.volume * 100)}%`, volp: `VOLUME ${Math.round(sis.volume * 100)}%`,
    brilho: `BRILHO ${Math.round(sis.brilho * 100)}%`, tema: `TEMA ${sis.tema.toUpperCase()}`,
  }[b.id] ?? `${b.rot} ${sis[b.id] ? "LIGADO" : "DESLIGADO"}`;
  sis.aviso = { txt, t };
  registrar(txt.toLowerCase());
}

// ------------------------------------------------------------------ teclado retroiluminado
function desenharTeclado(g, W, H, tec, escala, ox, oy) {
  const T = tema();
  g.clearRect(0, 0, W, H);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = T.pri; g.shadowBlur = 10;
  for (const [x, y, w, h, n] of tec) {
    if (!n) continue;
    const px = (x - ox + w / 2) * escala, py = H - (y - oy + h / 2) * escala;
    const tam = n.length > 3 ? 2.6 : n.length > 1 ? 3.0 : 4.6;
    g.font = `${n.length > 1 ? 600 : 500} ${tam * escala}px ${n.length > 1 ? COND : MONO}`;
    g.fillStyle = T.pri;
    g.fillText(n, px, py);
  }
  g.shadowBlur = 0;
  // brilho que vaza entre as teclas
  for (const [x, y, w, h] of tec) {
    const px = (x - ox) * escala, py = H - (y - oy + h) * escala;
    g.strokeStyle = rgba(T.pri, 0.22); g.lineWidth = 0.5 * escala;
    g.strokeRect(px - 0.35 * escala, py - 0.35 * escala, (w + 0.7) * escala, (h + 0.7) * escala);
  }
}

// ------------------------------------------------------------------ montagem na cena
function plano(w, h, canvas, normal) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  if (normal < 0) m.rotation.x = Math.PI;      // vira para −z mantendo o "para cima" da imagem na borda da frente
  return m;
}

export function criarTelas(modelo, malhas) {
  const porNome = (n) => malhas.find((m) => m.userData.p.nome === n);
  const itens = [];
  const nova = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  let barra = null;

  for (const tl of modelo.telas ?? []) {
    const pai = porNome(tl.peca);
    if (!pai) continue;
    const principal = tl.tipo === "principal";
    const cv = principal ? nova(1600, Math.round(1600 * tl.h / tl.w)) : nova(1920, 480);   // 16:9 ou 16:10
    const m = plano(tl.w, tl.h, cv, tl.normal);
    m.position.set(...tl.centro);
    pai.add(m);
    const desenhar = principal ? (g, W, H, t) => desenharPrincipal(g, W, H, t, tl.rotulo) : desenharBarra;
    const item = { m, cv, g: cv.getContext("2d"), desenhar, tipo: tl.tipo };
    itens.push(item);
    if (!principal) barra = item;
  }

  const kb = modelo.teclado;
  const paiTec = kb && porNome(kb.peca);
  if (paiTec) {
    const xs = kb.teclas.map((k) => k[0]), ys = kb.teclas.map((k) => k[1]);
    const ox = Math.min(...xs) - 1, oy = Math.min(...ys) - 1;
    const w = Math.max(...kb.teclas.map((k) => k[0] + k[2])) - ox + 1;
    const h = Math.max(...kb.teclas.map((k) => k[1] + k[3])) - oy + 1;
    const escala = 8;
    const cv = nova(Math.round(w * escala), Math.round(h * escala));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    m.position.set(ox + w / 2, oy + h / 2, kb.z);
    m.raycast = () => {};
    paiTec.add(m);
    itens.push({ m, cv, g: cv.getContext("2d"), tipo: "teclado",
      desenhar: (g, W, H) => desenharTeclado(g, W, H, kb.teclas, escala, ox, oy), estatico: true });
  }

  let ligadas = true, ultimo = 0, temaDesenhado = "";
  const t0 = performance.now();
  const api = {
    set ligadas(v) { ligadas = v; itens.forEach((i) => (i.m.visible = v)); },
    get ligadas() { return ligadas; },
    atualizar(agora) {
      if (!ligadas || agora - ultimo < 45) return;        // ~22 fps basta para a interface
      ultimo = agora;
      const t = (agora - t0) / 1000;
      for (const it of itens) {
        if (it.estatico && temaDesenhado === sis.tema) continue;
        it.desenhar(it.g, it.cv.width, it.cv.height, t);
        it.m.material.map.needsUpdate = true;
        if (it.tipo === "principal") it.m.material.color.setScalar(sis.brilho * (sis.noturno ? 0.55 : 1));
        if (it.tipo === "teclado") it.m.material.opacity = sis.noturno ? 0.5 : 1;
      }
      temaDesenhado = sis.tema;
    },
    // devolve true se o clique caiu num botão da barra (e não deve selecionar peça)
    clicar(raio, alvos) {
      if (!ligadas || !barra || !barra.m.visible || !barra.m.parent.visible) return false;
      const hit = raio.intersectObject(barra.m, false)[0];
      if (!hit) return false;
      const outro = raio.intersectObjects(alvos.filter((m) => m !== barra.m.parent), false)[0];
      if (outro && outro.distance < hit.distance * 0.995) return false;   // algo na frente (ex.: tampa fechada)
      const px = hit.uv.x * barra.cv.width, py = (1 - hit.uv.y) * barra.cv.height;
      const i = BOTOES.findIndex((_, k) => {
        const [x, y, w, h] = celula(k);
        return px >= x && px <= x + w && py >= y && py <= y + h;
      });
      if (i < 0) return true;
      acionar(i, (performance.now() - t0) / 1000);
      return true;
    },
  };
  return api;
}
