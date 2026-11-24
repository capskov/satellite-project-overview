#!/usr/bin/env node
"use strict";
// Deterministic overlay decorator. Geometry input must be verified and already registered.
function render(svg,cfg,s) {
  const esc=v=>String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const num=v=>{if(typeof v!=="number"||!Number.isFinite(v))throw Error("Nonfinite coordinate");return v};
  const vm=svg.match(/viewBox\s*=\s*["']0\s+0\s+([\d.]+)\s+([\d.]+)["']/);
  if(!vm||!/<g\b[^>]*\bid=["']engineering-geometry["']/.test(svg)||!/<\/svg>\s*$/.test(svg))throw Error("Require zero-origin SVG with engineering-geometry group");
  if(/id=["']rail-style-annotations["']/.test(svg))throw Error("Use geometry-only input, not a previous styled output");
  const W=Number(vm[1]),H=Number(vm[2]),k=W/s.reference_width,P=s.palette,L=s.label;
  const px=v=>v*k;const at=(x,y)=>{num(x);num(y);if(x<0||x>W||y<0||y>H)throw Error("Point outside canvas")};
  const safeid=v=>{if(!/^[A-Za-z0-9_-]+$/.test(v))throw Error("Invalid id");return v};
  const tx=(x,y,t,size,fill="#fff",bold=false,align="start")=>`<text x="${x}" y="${y}" font-size="${px(size)}" fill="${fill}" font-weight="${bold?700:400}" text-anchor="${align}" dominant-baseline="middle">${esc(t)}</text>`;
  const rect=(x,y,w,h,fill,r=5,opacity=1,stroke="none",sw=1)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${px(r)}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${px(sw)}"/>`;
  const circle=(x,y,r,c,sw=1.5)=>`<circle cx="${x}" cy="${y}" r="${px(r)}" fill="${c}" stroke="#fff" stroke-width="${px(sw)}"/>`;
  const line=(x,y,a,b,c,w)=>`<line x1="${x}" y1="${y}" x2="${a}" y2="${b}" stroke="${c}" stroke-width="${px(w)}" stroke-linecap="round"/>`;
  const estimate=(t,size)=>Array.from(String(t)).reduce((n,c)=>n+(/[\u2e80-\uffff]/.test(c)?1:.64)*px(size),0);
  const used=new Set(),ids=new Set(),boxes=[],tipSegments=[];let out=`<g id="rail-style-annotations" font-family="${esc(s.font_family)}">`;
  const id=v=>{v=safeid(v);if(ids.has(v))throw Error("Duplicate id "+v);ids.add(v);return v};
  const boxCheck=(x,y,w,h,margin=0)=>{at(x,y);at(x+w,y+h);if(x<margin||x+w>W-margin||y<margin||y+h>H-margin)throw Error("Insufficient margin");};
  const overlaps=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
  const roles={};
  for(const v of cfg.labels||[]){
    const key=id(v.id),role=v.role,col=P[role];if(!Object.hasOwn(L.marker,role))throw Error("Unknown role "+role);
    if(used.has(role)&&["start","boundary"].includes(role))throw Error("Duplicate station "+role);
    used.add(role);roles[role]=v;
    const [a,b]=v.anchor.map(num);at(a,b);
    const [x,y,w]=v.box.map(num),h=px(L.height),r=px(L.radius),tip=px(L.tip_width),pad=px(L.padding);
    boxCheck(x,y,w,h,px(L.margin));if(b<=y+h+px(12))throw Error("Anchor must be below label");
    if(w<Math.max(estimate(v.title,L.title),estimate(v.body,L.body))+2*pad)throw Error("Label width too small: "+v.id);
    const B=[x,y,w,h];if(boxes.some(o=>overlaps(B,o)))throw Error("Overlapping labels");boxes.push(B);
    const t=num(v.tip_base);if(t-tip/2<x+r||t+tip/2>x+w-r)throw Error("Triangle base outside straight edge");
    tipSegments.push({a:[t,y+h],b:[a,b],id:key});
    const d=`M${x+r} ${y} H${x+w-r} Q${x+w} ${y} ${x+w} ${y+r} V${y+h-r} Q${x+w} ${y+h} ${x+w-r} ${y+h} H${t+tip/2} L${a} ${b} L${t-tip/2} ${y+h} H${x+r} Q${x} ${y+h} ${x} ${y+h-r} V${y+r} Q${x} ${y} ${x+r} ${y} Z`;
    out+=`<g id="label-${key}"><g id="label-${key}-shadow">${rect(x+px(3),y+px(4),w,h,"#051B2C",L.radius,.22)}</g><g id="label-${key}-body"><path d="${d}" fill="${col}" stroke="${P.white}" stroke-width="${px(L.border)}" stroke-linejoin="round"/><path d="M${x+px(14)} ${y+px(14)} V${y+h-px(14)}" stroke="#DCEAF7" stroke-width="${px(2.6)}" stroke-linecap="round"/>${tx(x+pad,y+px(24),v.title,L.title,P.white,true)}${tx(x+pad,y+px(46),v.body,L.body,"#EAF3FC")}</g><g id="label-${key}-anchor">${["start","boundary"].includes(role)?`<circle cx="${a}" cy="${b}" r="${px(L.marker[role]+4)}" fill="#10283D" fill-opacity=".38"/>`:""}${circle(a,b,L.marker[role],col,role==="boundary"?3.6:2.6)}${["start","boundary"].includes(role)?circle(a,b,role==="boundary"?4:3,"#fff",0):""}</g></g>`;
  }
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const intersect=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
  for(let i=0;i<tipSegments.length;i++)for(let j=i+1;j<tipSegments.length;j++){const a=tipSegments[i],b=tipSegments[j];if(intersect(a.a,a.b,b.a,b.b))throw Error("Crossing pointer centerlines");}
  for(const v of cfg.texts||[]){
    const key=id(v.id),[x,y]=v.at.map(num);at(x,y);const size=v.size||18,step=px(size*1.18);
    const rows=v.vertical?Array.from(v.text):[v.text];
    if(y+(rows.length-1)*step>H)throw Error("Vertical label outside canvas");
    out+=`<g id="place-${key}">`+rows.map((t,i)=>`<text x="${x}" y="${y+i*step}" text-anchor="middle" dominant-baseline="middle" font-size="${px(size)}" font-weight="600" fill="#17384A" stroke="#17384A" stroke-width="${px(3.1)}" stroke-linejoin="round">${esc(t)}</text>${tx(x,y+i*step,t,size,"#F8FCFF",true,"middle")}`).join("")+`</g>`;
  }
  if(cfg.title){out+=`<g id="rail-title">${rect(px(32),px(29),W-px(64),px(65),P.panel,10,.94,"#9BC4DF",1.2)}${rect(px(45),px(42),px(4),px(39),"#69C7E8",2)}${tx(px(63),px(62),cfg.title,27,"#fff",true)}${cfg.subtitle?tx(W-px(55),px(62),cfg.subtitle,16,"#D1E4F3",false,"end"):""}</g>`}
  if(cfg.range){
    if(!roles.start||!roles.boundary)throw Error("Range requires verified start and boundary anchors");
    const R=cfg.range,{x,end_x,y}=R, h=px(s.range.height),a=roles.start.anchor[0],b=roles.boundary.anchor[0];
    if(!(x<=a&&a<b&&b<end_x))throw Error("Range requires left-to-right order; omit or customize for other alignments");
    boxCheck(x,y,end_x-x,h);
    if(cfg.legend&&(cfg.legend.y<y+h+px(s.range.gap_to_legend)||Math.abs(cfg.legend.x-x)>.01))throw Error("Legend must align below range");
    const rr=px(7),yy=y+h*.69,ex=end_x-px(27);
    out+=`<g id="phase-range-schematic"><path d="M${x+rr} ${y} H${b} V${y+h} H${x+rr} Q${x} ${y+h} ${x} ${y+h-rr} V${y+rr} Q${x} ${y} ${x+rr} ${y} Z" fill="${P.phase1}" fill-opacity="${s.range.phase1_opacity}"/><path d="M${b} ${y} H${end_x-rr} Q${end_x} ${y} ${end_x} ${y+rr} V${y+h-rr} Q${end_x} ${y+h} ${end_x-rr} ${y+h} H${b} Z" fill="${P.phase2}" fill-opacity="${s.range.phase2_opacity}"/>${rect(x,y,end_x-x,h,"none",7,1,"#E2F0FB",1.4)}${line(a,yy,b,yy,"#D2E5F7",3.2)}${line(b,yy,ex,yy,"#AEE3FF",3.2)}<path d="M${ex-px(12)} ${yy-px(8)} L${ex} ${yy} L${ex-px(12)} ${yy+px(8)}" fill="none" stroke="#AEE3FF" stroke-width="${px(3.2)}" stroke-linecap="round" stroke-linejoin="round"/>${line(a,yy-px(7),a,yy+px(7),"#E2F0FB",1.8)}${line(b,yy-px(7),b,yy+px(7),P.gold,1.8)}${circle(a,yy,3.5,"#E2F0FB",1.4)}${circle(b,yy,5.5,P.gold,1.6)}${tx((a+b)/2,y+px(14),R.phase1_label,16,"#fff",true,"middle")}${tx((b+end_x)/2,y+px(14),R.phase2_label,16,"#fff",true,"middle")}${tx(a,y+px(14),R.start_label,14,"#E2F0FB",true,"middle")}${tx(b,y+px(14),R.boundary_label,14,P.gold,true,"middle")}${tx(x+px(12),y+px(15),"分期示意",11,"#D7E7F5")}${tx(end_x-px(12),y+px(14),R.end_label,12,"#fff",false,"end")}</g>`;
  }
  if(cfg.legend){
    const {x,y}=cfg.legend,w=px(622),h=px(86);boxCheck(x,y,w,h);
    out+=`<g id="rail-legend">${rect(x,y,w,h,P.panel,8,.94,"#D9E9F5",1.1)}${tx(x+px(14),y+px(24),"图例",16,"#fff",true)}`;
    const items=[["道路红线",P.road,"dash"],["一期管线",P.pipe1,"line"],["二期管线",P.pipe2,"line"],["河道范围",P.water,"area"],["地铁范围",P.metro,"area"],["关键桩号点",P.gold,"point"]];
    items.forEach(([t,col,kind],i)=>{const a=x+px(14+(i%3)*203),b=y+px(42+Math.floor(i/3)*27);let mark=kind==="area"?rect(a,b-px(8),px(33),px(13),col,2,.6,col,1):kind==="point"?circle(a+px(16),b,6,col):line(a,b,a+px(33),b,"#fff",5)+(kind==="dash"?`<line x1="${a}" x2="${a+px(33)}" y1="${b}" y2="${b}" stroke="${col}" stroke-width="${px(2.8)}" stroke-dasharray="${px(6)} ${px(4)}"/>`:line(a,b,a+px(33),b,col,2.8));out+=`<g id="legend-${i}">${mark}${tx(a+px(41),b+px(1),t,14,"#F1F7FC")}</g>`;});out+="</g>";
  }
  out+="</g>";
  return svg.replace(/<\/svg>\s*$/,out+"</svg>\n");
}
module.exports={render};
if(require.main===module){
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const [geometry,scene,output,preset]=process.argv.slice(2);
if(!geometry||!scene||!output)throw Error("Usage: node render_rail_transit.cjs geometry.svg scene.json output.svg [style.json]");
const src=fs.readFileSync(geometry,"utf8"),cfg=JSON.parse(fs.readFileSync(scene,"utf8")),style=JSON.parse(fs.readFileSync(preset||path.join(__dirname,"../assets/styles/rail-transit/style.json"),"utf8"));
const result=render(src,cfg,style),prefix=src.replace(/<\/svg>\s*$/,"");
if(!result.startsWith(prefix))throw Error("Geometry bytes changed");
fs.writeFileSync(output,result,"utf8");
console.log(JSON.stringify({output,geometry_prefix_sha256:crypto.createHash("sha256").update(prefix).digest("hex"),labels:cfg.labels.length}));
}
