let land;
const viewStates=new Map();
const loadLand=()=>land||(land=fetch('./assets/land.geojson').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(()=>null));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountMap(node,{entities=[],selected=null,selectedIds=[],placement=false,selectionMode=false,onPlace,onSelect,onMove,onBoxSelect,onClearSelection,readonly=false,showLabels=false,stateKey='default'}={}){
  const geo=await loadLand();if(!node.isConnected)return;
  const saved=viewStates.get(stateKey);let center=saved?.center?[...saved.center]:[121,29.8],span=saved?.span||12,drag=null,moved=false;
  const remember=()=>viewStates.set(stateKey,{center:[...center],span});
  const entityExtent=()=>{if(!entities.length)return;const xs=entities.map(e=>e.lon),ys=entities.map(e=>e.lat);center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];span=Math.max(8,(Math.max(...xs)-Math.min(...xs))*2,(Math.max(...ys)-Math.min(...ys))*3);};
  if(!saved&&entities.some(e=>Math.abs(e.lon-center[0])>8||Math.abs(e.lat-center[1])>6))entityExtent();
  node.innerHTML=`<div class="map-svg-wrap"></div><div class="map-badge"><span class="live-dot"></span>${placement?'点击地图放置实体':selectionMode?'拖动矩形框选实体':selectedIds.length>1?`已选 ${selectedIds.length} 个实体 · 拖动可整体移动`:'WGS84 · 离线地图'}</div><div class="map-tools"><button title="放大地图" aria-label="放大地图" data-map="in">＋</button><button title="缩小地图" aria-label="缩小地图" data-map="out">−</button><button title="定位全部实体" aria-label="定位全部实体" data-map="fit">⌖</button></div><div class="map-legend"><span><i class="side-dot blue"></i> 蓝方</span><span><i class="side-dot red"></i> 红方</span></div><div class="map-credit">${geo?'Natural Earth · ':'经纬网 · '}坐标选点演示</div><div class="map-coords">120.0000° E &nbsp; 30.0000° N</div>`;
  const wrapper=node.querySelector('.map-svg-wrap');
  const project=(lon,lat)=>[(lon-center[0])/span*1000+500,(center[1]-lat)/(span*.7)*700+350];
  const invert=(x,y)=>[center[0]+(x-500)/1000*span,center[1]-(y-350)/700*(span*.7)];
  const svgPoint=e=>{const r=wrapper.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*1000,y:(e.clientY-r.top)/r.height*700};};
  const fromEvent=e=>{const point=svgPoint(e);return invert(point.x,point.y);};
  const pointLabel=(lon,lat)=>`${Math.abs(lon).toFixed(4)}° ${lon<0?'W':'E'} · ${Math.abs(lat).toFixed(4)}° ${lat<0?'S':'N'}`;
  const selectedSet=new Set(selectedIds);
  let renderedClusters=[];
  let drawFrame=0;const scheduleDraw=()=>{if(drawFrame)return;drawFrame=requestAnimationFrame(()=>{drawFrame=0;if(node.isConnected)draw();});};
  function draw(){
    const polygons=geo?.features.flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates)||[];
    const paths=polygons.map(poly=>poly.map(ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${project(x,y).map(v=>v.toFixed(1)).join(',')}`).join('')+'Z').join('')).join('');
    const step=span>20?10:span>10?2:1;let grid='';
    for(let lon=Math.floor((center[0]-span/2)/step)*step;lon<center[0]+span/2+step;lon+=step){const[x]=project(lon,0);grid+=`<path d="M${x} 0V700"/><text x="${x+8}" y="684">${lon.toFixed(0)}°</text>`;}
    for(let lat=Math.floor((center[1]-span*.35)/step)*step;lat<center[1]+span*.35+step;lat+=step){const[,y]=project(0,lat);grid+=`<path d="M0 ${y}H1000"/><text x="12" y="${y-8}">${lat.toFixed(0)}°</text>`;}
    const places=[['中 国',117.4,31.6],['东 海',123.5,29.5],['台 湾',121,23.8],['上海',121.47,31.23],['杭州',120.15,30.27],['福州',119.3,26.08]];
    const bins=new Map();for(const entity of entities){const [x,y]=project(entity.lon,entity.lat),key=`${Math.round(x/42)}:${Math.round(y/42)}`,group=bins.get(key)||[];group.push({entity,x,y});bins.set(key,group);}
    const markers=[],clusters=[];for(const group of bins.values()){
      const selectedPoints=group.filter(point=>point.entity.id===selected||selectedSet.has(point.entity.id));markers.push(...selectedPoints);
      const remaining=selectedPoints.length?group.filter(point=>!selectedPoints.includes(point)):group;
      if(remaining.length===1)markers.push(remaining[0]);else if(remaining.length>1)clusters.push({x:remaining.reduce((sum,p)=>sum+p.x,0)/remaining.length,y:remaining.reduce((sum,p)=>sum+p.y,0)/remaining.length,lon:remaining.reduce((sum,p)=>sum+p.entity.lon,0)/remaining.length,lat:remaining.reduce((sum,p)=>sum+p.entity.lat,0)/remaining.length,count:remaining.length,ids:remaining.map(point=>point.entity.id)});
    }
    renderedClusters=clusters;
    const markerHTML=markers.map(({entity:e,x,y})=>{const color=e.side==='Blue'?'#5174d9':'#de707b',active=e.id===selected||selectedSet.has(e.id),labelClass=showLabels||e.id===selected?'entity-label visible':'entity-label';return `<g transform="translate(${x},${y})" class="entity-marker ${active?'selected':''}" data-entity="${e.id}" tabindex="0" role="button" aria-label="选择 ${esc(e.name)}"><title>${esc(e.name)}</title>${active?`<circle r="37" fill="${color}" opacity=".10"/><circle r="26" fill="none" stroke="${color}" stroke-dasharray="3 4"/>`:''}<circle r="17" fill="${color}" stroke="white" stroke-width="3" filter="url(#marker-shadow)"/><path d="m-7 1 7-9 7 9-7-3z" fill="white"/><g class="${labelClass}"><rect x="-65" y="28" width="130" height="28" rx="6" fill="white" stroke="#dce2e6"/><text y="46" text-anchor="middle" fill="#455167" font-size="12">${esc(e.name.slice(0,14))}</text></g></g>`;}).join('');
    const clusterHTML=clusters.map((cluster,index)=>`<g transform="translate(${cluster.x},${cluster.y})" class="map-cluster" data-cluster="${index}" tabindex="0" role="button" aria-label="放大查看 ${cluster.count} 个实体"><circle r="22"/><circle r="16"/><text y="4" text-anchor="middle">${cluster.count>999?'999+':cluster.count}</text></g>`).join('');
    wrapper.innerHTML=`<svg viewBox="0 0 1000 700" preserveAspectRatio="none" role="img" aria-label="实体部署地图，支持缩放、拖动和选点"><defs><pattern id="sea-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#c6d4dc"/></pattern><filter id="marker-shadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity=".18"/></filter></defs><rect width="1000" height="700" fill="#e8f0f4"/><rect width="1000" height="700" fill="url(#sea-dots)"/><path d="${paths}" fill="#f7f7f0" stroke="#c8d5ca" stroke-width="1.3"/><g class="map-grid">${grid}</g><g class="place-labels">${places.map(([name,x,y])=>{const p=project(x,y);return `<text x="${p[0]}" y="${p[1]}">${name}</text>`;}).join('')}</g>${clusterHTML}${markerHTML}</svg>`;
    wrapper.querySelectorAll('[data-cluster]').forEach(element=>{const cluster=clusters[Number(element.dataset.cluster)];element.onclick=event=>{event.stopPropagation();center=[cluster.lon,cluster.lat];span=Math.max(1,span*.55);remember();if(selectedIds.length)onClearSelection?.();else draw();};});
    remember();
  }
  node.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{if(b.dataset.map==='fit')entityExtent();else span=Math.min(120,Math.max(1,span*(b.dataset.map==='in'?.75:1.3)));remember();draw();});
  wrapper.addEventListener('wheel',e=>{e.preventDefault();const point=svgPoint(e),anchor=invert(point.x,point.y),factor=Math.exp(Math.max(-240,Math.min(240,e.deltaY))*.0015),nextSpan=Math.min(120,Math.max(1,span*factor));if(nextSpan===span)return;span=nextSpan;center=[Math.max(-180,Math.min(180,anchor[0]-(point.x-500)/1000*span)),Math.max(-85,Math.min(85,anchor[1]+(point.y-350)/700*(span*.7)))];remember();scheduleDraw();},{passive:false});
  wrapper.onpointerdown=e=>{if(e.button!==0)return;const marker=e.target.closest('[data-entity]'),cluster=e.target.closest('[data-cluster]'),clusterData=cluster?renderedClusters[Number(cluster.dataset.cluster)]:null,point=svgPoint(e),box=selectionMode&&!marker&&!cluster,entity=marker?.dataset.entity,groupIds=entity&&selectedSet.has(entity)&&selectedSet.size>1?selectedSet:new Set(entity?[entity]:clusterData?.ids||[]),group=[...groupIds].map(id=>entities.find(item=>item.id===id)).filter(Boolean).map(item=>({id:item.id,lon:item.lon,lat:item.lat}));drag={x:e.clientX,y:e.clientY,center:[...center],entity,cluster,box,origin:point,geo:invert(point.x,point.y),group};moved=false;if(box){const svg=wrapper.querySelector('svg');svg.insertAdjacentHTML('beforeend',`<rect class="map-selection" x="${point.x}" y="${point.y}" width="0" height="0"/>`);}wrapper.setPointerCapture(e.pointerId);};
  wrapper.onpointermove=e=>{
    const pos=fromEvent(e);node.querySelector('.map-coords').textContent=pointLabel(...pos);
    if(!drag)return;
    if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>5)moved=true;
    if(!moved)return;
    if(drag.box){const point=svgPoint(e),rect=wrapper.querySelector('.map-selection');rect?.setAttribute('x',Math.min(drag.origin.x,point.x));rect?.setAttribute('y',Math.min(drag.origin.y,point.y));rect?.setAttribute('width',Math.abs(point.x-drag.origin.x));rect?.setAttribute('height',Math.abs(point.y-drag.origin.y));return;}
    if((drag.entity||drag.cluster)&&!readonly&&drag.group.length){const minLon=Math.min(...drag.group.map(item=>item.lon)),maxLon=Math.max(...drag.group.map(item=>item.lon)),minLat=Math.min(...drag.group.map(item=>item.lat)),maxLat=Math.max(...drag.group.map(item=>item.lat)),deltaLon=Math.max(-180-minLon,Math.min(180-maxLon,pos[0]-drag.geo[0])),deltaLat=Math.max(-90-minLat,Math.min(90-maxLat,pos[1]-drag.geo[1]));for(const original of drag.group){const entity=entities.find(item=>item.id===original.id);entity.lon=+(original.lon+deltaLon).toFixed(4);entity.lat=+(original.lat+deltaLat).toFixed(4);}scheduleDraw();}
    else if(!drag.cluster&&!placement){const r=wrapper.getBoundingClientRect();center=[Math.max(-180,Math.min(180,drag.center[0]-(e.clientX-drag.x)/r.width*span)),Math.max(-85,Math.min(85,drag.center[1]+(e.clientY-drag.y)/r.height*span*.7))];remember();scheduleDraw();}
  };
  wrapper.onpointerup=e=>{if(!drag)return;const d=drag;drag=null;
    if(d.box){const point=svgPoint(e),left=Math.min(d.origin.x,point.x),right=Math.max(d.origin.x,point.x),top=Math.min(d.origin.y,point.y),bottom=Math.max(d.origin.y,point.y),ids=entities.filter(entity=>{const [x,y]=project(entity.lon,entity.lat);return x>=left&&x<=right&&y>=top&&y<=bottom;}).map(entity=>entity.id);wrapper.querySelector('.map-selection')?.remove();onBoxSelect?.(ids);return;}
    if(moved){if((d.entity||d.cluster)&&!readonly)onMove?.(d.group.map(item=>entities.find(entity=>entity.id===item.id)).filter(Boolean));return;}
    if(d.cluster){d.cluster.onclick?.(e);return;}if(d.entity)onSelect?.(d.entity);else if(placement&&!readonly){const[lon,lat]=fromEvent(e);if(Math.abs(lon)<=180&&Math.abs(lat)<=90)onPlace?.(+lon.toFixed(4),+lat.toFixed(4));}else if(selectedIds.length)onClearSelection?.();
  };
  wrapper.onkeydown=e=>{if(!['Enter',' '].includes(e.key))return;if(e.target.dataset.entity){e.preventDefault();onSelect?.(e.target.dataset.entity);}else if(e.target.dataset.cluster!=null){e.preventDefault();e.target.onclick(e);}};
  draw();
}
