'use strict';
/* ================= Utilidades ================= */
const $ = s => document.querySelector(s);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now() + Math.random().toString(16).slice(2));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['dom','lun','mar','mié','jue','vie','sáb'];

function dateKey(ts){ const d = new Date(ts); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtFecha(ts){ const d = new Date(ts); return DIAS[d.getDay()]+' '+d.getDate()+' '+MESES[d.getMonth()].slice(0,3); }
function fmtDur(ms){ const m = Math.round(ms/60000); if(m < 60) return m+' min'; return Math.floor(m/60)+' h '+(m%60)+' min'; }
function fmtNum(n){ return (Math.round(n*10)/10).toLocaleString('es-AR'); }
function fmtW(w){ const n = Number(w)||0; return n % 1 ? n.toLocaleString('es-AR') : String(n); }
function haceDias(ts){
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const d = new Date(ts); d.setHours(0,0,0,0);
  const diff = Math.round((hoy - d)/86400000);
  if(diff <= 0) return 'hoy';
  if(diff === 1) return 'ayer';
  return 'hace '+diff+' días';
}
function toast(msg, ms=2400){
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.add('hidden'), ms);
}

/* ================= Datos (localStorage) ================= */
const KEY = 'gymlog_v1';
const DEFAULTS = {
  version: 1,
  settings: { restSet: 90, restEx: 150, sound: true, vibrate: true, wake: true, lastBackup: 0 },
  custom: [],     // ejercicios creados por el usuario
  routines: [],   // {id, name, items:[{exId, rest, ss, sets:[{r,w}]}]}
  sessions: [],   // historial: {id, routineId, name, startedAt, endedAt, date, entries:[{exId, sets:[{w,r,done}]}]}
  active: null    // entrenamiento en curso (sobrevive recargas)
};
// Clon profundo con respaldo para motores sin structuredClone.
function clone(o){
  try{ if(typeof structuredClone === 'function') return structuredClone(o); }catch(e){}
  return JSON.parse(JSON.stringify(o));
}
// Normaliza cualquier objeto (de localStorage o de un archivo importado) a un DB válido.
// Nunca confía en los tipos: un campo roto no debe poder tumbar la app.
function sanitize(d){
  const base = clone(DEFAULTS);
  if(!d || typeof d !== 'object') return base;
  const arr = v => Array.isArray(v) ? v : [];
  const out = clone(base);
  out.custom = arr(d.custom).filter(e => e && typeof e === 'object' && typeof e.id === 'string')
    .map(e => ({ id: e.id, n: String(e.n || 'Ejercicio'), m: MUSCLES.includes(e.m) ? e.m : 'Otro' }));
  out.routines = arr(d.routines).filter(r => r && typeof r === 'object' && typeof r.id === 'string')
    .map(r => ({
      id: r.id, name: String(r.name || 'Rutina'),
      items: arr(r.items).filter(it => it && typeof it.exId === 'string').map(it => ({
        exId: it.exId,
        rest: it.rest==null ? null : (Number(it.rest)||0),
        ss: it.ss==null ? null : (Number(it.ss)||0),
        sets: arr(it.sets).length ? arr(it.sets).map(s => ({ r: s && s.r!=null ? s.r : null, w: s && s.w!=null ? s.w : null }))
                                  : [{r:10,w:null}]
      }))
    }));
  out.routines.forEach(r => normalizeSS(r.items));
  out.sessions = arr(d.sessions).filter(s => s && typeof s === 'object' && typeof s.id === 'string')
    .map(s => {
      const startedAt = Number(s.startedAt) || Number(s.endedAt) || Date.now();
      const endedAt = Number(s.endedAt) || startedAt;
      return {
        id: s.id, routineId: s.routineId || null, name: String(s.name || 'Entrenamiento'),
        startedAt, endedAt, date: typeof s.date === 'string' ? s.date : dateKey(endedAt),
        entries: arr(s.entries).filter(e => e && typeof e.exId === 'string').map(e => ({
          exId: e.exId,
          sets: arr(e.sets).map(x => ({ w: Number(x && x.w) || 0, r: Number(x && x.r) || 0, done: true }))
        })).filter(e => e.sets.length)
      };
    })
    .filter(s => s.entries.length)
    .sort((a,b) => a.endedAt - b.endedAt);
  const st = (d.settings && typeof d.settings === 'object') ? d.settings : {};
  const num = (v, def) => { const n = Number(v); return (isFinite(n) && n >= 0) ? Math.min(600, n) : def; };
  out.settings = {
    restSet: num(st.restSet, base.settings.restSet),
    restEx: num(st.restEx, base.settings.restEx),
    sound: st.sound !== false, vibrate: st.vibrate !== false, wake: st.wake !== false,
    lastBackup: Number(st.lastBackup) || 0
  };
  out.active = validActive(d.active, out) ? d.active : null;
  return out;
}
// Un entrenamiento en curso solo se restaura si tiene la forma esperada.
function validActive(a){
  if(!a || typeof a !== 'object' || !Array.isArray(a.entries) || !a.entries.length) return false;
  if(!a.entries.every(e => e && typeof e.exId === 'string' && Array.isArray(e.sets) && e.sets.length)) return false;
  if(!a.entries.every(e => e.sets.every(s => s && typeof s === 'object'))) return false;
  return typeof a.name === 'string' && Number(a.startedAt) > 0;
}
function loadDB(){
  const raw = localStorage.getItem(KEY);
  if(!raw) return clone(DEFAULTS);
  try{
    return sanitize(JSON.parse(raw));
  }catch(e){
    // Datos ilegibles: se conservan aparte en vez de pisarlos con el primer guardado.
    console.error('DB ilegible', e);
    try{ localStorage.setItem(KEY+'_corrupto_'+Date.now(), raw); }catch(e2){}
    setTimeout(()=>toast('⚠️ Datos ilegibles. Se guardó una copia; podés importar un respaldo.', 8000), 800);
    return clone(DEFAULTS);
  }
}
let db = loadDB();
let persistAsked = false;
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(db)); }
  catch(e){ toast('⚠️ No se pudo guardar: '+e.message); }
  if(!persistAsked){
    persistAsked = true;
    try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){}
  }
}
function allEx(){ return EXERCISES.concat(db.custom); }
function exById(id){ return allEx().find(e=>e.id===id) || {id, n:'(ejercicio eliminado)', m:'Otro'}; }

/* ================= Métricas de sesión ================= */
function setVol(s){ return (Number(s.w)||0) * (Number(s.r)||0); }
function sessionVolume(sess){ return sess.entries.reduce((a,e)=>a + e.sets.filter(x=>x.done).reduce((b,x)=>b+setVol(x),0), 0); }
function sessionDoneSets(sess){ return sess.entries.reduce((a,e)=>a + e.sets.filter(x=>x.done).length, 0); }
function sessionTotalSets(sess){ return sess.entries.reduce((a,e)=>a + e.sets.length, 0); }

/* ================= Navegación ================= */
function showTab(name){
  document.querySelectorAll('.tab').forEach(s=>s.classList.remove('active'));
  $('#tab-'+name).classList.add('active');
  document.querySelectorAll('#bottomnav button').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  if(name==='rutinas') renderHome();
  if(name==='progreso') renderProgress();
  if(name==='ajustes') renderSettings();
  window.scrollTo(0,0);
}
function openScreen(id){ $('#'+id).classList.add('open'); syncBody(); }
function closeScreen(id){ $('#'+id).classList.remove('open'); syncBody(); }
// Mantiene en <body> las clases que el CSS usa para ordenar las barras fijas.
function syncBody(){
  const b = document.body;
  b.classList.toggle('screen-open', !!document.querySelector('.screen.open'));
  b.classList.toggle('resting', !!(db.active && db.active.rest));
  b.classList.toggle('has-banner', !$('#active-banner').classList.contains('hidden'));
}

/* ================= Modales ================= */
function modal(html){
  $('#modal-root').innerHTML = '<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="sheet">'+html+'</div></div>';
}
function closeModal(){ $('#modal-root').innerHTML=''; }
function confirmDlg(title, msg, okLabel, onOk, danger){
  confirmDlg._cb = onOk;
  modal(
    '<div class="sheethead"><div class="stitle">'+esc(title)+'</div></div>'+
    '<div class="sheetbody"><p class="muted" style="padding:0 4px 8px">'+esc(msg)+'</p></div>'+
    '<div class="sheetfoot"><button class="btn ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn '+(danger?'danger':'primary')+'" onclick="closeModal();confirmDlg._cb()">'+esc(okLabel)+'</button></div>'
  );
}

/* ================= Inicio (rutinas) ================= */
function renderHome(){
  const last = db.sessions[db.sessions.length-1];
  $('#home-last').textContent = last ? ('Última: '+last.name+' · '+haceDias(last.endedAt)) : '';
  const needBackup = db.sessions.length >= 3 && (Date.now() - (db.settings.lastBackup||0)) > 14*86400000;
  $('#backup-hint').innerHTML = needBackup
    ? '<div class="card">💾 Hace más de 2 semanas que no exportás un respaldo. Andá a <b>Ajustes → Exportar</b>.</div>' : '';
  const list = $('#routines-list');
  if(!db.routines.length){
    list.innerHTML = '<div class="empty">Todavía no tenés rutinas.<br>Creá la primera con el botón de abajo 💪</div>';
    return;
  }
  list.innerHTML = db.routines.map(r=>{
    const nser = r.items.reduce((a,it)=>a+it.sets.length,0);
    const lastS = [...db.sessions].reverse().find(s=>s.routineId===r.id);
    const meta = r.items.length+' ejercicios · '+nser+' series'
      + (lastS ? (' · '+haceDias(lastS.endedAt)+' · '+fmtNum(sessionVolume(lastS))+' kg') : '');
    return '<div class="card rcard">'+
      '<div class="rtitle">'+esc(r.name)+'</div>'+
      '<div class="rmeta muted small">'+esc(meta)+'</div>'+
      '<div class="ractions">'+
        '<button class="btn primary" onclick="startWorkout(\''+r.id+'\')">▶ Entrenar</button>'+
        '<button class="btn ghost" onclick="openEditor(\''+r.id+'\')">✎ Editar</button>'+
      '</div></div>';
  }).join('');
}

/* ================= Editor de rutina ================= */
let ed = null;
function nextName(){
  for(const L of 'ABCDEFGHIJ'){ if(!db.routines.some(r=>r.name==='Rutina '+L)) return 'Rutina '+L; }
  return 'Rutina '+(db.routines.length+1);
}
function openEditor(rid){
  const r = rid ? db.routines.find(x=>x.id===rid) : null;
  ed = r ? clone(r) : { id:null, name:nextName(), items:[] };
  $('#ed-name').value = ed.name;
  renderEditor();
  openScreen('screen-editor');
}
function closeEditor(){ ed = null; closeScreen('screen-editor'); }
function ssGroupsInfo(items){
  const m = new Map();
  for(const it of items){ if(it.ss!=null && !m.has(it.ss)) m.set(it.ss, m.size); }
  return m;
}
function linkedWithPrev(i){ return ed.items[i].ss!=null && ed.items[i-1] && ed.items[i-1].ss===ed.items[i].ss; }
function renderEditor(){
  const gi = ssGroupsInfo(ed.items);
  const body = $('#ed-body');
  if(!ed.items.length){ body.innerHTML = '<div class="empty">Agregá ejercicios a la rutina</div>'+edFoot(); return; }
  body.innerHTML = ed.items.map((it,i)=>{
    const ex = exById(it.exId);
    const gIdx = it.ss!=null ? gi.get(it.ss) : -1;
    const badge = gIdx>=0 ? '<span class="ssbadge">Superserie '+String.fromCharCode(65+gIdx)+'</span>' : '';
    const rows = it.sets.map((s,j)=>
      '<div class="setrow">'+
        '<div class="setnum">'+(j+1)+'</div>'+
        '<div class="prevtxt"></div>'+
        '<input class="setin" type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" value="'+(s.w??'')+'" onchange="edSet('+i+','+j+',\'w\',this.value)">'+
        '<input class="setin" type="number" inputmode="numeric" step="1" min="0" placeholder="reps" value="'+(s.r??'')+'" onchange="edSet('+i+','+j+',\'r\',this.value)">'+
        '<button class="rowdel" onclick="edDelSet('+i+','+j+')">✕</button>'+
      '</div>').join('');
    return '<div class="excard '+(gIdx>=0?'ss ss-'+(gIdx%4):'')+'">'+
      '<div class="exhead"><div>'+badge+'<div class="exname">'+esc(ex.n)+'</div><div class="exmuscle">'+esc(ex.m)+'</div></div>'+
      '<div class="exbtns">'+
        '<button class="btn" title="Subir" onclick="edMove('+i+',-1)">↑</button>'+
        '<button class="btn" title="Bajar" onclick="edMove('+i+',1)">↓</button>'+
        '<button class="btn" title="Quitar" onclick="edDelEx('+i+')">🗑</button>'+
      '</div></div>'+
      '<div class="setshead"><span>#</span><span></span><span>KG</span><span>REPS</span><span></span></div>'+
      rows+
      '<div class="setxs">'+
        '<button class="btn mini ghost" onclick="edAddSet('+i+')">＋ serie</button>'+
        (i>0 ? '<button class="btn mini ghost" onclick="edToggleSS('+i+')">'+(linkedWithPrev(i)?'✂ Quitar superserie':'⛓ Superserie con anterior')+'</button>' : '')+
        '<button class="btn mini ghost" onclick="edRest('+i+')">⏱ '+(it.rest!=null ? it.rest+'s' : 'descanso')+'</button>'+
      '</div>'+
    '</div>';
  }).join('') + edFoot();
}
function edFoot(){
  return '<button class="btn ghost wide" onclick="openPicker(pickerAddToEditor)">＋ Agregar ejercicio</button>'+
    (ed.id ? '<button class="btn danger wide" onclick="edDeleteRoutine()">Eliminar rutina</button>' : '');
}
function edSet(i,j,k,v){ ed.items[i].sets[j][k] = v==='' ? null : Number(v); }
function edAddSet(i){
  const sets = ed.items[i].sets;
  const last = sets[sets.length-1] || {r:10, w:null};
  sets.push({r:last.r, w:last.w});
  renderEditor();
}
function edDelSet(i,j){
  ed.items[i].sets.splice(j,1);
  if(!ed.items[i].sets.length) ed.items[i].sets.push({r:10, w:null});
  renderEditor();
}
function edDelEx(i){
  const nombre = exById(ed.items[i].exId).n;
  confirmDlg('Quitar ejercicio', '¿Sacar "'+nombre+'" de la rutina?', 'Quitar', ()=>{
    ed.items.splice(i,1); normalizeSS(ed.items); renderEditor();
  }, true);
}
function edMove(i,dir){
  const j = i+dir;
  if(j<0 || j>=ed.items.length) return;
  [ed.items[i], ed.items[j]] = [ed.items[j], ed.items[i]];
  normalizeSS(ed.items);
  renderEditor();
}
function edToggleSS(i){
  const it = ed.items[i], prev = ed.items[i-1];
  if(!prev) return;
  if(it.ss!=null && prev.ss===it.ss){ it.ss = null; }
  else {
    const g = prev.ss!=null ? prev.ss : (Math.max(0, ...ed.items.map(x=>x.ss||0)) + 1);
    prev.ss = g; it.ss = g;
  }
  normalizeSS(ed.items);
  renderEditor();
}
// Los grupos de superserie deben ser consecutivos; los sueltos se deshacen.
function normalizeSS(items){
  let g = 0, i = 0;
  while(i < items.length){
    const cur = items[i].ss;
    if(cur==null){ i++; continue; }
    let j = i;
    while(j < items.length && items[j].ss===cur) j++;
    if(j-i < 2){ items[i].ss = null; }
    else { g++; for(let k=i;k<j;k++) items[k].ss = g; }
    i = j;
  }
}
function edRest(i){
  edRest._i = i;
  const cur = ed.items[i].rest;
  modal('<div class="sheethead"><div class="stitle">Descanso de este ejercicio</div></div>'+
    '<div class="sheetbody"><p class="muted small" style="padding:0 4px 8px">Vacío = usa el descanso general ('+db.settings.restSet+'s). Poné 0 para pasar sin descanso.</p>'+
    '<input id="rest-in" class="searchin" type="number" inputmode="numeric" min="0" max="600" placeholder="segundos" value="'+(cur??'')+'"></div>'+
    '<div class="sheetfoot"><button class="btn ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn primary" onclick="edRestOk()">Listo</button></div>');
}
function edRestOk(){
  const v = $('#rest-in').value;
  ed.items[edRest._i].rest = v==='' ? null : Math.max(0, Math.min(600, Number(v)||0));
  closeModal(); renderEditor();
}
function edDeleteRoutine(){
  confirmDlg('Eliminar rutina', 'Se borra la rutina "'+ed.name+'". El historial de sesiones NO se pierde.', 'Eliminar', ()=>{
    db.routines = db.routines.filter(r=>r.id!==ed.id);
    save(); closeEditor(); renderHome(); toast('Rutina eliminada');
  }, true);
}
function saveEditor(){
  ed.name = $('#ed-name').value.trim() || nextName();
  if(ed.id){
    const idx = db.routines.findIndex(r=>r.id===ed.id);
    if(idx>=0) db.routines[idx] = clone(ed); else { ed.id = uid(); db.routines.push(clone(ed)); }
  } else {
    ed.id = uid();
    db.routines.push(clone(ed));
  }
  save(); closeEditor(); showTab('rutinas'); toast('Rutina guardada ✔');
}
function pickerAddToEditor(exId){
  ed.items.push({exId, rest:null, ss:null, sets:[{r:10,w:null},{r:10,w:null},{r:10,w:null}]});
  renderEditor();
}

/* ================= Selector de ejercicios ================= */
let pick = null;
function normTxt(s){ return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }
function openPicker(cb, opts){
  pick = { cb, q:'', muscle:'Todos', multi: !(opts && opts.multi===false), added:new Set() };
  modal('<div class="sheethead"><div class="stitle">Ejercicios</div><button class="btn icon" onclick="closeModal()">✕</button></div>'+
    '<div style="padding:0 16px"><input id="pick-q" class="searchin" placeholder="Buscar ejercicio…" oninput="pickQ(this.value)"></div>'+
    '<div class="chips" id="pick-chips"></div>'+
    '<div class="sheetbody" id="pick-list"></div>'+
    (pick.multi ? '<div class="sheetfoot"><button class="btn primary" onclick="closeModal()">Listo</button></div>' : ''));
  renderPickChips(); renderPickList();
}
function pickQ(v){ pick.q = v; renderPickList(); }
function pickMuscle(m){ pick.muscle = m; renderPickChips(); renderPickList(); }
function renderPickChips(){
  const ms = ['Todos'].concat(MUSCLES);
  $('#pick-chips').innerHTML = ms.map(m=>
    '<button class="chip '+(pick.muscle===m?'active':'')+'" onclick="pickMuscle(\''+m+'\')">'+m+'</button>').join('');
}
function renderPickList(){
  const q = normTxt(pick.q||'').trim();
  const list = allEx().filter(e=>
    (pick.muscle==='Todos' || e.m===pick.muscle) && (!q || normTxt(e.n).includes(q)));
  const groups = {};
  for(const e of list){ (groups[e.m] = groups[e.m]||[]).push(e); }
  let html = '';
  for(const m of MUSCLES){
    if(!groups[m]) continue;
    html += '<div class="mgroup">'+m+'</div>'+groups[m].map(e=>{
      const added = pick.added.has(e.id);
      return '<button class="pickrow '+(added?'added':'')+'" onclick="pickSel(\''+e.id+'\')">'+
        '<span class="pname">'+esc(e.n)+'</span>'+(added?'<span class="pchk">✔</span>':'')+'</button>';
    }).join('');
  }
  if((pick.q||'').trim().length >= 2){
    html += '<div class="mgroup">¿No está en la lista?</div>'+
      '<button class="pickrow" onclick="pickCreate()"><span class="pname">＋ Crear «'+esc(pick.q.trim())+'»</span></button>';
  }
  $('#pick-list').innerHTML = html || '<div class="empty">Sin resultados</div>';
}
function pickSel(id){
  if(!pick.multi) closeModal();
  else { pick.added.add(id); renderPickList(); }
  if(pick && pick.cb) pick.cb(id);
}
function pickCreate(){
  const name = pick.q.trim();
  if(!name) return;
  const id = 'c-'+uid();
  db.custom.push({id, n: name.charAt(0).toUpperCase()+name.slice(1), m:'Otro'});
  save();
  pickSel(id);
}

/* ================= Entrenamiento ================= */
// Todas las series hechas de un ejercicio en una sesión (puede figurar en más de una entrada).
function setsDeEjercicio(sess, exId){
  return sess.entries.filter(e=>e.exId===exId).flatMap(e=>e.sets.filter(s=>s.done));
}
function lastDoneSets(exId){
  for(let i=db.sessions.length-1; i>=0; i--){
    const d = setsDeEjercicio(db.sessions[i], exId).filter(s=>Number(s.w)||Number(s.r));
    if(d.length) return d;
  }
  return [];
}
// Peso máximo histórico. Con `incluirActiva` suma lo ya marcado en la sesión en curso.
function maxWeight(exId, incluirActiva){
  let m = 0;
  const scan = sess => {
    for(const e of sess.entries)
      if(e.exId===exId)
        for(const s of e.sets)
          if(s.done && Number(s.w) > m) m = Number(s.w);
  };
  for(const sess of db.sessions) scan(sess);
  if(incluirActiva) scan(incluirActiva);
  return m;
}
function startWorkout(rid){
  if(db.active){ toast('Ya hay un entrenamiento en curso'); openWorkout(); return; }
  const r = db.routines.find(x=>x.id===rid);
  if(!r || !r.items.length){ toast('La rutina no tiene ejercicios'); return; }
  db.active = {
    id: uid(), routineId: r.id, name: r.name, startedAt: Date.now(), rest: null,
    entries: r.items.map(it=>{
      const prev = lastDoneSets(it.exId);
      return {
        exId: it.exId, rest: it.rest ?? null, ss: it.ss ?? null, pr: maxWeight(it.exId),
        sets: it.sets.map((s,j)=>({
          w: prev[j] ? prev[j].w : (s.w ?? ''),
          r: prev[j] ? prev[j].r : (s.r ?? ''),
          prev: prev[j] ? fmtW(prev[j].w)+'×'+(prev[j].r||0) : '—',
          done: false
        }))
      };
    })
  };
  save(); primeAudio(); openWorkout(); requestWake();
}
function openWorkout(){
  if(!db.active) return;
  $('#active-banner').classList.add('hidden'); syncBody();
  renderWorkout();
  openScreen('screen-workout');
}
function closeWorkout(){
  closeScreen('screen-workout');
  if(db.active){
    $('#ab-name').textContent = db.active.name;
    $('#active-banner').classList.remove('hidden'); syncBody();
  }
}
function renderWorkout(){
  const A = db.active; if(!A) return;
  $('#wk-title').textContent = A.name;
  const gi = ssGroupsInfo(A.entries);
  let html = '', i = 0;
  while(i < A.entries.length){
    const e = A.entries[i];
    if(e.ss!=null){
      let j = i;
      while(j < A.entries.length && A.entries[j].ss===e.ss) j++;
      const gN = gi.get(e.ss);
      html += '<div class="ssgroup ss-'+(gN%4)+'"><div class="sslabel">Superserie '+String.fromCharCode(65+gN)+' · alterná ejercicios</div>';
      for(let k=i;k<j;k++) html += wkExCard(k);
      html += '</div>';
      i = j;
    } else { html += wkExCard(i); i++; }
  }
  html += '<button class="btn ghost wide" onclick="openPicker(wkAddExercise)">＋ Agregar ejercicio</button>';
  html += '<button class="btn danger wide" onclick="discardWorkout()">Descartar entrenamiento</button>';
  $('#wk-body').innerHTML = html;
  updateElapsed();
}
function wkExCard(i){
  const A = db.active, e = A.entries[i], ex = exById(e.exId);
  const rows = e.sets.map((s,j)=>
    '<div class="setrow '+(s.done?'done':'')+'">'+
      '<div class="setnum">'+(j+1)+'</div>'+
      '<div class="prevtxt">'+esc(s.prev||'—')+(s.isPR && s.done ? ' 🏆':'')+'</div>'+
      '<input class="setin" type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" value="'+(s.w===''?'':s.w)+'" onchange="wkSet('+i+','+j+',\'w\',this.value)">'+
      '<input class="setin" type="number" inputmode="numeric" step="1" min="0" placeholder="reps" value="'+(s.r===''?'':s.r)+'" onchange="wkSet('+i+','+j+',\'r\',this.value)">'+
      '<button class="setchk" onclick="wkToggle('+i+','+j+')">✔</button>'+
    '</div>').join('');
  const restTxt = e.rest!=null ? e.rest+'s' : db.settings.restSet+'s';
  return '<div class="excard">'+
    '<div class="exhead"><div><div class="exname">'+esc(ex.n)+'</div><div class="exmuscle">'+esc(ex.m)+' · descanso '+restTxt+'</div></div>'+
    '<div class="exbtns"><button class="btn" title="Historial" onclick="openExDetail(\''+e.exId+'\')">📈</button></div></div>'+
    '<div class="setshead"><span>#</span><span>Anterior</span><span>KG</span><span>REPS</span><span></span></div>'+
    rows+
    '<div class="setxs">'+
      '<button class="btn mini ghost" onclick="wkAddSet('+i+')">＋ serie</button>'+
      '<button class="btn mini ghost" onclick="wkDelSet('+i+')">− serie</button>'+
    '</div>'+
  '</div>';
}
function wkSet(i,j,k,v){
  const e = db.active.entries[i], s = e.sets[j];
  s[k] = v==='' ? '' : Number(v);
  // Si se corrige el peso, el trofeo deja de valer para esa serie.
  if(k==='w' && s.isPR){ s.isPR = false; e.pr = maxWeight(e.exId, db.active); }
  save(); updateElapsed();
}
function wkAddSet(i){
  const sets = db.active.entries[i].sets;
  const last = sets[sets.length-1];
  sets.push({ w: last ? last.w : '', r: last ? last.r : '', prev:'—', done:false });
  save(); renderWorkout();
}
function wkDelSet(i){
  const sets = db.active.entries[i].sets;
  for(let j=sets.length-1; j>=0; j--){
    if(!sets[j].done){ sets.splice(j,1); break; }
  }
  if(!sets.length) sets.push({w:'', r:'', prev:'—', done:false});
  save(); renderWorkout();
}
function wkAddExercise(exId){
  const prev = lastDoneSets(exId);
  db.active.entries.push({
    exId, rest:null, ss:null, pr:maxWeight(exId),
    sets:[0,1,2].map(j=>({
      w: prev[j] ? prev[j].w : '', r: prev[j] ? prev[j].r : '',
      prev: prev[j] ? fmtW(prev[j].w)+'×'+(prev[j].r||0) : '—', done:false
    }))
  });
  save(); renderWorkout();
}
function ssGroupEntries(A, idx){
  const e = A.entries[idx];
  if(e.ss==null) return [idx];
  const out = [];
  for(let k=0;k<A.entries.length;k++) if(A.entries[k].ss===e.ss) out.push(k);
  return out;
}
function wkToggle(i,j){
  primeAudio();
  const A = db.active, e = A.entries[i], s = e.sets[j];
  s.done = !s.done;
  if(s.done){
    s.doneAt = Date.now();
    const w = Number(s.w)||0;
    // El récord se compara contra el histórico Y contra lo ya levantado hoy,
    // así no se repite el aviso con pesos menores dentro de la misma sesión.
    if(w > 0 && e.pr > 0 && w > e.pr){
      s.isPR = true;
      e.pr = w;
      toast('🏆 ¡Récord! '+fmtW(w)+' kg en '+exById(e.exId).n);
    }
    const secs = restSecsFor(i,j);
    if(secs > 0) startRest(secs);
    else {
      const nxt = siguienteEnGrupo(A,i);
      if(nxt >= 0) toast('→ '+exById(A.entries[nxt].exId).n, 1600);
    }
  } else {
    // Al desmarcar se deshace todo lo que provocó el marcado.
    s.doneAt = null;
    if(s.isPR){ s.isPR = false; e.pr = maxWeight(e.exId, A); }
    if(A.rest) A.rest = null;
  }
  save(); renderWorkout(); renderRest();
}
// Regla de descansos. Se decide por lo que queda PENDIENTE, no por la posición,
// para que las superseries con distinta cantidad de series funcionen bien.
//  - Queda otro ejercicio del grupo con series pendientes → 0s (pasás directo). Se puede pisar con el descanso del ejercicio.
//  - Se completó todo el ejercicio (o todo el grupo) → descanso "entre ejercicios".
//  - Resto → descanso del ejercicio, o el general "entre series".
function pendientes(e){ return e.sets.filter(s=>!s.done).length; }
function restSecsFor(i,j){
  const A = db.active, e = A.entries[i], S = db.settings;
  if(e.ss!=null){
    const otro = ssGroupEntries(A,i).some(k => k!==i && pendientes(A.entries[k]) > 0);
    if(otro) return e.rest!=null ? e.rest : 0;   // la ronda sigue: sin descanso
    if(pendientes(e) === 0) return S.restEx;     // se cerró toda la superserie
    return e.rest!=null ? e.rest : S.restSet;    // solo queda este ejercicio del grupo
  }
  if(pendientes(e) === 0) return S.restEx;
  return e.rest!=null ? e.rest : S.restSet;
}
// Siguiente ejercicio del grupo que todavía tenga series pendientes.
function siguienteEnGrupo(A, i){
  const grp = ssGroupEntries(A, i);
  if(grp.length < 2) return -1;
  const pos = grp.indexOf(i);
  for(let n=1; n<grp.length; n++){
    const k = grp[(pos+n) % grp.length];
    if(k !== i && pendientes(A.entries[k]) > 0) return k;
  }
  return -1;
}

/* ================= Cronómetro de descanso ================= */
function startRest(secs){
  db.active.rest = { end: Date.now()+secs*1000, total: secs };
  save(); renderRest();
}
function restAdj(d){
  const R = db.active && db.active.rest; if(!R) return;
  R.end += d*1000;
  R.total = Math.max(1, R.total+d);
  if(R.end <= Date.now()) restDone(false);
  else { save(); renderRest(); }
}
function restSkip(){ if(db.active){ db.active.rest = null; save(); } renderRest(); }
function restDone(notify){
  if(db.active) db.active.rest = null;
  save(); renderRest();
  if(notify){ beep(); vib([220,120,220,120,320]); toast('💪 ¡A la siguiente serie!'); }
}
function renderRest(){
  const R = db.active && db.active.rest;
  const bar = $('#restbar');
  syncBody();
  if(!R){ bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const left = Math.max(0, R.end - Date.now());
  const s = Math.ceil(left/1000);
  $('#rest-time').textContent = Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  $('#rest-fill').style.width = Math.max(0, Math.min(100, left/(R.total*1000)*100))+'%';
}
function tick(){
  const A = db.active;
  if(!A) return;
  updateElapsed();
  if(A.rest){
    if(Date.now() >= A.rest.end) restDone(true);
    else renderRest();
  }
}
function updateElapsed(){
  const A = db.active; if(!A) return;
  const el = $('#wk-elapsed'); if(!el) return;
  const ms = Date.now() - A.startedAt;
  const m = Math.floor(ms/60000), sec = Math.floor(ms/1000)%60;
  const t = m < 60 ? m+':'+String(sec).padStart(2,'0') : Math.floor(m/60)+' h '+(m%60)+' min';
  el.textContent = t+' · '+fmtNum(sessionVolume(A))+' kg';
}

/* ================= Finalizar / descartar ================= */
function finishWorkout(){
  const A = db.active; if(!A) return;
  const done = sessionDoneSets(A), total = sessionTotalSets(A);
  if(done === 0){
    confirmDlg('Sin series completadas','No marcaste ninguna serie. ¿Descartar el entrenamiento?','Descartar', reallyDiscard, true);
    return;
  }
  const vol = sessionVolume(A);
  confirmDlg('Finalizar entrenamiento',
    done+'/'+total+' series · '+fmtNum(vol)+' kg de volumen · '+fmtDur(Date.now()-A.startedAt),
    'Guardar', ()=>{
      const sess = {
        id: A.id, routineId: A.routineId, name: A.name,
        startedAt: A.startedAt, endedAt: Date.now(), date: dateKey(Date.now()),
        // Si el mismo ejercicio aparece en varias entradas, se fusionan en una sola.
        entries: A.entries.reduce((acc,e)=>{
          const sets = e.sets.filter(s=>s.done).map(s=>({w:Number(s.w)||0, r:Number(s.r)||0, done:true}));
          if(!sets.length) return acc;
          const ya = acc.find(x=>x.exId===e.exId);
          if(ya) ya.sets.push(...sets); else acc.push({exId:e.exId, sets});
          return acc;
        }, [])
      };
      db.sessions.push(sess);
      db.active = null;
      save(); releaseWake(); renderRest();
      closeScreen('screen-workout');
      $('#active-banner').classList.add('hidden'); syncBody();
      showTab('progreso');
      toast('Entrenamiento guardado ✔ '+fmtNum(vol)+' kg');
    });
}
function discardWorkout(){
  confirmDlg('Descartar entrenamiento','Se pierde lo registrado en esta sesión (el historial anterior no se toca).','Descartar', reallyDiscard, true);
}
function reallyDiscard(){
  db.active = null;
  save(); releaseWake(); renderRest();
  closeScreen('screen-workout');
  $('#active-banner').classList.add('hidden'); syncBody();
  renderHome();
}

/* ================= Sonido / vibración / pantalla ================= */
let actx = null;
function primeAudio(){
  if(actx) return;
  try{ actx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
}
function beep(){
  if(!db.settings.sound) return;
  try{
    primeAudio();
    if(!actx) return;
    if(actx.state==='suspended') actx.resume();
    const t0 = actx.currentTime;
    [0,.22,.44].forEach((d,k)=>{
      const o = actx.createOscillator(), g = actx.createGain();
      o.connect(g); g.connect(actx.destination);
      o.frequency.value = k===2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t0+d);
      g.gain.exponentialRampToValueAtTime(0.5, t0+d+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0+d+0.18);
      o.start(t0+d); o.stop(t0+d+0.2);
    });
  }catch(e){}
}
function vib(pat){ if(db.settings.vibrate && navigator.vibrate){ try{ navigator.vibrate(pat); }catch(e){} } }
let wakeLock = null;
async function requestWake(){
  if(!db.settings.wake || !('wakeLock' in navigator)) return;
  try{ wakeLock = await navigator.wakeLock.request('screen'); }catch(e){}
}
function releaseWake(){ try{ if(wakeLock) wakeLock.release(); }catch(e){} wakeLock = null; }
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible'){
    if(db.active) requestWake();
    tick();
  }
});

/* ================= Progreso ================= */
let calY, calM, selDay = null, rvolSel = null;
function renderProgress(){
  const now = new Date();
  const ws = new Date(now); ws.setHours(0,0,0,0); ws.setDate(ws.getDate() - ((ws.getDay()+6)%7)); // lunes
  const weekSess = db.sessions.filter(s=>s.endedAt >= ws.getTime());
  const monthSess = db.sessions.filter(s=>{ const d = new Date(s.endedAt); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); });
  const weekVol = weekSess.reduce((a,s)=>a+sessionVolume(s),0);
  $('#prog-stats').innerHTML =
    '<div class="stat"><div class="v">'+weekSess.length+'</div><div class="l">esta semana</div></div>'+
    '<div class="stat"><div class="v">'+monthSess.length+'</div><div class="l">este mes</div></div>'+
    '<div class="stat"><div class="v">'+fmtNum(weekVol)+'</div><div class="l">kg semana</div></div>'+
    '<div class="stat"><div class="v">'+db.sessions.length+'</div><div class="l">total</div></div>';
  if(calY===undefined){ calY = now.getFullYear(); calM = now.getMonth(); }
  renderCal();
  renderRvol();
  renderHistory();
}
function calMove(d){
  calM += d;
  if(calM < 0){ calM = 11; calY--; }
  if(calM > 11){ calM = 0; calY++; }
  selDay = null;
  renderCal();
}
function sessByDate(){
  const m = {};
  for(const s of db.sessions){ (m[s.date] = m[s.date]||[]).push(s); }
  return m;
}
function renderCal(){
  $('#cal-title').textContent = MESES[calM]+' '+calY;
  const first = new Date(calY, calM, 1);
  const startDow = (first.getDay()+6)%7;
  const dim = new Date(calY, calM+1, 0).getDate();
  const byDate = sessByDate();
  const tk = dateKey(Date.now());
  let html = '';
  for(let b=0;b<startDow;b++) html += '<span></span>';
  for(let d=1;d<=dim;d++){
    const key = calY+'-'+String(calM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const has = byDate[key];
    html += '<button class="calday'+(has?' has':'')+(key===tk?' today':'')+(key===selDay?' sel':'')+'" onclick="calSel(\''+key+'\')">'+d+(has?'<span class="caldot"></span>':'')+'</button>';
  }
  $('#cal-grid').innerHTML = html;
  renderDayDetail();
}
function calSel(key){ selDay = selDay===key ? null : key; renderCal(); }
function renderDayDetail(){
  const el = $('#day-detail');
  if(!selDay){ el.innerHTML = ''; return; }
  const list = sessByDate()[selDay]||[];
  if(!list.length){ el.innerHTML = '<div class="muted small" style="padding:6px 2px">Sin entrenamientos ese día</div>'; return; }
  el.innerHTML = list.map(s=>
    '<div class="dayitem"><span><b>'+esc(s.name)+'</b> · '+fmtDur(s.endedAt-s.startedAt)+'</span>'+
    '<span class="muted">'+fmtNum(sessionVolume(s))+' kg</span></div>').join('');
}
function renderRvol(){
  const chips = $('#rvol-chips'), box = $('#rvol-chart');
  const ids = [...new Set(db.sessions.map(s=>s.routineId))];
  if(!ids.length){
    chips.innerHTML = '';
    box.innerHTML = '<div class="empty">Cuando guardes entrenamientos vas a ver el volumen por rutina</div>';
    return;
  }
  const opts = ids.map(id=>{
    const r = db.routines.find(x=>x.id===id);
    const s = db.sessions.find(x=>x.routineId===id);
    return { id, name: (r && r.name) || (s && s.name) || '—' };
  });
  if(!rvolSel || !ids.includes(rvolSel)) rvolSel = ids[ids.length-1];
  chips.innerHTML = opts.map(o=>
    '<button class="chip '+(o.id===rvolSel?'active':'')+'" onclick="rvolPick(\''+o.id+'\')">'+esc(o.name)+'</button>').join('');
  const vals = db.sessions.filter(s=>s.routineId===rvolSel).map(s=>sessionVolume(s)).slice(-20);
  box.innerHTML = '<div class="chartbox"><div class="muted small" style="margin-bottom:6px">Volumen por sesión (kg)</div>'+chartSVG(vals)+'</div>';
}
function rvolPick(id){ rvolSel = id; renderRvol(); }
function renderHistory(){
  const el = $('#history-list');
  if(!db.sessions.length){ el.innerHTML = '<div class="empty">Acá va a aparecer tu historial de entrenamientos</div>'; return; }
  el.innerHTML = [...db.sessions].reverse().slice(0,30).map(s=>{
    const open = renderHistory._open===s.id;
    const detail = open ? '<div class="sessdetail">'+
      s.entries.map(e=>{
        const d = e.sets.filter(x=>x.done);
        if(!d.length) return '';
        return '<div class="exline"><span>'+esc(exById(e.exId).n)+'</span>'+
          '<span class="sets">'+d.map(x=>fmtW(x.w)+'×'+(x.r||0)).join(' · ')+'</span></div>';
      }).join('')+
      '<button class="btn mini danger" style="margin-top:8px" onclick="event.stopPropagation();delSession(\''+s.id+'\')">Eliminar sesión</button>'+
      '</div>' : '';
    return '<div class="card sess" onclick="histToggle(\''+s.id+'\')">'+
      '<div class="sesshead"><span class="sname">'+esc(s.name)+'</span><span class="muted small">'+fmtFecha(s.endedAt)+'</span></div>'+
      '<div class="sessmeta"><span>⏱ '+fmtDur(s.endedAt-s.startedAt)+'</span><span>✅ '+sessionDoneSets(s)+' series</span><span>Σ '+fmtNum(sessionVolume(s))+' kg</span></div>'+
      detail+'</div>';
  }).join('');
}
function histToggle(id){ renderHistory._open = renderHistory._open===id ? null : id; renderHistory(); }
function delSession(id){
  confirmDlg('Eliminar sesión','Se borra este entrenamiento del historial.','Eliminar', ()=>{
    db.sessions = db.sessions.filter(s=>s.id!==id);
    save(); renderProgress();
  }, true);
}

/* ================= Detalle de ejercicio ================= */
function pickExerciseProgress(){ openPicker(openExDetail, {multi:false}); }
function exSessions(exId){
  const out = [];
  for(const sess of db.sessions){
    const d = setsDeEjercicio(sess, exId);
    if(d.length) out.push({sess, sets:d});
  }
  return out;
}
function openExDetail(exId){
  const ex = exById(exId);
  $('#exd-title').textContent = ex.n;
  const hist = exSessions(exId);
  let html = '';
  if(!hist.length){
    html = '<div class="empty">Todavía no registraste series de este ejercicio</div>';
  } else {
    const maxW = Math.max(...hist.flatMap(h=>h.sets.map(s=>Number(s.w)||0)));
    let bestSet = null;
    for(const h of hist) for(const s of h.sets){ if(!bestSet || setVol(s) > setVol(bestSet)) bestSet = s; }
    const totalSets = hist.reduce((a,h)=>a+h.sets.length,0);
    html += '<div class="prrow">'+
      '<div class="prbox"><div class="v">'+(maxW>0 ? fmtW(maxW)+' kg' : '—')+'</div><div class="l">Peso máx.</div></div>'+
      '<div class="prbox"><div class="v">'+(bestSet && setVol(bestSet)>0 ? fmtW(bestSet.w)+'×'+bestSet.r : '—')+'</div><div class="l">Mejor serie</div></div>'+
      '<div class="prbox"><div class="v">'+hist.length+'</div><div class="l">Sesiones</div></div>'+
      '<div class="prbox"><div class="v">'+totalSets+'</div><div class="l">Series</div></div>'+
    '</div>';
    const usaPeso = maxW > 0;
    const vals = hist.map(h=> usaPeso
      ? Math.max(...h.sets.map(s=>Number(s.w)||0))
      : h.sets.reduce((a,s)=>a+(Number(s.r)||0),0));
    html += '<div class="chartbox"><div class="muted small" style="margin-bottom:6px">'+
      (usaPeso ? 'Peso máximo por sesión' : 'Reps totales por sesión')+'</div>'+chartSVG(vals.slice(-20))+'</div>';
    html += '<div class="card">'+[...hist].reverse().slice(0,30).map(h=>
      '<div class="trow"><span class="td">'+fmtFecha(h.sess.endedAt)+'</span><span class="ts">'+
      h.sets.map(s=>fmtW(s.w)+'×'+(s.r||0)).join(' · ')+'</span></div>').join('')+'</div>';
  }
  $('#exd-body').innerHTML = html;
  openScreen('screen-exdetail');
}
function chartSVG(vals){
  if(vals.length < 2) return '<div class="muted small">Con 2+ sesiones vas a ver el gráfico acá</div>';
  const W = 320, H = 120, P = 12;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const rng = (mx-mn) || 1;
  const pts = vals.map((v,i)=>[
    P + i*(W-2*P)/(vals.length-1),
    H - P - ((v-mn)/rng)*(H-2*P)
  ]);
  const line = pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const dots = pts.map(p=>'<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3" fill="#3ddc84"/>').join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img">'+
    '<polyline points="'+line+'" fill="none" stroke="#3ddc84" stroke-width="2"/>'+dots+
    '<text x="'+P+'" y="10" fill="#8d96ab" font-size="9">máx '+fmtNum(mx)+'</text>'+
    '<text x="'+P+'" y="'+(H-3)+'" fill="#8d96ab" font-size="9">mín '+fmtNum(mn)+'</text>'+
  '</svg>';
}

/* ================= Ajustes ================= */
function renderSettings(){
  const S = db.settings;
  const used = (localStorage.getItem(KEY)||'').length;
  $('#settings-body').innerHTML =
    '<h2>Descansos</h2>'+
    '<div class="setting"><div><div class="sl">Entre series</div><div class="sd">segundos, por defecto</div></div>'+
    '<input class="numin" type="number" inputmode="numeric" min="0" max="600" value="'+S.restSet+'" onchange="setNum(\'restSet\',this.value)"></div>'+
    '<div class="setting"><div><div class="sl">Entre ejercicios</div><div class="sd">al terminar las series de un ejercicio</div></div>'+
    '<input class="numin" type="number" inputmode="numeric" min="0" max="600" value="'+S.restEx+'" onchange="setNum(\'restEx\',this.value)"></div>'+
    '<h2>Cronómetro</h2>'+
    swRow('sound','Sonido al terminar el descanso')+
    swRow('vibrate','Vibración')+
    swRow('wake','Mantener la pantalla encendida')+
    '<h2>Tus datos</h2>'+
    '<div class="setting"><div><div class="sl">Exportar respaldo</div><div class="sd">'+
      (S.lastBackup ? 'Último: '+fmtFecha(S.lastBackup) : 'Nunca exportaste')+' · '+Math.max(1,Math.round(used/1024))+' KB</div></div>'+
      '<button class="btn primary" onclick="exportData()">Exportar</button></div>'+
    '<div class="setting"><div><div class="sl">Importar respaldo</div><div class="sd">Reemplaza los datos actuales</div></div>'+
      '<button class="btn ghost" onclick="document.getElementById(\'imp-file\').click()">Importar</button>'+
      '<input id="imp-file" type="file" accept=".json,application/json" class="hidden" onchange="importData(this)"></div>'+
    '<div class="setting"><div><div class="sl">Almacenamiento persistente</div><div class="sd" id="persist-state">Verificando…</div></div></div>'+
    '<div class="setting"><div><div class="sl">Borrar todo</div><div class="sd">Rutinas, historial y ajustes</div></div>'+
      '<button class="btn danger" onclick="wipeAll()">Borrar</button></div>'+
    '<p class="muted small" style="margin:16px">GymLog · funciona 100% sin conexión · tus datos viven solo en este dispositivo. Exportá un respaldo cada tanto, por las dudas.</p>';
  if(navigator.storage && navigator.storage.persisted){
    navigator.storage.persisted().then(p=>{
      const el = $('#persist-state');
      if(el) el.textContent = p ? '✔ Activado: el navegador protege tus datos' : 'No garantizado — exportá respaldos seguido';
    });
  } else {
    const el = $('#persist-state');
    if(el) el.textContent = 'No disponible en este navegador';
  }
}
function swRow(key, label){
  return '<div class="setting"><div class="sl">'+label+'</div>'+
    '<label class="switch"><input type="checkbox" '+(db.settings[key]?'checked':'')+
    ' onchange="setBool(\''+key+'\',this.checked)"><span class="sl2"></span></label></div>';
}
function setNum(k,v){ db.settings[k] = Math.max(0, Math.min(600, Number(v)||0)); save(); toast('Guardado'); }
function setBool(k,v){ db.settings[k] = !!v; save(); }
function exportData(){
  const blob = new Blob([JSON.stringify(db, null, 1)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gymlog-respaldo-'+dateKey(Date.now())+'.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  db.settings.lastBackup = Date.now();
  save(); renderSettings(); toast('Respaldo exportado 💾');
}
function importData(input){
  const f = input.files && input.files[0];
  if(!f) return;
  const rd = new FileReader();
  rd.onload = ()=>{
    try{
      const d = JSON.parse(rd.result);
      if(!d || typeof d !== 'object' || !Array.isArray(d.routines) || !Array.isArray(d.sessions))
        throw new Error('formato inválido');
      // Se normaliza el archivo entero: un campo roto no puede dejar la app inutilizable.
      const limpio = sanitize(d);
      confirmDlg('Importar respaldo',
        'Se reemplazan los datos actuales por los del archivo ('+limpio.routines.length+' rutinas, '+limpio.sessions.length+' sesiones).',
        'Importar', ()=>{ db = limpio; save(); location.reload(); });
    }catch(e){ toast('⚠️ Archivo inválido: '+e.message); }
  };
  rd.readAsText(f);
  input.value = '';
}
function wipeAll(){
  confirmDlg('Borrar TODO','Se eliminan todas las rutinas, el historial y los ajustes de GymLog.','Borrar todo', ()=>{
    confirmDlg('¿Seguro?','Última confirmación: esta acción no tiene vuelta atrás.','Sí, borrar', ()=>{
      db = clone(DEFAULTS);
      save(); location.reload();
    }, true);
  }, true);
}

/* ================= Init ================= */
function init(){
  showTab('rutinas');
  if(db.active){
    // Un entrenamiento en curso roto no debe impedir usar la app.
    try{
      if(db.active.rest && Date.now() >= db.active.rest.end) db.active.rest = null;
      openWorkout();
    }catch(e){
      console.error('No se pudo restaurar el entrenamiento', e);
      db.active = null; save();
      closeScreen('screen-workout');
      toast('⚠️ No se pudo restaurar el entrenamiento en curso');
    }
  }
  renderRest();
  setInterval(tick, 250);
  if('serviceWorker' in navigator && location.protocol.indexOf('http')===0){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
    // Si se instala una versión nueva mientras la app está abierta, se recarga una sola vez
    // (nunca en medio de un entrenamiento: los datos ya están guardados, pero evita el salto).
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(recargando || !navigator.serviceWorker.controller) return;
      recargando = true;
      if(!db.active) location.reload();
    });
  }
}
init();
