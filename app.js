/* ======= CONFIG (optional) =======
   For cross-device inviter crediting set BIN_ID and JSONBIN_KEY (jsonbin.io).
   If you leave them empty, invite acceptance will be local only and cannot credit other devices.
*/
const BIN_ID = ""; // put your bin id here (optional)
const JSONBIN_KEY = ""; // put your JSONBin key here (optional)

/* ======= Defaults & state ======= */
const defaultState = {
  coins: 0,
  coinLimit: 9000,
  limitCounter: 9000,
  profitPerHour: 0,
  coinsPerClick: 1,
  cards: {
    card1: { cost: 50, profit: 500, name: 'Card 1' },
    card2: { cost: 100, profit: 1000, name: 'Card 2' },
    card3: { cost: 200, profit: 1500, name: 'Gole-Haie-Faghani' },
    card4: { cost: 400, profit: 2000, name: 'Faghani Card' }
  },
  friendCards: {
    f1: { id: 'f1', name: 'Friend Upgrade A', cost: 150, profit: 600, requiredFriends: 1 },
    f2: { id: 'f2', name: 'Friend Upgrade B', cost: 300, profit: 1200, requiredFriends: 2 },
    f3: { id: 'f3', name: 'Friend Upgrade C', cost: 600, profit: 2000, requiredFriends: 3 },
    f4: { id: 'f4', name: 'Friend Upgrade D', cost: 800, profit: 2600, requiredFriends: 3 }
  },
  dailyClaimDate: null,
  videoClaimed: false,
  history: [],
  friends: [] // only populated when remote backend credits inviter
};

let localState = null;
let profile = null;
const LOCAL_KEY = 'faghani_local_state_v2';
const PROFILE_KEY = 'faghani_profile_v2';

/* ======= DOM refs ======= */
const coinCountEl = document.getElementById('coin-count');
const headerBalanceEl = document.getElementById('header-balance');
const limitInfoEl = document.getElementById('limit-info');
const profitValEl = document.getElementById('profit-val');
const profitPerHourEl = document.getElementById('profit-per-hour');
const quickUpgradesEl = document.getElementById('quick-upgrades');
const upgradesListEl = document.getElementById('upgrades-list');
const toastEl = document.getElementById('toast');
const faghaniEl = document.getElementById('faghani');
const historyEl = document.getElementById('history');
const friendListEl = document.getElementById('friend-list');
const friendsCountEl = document.getElementById('friends-count');
const friendUnlockStatusEl = document.getElementById('friend-unlock-status');
const inviteLinkEl = document.getElementById('invite-link');
const inviteIdEl = document.getElementById('invite-id');
const profileNameEl = document.getElementById('profile-name');
const profileInputEl = document.getElementById('profile-input');

/* ======= Helpers ======= */
function fmt(n){ if(!isFinite(n)) return '0'; if(Math.abs(n) >= 1000) return Math.round(n).toLocaleString(); return (Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:0, maximumFractionDigits:2}); }
let toastTimer = null;
function showToast(message, {danger=false} = {}){ if(!toastEl) return; toastEl.textContent = message; toastEl.style.color = danger ? 'var(--danger)' : 'var(--accent1)'; toastEl.classList.add('show'); if(toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(()=> toastEl.classList.remove('show'), 2600); }

/* ======= JSONBin optional helpers ======= */
async function fetchJsonBinLatest(){
  if(!BIN_ID) return null;
  try{
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { method:'GET', headers: { 'X-Access-Key': JSONBIN_KEY } });
    if(!res.ok) return null;
    const j = await res.json();
    return j.record || null;
  }catch(err){ console.warn('JSONBin read failed', err); return null; }
}
async function putJsonBin(record){
  if(!BIN_ID || !JSONBIN_KEY){ console.warn('JSONBin not configured'); return false; }
  try{
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
      method:'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Access-Key': JSONBIN_KEY, 'X-Bin-Versioning': 'false' },
      body: JSON.stringify(record)
    });
    return res.ok;
  }catch(err){ console.warn('JSONBin write failed', err); return false; }
}

/* ======= Profile & invite utilities ======= */
function ensureProfile(){
  const raw = localStorage.getItem(PROFILE_KEY);
  if(raw){
    try{ profile = JSON.parse(raw); }catch(e){ profile = null; }
  }
  if(!profile || !profile.id){
    profile = { id: 'u_' + Math.random().toString(36).slice(2,9), name: 'Guest' + Math.floor(Math.random()*99) };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
  profileInputEl.value = profile.name;
  profileNameEl.textContent = profile.name;
  inviteIdEl.textContent = profile.id;
  inviteLinkEl.value = buildInviteUrl(profile.id);
}
function updateProfileFromUI(){
  const v = (profileInputEl.value || '').trim();
  if(v.length === 0) { showToast('Name cannot be empty', {danger:true}); return; }
  profile.name = v;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  profileNameEl.textContent = profile.name;
  inviteIdEl.textContent = profile.id;
  inviteLinkEl.value = buildInviteUrl(profile.id);
  showToast('Profile saved');
  if(localState){ localState.profileName = profile.name; saveLocalState(); updateDisplay(); }
}
function buildInviteUrl(id){ return location.origin + location.pathname + '?ref=' + encodeURIComponent(id); }
function copyInvite(){ inviteLinkEl.select(); try{ document.execCommand('copy'); showToast('Invite link copied'); }catch(e){ showToast('Copy failed — select and copy manually', {danger:true}); } }

/* ======= Local state save/load ======= */
function saveLocalState(){
  const toSave = JSON.parse(JSON.stringify(localState));
  localStorage.setItem(LOCAL_KEY, JSON.stringify(toSave));
  // also publish to remote users map if configured
  if(BIN_ID && JSONBIN_KEY){
    (async ()=>{
      let remote = await fetchJsonBinLatest();
      if(!remote || typeof remote !== 'object') remote = { users: {} };
      if(!remote.users) remote.users = {};
      remote.users[profile.id] = { profile: profile, state: toSave };
      await putJsonBin(remote);
    })();
  }
}
function loadLocalState(){
  const raw = localStorage.getItem(LOCAL_KEY);
  if(raw){
    try{ localState = mergeWithDefault(JSON.parse(raw), defaultState); }catch(e){ localState = JSON.parse(JSON.stringify(defaultState)); }
  } else {
    localState = JSON.parse(JSON.stringify(defaultState));
    localState.profileName = profile.name;
  }
}

/* mergeWithDefault(obj, def) keeps obj fields, but sets missing from def.
   We'll reuse it to combine remote/ local safely where needed. */
function mergeWithDefault(obj, def){
  if(obj == null) return JSON.parse(JSON.stringify(def));
  const out = {};
  for(const k in def){
    if(Object.prototype.hasOwnProperty.call(def,k)){
      if(obj[k] === undefined) out[k] = JSON.parse(JSON.stringify(def[k]));
      else if(typeof def[k] === 'object' && def[k] !== null && !Array.isArray(def[k])) out[k] = mergeWithDefault(obj[k], def[k]);
      else out[k] = obj[k];
    }
  }
  for(const k in obj){
    if(!Object.prototype.hasOwnProperty.call(out,k)) out[k] = obj[k];
  }
  return out;
}

/* ======= Sync remote (inviter) state into local (if configured) ======= */
async function syncRemoteProfile(){
  if(!BIN_ID || !JSONBIN_KEY) return;
  const remote = await fetchJsonBinLatest();
  if(!remote || !remote.users) return;
  const me = remote.users[profile.id];
  if(me && me.state){
    // prefer remote state fields, but preserve local fields not present
    localState = mergeWithDefault(me.state, localState);
    // ensure profile name kept
    localState.profileName = profile.name;
    saveLocalState();
    updateDisplay();
  }
}

/* ======= UI rendering ======= */
function updateDisplay(){
  if(!localState) return;
  coinCountEl.textContent = fmt(localState.coins);
  headerBalanceEl.textContent = fmt(localState.coins);
  limitInfoEl.textContent = `${Math.round(localState.limitCounter)}/${localState.coinLimit}`;
  profitValEl.textContent = fmt(localState.profitPerHour);
  profitPerHourEl.textContent = fmt(localState.profitPerHour);
  profileNameEl.textContent = profile.name;

  // quick upgrades
  quickUpgradesEl.innerHTML = '';
  Object.keys(localState.cards).forEach(key=>{
    const c = localState.cards[key];
    const div = document.createElement('div');
    div.className = 'upgrade-card';
    div.innerHTML = `
      <div class="upgrade-icon">⚡</div>
      <div class="upgrade-body">
        <div class="title">${c.name}</div>
        <div class="desc">+${fmt(c.profit)}/hour</div>
      </div>
      <div class="upgrade-action">
        <div class="upgrade-cost">${fmt(c.cost)}</div>
        <button class="btn-buy" data-card="${key}" ${localState.coins < c.cost ? 'disabled' : ''}>Buy</button>
      </div>
    `;
    quickUpgradesEl.appendChild(div);
  });

  // full upgrades
  upgradesListEl.innerHTML = '';
  Object.keys(localState.cards).forEach(key=>{
    const c = localState.cards[key];
    const div = document.createElement('div');
    div.className = 'upgrade-card';
    div.innerHTML = `
      <div class="upgrade-icon">💠</div>
      <div class="upgrade-body">
        <div class="title">${c.name}</div>
        <div class="desc">Add +${fmt(c.profit)}/hour passive income.</div>
      </div>
      <div class="upgrade-action">
        <div class="upgrade-cost">${fmt(c.cost)} ⨯</div>
        <button class="btn-buy" data-card="${key}" ${localState.coins < c.cost ? 'disabled' : ''}>Upgrade</button>
      </div>
    `;
    upgradesListEl.appendChild(div);
  });

  const friendCount = localState.friends.length;
  Object.keys(localState.friendCards).forEach(key=>{
    const c = localState.friendCards[key];
    const unlocked = friendCount >= c.requiredFriends;
    const div = document.createElement('div');
    div.className = 'upgrade-card';
    div.innerHTML = `
      <div class="upgrade-icon">🤝</div>
      <div class="upgrade-body">
        <div class="title">${c.name}</div>
        <div class="desc">Requires ${c.requiredFriends} friend(s). +${fmt(c.profit)}/hour.</div>
      </div>
      <div class="upgrade-action">
        <div class="upgrade-cost">${fmt(c.cost)} ⨯</div>
        <button class="btn-buy friend-upgrade" data-card="${key}" ${(!unlocked || localState.coins < c.cost) ? 'disabled' : ''}>Buy</button>
      </div>
    `;
    if(!unlocked){
      const overlay = document.createElement('div');
      overlay.className = 'lock-overlay';
      overlay.textContent = `Locked: bring ${c.requiredFriends} friend(s)`;
      div.appendChild(overlay);
    }
    upgradesListEl.appendChild(div);
  });

  document.querySelectorAll('.btn-buy').forEach(btn=>{
    btn.onclick = (e)=> onBuyClick(e);
  });

  // tasks UI
  const dailyBtn = document.getElementById('daily-btn');
  if(dailyBtn){
    const claimed = !!localState.dailyClaimDate;
    dailyBtn.disabled = claimed;
    dailyBtn.textContent = claimed ? 'Daily claimed' : 'Claim Daily (+500)';
    dailyBtn.classList.toggle('pale', claimed);
  }
  const videoBtn = document.getElementById('video-btn');
  if(videoBtn){
    const claimed = !!localState.videoClaimed;
    videoBtn.disabled = claimed;
    videoBtn.textContent = claimed ? 'Video completed' : 'Watch Video (+500)';
    videoBtn.classList.toggle('pale', claimed);
  }

  // friends list & count (note: friends only available when remote backend credited inviter)
  friendsCountEl.textContent = localState.friends.length;
  friendListEl.innerHTML = localState.friends.slice().reverse().map(f => {
    return `<div class="friend-item"><div><strong>${escapeHtml(f.name)}</strong><div style="font-size:0.82rem;color:var(--muted)">Joined ${f.joinedAt}</div></div><div style="font-family:ui-monospace,monospace;color:var(--accent1)">${f.id}</div></div>`;
  }).join('');

  friendUnlockStatusEl.textContent = `You have ${friendCount} friend(s).`;

  saveLocalState();
}
function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ======= Purchases ======= */
function onBuyClick(e){
  const key = e.currentTarget.dataset.card;
  buyCard(key, e.currentTarget.closest('.upgrade-card'));
}
function buyCard(key, cardDom=null){
  const fc = localState.friendCards[key];
  if(fc){
    const required = fc.requiredFriends || 0;
    if(localState.friends.length < required){ showToast('Not enough friends to unlock', {danger:true}); return; }
    if(localState.coins < fc.cost){ showToast('Not enough coins', {danger:true}); return; }
    localState.coins = +(localState.coins - fc.cost).toFixed(6);
    localState.profitPerHour += fc.profit;
    fc.cost = Math.round(fc.cost * 2.0 + 8);
    localState.history.push(`${fc.name} purchased (+${fmt(fc.profit)}/hour)`);
    updateDisplay(); showToast(`${fc.name} bought!`);
    if(cardDom) animateBuyCard(cardDom);
    return;
  }
  const c = localState.cards[key];
  if(!c) return;
  if(localState.coins < c.cost){ showToast('Not enough coins', {danger:true}); return; }
  localState.coins = +(localState.coins - c.cost).toFixed(6);
  localState.profitPerHour += c.profit;
  c.cost = Math.round(c.cost * 2.0 + 8);
  localState.history.push(`${c.name} purchased (+${fmt(c.profit)}/hour)`);
  updateDisplay(); showToast(`${c.name} bought!`);
  if(cardDom) animateBuyCard(cardDom);
}
function animateBuyCard(cardEl){
  if(!cardEl) return;
  try{ cardEl.animate([{ transform: 'scale(1)' },{ transform:'scale(1.06)' },{ transform:'scale(1)' }],{ duration:520, easing:'cubic-bezier(.2,.9,.2,1)' }); }catch(e){}
  const r = cardEl.getBoundingClientRect();
  spawnConfetti(r.left + r.width/2, r.top + r.height/2, 14);
}

/* ======= Tasks ======= */
function claimDailyReward(){ const today = new Date().toISOString().slice(0,10); if(localState.dailyClaimDate === today){ showToast('Daily already claimed today', {danger:true}); return; } localState.coins += 500; localState.dailyClaimDate = today; localState.history.push(`Daily reward +500 (${today})`); updateDisplay(); showToast('Daily reward +500'); const btn = document.getElementById('daily-btn'); if(btn) spawnConfetti(btn.getBoundingClientRect().left + btn.offsetWidth/2, btn.getBoundingClientRect().top + btn.offsetHeight/2, 20); }
function watchVideoTask(){ if(localState.videoClaimed){ showToast('Video already claimed', {danger:true}); return; } window.open('https://youtu.be/ayF6zkVS1Ew?si=5YK04Buaaxusfxx-', '_blank', 'noopener'); localState.coins += 500; localState.videoClaimed = true; localState.history.push('Watched video +500'); updateDisplay(); showToast('Thanks for watching! +500'); const btn = document.getElementById('video-btn'); if(btn) spawnConfetti(btn.getBoundingClientRect().left + btn.offsetWidth/2, btn.getBoundingClientRect().top + btn.offsetHeight/2, 20); }

/* ======= Invite acceptance (only way to create friends) =======
   - If user opens the page with ?ref=<inviterId>, and they haven't already been marked as joinedFrom,
     we mark them and attempt to credit the inviter via JSONBin (if configured).
   - We use profile.id to avoid duplicate crediting (inviter gets a friend entry with this profile.id).
*/
async function tryAcceptInviteFromUrl(){
  const params = new URLSearchParams(location.search);
  const inviterId = (params.get('ref') || '').trim();
  if(!inviterId) return;
  // do not self-credit
  if(inviterId === profile.id) { showToast('You opened your own invite link — no action.', {danger:false}); return; }
  // if already marked as joined from this inviter, do nothing
  if(profile.joinedFrom && profile.joinedFrom === inviterId){ showToast('Invite previously accepted', {danger:false}); return; }
  // mark local profile as joined (prevents repeated attempts)
  profile.joinedFrom = inviterId;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  // If remote configured, attempt to credit inviter in remote users map
  if(BIN_ID && JSONBIN_KEY){
    showToast('Processing invite — crediting inviter...');
    const remote = await fetchJsonBinLatest();
    if(remote && remote.users && remote.users[inviterId] && remote.users[inviterId].state){
      const inviterRec = remote.users[inviterId];
      inviterRec.state = inviterRec.state || {};
      inviterRec.state.friends = inviterRec.state.friends || [];
      // prevent duplicates by checking friend with this profile.id
      const already = inviterRec.state.friends.find(f => f.id === profile.id);
      if(already){
        showToast('This invite was already registered for inviter.', {danger:false});
        // still update local join flag and return
        return;
      }
      // add friend record to inviter state and credit coins
      const friendObj = { id: profile.id, name: profile.name, joinedAt: new Date().toLocaleString() };
      inviterRec.state.friends.push(friendObj);
      inviterRec.state.coins = (inviterRec.state.coins || 0) + 1000;
      inviterRec.state.history = inviterRec.state.history || [];
      inviterRec.state.history.push(`Referred ${profile.name} (+1000)`);
      // write back the entire remote.users structure
      remote.users[inviterId] = inviterRec;
      const ok = await putJsonBin(remote);
      if(ok){
        showToast('Invite accepted — inviter credited +1000 ✅');
      } else {
        showToast('Invite accepted locally but remote write failed ⚠️', {danger:true});
      }
      // done
      return;
    } else {
      showToast('Inviter not found in backend — cannot credit (backend state missing).', {danger:true});
      return;
    }
  }
  // No backend configured: cannot credit other users across devices.
  showToast('Invite accepted locally (no backend configured — inviter not credited).', {danger:true});
}

/* ======= Periodic remote sync for inviter (so inviter sees new friends) ======= */
async function periodicRemoteSync(){
  if(!BIN_ID || !JSONBIN_KEY) return;
  try{
    const remote = await fetchJsonBinLatest();
    if(remote && remote.users && remote.users[profile.id] && remote.users[profile.id].state){
      // prefer remote state and merge into local
      localState = mergeWithDefault(remote.users[profile.id].state, localState);
      localState.profileName = profile.name;
      saveLocalState();
      updateDisplay();
    }
  }catch(e){ console.warn('sync error', e); }
}

/* ======= Friends management removed (users cannot add friends manually) ======= */

/* ======= Earn coins, animations, intervals ======= */
function earnCoin(){ if(localState.limitCounter <= 0){ showToast('Limit reached — wait for regen', {danger:true}); return; } const gain = Math.min(localState.coinsPerClick, localState.limitCounter); localState.coins = +(localState.coins + gain).toFixed(6); localState.limitCounter = Math.max(0, localState.limitCounter - gain); localState.history.push(`Clicked +${gain}`); updateDisplay(); const {x,y} = bigCenter(); const spawnCount = Math.max(1, Math.round(Math.abs(gain))); spawnCoinStickers(x, y, spawnCount); faghaniEl.classList.add('pop'); setTimeout(()=> faghaniEl.classList.remove('pop'), 260); }
function startIntervals(){ setInterval(()=>{ const cps = localState.profitPerHour / 3600; if(cps > 0){ localState.coins = +(localState.coins + cps).toFixed(8); updateDisplay(); } }, 1000); setInterval(()=>{ if(localState.limitCounter < localState.coinLimit){ localState.limitCounter = Math.min(localState.coinLimit, localState.limitCounter + 1); updateDisplay(); } }, 5000); }

/* coin sticker & confetti */
function bigCenter(){ const r = faghaniEl.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; }
function spawnCoinStickers(x,y,count=1){ const max = Math.min(18, count); for(let i=0;i<max;i++){ const el = document.createElement('div'); el.className = 'coin-sticker'; el.textContent = '💰'; document.body.appendChild(el); const spread = (i - (max-1)/2) * 10 + (Math.random()*6 - 3); el.style.left = (x + spread) + 'px'; el.style.top = (y + (Math.random()*8 - 4)) + 'px'; el.style.opacity = '1'; el.style.transform = `translate(-50%,-50%) scale(${1 - Math.random()*0.12})`; const duration = 1100 + Math.random()*700; const delay = Math.random()*90; el.style.animation = `float-wobble ${duration}ms cubic-bezier(.2,.9,.2,1) ${delay}ms forwards`; el.style.rotate = (Math.random()*40 - 20) + 'deg'; setTimeout(()=> { try{ el.remove(); }catch(e){} }, duration + delay + 40); } }
function spawnConfetti(x,y,amount=12){ const colors = ['#7ef2d2','#7b6bff','#ffd166','#ff6b6b','#6be6ff']; for(let i=0;i<amount;i++){ const c = document.createElement('div'); c.className = 'confetti'; c.style.left = (x + (Math.random()*120 - 60)) + 'px'; c.style.top = (y + (Math.random()*30 - 10)) + 'px'; c.style.background = colors[Math.floor(Math.random()*colors.length)]; c.style.width = (6 + Math.random()*8) + 'px'; c.style.height = (8 + Math.random()*10) + 'px'; document.body.appendChild(c); const duration = 800 + Math.random()*700; c.style.animation = `confetti-fall ${duration}ms cubic-bezier(.2,.9,.2,1) forwards`; setTimeout(()=> { try{ c.remove(); } catch(e){} }, duration + 40); } }

/* ======= Save/load wrapper ======= */
function saveState(){ try{ saveLocalState(); }catch(e){ console.error('saveState', e); } }
async function loadState(){
  loadLocalState();
  if(!localState.profileName) localState.profileName = profile.name;
  return localState;
}

/* ======= Navigation ======= */
function setActiveNavButton(key){ document.querySelectorAll('.nav-buttons button').forEach(b=>b.classList.remove('active')); const el = document.getElementById('nav-' + key); if(el) el.classList.add('active'); }
function showSection(name){ ['home','upgrades','tasks','friends'].forEach(s=>{ const el = document.getElementById(s); if(!el) return; if(s===name){ el.classList.add('active'); el.setAttribute('aria-hidden','false'); } else { el.classList.remove('active'); el.setAttribute('aria-hidden','true'); } }); setActiveNavButton(name); showToast(name.charAt(0).toUpperCase() + name.slice(1)); }
window.showSection = showSection;

/* ======= Misc keyboard ======= */
window.addEventListener('keydown', (e)=>{ if(e.code === 'Space'){ e.preventDefault(); earnCoin(); } });
faghaniEl.addEventListener('click', ()=> earnCoin());

/* ======= Demo buy ======= */
function demoBuy(){ if(localState.coins < 10) { showToast('Need at least 10 coins to waste!', {danger:true}); return; } localState.coins = Math.max(0, localState.coins - 10); localState.history.push('Wasted 10 coins'); updateDisplay(); showToast('Wasted 10 coins'); }

/* ======= Init ======= */
(async ()=>{
  ensureProfile();
  await loadState();
  updateDisplay();
  startIntervals();
  // try to accept invite if ?ref=inviterId
  await tryAcceptInviteFromUrl();
  // if configured, do initial remote sync (so inviter sees remote state)
  await syncRemoteProfile();
  // periodically sync remote for inviter every 20s (so inviter sees credited friends)
  if(BIN_ID && JSONBIN_KEY) setInterval(periodicRemoteSync, 20000);
  // notify if URL contains ref and no backend configured
  const ref = new URLSearchParams(location.search).get('ref');
  if(ref && (!BIN_ID || !JSONBIN_KEY)) {
    showToast('Invite detected — backend not configured, inviter will not be credited across devices.', {danger:true});
  }
  // periodic UI refresh
  setInterval(updateDisplay, 3000);
})();

/* ======= Small CSS animations appended ======= */
const styleExtra = document.createElement('style'); styleExtra.innerHTML = `
.coin-sticker{ position:fixed; pointer-events:none; font-size:18px; transform-origin:center; z-index:1600; will-change: transform, opacity; }
@keyframes float-wobble { 0%{ transform: translate3d(0px,0px,0) scale(1); opacity:1 } 100%{ transform: translate3d(0px,-180px,0) scale(0.92); opacity:0 } }
.confetti{ position:fixed; width:10px;height:14px; opacity:1; pointer-events:none; z-index:1500; border-radius:2px }
@keyframes confetti-fall{ 0%{ transform: translateY(0) rotate(0deg); opacity:1 } 100%{ transform: translateY(260px) rotate(720deg); opacity:0 } }
`; document.head.appendChild(styleExtra);
