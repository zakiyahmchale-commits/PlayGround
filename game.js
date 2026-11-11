(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const mapCanvas = document.getElementById('miniMap');
  const mctx = mapCanvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const W = 1800, H = 1200;
  const target = { x: 1370, y: 354, angle: Math.PI / 2 };
  const playerStart = { x: 385, y: 856, angle: -0.07 };
  const keys = new Set();
  const touch = { left: false, right: false, forward: false, reverse: false, brake: false };
  let cars = [], camera = { x: playerStart.x, y: playerStart.y }, player, started = false, complete = false;
  let elapsed = 0, impacts = 0, parkProgress = 0, lastFrame = 0, toastTimer = 0, audioCtx = null, soundOn = true;
  let viewW = 0, viewH = 0, dpr = 1, elapsedDisplay = -1;
  const colors = ['#d8e5e3', '#d2b279', '#718b8a', '#b95f4c', '#9ca7b1', '#596a5c', '#d5d4c8'];
  const targetBay = { x: target.x - 42, y: target.y - 66, w: 84, h: 132 };
  const roadLines = [];
  for (let x = 56; x < W; x += 74) roadLines.push(x);

  function buildCars() {
    cars = [];
    const xs = [294, 399, 504, 609, 714, 819, 924, 1029, 1134, 1239, 1344, 1449, 1554];
    xs.forEach((x, i) => {
      if (Math.abs(x - target.x) < 52) return;
      if (![4, 8, 11].includes(i)) cars.push({ x, y: 345 + (i % 3) * 5, angle: -Math.PI / 2, color: colors[(i + 2) % colors.length], parked: true });
    });
    xs.forEach((x, i) => {
      if (![1, 5, 9].includes(i)) cars.push({ x: x + (i % 2 ? 10 : 0), y: 936 - (i % 3) * 4, angle: -Math.PI / 2, color: colors[(i + 4) % colors.length], parked: true });
    });
    cars.push({ x: 175, y: 592, angle: 0, color: '#b8c2bd', parked: true });
    cars.push({ x: 1680, y: 720, angle: Math.PI, color: '#c0a287', parked: true });
  }
  function freshPlayer() { return { x: playerStart.x, y: playerStart.y, angle: playerStart.angle, speed: 0, steer: 0, moving: false }; }
  buildCars(); player = freshPlayer();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = Math.max(1, rect.width); viewH = Math.max(1, rect.height);
    canvas.width = Math.round(viewW * dpr); canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize); resize();

  function roundedRect(c, x, y, w, h, r) {
    c.beginPath(); c.roundRect(x, y, w, h, r);
  }
  function drawWorld() {
    ctx.fillStyle = '#555c59'; ctx.fillRect(0, 0, W, H);
    // Asphalt tonal variation and subtle aggregate flecks.
    ctx.fillStyle = '#545b59'; ctx.fillRect(0, 145, W, 1055);
    for (let i = 0; i < 250; i++) {
      const x = (i * 197 + 51) % W, y = 160 + ((i * 311 + 93) % 1025);
      ctx.fillStyle = i % 3 ? 'rgba(227,230,216,.025)' : 'rgba(16,23,23,.06)';
      ctx.fillRect(x, y, 2 + i % 3, 1 + i % 2);
    }
    // Arrival boulevard and parking aisles.
    ctx.fillStyle = '#4d5552'; ctx.fillRect(0, 520, W, 235);
    ctx.fillStyle = '#606763'; ctx.fillRect(0, 624, W, 2);
    ctx.setLineDash([25, 22]); ctx.strokeStyle = 'rgba(220,225,209,.36)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(30, 641); ctx.lineTo(W - 30, 641); ctx.stroke(); ctx.setLineDash([]);
    // Mall façade at the far edge.
    ctx.fillStyle = '#414846'; ctx.fillRect(0, 0, W, 144);
    ctx.fillStyle = '#737a73'; ctx.fillRect(0, 139, W, 12);
    ctx.fillStyle = '#303838'; ctx.fillRect(0, 16, W, 9);
    for (let x = 28; x < W - 20; x += 128) {
      ctx.fillStyle = '#687674'; ctx.fillRect(x, 35, 92, 82);
      ctx.fillStyle = '#8d9b91'; ctx.fillRect(x + 4, 39, 84, 3);
      ctx.fillStyle = '#43504f'; ctx.fillRect(x + 4, 45, 84, 65);
      ctx.fillStyle = 'rgba(197,218,202,.13)'; ctx.fillRect(x + 10, 50, 29, 55);
      ctx.fillStyle = '#7b837a'; ctx.fillRect(x + 44, 44, 2, 67);
    }
    // Concrete curbs, islands, shrubs.
    drawIsland(92, 450, 155, 32); drawIsland(1578, 790, 142, 31);
    drawIsland(1045, 510, 142, 25); drawIsland(475, 762, 145, 24);
    // Parking space paint.
    const stalls = [294,399,504,609,714,819,924,1029,1134,1239,1344,1449,1554];
    for (const x of stalls) {
      // Top row, deliberately leave target bay open.
      ctx.strokeStyle = 'rgba(223,225,207,.68)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 48, 278); ctx.lineTo(x - 48, 433); ctx.moveTo(x + 48, 278); ctx.lineTo(x + 48, 433); ctx.stroke();
      // Bottom row.
      ctx.beginPath(); ctx.moveTo(x - 48, 807); ctx.lineTo(x - 48, 1000); ctx.moveTo(x + 48, 807); ctx.lineTo(x + 48, 1000); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(230,235,216,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(245, 278); ctx.lineTo(1598, 278); ctx.moveTo(245, 433); ctx.lineTo(1598, 433);
    ctx.moveTo(245, 807); ctx.lineTo(1598, 807); ctx.moveTo(245, 1000); ctx.lineTo(1598, 1000); ctx.stroke();
    // Disabled / accessible bay marks.
    ctx.strokeStyle = 'rgba(114,180,185,.68)'; ctx.lineWidth = 2;
    ctx.strokeRect(250, 278, 88, 155); ctx.strokeRect(250, 807, 88, 193);
    drawAccessibleSymbol(294, 350); drawAccessibleSymbol(294, 902);
    // The destination bay with pulsing guide marks.
    const pulse = .68 + Math.sin(performance.now() * .004) * .17;
    ctx.fillStyle = `rgba(216,243,106,${started ? .17 : .11})`;
    roundedRect(ctx, targetBay.x, targetBay.y, targetBay.w, targetBay.h, 7); ctx.fill();
    ctx.strokeStyle = `rgba(216,243,106,${pulse})`; ctx.lineWidth = 3; ctx.setLineDash([9, 6]);
    ctx.strokeRect(targetBay.x + 2, targetBay.y + 2, targetBay.w - 4, targetBay.h - 4); ctx.setLineDash([]);
    ctx.fillStyle = '#d8f36a'; ctx.font = '500 16px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('24', target.x, target.y - 76);
    // Direction arrows in driving lanes.
    ctx.fillStyle = 'rgba(225,229,212,.35)';
    for (let x = 170; x < 1660; x += 225) {
      ctx.beginPath(); ctx.moveTo(x, 580); ctx.lineTo(x - 10, 595); ctx.lineTo(x - 3, 595); ctx.lineTo(x - 3, 611); ctx.lineTo(x + 3, 611); ctx.lineTo(x + 3, 595); ctx.lineTo(x + 10, 595); ctx.closePath(); ctx.fill();
    }
    // Entrance markings.
    ctx.fillStyle = 'rgba(231,231,211,.55)'; ctx.font = '500 12px "DM Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('SLOW  •  PARKING ZONE', 52, 555);
    // Boundaries are decorative, not barriers.
    ctx.strokeStyle = 'rgba(205,210,194,.21)'; ctx.lineWidth = 3; ctx.strokeRect(20, 162, W - 40, 1020);
    drawCars(); drawPlayer();
  }
  function drawIsland(x, y, w, h) {
    ctx.fillStyle = '#737872'; roundedRect(ctx, x - 5, y - 4, w + 10, h + 8, h / 2); ctx.fill();
    ctx.fillStyle = '#3e5548'; roundedRect(ctx, x, y, w, h, h / 2); ctx.fill();
    for (let i = 0; i < Math.floor(w / 23); i++) {
      ctx.fillStyle = i % 2 ? '#718267' : '#82906f';
      ctx.beginPath(); ctx.arc(x + 12 + i * 22, y + h / 2 + Math.sin(i * 3) * 3, 7 + (i % 2), 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawAccessibleSymbol(x, y) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = 'rgba(124,190,194,.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -13, 5, 0, Math.PI * 2); ctx.moveTo(0, -8); ctx.lineTo(0, 6); ctx.lineTo(13, 6); ctx.moveTo(0, -2); ctx.lineTo(11, -2); ctx.moveTo(0, 6); ctx.lineTo(-8, 18); ctx.moveTo(0, 6); ctx.lineTo(9, 18); ctx.stroke(); ctx.restore();
  }
  function drawCars() {
    for (const car of cars) drawVehicle(car.x, car.y, car.angle, car.color, false);
  }
  function drawPlayer() { drawVehicle(player.x, player.y, player.angle, '#d7e8ee', true); }
  function drawVehicle(x, y, angle, color, isPlayer) {
    ctx.save(); ctx.translate(x + 3, y + 6); ctx.rotate(angle); ctx.fillStyle = 'rgba(0,0,0,.32)'; roundedRect(ctx, -29, -17, 61, 35, 9); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    // Wheels
    ctx.fillStyle = '#182021';
    for (const wx of [-16, 15]) for (const wy of [-17, 17]) { roundedRect(ctx, wx - 7, wy - 3, 14, 6, 2); ctx.fill(); }
    // Body and hood/trunk
    ctx.fillStyle = isPlayer ? '#b5c8cb' : color; roundedRect(ctx, -29, -14, 58, 28, 8); ctx.fill();
    ctx.fillStyle = isPlayer ? '#e2eff0' : shade(color, 1.12); roundedRect(ctx, 7, -12, 16, 24, 6); ctx.fill();
    ctx.fillStyle = isPlayer ? '#8ca7ab' : shade(color, .78); roundedRect(ctx, -19, -11, 25, 22, 6); ctx.fill();
    // Glass panes
    ctx.fillStyle = '#24383b'; roundedRect(ctx, -16, -9, 11, 18, 3); ctx.fill();
    ctx.fillStyle = '#2c4447'; roundedRect(ctx, -3, -9, 10, 18, 3); ctx.fill();
    ctx.fillStyle = 'rgba(204,236,237,.4)'; ctx.fillRect(-14, -7, 2, 14); ctx.fillRect(-1, -7, 2, 14);
    // Lights and trim
    ctx.fillStyle = '#f9e3a9'; ctx.fillRect(26, -10, 3, 6); ctx.fillRect(26, 4, 3, 6);
    ctx.fillStyle = '#db5e52'; ctx.fillRect(-28, -10, 3, 6); ctx.fillRect(-28, 4, 3, 6);
    ctx.strokeStyle = isPlayer ? '#eff5e4' : 'rgba(255,255,255,.4)'; ctx.lineWidth = isPlayer ? 1.6 : .8; roundedRect(ctx, -29, -14, 58, 28, 8); ctx.stroke();
    if (isPlayer) {
      ctx.fillStyle = '#eff5e4'; ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(6, 0); ctx.lineTo(0, 1); ctx.fill();
      // Brake glow when stopped with brake input.
      if (touch.brake || keys.has(' ')) { ctx.fillStyle = '#ff775d'; ctx.fillRect(-28, -10, 3, 6); ctx.fillRect(-28, 4, 3, 6); }
    }
    ctx.restore();
  }
  function shade(hex, mult) {
    const n = parseInt(hex.slice(1), 16), r = Math.min(255, ((n >> 16) & 255) * mult), g = Math.min(255, ((n >> 8) & 255) * mult), b = Math.min(255, (n & 255) * mult);
    return `rgb(${r|0},${g|0},${b|0})`;
  }
  function render() {
    const sx = Math.min(viewW / 1200, viewH / 760);
    const scale = Math.max(.28, sx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#48504d'; ctx.fillRect(0, 0, viewW, viewH);
    ctx.save(); ctx.translate(viewW / 2 - camera.x * scale, viewH / 2 - camera.y * scale); ctx.scale(scale, scale); drawWorld(); ctx.restore();
    drawMap();
  }
  function drawMap() {
    const w = mapCanvas.width, h = mapCanvas.height, sx = w / W, sy = h / H;
    mctx.clearRect(0, 0, w, h); mctx.fillStyle = '#343d3b'; mctx.fillRect(0, 0, w, h);
    mctx.fillStyle = '#414947'; mctx.fillRect(0, 0, w, h);
    mctx.fillStyle = '#4b5550'; mctx.fillRect(0, 52 * sy, w, 75 * sy);
    mctx.fillStyle = '#59645d'; mctx.fillRect(0, 520 * sy, w, 235 * sy);
    mctx.strokeStyle = '#929b8c'; mctx.lineWidth = 1;
    for (let x = 294; x < 1600; x += 105) { mctx.beginPath(); mctx.moveTo(x * sx, 280 * sy); mctx.lineTo(x * sx, 435 * sy); mctx.moveTo(x * sx, 807 * sy); mctx.lineTo(x * sx, 1000 * sy); mctx.stroke(); }
    mctx.fillStyle = 'rgba(216,243,106,.3)'; mctx.fillRect(targetBay.x * sx, targetBay.y * sy, targetBay.w * sx, targetBay.h * sy);
    for (const car of cars) { mctx.fillStyle = '#b9c3bd'; mctx.fillRect(car.x * sx - 2, car.y * sy - 3, 4, 6); }
    mctx.save(); mctx.translate(player.x * sx, player.y * sy); mctx.rotate(player.angle); mctx.fillStyle = '#f1f3eb'; mctx.beginPath(); mctx.moveTo(0, -5); mctx.lineTo(3.2, 3); mctx.lineTo(0, 1.5); mctx.lineTo(-3.2, 3); mctx.closePath(); mctx.fill(); mctx.restore();
    mctx.strokeStyle = '#d8f36a'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(target.x * sx, target.y * sy, 4, 0, Math.PI * 2); mctx.stroke();
  }
  function showToast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
  }
  function beep(freq = 570, duration = .08) {
    if (!soundOn) return;
    try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(.055, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + duration); } catch (_) {}
  }
  function update(dt) {
    if (started && !complete) elapsed += dt;
    const forward = keys.has('w') || keys.has('arrowup') || touch.forward;
    const reverse = keys.has('s') || keys.has('arrowdown') || touch.reverse;
    const left = keys.has('a') || keys.has('arrowleft') || touch.left;
    const right = keys.has('d') || keys.has('arrowright') || touch.right;
    const brake = keys.has(' ') || touch.brake;
    const accel = forward ? 1 : reverse ? -1 : 0;
    if (accel) {
      player.speed += accel * (accel < 0 && player.speed > 5 ? 500 : 350) * dt;
      player.moving = true;
    } else {
      player.speed *= Math.pow(.982, dt * 60);
      if (Math.abs(player.speed) < 2) player.speed = 0;
    }
    player.speed = Math.max(-100, Math.min(255, player.speed));
    if (brake) { player.speed *= Math.pow(.78, dt * 60); if (Math.abs(player.speed) < 5) player.speed = 0; }
    const steerTarget = (right ? 1 : 0) - (left ? 1 : 0);
    player.steer += (steerTarget - player.steer) * Math.min(1, dt * 8);
    const speedFactor = Math.min(1, Math.abs(player.speed) / 55);
    player.angle += player.steer * speedFactor * (player.speed >= 0 ? 1 : -1) * 1.72 * dt;
    player.angle = Math.atan2(Math.sin(player.angle), Math.cos(player.angle));
    const oldX = player.x, oldY = player.y;
    player.x += Math.cos(player.angle) * player.speed * dt;
    player.y += Math.sin(player.angle) * player.speed * dt;
    // Soft boundary and parked-car collisions.
    let hit = player.x < 52 || player.x > W - 52 || player.y < 158 || player.y > H - 24;
    for (const car of cars) if (Math.hypot(player.x - car.x, player.y - car.y) < 44) { hit = true; break; }
    // Keep islands as solid, rounded obstacles.
    for (const ob of [{x:92,y:450,w:155,h:32},{x:1578,y:790,w:142,h:31},{x:1045,y:510,w:142,h:25},{x:475,y:762,w:145,h:24}]) {
      const px = Math.max(ob.x, Math.min(player.x, ob.x + ob.w)), py = Math.max(ob.y, Math.min(player.y, ob.y + ob.h));
      if (Math.hypot(player.x - px, player.y - py) < 32) hit = true;
    }
    if (hit) {
      player.x = oldX; player.y = oldY;
      if (Math.abs(player.speed) > 24) { impacts++; $('impactCount').textContent = String(impacts).padStart(2, '0'); $('damageFlash').classList.add('hit'); setTimeout(() => $('damageFlash').classList.remove('hit'), 130); showToast('IMPACT — take it a little slower'); beep(165, .16); }
      player.speed *= -.14;
    }
    // Precision parking: position, alignment and low speed must all be right.
    const dist = Math.hypot(player.x - target.x, player.y - target.y);
    const angleDelta = Math.abs(Math.atan2(Math.sin(player.angle - target.angle), Math.cos(player.angle - target.angle)));
    const aligned = dist < 21 && angleDelta < .23 && Math.abs(player.speed) < 28;
    if (started && !complete && aligned) parkProgress = Math.min(1, parkProgress + dt / 1.25);
    else parkProgress = Math.max(0, parkProgress - dt * 1.8);
    $('progressBar').style.width = `${Math.round(parkProgress * 100)}%`;
    $('assistText').textContent = parkProgress > 0 ? (parkProgress >= 1 ? 'PARKED PERFECTLY' : 'HOLD POSITION…') : dist < 120 ? 'LINE UP & SLOW DOWN' : 'FIND BAY 24';
    if (parkProgress >= 1 && !complete) finishGame();
    // Follow camera with a little look-ahead.
    const look = Math.min(60, Math.abs(player.speed) * .18);
    const cx = player.x + Math.cos(player.angle) * look, cy = player.y + Math.sin(player.angle) * look;
    camera.x += (cx - camera.x) * Math.min(1, dt * 3.2); camera.y += (cy - camera.y) * Math.min(1, dt * 3.2);
    camera.x = Math.max(250, Math.min(W - 250, camera.x)); camera.y = Math.max(330, Math.min(H - 290, camera.y));
    updateHud();
  }
  function updateHud() {
    const kmh = Math.round(Math.abs(player.speed) * .36);
    $('speed').textContent = String(kmh).padStart(3, '0'); $('speedBar').style.width = `${Math.min(100, kmh / 90 * 100)}%`;
    $('gear').textContent = Math.abs(player.speed) < 3 ? 'P' : player.speed < 0 ? 'R' : (keys.has(' ') || touch.brake) ? 'N' : 'D';
    const secs = Math.floor(elapsed), mm = String(Math.floor(secs / 60)).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
    const display = `${mm}:${ss}`; if (display !== elapsedDisplay) { $('timer').textContent = display; elapsedDisplay = display; }
  }
  function finishGame() {
    complete = true; const score = Math.max(60, 100 - impacts * 12 - Math.floor(elapsed / 24));
    const best = Number(localStorage.getItem('lotLegendsBest') || 0); if (score > best) localStorage.setItem('lotLegendsBest', score);
    $('bestScore').textContent = `${score}`; $('scoreValue').textContent = score;
    $('resultText').textContent = impacts === 0 ? 'A spotless park. Smooth, centered, and clean.' : `${impacts} impact${impacts === 1 ? '' : 's'} on the way — a little more patience and you’ve got it.`;
    $('completeOverlay').classList.remove('hidden'); beep(780, .2); setTimeout(() => beep(980, .22), 110);
  }
  function startGame() {
    started = true; complete = false; $('startOverlay').classList.add('hidden'); $('completeOverlay').classList.add('hidden');
    if (!player.moving) showToast('Drive to the open lane, then line up with Bay 24'); beep(620, .1);
  }
  function resetGame() {
    player = freshPlayer(); camera = { x: player.x, y: player.y }; elapsed = 0; impacts = 0; parkProgress = 0; elapsedDisplay = -1; started = false; complete = false;
    $('impactCount').textContent = '00'; $('timer').textContent = '00:00'; $('bestScore').textContent = localStorage.getItem('lotLegendsBest') || '—'; $('startOverlay').classList.remove('hidden'); $('completeOverlay').classList.add('hidden'); $('progressBar').style.width = '0%'; $('assistText').textContent = 'FIND BAY 24';
  }
  $('bestScore').textContent = localStorage.getItem('lotLegendsBest') || '—';
  $('startBtn').addEventListener('click', startGame); $('againBtn').addEventListener('click', resetGame); $('resetBtn').addEventListener('click', resetGame);
  $('soundBtn').addEventListener('click', () => { soundOn = !soundOn; $('soundBtn').textContent = soundOn ? '♫' : '♪'; $('soundBtn').style.color = soundOn ? '' : '#d8f36a'; if (soundOn) beep(570); });
  window.addEventListener('keydown', (e) => { const key = e.key.toLowerCase(); if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) e.preventDefault(); keys.add(key); if ((key === 'enter' || key === ' ') && !started) startGame(); if (key === 'r' && started) resetGame(); });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase())); window.addEventListener('blur', () => keys.clear());
  document.querySelectorAll('[data-control]').forEach((button) => {
    const name = button.dataset.control;
    const down = (e) => { e.preventDefault(); touch[name] = true; button.setPointerCapture?.(e.pointerId); };
    const up = (e) => { e.preventDefault(); touch[name] = false; };
    button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('lostpointercapture', up);
    button.addEventListener('contextmenu', e => e.preventDefault());
  });
  function frame(time) {
    const dt = lastFrame ? Math.min(.04, (time - lastFrame) / 1000) : .016; lastFrame = time;
    update(dt); render(); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
