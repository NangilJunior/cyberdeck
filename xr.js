// DK-11 · realidade aumentada / virtual (WebXR): o cyberdeck em tamanho real na sua mesa.
// Quest (navegador do Quest), Android (Chrome com ARCore) e qualquer headset WebXR.
//   gatilho / pinça na barra de 8,8"  → aperta o botão
//   gatilho / pinça no cyberdeck      → abre / fecha a tampa
//   gatilho / pinça fora dele         → move para o ponto da mira (superfície detectada)
//   botão lateral (grip) segurando    → pega o cyberdeck na mão e solta onde quiser
import * as THREE from "three";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";

const MM = 0.001;   // o modelo é em mm; o WebXR trabalha em metros

export function iniciarXR({ renderer, cena, camera, mundo, malhas, telas, alternarTampa, aoEntrar, aoSair }) {
  renderer.xr.enabled = true;
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(700, 500), new THREE.ShadowMaterial({ opacity: 0.4 }));
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.2;
  sombra.receiveShadow = true;
  sombra.visible = false;
  mundo.add(sombra);

  // mira da superfície (hit-test)
  const mira = new THREE.Mesh(
    new THREE.RingGeometry(0.035, 0.045, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x47f5d4, toneMapped: false }),
  );
  mira.matrixAutoUpdate = false;
  mira.visible = false;
  cena.add(mira);

  // controles e mãos
  const fabCtrl = new XRControllerModelFactory(), fabMao = new XRHandModelFactory();
  const raio = new THREE.Raycaster();
  const geoRaio = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const linha = new THREE.Line(geoRaio, new THREE.LineBasicMaterial({ color: 0x47f5d4, transparent: true, opacity: 0.8 }));
    linha.scale.z = 2;
    c.add(linha);
    c.addEventListener("connected", (e) => { linha.visible = e.data.targetRayMode !== "screen"; });
    c.addEventListener("select", () => tocar(c));
    c.addEventListener("squeezestart", () => pegar(c));
    c.addEventListener("squeezeend", () => soltar(c));
    cena.add(c);
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(fabCtrl.createControllerModel(grip));
    cena.add(grip);
    const mao = renderer.xr.getHand(i);
    mao.add(fabMao.createHandModel(mao, "mesh"));
    cena.add(mao);
    return c;
  });

  let fonteHit = null, refEspaco = null, posicionado = false, segurando = null;
  const estadoDesktop = {};

  function apontar(c) {
    const m = new THREE.Matrix4().identity().extractRotation(c.matrixWorld);
    raio.ray.origin.setFromMatrixPosition(c.matrixWorld);
    raio.ray.direction.set(0, 0, -1).applyMatrix4(m);
    return raio;
  }

  function tocar(c) {
    if (!posicionado) { if (mira.visible) colocar(mira.matrix); return; }
    const r = apontar(c);
    const alvos = malhas.filter((m) => m.visible);
    if (telas()?.clicar(r, alvos)) return;
    if (r.intersectObjects(alvos, false).length) { alternarTampa(); return; }
    if (mira.visible) colocar(mira.matrix);
  }

  function pegar(c) { if (posicionado && !segurando) { c.attach(mundo); segurando = c; } }
  function soltar(c) {
    if (segurando !== c) return;
    cena.attach(mundo);
    // mantém o cyberdeck "em pé": só a rotação em torno do eixo vertical
    const e = new THREE.Euler().setFromQuaternion(mundo.quaternion, "YXZ");
    mundo.rotation.set(0, e.y, 0);
    segurando = null;
  }

  function virarParaUsuario() {
    const cam = renderer.xr.getCamera();
    const p = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    mundo.rotation.set(0, Math.atan2(p.x - mundo.position.x, p.z - mundo.position.z), 0);
  }

  // superfície a no máximo ~1 m na horizontal e abaixo dos olhos (mesa, não o chão lá longe)
  function alcance(matriz) {
    const cam = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
    const p = new THREE.Vector3().setFromMatrixPosition(matriz);
    return Math.hypot(p.x - cam.x, p.z - cam.z) < 1.0 && cam.y - p.y > 0.15 && cam.y - p.y < 1.0;
  }

  function colocar(matriz) {
    mundo.position.setFromMatrixPosition(matriz);
    virarParaUsuario();
    mundo.visible = true;
    posicionado = true;
  }

  function colocarNaFrente() {
    const cam = renderer.xr.getCamera();
    const p = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(cam.matrixWorld));
    f.y = 0;
    f.normalize();
    mundo.position.copy(p).addScaledVector(f, 0.55);
    mundo.position.y = p.y - 0.4;
    virarParaUsuario();
    mundo.visible = true;
    posicionado = true;
  }

  async function entrar(modo) {
    const opcoes = { optionalFeatures: ["local-floor", "hit-test", "hand-tracking", "bounded-floor"] };
    const sessao = await navigator.xr.requestSession(modo, opcoes);
    renderer.xr.setReferenceSpaceType("local-floor");
    try { await renderer.xr.setSession(sessao); } catch {
      renderer.xr.setReferenceSpaceType("local");
      await renderer.xr.setSession(sessao);
    }
    Object.assign(estadoDesktop, { pos: mundo.position.clone(), rot: mundo.rotation.clone(), escala: mundo.scale.clone() });
    mundo.scale.setScalar(MM);
    sombra.visible = modo === "immersive-ar";
    posicionado = false;
    mundo.visible = false;
    aoEntrar(modo);
    if (modo === "immersive-ar" && sessao.requestHitTestSource) {
      try {
        const viewer = await sessao.requestReferenceSpace("viewer");
        fonteHit = await sessao.requestHitTestSource({ space: viewer });
      } catch { fonteHit = null; }
    }
    // sem detecção de superfície (ou demorou): coloca na frente da pessoa
    setTimeout(() => { if (!posicionado) colocarNaFrente(); }, fonteHit ? 2500 : 300);
    sessao.addEventListener("end", () => {
      fonteHit?.cancel?.();
      fonteHit = null;
      mira.visible = false;
      sombra.visible = false;
      if (segurando) soltar(segurando);
      mundo.position.copy(estadoDesktop.pos);
      mundo.rotation.copy(estadoDesktop.rot);
      mundo.scale.copy(estadoDesktop.escala);
      mundo.visible = true;
      aoSair();
    });
  }

  return {
    async suportes() {
      if (!navigator.xr) return [];
      const modos = [];
      for (const m of ["immersive-ar", "immersive-vr"]) {
        try { if (await navigator.xr.isSessionSupported(m)) modos.push(m); } catch { /* sem suporte */ }
      }
      return modos;
    },
    entrar,
    sair: () => renderer.xr.getSession()?.end(),
    // chamado a cada quadro (o laço de animação recebe o XRFrame)
    quadro(frame) {
      if (!frame || !fonteHit) { mira.visible = false; return; }
      refEspaco = renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(fonteHit);
      const pose = hits.length ? hits[0].getPose(refEspaco) : null;
      mira.visible = !!pose && !segurando;
      if (pose) mira.matrix.fromArray(pose.transform.matrix);
      if (!posicionado && pose && alcance(mira.matrix)) {
        // primeira superfície ao alcance das mãos (mesa): põe o cyberdeck nela (toque depois para mudar de lugar)
        colocar(mira.matrix);
      }
    },
    ctrls,
  };
}
