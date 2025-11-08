/* ======= CONFIG (replace with your values if needed) ======= */
const BIN_ID = "";
const JSONBIN_KEY = "";
const BOT_USERNAME = 'FaghaniCoin_bot';
const INVITER_PENDING_AMOUNT = 1000;
const INVITED_AMOUNT = 500;

// Cloudflare Worker URL (set to your Worker)
const WORKER_URL = "https://workerfaghani.078-960mohammadi.workers.dev/";

/* ======= Defaults & state (kept from your original file) ======= */
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
  friends: [],
  pendingRewards: [],
  notifications: [],

  // new: lastActive timestamp (ms) saved to support offline earnings
  lastActive: null
};

let localState = null;
let profile = null;
const LOCAL_KEY = 'faghani_local_state_v2';
const PROFILE_KEY = 'faghani_profile_v2';

/* ======= DOM refs (kept) ======= */
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
const pendingAreaEl = document.getElementById('pending-area');
const telegramInfoEl = document.getElementById('telegram-info');

/* ======= Tiny helpers ======= */
function fmt(n){ if(!isFinite(n)) return '0'; if(Math.abs(n) >= 1000) return Math.round(n).toLocaleString(); return (Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:0, maximumFractionDigits:2}); }
let toastTimer = null;
function showToast(message, {danger=false} = {}){ if(!toastEl) return; toastEl.textContent = message; toastEl.style.color = danger ? 'var(--danger)' : 'var(--accent1)'; toastEl.classList.add('show'); if(toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(()=> toastEl.classList.remove('show'), 3000); }

/* ======= Worker-friendly helpers (per-user endpoints + fallbacks) ======= */
/* (unchanged; omitted here to keep this comment brief) */
async function workerGetUser(id){
  if(!id) return null;
  try{
    const url = `${WORKER_URL}user?id=${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: 'GET' });
    if(res.ok){
      const j = await res.json();
      return j;
    }
  }catch(e){}
  try{
    const remote = await fetchJsonBinLatest();
    if(remote && remote.users && remote.users[id]) return remote.users[id];
  }catch(e){}
  return null;
}
async function workerPutUser(id, userObj){
  if(!id || !userObj) return false;
  try{
    const url = `${WORKER_URL}user?id=${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userObj)
    });
    if(res.ok) return true;
  }catch(e){}
  try{
    let remote = await fetchJsonBinLatest();
    if(!remote || typeof remote !== 'object') remote = { users: {} };
    if(!remote.users) remote.users = {};
    remote.users[id] = userObj;
    const ok = await putJsonBin(remote);
    return ok;
  }catch(e){ console.warn('workerPutUser fallback failed', e); return false; }
}
async function workerProcessInvite(inviterId, invitedId, invitedName){
  try{
    const url = `${WORKER_URL}invite?ref=${encodeURIComponent(inviterId)}&uid=${encodeURIComponent(invitedId)}&name=${encodeURIComponent(invitedName||'')}`;
    const res = await fetch(url, { method: 'GET' });
    if(res.ok){
      const j = await res.json();
      return { ok: true, result: j };
    }
  }catch(e){}
  try{
    let invitedRec = await workerGetUser(invitedId);
    if(!invitedRec) invitedRec = { profile: { id: invitedId, name: invitedName || invitedId }, state: JSON.parse(JSON.stringify(defaultState)) };
    invitedRec.profile = invitedRec.profile || { id: invitedId, name: invitedName || invitedId };
    invitedRec.state = invitedRec.state || JSON.parse(JSON.stringify(defaultState));
    if(!invitedRec.state.joinedFrom){
      invitedRec.state.joinedFrom = inviterId;
      invitedRec.state.coins = (invitedRec.state.coins || 0) + INVITED_AMOUNT;
      invitedRec.state.notifications = invitedRec.state.notifications || [];
      invitedRec.state.notifications.push({ id: 'invited-' + Date.now(), text: `Congrats! You received ${INVITED_AMOUNT} coins for joining via a referral.`, time: Date.now(), read: false });
    }
    await workerPutUser(invitedId, invitedRec);
    let inviterRec = await workerGetUser(inviterId);
    if(!inviterRec) inviterRec = { profile: { id: inviterId, name: inviterId }, state: JSON.parse(JSON.stringify(defaultState)) };
    inviterRec.profile = inviterRec.profile || { id: inviterId, name: inviterId };
    inviterRec.state = inviterRec.state || JSON.parse(JSON.stringify(defaultState));
    inviterRec.state.pendingRewards = inviterRec.state.pendingRewards || [];
    const alreadyFriend = (inviterRec.state.friends || []).find(f => f.id === invitedId);
    const alreadyPending = inviterRec.state.pendingRewards.find(p => p.from === invitedId && !p.collected);
    if(!alreadyFriend && !alreadyPending){
      const pending = { id: 'pending-' + Date.now(), from: invitedId, amount: INVITER_PENDING_AMOUNT, message: `Your friend ${invitedRec.profile?.name || invitedId} joined — collect ${INVITER_PENDING_AMOUNT} coins!`, collected: false, time: Date.now() };
      inviterRec.state.pendingRewards.push(pending);
      await workerPutUser(inviterId, inviterRec);
    }
    return { ok: true, invited: invitedRec, inviter: inviterRec };
  }catch(err){
    console.error('workerProcessInvite fallback error', err);
    return { ok: false, error: err.message || 'invite failed' };
  }
}

/* ======= JSONBin helpers (legacy full-bin read/write via Worker proxy) ======= */
async function fetchJsonBinLatest(){
  if(WORKER_URL){
    try{
      const res = await fetch(`${WORKER_URL}jsonbin`, { method: 'GET' });
      if(res.ok){
        const j = await res.json();
        return j.record || j || null;
      }
    }catch(e){ console.warn('fetchJsonBinLatest via worker failed', e); }
  }
  if(!BIN_ID || !JSONBIN_KEY) return null;
  try{
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      method:'GET',
      headers: { 'X-Access-Key': JSONBIN_KEY }
    });
    if(!res.ok) { console.warn('jsonbin read not ok', res.status); return null; }
    const j = await res.json();
    return j.record || null;
  }catch(err){ console.warn('JSONBin read failed', err); return null; }
}
async function putJsonBin(record){
  if(WORKER_URL){
    try{
      const res = await fetch(`${WORKER_URL}jsonbin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      return res.ok;
    }catch(e){ console.warn('putJsonBin via worker failed', e); }
  }
  if(!BIN_ID || !JSONBIN_KEY) return false;
  try{
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
      method:'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Access-Key': JSONBIN_KEY, 'X-Bin-Versioning': 'false' },
      body: JSON.stringify(record)
    });
    return res.ok;
  }catch(err){ console.warn('JSONBin write failed', err); return false; }
}

/* ======= Telegram detection (use tg identity when inside Telegram) ======= */
const tg = window.Telegram?.WebApp;
const initDataUnsafe = tg?.initDataUnsafe || {};
const tgUser = initDataUnsafe.user || null;

/* ======= Profile & invite utilities (improved to support Telegram) ======= */
function ensureProfile(){
  const raw = localStorage.getItem(PROFILE_KEY);
  if(raw){
    try{ profile = JSON.parse(raw); }catch(e){ profile = null; }
  }
  if(tgUser && tgUser.id){
    profile = {
      id: 'tg_' + String(tgUser.id),
      name: (tgUser.first_name || '') + (tgUser.last_name ? (' ' + tgUser.last_name) : ''),
      username: tgUser.username || null,
      isTelegram: true
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    telegramInfoEl.textContent = `Telegram: ${tgUser.first_name || ''}${tgUser.username ? ' (@' + tgUser.username + ')' : ''}`;
  } else {
    if(!profile || !profile.id){
      profile = { id: 'u_' + Math.random().toString(36).slice(2,9), name: 'Guest' + Math.floor(Math.random()*99), isTelegram: false };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }
    telegramInfoEl.textContent = profile.isTelegram ? 'Signed in with Telegram' : 'Not signed in to Telegram';
  }
  profileInputEl.value = profile.name || '';
  profileNameEl.textContent = profile.name || 'Guest';
  inviteIdEl.textContent = profile.id;
  // show Telegram-friendly invite link (we show both forms)
  inviteLinkEl.value = buildTelegramDeepLink(profile.id) + '  (or: ' + buildInviteUrl(profile.id) + ')';
}

function updateProfileFromUI(){
  const v = (profileInputEl.value || '').trim();
  if(v.length === 0) { showToast('Name cannot be empty', {danger:true}); return; }
  profile.name = v;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  profileNameEl.textContent = profile.name;
  inviteIdEl.textContent = profile.id;
  inviteLinkEl.value = buildTelegramDeepLink(profile.id) + '  (or: ' + buildInviteUrl(profile.id) + ')';
  showToast('Profile saved');
  if(localState){ localState.profileName = profile.name; saveLocalState(); updateDisplay(); }
}

/* ===== Invite Friends button (robust & fixed) ===== */
(function setupInviteButton(){
  const btn = document.getElementById('invite-friends-btn');
  if(!btn) return;

  btn.addEventListener('click', (e) => {
    e.preventDefault();

    // build the two main forms: startapp (tries to open webapp) and deep link for fallback
    const startappLink = `https://t.me/${BOT_USERNAME}/startapp?startapp=${encodeURIComponent(profile.id)}`;
    const deepLink = `https://t.me/${BOT_USERNAME}?start=ref_${encodeURIComponent(profile.id)}`;
    const tgResolve = `tg://resolve?domain=${BOT_USERNAME}&start=ref_${encodeURIComponent(profile.id)}`;

    // share text includes startapp (best for Telegram clients)
    const shareText = `🎮 Join me in FaghaniCoin and get +500 coins! Play in Telegram: ${startappLink}`;

    // Telegram "share" URL that opens the forward UI
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(startappLink)}&text=${encodeURIComponent(shareText)}`;

    try {
      // If inside Telegram WebApp: open the Telegram share URL via WebApp API (this will open forward UI)
      if (window.Telegram && window.Telegram.WebApp) {
        const tgLocal = window.Telegram.WebApp;
        if (typeof tgLocal.openLink === 'function') {
          tgLocal.openLink(tgShareUrl);
          return;
        }
        if (typeof tgLocal.openTelegramLink === 'function') {
          tgLocal.openTelegramLink(tgShareUrl);
          return;
        }
      }

      // Use native share (mobile browsers)
      if (navigator.share) {
        navigator.share({ title: 'FaghaniCoin', text: shareText, url: startappLink })
          .catch(() => window.open(tgShareUrl, '_blank', 'noopener'));
        return;
      }

      // Fallback: open Telegram share page in new tab (user picks contact)
      window.open(tgShareUrl, '_blank', 'noopener');
    } catch (err) {
      // final fallback: try to open Telegram app directly (mobile) or deep link:
      try { window.open(tgResolve, '_blank', 'noopener'); }
      catch(e){ window.open(deepLink, '_blank', 'noopener'); }
    }
  });
})();

/* ===== builds: return startapp (preferred) and deep link (fallback) ===== */
function buildInviteUrl(id){
  // prefer opening web app directly (startapp) — recipients who open this from outside Telegram may see the WebApp open inside Bot.
  return `https://t.me/${BOT_USERNAME}/startapp?startapp=${encodeURIComponent(id)}`;
}
function buildTelegramDeepLink(id){
  // fallback deep link that opens the bot /start; bot should handle forwarding to web app where applicable
  return `https://t.me/${BOT_USERNAME}?start=ref_${encodeURIComponent(id)}`;
}
function copyInvite(){
  // copy the deep-link (most reliable for referrals)
  const deepLink = buildTelegramDeepLink(profile.id);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(deepLink).then(()=> showToast('Invite link copied')).catch(()=> fallbackCopy());
  } else fallbackCopy();

  function fallbackCopy(){
    inviteLinkEl.value = deepLink;
    inviteLinkEl.select();
    try{ document.execCommand('copy'); showToast('Invite link copied'); }catch(e){ showToast('Copy failed — select and copy manually', {danger:true}); }
  }
}

/* ======= Local state save/load (now uses per-user put if possible) ======= */
function saveLocalState(){
  const toSave = JSON.parse(JSON.stringify(localState));
  localStorage.setItem(LOCAL_KEY, JSON.stringify(toSave));
  // publish to remote via per-user endpoint
  if(WORKER_URL){
    (async ()=>{
      try{
        const userObj = {
          profile: { id: profile.id, name: profile.name, username: profile.username || null, isTelegram: !!profile.isTelegram },
          state: toSave
        };
        await workerPutUser(profile.id, userObj);
      }catch(e){ console.warn('saveLocalState workerPutUser failed', e); }
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

/* mergeWithDefault helper (kept) */
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

/* ======= Ensure remote user exists and load remote state (auto-create) ======= */
async function ensureRemoteUser(){
  if(!WORKER_URL) return;
  try{
    const remoteUser = await workerGetUser(profile.id);
    if(remoteUser && remoteUser.state){
      // merge remote into local
      localState = mergeWithDefault(remoteUser.state, localState);
      // If remote has lastActive and it's newer, keep it; otherwise local will be used
      if(remoteUser.state.lastActive && (!localState.lastActive || remoteUser.state.lastActive > localState.lastActive)){
        localState.lastActive = remoteUser.state.lastActive;
      }
      localState.profileName = profile.name;
      saveLocalState();
      updateDisplay();
      return;
    }
    // create remote user
    const userObj = { profile: { id: profile.id, name: profile.name, username: profile.username || null, isTelegram: !!profile.isTelegram }, state: localState || JSON.parse(JSON.stringify(defaultState)) };
    // ensure we have a lastActive
    userObj.state.lastActive = userObj.state.lastActive || Date.now();
    await workerPutUser(profile.id, userObj);
  }catch(e){ console.warn('ensureRemoteUser failed', e); }
}

/* ======= Offline earnings: apply earnings for time away (cap 3 hours) =======
   - Reads localState.lastActive ms
   - Computes elapsed seconds, caps at 3*3600
   - Adds profitPerHour * (elapsed/3600) to coins
   - Updates history and lastActive
*/
function applyOfflineEarnings(){
  if(!localState) return;
  const now = Date.now();
  const last = localState.lastActive || localState.lastSeen || 0;
  if(!last || last <= 0){
    // set baseline lastActive
    localState.lastActive = now;
    saveLocalState();
    return;
  }
  const elapsedSec = Math.floor((now - last)/1000);
  if(elapsedSec < 5) { // too short to credit
    localState.lastActive = now;
    saveLocalState();
    return;
  }
  const capSeconds = 3 * 3600; // 3 hours
  const creditSeconds = Math.min(elapsedSec, capSeconds);
  const profitPerHour = (localState.profitPerHour || 0);
  if(profitPerHour > 0 && creditSeconds > 0){
    const earned = profitPerHour * (creditSeconds / 3600);
    if(earned > 0){
      localState.coins = +( (localState.coins || 0) + earned ).toFixed(8);
      localState.history = localState.history || [];
      localState.history.push(`Offline +${fmt(earned)} coins (${Math.round(creditSeconds/60)} min)`);
      showToast(`You earned ${fmt(earned)} coins while away (${Math.round(creditSeconds/60)} min).`);
    }
  }
  // update lastActive to now
  localState.lastActive = now;
  saveLocalState();
  updateDisplay();
}

/* keep lastActive updated on hide/unload so next time we can calculate offline time */
function wireLastActiveHandlers(){
  try{
    document.addEventListener('visibilitychange', () => {
      if(!localState) return;
      if(document.visibilityState === 'hidden'){
        localState.lastActive = Date.now();
        // best-effort save
        try{ saveLocalState(); }catch(e){}
      } else if(document.visibilityState === 'visible'){
        // when visible again, apply offline earnings immediately
        applyOfflineEarnings();
      }
    });
    window.addEventListener('beforeunload', () => {
      if(!localState) return;
      localState.lastActive = Date.now();
      try{ saveLocalState(); }catch(e){}
    });
    // periodic heartbeat: save lastActive periodically so other devices have fresh value (once a minute)
    setInterval(()=>{
      if(!localState) return;
      localState.lastActive = Date.now();
      try{ saveLocalState(); }catch(e){}
    }, 60000);
  }catch(e){ console.warn('wireLastActiveHandlers error', e); }
}

/* ======= Sync remote (inviter) state into local (if configured) ======= */
async function syncRemoteProfile(){
  if(!WORKER_URL) return;
  try{
    const remote = await workerGetUser(profile.id);
    if(remote && remote.state){
      localState = mergeWithDefault(remote.state, localState);
      localState.profileName = profile.name;
      saveLocalState();
      updateDisplay();
    }
  }catch(e){ console.warn('sync error', e); }
}

/* ======= Update UI rendering (kept) ======= */
function updateDisplay(){
  if(!localState) return;
  coinCountEl.textContent = fmt(localState.coins);
  headerBalanceEl.textContent = fmt(localState.coins);
  limitInfoEl.textContent = `${Math.round(localState.limitCounter)}/${localState.coinLimit}`;
  profitValEl.textContent = fmt(localState.profitPerHour);
  profitPerHourEl.textContent = fmt(localState.profitPerHour);
  profileNameEl.textContent = profile.name || '';

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

  const friendCount = (localState.friends || []).length;
  document.querySelectorAll('.btn-buy').forEach(btn=>{ btn.onclick = (e)=> onBuyClick(e); });

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

  friendsCountEl.textContent = (localState.friends || []).length;
  friendListEl.innerHTML = (localState.friends || []).slice().reverse().map(f => {
    return `<div class="friend-item"><div><strong>${escapeHtml(f.name)}</strong><div style="font-size:0.82rem;color:var(--muted)">Joined ${f.joinedAt}</div></div><div style="font-family:ui-monospace,monospace;color:var(--accent1)">${f.id}</div></div>`;
  }).join('');

  friendUnlockStatusEl.textContent = `You have ${friendCount} friend(s).`;

  pendingAreaEl.innerHTML = '';
  const pending = (localState.pendingRewards || []).filter(p => !p.collected);
  if(pending.length){
    pending.forEach(p => {
      const div = document.createElement('div');
      div.className = 'pending-item';
      div.innerHTML = `<div><div style="font-weight:700">${escapeHtml(p.message || ('Invited: ' + p.from))}</div><div class="meta">From: ${escapeHtml(p.from)} • ${new Date(p.time || Date.now()).toLocaleString()}</div></div>`;
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Collect';
      btn.onclick = ()=> collectPendingReward(p.id);
      div.appendChild(btn);
      pendingAreaEl.appendChild(div);
    });
  }

  saveLocalState();
}

/* ======= Purchases, tasks, invite logic, collect pending, periodic sync, visuals, etc. =======
   (kept from your code - unchanged except where offline/lastActive touches state)
*/

function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function onBuyClick(e){ const key = e.currentTarget.dataset.card; buyCard(key, e.currentTarget.closest('.upgrade-card')); }
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
function animateBuyCard(cardEl){ if(!cardEl) return; try{ cardEl.animate([{ transform: 'scale(1)' },{ transform:'scale(1.06)' },{ transform:'scale(1)' }],{ duration:520, easing:'cubic-bezier(.2,.9,.2,1)' }); }catch(e){} const r = cardEl.getBoundingClientRect(); spawnConfetti(r.left + r.width/2, r.top + r.height/2, 14); }

function claimDailyReward(){ const today = new Date().toISOString().slice(0,10); if(localState.dailyClaimDate === today){ showToast('Daily already claimed today', {danger:true}); return; } localState.coins += 500; localState.dailyClaimDate = today; localState.history.push(`Daily reward +500 (${today})`); updateDisplay(); showToast('Daily reward +500'); const btn = document.getElementById('daily-btn'); if(btn) spawnConfetti(btn.getBoundingClientRect().left + btn.offsetWidth/2, btn.getBoundingClientRect().top + btn.offsetHeight/2, 20); }
function watchVideoTask(){ if(localState.videoClaimed){ showToast('Video already claimed', {danger:true}); return; } window.open('https://youtu.be/ayF6zkVS1Ew?si=5YK04Buaaxusfxx-', '_blank', 'noopener'); localState.coins += 500; localState.videoClaimed = true; localState.history.push('Watched video +500'); updateDisplay(); showToast('Thanks for watching! +500'); const btn = document.getElementById('video-btn'); if(btn) spawnConfetti(btn.getBoundingClientRect().left + btn.offsetWidth/2, btn.getBoundingClientRect().top + btn.offsetHeight/2, 20); }

async function tryAcceptInviteFromUrl(){
  // Support telegram start_param and URL params ?ref and ?start=ref_... and ?startapp=...
  let inviterId = null;

  // 1) Prefer Telegram WebApp start_param when inside Telegram:
  try{
    inviterId = tg?.initDataUnsafe?.start_param || null;
  }catch(e){ inviterId = inviterId || null; }

  // 2) If not present, check URL query parameters that may be present:
  if(!inviterId){
    const params = new URLSearchParams(location.search);
    inviterId = (params.get('startapp') || params.get('ref') || params.get('start') || '').trim();
    // handle start=ref_abc case
    if(inviterId && inviterId.startsWith('ref_')) inviterId = inviterId.slice(4);
    if(!inviterId) inviterId = null;
  }

  if(!inviterId) return;
  const inviter = inviterId;

  if(inviter === profile.id){ showToast('You opened your own invite link — no action.'); return; }
  if(profile.joinedFrom && profile.joinedFrom === inviter){ showToast('Invite previously accepted', {danger:false}); return; }

  profile.joinedFrom = inviter;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

  if(WORKER_URL){
    showToast('Processing invite — contacting backend...');
    try{
      const res = await workerProcessInvite(inviter, profile.id, profile.name);
      if(res && res.ok){
        // worker may return invited under different keys; handle both shapes
        const invitedData = res.result?.invited || res.invited || res.result?.user || res.result || null;
        const invitedState = invitedData && (invitedData.state || invitedData);
        if(invitedState){
          localState = mergeWithDefault(invitedState.state || invitedState, localState);
          showToast(`You received +${INVITED_AMOUNT} coins for joining via referral!`);
          updateDisplay();
          saveLocalState();
        } else {
          showToast('Invite accepted — inviter credited with a pending reward ✅');
        }
      } else {
        showToast('Invite processing failed', {danger:true});
      }
    }catch(err){
      console.error('invite processing error', err);
      showToast('Invite processing failed', {danger:true});
    }
    return;
  }

  // fallback: local-only acceptance
  profile.joinedFrom = inviter;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localState.coins = (localState.coins || 0) + INVITED_AMOUNT;
  localState.history.push(`Joined via ${inviter} (+${INVITED_AMOUNT})`);
  localState.notifications = localState.notifications || [];
  localState.notifications.push({ id: 'invite-local-' + Date.now(), text: `You received ${INVITED_AMOUNT} coins for joining via a referral (local only).`, time: Date.now(), read: false });
  updateDisplay();
  saveLocalState();
  showToast('Invite accepted locally (backend not configured).');
}

async function collectPendingReward(pendingId){
  showToast('Collecting reward...');
  if(!WORKER_URL){
    const pend = (localState.pendingRewards || []).find(p => p.id === pendingId && !p.collected);
    if(!pend){ showToast('Pending reward not found', {danger:true}); return; }
    pend.collected = true;
    localState.coins = (localState.coins || 0) + (pend.amount || 0);
    localState.friends = localState.friends || [];
    localState.friends.push({ id: pend.from, name: pend.from, joinedAt: new Date().toLocaleString() });
    localState.notifications = localState.notifications || [];
    localState.notifications.push({ id: 'collected-' + Date.now(), text: `You collected ${pend.amount} coins for inviting a friend!`, time: Date.now(), read: false });
    updateDisplay();
    saveLocalState();
    showToast(`Collected ${pend.amount} coins — thank you!`);
    return;
  }
  try{
    const meRemote = await workerGetUser(profile.id);
    if(!meRemote || !meRemote.state){ showToast('Your remote state missing', {danger:true}); return; }
    const pend = (meRemote.state.pendingRewards || []).find(p => p.id === pendingId && !p.collected);
    if(!pend){ showToast('Pending reward not found on backend', {danger:true}); return; }
    meRemote.state.coins = (meRemote.state.coins || 0) + (pend.amount || 0);
    meRemote.state.friends = meRemote.state.friends || [];
    const already = meRemote.state.friends.find(f => f.id === pend.from);
    if(!already){
      meRemote.state.friends.push({ id: pend.from, name: (pend.fromName || pend.from), joinedAt: new Date().toLocaleString() });
    }
    const pRemote = meRemote.state.pendingRewards.find(p => p.id === pendingId);
    if(pRemote) pRemote.collected = true;
    meRemote.state.notifications = meRemote.state.notifications || [];
    meRemote.state.notifications.push({ id: 'collected-' + Date.now(), text: `You collected ${pend.amount} coins for inviting a friend!`, time: Date.now(), read: false });
    const ok = await workerPutUser(profile.id, meRemote);
    if(ok){
      showToast('Collected! +'+pend.amount);
      await syncRemoteProfile();
    } else {
      showToast('Collect failed (backend write failed)', {danger:true});
    }
  }catch(err){
    console.error('collect error', err);
    showToast('Collect failed', {danger:true});
  }
}

async function periodicRemoteSync(){
  if(!WORKER_URL) return;
  try{
    const remote = await workerGetUser(profile.id);
    if(remote && remote.state){
      localState = mergeWithDefault(remote.state, localState);
      localState.profileName = profile.name;
      saveLocalState();
      updateDisplay();
    }
  }catch(e){ console.warn('sync error', e); }
}

function earnCoin(){ if(localState.limitCounter <= 0){ showToast('Limit reached — wait for regen', {danger:true}); return; } const gain = Math.min(localState.coinsPerClick, localState.limitCounter); localState.coins = +(localState.coins + gain).toFixed(6); localState.limitCounter = Math.max(0, localState.limitCounter - gain); localState.history.push(`Clicked +${gain}`); updateDisplay(); const {x,y} = bigCenter(); const spawnCount = Math.max(1, Math.round(Math.abs(gain))); spawnCoinStickers(x, y, spawnCount); faghaniEl.classList.add('pop'); setTimeout(()=> faghaniEl.classList.remove('pop'), 260); }

/* startIntervals no longer immediately called at top of init — we call it after offline earnings are applied */
function startIntervals(){
  setInterval(()=>{
    const cps = localState.profitPerHour / 3600;
    if(cps > 0){ localState.coins = +(localState.coins + cps).toFixed(8); updateDisplay(); }
  }, 1000);
  setInterval(()=>{
    if(localState.limitCounter < localState.coinLimit){
      localState.limitCounter = Math.min(localState.coinLimit, localState.limitCounter + 1);
      updateDisplay();
    }
  }, 5000);
}

/* visuals helpers (kept) */
function bigCenter(){ const r = faghaniEl.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; }
function spawnCoinStickers(x,y,count=1){ const max = Math.min(18, count); for(let i=0;i<max;i++){ const el = document.createElement('div'); el.className = 'coin-sticker'; el.textContent = '💰'; document.body.appendChild(el); const spread = (i - (max-1)/2) * 10 + (Math.random()*6 - 3); el.style.left = (x + spread) + 'px'; el.style.top = (y + (Math.random()*8 - 4)) + 'px'; el.style.opacity = '1'; el.style.transform = `translate(-50%,-50%) scale(${1 - Math.random()*0.12})`; const duration = 1100 + Math.random()*700; const delay = Math.random()*90; el.style.animation = `float-wobble ${duration}ms cubic-bezier(.2,.9,.2,1) ${delay}ms forwards`; el.style.rotate = (Math.random()*40 - 20) + 'deg'; setTimeout(()=> { try{ el.remove(); }catch(e){} }, duration + delay + 40); } }
function spawnConfetti(x,y,amount=12){ const colors = ['#7ef2d2','#7b6bff','#ffd166','#ff6b6b','#6be6ff']; for(let i=0;i<amount;i++){ const c = document.createElement('div'); c.className = 'confetti'; c.style.left = (x + (Math.random()*120 - 60)) + 'px'; c.style.top = (y + (Math.random()*30 - 10)) + 'px'; c.style.background = colors[Math.floor(Math.random()*colors.length)]; c.style.width = (6 + Math.random()*8) + 'px'; c.style.height = (8 + Math.random()*10) + 'px'; document.body.appendChild(c); const duration = 800 + Math.random()*700; c.style.animation = `confetti-fall ${duration}ms cubic-bezier(.2,.9,.2,1) forwards`; setTimeout(()=> { try{ c.remove(); } catch(e){} }, duration + 40); } }

/* ======= Save/load wrapper (kept) ======= */
function saveState(){ try{ saveLocalState(); }catch(e){ console.error('saveState', e); } }
async function loadState(){ loadLocalState(); if(!localState.profileName) localState.profileName = profile.name; return localState; }

/* ======= Navigation (kept) ======= */
function setActiveNavButton(key){ document.querySelectorAll('.nav-buttons button').forEach(b=>b.classList.remove('active')); const el = document.getElementById('nav-' + key); if(el) el.classList.add('active'); }
function showSection(name){ ['home','upgrades','tasks','friends'].forEach(s=>{ const el = document.getElementById(s); if(!el) return; if(s===name){ el.classList.add('active'); el.setAttribute('aria-hidden','false'); } else { el.classList.remove('active'); el.setAttribute('aria-hidden','true'); } }); setActiveNavButton(name); showToast(name.charAt(0).toUpperCase() + name.slice(1)); }
window.showSection = showSection;

/* ======= Misc keyboard & click hook (kept) ======= */
window.addEventListener('keydown', (e)=>{ if(e.code === 'Space'){ e.preventDefault(); earnCoin(); } });
faghaniEl.addEventListener('click', ()=> earnCoin());

/* ======= Demo buy (kept) ======= */
function demoBuy(){ if(localState.coins < 10) { showToast('Need at least 10 coins to waste!', {danger:true}); return; } localState.coins = Math.max(0, localState.coins - 10); localState.history.push('Wasted 10 coins'); updateDisplay(); showToast('Wasted 10 coins'); }

/* ======= Init (re-ordered to apply offline earnings after merging remote state) ======= */
(async ()=>{
  ensureProfile();
  await loadState();
  updateDisplay();

  // create or fetch remote user and merge remote -> local
  await ensureRemoteUser();

  // apply offline earnings (cap at 3 hours)
  applyOfflineEarnings();

  // now start intervals for live passive income and limit regen
  startIntervals();

  // wire lastActive handlers to keep timestamp updated
  wireLastActiveHandlers();

  // try to accept invite if opened via Telegram start_param or ?ref=...  (workerProcessInvite will handle)
  await tryAcceptInviteFromUrl();

  // initial remote sync (inviter sees remote state)
  await syncRemoteProfile();

  // periodically sync remote for inviter every 20s
  if(WORKER_URL) setInterval(periodicRemoteSync, 20000);

  // notify if URL contains ref and no backend configured
  const ref = new URLSearchParams(location.search).get('ref');
  if(ref && !WORKER_URL) {
    showToast('Invite detected — backend not configured, inviter will not be credited across devices.', {danger:true});
  }

  // periodic UI refresh
  setInterval(updateDisplay, 3000);

  // Show invite link in UI (Telegram-friendly deep link first)
  inviteLinkEl.value = buildTelegramDeepLink(profile.id) + '  (or: ' + buildInviteUrl(profile.id) + ')';
})();
