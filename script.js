// ─────────────────────────────────────────────────────────────────────────────
// Cutters Choice Radio Main Script (Fixed Deferred Ban)
// Includes Device Fingerprinting & Troll Ban Logic (FingerprintJS v3+)
// Load FingerprintJS in HTML head with: <script src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js" defer></script>
// ─────────────────────────────────────────────────────────────────────────────

// 1) GLOBAL CONFIG & MOBILE DETECTION
const API_KEY           = "pk_0b8abc6f834b444f949f727e88a728e0";
const STATION_ID        = "cutters-choice-radio";
const BASE_URL          = "https://api.radiocult.fm/api";
const FALLBACK_ART      = "https://i.imgur.com/qWOfxOS.png";
const MIXCLOUD_PASSWORD = "cutters44";
const isMobile          = /Mobi|Android/i.test(navigator.userAgent);
let chatPopupWindow;
let visitorId;

// 2) BAN LOGIC
function blockChat() {
  document.getElementById('popOutBtn')?.remove();
  document.getElementById('chatModal')?.remove();
  const cont = document.getElementById('radiocult-chat-container');
  if (cont) cont.innerHTML = '<p>Chat disabled.</p>';
}
async function sendBan() {
  if (!visitorId) return;
  try {
    await fetch('/api/chat/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId })
    });
    blockChat();
  } catch (err) {
    console.error('Error sending ban:', err);
  }
}
// expose for console
window.sendBan = sendBan;

async function initBanCheck() {
  if (!window.FingerprintJS) {
    console.warn('FingerprintJS not loaded, skipping ban check');
    return;
  }
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    visitorId = result.visitorId;
    const res = await fetch('/api/chat/checkban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId })
    });
    const { banned } = await res.json();
    if (banned) {
      blockChat();
    }
  } catch (err) {
    console.warn('Ban check error:', err);
  }
}

// 3) HELPERS
function createGoogleCalLink(title, startUtc, endUtc) {
  if (!startUtc || !endUtc) return '#';
  const fmt = dt => new Date(dt).toISOString().replace(/[-:]|\.\d{3}/g, '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE` +
         `&text=${encodeURIComponent(title)}` +
         `&dates=${fmt(startUtc)}/${fmt(endUtc)}` +
         `&details=Tune in live at https://cutterschoiceradio.com` +
         `&location=https://cutterschoiceradio.com`;
}
async function rcFetch(path) {
  const res = await fetch(BASE_URL + path, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`Fetch error ${res.status}`);
  return res.json();
}
function shuffleIframesDaily() {
  const container = document.getElementById('mixcloud-list');
  if (!container) return;
  const HOUR = 3600000;
  const last = parseInt(localStorage.getItem('lastShuffleTime'), 10) || 0;
  const now = Date.now();
  if (now - last < HOUR) return;
  const frames = Array.from(container.querySelectorAll('iframe'));
  for (let i = frames.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    container.appendChild(frames[j]);
    frames.splice(j, 1);
  }
  localStorage.setItem('lastShuffleTime', now.toString());
}

// 4) MIXCLOUD ARCHIVE PERSISTENCE
async function loadArchives() {
  try {
    const res = await fetch('get_archives.php');
    if (!res.ok) throw new Error('Failed to load archives');
    const archives = await res.json();
    const container = document.getElementById('mixcloud-list');
    container.innerHTML = '';
    archives.forEach((entry, idx) => {
      const feed = encodeURIComponent(entry.url);
      const item = document.createElement('div');
      item.className = 'mixcloud-item';
      const iframe = document.createElement('iframe');
      iframe.className = 'mixcloud-iframe';
      iframe.src = `https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed=${feed}`;
      iframe.loading = 'lazy'; iframe.width = '100%'; iframe.height = '120'; iframe.frameBorder = '0';
      item.appendChild(iframe);
      if (!isMobile) {
        const remove = document.createElement('a');
        remove.href = '#'; remove.className = 'remove-link'; remove.textContent = 'Remove show';
        remove.addEventListener('click', e => { e.preventDefault(); deleteMixcloud(idx); });
        item.appendChild(remove);
      }
      container.prepend(item);
    });
    shuffleIframesDaily();
    const s = document.createElement('script');
    s.src = 'https://widget.mixcloud.com/widget.js'; s.async = true;
    document.body.appendChild(s);
  } catch (err) {
    console.error('Archive load error:', err);
  }
}
async function addMixcloud() {
  const input = document.getElementById('mixcloud-url'); if (!input) return;
  const url = input.value.trim(); if (!url) return alert('Please paste a valid Mixcloud URL');
  const pw = prompt('Enter archive password:'); if (pw !== MIXCLOUD_PASSWORD) return alert('Incorrect password');
  try {
    const form = new FormData(); form.append('url', url); form.append('password', pw);
    const res = await fetch('add_archive.php', { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    input.value = '';
    await loadArchives();
  } catch (err) {
    alert('Add failed: ' + err.message);
  }
}
async function deleteMixcloud(index) {
  const pw = prompt('Enter archive password:'); if (pw !== MIXCLOUD_PASSWORD) return alert('Incorrect password');
  try {
    const form = new FormData(); form.append('index', index); form.append('password', pw);
    const res = await fetch('delete_archive.php', { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    await loadArchives();
  } catch (err) { alert('Delete failed: ' + err.message); }
}

// 5) DATA FETCHERS
async function fetchLiveNow() {
  try {
    const { result } = await rcFetch(`/station/${STATION_ID}/schedule/live`);
    const { metadata: md = {}, content: ct = {} } = result;
    document.getElementById('now-dj').textContent = md.artist ? `${md.artist} – ${md.title}` : (ct.title || 'No live show');
    document.getElementById('now-art').src = md.artwork_url || FALLBACK_ART;
  } catch (e) {
    console.error('Live fetch error:', e);
    document.getElementById('now-dj').textContent = 'Error fetching live info';
    document.getElementById('now-art').src = FALLBACK_ART;
  }
}
async function fetchWeeklySchedule() {
  const container = document.getElementById('schedule-container'); if (!container) return;
  container.innerHTML = '<p>Loading this week\'s schedule…</p>';
  try {
    const now = new Date(), then = new Date(now.getTime() + 7*24*60*60*1000);
    const { schedules } = await rcFetch(`/station/${STATION_ID}/schedule?startDate=${now.toISOString()}&endDate=${then.toISOString()}`);
    if (!schedules.length) { container.innerHTML = '<p>No shows scheduled this week.</p>'; return; }
    const byDay = schedules.reduce((acc, ev) => {
      const day = new Date(ev.startDateUtc).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});
      (acc[day] = acc[day]||[]).push(ev); return acc;
    }, {});
    container.innerHTML = '';
    const fmt = iso => new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    Object.entries(byDay).forEach(([day, evs]) => {
      const h3 = document.createElement('h3'); h3.textContent = day; container.appendChild(h3);
      const ul = document.createElement('ul'); ul.style.listStyle='none'; ul.style.padding='0';
      evs.forEach(ev => {
        const li = document.createElement('li'); li.style.marginBottom='1rem';
        const wrap = document.createElement('div'); wrap.style.display='flex'; wrap.style.gap='8px'; wrap.style.alignItems='center';
        const t = document.createElement('strong'); t.textContent = `${fmt(ev.startDateUtc)}–${fmt(ev.endDateUtc)}`; wrap.appendChild(t);
        const art = ev.metadata?.artwork?.default||ev.metadata?.artwork?.original; if(art) {
          const img=document.createElement('img'); img.src=art; img.alt=`${ev.title} artwork`;
          img.style.cssText='width:30px;height:30px;object-fit:cover;border-radius:3px;'; wrap.appendChild(img);
        }
        const span=document.createElement('span'); span.textContent=ev.title; wrap.appendChild(span);
        if(!/archive/i.test(ev.title)){
          const a=document.createElement('a'); a.href=createGoogleCalLink(ev.title,ev.startDateUtc,ev.endDateUtc);
          a.target='_blank'; a.innerHTML='📅'; a.style.cssText='font-size:1.4rem;text-decoration:none;margin-left:6px;'; wrap.appendChild(a);
        }
        li.appendChild(wrap); ul.appendChild(li);
      }); container.appendChild(ul);
    });
  } catch(e) { console.error('Schedule error:',e); container.innerHTML='<p>Error loading schedule.</p>'; }
}
async function fetchNowPlayingArchive() {
  try { const { result } = await rcFetch(`/station/${STATION_ID}/schedule/live`);
    const { metadata: md={}, content: ct={} } = result;
    const el=document.getElementById('now-archive'); let text='Now Playing: ';
    if(md.title) text+=md.artist?`${md.artist} – ${md.title}`:md.title;
    else if(md.filename) text+=md.filename;
    else if(ct.title) text+=ct.title;
    else if(ct.name) text+=ct.name;
    else text+='Unknown Show';
    el.textContent=text;
  } catch(e) { console.error('Archive-now error:',e); document.getElementById('now-archive').textContent='Unable to load archive show'; }
}

// 6) ADMIN & UI ACTIONS
function openChatPopup() {/* unchanged */}
function closeChatModal() {/* unchanged */}

// 7) BANNER GIF
function startBannerGIF() {/* unchanged */}

// 8) INITIALIZATION
document.addEventListener('DOMContentLoaded',() => {
  // Core inits
  fetchLiveNow();
  fetchWeeklySchedule();
  fetchNowPlayingArchive();
  loadArchives();
  setInterval(fetchLiveNow,30000);
  setInterval(fetchNowPlayingArchive,30000);

  if(isMobile) document.querySelector('.mixcloud')?.remove();
  else {
    document.querySelectorAll('iframe.mixcloud-iframe').forEach(ifr=>ifr.src=ifr.src||ifr.dataset.src);
    shuffleIframesDaily();
    const s=document.createElement('script'); s.src='https://widget.mixcloud.com/widget.js'; s.async=true;
    document.body.appendChild(s);
  }

  document.getElementById('popOutBtn')?.addEventListener('click',()=>openChatPopup());

  new MutationObserver(()=>{
    document.querySelectorAll('.rc-user-list li').forEach(li=>{if(!li.textContent.trim())li.remove()});
  }).observe(document.querySelector('.rc-user-list'),{childList:true,subtree:true});

  startBannerGIF();

  // Defer ban check until idle
  const runBan = initBanCheck;
  if('requestIdleCallback' in window) requestIdleCallback(runBan,{timeout:2000});
  else setTimeout(runBan,2000);
});
