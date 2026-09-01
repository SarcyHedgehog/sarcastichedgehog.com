(() => {
  'use strict';

  const canvas = document.getElementById('editor-canvas');
  const ctx = canvas.getContext('2d');
  const picker = document.getElementById('level-picker');
  const statusEl = document.getElementById('editor-status');
  const pointerEl = document.getElementById('pointer-position');
  const dialog = document.getElementById('json-dialog');
  const jsonText = document.getElementById('json-text');
  const geometry = window.HareTortoiseGeometry;
  const sourceWorlds = window.HareTortoiseWorlds;
  let sourceWorld = sourceWorlds[0];
  const DRAFT_KEY = 'hare-and-tortoise:level-editor:v1';
  const clone = value => JSON.parse(JSON.stringify(value));

  let world = clone(sourceWorld);
  world.number ||= 1;
  let currentSourceWorldIndex = 0;
  let currentSourceIndex = 0;
  let level = prepareLevel(sourceWorld.levels[0]);
  let tool = 'select';
  let selected = null;
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  const imageCache = new Map();

  const ids = [
    'world-number','world-id','world-name','world-subtitle','world-theme','background-image',
    'level-number','level-revision','level-id','level-name','level-description',
    'hare-par','hare-one','hare-two','hare-three','tortoise-par','tortoise-one','tortoise-two','tortoise-three',
    'carrot-seconds','inventory-platform','inventory-ramp','inventory-spring','inventory-pipe'
  ];

  function normaliseStarter(starter) {
    if (Array.isArray(starter)) return starter;
    if (Array.isArray(starter?.shared)) return starter.shared;
    return starter?.hare?.length ? starter.hare : (starter?.tortoise || []);
  }

  function prepareLevel(value) {
    const entry = clone(value);
    entry.revision ||= 1;
    entry.number ||= 1;
    entry.background ||= { type: 'preset', preset: world?.theme || sourceWorld.theme || 'meadow', image: '' };
    entry.goal ||= { x: 1020, y: 500, radius: 34 };
    entry.goal.radius ||= 34;
    entry.launcher ||= { x: 92, y: 270, vx: 290, vy: -52 };
    entry.carrots ||= [];
    entry.goldenHedgehog ??= null;
    entry.fixedObjects ||= [];
    entry.starter = normaliseStarter(entry.starter);
    entry.scoring ||= {};
    entry.scoring.hare ||= { par: 12, stars: { one: 12, two: 8, three: 5 } };
    entry.scoring.tortoise ||= { par: 10, stars: { one: 10, two: 15, three: 22 } };
    entry.scoring.carrotClockEffectSeconds ??= 1;
    if (!entry.availablePieces) {
      entry.availablePieces = {};
      for (const type of ['platform','ramp','spring','pipe']) {
        const placed = entry.starter.filter(piece => piece.type === type).length;
        entry.availablePieces[type] = Math.max(0, (entry.inventory?.[type] || 0) - placed);
      }
    }
    return entry;
  }

  function number(id, fallback = 0) {
    const value = Number(document.getElementById(id).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function fillPicker() {
    picker.innerHTML = '';
    sourceWorlds.forEach((candidateWorld, worldIndex) => {
      const group = document.createElement('optgroup');
      group.label = `${candidateWorld.number || worldIndex + 1} · ${candidateWorld.name}`;
      candidateWorld.levels.forEach((entry, index) => {
        const option = document.createElement('option');
        option.value = `${worldIndex}:${index}`;
        option.textContent = `${candidateWorld.number || worldIndex + 1}.${entry.number || index + 1} · ${entry.name}`;
        group.append(option);
      });
      picker.append(group);
    });
    picker.value = `${currentSourceWorldIndex}:${Math.min(currentSourceIndex, sourceWorld.levels.length - 1)}`;
  }

  function writeForm() {
    const values = {
      'world-number': world.number || 1, 'world-id': world.id, 'world-name': world.name,
      'world-subtitle': world.subtitle || '',
      'world-theme': level.background?.type === 'image' ? 'image' : (level.background?.preset || world.theme || 'meadow'),
      'background-image': level.background?.image || '', 'level-number': level.number, 'level-revision': level.revision,
      'level-id': level.id, 'level-name': level.name, 'level-description': level.description || '',
      'hare-par': level.scoring.hare.par, 'hare-one': level.scoring.hare.stars.one,
      'hare-two': level.scoring.hare.stars.two, 'hare-three': level.scoring.hare.stars.three,
      'tortoise-par': level.scoring.tortoise.par, 'tortoise-one': level.scoring.tortoise.stars.one,
      'tortoise-two': level.scoring.tortoise.stars.two, 'tortoise-three': level.scoring.tortoise.stars.three,
      'carrot-seconds': level.scoring.carrotClockEffectSeconds,
      'inventory-platform': level.availablePieces.platform || 0, 'inventory-ramp': level.availablePieces.ramp || 0,
      'inventory-spring': level.availablePieces.spring || 0, 'inventory-pipe': level.availablePieces.pipe || 0
    };
    for (const [id, value] of Object.entries(values)) document.getElementById(id).value = value ?? '';
  }

  function readForm() {
    world.number = number('world-number', 1);
    world.id = document.getElementById('world-id').value.trim();
    world.name = document.getElementById('world-name').value.trim();
    world.subtitle = document.getElementById('world-subtitle').value.trim();
    const backgroundChoice = document.getElementById('world-theme').value;
    world.theme = backgroundChoice === 'image' ? (world.theme || 'meadow') : backgroundChoice;
    level.background = backgroundChoice === 'image'
      ? { type: 'image', image: document.getElementById('background-image').value.trim(), fallback: world.theme || 'meadow' }
      : { type: 'preset', preset: backgroundChoice, image: '' };
    level.number = number('level-number', 1);
    level.revision = number('level-revision', 1);
    level.id = document.getElementById('level-id').value.trim();
    level.name = document.getElementById('level-name').value.trim();
    level.description = document.getElementById('level-description').value.trim();
    level.scoring.hare = { par:number('hare-par'), stars:{ one:number('hare-one'), two:number('hare-two'), three:number('hare-three') } };
    level.scoring.tortoise = { par:number('tortoise-par'), stars:{ one:number('tortoise-one'), two:number('tortoise-two'), three:number('tortoise-three') } };
    level.scoring.carrotClockEffectSeconds = number('carrot-seconds', 1);
    level.availablePieces = Object.fromEntries(['platform','ramp','spring','pipe'].map(type => [type, number(`inventory-${type}`)]));
    draw();
  }

  function editorPackage() {
    readForm();
    const exportedLevel = clone(level);
    delete exportedLevel.inventory;
    return {
      format: 'hare-and-tortoise-level',
      version: 2,
      world: { number:world.number, id:world.id, name:world.name, subtitle:world.subtitle || '', theme:world.theme || 'meadow' },
      level: exportedLevel
    };
  }

  function loadEntry(entry, index = -1) {
    level = prepareLevel(entry);
    if (index >= 0) currentSourceIndex = index;
    selected = null;
    writeForm();
    updateSelectionPanel();
    updateObjectList();
    draw();
  }

  function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    return { x:(event.clientX-rect.left)*canvas.width/rect.width, y:(event.clientY-rect.top)*canvas.height/rect.height };
  }

  function clampPoint(point) {
    return { x:Math.round(Math.max(20,Math.min(1080,point.x))), y:Math.round(Math.max(42,Math.min(560,point.y))) };
  }

  function selectedObject() {
    if (!selected) return null;
    if (selected.kind === 'goal' || selected.kind === 'launcher') return level[selected.kind];
    if (selected.kind === 'hedgehog') return level.goldenHedgehog;
    if (selected.kind === 'carrot') return level.carrots[selected.index];
    if (selected.kind === 'fixed') return level.fixedObjects[selected.index];
    if (selected.kind === 'starter') return level.starter[selected.index];
    return null;
  }

  function selectionLabel(ref = selected) {
    if (!ref) return '';
    const object = ref === selected ? selectedObject() : null;
    if (ref.kind === 'goal') return 'Goal';
    if (ref.kind === 'launcher') return 'Drop-off launcher';
    if (ref.kind === 'hedgehog') return 'Golden Hedgehog';
    if (ref.kind === 'carrot') return `Carrot ${ref.index + 1}`;
    if (ref.kind === 'fixed') return `${object?.type === 'blackhole' ? 'Black hole' : (object?.type || 'Fixed item')} ${ref.index + 1}`;
    if (ref.kind === 'starter') return `Starting ${object?.type || 'piece'} ${ref.index + 1}`;
    return 'Item';
  }

  function select(ref) {
    selected = ref;
    tool = 'select';
    document.querySelectorAll('#palette button').forEach(button => button.classList.toggle('active', button.dataset.tool === 'select'));
    updateSelectionPanel();
    updateObjectList();
    draw();
  }

  function updateSelectionPanel() {
    const object = selectedObject();
    const fields = document.getElementById('selection-fields');
    document.getElementById('selection-empty').classList.toggle('hidden', Boolean(object));
    fields.classList.toggle('hidden', !object);
    document.getElementById('delete-selected').disabled = !object || ['goal','launcher'].includes(selected?.kind);
    if (!object) return;
    document.getElementById('selection-title').textContent = selectionLabel();
    document.getElementById('selected-x').value = Math.round(object.x);
    document.getElementById('selected-y').value = Math.round(object.y);
    const fixed = selected.kind === 'fixed';
    const blackHole = fixed && object.type === 'blackhole';
    const starter = selected.kind === 'starter';
    const launcher = selected.kind === 'launcher';
    document.getElementById('width-field').classList.toggle('hidden', !fixed || blackHole);
    document.getElementById('height-field').classList.toggle('hidden', !fixed || blackHole);
    document.getElementById('radius-field').classList.toggle('hidden', !blackHole);
    document.getElementById('angle-field').classList.toggle('hidden', !starter);
    document.getElementById('vx-field').classList.toggle('hidden', !launcher);
    document.getElementById('vy-field').classList.toggle('hidden', !launcher);
    document.getElementById('colour-field').classList.toggle('hidden', !(fixed && object.type === 'block'));
    document.getElementById('rotate-selected').classList.toggle('hidden', !starter);
    if (fixed && !blackHole) { document.getElementById('selected-width').value = object.width; document.getElementById('selected-height').value = object.height; }
    if (blackHole) document.getElementById('selected-radius').value = object.radius || 23;
    if (starter) document.getElementById('selected-angle').value = Math.round((object.angle || 0) * 180 / Math.PI);
    if (launcher) { document.getElementById('selected-vx').value = object.vx; document.getElementById('selected-vy').value = object.vy; }
    if (fixed && object.type === 'block') document.getElementById('selected-colour').value = object.color || '#4f8f45';
  }

  function applySelectionFields() {
    const object = selectedObject();
    if (!object) return;
    object.x = number('selected-x', object.x); object.y = number('selected-y', object.y);
    if (selected.kind === 'fixed' && object.type !== 'blackhole') { object.width = number('selected-width', object.width); object.height = number('selected-height', object.height); }
    if (selected.kind === 'fixed' && object.type === 'blackhole') object.radius = Math.max(10, number('selected-radius', object.radius || 23));
    if (selected.kind === 'starter') {
      object.angle = number('selected-angle', 0) * Math.PI / 180;
      Object.assign(object, geometry.clampPiece(object));
    }
    if (selected.kind === 'launcher') { object.vx = number('selected-vx', object.vx); object.vy = number('selected-vy', object.vy); }
    if (selected.kind === 'fixed' && object.type === 'block') object.color = document.getElementById('selected-colour').value;
    updateObjectList(); draw();
  }

  function addAt(type, rawPoint) {
    const point = clampPoint(rawPoint);
    if (type === 'goal' || type === 'launcher') {
      Object.assign(level[type], point);
      select({ kind:type });
      return;
    }
    if (type === 'hedgehog') {
      level.goldenHedgehog = point;
      select({ kind:'hedgehog' });
      return;
    }
    if (type === 'carrot') {
      level.carrots.push(point);
      select({ kind:'carrot', index:level.carrots.length-1 });
      return;
    }
    if (type === 'crate' || type === 'block' || type === 'blackhole') {
      level.fixedObjects.push(type === 'crate'
        ? { type, ...point, width:80, height:78 }
        : type === 'blackhole'
          ? { type, ...point, radius:23 }
          : { type, ...point, width:128, height:128, color:'#4f8f45' });
      select({ kind:'fixed', index:level.fixedObjects.length-1 });
      return;
    }
    const piece = { type, ...point, angle:0 };
    Object.assign(piece, geometry.clampPiece(piece));
    level.starter.push(piece);
    select({ kind:'starter', index:level.starter.length-1 });
  }

  function pointSegmentDistance(point, a, b) {
    const vx=b.x-a.x, vy=b.y-a.y, length=vx*vx+vy*vy;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*vx+(point.y-a.y)*vy)/length));
    return Math.hypot(point.x-(a.x+t*vx),point.y-(a.y+t*vy));
  }

  function hitTest(point) {
    for (let i=level.starter.length-1;i>=0;i--) {
      const piece=level.starter[i], length=piece.type==='platform'?155:piece.type==='ramp'?130:piece.type==='pipe'?124:105;
      if (Math.hypot(point.x-piece.x,point.y-piece.y) < (piece.type==='pipe'?72:18) || pointSegmentDistance(point,
        {x:piece.x-Math.cos(piece.angle)*length/2,y:piece.y-Math.sin(piece.angle)*length/2},
        {x:piece.x+Math.cos(piece.angle)*length/2,y:piece.y+Math.sin(piece.angle)*length/2}) < 18) return {kind:'starter',index:i};
    }
    for (let i=level.fixedObjects.length-1;i>=0;i--) {
      const item=level.fixedObjects[i];
      if (item.type === 'blackhole' && Math.hypot(point.x-item.x,point.y-item.y) <= (item.radius || 23) + 12) return {kind:'fixed',index:i};
      if (Math.abs(point.x-item.x)<=item.width/2 && Math.abs(point.y-item.y)<=item.height/2) return {kind:'fixed',index:i};
    }
    for (let i=level.carrots.length-1;i>=0;i--) if (Math.hypot(point.x-level.carrots[i].x,point.y-level.carrots[i].y)<28) return {kind:'carrot',index:i};
    if (level.goldenHedgehog && Math.hypot(point.x-level.goldenHedgehog.x,point.y-level.goldenHedgehog.y)<30) return {kind:'hedgehog'};
    if (Math.hypot(point.x-level.goal.x,point.y-level.goal.y)<42) return {kind:'goal'};
    if (Math.hypot(point.x-level.launcher.x,point.y-level.launcher.y)<55) return {kind:'launcher'};
    return null;
  }

  function deleteSelection() {
    if (!selected || ['goal','launcher'].includes(selected.kind)) return;
    if (selected.kind === 'hedgehog') level.goldenHedgehog = null;
    if (selected.kind === 'carrot') level.carrots.splice(selected.index,1);
    if (selected.kind === 'fixed') level.fixedObjects.splice(selected.index,1);
    if (selected.kind === 'starter') level.starter.splice(selected.index,1);
    selected=null; updateSelectionPanel(); updateObjectList(); draw();
  }

  function updateObjectList() {
    const list=document.getElementById('object-list'); list.innerHTML='';
    const refs=[{kind:'launcher'},{kind:'goal'},...level.carrots.map((_,index)=>({kind:'carrot',index}))];
    if (level.goldenHedgehog) refs.push({kind:'hedgehog'});
    refs.push(...level.fixedObjects.map((_,index)=>({kind:'fixed',index})),...level.starter.map((_,index)=>({kind:'starter',index})));
    for (const ref of refs) {
      const current=selected; selected=ref; const object=selectedObject(); const label=selectionLabel(); selected=current;
      const button=document.createElement('button');
      button.classList.toggle('selected', current && current.kind===ref.kind && current.index===ref.index);
      button.innerHTML=`<span>${label}</span><small>${Math.round(object.x)}, ${Math.round(object.y)}</small>`;
      button.addEventListener('click',()=>select(ref)); list.append(button);
    }
  }

  function drawSpaceBackground() {
    const sky=ctx.createLinearGradient(0,0,0,620);sky.addColorStop(0,'#010106');sky.addColorStop(.62,'#070b20');sky.addColorStop(1,'#11162c');ctx.fillStyle=sky;ctx.fillRect(0,0,1100,620);
    const nebula=ctx.createRadialGradient(800,250,20,800,250,390);nebula.addColorStop(0,'rgba(87,55,155,.20)');nebula.addColorStop(.45,'rgba(34,80,142,.10)');nebula.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=nebula;ctx.fillRect(0,0,1100,560);
    for(let i=0;i<150;i++){const x=(i*173+47)%1094,y=45+((i*97+31)%505),radius=i%19===0?2.1:i%7===0?1.35:.75;ctx.fillStyle=i%13===0?'#b8d8ff':i%17===0?'#ffe7aa':'rgba(255,255,255,.86)';ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#090d1d';ctx.fillRect(0,560,1100,60);
  }

  function drawBackground() {
    const bg=level.background || {type:'preset',preset:'meadow'};
    const preset=bg.type==='preset'?(bg.preset||world.theme||'meadow'):(bg.fallback||world.theme||'meadow');
    if (bg.type==='image' && bg.image) {
      let image=imageCache.get(bg.image);
      if (!image) { image=new Image(); image.onload=draw; image.src=bg.image; imageCache.set(bg.image,image); }
      if (image.complete && image.naturalWidth) { ctx.drawImage(image,0,0,1100,620); drawGridAndRoof(preset); return; }
    }
    if(preset==='space'){drawSpaceBackground();drawGridAndRoof('space');return;}
    const sky=ctx.createLinearGradient(0,0,0,560); sky.addColorStop(0,'#a8d9dd'); sky.addColorStop(.68,'#d9ebc7'); sky.addColorStop(1,'#8fc071');
    ctx.fillStyle=sky; ctx.fillRect(0,0,1100,620); ctx.fillStyle='rgba(255,249,225,.7)';
    for (const cloud of [[150,100,1],[520,74,.75],[880,135,1.15]]) { ctx.beginPath(); ctx.arc(cloud[0],cloud[1],30*cloud[2],0,Math.PI*2); ctx.arc(cloud[0]+35*cloud[2],cloud[1]-12,42*cloud[2],0,Math.PI*2); ctx.arc(cloud[0]+78*cloud[2],cloud[1],28*cloud[2],0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle='#76aa64'; ctx.beginPath(); ctx.moveTo(0,470); ctx.quadraticCurveTo(180,360,350,470); ctx.quadraticCurveTo(540,340,720,470); ctx.quadraticCurveTo(920,345,1100,455); ctx.lineTo(1100,620); ctx.lineTo(0,620); ctx.fill();
    ctx.fillStyle='#426f4d'; ctx.fillRect(0,560,1100,60); drawGridAndRoof('meadow');
  }

  function drawGridAndRoof(theme='meadow') {
    ctx.strokeStyle=theme==='space'?'rgba(151,186,255,.10)':'rgba(27,69,62,.14)'; ctx.lineWidth=1;
    for(let x=25;x<1100;x+=50){ctx.beginPath();ctx.moveTo(x,80);ctx.lineTo(x,560);ctx.stroke();}
    for(let y=90;y<560;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1100,y);ctx.stroke();}
    ctx.fillStyle=theme==='space'?'#111a36':'#173f3b';ctx.fillRect(0,8,1100,27);ctx.fillStyle=theme==='space'?'#86b9ff':'#f3ca52';
    for(let x=34;x<1100;x+=86){ctx.beginPath();ctx.arc(x,21,3,0,Math.PI*2);ctx.fill();}
  }

  function drawFixed(item) {
    if(item.type==='blackhole'){
      const radius=Math.max(10,item.radius||23), turn=performance.now()/1000;
      ctx.save();ctx.translate(item.x,item.y);ctx.shadowColor='rgba(35,5,74,.75)';ctx.shadowBlur=15;
      const halo=ctx.createRadialGradient(0,0,radius*.3,0,0,radius+4);halo.addColorStop(0,'#000');halo.addColorStop(.52,'#05020a');halo.addColorStop(.7,'#542070');halo.addColorStop(.86,'#d36a28');halo.addColorStop(1,'rgba(28,10,55,0)');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,radius+4,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';ctx.rotate(turn*1.8);
      for(const [ring,colour,start] of [[radius+2,'#f19b38',.2],[radius-2,'#b14dcc',2.35],[radius-6,'#62c9dc',4.25]]){ctx.strokeStyle=colour;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,ring,start,start+Math.PI*1.15);ctx.stroke();}
      ctx.fillStyle='#000';ctx.beginPath();ctx.arc(0,0,radius*.72,0,Math.PI*2);ctx.fill();ctx.restore();return;
    }
    const left=item.x-item.width/2, top=item.y-item.height/2;
    ctx.save();ctx.lineWidth=7;ctx.strokeStyle=item.type==='crate'?'#543b28':'#255c39';ctx.fillStyle=item.type==='crate'?'#9b6538':(item.color||'#4f8f45');ctx.beginPath();ctx.roundRect(left,top,item.width,item.height,7);ctx.fill();ctx.stroke();
    if(item.type==='crate'){ctx.strokeStyle='#d6a260';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(left+10,top+10);ctx.lineTo(left+item.width-10,top+item.height-10);ctx.moveTo(left+item.width-10,top+10);ctx.lineTo(left+10,top+item.height-10);ctx.stroke();}ctx.restore();
  }

  function drawPiece(piece) {
    ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.angle||0);ctx.lineCap='round';ctx.lineJoin='round';
    if(piece.type==='pipe'){ctx.strokeStyle='#35424d';ctx.lineWidth=82;ctx.beginPath();ctx.moveTo(-62,0);ctx.lineTo(0,0);ctx.lineTo(0,62);ctx.stroke();ctx.strokeStyle='#d4dde3';ctx.lineWidth=54;ctx.stroke();}
    else {const length=piece.type==='platform'?155:piece.type==='ramp'?130:105;ctx.strokeStyle='#35424d';ctx.lineWidth=piece.type==='spring'?24:12;ctx.beginPath();ctx.moveTo(-length/2,0);ctx.lineTo(length/2,0);ctx.stroke();ctx.strokeStyle='#8194a3';ctx.lineWidth=piece.type==='spring'?17:7;ctx.stroke();ctx.strokeStyle='#d4dde3';ctx.lineWidth=piece.type==='spring'?7:3;ctx.stroke();if(piece.type==='spring'){ctx.strokeStyle='rgba(43,58,70,.75)';ctx.lineWidth=2;for(let x=-length/2+12;x<length/2;x+=16){ctx.beginPath();ctx.moveTo(x,-8);ctx.lineTo(x,8);ctx.stroke();}}}
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0,0,1100,620);drawBackground();
    level.fixedObjects.forEach(drawFixed); level.starter.forEach(drawPiece);
    ctx.font='27px serif';ctx.textAlign='center';level.carrots.forEach(item=>ctx.fillText('🥕',item.x,item.y));
    if(level.goldenHedgehog)ctx.fillText('🦔',level.goldenHedgehog.x,level.goldenHedgehog.y);
    const spaceTheme=(level.background?.preset||world.theme)==='space';ctx.strokeStyle=spaceTheme?'#8cb8d5':'#173b3a';ctx.lineWidth=8;ctx.beginPath();ctx.arc(level.goal.x,level.goal.y,level.goal.radius||34,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#f4e6c1';ctx.beginPath();ctx.arc(level.goal.x,level.goal.y,25,0,Math.PI*2);ctx.fill();ctx.fillStyle='#173b3a';ctx.font='800 11px system-ui';ctx.fillText('GOAL',level.goal.x,level.goal.y+4);
    ctx.save();ctx.translate(level.launcher.x-16,level.launcher.y+33);ctx.fillStyle='#713e27';ctx.fillRect(-28,-18,55,72);ctx.fillStyle='#f3ca52';ctx.fillRect(-18,-8,35,50);ctx.strokeStyle='#513121';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(0,-4);ctx.lineTo(18,-50);ctx.stroke();ctx.restore();
    const object=selectedObject();if(object){ctx.strokeStyle='#f3ca52';ctx.lineWidth=3;ctx.setLineDash([8,5]);const selectionRadius=selected.kind==='fixed'?(object.type==='blackhole'?(object.radius||23)+12:Math.max(object.width,object.height)/2+10):50;ctx.beginPath();ctx.arc(object.x,object.y,selectionRadius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    ctx.textAlign='left';
  }

  canvas.addEventListener('pointerdown',event=>{
    const point=toWorld(event);
    if(tool!=='select'){addAt(tool,point);return;}
    const hit=hitTest(point);if(!hit){selected=null;updateSelectionPanel();updateObjectList();draw();return;}
    select(hit);const object=selectedObject();dragOffset={x:point.x-object.x,y:point.y-object.y};dragging=true;canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    const point=toWorld(event);pointerEl.textContent=`x ${Math.round(point.x)} · y ${Math.round(point.y)}`;
    if(!dragging)return;const object=selectedObject();const desired={x:point.x-dragOffset.x,y:point.y-dragOffset.y};const next=selected.kind==='starter'?geometry.clampPiece(object,desired.x,desired.y):clampPoint(desired);object.x=next.x;object.y=next.y;updateSelectionPanel();updateObjectList();draw();
  });
  canvas.addEventListener('pointerup',()=>dragging=false);
  canvas.addEventListener('pointerleave',()=>{pointerEl.textContent='x — · y —';dragging=false;});

  document.querySelectorAll('#palette button').forEach(button=>button.addEventListener('click',()=>{
    tool=button.dataset.tool;document.querySelectorAll('#palette button').forEach(item=>item.classList.toggle('active',item===button));statusEl.textContent=tool==='select'?'Select or drag an item':`Click the board to place: ${button.textContent.trim()}`;
  }));
  ids.forEach(id=>document.getElementById(id).addEventListener('input',readForm));
  ['selected-x','selected-y','selected-width','selected-height','selected-radius','selected-angle','selected-vx','selected-vy','selected-colour'].forEach(id=>document.getElementById(id).addEventListener('input',applySelectionFields));
  document.getElementById('delete-selected').addEventListener('click',deleteSelection);
  document.getElementById('rotate-selected').addEventListener('click',()=>{const object=selectedObject();if(!object||selected.kind!=='starter')return;object.angle=(object.angle||0)+(object.type==='pipe'?Math.PI/2:Math.PI/4);Object.assign(object,geometry.clampPiece(object));updateSelectionPanel();draw();});
  picker.addEventListener('change',()=>{
    const [worldIndex,levelIndex]=picker.value.split(':').map(Number);
    currentSourceWorldIndex=worldIndex;sourceWorld=sourceWorlds[worldIndex];world=clone(sourceWorld);
    loadEntry(sourceWorld.levels[levelIndex],levelIndex);
  });
  document.getElementById('new-level').addEventListener('click',()=>{
    const number = sourceWorld.levels.length + 1;
    const prefix = sourceWorld.levels[0]?.id?.match(/^(.*?)-\d+$/)?.[1] || world.id || 'world';
    loadEntry({id:`${prefix}-${number}`,number,revision:1,name:'Untitled Level',description:'',availablePieces:{platform:3,ramp:2,spring:1,pipe:0},scoring:{hare:{par:12,stars:{one:12,two:9,three:6}},tortoise:{par:12,stars:{one:12,two:18,three:26}},carrotClockEffectSeconds:1},launcher:{x:92,y:270,vx:290,vy:-52},goal:{x:1020,y:500,radius:34},carrots:[],goldenHedgehog:null,fixedObjects:[],starter:[]},-1);
  });
  document.getElementById('save-draft').addEventListener('click',()=>{localStorage.setItem(DRAFT_KEY,JSON.stringify(editorPackage()));statusEl.textContent='Draft saved in this browser';});

  function openJson(mode) {
    document.getElementById('json-title').textContent=mode==='import'?'Import level package':'Export level package';
    document.getElementById('json-help').textContent=mode==='import'?'Paste a workshop package or a single level object, then apply it.':'The package keeps world metadata and one level together without duplicating game data.';
    jsonText.value=mode==='import'?'':JSON.stringify(editorPackage(),null,2);
    document.getElementById('apply-json').classList.toggle('hidden',mode!=='import');
    document.getElementById('copy-json').classList.toggle('hidden',mode==='import');
    document.getElementById('download-json').classList.toggle('hidden',mode==='import');dialog.showModal();
  }
  document.getElementById('export-level').addEventListener('click',()=>openJson('export'));
  document.getElementById('import-level').addEventListener('click',()=>openJson('import'));
  document.getElementById('copy-json').addEventListener('click',async()=>{await navigator.clipboard.writeText(jsonText.value);statusEl.textContent='Level JSON copied';});
  document.getElementById('download-json').addEventListener('click',()=>{const blob=new Blob([jsonText.value],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${level.id||'level'}.json`;link.click();URL.revokeObjectURL(link.href);});
  function applyPackage(parsed) {
    if(parsed.world){
      world={...world,...parsed.world};
      const matched=sourceWorlds.findIndex(entry=>entry.id===world.id);
      if(matched>=0){currentSourceWorldIndex=matched;sourceWorld=sourceWorlds[matched];}
    }
    loadEntry(parsed.level||parsed,-1);
  }
  document.getElementById('apply-json').addEventListener('click',()=>{try{applyPackage(JSON.parse(jsonText.value));dialog.close();statusEl.textContent='Imported level loaded';}catch(error){statusEl.textContent=`Import failed: ${error.message}`;}});

  const savedDraft=localStorage.getItem(DRAFT_KEY);
  fillPicker();
  if(savedDraft){try{applyPackage(JSON.parse(savedDraft));statusEl.textContent='Recovered saved editor draft';}catch{loadEntry(sourceWorld.levels[0],0);}}
  else loadEntry(sourceWorld.levels[0],0);
})();
