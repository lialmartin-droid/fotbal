const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playerScoreEl = document.getElementById("playerScore");
const aiScoreEl = document.getElementById("aiScore");
const timerEl = document.getElementById("timer");
const goalMessage = document.getElementById("goalMessage");
const startOverlay = document.getElementById("startOverlay");
const endOverlay = document.getElementById("endOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");
const shootBtn = document.getElementById("shootBtn");

const W = canvas.width;
const H = canvas.height;

const FIELD = {
  left: 65,
  right: W - 65,
  top: 55,
  bottom: H - 55,
  goalWidth: 280,
  goalDepth: 70
};

const state = {
  running: false,
  pausedAfterGoal: false,
  lastTime: 0,
  matchTime: 120,
  playerScore: 0,
  aiScore: 0,
  joystickX: 0,
  joystickY: 0,
  shootPressed: false
};

const player = {
  x: W / 2,
  y: H * 0.76,
  r: 42,
  speed: 360,
  color: "#2a7fff",
  vx: 0,
  vy: 0
};

const ai = {
  x: W / 2,
  y: H * 0.24,
  r: 42,
  speed: 300,
  color: "#ef4d47",
  vx: 0,
  vy: 0
};

const ball = {
  x: W / 2,
  y: H / 2,
  r: 25,
  vx: 0,
  vy: 0,
  friction: 0.988,
  maxSpeed: 760
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function length(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function resetPositions(kickoffToPlayer = true) {
  player.x = W / 2;
  player.y = H * 0.76;
  player.vx = 0;
  player.vy = 0;

  ai.x = W / 2;
  ai.y = H * 0.24;
  ai.vx = 0;
  ai.vy = 0;

  ball.x = W / 2;
  ball.y = H / 2;
  ball.vx = 0;
  ball.vy = kickoffToPlayer ? 55 : -55;
}

function resetMatch() {
  state.matchTime = 120;
  state.playerScore = 0;
  state.aiScore = 0;
  state.pausedAfterGoal = false;

  playerScoreEl.textContent = "0";
  aiScoreEl.textContent = "0";
  timerEl.textContent = "02:00";

  resetPositions(true);
}

function startMatch() {
  resetMatch();
  startOverlay.classList.add("hidden");
  endOverlay.classList.add("hidden");
  state.running = true;
  state.lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function finishMatch() {
  state.running = false;

  if (state.playerScore > state.aiScore) {
    resultTitle.textContent = "VÝHRA!";
    resultText.textContent = `Vyhrál jsi ${state.playerScore}:${state.aiScore}.`;
  } else if (state.playerScore < state.aiScore) {
    resultTitle.textContent = "PROHRA";
    resultText.textContent = `Soupeř vyhrál ${state.aiScore}:${state.playerScore}.`;
  } else {
    resultTitle.textContent = "REMÍZA";
    resultText.textContent = `Zápas skončil ${state.playerScore}:${state.aiScore}.`;
  }

  endOverlay.classList.remove("hidden");
}

function updateTimer(dt) {
  if (state.pausedAfterGoal) return;

  state.matchTime -= dt;
  if (state.matchTime <= 0) {
    state.matchTime = 0;
    timerEl.textContent = "00:00";
    finishMatch();
    return;
  }

  const total = Math.ceil(state.matchTime);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  timerEl.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function updatePlayer(dt) {
  const inputLen = length(state.joystickX, state.joystickY);
  if (inputLen > 0.01) {
    const dir = normalize(state.joystickX, state.joystickY);
    const strength = Math.min(1, inputLen);
    player.vx = dir.x * player.speed * strength;
    player.vy = dir.y * player.speed * strength;
  } else {
    player.vx *= 0.78;
    player.vy *= 0.78;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  player.x = clamp(player.x, FIELD.left + player.r, FIELD.right - player.r);
  player.y = clamp(player.y, FIELD.top + player.r, FIELD.bottom - player.r);
}

function updateAI(dt) {
  let targetX = ball.x;
  let targetY = ball.y;

  if (ball.y > H * 0.62) {
    targetX = W / 2 + (ball.x - W / 2) * 0.35;
    targetY = H * 0.34;
  }

  const dx = targetX - ai.x;
  const dy = targetY - ai.y;
  const dir = normalize(dx, dy);

  ai.vx = dir.x * ai.speed;
  ai.vy = dir.y * ai.speed;

  if (Math.hypot(dx, dy) < 25) {
    ai.vx *= 0.2;
    ai.vy *= 0.2;
  }

  ai.x += ai.vx * dt;
  ai.y += ai.vy * dt;

  ai.x = clamp(ai.x, FIELD.left + ai.r, FIELD.right - ai.r);
  ai.y = clamp(ai.y, FIELD.top + ai.r, FIELD.bottom - ai.r);

  const dBall = Math.hypot(ball.x - ai.x, ball.y - ai.y);
  if (dBall < ai.r + ball.r + 14 && ball.y < ai.y + 130) {
    const shot = normalize(ball.x - ai.x, ball.y - ai.y + 80);
    ball.vx += shot.x * 300;
    ball.vy += shot.y * 460;
  }
}

function collidePlayerBall(actor, kickPower = 0) {
  const dx = ball.x - actor.x;
  const dy = ball.y - actor.y;
  const dist = Math.hypot(dx, dy);
  const minDist = ball.r + actor.r;

  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const relative = actor.vx * nx + actor.vy * ny;
    ball.vx += nx * Math.max(90, relative * 0.95);
    ball.vy += ny * Math.max(90, relative * 0.95);

    if (kickPower > 0) {
      ball.vx += nx * kickPower;
      ball.vy += ny * kickPower;
    }
  }
}

function shoot() {
  if (!state.running || state.pausedAfterGoal) return;

  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const dist = Math.hypot(dx, dy);

  if (dist <= player.r + ball.r + 90) {
    const dir = normalize(dx, dy);
    ball.vx += dir.x * 610;
    ball.vy += dir.y * 610;

    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > ball.maxSpeed) {
      ball.vx = (ball.vx / speed) * ball.maxSpeed;
      ball.vy = (ball.vy / speed) * ball.maxSpeed;
    }
  }
}

function updateBall(dt) {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  ball.vx *= Math.pow(ball.friction, dt * 60);
  ball.vy *= Math.pow(ball.friction, dt * 60);

  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > ball.maxSpeed) {
    ball.vx = (ball.vx / speed) * ball.maxSpeed;
    ball.vy = (ball.vy / speed) * ball.maxSpeed;
  }

  const goalLeft = W / 2 - FIELD.goalWidth / 2;
  const goalRight = W / 2 + FIELD.goalWidth / 2;
  const inGoalMouth = ball.x > goalLeft + ball.r * 0.2 && ball.x < goalRight - ball.r * 0.2;

  if (ball.x - ball.r < FIELD.left) {
    ball.x = FIELD.left + ball.r;
    ball.vx = Math.abs(ball.vx) * 0.86;
  }

  if (ball.x + ball.r > FIELD.right) {
    ball.x = FIELD.right - ball.r;
    ball.vx = -Math.abs(ball.vx) * 0.86;
  }

  if (ball.y - ball.r < FIELD.top) {
    if (inGoalMouth) {
      scoreGoal("player");
      return;
    } else {
      ball.y = FIELD.top + ball.r;
      ball.vy = Math.abs(ball.vy) * 0.86;
    }
  }

  if (ball.y + ball.r > FIELD.bottom) {
    if (inGoalMouth) {
      scoreGoal("ai");
      return;
    } else {
      ball.y = FIELD.bottom - ball.r;
      ball.vy = -Math.abs(ball.vy) * 0.86;
    }
  }
}

function scoreGoal(who) {
  if (state.pausedAfterGoal) return;
  state.pausedAfterGoal = true;

  if (who === "player") {
    state.playerScore++;
    playerScoreEl.textContent = state.playerScore;
    goalMessage.textContent = "GÓL!";
  } else {
    state.aiScore++;
    aiScoreEl.textContent = state.aiScore;
    goalMessage.textContent = "GÓL SOUPEŘE";
  }

  goalMessage.classList.remove("hidden");

  setTimeout(() => {
    goalMessage.classList.add("hidden");
    resetPositions(who !== "player");
    state.pausedAfterGoal = false;
  }, 1100);
}

function separateActors(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;

  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = (minDist - dist) / 2;

    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
  }
}

function update(dt) {
  if (state.pausedAfterGoal) return;

  updateTimer(dt);
  if (!state.running) return;

  updatePlayer(dt);
  updateAI(dt);

  separateActors(player, ai);
  collidePlayerBall(player, 0);
  collidePlayerBall(ai, 0);

  updateBall(dt);
}

function drawField() {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#258d47";
  ctx.fillRect(0, 0, W, H);

  const stripeH = 120;
  for (let y = 0; y < H; y += stripeH) {
    ctx.fillStyle = (Math.floor(y / stripeH) % 2 === 0)
      ? "rgba(255,255,255,.025)"
      : "rgba(0,0,0,.025)";
    ctx.fillRect(0, y, W, stripeH);
  }

  ctx.strokeStyle = "rgba(255,255,255,.88)";
  ctx.lineWidth = 8;
  ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);

  ctx.beginPath();
  ctx.moveTo(FIELD.left, H / 2);
  ctx.lineTo(FIELD.right, H / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 120, 0, Math.PI * 2);
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

function drawGoal(y, top) {
  const x = W / 2 - FIELD.goalWidth / 2;
  const depth = FIELD.goalDepth;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.75)";
  ctx.lineWidth = 6;

  if (top) {
    ctx.strokeRect(x, y - depth, FIELD.goalWidth, depth);
    for (let gx = x + 28; gx < x + FIELD.goalWidth; gx += 28) {
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y - depth);
      ctx.stroke();
    }
  } else {
    ctx.strokeRect(x, y, FIELD.goalWidth, depth);
    for (let gx = x + 28; gx < x + FIELD.goalWidth; gx += 28) {
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + depth);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawPlayer(p, isHuman) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "900 28px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(isHuman ? "10" : "9", p.x, p.y + 1);

  ctx.restore();
}

function drawBall() {
  ctx.save();

  ctx.beginPath();
  ctx.arc(ball.x + 5, ball.y + 7, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#1b1b1b";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#222";
  ctx.fill();

  ctx.restore();
}

function draw() {
  drawField();
  drawPlayer(player, true);
  drawPlayer(ai, false);
  drawBall();
}

function gameLoop(now) {
  if (!state.running) return;

  const dt = Math.min((now - state.lastTime) / 1000, 0.033);
  state.lastTime = now;

  update(dt);
  draw();

  if (state.running) requestAnimationFrame(gameLoop);
}

function setupJoystick() {
  let activePointer = null;
  const maxDist = 38;

  function updateFromEvent(e) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }

    state.joystickX = dx / maxDist;
    state.joystickY = dy / maxDist;

    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  joystick.addEventListener("pointerdown", (e) => {
    activePointer = e.pointerId;
    joystick.setPointerCapture(activePointer);
    updateFromEvent(e);
  });

  joystick.addEventListener("pointermove", (e) => {
    if (e.pointerId !== activePointer) return;
    updateFromEvent(e);
  });

  function release(e) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    state.joystickX = 0;
    state.joystickY = 0;
    stick.style.transform = "translate(-50%, -50%)";
  }

  joystick.addEventListener("pointerup", release);
  joystick.addEventListener("pointercancel", release);
}

shootBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  shootBtn.classList.add("active");
  shoot();
});

shootBtn.addEventListener("pointerup", () => {
  shootBtn.classList.remove("active");
});

shootBtn.addEventListener("pointercancel", () => {
  shootBtn.classList.remove("active");
});

startBtn.addEventListener("click", startMatch);
restartBtn.addEventListener("click", startMatch);

setupJoystick();
resetPositions(true);
draw();
