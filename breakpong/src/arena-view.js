import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js";
import { BRICK, C, SNAPSHOT_MS } from "./constants.js";

export class ArenaView {
  constructor(host) {
    this.host = host; this.current = null; this.previous = null; this.receivedAt = 0; this.bricks = new Map(); this.effects = [];
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x06080b); this.scene.fog = new THREE.FogExp2(0x10151a, .045);
    this.camera = new THREE.PerspectiveCamera(48, 1, .1, 100); this.cameraHome=new THREE.Vector3(0,7.2,7.4);this.camera.position.copy(this.cameraHome); this.camera.lookAt(0, 0, 0);this.intro=null;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    host.append(this.renderer.domElement); this.build();
    this.resize = this.resize.bind(this); addEventListener("resize", this.resize); this.resize(); this.animate();
  }

  build() {
    this.buildChamber();
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x111519, 1.75));
    const key = this.keyLight = new THREE.DirectionalLight(0xe9f5ff, 3.8); key.position.set(-3, 7, 5); key.castShadow = true; key.shadow.mapSize.set(2048,2048); this.scene.add(key);
    const rim = this.rimLight = new THREE.PointLight(0x4d91ff, 13, 15); rim.position.set(0, 2, -3); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(C.courtWidth + .8, C.courtDepth + .8), new THREE.MeshStandardMaterial({ color: 0x30373a, metalness: .28, roughness: .62 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const grid = new THREE.GridHelper(C.courtWidth, 16, 0x9da8aa, 0x4a5254); grid.position.y = .006; grid.scale.z = C.courtDepth / C.courtWidth; grid.material.opacity=.34;grid.material.transparent=true;this.scene.add(grid);
    this.paddles = [1, 2].map((slot) => {
      const material = new THREE.MeshStandardMaterial({ color: slot === 1 ? 0x15d9ff : 0xff2b8a, emissive: slot === 1 ? 0x06485b : 0x5b092e, emissiveIntensity: 1.2, metalness: .6, roughness: .2 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(C.paddleThickness, .24, C.paddleLength), material); mesh.position.set(slot === 1 ? -C.paddleX : C.paddleX, .12, 0); mesh.castShadow = true; this.scene.add(mesh); return mesh;
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(C.ballRadius, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xaadfff, emissiveIntensity: 1.4, metalness: .4, roughness: .16 })); this.ball.castShadow = true; this.scene.add(this.ball);
    this.ballLight = new THREE.PointLight(0xbde9ff, 3, 2); this.scene.add(this.ballLight);
    this.portalMeshes = { 1: this.makePortal(0x0077ff), 2: this.makePortal(0xffaa00) };
    this.deliveryPortal = this.makePortal(0x0077ff, .54); this.deliveryPortal.rotation.x = Math.PI/2; this.deliveryPortal.position.set(0, 1.5, -3.18);this.deliveryPortal.children[1].material.transparent=false;this.deliveryPortal.children[1].material.opacity=1;this.deliveryPortal.children[1].material.blending=THREE.NormalBlending;this.deliveryPortal.visible = false;
    this.deliveryMechanism=this.buildDeliveryMechanism();
    this.flyingBrick = this.makeBrick({ color: BRICK.black, width: C.brickWidth, depth: C.brickDepth }); this.flyingBrick.visible = false;
  }

  buildChamber() {
    const panelMaterial = new THREE.MeshStandardMaterial({ map:this.panelTexture("panel"),color:0xd5d7d1, roughness:.74, metalness:.06 });
    const warningMaterial = new THREE.MeshStandardMaterial({ map:this.panelTexture("warning"),color:0xffffff,roughness:.68,metalness:.05 });
    const numberedMaterial = new THREE.MeshStandardMaterial({ map:this.panelTexture("number"),color:0xffffff,roughness:.7,metalness:.05 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color:0x171d1f, roughness:.58, metalness:.5 });
    const panel = (x,y,z,w,h,rot=0,material=panelMaterial) => { const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,.08),material);mesh.position.set(x,y,z);mesh.rotation.y=rot;mesh.receiveShadow=true;this.scene.add(mesh);return mesh };
    for(let col=-4;col<=4;col++) for(let row=0;row<3;row++){const n=col+row;panel(col*1.08,row*.86+.35,-3.25,1,.78,0,n===4?warningMaterial:n===-3?numberedMaterial:n%5===0?darkMaterial:panelMaterial)}
    for(const side of[-1,1]) for(let col=0;col<6;col++) for(let row=0;row<3;row++){const n=col+row;panel(side*4.48,row*.86+.35,-2.7+col*1.08,1,.78,side*Math.PI/2,n===5?warningMaterial:n%6===0?darkMaterial:panelMaterial)}
    this.chamberStrips=[];this.chamberGlows=[];
    for(const x of[-2.7,0,2.7]){const strip=new THREE.Mesh(new THREE.BoxGeometry(1.35,.035,.035),new THREE.MeshBasicMaterial({color:0xd9f5ff}));strip.position.set(x,3.05,-2.7);this.scene.add(strip);const glow=new THREE.PointLight(0xc8efff,4,5);glow.position.set(x,2.7,-2.3);this.scene.add(glow);this.chamberStrips.push(strip);this.chamberGlows.push(glow)}
    const dustGeometry=new THREE.BufferGeometry(),dust=[];for(let i=0;i<180;i++)dust.push((Math.random()-.5)*10,Math.random()*4,(Math.random()-.5)*8);dustGeometry.setAttribute("position",new THREE.Float32BufferAttribute(dust,3));this.dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:0xcfe8e8,size:.018,transparent:true,opacity:.24,depthWrite:false}));this.scene.add(this.dust);
    this.buildPipes();this.buildShowLights();
  }

  panelTexture(kind){const canvas=document.createElement("canvas");canvas.width=256;canvas.height=192;const g=canvas.getContext("2d");g.fillStyle="#c7cbc5";g.fillRect(0,0,256,192);const gradient=g.createLinearGradient(0,0,256,192);gradient.addColorStop(0,"rgba(255,255,255,.2)");gradient.addColorStop(1,"rgba(50,58,55,.18)");g.fillStyle=gradient;g.fillRect(0,0,256,192);for(let i=0;i<90;i++){g.fillStyle=`rgba(35,45,42,${Math.random()*.045})`;g.fillRect(Math.random()*256,Math.random()*192,Math.random()*16+2,Math.random()*3+1)}g.strokeStyle="rgba(30,38,36,.28)";g.lineWidth=3;g.strokeRect(4,4,248,184);for(const[x,y]of[[12,12],[244,12],[12,180],[244,180]]){g.fillStyle="#565e5a";g.beginPath();g.arc(x,y,3,0,Math.PI*2);g.fill()}if(kind==="warning"){g.fillStyle="#e5ae24";g.fillRect(24,64,208,54);g.fillStyle="#171a18";g.font="bold 22px sans-serif";g.textAlign="center";g.fillText("CAUTION",128,98);for(let x=24;x<232;x+=24){g.beginPath();g.moveTo(x,118);g.lineTo(x+12,118);g.lineTo(x+24,132);g.lineTo(x+12,132);g.closePath();g.fill()}}if(kind==="number"){g.fillStyle="#444b48";g.font="bold 42px monospace";g.fillText("07",24,58);g.font="13px monospace";g.fillText("TEST ELEMENT",24,78)}const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture}
  buildPipes(){const metal=new THREE.MeshStandardMaterial({color:0x343d3e,metalness:.82,roughness:.3}),rust=new THREE.MeshStandardMaterial({color:0x875f37,metalness:.45,roughness:.65});for(const[x,color]of[[-4.18,metal],[4.2,rust]]){const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,5.6,12),color);pipe.rotation.x=Math.PI/2;pipe.position.set(x,2,-.25);this.scene.add(pipe);for(const z of[-2,-.2,1.6]){const collar=new THREE.Mesh(new THREE.TorusGeometry(.1,.025,8,16),metal);collar.rotation.x=Math.PI/2;collar.position.set(x,2,z);this.scene.add(collar)}}}
  buildShowLights(){this.showLights=[];for(const side of[-1,1]){const spot=new THREE.SpotLight(side<0?0x168cff:0xff9b1a,0,18,Math.PI/7,.55,1.4);spot.position.set(side*3.4,3.4,2.4);spot.target.position.set(side*.8,0,0);this.scene.add(spot,spot.target);const head=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,.32,12),new THREE.MeshStandardMaterial({color:0x15191a,metalness:.8,roughness:.25}));head.rotation.x=Math.PI/2;head.position.copy(spot.position);this.scene.add(head);this.showLights.push(spot)}}
  buildDeliveryMechanism(){const group=new THREE.Group();group.position.set(0,1.5,-3.15);const metal=new THREE.MeshStandardMaterial({color:0x242b2d,metalness:.9,roughness:.24}),edge=new THREE.MeshStandardMaterial({color:0x758083,metalness:.82,roughness:.2});const frame=new THREE.Mesh(new THREE.TorusGeometry(.78,.1,12,48),metal);group.add(frame);group.userData.blades=[];for(let i=0;i<8;i++){const pivot=new THREE.Group();pivot.rotation.z=i*Math.PI/4;const blade=new THREE.Mesh(new THREE.BoxGeometry(.42,.13,.09),edge);blade.position.x=.42;pivot.add(blade);group.add(pivot);group.userData.blades.push(pivot)}group.userData.doors=[];for(const side of[-1,1]){const door=new THREE.Mesh(new THREE.BoxGeometry(.54,1.28,.12),metal);door.position.x=side*.31;group.add(door);group.userData.doors.push({mesh:door,side});const piston=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.78,10),edge);piston.rotation.z=Math.PI/2;piston.position.x=side*.9;group.add(piston)}group.visible=false;this.scene.add(group);return group}

  makePortal(color, radius = C.portalRadius) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * .22, 16, 56), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 5, metalness: .12, roughness: .18 })); ring.rotation.x = Math.PI / 2; group.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(radius * .78, 48), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.7, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false })); core.rotation.x = Math.PI / 2; core.position.y = -.003; group.add(core);
    const darkCore = new THREE.Mesh(new THREE.CircleGeometry(radius * .48, 40), new THREE.MeshBasicMaterial({ color:0x010203, side:THREE.DoubleSide }));darkCore.rotation.x=Math.PI/2;darkCore.position.y=-.006;group.add(darkCore);const glow=new THREE.PointLight(color,radius>.3?14:5,radius>.3?5:2);glow.position.y=.16;group.add(glow);this.scene.add(group); return group;
  }

  makeBrick(data) {
    const color = data.color ?? BRICK[data.type] ?? BRICK.green;
    const geometry=new THREE.BoxGeometry(data.width*.86,.22,data.depth*.88);const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: data.type === "black" ? .08 : .38, metalness: .62, roughness: .28 }));mesh.castShadow=mesh.receiveShadow=true;const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x111416,transparent:true,opacity:.7}));mesh.add(edges);this.scene.add(mesh);return mesh;
  }

  update(snapshot) { const old=this.current;this.previous=old||snapshot;this.current=snapshot;this.receivedAt=performance.now();this.syncBricks(snapshot.bricks);const newMatch=snapshot.score[1]===0&&snapshot.score[2]===0,enteredCountdown=(!old||old.state!=="countdown")&&snapshot.state==="countdown";if(enteredCountdown&&newMatch)this.startIntro();else if(this.intro&&(!newMatch||["waiting","disconnected"].includes(snapshot.state)))this.resetCamera();else if(!old&&snapshot.state!=="countdown")this.resetCamera();if(old)this.detectCues(old,snapshot);this.matchPoint=Math.max(snapshot.score[1],snapshot.score[2])===9&&!snapshot.state.startsWith("won"); }

  startIntro(){clearTimeout(this.introTimer);const token=Symbol("intro");this.intro={started:performance.now(),duration:4800,token};this.introTimer=setTimeout(()=>{if(this.intro?.token===token)this.resetCamera()},5200);this.camera.position.set(0,.48,1.65);this.keyLight.intensity=.05;this.rimLight.intensity=0;for(const light of this.showLights)light.intensity=0}

  resetCamera(){clearTimeout(this.introTimer);this.introTimer=null;this.intro=null;this.camera.position.copy(this.cameraHome);this.camera.up.set(0,1,0);this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld(true);this.keyLight.intensity=3.8;this.rimLight.intensity=13;for(const light of this.showLights)light.intensity=0}

  detectCues(old,next) {
    if(old.state==="countdown"&&next.countdown!==old.countdown)this.cue(next.countdown?"countdown":"start");
    if(next.score[1]+next.score[2]>old.score[1]+old.score[2])this.cue("score",next.ball.x,next.ball.y,0xffffff);
    if(next.bricks.length<old.bricks.length)this.cue("brick",next.ball.x,next.ball.y,0x8dff92);
    if((next.shrink[1]>old.shrink[1])||(next.shrink[2]>old.shrink[2]))this.cue("power",next.ball.x,next.ball.y,0xc54cff);
    if(Math.abs(next.ball.x-old.ball.x)>1.2)this.cue("portal",next.ball.x,next.ball.y,next.ball.x<0?0x168cff:0xffa51b);
    if(Math.sign(next.ball.vx)!==Math.sign(old.ball.vx)&&Math.abs(next.ball.x)>3.2)this.cue("paddle",next.ball.x,next.ball.y,next.ball.x<0?0x15d9ff:0xff2b8a);
    const bounced=Math.sign(next.ball.vx)!==Math.sign(old.ball.vx)||Math.sign(next.ball.vy)!==Math.sign(old.ball.vy),blackHit=bounced&&old.bricks.find(brick=>brick.type==="black"&&Math.abs(next.ball.x-brick.x)<.42&&Math.abs(next.ball.y-brick.y)<.58);if(blackHit)this.cue("black",next.ball.x,next.ball.y,0x303030);
    if(old.state==="serving_paused"&&next.state==="playing")this.cue("start",next.ball.x,next.ball.y,0xffffff);
    if(Math.max(old.score[1],old.score[2])<9&&Math.max(next.score[1],next.score[2])===9)this.cue("matchpoint",0,0,next.score[1]===9?0x15d9ff:0xff2b8a);
    if(next.delivery.active&&!old.delivery.active)this.cue("machinery",0,-2.5,next.delivery.color);
    if(old.delivery.phase==="growing"&&next.delivery.phase==="flying")this.cue("launch",0,-2.5,next.delivery.color);
    if(old.delivery.phase==="flying"&&next.delivery.phase==="closing")this.cue("land",old.delivery.flying?.targetX||0,old.delivery.flying?.targetZ||0,0x333333);
  }

  cue(name,x=0,z=0,color=0xffffff){this.onCue?.(name);if(["brick","portal","paddle","power"].includes(name))this.burst(x,z,color,name==="portal"?28:12)}
  burst(x,z,color,count){const geometry=new THREE.BufferGeometry(),positions=new Float32Array(count*3),velocities=[];for(let i=0;i<count;i++){positions[i*3]=x;positions[i*3+1]=.14;positions[i*3+2]=z;velocities.push(new THREE.Vector3((Math.random()-.5)*.045,Math.random()*.045+.012,(Math.random()-.5)*.045))}geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));const points=new THREE.Points(geometry,new THREE.PointsMaterial({color,size:.045,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));this.scene.add(points);this.effects.push({points,velocities,life:1})}

  syncBricks(data) {
    const seen = new Set();
    for (const brick of data) {
      seen.add(brick.id); let mesh = this.bricks.get(brick.id);
      if (!mesh) { mesh = this.makeBrick(brick); this.bricks.set(brick.id, mesh); }
      mesh.position.set(brick.x, .11, brick.y);
      if (mesh.material.color.getHex() !== brick.color) { mesh.material.color.setHex(brick.color); mesh.material.emissive.setHex(brick.color); }
    }
    for (const [id, mesh] of this.bricks) if (!seen.has(id)) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); this.bricks.delete(id); }
  }

  animate() {
    requestAnimationFrame(() => this.animate()); if (!this.current) return;
    const alpha = Math.min(1, (performance.now() - this.receivedAt) / SNAPSHOT_MS), a = this.previous, b = this.current;
    const lerp = (x, y) => THREE.MathUtils.lerp(x ?? y, y, alpha);
    for (const slot of [1, 2]) { const mesh = this.paddles[slot - 1]; mesh.position.z = lerp(a.paddleY[slot], b.paddleY[slot]); mesh.scale.z = b.shrink[slot] > 0 ? C.shrinkFactor : 1; }
    this.ball.position.set(lerp(a.ball.x, b.ball.x), C.ballRadius, lerp(a.ball.y, b.ball.y)); this.ballLight.position.copy(this.ball.position).y += .15;
    for (const slot of [1, 2]) { const p = b.portals[slot], old = a.portals[slot] || p,portal=this.portalMeshes[slot]; portal.position.set(lerp(old.x, p.x), .12, lerp(old.y, p.y)); portal.rotation.y += .006 * (slot === 1 ? 1 : -1);portal.children[1].material.opacity=.24+Math.sin(performance.now()*.006+slot)*.1; }
    const d = b.delivery; this.deliveryPortal.visible = Boolean(d.active);this.deliveryMechanism.visible=Boolean(d.active); if (d.active) { this.deliveryPortal.children[0].material.color.setHex(d.color); this.deliveryPortal.children[0].material.emissive.setHex(d.color); const raw = d.phase === "growing" ? Math.min(1, d.phaseMs / 2000) : d.phase === "closing" ? Math.max(0, 1 - d.phaseMs / 1200) : 1; const grow = raw * raw * (3 - 2 * raw); this.deliveryPortal.scale.setScalar(Math.max(.001,grow));this.animateDeliveryMechanism(d,grow); }
    this.flyingBrick.visible = Boolean(d.flying); if (d.flying) this.flyingBrick.position.set(d.flying.x, d.flying.y, d.flying.z);
    this.dust.rotation.y+=.00008;this.animateIntro();this.animateMatchPoint();
    for(let i=this.effects.length-1;i>=0;i--){const fx=this.effects[i],positions=fx.points.geometry.attributes.position;fx.life-=.045;for(let p=0;p<fx.velocities.length;p++){positions.array[p*3]+=fx.velocities[p].x;positions.array[p*3+1]+=fx.velocities[p].y;positions.array[p*3+2]+=fx.velocities[p].z;fx.velocities[p].y-=.0015}positions.needsUpdate=true;fx.points.material.opacity=Math.max(0,fx.life);if(fx.life<=0){this.scene.remove(fx.points);fx.points.geometry.dispose();fx.points.material.dispose();this.effects.splice(i,1)}}
    this.renderer.render(this.scene, this.camera);
  }
  animateIntro(){if(!this.intro)return;const raw=Math.min(1,(performance.now()-this.intro.started)/this.intro.duration),ease=raw<.5?4*raw*raw*raw:1-Math.pow(-2*raw+2,3)/2;this.camera.position.lerpVectors(new THREE.Vector3(0,.48,1.65),this.cameraHome,ease);this.camera.lookAt(0,THREE.MathUtils.lerp(.45,0,ease),0);const lights=Math.max(0,Math.min(1,(raw-.12)/.58));this.keyLight.intensity=3.8*lights;this.rimLight.intensity=13*lights;for(let i=0;i<this.showLights.length;i++){const light=this.showLights[i];light.intensity=raw<.82?22*Math.sin(Math.min(1,raw/.82)*Math.PI):0;light.target.position.x=Math.sin(raw*Math.PI*4+i*Math.PI)*2.6;light.target.position.z=Math.cos(raw*Math.PI*3+i)*1.6}if(raw>=1)this.resetCamera()}
  animateDeliveryMechanism(d,openness){const open=d.phase==="growing"?openness:d.phase==="closing"?openness:1;this.deliveryMechanism.rotation.z+=d.phase==="flying"?.018:.006;for(const pivot of this.deliveryMechanism.userData.blades)pivot.children[0].position.x=.18+open*.43;for(const door of this.deliveryMechanism.userData.doors)door.mesh.position.x=door.side*(.28+open*.55)}
  animateMatchPoint(){if(this.intro)return;const active=this.matchPoint,t=performance.now()*.0045,pulse=.5+.5*Math.sin(t*2.4),leader=this.current?.score[1]===9?0x15d9ff:0xff2b8a,other=this.current?.score[1]===9?0xff2b8a:0x15d9ff;if(active){for(let i=0;i<this.showLights.length;i++){const light=this.showLights[i];light.color.setHex((Math.floor(t)+i)%2?leader:other);light.intensity=12+16*pulse;light.target.position.x=Math.sin(t*1.7+i*Math.PI)*3;light.target.position.z=Math.cos(t*1.3+i)*2}for(let i=0;i<this.chamberStrips.length;i++){const color=(Math.floor(t*1.4)+i)%2?leader:other;this.chamberStrips[i].material.color.setHex(color);this.chamberGlows[i].color.setHex(color);this.chamberGlows[i].intensity=5+7*pulse}}else{for(const light of this.showLights)light.intensity=0;for(let i=0;i<this.chamberStrips.length;i++){this.chamberStrips[i].material.color.setHex(0xd9f5ff);this.chamberGlows[i].color.setHex(0xc8efff);this.chamberGlows[i].intensity=4}}}
  resize() { const box = this.host.getBoundingClientRect(); this.renderer.setSize(box.width, box.height, false); this.camera.aspect = box.width / box.height; this.camera.updateProjectionMatrix(); }
}
