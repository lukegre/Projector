import {
  DEFAULTS, project, projectUV, basis
}
from './geometry.js';
const $ = s => document.querySelector(s);
const clone = obj => JSON.parse(JSON.stringify(obj));
const room = {
  ...DEFAULTS, distance:4.6, screenWidth:1.5, screenBottom:.6, ceilingHeight:2.5, aspectWidth:16, aspectHeight:9, screenAspectWidth:16, screenAspectHeight:9, throwRatio:4.6/1.5, lensHeight:1.2, offsetX:.6
};
const presets = {
  room, center: {
    ...room,offsetX:0,lensHeight:1.021875,yaw:0,pitch:0,roll:0,shiftX:0,shiftY:0,fixedOffsetY:0
  }, offaxis: {
    ...room,offsetX:.8,lensHeight:1.05,yaw:-8,pitch:3,roll:2,shiftX:8,shiftY:12
  }
};
let state=clone(room), currentView='orbit', zoom=1, azimuth=.68, elevation=.4, result;
const groups=[ {
  title:'Optics',icon:'◉',hint:'LENS',fields:[
    ['throwRatio','Throw ratio',.3,6,.01,' : 1','Distance ÷ nominal image width.'],
    ['aspect','Native aspect ratio']
  ]
}, {
  title:'Projector position',icon:'⌖',hint:'METRES',fields:[
    ['distance','Lens-to-wall distance',.2,15,.01,'m','Perpendicular distance to the screen wall.'],
    ['offsetX','Sideways position',-5,5,.01,'m','Positive is right, looking towards the screen.'],
    ['lensHeight','Lens height',0,5,.01,'m','Measured from the floor.']
  ]
}, {
  title:'Aim & lens shift',icon:'↗',hint:'DEGREES / %',fields:[
    ['yaw','Yaw',-45,45,.1,'°','Positive turns right.'],
    ['pitch','Pitch',-45,45,.1,'°','Positive tilts up.'],
    ['roll','Roll',-45,45,.1,'°','Positive rotates clockwise.'],
    ['shiftX','Horizontal shift',-150,150,.1,'%','Positive moves the image right.'],
    ['shiftY','Vertical shift',-150,150,.1,'%','Positive moves the image up.'],
    ['fixedOffsetY','Fixed vertical optical offset',-150,150,.1,'%','Added to vertical shift, as a percentage of full image height.']
  ]
}, {
  title:'Screen & room',icon:'▱',hint:'METRES',fields:[
    ['screenWidth','Screen width',.2,8,.01,'m'],
    ['screenAspect','Screen aspect ratio'],
    ['screenBottom','Screen bottom',0,4,.01,'m','Height above floor.'],
    ['ceilingHeight','Ceiling height',1,8,.01,'m'],
    ['roomWidth','Room width',1,15,.01,'m','Adjustable example; not measured.']
  ]
} ];
function ratio(prefix,label) {
  let aw=prefix==='aspect'?'aspectWidth':'screenAspectWidth', ah=prefix==='aspect'?'aspectHeight':'screenAspectHeight';
  return `<div class="ratio-row">
      <label>${label}</label>
      <input type="number" min="0.01" step="any" data-key="${aw}" aria-label="${label} width">
      <span>:</span>
      <input type="number" min="0.01" step="any" data-key="${ah}" aria-label="${label} height">
      </div>
      <div class="ratio-presets" role="group" aria-label="${label} presets">
      <button class="chip" data-ratio="${prefix}" data-w="16" data-h="9">16:9</button>
      <button class="chip" data-ratio="${prefix}" data-w="4" data-h="3">4:3</button>
      <button class="chip" data-ratio="${prefix}" data-w="16" data-h="10">16:10</button>
      <button class="chip" data-ratio="${prefix}" data-w="21" data-h="9">21:9</button>
      <button class="chip" data-ratio="${prefix}" data-w="1" data-h="1">1:1</button>
      </div>`
}
function field([key,label,min,max,step,unit,help]) {
  if(key==='aspect'||key==='screenAspect')return ratio(key,label);
  return `<div class="field">
      <div class="field-head">
      <label for="n-${key}">${label}</label>
      <span class="number-wrap">
      <input id="n-${key}" type="number" step="any" data-key="${key}">
      <span>${unit}</span>
      </span>
      </div>
      <input type="range" min="${min}" max="${max}" step="${step}" data-range="${key}" aria-label="${label} slider">${help?`<div class="field-help">${help}</div>`:''}</div>`
}
$('#controls').innerHTML=groups.map(g=>`<section class="control-group">
      <div class="group-title">
      <span class="group-icon">${g.icon}</span>
      <h4>${g.title}</h4>
      <small>${g.hint}</small>
      </div>${g.title==='Aim & lens shift'?'<p class="shift-explainer">Shifts are percentages of the full image width or height: 50% moves the image by half that dimension. The fixed vertical optical offset is added to vertical shift.</p>':''}${g.fields.map(field).join('')}</section>`).join('')+`<details class="advanced">
      <summary>Advanced shift limits <span>+</span>
      </summary>
      <p>Optional limits apply to adjustable lens shift only. The ellipse is an approximation, not a manufacturer validation.</p>
      <div class="select-field">
      <label for="limitMode">Limit mode</label>
      <select id="limitMode" data-key="limitMode">
      <option value="none">None</option>
      <option value="independent">Independent</option>
      <option value="ellipse">Ellipse (approx.)</option>
      </select>
      </div>${field(['shiftLimitX','Maximum horizontal shift',0,150,.1,'%','Leave blank if unknown.'])}${field(['shiftLimitY','Maximum vertical shift',0,150,.1,'%','Leave blank if unknown.'])}</details>`;
function sync() {
  document.querySelectorAll('[data-key]').forEach(el=> {
    if(el===document.activeElement&&el.tagName==='INPUT')return;
    let v=state[el.dataset.key];
    el.value=v==null?'':(typeof v==='number'?Number(v.toFixed(6)):v)
  });
  document.querySelectorAll('[data-range]').forEach(el=> {
    el.value=state[el.dataset.range]??0
  });
  document.querySelectorAll('[data-ratio]').forEach(el=> {
    let prefix=el.dataset.ratio==='aspect'?'aspect':'screenAspect';
    el.classList.toggle('active',Number(state[prefix+'Width'])/Number(state[prefix+'Height'])===Number(el.dataset.w)/Number(el.dataset.h))
  })
}
function update() {
  try {
    result=project(state);
    renderResults();
    draw()
  }catch(e) {
    console.error(e);
    $('#warnings').textContent='Please check the input values.'
  }
}
document.querySelector('#controls').addEventListener('input',e=> {
  const el=e.target,key=el.dataset.key||el.dataset.range;
  if(!key)return;
  if(key==='limitMode')state[key]=el.value;
  else {
    if(el.value===''||el.value==='-'||el.value==='.') {
      if(key==='shiftLimitX'||key==='shiftLimitY')state[key]=null;
      else return;
    } else {
      const n=Number(el.value);
      if(!Number.isFinite(n))return;
      state[key]=n
    }
  }
  sync();
  update()
});
$('#controls').addEventListener('click',e=> {
  let b=e.target.closest('[data-ratio]');
  if(!b)return;
  let prefix=b.dataset.ratio==='aspect'?'aspect':'screenAspect';
  state[prefix+'Width']=Number(b.dataset.w);
  state[prefix+'Height']=Number(b.dataset.h);
  sync();
  update()
});
function setPreset(name) {
  state=clone(presets[name]);
  $('#preset').value=name;
  sync();
  update()
}
$('#preset').addEventListener('change',e=>setPreset(e.target.value));
$('#reset').addEventListener('click',()=> {
  setPreset('room');
  resetCamera()
});
const allowed=Object.keys(room);
function validate(obj) {
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return null;
  let next=clone(room);
  for(const k of allowed) {
    if(!(k in obj))continue;
    let v=obj[k];
    if(k==='limitMode') {
      if(!['none','independent','ellipse'].includes(v))return null
    }else if((k==='shiftLimitX'||k==='shiftLimitY')&&v===null) {
    }else if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>10000)return null;
    next[k]=v
  }
  return next
}
function status(s) {
  $('#save-status').textContent=s
}
$('#save').onclick=()=> {
  try {
    localStorage.setItem('projector-simulator-v1',JSON.stringify(state));
    status('Setup saved in this browser.')
  }catch {
    status('Could not save in this browser.')
  }
};
$('#load').onclick=()=> {
  try {
    let value=localStorage.getItem('projector-simulator-v1');
    let parsed=value&&validate(JSON.parse(value));
    if(!parsed) {
      status('No valid saved setup found.');
      return
    }
    state=parsed;
    sync();
    update();
    status('Saved setup loaded.')
  }catch {
    status('Could not load the saved setup.')
  }
};
$('#share').onclick=async()=> {
  try {
    const url=new URL(location.href);
    url.hash='setup='+encodeURIComponent(JSON.stringify(state));
    await navigator.clipboard.writeText(url.href);
    status('Shareable link copied.')
  }catch {
    status('Could not copy the link; clipboard access may be unavailable.')
  }
};
try {
  if(location.hash.startsWith('#setup=')) {
    let loaded=validate(JSON.parse(decodeURIComponent(location.hash.slice(7))));
    if(loaded)state=loaded;
    else status('The link contains an invalid setup.')
  }
}catch {
  status('The link contains an invalid setup.')
}
const fmt=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'—';
function renderResults() {
  let r=result;
  let alerts=[...(r.errors||[]),...(r.warnings||[])];
  if(r.limitStatus?.message&&!r.limitStatus.within&&!alerts.includes(r.limitStatus.message))alerts.push(r.limitStatus.message);
  $('#warnings').innerHTML=alerts.map(a=>`<p>${String(a).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</p>`).join('');
  let n=r.nominal|| {
  };
  $('#metrics').innerHTML=[['Nominal width',n.width,'m','Aligned image'],['Nominal height',n.height,'m','Aligned image'],['Nominal diagonal',n.diagonal,'m',`${fmt(n.diagonalInches,1)} inches`]].map(([label,val,unit,note])=>`<div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${fmt(val)} <small>${unit}</small>
      </div>
      <div class="metric-note">${note}</div>
      </div>`).join('');
  let b=r.bounds|| {
  },e=r.edges|| {
  };
  $('#dimensions').innerHTML=[['Bounding width',b.width],['Bounding height',b.height],['Top edge',e.top],['Right edge',e.right],['Bottom edge',e.bottom],['Left edge',e.left]].map(([a,v])=>`<div class="data-row">
      <span>${a}</span>
      <strong>${fmt(v)} m</strong>
      </div>`).join('');
  let c=r.coverage|| {
  };
  $('#coverage').innerHTML=[['Screen covered by image',c.screenPercent],['Image landing on screen',c.imagePercent]].map(([a,v])=>`<div class="coverage-item">
      <div class="coverage-label">
      <span>${a}</span>
      <strong>${fmt(v,1)}%</strong>
      </div>
      <div class="progress">
      <span style="width:${Number.isFinite(v)?Math.max(0,Math.min(100,v)):0}%">
      </span>
      </div>
      </div>`).join('');
  $('#corners').innerHTML=['Top left','Top right','Bottom right','Bottom left'].map((name,i)=>`<tr>
      <td>${name}</td>
      <td>${fmt(r.corners?.[i]?.[0])} m</td>
      <td>${fmt(r.corners?.[i]?.[1])} m</td>
      </tr>`).join('');
  $('#scene-status').textContent=r.valid?'Ideal geometric projection':'Check setup values'
}
const canvas=$('#scene'),ctx=canvas.getContext('2d');
let cw=0,ch=0;
function resize() {
  let box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  cw=box.width;
  ch=box.height;
  canvas.width=Math.round(cw*dpr);
  canvas.height=Math.round(ch*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  draw()
}
const add=(a,b)=>a.map((v,i)=>v+b[i]), mul=(a,s)=>a.map(v=>v*s), dot=(a,b)=>a.reduce((x,v,i)=>x+v*b[i],0), cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], norm=a=> {
  let l=Math.hypot(...a)||1;
  return mul(a,1/l)
};
function camera() {
  let d=Math.max(.2,Math.abs(state.distance)||4.6),w=Math.max(1,Math.abs(state.roomWidth)||4),h=Math.max(1,Math.abs(state.ceilingHeight)||2.5);
  let target=[0,h*.45,d*.4],scale=Math.min(cw/(Math.max(w,d)*1.45),ch/(Math.max(h,d*.7)*1.55))*zoom;
  let right,up;
  if(currentView==='front') {
    target=[0,h*.5,0];
    right=[1,0,0];
    up=[0,1,0];
    scale=Math.min(cw/(w*1.3),ch/(h*1.3))*zoom
  }else if(currentView==='top') {
    target=[0,0,d*.5];
    right=[1,0,0];
    up=[0,0,-1];
    scale=Math.min(cw/(w*1.3),ch/(d*1.3))*zoom
  }else if(currentView==='side') {
    target=[0,h*.5,d*.5];
    right=[0,0,-1];
    up=[0,1,0];
    scale=Math.min(cw/(d*1.35),ch/(h*1.35))*zoom
  }else {
    let direction=norm([Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)]);
    right=norm(cross([0,1,0],direction));
    up=norm(cross(direction,right))
  }
  return p=>[cw/2+dot(add(p,mul(target,-1)),right)*scale,ch/2-dot(add(p,mul(target,-1)),up)*scale]
}
function path(points,stroke,fill,width=1,dash=[]) {
  if(!points||points.some(p=>!p||!p.every(Number.isFinite)))return;
  ctx.beginPath();
  points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));
  if(fill)ctx.closePath();
  if(fill) {
    ctx.fillStyle=fill;
    ctx.fill()
  }
  if(stroke) {
    ctx.strokeStyle=stroke;
    ctx.lineWidth=width;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([])
  }
}
function draw() {
  if(!cw||!ch||!result)return;
  ctx.clearRect(0,0,cw,ch);
  let P=camera(),w=Math.max(.1,Math.abs(state.roomWidth)||4),d=Math.max(.1,Math.abs(state.distance)||4.6),h=Math.max(.1,Math.abs(state.ceilingHeight)||2.5),floorDepth=Math.max(d*1.22,2);
  let line=(a,b,color='#dce4dd',width=1,dash=[])=>path([P(a),P(b)],color,null,width,dash);
  let poly=(points,stroke,fill,width=1)=>path(points.map(P),stroke,fill,width);
  ctx.lineJoin='round';
  // The wall and floor give all four views a common frame of reference.
  poly([[-w/2,0,0],[w/2,0,0],[w/2,h,0],[-w/2,h,0]],'#d5dfd7','#fcfdf9');
  poly([[-w/2,0,0],[w/2,0,0],[w/2,0,floorDepth],[-w/2,0,floorDepth]],'#d9e2db','#eaf0e9');
  let step=w>8?2:1;
  for(let x=Math.ceil(-w/2/step)*step;x<w/2;x+=step)line([x,0,0],[x,0,floorDepth],'#dce5dc');
  for(let z=step;z<floorDepth;z+=step)line([-w/2,0,z],[w/2,0,z],'#dce5dc');
  line([-w/2,0,0],[-w/2,h,0],'#d6e0d7');
  line([w/2,0,0],[w/2,h,0],'#d6e0d7');
  let s=result.screen;
  if(s?.corners?.length===4) {
    poly(s.corners,'#3c9088','#dcefeb',2);
    let sc=s.center;
    if(sc) {
      line([s.left,sc[1],0],[s.right,sc[1],0],'#afd3cc',.7,[3,4]);
      line([0,s.bottom,0],[0,s.top,0],'#afd3cc',.7,[3,4])
    }
  }
  const lens=[state.offsetX,state.lensHeight,state.distance];
  if(lens.every(Number.isFinite)) {
    line([lens[0],0,lens[2]],lens,'#abb8ae',1,[3,4]);
    if(result.valid&&result.corners?.length===4) {
      for(let c of result.corners)line(lens,c,'#e5a183',1,[5,4]);
      poly(result.corners,'#ce744d','#e38e6333',2);
      // Each grid line is projected from image-space coordinates through the actual lens geometry.
      for(let i=-4;i<=4;i++) {
        let t=i/10;
        let a=projectUV(state,t,-.5),b=projectUV(state,t,.5),c=projectUV(state,-.5,t),dd=projectUV(state,.5,t);
        if(a&&b)line(a,b,'#d57d5699',.8);
        if(c&&dd)line(c,dd,'#d57d5699',.8)
      }
    }
    try {
      let axes=basis(state),right=axes.right,up=axes.up,forward=axes.forward;
      if(right&&up&&forward) {
        let back=add(lens,mul(forward,-.42)),rr=mul(right,.17),uu=mul(up,.11),quad=center=>[add(add(center,rr),uu),add(add(center,mul(rr,-1)),uu),add(add(center,mul(rr,-1)),mul(uu,-1)),add(add(center,rr),mul(uu,-1))];
        let f=quad(lens),b=quad(back);
        poly([f[0],f[1],b[1],b[0]],'#526762','#526762');
        poly([f[0],b[0],b[3],f[3]],'#405851','#405851');
        poly(f,'#334e48','#668079');
        let xy=P(lens);
        ctx.beginPath();
        ctx.arc(xy[0],xy[1],5,0,Math.PI*2);
        ctx.fillStyle='#263f3b';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(xy[0],xy[1],2,0,Math.PI*2);
        ctx.fillStyle='#f4b18d';
        ctx.fill()
      }
    }catch {
    }
  }
  ctx.font='10px system-ui';
  ctx.fillStyle='#8d9c92';
  if(currentView==='front')ctx.fillText('FRONT · LOOKING AT WALL',18,ch-19);
  else if(currentView==='top')ctx.fillText('TOP · LOOKING DOWN',18,ch-19);
  else if(currentView==='side')ctx.fillText('SIDE · LOOKING FROM RIGHT',18,ch-19)
}
function setView(v) {
  currentView=v;
  document.querySelectorAll('.view').forEach(b=> {
    let on=b.dataset.view===v;
    b.classList.toggle('active',on);
    b.setAttribute('aria-pressed',on)
  });
  $('#view-hint').innerHTML=v==='orbit'?'DRAG OR USE ARROWS TO ORBIT <span>·</span> SCROLL TO ZOOM':'SCROLL OR USE + / − TO ZOOM';
  draw()
}
document.querySelectorAll('.view').forEach(b=>b.onclick=()=>setView(b.dataset.view));
function resetCamera() {
  zoom=1;
  azimuth=.68;
  elevation=.4;
  setView('orbit')
}
$('#reset-camera').onclick=resetCamera;
$('#zoom-in').onclick=()=> {
  zoom=Math.min(4,zoom*1.2);
  draw()
};
$('#zoom-out').onclick=()=> {
  zoom=Math.max(.3,zoom/1.2);
  draw()
};
canvas.addEventListener('wheel',e=> {
  e.preventDefault();
  zoom=Math.max(.3,Math.min(4,zoom*Math.exp(-e.deltaY*.001)));
  draw()
}, {
  passive:false
});
let pointers=new Map(),lastPinch=null;
canvas.addEventListener('pointerdown',e=> {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,[e.clientX,e.clientY]);
  lastPinch=null
});
canvas.addEventListener('pointermove',e=> {
  if(!pointers.has(e.pointerId))return;
  let old=pointers.get(e.pointerId);
  pointers.set(e.pointerId,[e.clientX,e.clientY]);
  if(pointers.size===1&&currentView==='orbit') {
    azimuth+=(e.clientX-old[0])*.008;
    elevation=Math.max(-1.35,Math.min(1.35,elevation+(e.clientY-old[1])*.008));
    draw()
  }else if(pointers.size===2) {
    let [a,b]=[...pointers.values()],dist=Math.hypot(a[0]-b[0],a[1]-b[1]);
    if(lastPinch)zoom=Math.max(.3,Math.min(4,zoom*dist/lastPinch));
    lastPinch=dist;
    draw()
  }
});
for(let event of ['pointerup','pointercancel'])canvas.addEventListener(event,e=> {
  pointers.delete(e.pointerId);
  lastPinch=null
});
canvas.addEventListener('keydown', e => {
  const step = .08;
  if (e.key === 'ArrowLeft' && currentView === 'orbit') azimuth -= step;
  else if (e.key === 'ArrowRight' && currentView === 'orbit') azimuth += step;
  else if (e.key === 'ArrowUp' && currentView === 'orbit') elevation = Math.max(-1.35, elevation - step);
  else if (e.key === 'ArrowDown' && currentView === 'orbit') elevation = Math.min(1.35, elevation + step);
  else if (e.key === '+' || e.key === '=') zoom = Math.min(4, zoom * 1.2);
  else if (e.key === '-') zoom = Math.max(.3, zoom / 1.2);
  else if (e.key === '0') {
    resetCamera();
    e.preventDefault();
    return;
  } else return;
  e.preventDefault();
  draw();
});
new ResizeObserver(resize).observe(canvas);
sync();
update();
