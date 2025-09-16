let currentSettings = null;
let currentDay = null;
let eventsBound = false;
let tickStarted = false;
let state = { mode:'IDLE', endAt:null, paused:false, pauseLeft:0, tickHandle:null, notificationGranted:false };
const $ = sel => document.querySelector(sel);
const TASK_FIELDS = [
  { key:'deepTask1', textId:'deepTask1Text', doneId:'deepTask1Done' },
  { key:'deepTask2', textId:'deepTask2Text', doneId:'deepTask2Done' },
  { key:'smallTask1', textId:'smallTask1Text', doneId:'smallTask1Done' },
  { key:'smallTask2', textId:'smallTask2Text', doneId:'smallTask2Done' }
];

const IFTHEN = [
  {id:'Start-Friction-01', when:'IDLE', text:'胸口發緊/想逃 → 先做 5 分鐘：設鬧鐘→打開講義→寫 1 句目標→讀第一頁。5 分鐘後可停。'},
  {id:'Start-Friction-02', when:'IDLE', text:'腦中想延後 → 先做 5 分鐘，再決定要不要續上 25′。'},
  {id:'Start-Friction-03', when:'IDLE', text:'90 秒仍卡 → 做同主題微任務：列 3 個小標題/抄 3 行定義。'},
  {id:'Schedule-Interrupt-01', when:'INTERRUPT', text:'被打斷：先 90 秒寫下「下一步」，然後改約到 Fallback；再失手→晚間 Recovery 25。'},
  {id:'Leisure-Boundary-01', when:'LEISURE', text:'電玩：只打一局 ≤40′；本局結束 + 鬧鐘響→存檔→關機。'},
  {id:'Leisure-Boundary-02', when:'LEISURE', text:'影集：只看單集 ≤30′；片尾一到→站起→喝水→關平台。'},
  {id:'Energy-02', when:'SURGE', text:'想爆衝：今日最多 2 個 50′ 深度段；加碼請寫在紙上排明天第一段。'}
];

function defaultSettings(){
  return {primaryStart:'08:30',primaryEnd:'09:30',fallbackStart:'13:30',fallbackEnd:'14:30',recoveryStart:'21:00', lastDayDate:today()};
}
function defaultTasks(){
  return {
    deepTask1:{text:'',done:false},
    deepTask2:{text:'',done:false},
    smallTask1:{text:'',done:false},
    smallTask2:{text:'',done:false}
  };
}
function defaultDay(date=today()){
  return {date, goal:'', frictionLogs:[], sessions:[], done:false, tasks:defaultTasks()};
}
function mergeSettings(settings){
  return {...defaultSettings(), ...(settings||{})};
}
function ensureTasks(day){
  const base = defaultTasks();
  const existing = (day && day.tasks) || {};
  const merged = {};
  for (const key of Object.keys(base)){
    const value = existing[key] || {};
    merged[key] = { text: value.text || '', done: !!value.done };
  }
  return merged;
}
function normalizeDay(day){
  if (!day) return defaultDay();
  const normalized = {...defaultDay(day.date || today()), ...day};
  normalized.frictionLogs = Array.isArray(day.frictionLogs) ? day.frictionLogs : [];
  normalized.sessions = Array.isArray(day.sessions) ? day.sessions : [];
  normalized.tasks = ensureTasks(day);
  return normalized;
}
function today(){
  return new Date().toISOString().slice(0,10);
}

function refreshUI(){
  if (!currentSettings || !currentDay) return;
  $('#primaryStart').value = currentSettings.primaryStart || '';
  $('#primaryEnd').value = currentSettings.primaryEnd || '';
  $('#fallbackStart').value = currentSettings.fallbackStart || '';
  $('#fallbackEnd').value = currentSettings.fallbackEnd || '';
  $('#recoveryStart').value = currentSettings.recoveryStart || '21:00';
  $('#goal').value = currentDay.goal || '';
  TASK_FIELDS.forEach(({key, textId, doneId}) => {
    const task = (currentDay.tasks && currentDay.tasks[key]) || {text:'',done:false};
    const textEl = document.getElementById(textId);
    const doneEl = document.getElementById(doneId);
    if (textEl) textEl.value = task.text || '';
    if (doneEl) doneEl.checked = !!task.done;
  });
}

function setupEventHandlers(){
  if (eventsBound) return;

  $('#saveSettings').onclick = async () => {
    const lastDayDate = currentSettings?.lastDayDate || currentDay?.date || today();
    currentSettings = {
      ...currentSettings,
      primaryStart:$('#primaryStart').value,
      primaryEnd:$('#primaryEnd').value,
      fallbackStart:$('#fallbackStart').value,
      fallbackEnd:$('#fallbackEnd').value,
      recoveryStart:$('#recoveryStart').value,
      lastDayDate
    };
    currentDay.goal = $('#goal').value;
    await persistSettings();
    await persistDay();
    helper('已儲存設定與今日目標。');
  };

  $('#newDay').onclick = async () => {
    currentDay = defaultDay(today());
    if (currentSettings) currentSettings = {...currentSettings, lastDayDate: currentDay.date};
    refreshUI();
    renderLogs();
    await persistDay();
    await persistSettings();
    helper('新的一天，先寫下今日最低標 3 件事。');
  };

  $('#friction').oninput = e => $('#frictionVal').textContent = e.target.value;
  $('#logFriction').onclick = async () => {
    if (!currentDay) return;
    currentDay.frictionLogs.push({t:Date.now(), val:parseInt($('#friction').value,10)});
    await persistDay();
    helper('已記錄當下抗拒分數。');
  };

  document.querySelectorAll('.primary').forEach(btn => {
    btn.onclick = () => {
      const kind = btn.dataset.timer;
      if (kind) startTimer(kind);
    };
  });
  $('#pauseBtn').onclick = pauseTimer;
  $('#resumeBtn').onclick = resumeTimer;
  $('#stopBtn').onclick = stopTimer;
  $('#breakBtn').onclick = () => startTimer('BREAK_5');
  $('#interruptedBtn').onclick = interrupted;
  $('#doneBtn').onclick = () => markDone();
  $('#leisureBtn').onclick = leisureTicket;
  $('#notifyBtn').onclick = requestNotify;

  TASK_FIELDS.forEach(({key, textId, doneId}) => {
    const textEl = document.getElementById(textId);
    const doneEl = document.getElementById(doneId);
    if (textEl){
      textEl.addEventListener('input', async () => {
        if (!currentDay) return;
        currentDay.tasks[key].text = textEl.value;
        await persistDay();
      });
    }
    if (doneEl){
      doneEl.addEventListener('change', async () => {
        if (!currentDay) return;
        currentDay.tasks[key].done = doneEl.checked;
        await persistDay();
      });
    }
  });

  document.querySelector('#exportJson')?.addEventListener('click', exportJson);
  document.querySelector('#exportCsv')?.addEventListener('click', exportCsv);
  document.querySelector('#importJson')?.addEventListener('change', ev => {
    const f = ev.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const parsed = JSON.parse(e.target.result);
        currentSettings = mergeSettings(parsed.settings || {});
        currentDay = normalizeDay(parsed.day || defaultDay(today()));
        if (currentSettings) currentSettings.lastDayDate = currentDay.date;
        refreshUI();
        renderLogs();
        await persistSettings();
        await persistDay();
        helper('匯入完成。');
      } catch(err){
        helper('匯入失敗。');
      }
    };
    reader.readAsText(f);
    ev.target.value = '';
  });

  eventsBound = true;
}

function helper(msg){ $('#helper').textContent = msg; }
function showIfThen(context){
  const box = $('#ifthenBox'); box.innerHTML='';
  IFTHEN.filter(r => r.when===context).forEach(r => {
    const div = document.createElement('div');
    div.className='rule';
    div.innerHTML = `<h4>${r.id}</h4><div>${r.text}</div>`;
    box.appendChild(div);
  });
}

function startTimer(kind){
  const presets = {'WARMUP_5':5,'POMO_25':25,'DEEP_50':50,'RECOVERY_25':25,'BREAK_5':5};
  const mins = presets[kind] || 25;
  state.mode = kind;
  state.endAt = Date.now() + mins*60000;
  state.paused = false;
  state.pauseLeft = 0;
  saveSession({type:kind, start:Date.now(), planned:mins});
  beep(220, 0.04);
  showIfThen(kind==='WARMUP_5'?'IDLE':(kind==='RECOVERY_25'?'INTERRUPT':(kind==='BREAK_5'?'LEISURE':'SURGE')));
  updateState();
}

function pauseTimer(){
  if (!state.endAt || state.paused) return;
  state.pauseLeft = state.endAt - Date.now();
  state.paused = true;
  state.endAt = null;
  updateState();
}
function resumeTimer(){
  if (!state.paused) return;
  state.endAt = Date.now() + state.pauseLeft;
  state.paused = false;
  updateState();
}
function stopTimer(){
  if (!state.mode || state.mode==='IDLE') return;
  finalizeSession(false);
  resetState();
}
function interrupted(){
  finalizeSession(false, '被打斷');
  showIfThen('INTERRUPT');
  const s = currentSettings || defaultSettings();
  const next = nextWindowCandidate(s);
  helper(`建議：改約到 ${next.label}（${next.start}）或今晚 ${s.recoveryStart} 來一個 Recovery 25。`);
  notify('被打斷了','已寫下下一步，建議移到 Fallback 或 Recovery 25。');
}
function markDone(){
  finalizeSession(true);
  helper('已記錄完成。建議 5′ 走動或伸展。');
}
function leisureTicket(){
  showIfThen('LEISURE');
  notify('開啟休閒票','電玩≤40′、影集≤30′；22:30 後改紙本/伸展/靜觀。');
}

function nextWindowCandidate(s){
  const now = new Date();
  const [fh,fm] = (s.fallbackStart||'13:30').split(':').map(Number);
  const f = new Date(); f.setHours(fh,fm,0,0);
  return now < f ? {label:'Fallback', start:s.fallbackStart} : {label:'Recovery 25', start:s.recoveryStart};
}

function updateState(){
  $('#stateDisplay').textContent = '狀態：' + state.mode + (state.paused?'（暫停）':'');
}
function resetState(){
  state.endAt=null; state.paused=false; state.pauseLeft=0; state.mode='IDLE';
  updateState();
}

function saveSession(meta){
  if (!currentDay) return;
  const session = {id:crypto.randomUUID(), ...meta, end:null, done:false, notes:'', date:currentDay.date};
  currentDay.sessions.push(session);
  persistDay();
  DB.addSession(session).catch(err => console.error('新增時段失敗', err));
  renderLogs();
}
function finalizeSession(done, notes){
  if (!currentDay) return;
  const sess = currentDay.sessions.find(s => !s.end);
  if (!sess) return;
  sess.end = Date.now();
  sess.done = !!done;
  if (notes) sess.notes = (sess.notes||'') + notes;
  sess.actual = Math.round((sess.end - sess.start)/60000);
  persistDay();
  DB.addSession(sess).catch(err => console.error('更新時段失敗', err));
  renderLogs();
}

function tick(){
  const el = $('#timerDisplay');
  const loop = ()=>{
    let rem = 0;
    if (state.endAt && !state.paused){
      rem = Math.max(0, state.endAt - Date.now());
      if (rem <= 0){
        const finishedMode = state.mode;
        finalizeSession(true);
        notify('時間到', finishedMode + ' 完成');
        beep(880,0.08); beep(660,0.08); beep(440,0.12);
        if (finishedMode!=='BREAK_5') startTimer('BREAK_5'); else resetState();
      }
    }
    const mm = Math.floor(rem/60000), ss = Math.floor((rem%60000)/1000);
    el.textContent = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    requestAnimationFrame(loop);
  };
  loop();
}

function renderLogs(){
  const ul = document.querySelector('#logList');
  if (!ul) return;
  ul.innerHTML='';
  const sessions = (currentDay && currentDay.sessions) ? currentDay.sessions.slice().reverse() : [];
  sessions.forEach(s => {
    const li = document.createElement('li');
    const start = new Date(s.start).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const end = s.end ? new Date(s.end).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—';
    li.innerHTML = `<b>${labelOf(s.type)}</b>｜${start}–${end}｜${s.actual||0} 分｜${s.done?'✅ 完成':'⏺ 進行中/停止'}${s.notes?('｜'+s.notes):''}`;
    ul.appendChild(li);
  });
}

function labelOf(t){
  return {'WARMUP_5':'起步5','POMO_25':'番茄25','DEEP_50':'深度50','RECOVERY_25':'救援25','BREAK_5':'休息5'}[t] || t;
}

function requestNotify(){
  if (!('Notification' in window)) { helper('裝置不支援通知。'); return; }
  Notification.requestPermission().then(r => {
    state.notificationGranted = (r==='granted');
    helper(r==='granted'?'已開啟通知提醒。':'未授權通知。');
  });
}
function notify(title, body){
  try{ if (state.notificationGranted) new Notification(title,{body}); }catch(e){}
}

function exportJson(){
  const payload = { settings: currentSettings, day: currentDay };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  const filename = currentDay?.date || today();
  a.download = `mvd_${filename}.json`; a.click();
}
function exportCsv(){
  const header = 'date,type,start,end,actual,done,notes\n';
  const rows = (currentDay?.sessions||[]).map(s => [
    currentDay.date, labelOf(s.type),
    new Date(s.start).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
    s.end?new Date(s.end).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'',
    s.actual||'', s.done?'1':'0', (s.notes||'').replace(/,/g,';')
  ].join(','));
  download(header + rows.join('\n'), `mvd_${currentDay?.date||today()}.csv`, 'text/csv');
}
function download(content, filename, mime){
  const blob = new Blob([content], {type:mime}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

function clone(obj){
  return JSON.parse(JSON.stringify(obj));
}
function persistSettings(){
  if (!currentSettings) return Promise.resolve();
  return DB.saveSettings(clone(currentSettings)).catch(err => console.error('儲存設定失敗', err));
}
function persistDay(){
  if (!currentDay) return Promise.resolve();
  return DB.upsertDay(clone(currentDay)).catch(err => console.error('儲存每日資料失敗', err));
}

async function loadData(){
  const todayDate = today();
  const [settingsFromDB, todayRecord] = await Promise.all([
    DB.getSettings().catch(() => null),
    DB.getDay(todayDate).catch(() => null)
  ]);
  currentSettings = mergeSettings(settingsFromDB || {});
  let dayRecord = todayRecord;
  const lastDayDate = currentSettings.lastDayDate;
  if (!dayRecord && lastDayDate && lastDayDate !== todayDate){
    dayRecord = await DB.getDay(lastDayDate).catch(() => null);
  }
  currentDay = normalizeDay(dayRecord || defaultDay(lastDayDate || todayDate));
  if (!dayRecord) await persistDay();
  if (!settingsFromDB || currentSettings.lastDayDate !== currentDay.date){
    currentSettings.lastDayDate = currentDay.date;
    await persistSettings();
  }
}

function ensureTick(){
  if (!tickStarted){
    tickStarted = true;
    tick();
  }
}

async function boot(){
  try {
    await DB.ready;
    await DB.migrateFromLocalStorage();
    await loadData();
    console.log('IndexedDB ready');
    setupEventHandlers();
    refreshUI();
    renderLogs();
    showIfThen('IDLE');
    ensureTick();
    setupInstall();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  } catch (err) {
    console.error('初始化失敗', err);
  }
}

function beep(freq=880, dur=0.1){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type='sine'; o.frequency.value=freq; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+dur);
    o.start(); o.stop(ctx.currentTime+dur);
  }catch(e){}
}

function setupInstall(){
  let deferredPrompt = null;
  const btn = document.querySelector('#installBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    btn.hidden = false;
    btn.onclick = async ()=>{
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      btn.hidden = true;
    };
  });
}

window.addEventListener('load', boot);
