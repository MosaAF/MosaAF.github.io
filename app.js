/* ========== State & Persistence ========== */
  const STORAGE_KEY = 'faghani_html_v3';
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
    dailyClaimed: false,
    videoClaimed: false,
    history: []
  };
  let state = loadState();

  /* DOM refs */
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

  /* helpers */
  function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){} }
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return JSON.parse(JSON.stringify(defaultState));
  }
  function fmt(n){
    if(!isFinite(n)) return '0';
    if(Math.abs(n) >= 1000) return Math.round(n).toLocaleString();
    return (Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:0, maximumFractionDigits:2});
  }

  /* toast */
  let toastTimer = null;
  function showToast(message, { danger=false } = {}){
    toastEl.textContent = message;
    toastEl.style.color = danger ? 'var(--danger)' : 'var(--accent1)';
    toastEl.classList.add('show');
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> toastEl.classList.remove('show'), 2200);
  }

  /* section navigation */
  function setActiveNavButton(key){
    document.querySelectorAll('.nav-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-' + key).classList.add('active');
  }
  function showSection(section){
    ['home','upgrades','tasks'].forEach(s=>{
      const el = document.getElementById(s);
      if(s === section){ el.classList.add('active'); el.setAttribute('aria-hidden','false'); }
      else { el.classList.remove('active'); el.setAttribute('aria-hidden','true'); }
    });
    setActiveNavButton(section);
    // small toast
    showToast(section.charAt(0).toUpperCase() + section.slice(1));
  }

  /* coin sticker spawn */
  function bigCenter() {
    const r = faghaniEl.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function spawnCoinStickers(x,y,count=1){
    const max = Math.min(16, count);
    for(let i=0;i<max;i++){
      const el = document.createElement('div');
      el.className = 'coin-sticker';
      el.textContent = '💰';
      document.body.appendChild(el);

      // small horizontal spread
      const spread = (i - (max-1)/2) * 10 + (Math.random()*6 - 3);
      el.style.left = (x + spread) + 'px';
      el.style.top = (y + (Math.random()*8 - 4)) + 'px';
      el.style.opacity = '1';
      el.style.transform = `translate(-50%,-50%) scale(${1 - Math.random()*0.12})`;

      // randomized duration + delay for natural feel
      const duration = 1100 + Math.random()*700;
      const delay = Math.random()*90;
      el.style.animation = `float-wobble ${duration}ms cubic-bezier(.2,.9,.2,1) ${delay}ms forwards`;
      el.style.rotate = (Math.random()*40 - 20) + 'deg';

      // cleanup
      setTimeout(()=> { try{ el.remove(); }catch(e){} }, duration + delay + 40);
    }
  }

  /* confetti for buy/task */
  function spawnConfetti(x,y,amount=14){
    const colors = ['#7ef2d2','#7b6bff','#ffd166','#ff6b6b','#6be6ff'];
    for(let i=0;i<amount;i++){
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = (x + (Math.random()*100 - 50)) + 'px';
      c.style.top = (y + (Math.random()*50 - 20)) + 'px';
      c.style.background = colors[Math.floor(Math.random()*colors.length)];
      c.style.width = (6 + Math.random()*8) + 'px';
      c.style.height = (8 + Math.random()*10) + 'px';
      document.body.appendChild(c);

      const dur = 800 + Math.random()*900;
      c.style.animation = `confetti-fall ${dur}ms cubic-bezier(.2,.9,.2,1) forwards`;
      setTimeout(()=> { try{ c.remove(); } catch(e){} }, dur + 40);
    }
  }

  /* animate buy: pulse + confetti */
  function animateBuyCard(cardEl){
    if(!cardEl) return;
    // use Web Animations API if available for consistent timing
    try{
      cardEl.animate([
        { transform: 'scale(1)', offset:0 },
        { transform: 'scale(1.08)', offset:0.28 },
        { transform: 'scale(.98)', offset:0.6 },
        { transform: 'scale(1)', offset:1 }
      ], { duration: 520, easing: 'cubic-bezier(.2,.9,.2,1)' });
    }catch(e){
      // fallback: toggle class
      cardEl.classList.add('pulse');
      setTimeout(()=> cardEl.classList.remove('pulse'), 540);
    }
    // spawn confetti around card
    const r = cardEl.getBoundingClientRect();
    spawnConfetti(r.left + r.width/2, r.top + r.height/2, 16);
  }

  /* update UI */
  function updateDisplay(){
    coinCountEl.textContent = fmt(state.coins);
    headerBalanceEl.textContent = fmt(state.coins);
    limitInfoEl.textContent = `${Math.round(state.limitCounter)}/${state.coinLimit}`;
    profitValEl.textContent = fmt(state.profitPerHour);
    profitPerHourEl.textContent = fmt(state.profitPerHour);

    // history
    historyEl.innerHTML = state.history.slice(-6).reverse().map(h => `<div style="margin-bottom:6px;color:var(--muted)">• ${h}</div>`).join('');

    // quick upgrades area
    quickUpgradesEl.innerHTML = '';
    Object.keys(state.cards).forEach(key=>{
      const c = state.cards[key];
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
          <button class="btn-buy" data-card="${key}" ${state.coins < c.cost ? 'disabled' : ''}>Buy</button>
        </div>
      `;
      quickUpgradesEl.appendChild(div);
    });

    // full upgrades list
    upgradesListEl.innerHTML = '';
    Object.keys(state.cards).forEach(key=>{
      const c = state.cards[key];
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
          <button class="btn-buy" data-card="${key}" ${state.coins < c.cost ? 'disabled' : ''}>Upgrade</button>
        </div>
      `;
      upgradesListEl.appendChild(div);
    });

    // attach buy handlers
    document.querySelectorAll('.btn-buy').forEach(btn=>{
      btn.removeEventListener('click', onBuyClick);
      btn.addEventListener('click', onBuyClick);
    });

    // tasks buttons
    const dailyBtn = document.getElementById('daily-btn');
    if(dailyBtn){
      dailyBtn.disabled = state.dailyClaimed;
      dailyBtn.textContent = state.dailyClaimed ? 'Daily claimed' : 'Claim Daily (+500)';
    }
    const videoBtn = document.getElementById('video-btn');
    if(videoBtn){
      videoBtn.disabled = state.videoClaimed;
      videoBtn.textContent = state.videoClaimed ? 'Video completed' : 'Watch Video (+500)';
    }

    saveState();
  }

  /* buy handler */
  function onBuyClick(e){
    const key = e.currentTarget.dataset.card;
    const cardEl = e.currentTarget.closest('.upgrade-card');
    buyCard(key, cardEl);
  }

  function buyCard(key, cardDom=null){
    const card = state.cards[key];
    if(!card) return;
    if(state.coins < card.cost){
      showToast('Not enough coins', {danger:true});
      return;
    }
    state.coins = +(state.coins - card.cost).toFixed(6);
    state.profitPerHour += card.profit;
    // cost growth
    card.cost = Math.round(card.cost * 2.0 + 8);
    state.history.push(`${card.name} purchased (+${fmt(card.profit)}/hour)`);
    updateDisplay();
    showToast(`${card.name} bought!`);
    // animate the card
    if(!cardDom) cardDom = document.querySelector(`.btn-buy[data-card="${key}"]`)?.closest('.upgrade-card');
    if(cardDom) animateBuyCard(cardDom);
  }

  /* tasks */
  function claimDailyReward(){
    if(state.dailyClaimed){
      showToast('Daily already claimed', {danger:true});
      return;
    }
    state.coins += 500;
    state.dailyClaimed = true;
    state.history.push('Daily reward claimed +500');
    updateDisplay();
    showToast('Daily reward +500');
    const btn = document.getElementById('daily-btn');
    if(btn) spawnConfetti(btn.getBoundingClientRect().left + btn.offsetWidth/2, btn.getBoundingClientRect().top + btn.offsetHeight/2, 20);
  }

  function watchVideoTask(){
    if(state.videoClaimed){
      showToast('Video already claimed', {danger:true});
      return;
    }
    window.open('https://youtu.be/ayF6zkVS1Ew?si=5YK04Buaaxusfxx-', '_blank', 'noopener');
    state.coins += 500;
    state.videoClaimed = true;
    state.history.push('Watched video +500');
    updateDisplay();
    showToast('Thanks for watching! +500');
    const btn = document.getElementById('video-btn');
    if(btn) spawnConfetti(btn.getBoundingClientRect().left + btn.offsetWidth/2, btn.getBoundingClientRect().top + btn.offsetHeight/2, 20);
  }

  function miniTask(reward=100){
    state.coins += reward;
    state.history.push(`Mini task +${reward}`);
    updateDisplay();
    showToast(`Mini task +${reward}`);
    spawnConfetti(window.innerWidth/2, window.innerHeight/2, 28);
  }

  /* coin earn + animation */
  function earnCoin(){
    if(state.limitCounter <= 0){
      showToast('Limit reached — wait for regen', {danger:true});
      return;
    }
    const gain = Math.min(state.coinsPerClick, state.limitCounter);
    state.coins = +(state.coins + gain).toFixed(6);
    state.limitCounter = Math.max(0, state.limitCounter - gain);
    state.history.push(`Clicked +${gain}`);
    updateDisplay();

    // spawn stickers at center
    const {x,y} = bigCenter();
    const spawnCount = Math.max(1, Math.round(Math.abs(gain)));
    spawnCoinStickers(x, y, spawnCount);

    // smooth pop
    faghaniEl.classList.add('pop');
    setTimeout(()=> faghaniEl.classList.remove('pop'), 260);
  }

  /* intervals: passive income + regen */
  function startIntervals(){
    setInterval(()=>{
      const cps = state.profitPerHour / 3600;
      if(cps > 0){
        state.coins = +(state.coins + cps).toFixed(8);
        updateDisplay();
      }
    }, 1000);

    setInterval(()=>{
      if(state.limitCounter < state.coinLimit){
        state.limitCounter = Math.min(state.coinLimit, state.limitCounter + 1);
        updateDisplay();
      }
    }, 5000);
  }

  /* confetti & sticker helpers reused above */

  /* navigation helpers */
  function showSection(name){
    showSection = showSection; // no-op to keep function name in scope
    document.getElementById('home').classList.remove('active');
    document.getElementById('upgrades').classList.remove('active');
    document.getElementById('tasks').classList.remove('active');
    document.getElementById(name).classList.add('active');

    document.querySelectorAll('.nav-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-' + name).classList.add('active');
    showToast(name.charAt(0).toUpperCase() + name.slice(1));
  }

  // Expose to inline handlers
  window.showSection = showSection;
  window.claimDailyReward = claimDailyReward;
  window.watchVideoTask = watchVideoTask;
  window.miniTask = miniTask;

  /* keyboard support */
  window.addEventListener('keydown', (e) => {
    if(e.code === 'Space'){
      e.preventDefault();
      earnCoin();
    }
  });

  /* attach main click */
  faghaniEl.addEventListener('click', (e)=> {
    earnCoin();
  });

  /* helpers used earlier, but need to be declared before use */
  function bigCenter(){
    const r = faghaniEl.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function spawnCoinStickers(x,y,count=1){
    const max = Math.min(18, count);
    for(let i=0;i<max;i++){
      const el = document.createElement('div');
      el.className = 'coin-sticker';
      el.textContent = '💰';
      document.body.appendChild(el);

      const spread = (i - (max-1)/2) * 10 + (Math.random()*6 - 3);
      el.style.left = (x + spread) + 'px';
      el.style.top = (y + (Math.random()*8 - 4)) + 'px';
      el.style.opacity = '1';
      el.style.transform = `translate(-50%,-50%) scale(${1 - Math.random()*0.12})`;
      const duration = 1100 + Math.random()*700;
      const delay = Math.random()*90;
      el.style.animation = `float-wobble ${duration}ms cubic-bezier(.2,.9,.2,1) ${delay}ms forwards`;
      el.style.rotate = (Math.random()*40 - 20) + 'deg';
      setTimeout(()=> { try{ el.remove(); }catch(e){} }, duration + delay + 40);
    }
  }

  function spawnConfetti(x,y,amount=12){
    const colors = ['#7ef2d2','#7b6bff','#ffd166','#ff6b6b','#6be6ff'];
    for(let i=0;i<amount;i++){
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = (x + (Math.random()*120 - 60)) + 'px';
      c.style.top = (y + (Math.random()*30 - 10)) + 'px';
      c.style.background = colors[Math.floor(Math.random()*colors.length)];
      c.style.width = (6 + Math.random()*8) + 'px';
      c.style.height = (8 + Math.random()*10) + 'px';
      document.body.appendChild(c);
      const duration = 800 + Math.random()*700;
      c.style.animation = `confetti-fall ${duration}ms cubic-bezier(.2,.9,.2,1) forwards`;
      setTimeout(()=> { try{ c.remove(); } catch(e){} }, duration + 40);
    }
  }

  /* demo buy (tries to buy cheapest to show animation) */
  function demoBuy(){
    const keys = Object.keys(state.cards);
    for(const k of keys){
      if(state.coins >= state.cards[k].cost){
        const cardEl = document.querySelector(`.btn-buy[data-card="${k}"]`)?.closest('.upgrade-card');
        buyCard(k, cardEl);
        return;
      }
    }
    showToast('Not enough coins for demo', { danger:true });
  }

  /* init */
  updateDisplay();
  startIntervals();

  if(!localStorage.getItem('__faghani_seen_v3')){
    showToast('Welcome — tap the circle to earn!', {});
    localStorage.setItem('__faghani_seen_v3','1');
  }
  setInterval(updateDisplay, 3000);