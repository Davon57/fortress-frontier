import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ManorSimulation, type BuildingKind } from "./manor-simulation";

const names: Record<BuildingKind, string> = { house: "民居", lumberyard: "伐木营", forager: "采集棚", farm: "农田", granary: "粮仓", smithy: "铁匠铺", watchtower: "瞭望塔" };
const seeded = (value: number) => { const x = Math.sin(value * 91.17) * 15431.73; return x - Math.floor(x); };
const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: .92, flatShading: true });
const terrainHeight = (x: number, z: number) =>
  Math.sin(x * .065) * Math.cos(z * .075) * 1.4 +
  Math.sin((x + z) * .13) * .45 -
  Math.max(0, (x - 58) / 42) * .8;

export const mountManorThree = () => {
  const sim = new ManorSimulation();
  document.title = "领主的土地";
  document.body.innerHTML = `<main class="manor manor--three"><header class="manor__topbar"><a href="/">← 游戏首页</a><div id="stats" class="manor__resources"></div><b id="time"></b><span><button data-speed="1" class="active">1×</button><button data-speed="2">2×</button><button data-speed="4">4×</button><button id="fullscreen">全屏</button></span></header><div id="territories" class="manor__territories"></div><div id="three-world"></div><section class="manor__hud"><div class="manor__build-title">劳力分配 <button data-job="logger">伐木工</button><button data-job="farmer">农夫</button><button data-job="smith">铁匠</button></div><div id="actions" class="manor__actions"></div><button id="recruit">征召民兵</button></section><aside><h2>领地日志</h2><div id="log"></div></aside></main>`;
  const host = document.querySelector<HTMLDivElement>("#three-world")!;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bb7c2);
  scene.fog = new THREE.FogExp2(0x9bb7c2, .002);
  const camera = new THREE.PerspectiveCamera(48, host.clientWidth / host.clientHeight, .1, 420);
  camera.position.set(88, 92, 116);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(host.clientWidth, host.clientHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .07; controls.minDistance = 26; controls.maxDistance = 205;
  controls.maxPolarAngle = Math.PI * .47; controls.zoomToCursor = true; controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.target.set(-7, 0, -5);
  scene.add(new THREE.HemisphereLight(0xfff1cb, 0x35503b, 2.2));
  const sun = new THREE.DirectionalLight(0xffe0ac, 3.1); sun.position.set(-65, 105, 35); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -115; sun.shadow.camera.right = 115; sun.shadow.camera.top = 115; sun.shadow.camera.bottom = -115; scene.add(sun);

  const groundGeometry = new THREE.PlaneGeometry(245, 205, 64, 54); groundGeometry.rotateX(-Math.PI / 2);
  const position = groundGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) { const x = position.getX(i), z = position.getZ(i); const hill = Math.sin(x * .065) * Math.cos(z * .075) * 1.4 + Math.sin((x + z) * .13) * .45; position.setY(i, hill - Math.max(0, (x - 58) / 42) * .8); }
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, material(0x607d4d)); ground.receiveShadow = true; scene.add(ground);
  const groundProbe = new THREE.Raycaster();
  const snapToGround = (x: number, z: number) => {
    groundProbe.set(new THREE.Vector3(x, 80, z), new THREE.Vector3(0, -1, 0));
    return groundProbe.intersectObject(ground)[0]?.point.y ?? terrainHeight(x, z);
  };
  const roadMat = material(0x9b7950), wood = material(0x664129), darkStone = material(0x3f4947);
  const addRoad = (points: [number, number][], width = 4) => {
    const shape = new THREE.Shape(); const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, .18, z)));
    const samples = curve.getPoints(50);
    for (let i = 0; i < samples.length; i++) { const p = samples[i], n = samples[Math.min(i + 1, samples.length - 1)].clone().sub(samples[Math.max(i - 1, 0)]).normalize(); const side = new THREE.Vector3(-n.z, 0, n.x).multiplyScalar(width / 2); if (!i) shape.moveTo(p.x + side.x, p.z + side.z); else shape.lineTo(p.x + side.x, p.z + side.z); }
    for (let i = samples.length - 1; i >= 0; i--) { const p = samples[i], n = samples[Math.min(i + 1, samples.length - 1)].clone().sub(samples[Math.max(i - 1, 0)]).normalize(); const side = new THREE.Vector3(n.z, 0, -n.x).multiplyScalar(width / 2); shape.lineTo(p.x + side.x, p.z + side.z); }
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), roadMat); mesh.rotation.x = -Math.PI / 2; mesh.position.y = .21; mesh.receiveShadow = true; scene.add(mesh);
  };
  addRoad([[-92, -52], [-48, -35], [-15, -12], [15, 3], [52, 10], [96, 31]], 4.6);
  addRoad([[-15, -12], [-38, 25], [-65, 67]], 3.4); addRoad([[15, 3], [39, -37], [78, -67]], 3.4);
  const addTree = (x: number, z: number, scale = 1, color = 0x305d36) => {
    const tree = new THREE.Group(); const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22 * scale, .32 * scale, 2.1 * scale, 6), wood); trunk.position.y = scale; tree.add(trunk);
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45 * scale, 1), material(color)); crown.position.y = 2.65 * scale; crown.castShadow = true; tree.add(crown); tree.position.set(x, 0, z); scene.add(tree);
  };
  const scatterForest = (cx: number, cz: number, count: number, radius: number, color: number) => { for (let i = 0; i < count; i++) { const a = seeded(i + cx) * Math.PI * 2, r = Math.sqrt(seeded(i * 4 + cz)) * radius; addTree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, .7 + seeded(i + 9) * .55, color); } };
  scatterForest(-61, 56, 62, 31, 0x315e37); scatterForest(59, -57, 42, 26, 0x3d6339); scatterForest(-88, -56, 26, 22, 0x41693b);
  const addOre = (x: number, z: number) => { for (let i = 0; i < 9; i++) { const ore = new THREE.Mesh(new THREE.DodecahedronGeometry(.6 + seeded(i + x) * .65), material(i % 3 ? 0x616a68 : 0x8f7653)); ore.position.set(x + (seeded(i) - .5) * 6, .55, z + (seeded(i + 24) - .5) * 5); ore.castShadow = true; scene.add(ore); } };
  addOre(-73, 58); addOre(69, -58);
  const banner = (x: number, z: number, color: number) => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 5.5, 6), wood); pole.position.set(x, 2.75, z); scene.add(pole); const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.5), material(color)); cloth.position.set(x + 1.3, 4.55, z); cloth.rotation.y = .25; scene.add(cloth); };
  banner(-21, -18, 0x315f9a); banner(-62, 42, 0x8a7b49); banner(53, -45, 0x8a7b49); banner(76, 26, 0x9a3534);

  const village = new THREE.Group(); village.position.set(-19, 0, -15); scene.add(village);
  const addBuilding = (x: number, z: number, kind: BuildingKind = "house") => {
    const g = new THREE.Group(), wallColor = kind === "smithy" ? 0x4b504d : kind === "granary" ? 0x74634a : 0xa96f48;
    const base = new THREE.Mesh(new THREE.BoxGeometry(4, kind === "watchtower" ? 6 : 2.8, 3.5), material(wallColor)); base.position.y = kind === "watchtower" ? 3 : 1.4; base.castShadow = true; g.add(base);
    if (kind === "watchtower") { const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.6, 4), material(0x45332d)); roof.position.y = 7.3; roof.rotation.y = Math.PI / 4; g.add(roof); }
    else { const roof = new THREE.Mesh(new THREE.ConeGeometry(3.25, 2.1, 4), material(kind === "granary" ? 0x4e4031 : 0x5a3329)); roof.position.y = 3.7; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof); }
    if (kind === "farm") { for (let row = -3; row <= 3; row++) { const crop = new THREE.Mesh(new THREE.BoxGeometry(8, .18, .28), material(0xc1a049)); crop.position.set(5, .24, row * .65); g.add(crop); } }
    if (kind === "lumberyard") for (let i = 0; i < 5; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 3.8, 7), wood); log.rotation.z = Math.PI / 2; log.position.set(3.7, .45 + (i % 2) * .42, -1 + Math.floor(i / 2) * .8); g.add(log); }
    if (kind === "smithy") { const chimney = new THREE.Mesh(new THREE.BoxGeometry(.75, 2.3, .75), darkStone); chimney.position.set(1.25, 4.05, 0); g.add(chimney); const ember = new THREE.PointLight(0xf18a3a, 1.2, 8); ember.position.set(0, 1.3, 2); g.add(ember); }
    if (kind === "forager") { const rack = new THREE.Mesh(new THREE.BoxGeometry(4.6, .15, 1.1), wood); rack.position.set(3, 1.2, 0); g.add(rack); }
    g.position.set(x, 0, z); village.add(g);
  };
  [[-9, -5], [-4, -9], [2, -7], [8, -2]].forEach(([x, z]) => addBuilding(x, z)); addBuilding(-7, 4, "lumberyard"); addBuilding(3, 6, "farm"); addBuilding(9, 4, "granary"); addBuilding(-1, 2, "smithy"); addBuilding(-13, 2, "forager"); addBuilding(-15, -10, "watchtower");
  const warehouse = new THREE.Vector3(-7, 0, 3);
  const people: { model: THREE.Group; home: THREE.Vector3; work: THREE.Vector3; color: number; phase: number }[] = [];
  const makeVillager = (index: number, role: "logger" | "farmer" | "smith") => {
    const p = new THREE.Group(), color = role === "logger" ? 0x496f40 : role === "farmer" ? 0xb28736 : 0x455d85;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.26, .36, .88, 6), material(color)); body.position.y = .9; p.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.25, 1), material(0xd5a077)); head.position.y = 1.55; p.add(head);
    const tool = new THREE.Mesh(new THREE.BoxGeometry(role === "smith" ? .45 : .13, .13, role === "logger" ? .72 : .42), role === "smith" ? darkStone : wood); tool.position.set(.38, .8, 0); tool.rotation.z = -.55; p.add(tool);
    scene.add(p); people.push({ model: p, home: new THREE.Vector3(-28 + (index % 4) * 5, .42, -24 - Math.floor(index / 4) * 3), work: role === "logger" ? new THREE.Vector3(-26, .42, 0) : role === "farmer" ? new THREE.Vector3(-16, .42, -7) : new THREE.Vector3(-20, .42, -13), color, phase: index * .13 });
  };
  ["logger", "logger", "farmer", "farmer", "farmer", "farmer"].forEach((role, index) => makeVillager(index, role as "logger" | "farmer" | "smith"));
  const keys = Object.keys(names) as BuildingKind[];
  document.querySelector("#actions")!.innerHTML = keys.map((key) => `<button data-build="${key}">建造${names[key]}</button>`).join("");
  const refresh = () => { const s = sim.state;
    document.querySelector("#time")!.textContent = `${s.season}季 · 第${s.day}日 · 劫掠 ${s.raidIn} 日后`;
    document.querySelector("#stats")!.innerHTML = `<span>人口 <b>${s.population}</b></span><span>劳力 <b>${s.workers}</b></span><span>民兵 <b>${s.militia}</b></span><span>粮食 <b>${Math.floor(s.food)}</b></span><span>木材 <b>${Math.floor(s.wood)}</b></span><span>工具 <b>${Math.floor(s.tools)}</b></span><span>影响力 <b>${Math.floor(s.influence)}</b></span>`;
    const state = (region: "north" | "south") => s.territories[region] === "player" ? "前哨已建立" : s.threats[region] ? `清除威胁 ${s.threats[region]}` : "建立前哨";
    document.querySelector("#territories")!.innerHTML = `<b>蓝旗：我方庄园</b><button data-region="north">北境 · ${state("north")}</button><button data-region="south">南境 · ${state("south")}</button><b>红旗：敌方堡垒</b>`;
    document.querySelector("#log")!.innerHTML = s.log.slice(0, 3).map((entry) => `<p>${entry}</p>`).join("");
    document.querySelectorAll<HTMLButtonElement>("[data-region]").forEach((button) => button.onclick = () => { const region = button.dataset.region as "north" | "south"; if (s.threats[region]) sim.clearThreat(region); else sim.establishOutpost(region); refresh(); });
  };
  let selectedBuild: BuildingKind | null = null, speed = 1;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const preview = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 24), new THREE.MeshBasicMaterial({ color: 0xd9bf70, transparent: true, opacity: .7, side: THREE.DoubleSide })); preview.rotation.x = -Math.PI / 2; preview.visible = false; scene.add(preview);
  const groundPoint = (event: PointerEvent) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera); return raycaster.intersectObject(ground)[0]?.point; };
  document.querySelectorAll<HTMLButtonElement>("[data-build]").forEach((button) => button.onclick = () => { selectedBuild = button.dataset.build as BuildingKind; preview.visible = true; document.querySelectorAll("[data-build]").forEach((item) => item.classList.toggle("active", item === button)); });
  document.querySelector<HTMLButtonElement>("#recruit")!.onclick = () => { sim.recruit(); refresh(); };
  document.querySelectorAll<HTMLButtonElement>("[data-job]").forEach((button) => button.onclick = () => { const job = button.dataset.job as "logger" | "farmer" | "smith"; sim.assign(job, sim.state.jobs[job] + 1); refresh(); });
  renderer.domElement.onpointermove = (event) => { const hit = groundPoint(event); if (hit && selectedBuild) preview.position.set(hit.x, hit.y + .2, hit.z); };
  renderer.domElement.onclick = (event) => { const hit = groundPoint(event); if (selectedBuild && hit && sim.build(selectedBuild)) { addBuilding(hit.x + 19, hit.z + 15, selectedBuild); selectedBuild = null; preview.visible = false; document.querySelectorAll("[data-build]").forEach((item) => item.classList.remove("active")); refresh(); } };
  renderer.domElement.oncontextmenu = (event) => event.preventDefault();
  document.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((button) => button.onclick = () => { speed = Number(button.dataset.speed); document.querySelectorAll("[data-speed]").forEach((item) => item.classList.toggle("active", item === button)); });
  document.querySelector("#fullscreen")!.addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen() : host.requestFullscreen());
  window.addEventListener("resize", () => { camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); });
  const loop = (time: number) => { const day = (time * .00007 * speed) % 1;
    people.forEach((person) => { const route = day < .42 ? [person.home, person.work] : day < .72 ? [person.work, warehouse] : [warehouse, person.home]; const progress = ((day * 3 + person.phase) % 1); person.model.position.lerpVectors(route[0], route[1], progress); const direction = route[1].clone().sub(route[0]); person.model.rotation.y = Math.atan2(direction.x, direction.z); person.model.position.y = snapToGround(person.model.position.x, person.model.position.z) + .08 + Math.abs(Math.sin(time * .008 + person.phase * 8)) * .025; });
    controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop);
  };
  refresh(); setInterval(() => { sim.update(speed); refresh(); }, 1000); requestAnimationFrame(loop);
};
