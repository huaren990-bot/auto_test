let land;
const loadLand=()=>land||(land=fetch('./assets/land.geojson').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(()=>null));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountMap(node,{entities=[],selected=null,placement=false,onPlace,onSelect,onMove,readonly=false}={}){
  const geo=await loadLand();if(!node.isConnected)return;
  let center=[121,29.8],span=12,drag=null,moved=false;
  const entityExtent=()=>{if(!entities.length)return;const xs=entities.map(e=>e.lon),ys=entities.map(e=>e.lat);center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];span=Math.max(8,(Math.max(...xs)-Math.min(...xs))*2,(Math.max(...ys)-Math.min(...ys))*3);};
  if(entities.some(e=>Math.abs(e.lon-center[0])>8||Math.abs(e.lat-center[1])>6))entityExtent();
  node.innerHTML=`<div class="map-svg-wrap"></div><div class="map-badge"><span class="live-dot"></span>${placement?'点击地图放置实体':'WGS84 · 离线地图'}</div><div class="map-tools"><button title="放大地图" aria-label="放大地图" data-map="in">＋</button><button title="缩小地图" aria-label="缩小地图" data-map="out">−</button><button title="定位全部实体" aria-label="定位全部实体" data-map="fit">⌖</button></div><div class="map-legend"><span><i class="side-dot blue"></i> 蓝方</span><span><i class="side-dot red"></i> 红方</span></div><div class="map-credit">${geo?'Natural Earth · ':'经纬网 · '}坐标选点演示</div><div class="map-coords">120.0000° E &nbsp; 30.0000° N</div>`;
  const wrapper=node.querySelector('.map-svg-wrap');
  const project=(lon,lat)=>[(lon-center[0])/span*1000+500,(center[1]-lat)/(span*.7)*700+350];
  const invert=(x,y)=>[center[0]+(x-500)/1000*span,center[1]-(y-350)/700*(span*.7)];
  const fromEvent=e=>{const r=wrapper.getBoundingClientRect();return invert((e.clientX-r.left)/r.width*1000,(e.clientY-r.top)/r.height*700);};
  const pointLabel=(lon,lat)=>`${Math.abs(lon).toFixed(4)}° ${lon<0?'W':'E'} · ${Math.abs(lat).toFixed(4)}° ${lat<0?'S':'N'}`;
  function draw(){
    const polygons=geo?.features.flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates)||[];
    const paths=polygons.map(poly=>poly.map(ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${project(x,y).map(v=>v.toFixed(1)).join(',')}`).join('')+'Z').join('')).join('');
    const step=span>20?10:span>10?2:1;let grid='';
    for(let lon=Math.floor((center[0]-span/2)/step)*step;lon<center[0]+span/2+step;lon+=step){const[x]=project(lon,0);grid+=`<path d="M${x} 0V700"/><text x="${x+8}" y="684">${lon.toFixed(0)}°</text>`;}
    for(let lat=Math.floor((center[1]-span*.35)/step)*step;lat<center[1]+span*.35+step;lat+=step){const[,y]=project(0,lat);grid+=`<path d="M0 ${y}H1000"/><text x="12" y="${y-8}">${lat.toFixed(0)}°</text>`;}
    const places=[['中 国',117.4,31.6],['东 海',123.5,29.5],['台 湾',121,23.8],['上海',121.47,31.23],['杭州',120.15,30.27],['福州',119.3,26.08]];
    wrapper.innerHTML=`<svg viewBox="0 0 1000 700" preserveAspectRatio="none" role="img" aria-label="实体部署地图，支持缩放、拖动和选点"><defs><pattern id="sea-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#c6d4dc"/></pattern><filter id="marker-shadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity=".18"/></filter></defs><rect width="1000" height="700" fill="#e8f0f4"/><rect width="1000" height="700" fill="url(#sea-dots)"/><path d="${paths}" fill="#f7f7f0" stroke="#c8d5ca" stroke-width="1.3"/><g class="map-grid">${grid}</g><g class="place-labels">${places.map(([name,x,y])=>{const p=project(x,y);return `<text x="${p[0]}" y="${p[1]}">${name}</text>`;}).join('')}</g>${entities.map(e=>{const[x,y]=project(e.lon,e.lat),color=e.side==='Blue'?'#5174d9':'#de707b';return `<g transform="translate(${x},${y})" class="entity-marker ${e.id===selected?'selected':''}" data-entity="${e.id}" tabindex="0" role="button" aria-label="选择 ${esc(e.name)}"><title>${esc(e.name)}</title>${e.id===selected?`<circle r="37" fill="${color}" opacity=".10"/><circle r="26" fill="none" stroke="${color}" stroke-dasharray="3 4"/>`:''}<circle r="17" fill="${color}" stroke="white" stroke-width="3" filter="url(#marker-shadow)"/><path d="m-7 1 7-9 7 9-7-3z" fill="white"/><rect x="-65" y="28" width="130" height="28" rx="6" fill="white" stroke="#dce2e6"/><text y="46" text-anchor="middle" fill="#455167" font-size="12">${esc(e.name.slice(0,14))}</text></g>`;}).join('')}</svg>`;
  }
  node.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{if(b.dataset.map==='fit')entityExtent();else span=Math.min(120,Math.max(1,span*(b.dataset.map==='in'?.75:1.3)));draw();});
  wrapper.onpointerdown=e=>{if(e.button!==0)return;const marker=e.target.closest('[data-entity]');drag={x:e.clientX,y:e.clientY,center:[...center],entity:marker?.dataset.entity};moved=false;wrapper.setPointerCapture(e.pointerId);};
  wrapper.onpointermove=e=>{
    const pos=fromEvent(e);node.querySelector('.map-coords').textContent=pointLabel(...pos);
    if(!drag)return;
    if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>5)moved=true;
    if(!moved)return;
    if(drag.entity&&!readonly){const entity=entities.find(x=>x.id===drag.entity);entity.lon=Math.max(-180,Math.min(180,+pos[0].toFixed(4)));entity.lat=Math.max(-90,Math.min(90,+pos[1].toFixed(4)));draw();}
    else if(!placement){const r=wrapper.getBoundingClientRect();center=[Math.max(-180,Math.min(180,drag.center[0]-(e.clientX-drag.x)/r.width*span)),Math.max(-85,Math.min(85,drag.center[1]+(e.clientY-drag.y)/r.height*span*.7))];draw();}
  };
  wrapper.onpointerup=e=>{if(!drag)return;const d=drag;drag=null;
    if(moved){if(d.entity&&!readonly)onMove?.(entities.find(x=>x.id===d.entity));return;}
    if(d.entity)onSelect?.(d.entity);else if(placement&&!readonly){const[lon,lat]=fromEvent(e);if(Math.abs(lon)<=180&&Math.abs(lat)<=90)onPlace?.(+lon.toFixed(4),+lat.toFixed(4));}
  };
  wrapper.onkeydown=e=>{if(['Enter',' '].includes(e.key)&&e.target.dataset.entity){e.preventDefault();onSelect?.(e.target.dataset.entity);}};
  draw();
}
