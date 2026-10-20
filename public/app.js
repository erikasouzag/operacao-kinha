const $=id=>document.getElementById(id);
const KEY='operacaoKinhaDataV1';
const emptyData=()=>({
  sessions:[],
  questions:[],
  reviews:[],
  customSubjects:[]
});let data;try{data=JSON.parse(localStorage.getItem(KEY))||emptyData()}catch(e){data=emptyData()}
data.sessions ||= [];data.questions ||= [];data.reviews ||= [];
data.customSubjects ||= [];
let elapsed=0,startedAt=null,interval=null,reviewFilter='pending';

let timerMode = 'free';
let pomodoroPhase = 'focus';
let phaseStartedAt = null;
let phaseElapsed = 0;
let focusSeconds = 0;
let pomodoroCycle = 0;
let pomodoroRunning = false;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dateOffset=(n)=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let activeStorageKey = KEY;
let cloudReady = false;
let cloudUserId = null;
let cloudSyncTimer = null;
let cloudSyncInProgress = false;
let cloudSyncPending = false;
let cloudLoadVersion = 0;

const save = () => {
  localStorage.setItem(activeStorageKey, JSON.stringify(data));

  if (cloudReady && cloudUserId) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
      syncStudyDataToCloud();
    }, 1000);
  }
};

async function syncStudyDataToCloud() {
  if (!cloudReady || !cloudUserId) return;

  if (cloudSyncInProgress) {
    cloudSyncPending = true;
    return;
  }

  cloudSyncInProgress = true;
  const userId = cloudUserId;

  try {
    const snapshot = JSON.parse(JSON.stringify(data));

    const { error } = await supabaseClient
      .from('study_data')
      .upsert({
        user_id: userId,
        data: snapshot,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('Erro ao salvar progresso na nuvem:', error.message);
    }
  } catch (error) {
    console.error('Falha na sincronizacao:', error);
  } finally {
    cloudSyncInProgress = false;

    if (cloudSyncPending) {
      cloudSyncPending = false;
      if (cloudReady && cloudUserId === userId) {
        syncStudyDataToCloud();
      }
    }
  }
}

async function loadStudyDataFromCloud(session) {
  const user = session?.user;
  if (!user) return;

  const version = ++cloudLoadVersion;
  cloudReady = false;
  cloudUserId = null;

  // Cada conta possui seu proprio armazenamento local.
  activeStorageKey = `${KEY}:${user.id}`;

  try {
    const localData = localStorage.getItem(activeStorageKey);
    data = localData ? JSON.parse(localData) : emptyData();
  } catch (error) {
    data = emptyData();
  }

  data.sessions ||= [];
  data.questions ||= [];
  data.reviews ||= [];
  data.customSubjects ||= [];

  try {
    const { data: record, error } = await supabaseClient
      .from('study_data')
      .select('data')
      .eq('user_id', user.id)
      .maybeSingle();

    if (version !== cloudLoadVersion) return;

    if (error) {
      console.error('Erro ao carregar progresso da nuvem:', error.message);
      renderAll();
      return;
    }

    if (record?.data && typeof record.data === 'object') {
      data = { ...emptyData(), ...record.data };
      data.sessions ||= [];
      data.questions ||= [];
      data.reviews ||= [];
      data.customSubjects ||= [];
    }

    localStorage.setItem(activeStorageKey, JSON.stringify(data));

    cloudUserId = user.id;
    cloudReady = true;

    renderAll();

    // Se ainda nao existe registro na nuvem, cria o primeiro.
    if (!record) {
      syncStudyDataToCloud();
    }

    console.log('Progresso sincronizado para a conta:', user.email);
  } catch (error) {
    if (version !== cloudLoadVersion) return;
    console.error('Falha ao carregar dados de estudo:', error);
    renderAll();
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    // Evita chamadas de rede dentro do callback de autenticacao.
    setTimeout(() => loadStudyDataFromCloud(session), 0);
  } else {
    cloudLoadVersion++;
    cloudReady = false;
    cloudUserId = null;
    clearTimeout(cloudSyncTimer);

    if (event === 'SIGNED_OUT') {
      activeStorageKey = KEY;
      data = emptyData();
      renderAll();
    }
  }
});
const fmt=s=>{s=Math.max(0,Math.floor(s||0));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':')};
const hfmt=s=>{s=Math.floor((s||0)/60);let h=Math.floor(s/60),m=s%60;return h?`${h}h${m?` ${m}m`:''}`:`${m}m`};
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const current = () =>
  elapsed + (startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0);

function phaseCurrent() {
  return phaseElapsed +
    (phaseStartedAt ? Math.floor((Date.now() - phaseStartedAt) / 1000) : 0);
}

function phaseDuration() {
  const input = pomodoroPhase === 'focus'
    ? $('focusMinutes')
    : $('breakMinutes');

  return Math.max(1, Number(input.value) || 1) * 60;
}
function daySessions(){return data.sessions.filter(s=>s.date===today())}
function periodDates(period){if(period==='day')return [today()];if(period==='week')return Array.from({length:7},(_,i)=>dateOffset(i-6));return null}
function inPeriod(item,period){const dates=periodDates(period);return !dates||dates.includes(item.date)}
function sumSessions(list){return list.reduce((n,s)=>n+(s.seconds||0),0)}
function currentTodayTotal() {
  return sumSessions(daySessions()) +
    ((startedAt || elapsed > 0) ? current() : 0);
}
function switchPomodoroPhase() {
  if (pomodoroPhase === 'focus') {
    elapsed = current();
    startedAt = null;
    pomodoroCycle++;
    pomodoroPhase = 'break';
    $('timerState').textContent = 'PAUSA';
    $('timerHint').textContent = 'Hora de descansar! O tempo da pausa nÃ£o conta como estudo.';
  } else {
    pomodoroPhase = 'focus';
    startedAt = Date.now();
    $('timerState').textContent = 'EM FOCO';
    $('timerHint').textContent = 'Pausa encerrada. Vamos voltar aos estudos!';
  }

  phaseElapsed = 0;
  phaseStartedAt = Date.now();
}
function updateTimer() {
  let displaySeconds = current();

  if (timerMode !== 'free') {
    let remaining = Math.max(
      0,
      phaseDuration() - phaseCurrent()
    );

    if (pomodoroRunning && remaining <= 0) {
      switchPomodoroPhase();

      remaining = Math.max(
        0,
        phaseDuration() - phaseCurrent()
      );
    }

    displaySeconds = remaining;
  }

  $('timerDisplay').textContent = fmt(displaySeconds);

const focusDisplay = $('focusTimerDisplay');
if (focusDisplay) focusDisplay.textContent = fmt(displaySeconds);

const focusMode = $('focusModeLabel');
if (focusMode) {
  focusMode.textContent = timerMode === 'free'
    ? 'MODO FOCO · LIVRE'
    : timerMode === 'pomodoro'
      ? `MODO FOCO · POMODORO · ${pomodoroPhase === 'focus' ? 'FOCO' : 'PAUSA'}`
      : `MODO FOCO · PERSONALIZADO · ${pomodoroPhase === 'focus' ? 'FOCO' : 'PAUSA'}`;
}

const focusPhase = $('focusPhaseLabel');
if (focusPhase) {
  focusPhase.textContent = timerMode !== 'free' && pomodoroPhase === 'break'
    ? 'MOMENTO DE DESCANSAR'
    : 'CONCENTRE-SE NO SEU OBJETIVO';
}

  const total = currentTodayTotal();

  $('todayTotal').textContent = fmt(total);

  const pct = Math.min(
    100,
    Math.round(
      total / (Number($('goal').value) * 3600) * 100
    )
  );

  $('goalText').textContent = pct + '%';
  $('goalBar').style.width = pct + '%';

  $('todaySessions').textContent = daySessions().length;

  $('todayQuestions').textContent = data.questions
    .filter(q => q.date === today())
    .reduce((n, q) => n + q.total, 0);

  $('pendingReviews').textContent =
    data.reviews.filter(r => !r.done).length;
}

function renderRecent() {
  const arr = data.sessions.slice().reverse();

  $('recentSessions').innerHTML = arr.length
    ? arr.map(s => `
      <div class="session-row">
        <div>
          <strong>${safe(s.subject)}</strong>
          <small>${s.date} • ${safe(s.time || '')}</small>
        </div>
        <strong class="time">${fmt(s.seconds)}</strong>
        <button
          class="small-btn"
          data-session-delete="${s.id}"
          type="button"
        >Excluir</button>
      </div>
    `).join('')
    : '<div class="empty">Suas sessÃµes aparecerÃ£o aqui.</div>';
}

function renderDashboard(){const period=$('dashPeriod').value;const sess=data.sessions.filter(s=>inPeriod(s,period));const qs=data.questions.filter(q=>inPeriod(q,period));const secs=sumSessions(sess);const totalQ=qs.reduce((n,q)=>n+q.total,0),correct=qs.reduce((n,q)=>n+q.correct,0);$('dashTime').textContent=fmt(secs);$('dashSessions').textContent=sess.length;$('dashQuestions').textContent=totalQ;$('dashAccuracy').textContent=totalQ?Math.round(correct/totalQ*100)+'%':'—';
const bySubject={};sess.forEach(s=>bySubject[s.subject]=(bySubject[s.subject]||0)+s.seconds);
const entries=Object.entries(bySubject).sort((a,b)=>b[1]-a[1]);
    const colors = [
  '#00E5FF',
  '#B14CFF',
  '#00E676',
  '#FFB300',
  '#FF4081',
  '#FF6D00',
  '#536DFE',
  '#F50057',
  '#C6FF00',
  '#18FFFF'];let offset=0;const all=entries.reduce((n,e)=>n+e[1],0);const parts=entries.map((e,i)=>{const start=all?offset/all*100:0;offset+=e[1];return `${colors[i%colors.length]} ${start}% ${all?offset/all*100:100}%`});$('pieChart').style.background=entries.length?`conic-gradient(${parts.join(',')})`:'conic-gradient(#444 0 100%)';$('pieTotal').textContent=all?hfmt(all):'0m';$('pieLegend').innerHTML=entries.length?entries.map((e,i)=>`<div class="legend-item"><div class="legend-name"><i class="swatch" style="background:${colors[i%colors.length]}"></i><span>${safe(e[0])}</span></div><strong>${hfmt(e[1])}</strong></div>`).join(''):'<p class="muted">Registre sessÃµes para ver a distribuiÃ§Ã£o.</p>';
 const dates=period==='day'?[today()]:period==='week'?Array.from({length:7},(_,i)=>dateOffset(i-6)):Array.from(new Set(data.sessions.map(s=>s.date))).sort().slice(-7);const daily=dates.map(d=>({date:d,seconds:sumSessions(sess.filter(s=>s.date===d))}));const max=Math.max(3600,...daily.map(x=>x.seconds));$('barChart').innerHTML=daily.length?daily.map(d=>`<div class="bar-col"><span class="bar-value">${d.seconds?hfmt(d.seconds):'—'}</span><div class="bar" style="height:${Math.max(2,d.seconds/max*145)}px"></div><span class="bar-label">${d.date.slice(8,10)}/${d.date.slice(5,7)}</span></div>`).join(''):'<p class="muted">Sem dados neste período.</p>';
 $('subjectSummary').innerHTML=entries.length?entries.map(e=>`<div class="summary-item"><span>${safe(e[0])}</span><strong>${hfmt(e[1])}</strong></div>`).join(''):'<div class="empty">Seus tempos por matÃ©ria aparecerÃ£o aqui apÃ³s as primeiras sessÃµes.</div>'}
function renderQuestions(){const arr=data.questions.slice().reverse();$('questionHistory').innerHTML=arr.length?arr.map(q=>`<div class="record-row"><div><strong>${safe(q.subject)}</strong><small>${q.date}${q.notes?' â€¢ '+safe(q.notes):''}</small></div><div style="text-align:right"><strong>${q.correct}/${q.total} acertos</strong><small>${Math.round(q.correct/q.total*100)}% de aproveitamento</small></div></div>`).join(''):'<div class="empty">Seus registros de questÃµes aparecerÃ£o aqui.</div>'}
function renderReviews(){let arr=data.reviews.slice().sort((a,b)=>a.date.localeCompare(b.date));if(reviewFilter==='pending')arr=arr.filter(r=>!r.done);$('reviewList').innerHTML=arr.length?arr.map(r=>`<div class="review-row"><div class="review-main"><strong>${safe(r.topic)} ${r.done?'âœ“':''}</strong><small>${safe(r.subject)} â€¢ ${safe(r.type)} â€¢ <span class="${!r.done&&r.date<today()?'overdue':''}">${r.date<today()&&!r.done?'ATRASADA â€¢ ':''}${r.date}</span></small></div><div class="review-actions"><button class="small-btn ${r.done?'':'done'}" data-review-toggle="${r.id}">${r.done?'Reabrir':'Concluir'}</button><button class="small-btn" data-review-delete="${r.id}">Excluir</button></div></div>`).join(''):'<div class="empty">'+(reviewFilter==='pending'?'Nenhuma revisÃ£o pendente. Bom trabalho!':'Nenhuma revisÃ£o cadastrada ainda.')+'</div>'}
function renderManualSessions() {
  const container = $('manualSessionsHistory');
  if (!container) return;

  const arr = data.sessions
    .filter(s => String(s.time || '').startsWith('Registro manual'))
    .slice()
    .reverse();

  container.innerHTML = arr.length
    ? arr.map(s => `
      <div class="session-row">
        <div>
          <strong>${safe(s.subject)}</strong>
          <small>${s.date} • ${safe(s.time || 'Registro manual')}</small>
        </div>
        <strong class="time">${fmt(s.seconds)}</strong>
        <button
          class="small-btn"
          data-session-delete="${s.id}"
          type="button"
        >Excluir</button>
      </div>
    `).join('')
    : '<div class="empty">Seus registros manuais aparecerÃ£o aqui.</div>';
}

function renderAll() {
  updateTimer();
  renderRecent();
  renderManualSessions();
  renderDashboard();
  renderQuestions();
  renderReviews();
}
  const container = $('manualSessionsHistory');
 
function start() {
  if (pomodoroRunning || startedAt) return;

  if (timerMode === 'free') {
    startedAt = Date.now();
    $('timerState').textContent = 'EM ANDAMENTO';
    $('timerHint').textContent = 'SessÃ£o em andamento. Mantenha o foco!';
  } else {
    pomodoroRunning = true;

    if (!phaseStartedAt) {
      phaseStartedAt = Date.now();
    }

    if (pomodoroPhase === 'focus') {
      startedAt = Date.now();
      $('timerState').textContent = 'EM FOCO';
      $('timerHint').textContent = 'Hora de se concentrar. Vamos nessa!';
    } else {
      startedAt = null;
      $('timerState').textContent = 'PAUSA';
      $('timerHint').textContent = 'Descanse um pouco. A pausa nÃ£o conta como estudo.';
    }
  }

  $('startBtn').disabled = true;
  $('startBtn').textContent = '▶ EM ANDAMENTO';
  $('pauseBtn').disabled = false;
  $('finishBtn').disabled = false;
  $('subject').disabled = true;

  clearInterval(interval);
  interval = setInterval(updateTimer, 250);
  updateTimer();
 }
function pause() {
  if (!startedAt && !pomodoroRunning) return;

  if (timerMode === 'free') {
    elapsed = current();
    startedAt = null;
  } else {
    if (pomodoroPhase === 'focus' && startedAt) {
      elapsed = current();
      startedAt = null;
    }

    phaseElapsed = phaseCurrent();
    phaseStartedAt = null;
    pomodoroRunning = false;
  }

  clearInterval(interval);
  interval = null;

  $('timerState').textContent = 'PAUSADO';
  $('startBtn').disabled = false;
  $('startBtn').textContent = '▶ CONTINUAR';
  $('pauseBtn').disabled = true;
  $('timerHint').textContent =
    'Cronômetro pausado. Continue quando estiver pronta.';

  updateTimer();
}
function finish() {
  if (startedAt) {
    elapsed = current();
  }

  clearInterval(interval);
  interval = null;

  startedAt = null;
  pomodoroRunning = false;
  phaseStartedAt = null;
  phaseElapsed = 0;

  if (elapsed > 0) {
    data.sessions.push({
      id: Date.now(),
      subject: $('subject').value,
      seconds: elapsed,
      date: today(),
      time: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      })
    });

    save();
  }

  elapsed = 0;
  focusSeconds = 0;
  pomodoroCycle = 0;
  pomodoroPhase = 'focus';

  $('timerDisplay').textContent = '00:00:00';
  $('timerState').textContent = 'PRONTO';
  $('startBtn').disabled = false;
  $('startBtn').textContent = '▶ INICIAR ESTUDO';
  $('pauseBtn').disabled = true;
  $('finishBtn').disabled = true;
  $('subject').disabled = false;
  $('timerHint').textContent = 'SessÃ£o salva. Cada minuto conta!';

  updateTimer();
  renderAll();
}$('startBtn').addEventListener('click',start);$('pauseBtn').addEventListener('click',pause);$('finishBtn').addEventListener('click',finish);$('goal').addEventListener('change',updateTimer);$('dashPeriod').addEventListener('change',renderDashboard);

document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+b.dataset.tab));

  const main = document.getElementById('mainContent');
  if (main) {
    main.classList.remove('home-view');
    main.classList.add('section-view');
  }
  window.scrollTo({
  top: 0,
  behavior: 'smooth'
});

  if(b.dataset.tab==='dashboard')renderDashboard();
}));

/* ===== NAVEGAÃ‡ÃƒO DA TELA INICIAL ===== */

const mainContent = document.getElementById('mainContent');
const homeButton = document.getElementById('homeBtn');

if (homeButton && mainContent) {
  homeButton.addEventListener('click', () => {
    mainContent.classList.remove('section-view');
    mainContent.classList.add('home-view');

    document.querySelectorAll('.tab').forEach(button => {
      button.classList.remove('active');
    });

    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
  });
}

document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>document.querySelector(`[data-tab="${b.dataset.goto}"]`).click()));

$('manualSessionForm').addEventListener('submit', e => {
  e.preventDefault();

  const subject = $('manualSubject').value;
  const date = $('manualDate').value;
  const minutes = Number($('manualMinutes').value);
  const notes = $('manualNotes').value.trim();

  if (!subject || !date || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    alert('Confira a matéria, a data e o tempo estudado.');
    return;
  }

  if (date > today()) {
    alert('A data do estudo nÃ£o pode ser futura.');
    return;
  }

  data.sessions.push({
    id: Date.now(),
    subject,
    seconds: minutes * 60,
    date,
    time: 'Registro manual' + (notes ? ' • ' + notes : '')
  });

  save();
  renderAll();

  $('manualMinutes').value = '';
  $('manualNotes').value = '';
  $('manualSessionMessage').textContent = 'Estudo registrado com sucesso!';
});
$('questionForm').addEventListener('submit',e=>{e.preventDefault();const total=Number($('qTotal').value),correct=Number($('qCorrect').value);if(total<1||correct<0||correct>total){alert('Confira os nÃºmeros: os acertos nÃ£o podem superar o total de questÃµes.');return}data.questions.push({id:Date.now(),subject:$('qSubject').value,total,correct,notes:$('qNotes').value.trim(),date:today()});save();$('qNotes').value='';renderAll();alert('Resultado de questÃµes salvo!')});
$('reviewForm').addEventListener('submit',e=>{e.preventDefault();data.reviews.push({id:String(Date.now()),subject:$('rSubject').value,topic:$('rTopic').value.trim(),date:$('rDate').value,type:$('rType').value,done:false});save();$('rTopic').value='';reviewFilter='pending';document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='pending'));renderAll()});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{reviewFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderReviews()}));
$('reviewList').addEventListener('click',e=>{const t=e.target.closest('[data-review-toggle]'),d=e.target.closest('[data-review-delete]');if(t){const r=data.reviews.find(x=>x.id===t.dataset.reviewToggle);if(r)r.done=!r.done;save();renderAll()}if(d){data.reviews=data.reviews.filter(x=>x.id!==d.dataset.reviewDelete);save();renderAll()}});

$('recentSessions').addEventListener('click', e => {
  const button = e.target.closest('[data-session-delete]');
  if (!button) return;

  const id = Number(button.dataset.sessionDelete);
  const session = data.sessions.find(s => s.id === id);

  if (!session) {
    alert('NÃ£o foi possÃ­vel localizar essa sessÃ£o.');
    return;
  }

  const confirmed = confirm(
    `Deseja excluir a sessÃ£o de ${session.subject}, registrada em ${session.date} (${fmt(session.seconds)})?`
  );

  if (!confirmed) return;

  data.sessions = data.sessions.filter(s => s.id !== id);
  save();
  renderAll();

  alert('SessÃ£o excluÃ­da com sucesso!');
}); 
$('manualSessionsHistory').addEventListener('click', e => {
  const button = e.target.closest('[data-session-delete]');
  if (!button) return;

  const id = Number(button.dataset.sessionDelete);
  const session = data.sessions.find(s => s.id === id);

  if (
    !session ||
    !String(session.time || '').startsWith('Registro manual')
  ) {
    alert('Registro manual nÃ£o encontrado.');
    return;
  }

  const confirmed = confirm(
    `Deseja excluir o registro manual de ${session.subject}, em ${session.date} (${fmt(session.seconds)})?`
  );

  if (!confirmed) return;

  data.sessions = data.sessions.filter(s => s.id !== id);
  save();
  renderAll();

  alert('Registro manual excluído com sucesso!');
});

$('rDate').value=today();
renderAll();
// Teste do deploy automático pelo GitHub
// Teste automático 2

/* ===== TEMA CLARO E ESCURO ===== */

(() => {
  const themeButton = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const themeLabel = document.getElementById('themeLabel');

  if (!themeButton) {
    console.warn('BotÃ£o de tema nÃ£o encontrado no HTML.');
    return;
  }

  const THEME_KEY = 'operacaoKinhaTheme';

  function applyTheme(theme) {
    const isLight = theme === 'light';

    document.documentElement.dataset.theme = isLight
      ? 'light'
      : 'dark';

    themeIcon.textContent = isLight ? '☾' : '☀';
    themeLabel.textContent = isLight ? 'Modo escuro' : 'Modo claro';

    themeButton.setAttribute(
      'aria-label',
      isLight ? 'Ativar modo escuro' : 'Ativar modo claro'
    );

    themeButton.setAttribute(
      'title',
      isLight ? 'Mudar para tema escuro' : 'Mudar para tema claro'
    );
  }

  let savedTheme = 'dark';

  try {
    const storedTheme = localStorage.getItem(THEME_KEY);

    if (storedTheme === 'light' || storedTheme === 'dark') {
      savedTheme = storedTheme;
    }
  } catch (error) {
    console.warn('NÃ£o foi possÃ­vel ler a preferÃªncia de tema.', error);
  }

  applyTheme(savedTheme);

  themeButton.addEventListener('click', () => {
    const nextTheme =
      document.documentElement.dataset.theme === 'light'
        ? 'dark'
        : 'light';

    applyTheme(nextTheme);

    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      console.warn('NÃ£o foi possÃ­vel salvar a preferÃªncia de tema.', error);
    }
  });
})();

/* ===== SELEÃ‡ÃƒO DOS MODOS DO CRONÃ”METRO ===== */
(() => {
  const modeButtons = document.querySelectorAll('[data-timer-mode]');
  const settings = document.getElementById('pomodoroSettings');
  const focusInput = document.getElementById('focusMinutes');
  const breakInput = document.getElementById('breakMinutes');
  const status = document.getElementById('pomodoroStatus');

  if (!modeButtons.length || !settings) return;

  let selectedMode = 'free';
  timerMode = selectedMode;

  function updateMode(mode) {
    selectedMode = mode;
timerMode = mode;
pomodoroPhase = 'focus';
phaseElapsed = 0;
phaseStartedAt = null;
focusSeconds = 0;
pomodoroCycle = 0;
pomodoroRunning = false;
    modeButtons.forEach(button => {
      const active = button.dataset.timerMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    settings.hidden = mode === 'free';

    if (mode === 'pomodoro') {
      focusInput.value = 25;
      breakInput.value = 5;
      status.textContent = 'Pomodoro: 25 minutos de foco e 5 minutos de pausa.';
    } else if (mode === 'custom') {
      status.textContent =
        `Personalizado: ${focusInput.value} minutos de foco e ${breakInput.value} minutos de pausa.`;
    }
  }

  modeButtons.forEach(button => {
  button.addEventListener('click', () => {
    if (startedAt || pomodoroRunning) {
      alert('Pause ou finalize a sessÃ£o antes de trocar o modo.');
      return;
    }

    if (elapsed > 0) {
      alert('Finalize a sessÃ£o atual antes de trocar o modo.');
      return;
    }

    updateMode(button.dataset.timerMode);
  });
});
  function updateCustomStatus() {
    if (selectedMode === 'custom') {
      status.textContent =
        `Personalizado: ${focusInput.value} minutos de foco e ${breakInput.value} minutos de pausa.`;
    }
  }

  focusInput.addEventListener('input', updateCustomStatus);
  breakInput.addEventListener('input', updateCustomStatus);

  updateMode('free');
})();

/* ===== CONTROLES DA TELA DE FOCO ===== */
(() => {
  const overlay = $('focusOverlay');
  const expandBtn = $('expandTimerBtn');
  const closeBtn = $('closeFocusBtn');
  const focusStartBtn = $('focusStartBtn');
  const focusPauseBtn = $('focusPauseBtn');
  const focusFinishBtn = $('focusFinishBtn');

  if (!overlay || !expandBtn || !closeBtn) return;

  expandBtn.addEventListener('click', () => {
    document.body.appendChild(overlay);
    overlay.hidden = false;
    overlay.style.cssText += ';position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-width:none!important;max-height:none!important;box-sizing:border-box!important;z-index:2147483647!important;background:#080a0f!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;overflow-y:auto!important';
    document.body.style.overflow = 'hidden';
    updateTimer();
  });

  closeBtn.addEventListener('click', () => {
    overlay.hidden = true;
    overlay.removeAttribute('style');
    document.body.style.overflow = '';
  });

  if (focusStartBtn) focusStartBtn.addEventListener('click', start);
  if (focusPauseBtn) focusPauseBtn.addEventListener('click', pause);
  if (focusFinishBtn) focusFinishBtn.addEventListener('click', finish);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden) {
      overlay.hidden = true;
    overlay.removeAttribute('style');
      document.body.style.overflow = '';
    }
  });
})();
/* ===== MATÉRIAS PERSONALIZADAS ===== */
(() => {
  const subjectSelect = $('subject');
  const questionSubjectSelect = $('qSubject');
  const reviewSubjectSelect = $('rSubject');
  const manualSubjectSelect = $('manualSubject');
  const newSubjectInput = $('newSubject');
  const addSubjectBtn = $('addSubjectBtn');
  const subjectMessage = $('subjectMessage');

  if (!subjectSelect || !newSubjectInput || !addSubjectBtn) return;

  
function loadCustomSubjects() {
  data.customSubjects.forEach(name => {
[subjectSelect, questionSubjectSelect, reviewSubjectSelect, manualSubjectSelect].forEach(select => {
      const exists = [...select.options].some(
        option => option.value.toLowerCase() === name.toLowerCase()
      );

      if (!exists) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      }
    });
  });
}

  function addCustomSubject() {
    const name = newSubjectInput.value.trim();

    if (!name) {
      subjectMessage.textContent = 'Digite o nome da matéria.';
      return;
    }

    const exists = [...subjectSelect.options].some(
      option => option.value.toLowerCase() === name.toLowerCase()
    );

    if (exists) {
      subjectMessage.textContent = 'Essa matéria já está cadastrada.';
      return;
    }

    data.customSubjects.push(name);
    save();

    [subjectSelect, questionSubjectSelect, reviewSubjectSelect].forEach(select => {
  if (!select) return;

  const option = document.createElement('option');
  option.value = name;
  option.textContent = name;
  select.appendChild(option);
});

subjectSelect.value = name;
questionSubjectSelect.value = name;
if (reviewSubjectSelect) reviewSubjectSelect.value = name;

    newSubjectInput.value = '';
    subjectMessage.textContent = 'Matéria adicionada com sucesso!';
  }

  addSubjectBtn.addEventListener('click', addCustomSubject);

  newSubjectInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCustomSubject();
    }
  });

  loadCustomSubjects();
})();

/* ===== OPERACAO KINHA — IMAGEM MOTIVACIONAL DIARIA ===== */
(() => {
  const image = document.getElementById('dailyMotivationImage');
const banner = document.getElementById('dailyMotivation');

if (!image || !banner) return;

  const images = [
    'motivacao-01.jpeg',
    'motivacao-02.jpeg',
    'motivacao-03.jpeg',
    'motivacao-04.jpeg',
    'motivacao-05.jpeg',
    'motivacao-06.jpeg',
    'motivacao-07.jpeg'
  ];

  const now = new Date();
  const startOfDay = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const dayNumber = Math.floor(startOfDay / 86400000);
  const index = ((dayNumber % images.length) + images.length) % images.length;

image.src = images[index];
image.alt = 'Imagem motivacional do dia';

})();


