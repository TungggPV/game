(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("screenOverlay");
  const overlayCopy = document.getElementById("overlayCopy");
  const startButton = document.getElementById("startButton");
  const restartButton = document.getElementById("restartButton");
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  const modeSelect = document.querySelector(".mode-select");

  const W = 1280;
  const H = 720;
  const GROUND_Y = 586;
  const WORLD_W = 4300;
  const GRAVITY = 2100;
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const armorForms = [
    {
      id: "flame",
      name: "Nova Blade",
      short: "BLADE",
      primary: "#0b65d8",
      plate: "#f0f6ff",
      accent: "#18e6ff",
      glow: "#22cfff",
      dark: "#07121f",
      speed: 1,
      melee: 18,
      special: "Hyper Blade",
    },
    {
      id: "tide",
      name: "Aqua Guard",
      short: "AQUA",
      primary: "#1f8ee8",
      plate: "#f2f8ff",
      accent: "#67e8ff",
      glow: "#67e8ff",
      dark: "#06192b",
      speed: 0.96,
      melee: 15,
      special: "Aegis Pulse",
    },
    {
      id: "thunder",
      name: "Volt Runner",
      short: "VOLT",
      primary: "#0056d8",
      plate: "#eaf3ff",
      accent: "#00f2ff",
      glow: "#00f2ff",
      dark: "#06111e",
      speed: 1.22,
      melee: 14,
      special: "Rising Strike",
    },
    {
      id: "stone",
      name: "Titan Shield",
      short: "TITAN",
      primary: "#0b4fb3",
      plate: "#dfe8f4",
      accent: "#35d8ff",
      glow: "#35d8ff",
      dark: "#07111a",
      speed: 0.82,
      melee: 23,
      special: "Shield Break",
    },
  ];

  const playerStyles = [
    { tag: "P1", visor: "#67f6ff", trim: "#0b65d8", shadow: "#061728", white: "#f2f7ff" },
    { tag: "P2", visor: "#94fbff", trim: "#13a7ff", shadow: "#061728", white: "#e9f4ff" },
  ];

  const controls = [
    {
      left: ["KeyA"],
      right: ["KeyD"],
      up: ["KeyW", "Space"],
      attack: ["KeyJ"],
      dash: ["KeyK"],
      guard: ["KeyL"],
      special: ["KeyF"],
      overdrive: ["KeyR"],
      prevArmor: ["KeyQ"],
      nextArmor: ["KeyE"],
      armor1: ["Digit1"],
      armor2: ["Digit2"],
      armor3: ["Digit3"],
      armor4: ["Digit4"],
    },
    {
      left: ["ArrowLeft"],
      right: ["ArrowRight"],
      up: ["ArrowUp"],
      attack: ["Numpad1", "Period"],
      dash: ["Numpad2", "Comma"],
      guard: ["Numpad3", "Slash"],
      special: ["Numpad0", "Enter"],
      overdrive: ["Numpad5", "ShiftRight"],
      prevArmor: ["Numpad4", "BracketLeft"],
      nextArmor: ["Numpad6", "BracketRight"],
      armor1: ["Numpad7"],
      armor2: ["Numpad8"],
      armor3: ["Numpad9"],
      armor4: ["NumpadAdd"],
    },
  ];

  const waveBlueprints = [
    {
      at: 160,
      barrier: 800,
      title: "Khu phố rìa",
      foes: [
        ["stalker", 620],
        ["stalker", 720],
        ["lancer", 835],
      ],
    },
    {
      at: 1080,
      barrier: 1680,
      title: "Cầu năng lượng",
      foes: [
        ["stalker", 1320],
        ["brute", 1460],
        ["flyer", 1580],
      ],
    },
    {
      at: 2050,
      barrier: 2660,
      title: "Xưởng lõi giáp",
      foes: [
        ["lancer", 2240],
        ["stalker", 2350],
        ["brute", 2480],
        ["flyer", 2600],
      ],
    },
    {
      at: 3180,
      barrier: 4070,
      title: "Cổng nứt",
      boss: true,
      foes: [["boss", 3720]],
    },
  ];

  const input = {
    keys: new Set(),
    just: new Set(),
    touchHeld: new Set(),
    touchJust: new Set(),
  };

  let selectedPlayerCount = 1;
  let game = makeGame(selectedPlayerCount);
  let audioContext;
  let lastTime = performance.now();
  let hitId = 1;

  function makeGame(playerCount = 1) {
    const players = Array.from({ length: playerCount }, (_, slot) => makePlayer(slot));
    return {
      mode: "menu",
      playerCount,
      players,
      player: players[0],
      time: 0,
      camera: 0,
      shake: 0,
      slowMo: 0,
      score: 0,
      combo: 0,
      comboTimer: 0,
      message: "Hào Quang Giáp",
      messageTimer: 3.8,
      activeBarrier: null,
      waves: waveBlueprints.map((wave) => ({ ...wave, spawned: false, cleared: false })),
      enemies: [],
      hits: [],
      projectiles: [],
      particles: [],
      pickups: [],
      texts: [],
      ripples: [],
      sparks: [],
    };
  }

  function makePlayer(slot) {
    return {
      id: slot,
      tag: playerStyles[slot].tag,
      x: 118 + slot * 78,
      y: GROUND_Y - 108,
      w: 56,
      h: 108,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      alive: true,
      hp: 132,
      maxHp: 132,
      core: 64,
      maxCore: 100,
      armor: slot % armorForms.length,
      attackCd: 0,
      attackPose: 0,
      comboStep: 0,
      dashCd: 0,
      dashTimer: 0,
      invuln: 0,
      specialCd: 0,
      overdrive: 0,
      guardSpark: 0,
      hurt: 0,
      stepTime: Math.random() * 3,
      trail: [],
    };
  }

  function startGame() {
    unlockAudio();
    game = makeGame(selectedPlayerCount);
    game.mode = "playing";
    hideOverlay();
    canvas.focus();
    tone(220, 0.06, "square", 0.04);
    setTimeout(() => tone(440, 0.08, "triangle", 0.04), 80);
  }

  function showOverlay(title, copy, options = {}) {
    const { primaryLabel = "Bắt đầu", showRestart = false, showMode = false } = options;
    overlay.querySelector("h1").textContent = title;
    overlayCopy.textContent = copy;
    restartButton.style.display = showRestart ? "inline-flex" : "none";
    if (modeSelect) modeSelect.style.display = showMode ? "flex" : "none";
    startButton.textContent = primaryLabel;
    overlay.classList.add("is-visible");
  }

  function hideOverlay() {
    overlay.classList.remove("is-visible");
  }

  function unlockAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext?.state === "suspended") audioContext.resume();
  }

  function tone(freq, duration = 0.08, type = "sine", volume = 0.035) {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function matchesControl(player, action, setName) {
    const keys = controls[player.id]?.[action] || [];
    return keys.some((key) => input[setName].has(key));
  }

  function isHeld(player, action) {
    if (player.id === 0 && input.touchHeld.has(action)) return true;
    return matchesControl(player, action, "keys");
  }

  function wasPressed(player, action) {
    if (player.id === 0 && input.touchJust.has(action)) return true;
    return matchesControl(player, action, "just");
  }

  function keyIsHandled(code) {
    if (code === "KeyP" || code === "Escape") return true;
    return controls.some((group) => Object.values(group).some((keys) => keys.includes(code)));
  }

  function pausePressed() {
    return input.just.has("KeyP") || input.just.has("Escape");
  }

  function clearPressed() {
    input.just.clear();
    input.touchJust.clear();
  }

  function livingPlayers() {
    return game.players.filter((player) => player.alive && player.hp > 0);
  }

  function frontPlayerX() {
    return Math.max(...game.players.map((player) => player.x));
  }

  function targetPlayer(enemy) {
    const alive = livingPlayers();
    const candidates = alive.length ? alive : [game.players[0]];
    let best = candidates[0];
    let bestDist = Infinity;
    for (const player of candidates) {
      const dx = player.x + player.w / 2 - (enemy.x + enemy.w / 2);
      const dy = player.y + player.h / 2 - (enemy.y + enemy.h / 2);
      const dist = Math.abs(dx) + Math.abs(dy) * 0.35;
      if (dist < bestDist) {
        best = player;
        bestDist = dist;
      }
    }
    return best;
  }

  function addHit(hit) {
    game.hits.push({
      id: hitId++,
      x: hit.x,
      y: hit.y,
      w: hit.w,
      h: hit.h,
      life: hit.life ?? 0.12,
      maxLife: hit.life ?? 0.12,
      owner: hit.owner,
      attacker: hit.attacker ?? null,
      damage: hit.damage,
      knock: hit.knock ?? 280,
      color: hit.color ?? "#f7f1de",
      element: hit.element ?? "neutral",
      hit: new Set(),
      kind: hit.kind ?? "slash",
      stun: hit.stun ?? 0.12,
    });
  }

  function addProjectile(projectile) {
    game.projectiles.push({
      x: projectile.x,
      y: projectile.y,
      w: projectile.w,
      h: projectile.h,
      vx: projectile.vx,
      vy: projectile.vy ?? 0,
      life: projectile.life ?? 1,
      maxLife: projectile.life ?? 1,
      owner: projectile.owner,
      attacker: projectile.attacker ?? null,
      damage: projectile.damage,
      knock: projectile.knock ?? 240,
      color: projectile.color ?? "#18e6ff",
      element: projectile.element,
      kind: projectile.kind ?? "bolt",
      hit: new Set(),
    });
  }

  function spawnEnemy(type, x) {
    const catalog = {
      stalker: { hp: 48, w: 48, h: 86, speed: 118, damage: 11, range: 58, cd: 1.15, name: "Bóng Cắt" },
      lancer: { hp: 62, w: 52, h: 92, speed: 90, damage: 14, range: 118, cd: 1.35, name: "Thương Ảnh" },
      brute: { hp: 108, w: 70, h: 112, speed: 62, damage: 21, range: 70, cd: 1.75, name: "Trọng Giáp Đen" },
      flyer: { hp: 42, w: 54, h: 58, speed: 92, damage: 10, range: 280, cd: 1.5, name: "Mắt Nứt" },
      boss: { hp: 520, w: 132, h: 178, speed: 54, damage: 25, range: 170, cd: 1.1, name: "Lò Nứt" },
    };
    const base = catalog[type];
    const multiplier = game.playerCount > 1 && type !== "boss" ? 1.18 : 1;
    game.enemies.push({
      type,
      name: base.name,
      x,
      y: type === "flyer" ? GROUND_Y - 250 : GROUND_Y - base.h,
      w: base.w,
      h: base.h,
      vx: 0,
      vy: 0,
      hp: base.hp * multiplier,
      maxHp: base.hp * multiplier,
      speed: base.speed,
      damage: base.damage,
      range: base.range,
      attackCd: 0.45 + Math.random() * 0.5,
      baseCd: base.cd,
      facing: -1,
      stun: 0,
      hurt: 0,
      phase: 0,
      phaseTimer: 1.2,
      bob: Math.random() * 10,
      elite: type === "brute" || type === "boss",
    });
  }

  function spawnParticles(x, y, color, count, power = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (80 + Math.random() * 260) * power;
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 70 * power,
        life: 0.35 + Math.random() * 0.5,
        maxLife: 0.85,
        size: 2 + Math.random() * 5 * power,
        color,
        gravity: 520,
      });
    }
  }

  function addSpark(x, y, color, length, angle) {
    game.sparks.push({ x, y, color, length, angle, life: 0.22, maxLife: 0.22 });
  }

  function addText(text, x, y, color = "#f7f1de") {
    game.texts.push({ text, x, y, vy: -45, life: 0.9, color });
  }

  function addRipple(x, y, color, radius = 54) {
    game.ripples.push({ x, y, color, life: 0.45, maxLife: 0.45, radius });
  }

  function update(dt) {
    if (pausePressed()) {
      if (game.mode === "playing") {
        game.mode = "paused";
        showOverlay("Tạm dừng", "Lõi giáp đang giữ trạng thái. Quay lại khi bạn sẵn sàng.", {
          primaryLabel: "Tiếp tục",
          showRestart: true,
        });
      } else if (game.mode === "paused") {
        game.mode = "playing";
        hideOverlay();
        canvas.focus();
      }
      clearPressed();
      return;
    }

    if (game.mode !== "playing") {
      const p1 = game.players[0];
      if (game.mode === "menu" && (wasPressed(p1, "attack") || wasPressed(p1, "special"))) startGame();
      clearPressed();
      return;
    }

    const scale = game.slowMo > 0 ? 0.55 : 1;
    const step = dt * scale;
    game.time += step;
    game.slowMo = Math.max(0, game.slowMo - dt);
    game.shake = Math.max(0, game.shake - dt * 18);
    game.messageTimer = Math.max(0, game.messageTimer - step);
    game.comboTimer = Math.max(0, game.comboTimer - step);
    if (game.comboTimer <= 0) game.combo = 0;

    updateWaves(step);
    updatePlayers(step);
    updateEnemies(step);
    updateHits(step);
    updateProjectiles(step);
    updatePickups(step);
    updateEffects(step);
    updateCamera(step);
    clearPressed();
  }

  function updateWaves() {
    const wave = game.waves.find((item) => !item.cleared);
    if (!wave) return;

    if (!wave.spawned && frontPlayerX() >= wave.at) {
      wave.spawned = true;
      game.activeBarrier = wave.barrier;
      game.message = wave.boss ? "Boss: Lò Nứt" : wave.title;
      game.messageTimer = wave.boss ? 3.1 : 2.4;
      wave.foes.forEach(([type, x]) => spawnEnemy(type, x));
      if (game.playerCount > 1 && !wave.boss) spawnEnemy("stalker", wave.barrier - 120);
      tone(wave.boss ? 130 : 180, 0.12, "sawtooth", 0.035);
      if (wave.boss) {
        game.shake = 12;
        game.slowMo = 0.45;
      }
    }

    if (wave.spawned && game.enemies.length === 0) {
      wave.cleared = true;
      game.activeBarrier = null;
      game.players.forEach((player) => {
        if (player.alive) player.core = Math.min(player.maxCore, player.core + (wave.boss ? 100 : 24));
      });
      game.score += wave.boss ? 1500 : 420;
      game.message = wave.boss ? "Cổng nứt đã đóng" : "Khu vực sạch";
      game.messageTimer = wave.boss ? 4 : 2.2;
      tone(wave.boss ? 620 : 520, 0.14, "triangle", 0.04);
      if (wave.boss) {
        game.mode = "victory";
        showOverlay("Chiến thắng", `Điểm: ${game.score}. Lõi giáp đã ổn định trở lại.`, {
          primaryLabel: "Chơi lại",
          showMode: true,
        });
      }
    }

    if (game.activeBarrier) {
      game.players.forEach((player) => {
        player.x = Math.min(player.x, game.activeBarrier - player.w - 12);
      });
    }
  }

  function updatePlayers(dt) {
    game.players.forEach((player) => updatePlayer(dt, player));
  }

  function updatePlayer(dt, player) {
    if (!player.alive) {
      player.vx *= Math.pow(0.86, dt * 60);
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      if (player.y + player.h >= GROUND_Y) {
        player.y = GROUND_Y - player.h;
        player.vy = 0;
      }
      return;
    }

    const form = armorForms[player.armor];
    const left = isHeld(player, "left");
    const right = isHeld(player, "right");
    const guard = isGuarding(player);

    if (wasPressed(player, "armor1")) switchArmor(player, 0);
    if (wasPressed(player, "armor2")) switchArmor(player, 1);
    if (wasPressed(player, "armor3")) switchArmor(player, 2);
    if (wasPressed(player, "armor4")) switchArmor(player, 3);
    if (wasPressed(player, "nextArmor")) switchArmor(player, (player.armor + 1) % armorForms.length);
    if (wasPressed(player, "prevArmor")) switchArmor(player, (player.armor + armorForms.length - 1) % armorForms.length);

    player.attackCd = Math.max(0, player.attackCd - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.specialCd = Math.max(0, player.specialCd - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.attackPose = Math.max(0, player.attackPose - dt);
    player.hurt = Math.max(0, player.hurt - dt);
    player.guardSpark = Math.max(0, player.guardSpark - dt);
    player.overdrive = Math.max(0, player.overdrive - dt);
    player.stepTime += dt * Math.max(0.35, Math.abs(player.vx) / 120);

    if (Math.abs(player.vx) > 40 || player.dashTimer > 0 || player.overdrive > 0) {
      player.trail.unshift({
        x: player.x + player.w / 2,
        y: player.y + player.h * 0.55,
        facing: player.facing,
        armor: player.armor,
        life: 0.28,
        maxLife: 0.28,
      });
      if (player.trail.length > 12) player.trail.length = 12;
    }
    player.trail.forEach((trail) => (trail.life -= dt));
    player.trail = player.trail.filter((trail) => trail.life > 0);

    if (wasPressed(player, "overdrive") && player.core >= 85 && player.overdrive <= 0) {
      player.overdrive = 8.5;
      player.core = Math.max(0, player.core - 70);
      player.invuln = 0.45;
      game.slowMo = 0.35;
      game.shake = 8;
      game.message = `${player.tag}: Bùng nổ lõi giáp`;
      game.messageTimer = 1.6;
      spawnParticles(player.x + player.w / 2, player.y + player.h * 0.48, form.accent, 44, 1.15);
      addRipple(player.x + player.w / 2, player.y + player.h * 0.6, form.accent, 118);
      tone(180, 0.1, "square", 0.04);
      setTimeout(() => tone(360, 0.12, "triangle", 0.035), 100);
    }

    if (wasPressed(player, "attack")) playerAttack(player);
    if (wasPressed(player, "special")) playerSpecial(player);

    if (wasPressed(player, "dash") && player.dashCd <= 0 && !guard) {
      player.dashTimer = 0.18;
      player.dashCd = 0.72;
      player.invuln = 0.24;
      player.vx = player.facing * (700 + (player.overdrive > 0 ? 130 : 0));
      spawnParticles(player.x + player.w / 2, player.y + player.h * 0.75, form.accent, 20, 0.65);
      tone(300, 0.05, "sawtooth", 0.025);
    }

    if (wasPressed(player, "up") && player.grounded && !guard) {
      player.vy = -760;
      player.grounded = false;
      tone(240, 0.04, "triangle", 0.02);
    }

    const move = (right ? 1 : 0) - (left ? 1 : 0);
    if (move !== 0 && player.attackPose <= 0.12 && player.dashTimer <= 0 && !guard) {
      player.facing = move;
      const max = 268 * form.speed * (player.overdrive > 0 ? 1.16 : 1);
      player.vx += move * 1920 * dt;
      player.vx = clamp(player.vx, -max, max);
    } else if (player.dashTimer <= 0) {
      const friction = guard ? 0.78 : player.grounded ? 0.86 : 0.96;
      player.vx *= Math.pow(friction, dt * 60);
      if (Math.abs(player.vx) < 6) player.vx = 0;
    }

    if (guard) player.vx *= Math.pow(0.58, dt * 60);
    if (player.dashTimer > 0) player.dashTimer -= dt;

    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 42, WORLD_W - 100);

    if (player.y + player.h >= GROUND_Y) {
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.grounded = true;
    }

    if (player.overdrive > 0) player.core = Math.min(player.maxCore, player.core + 1.8 * dt);
    else player.core = Math.min(player.maxCore, player.core + 2.1 * dt);
  }

  function isGuarding(player) {
    return isHeld(player, "guard") && player.grounded && player.attackPose <= 0 && player.dashTimer <= 0;
  }

  function switchArmor(player, index) {
    if (player.armor === index || !player.alive) return;
    player.armor = index;
    const form = armorForms[index];
    game.message = `${player.tag}: ${form.name}`;
    game.messageTimer = 1.2;
    spawnParticles(player.x + player.w / 2, player.y + player.h * 0.5, form.primary, 22, 0.7);
    tone(260 + index * 80 + player.id * 40, 0.06, "square", 0.025);
  }

  function playerAttack(player) {
    const form = armorForms[player.armor];
    if (player.attackCd > 0 || !player.alive) return;
    const chain = game.comboTimer > 0 ? (player.comboStep + 1) % 3 : 0;
    player.comboStep = chain;
    const over = player.overdrive > 0 ? 1.28 : 1;
    const damage = (form.melee + chain * 5) * over;
    const reach = chain === 2 ? 128 : 98;
    player.attackCd = chain === 2 ? 0.36 : 0.22;
    player.attackPose = chain === 2 ? 0.32 : 0.2;
    game.comboTimer = 0.85;
    addHit({
      owner: "player",
      attacker: player,
      x: player.facing > 0 ? player.x + player.w - 4 : player.x - reach + 4,
      y: player.y + 24,
      w: reach,
      h: 76,
      damage,
      knock: chain === 2 ? 470 : 290,
      color: form.accent,
      element: form.id,
      kind: chain === 2 ? "heavy" : "slash",
      stun: chain === 2 ? 0.28 : 0.16,
      life: 0.11,
    });
    for (let i = 0; i < 3; i++) {
      addSpark(player.x + player.w / 2 + player.facing * (38 + i * 18), player.y + 48 + i * 8, form.accent, 74 - i * 10, player.facing * (0.1 + i * 0.16));
    }
    spawnParticles(player.x + player.w / 2 + player.facing * 42, player.y + 54, form.accent, chain === 2 ? 24 : 14, 0.6);
    tone(chain === 2 ? 180 : 260 + chain * 60 + player.id * 40, 0.05, "square", 0.025);
  }

  function playerSpecial(player) {
    const form = armorForms[player.armor];
    if (player.specialCd > 0 || player.core < 30 || !player.alive) return;
    player.core -= 30;
    player.specialCd = 1.6;
    player.attackPose = 0.38;
    game.comboTimer = 1.2;
    game.message = `${player.tag}: ${form.special}`;
    game.messageTimer = 1.25;
    game.slowMo = 0.22;
    game.shake = 7;

    const centerX = player.x + player.w / 2;
    const centerY = player.y + player.h / 2;
    if (form.id === "flame") {
      for (let i = 0; i < 3; i++) {
        addProjectile({
          owner: "player",
          attacker: player,
          x: centerX + player.facing * (36 + i * 22),
          y: player.y + 34 + i * 12,
          w: 88,
          h: 36,
          vx: player.facing * (530 + i * 55),
          life: 0.78,
          damage: 18,
          knock: 360,
          color: form.accent,
          element: "flame",
          kind: "flame",
        });
      }
      spawnParticles(centerX, centerY, form.primary, 38, 1);
      tone(160, 0.13, "sawtooth", 0.045);
    }

    if (form.id === "tide") {
      player.hp = Math.min(player.maxHp, player.hp + 18);
      addText("+18", player.x + 22, player.y + 8, "#d8f3ff");
      addHit({
        owner: "player",
        attacker: player,
        x: centerX - 150,
        y: player.y - 20,
        w: 300,
        h: 168,
        damage: 22,
        knock: 280,
        color: form.accent,
        element: "tide",
        kind: "ring",
        stun: 0.35,
        life: 0.22,
      });
      addRipple(centerX, centerY, form.accent, 180);
      spawnParticles(centerX, centerY, form.accent, 46, 0.7);
      tone(420, 0.12, "triangle", 0.04);
    }

    if (form.id === "thunder") {
      player.invuln = 0.42;
      player.vx = player.facing * 900;
      addHit({
        owner: "player",
        attacker: player,
        x: player.facing > 0 ? player.x + 8 : player.x - 210,
        y: player.y + 10,
        w: 262,
        h: 110,
        damage: 30,
        knock: 530,
        color: form.accent,
        element: "thunder",
        kind: "line",
        stun: 0.42,
        life: 0.2,
      });
      for (let i = 0; i < 6; i++) addSpark(centerX, centerY - 20 + i * 14, form.accent, 120, player.facing * (Math.random() * 0.8 - 0.25));
      spawnParticles(centerX, centerY, form.accent, 50, 1);
      tone(720, 0.08, "square", 0.035);
    }

    if (form.id === "stone") {
      addHit({
        owner: "player",
        attacker: player,
        x: centerX - 198,
        y: GROUND_Y - 122,
        w: 396,
        h: 122,
        damage: 38,
        knock: 620,
        color: form.accent,
        element: "stone",
        kind: "slam",
        stun: 0.55,
        life: 0.2,
      });
      for (let i = 0; i < 11; i++) {
        const rx = centerX + (i - 5) * 42;
        game.particles.push({
          x: rx,
          y: GROUND_Y - 18,
          vx: (i - 5) * 18,
          vy: -270 - Math.random() * 190,
          life: 0.66,
          maxLife: 0.66,
          size: 8 + Math.random() * 9,
          color: i % 2 ? form.primary : form.accent,
          gravity: 900,
        });
      }
      addRipple(centerX, GROUND_Y - 22, form.accent, 220);
      tone(92, 0.16, "sawtooth", 0.05);
    }
  }

  function updateEnemies(dt) {
    for (const enemy of game.enemies) {
      enemy.attackCd = Math.max(0, enemy.attackCd - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.hurt = Math.max(0, enemy.hurt - dt);
      enemy.bob += dt * 4;
      const target = targetPlayer(enemy);
      enemy.facing = target.x + target.w / 2 >= enemy.x + enemy.w / 2 ? 1 : -1;

      if (enemy.stun > 0) {
        enemy.x += enemy.vx * dt;
        enemy.vx *= Math.pow(0.78, dt * 60);
        continue;
      }

      if (enemy.type === "boss") {
        updateBoss(enemy, dt, target);
        continue;
      }

      const dx = target.x + target.w / 2 - (enemy.x + enemy.w / 2);
      const dist = Math.abs(dx);
      const desired = Math.sign(dx) || enemy.facing;

      if (enemy.type === "flyer") {
        const targetY = target.y - 96 + Math.sin(game.time * 3 + enemy.bob) * 18;
        enemy.y += (targetY - enemy.y) * Math.min(1, dt * 2.4);
        enemy.x += desired * enemy.speed * dt;
        if (dist < enemy.range && enemy.attackCd <= 0) {
          enemy.attackCd = enemy.baseCd;
          addProjectile({
            owner: "enemy",
            x: enemy.x + enemy.w / 2,
            y: enemy.y + enemy.h / 2,
            w: 34,
            h: 22,
            vx: enemy.facing * 340,
            life: 1.4,
            damage: enemy.damage,
            knock: 180,
            color: "#18e6ff",
            element: "void",
            kind: "void",
          });
          tone(130, 0.05, "sine", 0.018);
        }
        continue;
      }

      if (dist > enemy.range) {
        enemy.vx += desired * enemy.speed * 10 * dt;
        enemy.vx = clamp(enemy.vx, -enemy.speed, enemy.speed);
      } else {
        enemy.vx *= Math.pow(0.75, dt * 60);
        if (enemy.attackCd <= 0) enemyAttack(enemy);
      }

      enemy.vy += GRAVITY * dt;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.y + enemy.h >= GROUND_Y) {
        enemy.y = GROUND_Y - enemy.h;
        enemy.vy = 0;
      }
      enemy.x = clamp(enemy.x, game.camera + 16, Math.min(WORLD_W - enemy.w - 24, game.camera + W - enemy.w + 260));
    }

    game.enemies = game.enemies.filter((enemy) => {
      if (enemy.hp > 0) return true;
      enemyDefeated(enemy);
      return false;
    });
  }

  function updateBoss(enemy, dt, target) {
    const dx = target.x + target.w / 2 - (enemy.x + enemy.w / 2);
    const dist = Math.abs(dx);
    const desired = Math.sign(dx) || enemy.facing;
    enemy.phaseTimer -= dt;

    if (enemy.hp < enemy.maxHp * 0.52 && enemy.phase === 0) {
      enemy.phase = 1;
      enemy.phaseTimer = 0.2;
      enemy.speed += 18;
      game.message = "Lò Nứt chuyển pha";
      game.messageTimer = 1.4;
      spawnParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, "#18e6ff", 60, 1);
      game.shake = 10;
    }

    if (dist > enemy.range) {
      enemy.vx += desired * enemy.speed * 7 * dt;
      enemy.vx = clamp(enemy.vx, -enemy.speed, enemy.speed);
    } else {
      enemy.vx *= Math.pow(0.74, dt * 60);
    }

    if (enemy.attackCd <= 0) {
      const roll = Math.random();
      if (dist < 145) bossSmash(enemy);
      else if (roll < 0.46) bossWave(enemy);
      else if (roll < 0.76 || enemy.phase === 0) bossBeam(enemy);
      else bossSummon(enemy);
      enemy.attackCd = enemy.phase ? 1.15 : 1.35;
    }

    enemy.vy += GRAVITY * dt;
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    if (enemy.y + enemy.h >= GROUND_Y) {
      enemy.y = GROUND_Y - enemy.h;
      enemy.vy = 0;
    }
    enemy.x = clamp(enemy.x, 3230, 4020 - enemy.w);
  }

  function enemyAttack(enemy) {
    const reach = enemy.type === "lancer" ? 150 : enemy.w + 34;
    enemy.attackCd = enemy.baseCd;
    addHit({
      owner: "enemy",
      x: enemy.facing > 0 ? enemy.x + enemy.w - 6 : enemy.x - reach + 8,
      y: enemy.y + enemy.h * 0.28,
      w: reach,
      h: enemy.h * 0.56,
      damage: enemy.damage,
      knock: enemy.type === "brute" ? 480 : 290,
      color: "#18e6ff",
      kind: "enemy",
      element: "void",
      stun: 0.18,
      life: 0.18,
    });
    spawnParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, "#18e6ff", 10, 0.4);
  }

  function bossSmash(enemy) {
    addHit({
      owner: "enemy",
      x: enemy.x - 54,
      y: GROUND_Y - 150,
      w: enemy.w + 108,
      h: 150,
      damage: 28,
      knock: 650,
      color: "#18e6ff",
      kind: "slam",
      element: "void",
      stun: 0.25,
      life: 0.24,
    });
    game.shake = 11;
    addRipple(enemy.x + enemy.w / 2, GROUND_Y - 16, "#18e6ff", 176);
    tone(76, 0.14, "sawtooth", 0.045);
  }

  function bossWave(enemy) {
    for (let i = 0; i < 2; i++) {
      addProjectile({
        owner: "enemy",
        x: enemy.x + enemy.w / 2,
        y: GROUND_Y - 58 - i * 32,
        w: 76,
        h: 30,
        vx: enemy.facing * (300 + i * 42),
        life: 1.65,
        damage: 17,
        knock: 330,
        color: "#18e6ff",
        element: "void",
        kind: "void",
      });
    }
    spawnParticles(enemy.x + enemy.w / 2, enemy.y + 70, "#18e6ff", 26, 0.8);
  }

  function bossBeam(enemy) {
    addHit({
      owner: "enemy",
      x: enemy.facing > 0 ? enemy.x + enemy.w - 10 : enemy.x - 370,
      y: enemy.y + 58,
      w: 380,
      h: 54,
      damage: 24,
      knock: 420,
      color: "#18e6ff",
      kind: "line",
      element: "void",
      stun: 0.28,
      life: 0.22,
    });
    game.shake = 6;
    tone(120, 0.08, "square", 0.032);
  }

  function bossSummon(enemy) {
    const spawnX = clamp(enemy.x + (enemy.facing > 0 ? -210 : 210), 3260, 3940);
    spawnEnemy(Math.random() < 0.5 ? "stalker" : "lancer", spawnX);
    addRipple(spawnX + 24, GROUND_Y - 48, "#18e6ff", 92);
    tone(150, 0.08, "triangle", 0.03);
  }

  function enemyDefeated(enemy) {
    game.score += enemy.type === "boss" ? 2500 : enemy.elite ? 210 : 110;
    spawnParticles(
      enemy.x + enemy.w / 2,
      enemy.y + enemy.h / 2,
      enemy.type === "boss" ? "#67f6ff" : "#1f8ee8",
      enemy.type === "boss" ? 90 : 24,
      enemy.type === "boss" ? 1.5 : 0.8
    );
    addText(enemy.type === "boss" ? "+2500" : "+110", enemy.x + enemy.w / 2, enemy.y + 10, "#67f6ff");
    if (enemy.type !== "boss" && Math.random() < 0.38) {
      game.pickups.push({
        x: enemy.x + enemy.w / 2,
        y: enemy.y + 34,
        vy: -220,
        type: Math.random() < 0.72 ? "core" : "health",
        life: 8,
      });
    }
  }

  function updateHits(dt) {
    for (const hit of game.hits) {
      hit.life -= dt;
      if (hit.owner === "player") {
        const attacker = hit.attacker || game.players[0];
        const form = armorForms[attacker.armor];
        for (const enemy of game.enemies) {
          if (hit.hit.has(enemy) || enemy.hp <= 0) continue;
          if (rectsOverlap(hit, enemy)) {
            hit.hit.add(enemy);
            const damage = hit.damage * (attacker.overdrive > 0 ? 1.18 : 1);
            enemy.hp -= damage;
            enemy.hurt = 0.2;
            enemy.stun = Math.max(enemy.stun, hit.stun);
            enemy.vx = (Math.sign(enemy.x - attacker.x) || attacker.facing) * hit.knock;
            game.combo += 1;
            game.comboTimer = 1;
            game.score += 8 + Math.floor(damage);
            attacker.core = Math.min(attacker.maxCore, attacker.core + 4.5);
            spawnParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h * 0.48, form.accent, hit.kind === "heavy" ? 24 : 14, 0.72);
            addText(Math.round(damage).toString(), enemy.x + enemy.w / 2, enemy.y + 16, form.accent);
            game.shake = Math.max(game.shake, hit.kind === "heavy" || hit.kind === "slam" ? 6 : 2.4);
            tone(330 + Math.random() * 110 + attacker.id * 30, 0.035, "square", 0.018);
          }
        }
      } else {
        for (const player of game.players) {
          if (!player.alive || hit.hit.has(player) || player.invuln > 0) continue;
          if (rectsOverlap(hit, player)) {
            hit.hit.add(player);
            hurtPlayer(player, hit.damage, hit, isGuarding(player));
          }
        }
      }
    }
    game.hits = game.hits.filter((hit) => hit.life > 0);
  }

  function updateProjectiles(dt) {
    for (const projectile of game.projectiles) {
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;

      if (projectile.owner === "player") {
        const attacker = projectile.attacker || game.players[0];
        const form = armorForms[attacker.armor];
        for (const enemy of game.enemies) {
          if (projectile.hit.has(enemy) || enemy.hp <= 0) continue;
          if (rectsOverlap(projectile, enemy)) {
            projectile.hit.add(enemy);
            enemy.hp -= projectile.damage;
            enemy.hurt = 0.18;
            enemy.stun = Math.max(enemy.stun, 0.16);
            enemy.vx = Math.sign(projectile.vx) * projectile.knock;
            game.combo += 1;
            game.comboTimer = 1;
            game.score += 10 + Math.floor(projectile.damage);
            attacker.core = Math.min(attacker.maxCore, attacker.core + 3.5);
            spawnParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, form.accent, 16, 0.8);
            addText(Math.round(projectile.damage).toString(), enemy.x + enemy.w / 2, enemy.y + 12, form.accent);
          }
        }
      } else {
        for (const player of game.players) {
          if (!player.alive || projectile.hit.has(player) || player.invuln > 0) continue;
          if (rectsOverlap(projectile, player)) {
            projectile.hit.add(player);
            hurtPlayer(player, projectile.damage, projectile, isGuarding(player));
            projectile.life = Math.min(projectile.life, 0.04);
          }
        }
      }
    }
    game.projectiles = game.projectiles.filter((projectile) => projectile.life > 0);
  }

  function hurtPlayer(player, amount, source, guarding) {
    const sourceCenter = source.x + source.w / 2;
    const facingSource = Math.sign(sourceCenter - (player.x + player.w / 2)) || player.facing;
    const correctGuard = guarding && facingSource === player.facing;
    const damage = correctGuard ? Math.ceil(amount * 0.28) : amount;
    player.hp -= damage;
    player.hurt = 0.35;
    player.invuln = correctGuard ? 0.2 : 0.68;
    player.vx = -facingSource * (correctGuard ? 130 : source.knock || 320);
    player.core = Math.max(0, player.core + (correctGuard ? 6 : 1.5));
    game.combo = 0;
    game.comboTimer = 0;
    game.shake = Math.max(game.shake, correctGuard ? 4 : 9);
    addText(correctGuard ? "ĐỠ" : `-${Math.round(damage)}`, player.x + player.w / 2, player.y + 10, correctGuard ? "#d8f3ff" : "#ff7e67");
    spawnParticles(player.x + player.w / 2, player.y + player.h * 0.52, correctGuard ? "#d8f3ff" : "#ff7e67", correctGuard ? 16 : 24, 0.78);
    if (correctGuard) {
      player.guardSpark = 0.25;
      tone(560, 0.04, "triangle", 0.03);
    } else {
      tone(90, 0.07, "sawtooth", 0.035);
    }
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      player.invuln = 999;
      addText(`${player.tag} gục`, player.x + player.w / 2, player.y, "#ff7e67");
      if (livingPlayers().length === 0) {
        game.mode = "gameover";
        showOverlay("Thất bại", `Điểm: ${game.score}. Lõi giáp cần được khởi động lại.`, {
          primaryLabel: "Chơi lại",
          showMode: true,
        });
      }
    }
  }

  function updatePickups(dt) {
    for (const item of game.pickups) {
      item.life -= dt;
      item.vy += 760 * dt;
      item.y += item.vy * dt;
      if (item.y > GROUND_Y - 22) {
        item.y = GROUND_Y - 22;
        item.vy *= -0.36;
      }
      const box = { x: item.x - 18, y: item.y - 18, w: 36, h: 36 };
      for (const player of game.players) {
        if (!player.alive) continue;
        if (rectsOverlap(box, player)) {
          item.life = 0;
          if (item.type === "health") {
            player.hp = Math.min(player.maxHp, player.hp + 16);
            addText("+16", player.x + player.w / 2, player.y + 20, "#7cf58a");
          } else {
            player.core = Math.min(player.maxCore, player.core + 18);
            addText("+18", player.x + player.w / 2, player.y + 20, "#67f6ff");
          }
          tone(item.type === "health" ? 520 : 460, 0.05, "triangle", 0.025);
          break;
        }
      }
    }
    game.pickups = game.pickups.filter((item) => item.life > 0);
  }

  function updateEffects(dt) {
    for (const particle of game.particles) {
      particle.life -= dt;
      particle.vy += (particle.gravity || 0) * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    game.particles = game.particles.filter((particle) => particle.life > 0);

    for (const spark of game.sparks) spark.life -= dt;
    game.sparks = game.sparks.filter((spark) => spark.life > 0);

    for (const text of game.texts) {
      text.life -= dt;
      text.y += text.vy * dt;
      text.vy += 18 * dt;
    }
    game.texts = game.texts.filter((text) => text.life > 0);

    for (const ripple of game.ripples) ripple.life -= dt;
    game.ripples = game.ripples.filter((ripple) => ripple.life > 0);
  }

  function updateCamera(dt) {
    const alive = livingPlayers();
    const focus = alive.length ? alive : game.players;
    const minX = Math.min(...focus.map((player) => player.x));
    const maxX = Math.max(...focus.map((player) => player.x));
    const target = focus.length > 1 ? clamp(minX * 0.32 + maxX * 0.68 - 500, 0, WORLD_W - W) : clamp(focus[0].x - 430, 0, WORLD_W - W);
    game.camera += (target - game.camera) * Math.min(1, dt * 4.8);
    if (game.playerCount > 1) {
      game.players.forEach((player) => {
        if (player.alive) player.x = clamp(player.x, game.camera + 18, game.camera + W - player.w - 18);
      });
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (game.shake > 0) {
      const amount = Math.min(10, game.shake);
      ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    }

    drawBackground();
    drawWorldMarks();
    drawRipples();
    game.pickups.forEach(drawPickup);
    game.projectiles.forEach(drawProjectile);
    drawPlayerTrails();
    game.enemies.forEach(drawEnemy);
    game.players.forEach(drawPlayer);
    drawHits();
    game.sparks.forEach(drawSpark);
    game.particles.forEach(drawParticle);
    game.texts.forEach(drawText);
    drawForeground();
    drawHud();
    ctx.restore();
  }

  function drawBackground() {
    const cam = game.camera;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#061634");
    sky.addColorStop(0.38, "#071e4b");
    sky.addColorStop(0.72, "#081422");
    sky.addColorStop(1, "#05080c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawSkyCore(cam);
    drawCityLayer(cam * 0.24);
    drawNeonBillboards(cam * 0.42);
    drawEnergyRail(cam);
    drawRoad(cam);
    drawVignette();
  }

  function drawSkyCore(cam) {
    const x = 980 - (cam * 0.04) % 260;
    const y = 98 + Math.sin(game.time * 0.5) * 7;
    const grad = ctx.createRadialGradient(x, y, 8, x, y, 190);
    grad.addColorStop(0, "rgba(72,220,255,0.82)");
    grad.addColorStop(0.22, "rgba(0,106,255,0.28)");
    grad.addColorStop(1, "rgba(0,106,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 360);
    ctx.strokeStyle = "rgba(103,246,255,0.24)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(x, y, 28 + i * 18 + Math.sin(game.time * 2 + i) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawCloudBands(cam) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#e6d6a2";
    for (let i = -2; i < 12; i++) {
      const x = i * 244 - (cam * 0.08) % 244;
      ctx.fillRect(x, 114 + (i % 3) * 28, 210, 10);
      ctx.fillRect(x + 48, 138 + (i % 2) * 22, 180, 7);
    }
    ctx.restore();
  }

  function drawMountainLayer(cam, baseY, near, far) {
    const grad = ctx.createLinearGradient(0, baseY - 170, 0, baseY + 80);
    grad.addColorStop(0, near);
    grad.addColorStop(1, far);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = -120; x <= W + 160; x += 130) {
      const world = x + cam;
      const peak = baseY - 95 - Math.sin(world * 0.006) * 36 - ((Math.floor(world / 130) % 3) * 18);
      ctx.lineTo(x + 62, peak);
      ctx.lineTo(x + 130, baseY);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawCityLayer(cam) {
    for (let i = -3; i < 26; i++) {
      const w = 58 + (i % 4) * 10;
      const x = i * 86 - (cam % 86);
      const h = 150 + ((i * 43) % 170);
      const body = ctx.createLinearGradient(x, GROUND_Y - h - 82, x, GROUND_Y - 54);
      body.addColorStop(0, i % 3 === 0 ? "#12336d" : "#101e42");
      body.addColorStop(0.6, "#0d1730");
      body.addColorStop(1, "#070b14");
      ctx.fillStyle = body;
      ctx.fillRect(x, GROUND_Y - 54 - h, w, h);
      ctx.fillStyle = "#03060d";
      ctx.fillRect(x + 9, GROUND_Y - 63 - h, w - 18, 9);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = i % 4 === 0 ? "rgba(238,56,214,0.56)" : i % 3 === 0 ? "rgba(255,205,50,0.5)" : "rgba(56,221,255,0.48)";
      for (let y = GROUND_Y - h - 33; y < GROUND_Y - 78; y += 26) {
        ctx.fillRect(x + 12, y, 8, 11);
        ctx.fillRect(x + 31, y + 6, 8, 11);
        if (w > 70) ctx.fillRect(x + 52, y + 2, 8, 11);
      }
      if (i % 5 === 0) {
        fillRoundRect(x + 8, GROUND_Y - h - 12, w - 16, 34, 3, "rgba(0,174,255,0.68)");
        ctx.fillStyle = "#eaffff";
        ctx.font = "900 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(i % 10 === 0 ? "NOVA" : "03", x + w / 2, GROUND_Y - h + 10);
      }
      ctx.restore();
    }
  }

  function drawNeonBillboards(cam) {
    for (let i = -2; i < 14; i++) {
      const x = i * 340 - (cam % 340);
      const y = 190 + (i % 3) * 48;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const color = i % 2 ? "#e832d6" : "#22d8ff";
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      fillRoundRect(x, y, 118, 46, 5, "rgba(5,16,36,0.78)");
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, 118, 46);
      ctx.fillStyle = color;
      ctx.font = "900 17px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(i % 2 ? "NOVA.CO" : "B-7", x + 59, y + 29);
      ctx.restore();
    }
  }

  function drawEnergyRail(cam) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = -2; i < 18; i++) {
      const x = i * 260 - (cam * 0.72) % 260;
      const pulse = 0.32 + Math.sin(game.time * 3 + i) * 0.1;
      ctx.fillStyle = `rgba(34,216,255,${pulse})`;
      ctx.fillRect(x, 126 + (i % 3) * 22, 190, 5);
      ctx.fillStyle = `rgba(232,50,214,${pulse * 0.78})`;
      ctx.fillRect(x + 70, 156 + (i % 2) * 18, 160, 4);
    }
    ctx.restore();
  }

  function drawRoad(cam) {
    const floor = ctx.createLinearGradient(0, GROUND_Y - 28, 0, H);
    floor.addColorStop(0, "#2e3f54");
    floor.addColorStop(0.24, "#172232");
    floor.addColorStop(1, "#050607");
    ctx.fillStyle = floor;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    for (let i = -4; i < 22; i++) {
      const x = i * 172 - (cam % 172);
      const panel = ctx.createLinearGradient(x, GROUND_Y - 22, x, GROUND_Y + 68);
      panel.addColorStop(0, "#3c5066");
      panel.addColorStop(1, "#111923");
      ctx.fillStyle = panel;
      ctx.fillRect(x, GROUND_Y - 18, 164, 54);
      ctx.strokeStyle = "#07101b";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, GROUND_Y - 18, 164, 54);
      ctx.fillStyle = "rgba(255,195,47,0.72)";
      ctx.fillRect(x + 20, GROUND_Y + 12, 68, 5);
      ctx.fillStyle = "rgba(103,246,255,0.24)";
      ctx.fillRect(x + 106, GROUND_Y - 6, 38, 4);
      ctx.fillStyle = "#070b11";
      ctx.fillRect(x + 6, GROUND_Y - 14, 10, 48);
      ctx.fillRect(x + 146, GROUND_Y - 14, 10, 48);
    }

    ctx.strokeStyle = "rgba(169,210,255,0.3)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y - 34);
    ctx.lineTo(W, GROUND_Y - 34);
    ctx.moveTo(0, GROUND_Y - 58);
    ctx.lineTo(W, GROUND_Y - 58);
    ctx.stroke();

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = -3; i < 24; i++) {
      const x = i * 190 - (cam % 190);
      ctx.fillStyle = "rgba(34,216,255,0.28)";
      ctx.fillRect(x, GROUND_Y + 45, 122, 4);
      ctx.fillStyle = "rgba(255,195,47,0.3)";
      ctx.fillRect(x + 52, GROUND_Y + 72, 176, 4);
    }
    ctx.restore();
  }

  function drawVignette() {
    const grad = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 780);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.72, "rgba(0,0,0,0.08)");
    grad.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawWorldMarks() {
    const cam = game.camera;
    for (const wave of game.waves) {
      const x = wave.at - cam;
      if (x < -80 || x > W + 80) continue;
      ctx.save();
      ctx.globalAlpha = wave.cleared ? 0.32 : 0.9;
      ctx.fillStyle = wave.boss ? "#18e6ff" : "#0b65d8";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 16;
      ctx.fillRect(x, GROUND_Y - 146, 8, 146);
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y - 146);
      ctx.lineTo(x + 84, GROUND_Y - 126);
      ctx.lineTo(x, GROUND_Y - 104);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (game.activeBarrier) {
      const bx = game.activeBarrier - cam;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.78 + Math.sin(game.time * 9) * 0.12;
      ctx.strokeStyle = "#18e6ff";
      ctx.shadowColor = "#18e6ff";
      ctx.shadowBlur = 18;
      ctx.lineWidth = 3;
      for (let y = 90; y < GROUND_Y; y += 32) {
        ctx.beginPath();
        ctx.moveTo(bx + Math.sin(y * 0.05 + game.time * 6) * 10, y);
        ctx.lineTo(bx + Math.sin(y * 0.05 + game.time * 6 + 1) * 10, y + 22);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPlayerTrails() {
    for (const player of game.players) {
      for (const trail of player.trail) {
        const form = armorForms[trail.armor];
        const alpha = clamp(trail.life / trail.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha * 0.28;
        ctx.globalCompositeOperation = "lighter";
        ctx.translate(trail.x - game.camera, trail.y);
        ctx.scale(trail.facing, 1);
        ctx.fillStyle = form.glow;
        ctx.beginPath();
        ctx.moveTo(-42, -58);
        ctx.lineTo(44, -36);
        ctx.lineTo(30, 58);
        ctx.lineTo(-28, 62);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawPlayer(player) {
    const form = armorForms[player.armor];
    const style = playerStyles[player.id];
    const x = player.x - game.camera;
    const y = player.y;
    const bob = player.grounded ? Math.sin(player.stepTime * 9) * Math.min(5, Math.abs(player.vx) / 40) : 0;
    const flash = player.invuln > 0 && player.alive && Math.floor(game.time * 18) % 2 === 0;
    const dead = !player.alive;

    ctx.save();
    ctx.translate(x + player.w / 2, y + player.h + 1);
    ctx.scale(dead ? 1 : player.facing, 1);
    ctx.translate(0, dead ? 14 : bob);
    if (dead) ctx.rotate(-0.7);

    drawSoftEllipse(0, 8, 48, 12, "rgba(0,0,0,0.46)");
    if (player.overdrive > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.42 + Math.sin(game.time * 10) * 0.08;
      ctx.strokeStyle = form.glow;
      ctx.shadowColor = form.glow;
      ctx.shadowBlur = 22;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(0, -58, 62, 86, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = flash ? 0.55 : dead ? 0.72 : 1;
    drawHeroUndersuit();
    drawArmoredLimb(-19, -31, -35, -5, 15, form.dark, form.plate, form.accent);
    drawArmoredLimb(18, -31, 32, -5, 15, form.dark, form.plate, form.accent);
    drawBootPlate(-32, -16, form, style);
    drawBootPlate(32, -16, form, style);
    drawKneePlate(-22, -38, form, style);
    drawKneePlate(22, -38, form, style);
    drawArmoredLimb(-24, -78, -50 + (player.attackPose > 0 ? 12 : 0), -43, 15, form.dark, form.plate, form.accent);
    drawArmoredLimb(24, -78, 66 + (player.attackPose > 0 ? 28 : 0), -48, 15, form.dark, form.plate, form.accent);

    armorPoly([
      [-42, -88],
      [-30, -112],
      [-10, -121],
      [10, -121],
      [31, -112],
      [43, -88],
      [31, -42],
      [10, -34],
      [-10, -34],
      [-31, -42],
    ], form.plate, "#060708", form.glow);
    armorPoly([
      [-21, -101],
      [0, -117],
      [21, -101],
      [15, -70],
      [0, -60],
      [-15, -70],
    ], form.primary, "#050607", form.accent);
    armorPoly([
      [-56, -91],
      [-34, -116],
      [-10, -100],
      [-28, -76],
      [-51, -72],
    ], form.primary, "#050607", form.accent);
    armorPoly([
      [56, -91],
      [34, -116],
      [10, -100],
      [28, -76],
      [51, -72],
    ], form.primary, "#050607", form.accent);
    drawChestLines(form, style);
    drawHeroBelt(form, style);
    armorPoly([
      [-23, -30],
      [-4, -35],
      [-8, -2],
      [-30, -2],
    ], form.plate, "#080809", form.glow);
    armorPoly([
      [23, -30],
      [4, -35],
      [8, -2],
      [30, -2],
    ], form.plate, "#080809", form.glow);

    drawHelmet(form, style);
    drawCore(form, style);

    if (isGuarding(player)) drawGuardShield(form);
    if (player.attackPose > 0) drawSlashArc(form, player.attackPose);

    ctx.restore();

    drawPlayerLabel(player, x, y);
  }

  function drawHeroUndersuit() {
    const suit = ctx.createLinearGradient(-34, -130, 34, -2);
    suit.addColorStop(0, "#17202a");
    suit.addColorStop(0.58, "#081019");
    suit.addColorStop(1, "#010203");
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.moveTo(-25, -113);
    ctx.lineTo(25, -113);
    ctx.lineTo(31, -41);
    ctx.lineTo(14, -4);
    ctx.lineTo(-14, -4);
    ctx.lineTo(-31, -41);
    ctx.closePath();
    ctx.fill();
  }

  function drawChestLines(form, style) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.shadowColor = form.accent;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-28, -88);
    ctx.lineTo(-12, -71);
    ctx.lineTo(0, -60);
    ctx.lineTo(12, -71);
    ctx.lineTo(28, -88);
    ctx.stroke();
    ctx.strokeStyle = style.trim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-35, -54);
    ctx.lineTo(35, -54);
    ctx.stroke();
    ctx.restore();
  }

  function drawHeroBelt(form, style) {
    ctx.save();
    ctx.fillStyle = "#08090a";
    ctx.strokeStyle = "#020203";
    ctx.lineWidth = 3;
    fillRoundRect(-31, -49, 62, 12, 5, "#08090a");
    ctx.strokeRect(-31, -49, 62, 12);
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = form.accent;
    ctx.shadowBlur = 12;
    armorPoly([
      [-10, -50],
      [0, -58],
      [10, -50],
      [10, -39],
      [0, -33],
      [-10, -39],
    ], style.visor, "#040404", form.accent);
    ctx.restore();
  }

  function drawKneePlate(x, y, form, style) {
    armorPoly([
      [x - 13, y - 7],
      [x + 13, y - 7],
      [x + 18, y + 4],
      [x, y + 14],
      [x - 18, y + 4],
    ], form.primary, "#050607", form.accent);
  }

  function drawBootPlate(x, y, form, style) {
    armorPoly([
      [x - 13, y - 18],
      [x + 13, y - 18],
      [x + 18, y + 5],
      [x + 25, y + 12],
      [x - 10, y + 12],
      [x - 20, y + 4],
    ], form.primary, "#050607", form.glow);
    ctx.save();
    ctx.fillStyle = style.visor;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillRect(x - 9, y - 8, 18, 4);
    ctx.restore();
  }

  function drawHelmet(form, style) {
    armorPoly([
      [-32, -131],
      [-20, -151],
      [-5, -160],
      [0, -169],
      [5, -160],
      [20, -151],
      [32, -131],
      [25, -104],
      [10, -96],
      [-10, -96],
      [-25, -104],
    ], form.plate, "#040506", form.glow);
    armorPoly([
      [-42, -131],
      [-23, -146],
      [-27, -125],
      [-45, -113],
    ], form.primary, "#030405", form.accent);
    armorPoly([
      [42, -131],
      [23, -146],
      [27, -125],
      [45, -113],
    ], form.primary, "#030405", form.accent);
    armorPoly([
      [-22, -128],
      [0, -136],
      [22, -128],
      [14, -114],
      [0, -109],
      [-14, -114],
    ], style.visor, "#030405", style.visor);
    ctx.fillStyle = form.primary;
    ctx.shadowColor = form.accent;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(-5, -154);
    ctx.lineTo(0, -174);
    ctx.lineTo(7, -154);
    ctx.lineTo(5, -124);
    ctx.lineTo(-5, -124);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawCore(form, style) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = form.accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = form.accent;
    ctx.beginPath();
    ctx.moveTo(0, -91);
    ctx.lineTo(16, -80);
    ctx.lineTo(10, -65);
    ctx.lineTo(0, -59);
    ctx.lineTo(-10, -65);
    ctx.lineTo(-16, -80);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = style.shadow;
    ctx.fillRect(-18, -58, 36, 6);
  }

  function drawGuardShield(form) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.62 + Math.sin(game.time * 18) * 0.15;
    ctx.strokeStyle = form.accent;
    ctx.shadowColor = form.accent;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(52, -76, 39, -1.25, 1.25);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(52, -76, 24, -1.1, 1.1);
    ctx.stroke();
    ctx.restore();
  }

  function drawSlashArc(form, pose) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = clamp(pose / 0.26, 0, 1);
    ctx.strokeStyle = form.accent;
    ctx.shadowColor = form.accent;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(54, -76, 64, -0.9, 0.52);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(54, -76, 48, -0.82, 0.32);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayerLabel(player, x, y) {
    if (!player.alive) return;
    ctx.save();
    ctx.font = "900 14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = playerStyles[player.id].visor;
    ctx.strokeStyle = "rgba(0,0,0,0.68)";
    ctx.lineWidth = 4;
    ctx.strokeText(player.tag, x + player.w / 2, y - 14);
    ctx.fillText(player.tag, x + player.w / 2, y - 14);
    ctx.restore();
  }

  function drawArmoredLimb(x1, y1, x2, y2, width, dark, color, accent = color) {
    ctx.strokeStyle = dark;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(4, width * 0.42);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function armorPoly(points, fill, stroke, glow) {
    ctx.save();
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 8;
    }
    const grad = ctx.createLinearGradient(-40, -160, 42, -10);
    grad.addColorStop(0, lighten(fill, 0.34));
    grad.addColorStop(0.52, fill);
    grad.addColorStop(1, darken(fill, 0.34));
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(enemy) {
    const x = enemy.x - game.camera;
    const y = enemy.y;
    ctx.save();
    ctx.translate(x + enemy.w / 2, y + enemy.h);
    ctx.scale(enemy.facing, 1);
    const hurtFlash = enemy.hurt > 0 && Math.floor(game.time * 28) % 2 === 0;
    ctx.globalAlpha = hurtFlash ? 0.62 : 1;

    drawSoftEllipse(0, 8, enemy.w * 0.64, 12, "rgba(0,0,0,0.38)");
    if (enemy.type === "boss") drawBossBody(enemy);
    else if (enemy.type === "flyer") drawFlyer(enemy);
    else drawGroundEnemy(enemy);

    ctx.restore();
    drawEnemyHp(enemy);
  }

  function drawGroundEnemy(enemy) {
    const main = enemy.type === "brute" ? "#c7d2e1" : enemy.type === "lancer" ? "#dceeff" : "#b8c9dc";
    const edge = enemy.type === "brute" ? "#0b65d8" : enemy.type === "lancer" ? "#18e6ff" : "#1f8ee8";
    const dark = enemy.type === "brute" ? "#232b38" : "#172231";
    const scale = enemy.type === "brute" ? 1.12 : 1;

    drawMonsterLeg(-18 * scale, -26, -31 * scale, -2, main, edge);
    drawMonsterLeg(18 * scale, -26, 32 * scale, -2, main, edge);
    drawMonsterArm(-24 * scale, -70, -48 * scale, -38, main, edge, -1);
    drawMonsterArm(24 * scale, -70, 50 * scale, -39, main, edge, 1);
    if (enemy.type !== "lancer") {
      drawClawHand(-52 * scale, -38, edge, -1);
      drawClawHand(54 * scale, -39, edge, 1);
    }

    for (let i = 0; i < (enemy.type === "brute" ? 5 : 4); i++) {
      const px = -24 + i * 16;
      drawMonsterSpike(px, -enemy.h + 26 + (i % 2) * 4, 11 + (enemy.type === "brute" ? 5 : 0), edge);
    }

    armorPoly([
      [-enemy.w * 0.5, -enemy.h + 30],
      [-enemy.w * 0.25, -enemy.h + 8],
      [0, -enemy.h + 2],
      [enemy.w * 0.28, -enemy.h + 8],
      [enemy.w * 0.52, -enemy.h + 31],
      [enemy.w * 0.4, -32],
      [enemy.w * 0.12, -23],
      [0, -28],
      [-enemy.w * 0.14, -23],
      [-enemy.w * 0.4, -32],
    ], dark, "#050506", edge);
    armorPoly([
      [-enemy.w * 0.28, -enemy.h + 50],
      [0, -enemy.h + 35],
      [enemy.w * 0.28, -enemy.h + 50],
      [enemy.w * 0.17, -59],
      [0, -51],
      [-enemy.w * 0.17, -59],
    ], main, "#050506", edge);

    armorPoly([
      [-enemy.w * 0.22, -enemy.h + 66],
      [0, -enemy.h + 53],
      [enemy.w * 0.22, -enemy.h + 66],
      [enemy.w * 0.12, -70],
      [0, -62],
      [-enemy.w * 0.12, -70],
    ], edge, "#050506", "#18e6ff");

    drawMonsterHead(enemy, main, edge);
    if (enemy.type === "lancer") {
      ctx.strokeStyle = "#eaf8ff";
      ctx.shadowColor = "#18e6ff";
      ctx.shadowBlur = 14;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(32, -62);
      ctx.lineTo(106, -82);
      ctx.stroke();
      ctx.fillStyle = "#18e6ff";
      ctx.beginPath();
      ctx.moveTo(108, -85);
      ctx.lineTo(136, -80);
      ctx.lineTo(110, -68);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawMonsterHead(enemy, main, edge) {
    const top = -enemy.h + 6;
    armorPoly([
      [-23, top + 5],
      [-8, top - 10],
      [10, top - 10],
      [25, top + 6],
      [19, top + 32],
      [0, top + 40],
      [-20, top + 32],
    ], main, "#030304", edge);
    armorPoly([
      [-18, top + 12],
      [0, top],
      [18, top + 12],
      [12, top + 22],
      [0, top + 27],
      [-12, top + 22],
    ], "#f4f8ff", "#030304", edge);
    armorPoly([
      [-24, top + 3],
      [-42, top - 8],
      [-29, top + 15],
    ], edge, "#030304", edge);
    armorPoly([
      [24, top + 3],
      [42, top - 8],
      [29, top + 15],
    ], edge, "#030304", edge);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = edge;
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#9af8ff";
    ctx.beginPath();
    ctx.moveTo(-16, top + 17);
    ctx.lineTo(0, top + 10);
    ctx.lineTo(16, top + 17);
    ctx.lineTo(10, top + 25);
    ctx.lineTo(-10, top + 25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#090708";
    ctx.fillRect(-14, top + 33, 28, 5);
  }

  function drawMonsterArm(x1, y1, x2, y2, main, edge, side) {
    drawArmoredLimb(x1, y1, x2, y2, 14, "#111824", main, edge);
    armorPoly([
      [x2 - side * 14, y2 - 8],
      [x2 + side * 10, y2 - 14],
      [x2 + side * 19, y2 + 5],
      [x2 + side * 4, y2 + 12],
    ], edge, "#030304", edge);
  }

  function drawMonsterLeg(x1, y1, x2, y2, main, edge) {
    drawArmoredLimb(x1, y1, x2, y2, 13, "#111824", main, edge);
    armorPoly([
      [x2 - 14, y2 - 8],
      [x2 + 12, y2 - 8],
      [x2 + 22, y2 + 8],
      [x2 - 18, y2 + 9],
    ], "#f0f6ff", "#030304", edge);
  }

  function drawClawHand(x, y, edge, side) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = edge;
    ctx.shadowColor = edge;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + i * 5);
      ctx.lineTo(x + side * (18 + i * 3), y + 2 + i * 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMonsterSpike(x, y, size, edge) {
    armorPoly([
      [x - size * 0.5, y + size],
      [x, y - size],
      [x + size * 0.5, y + size],
    ], edge, "#030304", edge);
  }

  function drawFlyer(enemy) {
    const flap = Math.sin(game.time * 11 + enemy.bob) * 12;
    const grad = ctx.createLinearGradient(-70, -70, 70, -2);
    grad.addColorStop(0, "#e7f4ff");
    grad.addColorStop(0.48, "#0b65d8");
    grad.addColorStop(1, "#122033");
    ctx.fillStyle = grad;
    ctx.shadowColor = "#18e6ff";
    ctx.shadowBlur = 14;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(24,230,255,0.34)";
    ctx.beginPath();
    ctx.ellipse(-48, -42 + flap * 0.2, 56, 14, -0.32, 0, Math.PI * 2);
    ctx.ellipse(48, -42 - flap * 0.2, 56, 14, 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-enemy.w * 0.48, -30);
    ctx.lineTo(-78, -50 + flap);
    ctx.lineTo(-22, -20);
    ctx.lineTo(0, -enemy.h);
    ctx.lineTo(22, -20);
    ctx.lineTo(78, -50 - flap);
    ctx.lineTo(enemy.w * 0.48, -30);
    ctx.lineTo(0, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#08111f";
    ctx.lineWidth = 3;
    ctx.stroke();
    armorPoly([
      [-80, -48 + flap],
      [-30, -38],
      [-8, -23],
      [-55, -26],
    ], "#0b65d8", "#030405", "#18e6ff");
    armorPoly([
      [80, -48 - flap],
      [30, -38],
      [8, -23],
      [55, -26],
    ], "#0b65d8", "#030405", "#18e6ff");
    armorPoly([
      [-18, -47],
      [0, -62],
      [18, -47],
      [14, -18],
      [0, -7],
      [-14, -18],
    ], "#f2f8ff", "#040405", "#18e6ff");
    armorPoly([
      [-28, -34],
      [0, -48],
      [28, -34],
      [19, -24],
      [0, -18],
      [-19, -24],
    ], "#0b65d8", "#040405", "#67f6ff");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#9af8ff";
    ctx.shadowColor = "#18e6ff";
    ctx.shadowBlur = 16;
    ctx.fillRect(-16, -43, 32, 8);
    ctx.restore();
    drawClawHand(-19, -12, "#18e6ff", -1);
    drawClawHand(19, -12, "#18e6ff", 1);
  }

  function drawBossBody(enemy) {
    const pulse = Math.sin(game.time * 4) * 0.5 + 0.5;
    const bossDark = "#202838";
    const bossPlate = "#d7e3f0";
    const bossBlue = "#0b65d8";
    const bossCyan = "#18e6ff";
    const bossShade = "#667287";
    for (let i = 0; i < 7; i++) {
      drawMonsterSpike(-58 + i * 19, -156 + (i % 2) * 7, 16 + (i % 3) * 3, i % 2 ? bossCyan : bossBlue);
    }
    armorPoly([
      [-92, -128],
      [-58, -164],
      [-34, -128],
      [-56, -105],
      [-86, -104],
    ], bossBlue, "#050607", bossCyan);
    armorPoly([
      [92, -128],
      [58, -164],
      [34, -128],
      [56, -105],
      [86, -104],
    ], bossBlue, "#050607", bossCyan);
    armorPoly([
      [-72, -128],
      [-36, -174],
      [0, -184],
      [40, -174],
      [76, -126],
      [58, -42],
      [28, -28],
      [0, -36],
      [-30, -28],
      [-58, -42],
    ], bossDark, "#050607", bossCyan);
    armorPoly([
      [-66, -126],
      [-28, -152],
      [0, -160],
      [30, -152],
      [68, -126],
      [49, -58],
      [18, -45],
      [0, -51],
      [-20, -45],
      [-48, -58],
    ], bossPlate, "#050607", bossCyan);
    armorPoly([
      [-38, -140],
      [0, -160],
      [40, -140],
      [23, -84],
      [-22, -84],
    ], bossBlue, "#050607", bossCyan);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(103, 246, 255, ${0.58 + pulse * 0.34})`;
    ctx.shadowColor = bossCyan;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(-28, -128);
    ctx.lineTo(0, -148);
    ctx.lineTo(30, -128);
    ctx.lineTo(18, -101);
    ctx.lineTo(0, -92);
    ctx.lineTo(-18, -101);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawBossHead(pulse);
    drawArmoredLimb(-50, -56, -74, -4, 20, "#121925", bossShade, bossCyan);
    drawArmoredLimb(50, -56, 76, -4, 20, "#121925", bossShade, bossCyan);
    drawArmoredLimb(-63, -119, -112, -72, 23, "#121925", bossPlate, bossCyan);
    drawArmoredLimb(63, -119, 118, -72, 23, "#121925", bossPlate, bossCyan);
    armorPoly([
      [-130, -89],
      [-108, -111],
      [-82, -94],
      [-96, -63],
      [-125, -58],
    ], bossBlue, "#050607", bossCyan);
    armorPoly([
      [130, -89],
      [108, -111],
      [82, -94],
      [96, -63],
      [125, -58],
    ], bossBlue, "#050607", bossCyan);
    ctx.strokeStyle = bossCyan;
    ctx.shadowColor = bossCyan;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-112, -72);
    ctx.lineTo(-146, -98);
    ctx.moveTo(118, -72);
    ctx.lineTo(154, -94);
    ctx.stroke();
    drawClawHand(-146, -98, bossCyan, -1);
    drawClawHand(154, -94, bossCyan, 1);
  }

  function drawBossHead(pulse) {
    armorPoly([
      [-36, -174],
      [-18, -198],
      [0, -205],
      [20, -198],
      [38, -174],
      [27, -148],
      [0, -138],
      [-28, -148],
    ], "#d7e3f0", "#050607", "#18e6ff");
    armorPoly([
      [-27, -175],
      [0, -191],
      [29, -175],
      [18, -162],
      [0, -156],
      [-18, -162],
    ], "#0b65d8", "#050607", "#18e6ff");
    armorPoly([
      [-34, -178],
      [-64, -194],
      [-43, -162],
    ], "#0b65d8", "#050607", "#18e6ff");
    armorPoly([
      [34, -178],
      [64, -194],
      [43, -162],
    ], "#0b65d8", "#050607", "#18e6ff");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(154, 248, 255, ${0.65 + pulse * 0.28})`;
    ctx.shadowColor = "#18e6ff";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(-20, -169);
    ctx.lineTo(0, -178);
    ctx.lineTo(20, -169);
    ctx.lineTo(14, -158);
    ctx.lineTo(-14, -158);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemyHp(enemy) {
    const x = enemy.x - game.camera + enemy.w / 2;
    const y = enemy.y - 18;
    const width = enemy.type === "boss" ? 300 : 58;
    const height = enemy.type === "boss" ? 11 : 6;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.fillRect(x - width / 2, y, width, height);
    ctx.fillStyle = enemy.type === "boss" ? "#18e6ff" : "#1f8ee8";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fillRect(x - width / 2, y, width * clamp(enemy.hp / enemy.maxHp, 0, 1), height);
    ctx.restore();
  }

  function drawProjectile(projectile) {
    const x = projectile.x - game.camera;
    const alpha = clamp(projectile.life / projectile.maxLife, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = projectile.color;
    ctx.strokeStyle = projectile.owner === "player" ? "#fff5c8" : "#3b1523";
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    if (projectile.kind === "flame") {
      ctx.beginPath();
      ctx.moveTo(x, projectile.y + projectile.h / 2);
      ctx.quadraticCurveTo(x + projectile.w * 0.42, projectile.y - 20, x + projectile.w, projectile.y + projectile.h / 2);
      ctx.quadraticCurveTo(x + projectile.w * 0.42, projectile.y + projectile.h + 20, x, projectile.y + projectile.h / 2);
      ctx.fill();
      ctx.stroke();
    } else {
      fillRoundRect(x, projectile.y, projectile.w, projectile.h, 8, projectile.color);
    }
    ctx.restore();
  }

  function drawHits() {
    for (const hit of game.hits) {
      const x = hit.x - game.camera;
      const alpha = clamp(hit.life / hit.maxLife, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = hit.color;
      ctx.shadowColor = hit.color;
      ctx.shadowBlur = 24;
      if (hit.kind === "line") {
        fillRoundRect(x, hit.y, hit.w, hit.h, 10, hit.color);
      } else if (hit.kind === "ring" || hit.kind === "slam") {
        ctx.beginPath();
        ctx.ellipse(x + hit.w / 2, hit.y + hit.h / 2, hit.w / 2, hit.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(x + hit.w / 2, hit.y + hit.h / 2, hit.w / 2, hit.h / 2, -0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPickup(item) {
    const x = item.x - game.camera;
    const color = item.type === "health" ? "#7cf58a" : "#18e6ff";
    ctx.save();
    ctx.translate(x, item.y);
    ctx.rotate(game.time * 2.4);
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(17, 0);
    ctx.lineTo(0, 17);
    ctx.lineTo(-17, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawParticle(particle) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(particle.x - game.camera - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    ctx.restore();
  }

  function drawSpark(spark) {
    const alpha = clamp(spark.life / spark.maxLife, 0, 1);
    const x = spark.x - game.camera;
    const y = spark.y;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = spark.color;
    ctx.shadowColor = spark.color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(spark.angle) * spark.length * 0.4, y - Math.sin(spark.angle) * spark.length * 0.4);
    ctx.lineTo(x + Math.cos(spark.angle) * spark.length * 0.6, y + Math.sin(spark.angle) * spark.length * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  function drawText(text) {
    ctx.save();
    ctx.globalAlpha = clamp(text.life / 0.9, 0, 1);
    ctx.fillStyle = text.color;
    ctx.font = "900 22px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 5;
    ctx.strokeText(text.text, text.x - game.camera, text.y);
    ctx.fillText(text.text, text.x - game.camera, text.y);
    ctx.restore();
  }

  function drawRipples() {
    for (const ripple of game.ripples) {
      const t = 1 - ripple.life / ripple.maxLife;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (1 - t) * 0.75;
      ctx.strokeStyle = ripple.color;
      ctx.shadowColor = ripple.color;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(ripple.x - game.camera, ripple.y, ripple.radius * t, ripple.radius * 0.42 * t, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawForeground() {
    const cam = game.camera;
    ctx.fillStyle = "rgba(4, 5, 6, 0.34)";
    for (let i = -2; i < 18; i++) {
      const x = i * 260 - (cam * 1.15) % 260;
      ctx.fillRect(x, GROUND_Y - 28, 62, 28);
      ctx.fillRect(x + 24, GROUND_Y - 86, 12, 58);
    }
  }

  function drawHud() {
    ctx.save();
    game.players.forEach((player, index) => drawPlayerHud(player, 28, 24 + index * 76));

    ctx.textAlign = "right";
    fillRoundRect(W - 222, 22, 194, 38, 6, "rgba(2,16,34,0.78)");
    strokeRoundRect(W - 222, 22, 194, 38, 6, "rgba(24,230,255,0.78)", 2);
    ctx.font = "900 21px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#eaf8ff";
    ctx.shadowColor = "#18e6ff";
    ctx.shadowBlur = 8;
    ctx.fillText(`ĐIỂM ${game.score}`, W - 42, 47);
    ctx.shadowBlur = 0;
    if (game.combo > 1) {
      ctx.fillStyle = "#18e6ff";
      ctx.font = "900 36px Inter, system-ui, sans-serif";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 6;
      ctx.strokeText(`${game.combo} HIT`, W - 28, 84);
      ctx.fillText(`${game.combo} HIT`, W - 28, 84);
    }

    if (game.messageTimer > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(game.messageTimer, 0, 1);
      ctx.textAlign = "center";
      ctx.fillStyle = "#f7f1de";
      ctx.font = "900 42px Inter, system-ui, sans-serif";
      ctx.strokeStyle = "rgba(0,0,0,0.74)";
      ctx.lineWidth = 8;
      ctx.strokeText(game.message, W / 2, 164);
      ctx.fillText(game.message, W / 2, 164);
      ctx.restore();
    }

    const progress = clamp(frontPlayerX() / (WORLD_W - 220), 0, 1);
    fillRoundRect(452, H - 39, 376, 16, 6, "rgba(2,12,24,0.78)");
    strokeRoundRect(452, H - 39, 376, 16, 6, "rgba(24,230,255,0.42)", 2);
    const grad = ctx.createLinearGradient(454, H - 34, 826, H - 34);
    grad.addColorStop(0, "#0b65d8");
    grad.addColorStop(0.55, "#18e6ff");
    grad.addColorStop(1, "#f2f8ff");
    ctx.fillStyle = grad;
    fillRoundRect(456, H - 35, 368 * progress, 8, 4, grad);
    ctx.fillStyle = "#18e6ff";
    ctx.shadowColor = "#18e6ff";
    ctx.shadowBlur = 10;
    ctx.fillRect(456 + 368 * progress - 3, H - 42, 6, 22);
    ctx.restore();
  }

  function drawPlayerHud(player, x, y) {
    const form = armorForms[player.armor];
    const style = playerStyles[player.id];
    const panel = ctx.createLinearGradient(x, y, x + 360, y + 64);
    panel.addColorStop(0, "rgba(2,28,58,0.88)");
    panel.addColorStop(0.56, "rgba(2,13,30,0.84)");
    panel.addColorStop(1, "rgba(3,8,16,0.9)");
    fillRoundRect(x + 36, y, 344, 64, 8, panel);
    strokeRoundRect(x + 36, y, 344, 64, 8, player.alive ? "rgba(24,230,255,0.76)" : "rgba(255,126,103,0.58)", 2);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#18e6ff";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 62 + i * 48, y + 7);
      ctx.lineTo(x + 80 + i * 48, y + 31);
      ctx.lineTo(x + 62 + i * 48, y + 57);
      ctx.stroke();
    }
    ctx.restore();
    drawHudPortrait(player, x, y + 4, form, style);

    ctx.fillStyle = style.visor;
    ctx.font = "900 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(player.tag, x + 96, y + 18);
    ctx.fillStyle = player.alive ? "#f7f1de" : "#ff7e67";
    ctx.font = "900 15px Inter, system-ui, sans-serif";
    ctx.fillText(player.alive ? form.name : "Đã gục", x + 126, y + 18);

    drawBar(x + 96, y + 27, 168, 12, player.hp / player.maxHp, player.alive ? "#45f06b" : "#5a2323", "");
    drawBar(x + 96, y + 44, 168, 10, player.core / player.maxCore, "#18e6ff", "");
    if (player.overdrive > 0) drawBar(x + 274, y + 45, 80, 9, player.overdrive / 8.5, form.accent, "");

    for (let i = 0; i < armorForms.length; i++) {
      const item = armorForms[i];
      const bx = x + 276 + i * 24;
      fillRoundRect(bx, y + 24, 19, 16, 4, i === player.armor ? item.primary : "rgba(233,244,255,0.14)");
      strokeRoundRect(bx, y + 24, 19, 16, 4, i === player.armor ? item.accent : "rgba(233,244,255,0.24)", 2);
      if (i === player.armor) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = item.accent;
        ctx.fillRect(bx + 5, y + 29, 9, 2);
        ctx.restore();
      }
    }
  }

  function drawBar(x, y, w, h, value, color) {
    fillRoundRect(x, y, w, h, 4, "rgba(0,0,0,0.62)");
    strokeRoundRect(x, y, w, h, 4, "rgba(255,255,255,0.18)", 1);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    fillRoundRect(x, y, w * clamp(value, 0, 1), h, 4, color);
    ctx.globalAlpha = 0.34;
    fillRoundRect(x + 2, y + 2, Math.max(0, w * clamp(value, 0, 1) - 4), Math.max(2, h * 0.28), 3, "#ffffff");
    ctx.restore();
  }

  function drawHudPortrait(player, x, y, form, style) {
    ctx.save();
    fillRoundRect(x, y, 62, 56, 8, "rgba(1,10,24,0.92)");
    strokeRoundRect(x, y, 62, 56, 8, "rgba(24,230,255,0.9)", 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 3, y + 3, 56, 50);
    ctx.clip();
    ctx.translate(x + 31, y + 51);
    ctx.scale(0.3, 0.3);
    drawHeroUndersuit();
    drawArmoredLimb(-24, -78, -47, -43, 15, form.dark, form.plate, form.accent);
    drawArmoredLimb(24, -78, 47, -43, 15, form.dark, form.plate, form.accent);
    armorPoly([
      [-42, -88],
      [-30, -112],
      [-10, -121],
      [10, -121],
      [31, -112],
      [43, -88],
      [31, -42],
      [10, -34],
      [-10, -34],
      [-31, -42],
    ], form.plate, "#060708", form.glow);
    armorPoly([
      [-21, -101],
      [0, -117],
      [21, -101],
      [15, -70],
      [0, -60],
      [-15, -70],
    ], form.primary, "#050607", form.accent);
    drawHelmet(form, style);
    drawCore(form, style);
    ctx.restore();
    if (!player.alive) {
      ctx.fillStyle = "rgba(0,0,0,0.58)";
      fillRoundRect(x + 4, y + 4, 54, 48, 6, "rgba(0,0,0,0.58)");
    }
    ctx.restore();
  }

  function drawSoftEllipse(x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function fillRoundRect(x, y, w, h, radius, fill) {
    const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, h / 2));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  function strokeRoundRect(x, y, w, h, radius, stroke, lineWidth = 1) {
    const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, h / 2));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.stroke();
  }

  function hexToRgb(color) {
    const value = color.replace("#", "");
    const bigint = Number.parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  }

  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function lighten(color, amount) {
    const rgb = hexToRgb(color);
    return rgbToHex({
      r: rgb.r + (255 - rgb.r) * amount,
      g: rgb.g + (255 - rgb.g) * amount,
      b: rgb.b + (255 - rgb.b) * amount,
    });
  }

  function darken(color, amount) {
    const rgb = hexToRgb(color);
    return rgbToHex({
      r: rgb.r * (1 - amount),
      g: rgb.g * (1 - amount),
      b: rgb.b * (1 - amount),
    });
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (event) => {
    if (keyIsHandled(event.code)) event.preventDefault();
    if (!input.keys.has(event.code)) input.just.add(event.code);
    input.keys.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    input.keys.delete(event.code);
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    const action = button.dataset.action;
    const start = (event) => {
      event.preventDefault();
      unlockAudio();
      input.touchHeld.add(action);
      input.touchJust.add(action);
      button.classList.add("is-pressed");
      canvas.focus();
    };
    const end = (event) => {
      event.preventDefault();
      input.touchHeld.delete(action);
      button.classList.remove("is-pressed");
    };
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("pointerleave", end);
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedPlayerCount = Number(button.dataset.mode) || 1;
      modeButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
      game = makeGame(selectedPlayerCount);
    });
  });

  startButton.addEventListener("click", () => {
    if (game.mode === "paused") {
      game.mode = "playing";
      hideOverlay();
      canvas.focus();
    } else {
      startGame();
    }
  });

  restartButton.addEventListener("click", startGame);

  showOverlay("Hào Quang Giáp", "Rìa thành phố đã mở cổng nứt. Chọn số người chơi rồi kích hoạt lõi giáp.", {
    primaryLabel: "Bắt đầu",
    showMode: true,
  });
  requestAnimationFrame(frame);
})();
