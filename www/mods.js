'use strict';
let src='mr',off=0,seq=0,dbt;
const fmtN=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':n,CFH=()=>({'x-api-key':localStorage.getItem('cfkey')||'',Accept:'application/json'}),LD=()=>$('#ml').value,CFL={forge:1,fabric:4,neoforge:6};
const card=m=>`<div class="glass mc"><div class="mh"><img src="${m.icon||''}" onerror="this.style.visibility='hidden'"><div><b>${esc(m.title)}</b><div class="muted">${esc(m.author)} · ⬇ ${fmtN(m.dl)}</div></div></div><p>${esc(m.desc||'')}</p>${m.shots.length?`<div class="shots">${m.shots.slice(0,4).map(u=>`<img loading="lazy" src="${u}">`).join('')}</div>`:''}<div class="muted">${esc((m.cats||[]).slice(0,4).join(' · '))}</div><button class="btn" data-s="${m.s}" data-id="${m.id}">Download &amp; convert</button></div>`;
async function mrSearch(q,o){const fac=[['project_type:mod']];if(LD())fac.push(['categories:'+LD()]);
  const r=await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&facets=${encodeURIComponent(JSON.stringify(fac))}&limit=20&offset=${o}&index=${q?'relevance':'downloads'}`);if(!r.ok)throw new Error('Modrinth '+r.status);
  return (await r.json()).hits.map(h=>({s:'mr',id:h.project_id,title:h.title,author:h.author,dl:h.downloads,desc:h.description,icon:h.icon_url,cats:h.display_categories||h.categories,shots:(h.gallery||[]).slice(0,4)}))}
async function cfSearch(q,o){if(!localStorage.getItem('cfkey'))throw new Error('Paste your free CurseForge API key in the box above.');
  const r=await fetch(`https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(q)}&sortField=2&sortOrder=desc&pageSize=20&index=${o}${CFL[LD()]?'&modLoaderType='+CFL[LD()]:''}`,{headers:CFH()});
  if(!r.ok)throw new Error('CurseForge '+r.status+' (check API key)');
  return (await r.json()).data.map(m=>({s:'cf',id:m.id,title:m.name,author:m.authors?.[0]?.name||'',dl:m.downloadCount,desc:m.summary,icon:m.logo?.thumbnailUrl,cats:m.categories.map(c=>c.name),shots:(m.screenshots||[]).map(x=>x.thumbnailUrl)}))}
async function load(reset){const my=++seq;if(reset){off=0;$('#mlist').innerHTML=''}$('#mmore').hidden=true;$('#mlist').insertAdjacentHTML('beforeend','<p class="muted" id="mld">Loading…</p>');
  try{const r=await(src==='mr'?mrSearch:cfSearch)($('#mq').value.trim(),off);if(my!==seq)return;off+=20;$('#mld')?.remove();$('#mlist').insertAdjacentHTML('beforeend',r.map(card).join('')||'<p class="muted">No results</p>');$('#mmore').hidden=r.length<20}
  catch(e){if(my!==seq)return;$('#mld')?.remove();$('#mlist').insertAdjacentHTML('beforeend',`<p class="er">${esc(e.message)}</p>`)}}
const J=async(u,h)=>{const r=await fetch(u,h?{headers:h}:undefined);if(!r.ok)throw new Error('HTTP '+r.status+' for '+u.split('?')[0]);return r.json()},getFile=async(u,n)=>new File([await(await fetch(u)).blob()],n);
async function mrDeps(v,seen,out,notes,depth){if(depth>3)return;
  for(const d of v.dependencies||[]){if(d.dependency_type!=='required')continue;
    try{let dv;if(d.version_id)dv=await J(`https://api.modrinth.com/v2/version/${d.version_id}`);else dv=(await J(`https://api.modrinth.com/v2/project/${d.project_id}/version?loaders=${encodeURIComponent(JSON.stringify(v.loaders))}&game_versions=${encodeURIComponent(JSON.stringify(v.game_versions))}`))[0];
      if(!dv||seen.has(dv.project_id))continue;seen.add(dv.project_id);const f=dv.files.find(x=>x.primary)||dv.files[0];out.push({file:await getFile(f.url,f.filename),label:f.filename});await mrDeps(dv,seen,out,notes,depth+1)}
    catch(e){notes.push('Dependency skipped ('+(d.project_id||d.version_id)+'): '+e.message)}}}
const ldOf=f=>f.gameVersions.includes('NeoForge')?6:f.gameVersions.includes('Fabric')?4:f.gameVersions.includes('Forge')?1:0;
async function cfDeps(f,seen,out,notes,depth){if(depth>3)return;const gv=f.gameVersions.find(x=>/^\d+\.\d+(\.\d+)?$/.test(x)),ld=ldOf(f);
  for(const d of f.dependencies||[]){if(d.relationType!==3||seen.has(d.modId))continue;seen.add(d.modId);
    try{const l=(await J(`https://api.curseforge.com/v1/mods/${d.modId}/files?pageSize=20${gv?'&gameVersion='+gv:''}${ld?'&modLoaderType='+ld:''}`,CFH())).data||[],x=l.find(y=>y.downloadUrl&&/\.jar$/.test(y.fileName));
      if(!x){notes.push(`Dependency ${d.modId} skipped: no downloadable JAR (author disabled third-party downloads?)`);continue}
      out.push({file:await getFile(x.downloadUrl,x.fileName),label:x.fileName});await cfDeps(x,seen,out,notes,depth+1)}
    catch(e){notes.push('Dependency skipped ('+d.modId+'): '+e.message)}}}
async function dlMod(s,id,btn){const t=btn.innerHTML;btn.disabled=true;btn.textContent='Downloading…';
  try{const out=[],notes=[],seen=new Set();
    if(s==='mr'){const v=(await J(`https://api.modrinth.com/v2/project/${id}/version${LD()?'?loaders='+encodeURIComponent(JSON.stringify([LD()])):''}`))[0];if(!v)throw new Error('No version found for this loader filter');const f=v.files.find(x=>x.primary)||v.files[0];seen.add(v.project_id);out.push({file:await getFile(f.url,f.filename),label:f.filename});btn.textContent='Fetching dependencies…';await mrDeps(v,seen,out,notes,0)}
    else{const f=((await J(`https://api.curseforge.com/v1/mods/${id}/files?pageSize=20${CFL[LD()]?'&modLoaderType='+CFL[LD()]:''}`,CFH())).data||[]).find(x=>x.downloadUrl&&/\.jar$/.test(x.fileName));if(!f)throw new Error('The author disabled third-party downloads for this mod, or no JAR was found.');seen.add(+id);out.push({file:await getFile(f.downloadUrl,f.fileName),label:f.fileName});btn.textContent='Fetching dependencies…';await cfDeps(f,seen,out,notes,0)}
    tab('convert');window.queue=out.slice(1);await openJar(out[0].file);
    if(out.length>1)log(`Required dependencies: ${out.slice(1).map(x=>x.label).join(', ')}. After you export ${out[0].label}, each dependency is scanned and converted next.`,'ok');notes.forEach(n=>log(n,'wn'))}
  catch(e){alert(e.message)}btn.disabled=false;btn.innerHTML=t}
async function nextQ(){while(window.queue?.length){const x=window.queue.shift();await openJar(x.file);log(`Dependency: ${x.label} (${window.queue.length} more after this one)`,'ok');if(!$('#go').disabled){$('#go').click();return}log('Nothing convertible in this dependency (code-only library), moving on.','wn')}}
document.querySelectorAll('.seg a').forEach(a=>a.onclick=()=>{document.querySelectorAll('.seg a').forEach(x=>x.classList.remove('on'));a.classList.add('on');src=a.dataset.s;$('#cfk').hidden=src!=='cf';load(1)});
$('#cfk').value=localStorage.getItem('cfkey')||'';$('#cfk').onchange=e=>{localStorage.setItem('cfkey',e.target.value.trim());load(1)};
$('#mq').oninput=()=>{clearTimeout(dbt);dbt=setTimeout(()=>load(1),500)};$('#ml').onchange=()=>load(1);$('#mmore').onclick=()=>load(0);
$('#mlist').onclick=e=>{const b=e.target.closest('button[data-id]');if(b)dlMod(b.dataset.s,b.dataset.id,b)};
document.querySelector('.tabs [data-v=mods]').addEventListener('click',()=>{if(!$('#mlist').children.length)load(1)});
