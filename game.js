(() => {
"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playerScoreEl = document.getElementById("playerScore");
const aiScoreEl = document.getElementById("aiScore");
const timerEl = document.getElementById("timer");
const startOverlay = document.getElementById("startOverlay");
const endOverlay = document.getElementById("endOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const message = document.getElementById("message");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");
const kickBtn = document.getElementById("kickBtn");

const W = canvas.width;
const H = canvas.height;

const FIELD = {
  left: 65,
  right: W - 65,
  top: 55,
  bottom: H - 55,
  goalWidth: 270,
  goalDepth: 70
};

const state = {
  running: false,
  paused: false,
  lastTime: 0,
  time: 120,
  blueScore: 0,
  redScore: 0,
  joyX: 0,
  joyY: 0,
  keys: Object.create(null),
  activeBlue: 0,
  frameId: null,
  lastTouchTeam: "blue",
  possession: null,
  kickChargeStart: null,
  kickCooldown: 0,
  stealCooldown: 0,
  restartTimer: null
};

function makePlayer(x, y, team, number, controlled = false) {
  return {
    x, y, homeX: x, homeY: y,
    team, number, controlled,
    r: 29,
    speed: controlled ? 400 : 300,
    vx: 0, vy: 0,
    facingX: 0,
    facingY: team === "blue" ? -1 : 1,
    color: team === "blue" ? "#287cff" : "#ef4d47"
  };
}

const blue = [
  makePlayer(W / 2, H * .77, "blue", 10, true),
  makePlayer(W * .28, H * .64, "blue", 7),
  makePlayer(W * .72, H * .64, "blue", 11)
];

const red = [
  makePlayer(W / 2, H * .23, "red", 9),
  makePlayer(W * .28, H * .36, "red", 6),
  makePlayer(W * .72, H * .36, "red", 8)
];

const ball = {
  x: W / 2,
  y: H / 2,
  r: 20,
  vx: 0,
  vy: 0,
  friction: .988,
  maxSpeed: 900
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function norm(x, y) {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
}

function showMessage(text, duration = 650) {
  message.textContent = text;
  message.classList.remove("hidden");
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => message.classList.add("hidden"), duration);
}

function setPossession(p) {
  state.possession = p;
  state.lastTouchTeam = p.team;
  ball.vx = 0;
  ball.vy = 0;
}

function clearPossession() {
  state.possession = null;
}

function resetPositions() {
  const bp = [
    [W / 2, H * .77],
    [W * .28, H * .64],
    [W * .72, H * .64]
  ];
  const rp = [
    [W / 2, H * .23],
    [W * .28, H * .36],
    [W * .72, H * .36]
  ];

  blue.forEach((p, i) => {
    p.x = p.homeX = bp[i][0];
    p.y = p.homeY = bp[i][1];
    p.vx = p.vy = 0;
    p.facingX = 0;
    p.facingY = -1;
    p.controlled = i === 0;
    p.speed = i === 0 ? 400 : 300;
  });

  red.forEach((p, i) => {
    p.x = p.homeX = rp[i][0];
    p.y = p.homeY = rp[i][1];
    p.vx = p.vy = 0;
    p.facingX = 0;
    p.facingY = 1;
  });

  state.activeBlue = 0;
  state.possession = null;
  ball.x = W / 2;
  ball.y = H / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function resetMatch() {
  clearTimeout(state.restartTimer);
  state.time = 120;
  state.blueScore = 0;
  state.redScore = 0;
  state.paused = false;
  state.kickCooldown = 0;
  state.stealCooldown = 0;
  state.kickChargeStart = null;
  playerScoreEl.textContent = "0";
  aiScoreEl.textContent = "0";
  timerEl.textContent = "02:00";
  resetPositions();
}

function startGame() {
  if (state.frameId) cancelAnimationFrame(state.frameId);
  resetMatch();
  startOverlay.classList.add("hidden");
  endOverlay.classList.add("hidden");
  message.classList.add("hidden");
  state.running = true;
  state.lastTime = performance.now();
  state.frameId = requestAnimationFrame(loop);
}

function finishGame() {
  state.running = false;

  if (state.blueScore > state.redScore) resultTitle.textContent = "VÝHRA!";
  else if (state.blueScore < state.redScore) resultTitle.textContent = "PROHRA";
  else resultTitle.textContent = "REMÍZA";

  resultText.textContent = `Výsledek ${state.blueScore}:${state.redScore}`;
  endOverlay.classList.remove("hidden");
}

function updateTimer(dt) {
  if (state.paused) return;

  state.time -= dt;

  if (state.time <= 0) {
    state.time = 0;
    timerEl.textContent = "00:00";
    finishGame();
    return;
  }

  const t = Math.ceil(state.time);
  timerEl.textContent =
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function keyboardVector() {
  let x = 0, y = 0;
  if (state.keys.arrowleft || state.keys.a) x--;
  if (state.keys.arrowright || state.keys.d) x++;
  if (state.keys.arrowup || state.keys.w) y--;
  if (state.keys.arrowdown || state.keys.s) y++;
  return (x || y) ? norm(x, y) : { x: 0, y: 0 };
}

function keepPlayerInField(p) {
  p.x = clamp(p.x, FIELD.left + p.r, FIELD.right - p.r);
  p.y = clamp(p.y, FIELD.top + p.r, FIELD.bottom - p.r);
}

function updateFacing(p) {
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > 20) {
    const n = norm(p.vx, p.vy);
    p.facingX = n.x;
    p.facingY = n.y;
  }
}

function controlHuman(dt) {
  const p = blue[state.activeBlue];
  let input = keyboardVector();

  if (
    input.x === 0 && input.y === 0 &&
    (Math.abs(state.joyX) > .02 || Math.abs(state.joyY) > .02)
  ) {
    input = norm(state.joyX, state.joyY);
  }

  p.vx = input.x * p.speed;
  p.vy = input.y * p.speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  updateFacing(p);
  keepPlayerInField(p);
}

function chooseBestBluePlayer() {
  if (state.possession && state.possession.team === "blue") {
    const idx = blue.indexOf(state.possession);
    if (idx >= 0 && idx !== state.activeBlue) {
      blue[state.activeBlue].controlled = false;
      blue[state.activeBlue].speed = 300;
      state.activeBlue = idx;
      blue[idx].controlled = true;
      blue[idx].speed = 400;
    }
    return;
  }

  let nearest = state.activeBlue;
  let best = Infinity;

  blue.forEach((p, i) => {
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (d < best) {
      best = d;
      nearest = i;
    }
  });

  const current = blue[state.activeBlue];
  const currentD = Math.hypot(ball.x - current.x, ball.y - current.y);

  if (nearest !== state.activeBlue && best + 165 < currentD) {
    blue[state.activeBlue].controlled = false;
    blue[state.activeBlue].speed = 300;

    state.activeBlue = nearest;

    blue[state.activeBlue].controlled = true;
    blue[state.activeBlue].speed = 400;
  }
}

function moveAI(p, tx, ty, dt, speed) {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);

  if (d < 16) {
    p.vx *= .55;
    p.vy *= .55;
  } else {
    const n = norm(dx, dy);
    p.vx = n.x * speed;
    p.vy = n.y * speed;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  updateFacing(p);
  keepPlayerInField(p);
}

function nearestToBall(team) {
  let best = 0;
  let bestD = Infinity;

  team.forEach((p, i) => {
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });

  return best;
}

function nearestToPlayer(team, target) {
  let best = 0;
  let bestD = Infinity;

  team.forEach((p, i) => {
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });

  return best;
}

function updateBlueAI(dt) {
  const holder = state.possession;

  blue.forEach((p, i) => {
    if (i === state.activeBlue) return;

    const side = p.homeX < W / 2 ? -1 : 1;
    let tx = p.homeX;
    let ty = p.homeY;

    if (holder && holder.team === "blue") {
      // Nabídka do prostoru při vlastním držení.
      tx = clamp(holder.x + side * 190, FIELD.left + 100, FIELD.right - 100);
      ty = clamp(holder.y - 210, H * .32, H * .68);
    } else {
      const chase = nearestToBall(blue);
      if (i === chase && !holder) {
        tx = ball.x;
        ty = ball.y;
      } else {
        tx = clamp(W / 2 + side * 210, FIELD.left + 100, FIELD.right - 100);
        ty = H * .63;
      }
    }

    moveAI(p, tx, ty, dt, 270);
  });
}

function updateRedAI(dt) {
  const holder = state.possession;

  if (holder && holder.team === "blue") {
    const presser = nearestToPlayer(red, holder);

    red.forEach((p, i) => {
      const side = p.homeX < W / 2 ? -1 : 1;

      if (i === presser) {
        moveAI(p, holder.x, holder.y, dt, 300);
      } else {
        const tx = clamp(W / 2 + side * 205, FIELD.left + 100, FIELD.right - 100);
        const ty = clamp(holder.y - 210, H * .20, H * .48);
        moveAI(p, tx, ty, dt, 255);
      }
    });

    return;
  }

  if (holder && holder.team === "red") {
    // Držitel míče útočí na spodní bránu.
    red.forEach((p, i) => {
      if (p === holder) {
        const targetX = clamp(W / 2 + (W / 2 - p.x) * .15, FIELD.left + 100, FIELD.right - 100);
        const targetY = H * .82;
        moveAI(p, targetX, targetY, dt, 310);

        // AI vystřelí, když je dost blízko.
        if (
          p.y > H * .66 &&
          Math.abs(p.x - W / 2) < 230 &&
          state.kickCooldown <= 0
        ) {
          aiKick(p, true);
        }
      } else {
        const side = p.homeX < W / 2 ? -1 : 1;
        const tx = clamp(holder.x + side * 180, FIELD.left + 100, FIELD.right - 100);
        const ty = clamp(holder.y + 180, H * .35, H * .72);
        moveAI(p, tx, ty, dt, 260);
      }
    });

    return;
  }

  // Volný míč: jen jeden soupeř ho napadá.
  const presser = nearestToBall(red);

  red.forEach((p, i) => {
    const side = p.homeX < W / 2 ? -1 : 1;

    if (i === presser) {
      moveAI(p, ball.x, ball.y, dt, 295);
    } else {
      moveAI(
        p,
        clamp(W / 2 + side * 210, FIELD.left + 100, FIELD.right - 100),
        H * .36,
        dt,
        255
      );
    }
  });
}

function resolvePlayerCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.r + b.r + 8;

  if (d > 0 && d < minD) {
    const n = norm(dx, dy);
    const overlap = minD - d;

    a.x -= n.x * overlap * .52;
    a.y -= n.y * overlap * .52;
    b.x += n.x * overlap * .52;
    b.y += n.y * overlap * .52;

    a.vx *= .75;
    a.vy *= .75;
    b.vx *= .75;
    b.vy *= .75;

    keepPlayerInField(a);
    keepPlayerInField(b);
  }
}

function updatePossessionBall() {
  if (!state.possession) return;

  const p = state.possession;
  const frontDistance = p.r + ball.r + 8;

  ball.x = p.x + p.facingX * frontDistance;
  ball.y = p.y + p.facingY * frontDistance;
  ball.vx = p.vx;
  ball.vy = p.vy;

  // Když vedený míč přejde čáru, je aut / roh.
  checkBallOut();
}

function tryAcquirePossession() {
  if (state.possession || state.kickCooldown > 0) return;

  const everyone = [...blue, ...red];

  let candidate = null;
  let bestD = Infinity;

  everyone.forEach(p => {
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (d < p.r + ball.r + 10 && d < bestD) {
      candidate = p;
      bestD = d;
    }
  });

  if (candidate) {
    setPossession(candidate);
  }
}

function trySteal() {
  if (!state.possession || state.stealCooldown > 0) return;

  const holder = state.possession;
  const opponents = holder.team === "blue" ? red : blue;

  let nearest = null;
  let bestD = Infinity;

  opponents.forEach(p => {
    const d = Math.hypot(holder.x - p.x, holder.y - p.y);
    if (d < bestD) {
      bestD = d;
      nearest = p;
    }
  });

  if (nearest && bestD < holder.r + nearest.r + 6) {
    setPossession(nearest);
    state.stealCooldown = .55;
  }
}

function findBestPassTarget(p) {
  const teammates = p.team === "blue" ? blue : red;
  let best = null;
  let bestScore = -Infinity;

  teammates.forEach(t => {
    if (t === p) return;

    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = Math.hypot(dx, dy);

    if (d < 80 || d > 430) return;

    const dir = norm(dx, dy);
    const facingDot = dir.x * p.facingX + dir.y * p.facingY;
    const forwardBonus = p.team === "blue" ? -dy : dy;

    const score = facingDot * 220 + forwardBonus * .45 - d * .12;

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  });

  return best;
}

function kickFromPlayer(p, chargeSeconds = 0.12) {
  if (state.possession !== p || state.kickCooldown > 0) return;

  const strong = chargeSeconds > .42;
  let dir;

  if (!strong) {
    const target = findBestPassTarget(p);
    if (target) {
      dir = norm(target.x - p.x, target.y - p.y);
    } else {
      dir = norm(p.facingX, p.facingY);
    }
  } else {
    // Silná střela míří přibližně na střed soupeřovy brány.
    const goalY = p.team === "blue" ? FIELD.top - 20 : FIELD.bottom + 20;
    dir = norm(W / 2 - p.x, goalY - p.y);
  }

  clearPossession();

  const power = strong
    ? Math.min(900, 650 + chargeSeconds * 230)
    : 470;

  ball.x = p.x + dir.x * (p.r + ball.r + 10);
  ball.y = p.y + dir.y * (p.r + ball.r + 10);
  ball.vx = dir.x * power;
  ball.vy = dir.y * power;

  state.lastTouchTeam = p.team;
  state.kickCooldown = .22;
  state.stealCooldown = .18;
}

function aiKick(p, strong = false) {
  if (state.possession !== p || state.kickCooldown > 0) return;

  let dir;

  if (strong) {
    const goalY = p.team === "blue" ? FIELD.top - 20 : FIELD.bottom + 20;
    dir = norm(W / 2 - p.x, goalY - p.y);
  } else {
    const target = findBestPassTarget(p);
    dir = target
      ? norm(target.x - p.x, target.y - p.y)
      : norm(p.facingX, p.facingY);
  }

  clearPossession();

  const power = strong ? 700 : 460;
  ball.x = p.x + dir.x * (p.r + ball.r + 10);
  ball.y = p.y + dir.y * (p.r + ball.r + 10);
  ball.vx = dir.x * power;
  ball.vy = dir.y * power;

  state.lastTouchTeam = p.team;
  state.kickCooldown = .24;
  state.stealCooldown = .18;
}

function updateFreeBall(dt) {
  if (state.possession) return;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  ball.vx *= Math.pow(ball.friction, dt * 60);
  ball.vy *= Math.pow(ball.friction, dt * 60);

  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed < 18) {
    ball.vx = 0;
    ball.vy = 0;
  }

  checkBallOut();
}

function restartPlay(type, team, x, y) {
  if (state.paused || !state.running) return;

  state.paused = true;
  clearPossession();
  ball.vx = 0;
  ball.vy = 0;

  showMessage(type, 650);

  state.restartTimer = setTimeout(() => {
    if (!state.running) return;

    ball.x = clamp(x, FIELD.left + 95, FIELD.right - 95);
    ball.y = clamp(y, FIELD.top + 110, FIELD.bottom - 110);

    const teamPlayers = team === "blue" ? blue : red;

    let receiver = teamPlayers[0];
    let bestD = Infinity;

    teamPlayers.forEach(p => {
      const d = Math.hypot(ball.x - p.x, ball.y - p.y);
      if (d < bestD) {
        bestD = d;
        receiver = p;
      }
    });

    receiver.x = clamp(ball.x + (team === "blue" ? 0 : 0), FIELD.left + 80, FIELD.right - 80);
    receiver.y = clamp(
      ball.y + (team === "blue" ? 70 : -70),
      FIELD.top + 80,
      FIELD.bottom - 80
    );

    setPossession(receiver);
    state.stealCooldown = .7;
    state.paused = false;
  }, 700);
}

function score(team) {
  if (state.paused) return;

  state.paused = true;
  clearPossession();

  if (team === "blue") {
    state.blueScore++;
    playerScoreEl.textContent = state.blueScore;
    showMessage("GÓL!", 900);
  } else {
    state.redScore++;
    aiScoreEl.textContent = state.redScore;
    showMessage("GÓL SOUPEŘE", 900);
  }

  state.restartTimer = setTimeout(() => {
    if (!state.running) return;
    resetPositions();
    state.paused = false;
  }, 950);
}

function checkBallOut() {
  const goalL = W / 2 - FIELD.goalWidth / 2;
  const goalR = W / 2 + FIELD.goalWidth / 2;
  const inGoal = ball.x > goalL && ball.x < goalR;

  if (ball.x < FIELD.left) {
    const team = state.lastTouchTeam === "blue" ? "red" : "blue";
    restartPlay("AUT", team, FIELD.left, ball.y);
    return true;
  }

  if (ball.x > FIELD.right) {
    const team = state.lastTouchTeam === "blue" ? "red" : "blue";
    restartPlay("AUT", team, FIELD.right, ball.y);
    return true;
  }

  if (ball.y < FIELD.top) {
    if (inGoal) {
      score("blue");
      return true;
    }

    if (state.lastTouchTeam === "red") {
      restartPlay("ROH", "blue", ball.x < W/2 ? FIELD.left : FIELD.right, FIELD.top);
    } else {
      restartPlay("ODKOP", "red", W / 2, FIELD.top + 160);
    }
    return true;
  }

  if (ball.y > FIELD.bottom) {
    if (inGoal) {
      score("red");
      return true;
    }

    if (state.lastTouchTeam === "blue") {
      restartPlay("ROH", "red", ball.x < W/2 ? FIELD.left : FIELD.right, FIELD.bottom);
    } else {
      restartPlay("ODKOP", "blue", W / 2, FIELD.bottom - 160);
    }
    return true;
  }

  return false;
}

function update(dt) {
  if (state.paused) return;

  updateTimer(dt);
  if (!state.running) return;

  state.kickCooldown = Math.max(0, state.kickCooldown - dt);
  state.stealCooldown = Math.max(0, state.stealCooldown - dt);

  chooseBestBluePlayer();
  controlHuman(dt);
  updateBlueAI(dt);
  updateRedAI(dt);

  const everyone = [...blue, ...red];

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < everyone.length; i++) {
      for (let j = i + 1; j < everyone.length; j++) {
        resolvePlayerCollision(everyone[i], everyone[j]);
      }
    }
  }

  if (state.possession) {
    trySteal();
    updatePossessionBall();
  } else {
    updateFreeBall(dt);
    tryAcquirePossession();
  }

  // AI s míčem občas přihrává, pokud ještě není v pozici ke střele.
  if (
    state.possession &&
    state.possession.team === "red" &&
    state.possession.y < H * .64 &&
    state.kickCooldown <= 0
  ) {
    const holder = state.possession;
    const target = findBestPassTarget(holder);

    if (target && Math.random() < .012) {
      aiKick(holder, false);
    }
  }
}

function drawGoal(y, top) {
  const x = W / 2 - FIELD.goalWidth / 2;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.72)";
  ctx.lineWidth = 5;

  if (top) ctx.strokeRect(x, y - FIELD.goalDepth, FIELD.goalWidth, FIELD.goalDepth);
  else ctx.strokeRect(x, y, FIELD.goalWidth, FIELD.goalDepth);

  ctx.restore();
}

function drawField() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#248c46";
  ctx.fillRect(0, 0, W, H);

  for (let y = 0; y < H; y += 110) {
    ctx.fillStyle = Math.floor(y / 110) % 2 === 0
      ? "rgba(255,255,255,.025)"
      : "rgba(0,0,0,.025)";
    ctx.fillRect(0, y, W, 110);
  }

  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 8;
  ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);

  ctx.beginPath();
  ctx.moveTo(FIELD.left, H / 2);
  ctx.lineTo(FIELD.right, H / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 115, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();

  const boxW = 430;
  const boxH = 185;
  ctx.strokeRect(W / 2 - boxW / 2, FIELD.top, boxW, boxH);
  ctx.strokeRect(W / 2 - boxW / 2, FIELD.bottom - boxH, boxW, boxH);

  drawGoal(FIELD.top, true);
  drawGoal(FIELD.bottom, false);
}

function drawPlayer(p) {
  ctx.save();

  if (p.controlled) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 10, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 7;
    ctx.stroke();
  }

  if (state.possession === p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 17, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x + 4, p.y + 6, p.r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "900 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(p.number, p.x, p.y + 1);

  ctx.restore();
}

function drawBall() {
  ctx.save();

  ctx.beginPath();
  ctx.arc(ball.x + 4, ball.y + 6, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,.23)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#222";
  ctx.fill();

  ctx.restore();
}

function draw() {
  drawField();
  blue.forEach(drawPlayer);
  red.forEach(drawPlayer);
  drawBall();
}

function loop(now) {
  if (!state.running) return;

  const dt = Math.min((now - state.lastTime) / 1000, .033);
  state.lastTime = now;

  update(dt);
  draw();

  if (state.running) state.frameId = requestAnimationFrame(loop);
}

function beginKickCharge() {
  if (!state.running) return;
  if (!state.possession || state.possession !== blue[state.activeBlue]) return;

  state.kickChargeStart = performance.now();
  kickBtn.classList.add("charging");
}

function endKickCharge() {
  if (state.kickChargeStart === null) return;

  const held = (performance.now() - state.kickChargeStart) / 1000;
  state.kickChargeStart = null;
  kickBtn.classList.remove("charging");

  const p = blue[state.activeBlue];
  kickFromPlayer(p, held);
}

window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();

  if (!state.running && (key === "enter" || key === " ")) {
    e.preventDefault();
    startGame();
    return;
  }

  if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(key)) {
    e.preventDefault();
    state.keys[key] = true;
  }

  if (key === " " && state.running && !e.repeat) {
    e.preventDefault();
    beginKickCharge();
  }
});

window.addEventListener("keyup", e => {
  const key = e.key.toLowerCase();

  state.keys[key] = false;

  if (key === " ") {
    e.preventDefault();
    endKickCharge();
  }
});

function setupJoystick() {
  let pointer = null;
  const max = 38;

  function setFromPointer(e) {
    const r = joystick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);

    if (d > max) {
      dx = dx / d * max;
      dy = dy / d * max;
    }

    state.joyX = dx / max;
    state.joyY = dy / max;

    stick.style.transform =
      `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  joystick.addEventListener("pointerdown", e => {
    pointer = e.pointerId;
    joystick.setPointerCapture(pointer);
    setFromPointer(e);
  });

  joystick.addEventListener("pointermove", e => {
    if (e.pointerId === pointer) setFromPointer(e);
  });

  function end(e) {
    if (e.pointerId !== pointer) return;
    pointer = null;
    state.joyX = 0;
    state.joyY = 0;
    stick.style.transform = "translate(-50%, -50%)";
  }

  joystick.addEventListener("pointerup", end);
  joystick.addEventListener("pointercancel", end);
}

kickBtn.addEventListener("pointerdown", e => {
  e.preventDefault();
  beginKickCharge();
});

kickBtn.addEventListener("pointerup", e => {
  e.preventDefault();
  endKickCharge();
});

kickBtn.addEventListener("pointercancel", () => {
  state.kickChargeStart = null;
  kickBtn.classList.remove("charging");
});

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

setupJoystick();
resetPositions();
draw();

})();
