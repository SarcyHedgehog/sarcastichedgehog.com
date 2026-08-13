import * as THREE from "three";
import { C, WALL } from "./constants.js";
import { interpolatedPosition } from "./game-model.js";

export class MazeView {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050912);
    this.scene.fog = new THREE.FogExp2(0x07101c, 0.013);
    this.camera = new THREE.PerspectiveCamera(58, 1, .1, 220);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.players = new Map(); this.cubes = new Map(); this.trails = new Map(); this.localActor = null; this.latest = null; this.builtMap = null;
    this.clock = new THREE.Clock();
    this.setupLights(); this.resize();
    addEventListener("resize", () => this.resize());
    this.renderer.setAnimationLoop(() => this.render());
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xaedaff, 0x10151f, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-20, 34, 16); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = key.shadow.camera.bottom = -52; key.shadow.camera.right = key.shadow.camera.top = 52; this.scene.add(key);
    const cyan = new THREE.PointLight(0x23d9ff, 28, 70, 2); cyan.position.set(-30, 10, -28); this.scene.add(cyan);
    const pink = new THREE.PointLight(0xff2a7f, 24, 65, 2); pink.position.set(28, 8, 26); this.scene.add(pink);
  }

  async buildMaze(maze, mapId) {
    if (this.builtMap === mapId) return;
    this.builtMap = mapId;
    if (this.mazeGroup) this.scene.remove(this.mazeGroup);
    this.mazeGroup = new THREE.Group(); this.scene.add(this.mazeGroup);
    const texture = await new THREE.TextureLoader().loadAsync("assets/maze-wall-panels.png"); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1.4, .75); texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const wallMaterial = new THREE.MeshStandardMaterial({ map: texture, color: 0xbfd0db, roughness: .52, metalness: .28 });
    const wallHorizontal = new THREE.BoxGeometry(C.cellWidth + C.wallThickness, C.wallHeight, C.wallThickness);
    const wallVertical = new THREE.BoxGeometry(C.wallThickness, C.wallHeight, C.cellWidth + C.wallThickness);
    const offset = C.gridSize * C.cellWidth / 2;
    const addWall = (geometry, x, z) => { const mesh = new THREE.Mesh(geometry, wallMaterial); mesh.position.set(x, C.wallHeight / 2, z); mesh.castShadow = mesh.receiveShadow = true; this.mazeGroup.add(mesh); };
    for (let y = 0; y < C.gridSize; y += 1) for (let x = 0; x < C.gridSize; x += 1) {
      const cell = maze[y * C.gridSize + x] ?? 15, cx = x * C.cellWidth - offset + C.cellWidth / 2, cz = y * C.cellWidth - offset + C.cellWidth / 2;
      if (cell & WALL.north) addWall(wallHorizontal, cx, cz - C.cellWidth / 2);
      if (cell & WALL.west) addWall(wallVertical, cx - C.cellWidth / 2, cz);
      if (y === C.gridSize - 1 && cell & WALL.south) addWall(wallHorizontal, cx, cz + C.cellWidth / 2);
      if (x === C.gridSize - 1 && cell & WALL.east) addWall(wallVertical, cx + C.cellWidth / 2, cz);
    }
    const floorTexture = makeFloorTexture(); floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(C.gridSize, C.gridSize);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(C.gridSize * C.cellWidth, C.gridSize * C.cellWidth), new THREE.MeshStandardMaterial({ map: floorTexture, color: 0x182330, roughness: .72, metalness: .25 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -.04; this.mazeGroup.add(floor);
  }

  setLocalActor(actor) { this.localActor = String(actor); }
  setSpectating(value) { this.spectating = value; }
  async update(snapshot) {
    this.latest = snapshot; this.receivedAt = performance.now(); await this.buildMaze(snapshot.maze, snapshot.mapId);
    const livePlayers = new Set(Object.keys(snapshot.players));
    for (const [id, player] of Object.entries(snapshot.players)) {
      let object = this.players.get(id); if (!object) { object = makeRunner(player.color); this.players.set(id, object); this.scene.add(object); }
      object.visible = player.connected; object.userData.player = player;
    }
    for (const [id, object] of this.players) if (!livePlayers.has(id)) { this.scene.remove(object); this.players.delete(id); }
    const liveCubes = new Set(snapshot.cubes.map(cube => cube.id));
    for (const cube of snapshot.cubes) { let object = this.cubes.get(cube.id); if (!object) { object = makeCube(); this.cubes.set(cube.id, object); this.scene.add(object); } const p = gridToWorld(cube.x, cube.y); object.position.set(p.x, .65, p.z); }
    for (const [id, object] of this.cubes) if (!liveCubes.has(id)) { this.scene.remove(object); this.cubes.delete(id); }
  }

  render() {
    if (!this.latest) return this.renderer.render(this.scene, this.camera);
    const extrapolatedTime = this.latest.time + Math.min(180, performance.now() - (this.receivedAt || performance.now()));
    for (const [id, object] of this.players) {
      const player = object.userData.player; if (!player) continue;
      const pos = interpolatedPosition(player, extrapolatedTime), world = gridToWorld(pos.x, pos.y); object.position.set(world.x, .72, world.z); object.rotation.y = -player.direction * Math.PI / 2; object.userData.ring.material.emissiveIntensity = player.isIt ? 4 : .5; object.userData.ring.material.color.setHex(player.isIt ? 0xff315f : player.color); object.userData.ring.material.emissive.setHex(player.isIt ? 0xff103f : player.color); object.userData.shell.opacity = player.immuneUntil > this.latest.time ? .3 : 1;
      this.updateTrail(id, player);
    }
    for (const cube of this.cubes.values()) cube.rotation.y += .018;
    this.updateCamera(); this.renderer.render(this.scene, this.camera);
  }

  updateTrail(id, player) {
    let group = this.trails.get(id); if (!group) { group = new THREE.Group(); this.trails.set(id, group); this.scene.add(group); }
    while (group.children.length < player.trail.length) { const dot = new THREE.Mesh(new THREE.CircleGeometry(.18, 14), new THREE.MeshBasicMaterial({ color: player.color, transparent: true, depthWrite: false })); dot.rotation.x = -Math.PI / 2; group.add(dot); }
    group.children.forEach((dot, index) => { const mark = player.trail[index]; dot.visible = Boolean(mark); if (!mark) return; const p = gridToWorld(mark.x, mark.y); dot.position.set(p.x, .03, p.z); dot.scale.setScalar(1 - index / (player.trail.length + 2)); dot.material.opacity = .72 * (1 - index / (player.trail.length + 1)); });
  }

  updateCamera() {
    const player = this.latest.players[this.localActor];
    if (!player || this.spectating) { this.camera.position.lerp(new THREE.Vector3(0, 72, 48), .035); this.camera.lookAt(0, 0, 0); return; }
    const object = this.players.get(this.localActor); if (!object) return;
    const forward = new THREE.Vector3([0,1,0,-1][player.direction], 0, [-1,0,1,0][player.direction]);
    const target = object.position.clone().addScaledVector(forward, -8).add(new THREE.Vector3(0, 6.2, 0)); this.camera.position.lerp(target, .1); const look = object.position.clone().addScaledVector(forward, 5).add(new THREE.Vector3(0, 1, 0)); this.camera.lookAt(look);
  }
  resize() { const width = this.canvas.clientWidth || innerWidth, height = this.canvas.clientHeight || innerHeight; this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); }
}

function gridToWorld(x, y) { const offset = C.gridSize * C.cellWidth / 2; return { x: x * C.cellWidth - offset + C.cellWidth / 2, z: y * C.cellWidth - offset + C.cellWidth / 2 }; }
function makeRunner(color) { const group = new THREE.Group(); const shell = new THREE.MeshStandardMaterial({ color, roughness: .22, metalness: .68, transparent: true }); const body = new THREE.Mesh(new THREE.SphereGeometry(.72, 24, 18), shell); body.castShadow = true; group.add(body); const nose = new THREE.Mesh(new THREE.ConeGeometry(.26, .75, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 1 })); nose.rotation.x = -Math.PI / 2; nose.position.z = -.75; group.add(nose); const ring = new THREE.Mesh(new THREE.TorusGeometry(.88, .08, 8, 32), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .5 })); ring.rotation.x = Math.PI / 2; group.add(ring); group.userData = { shell, ring }; return group; }
function makeCube() { const mesh = new THREE.Mesh(new THREE.BoxGeometry(.62, .62, .62), new THREE.MeshStandardMaterial({ color: 0x4bdcff, emissive: 0x16bfff, emissiveIntensity: 2.8, roughness: .25, metalness: .55 })); mesh.castShadow = true; return mesh; }
function makeFloorTexture() { const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128; const ctx = canvas.getContext("2d"); ctx.fillStyle = "#17222d"; ctx.fillRect(0,0,128,128); ctx.strokeStyle = "rgba(70,210,255,.26)"; ctx.lineWidth = 2; ctx.strokeRect(1,1,126,126); ctx.strokeStyle = "rgba(255,255,255,.035)"; for (let i=16;i<128;i+=16) { ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,128);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(128,i);ctx.stroke(); } const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture; }
