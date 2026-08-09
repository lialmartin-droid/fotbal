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
  paused: false,
  lastTime: 0,
  time: 120,
  blueScore: 0,
  redScore: 0,
  joyX: 0,
  joyY: 0,
  keys: {},
  activeBlue: 0
};

function makePlayer(x, y, team, number, controlled = false) {
  return {
    x, y,
    homeX: x,
    homeY: y,
    team,
    number,
    controlled,
    r: 39,
    speed: controlled ? 365 : 300,
    vx: 0,
    vy: 0,
    color: team === "blue" ? "#287cff" : "#ef4d47"
  };
}

const blue = [
  makePlayer(W / 2, H * 0.76, "blue", 10, true),
  makePlayer(W * 0.28, H * 0.62, "blue", 7),
  makePlayer(W * 0.72, H * 0.62, "blue", 11)
];

const red = [
  makePlayer(W / 2, H * 0.24, "red", 9),
  makePlayer(W * 0.28, H * 0.38, "red", 6),
  makePlayer(W * 0.72, H * 0.38, "red", 8)
];

const ball = {
  x: W / 2,
  y: H / 2,
  r: 24,
  vx: 0,
  vy: 0,
  friction: 0.987,
  maxSpeed: 760
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function norm(x, y) {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
}

function resetPositions() {
  const bluePos = [
    [W / 2, H * 0.76],
    [W * 0.28, H * 0.62],
    [W * 0.72, H * 0.62]
  ];

  const redPos = [
    [W / 2, H * 0.24],
    [W * 0.28, H * 0.38],
    [W * 0.72, H * 0.38]
  ];

  blue.forEach((p, i) => {
    p.x = p.homeX = bluePos[i][0];
    p.y = p.homeY = bluePos[i][1];
    p.vx = p.vy = 0;
  });

  red.forEach((p, i) => {
    p.x = p.homeX = redPos[i][0];
    p.y = p.homeY = redPos[i][1];
    p.vx = p.vy = 0;
  });

  ball.x = W / 2;
  ball.y = H / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function resetMatch() {
  state.time = 120;
  state.blueScore = 0;
  state.redScore = 0;
  state.paused = false;
  playerScoreEl.textContent = "0";
  aiScoreEl.textContent = "0";
  timerEl.textContent = "02:00";
  resetPositions();
}

function startGame() {
  resetMatch();
  startOverlay.classList.add("hidden");
  endOverlay.classList.add("hidden");
  state.running = true;
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
}

function finishGame() {
  state.running = false;

  if (state.blueScore > state.redScore) {
    resultTitle.textContent = "VÝHRA!";
  } else if (state.blueScore < state.redScore) {
    resultTitle.textContent = "PROHRA";
  } else {
    resultTitle.textContent = "REMÍZA";
  }

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

  if (state.keys["arrowleft"] || state.keys["a"]) x -= 1;
  if (state.keys["arrowright"] || state.keys["d"]) x += 1;
  if (state.keys["arrowup"] || state.keys["w"]) y -= 1;
  if (state.keys["arrowdown"] || state.keys["s"]) y += 1;

  if (x || y) return norm(x, y);
  return { x: 0, y: 0 };
}

function controlHuman(dt) {
  const p = blue[state.activeBlue];
  let input = keyboardVector();

  if (input.x === 0 && input.y === 0 && (Math.abs(state.joyX) > .02 || Math.abs(state.joyY) > .02)) {
    input = norm(state.joyX, state.joyY);
  }

  p.vx = input.x * p.speed;
  p.vy = input.y * p.speed;

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  keepInField(p);
}

function keepInField(p) {
  p.x = clamp(p.x, FIELD.left + p.r, FIELD.right - p.r);
  p.y = clamp(p.y, FIELD.top + p.r, FIELD.bottom - p.r);
}

function chooseBestBluePlayer() {
  // Automaticky přepne ovládaného hráče na nejbližšího k míči,
  // ale ne příliš agresivně během souboje.
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

  if (nearest !== state.activeBlue && best + 95 < currentD) {
    blue[state.activeBlue].controlled = false;
    state.activeBlue = nearest;
    blue[state.activeBlue].controlled = true;
    blue[state.activeBlue].speed = 365;
  }
}

function updateBlueAI(dt) {
  blue.forEach((p, i) => {
    if (i === state.activeBlue) return;

    let targetX = p.homeX;
    let targetY = p.homeY;

    const active = blue[state.activeBlue];

    // Jeden spoluhráč podporuje útok, druhý zůstává více vzadu.
    const attacking = ball.y < H * 0.62;

    if (attacking) {
      const side = p.homeX < W / 2 ? -1 : 1;
      targetX = clamp(ball.x + side * 150, FIELD.left + 80, FIELD.right - 80);
      targetY = clamp(ball.y + 150, H * 0.42, H * 0.72);
    } else {
      targetX = p.homeX;
      targetY = p.homeY;
    }

    // Pokud je spoluhráč zřetelně nejblíž míči, jde do souboje.
    const myBallDist = Math.hypot(ball.x - p.x, ball.y - p.y);
    const activeBallDist = Math.hypot(ball.x - active.x, ball.y - active.y);

    if (myBallDist + 100 < activeBallDist) {
      targetX = ball.x;
      targetY = ball.y;
    }

    moveAI(p, targetX, targetY, dt, 285);
  });
}

function updateRedAI(dt) {
  let closestIndex = 0;
  let closestD = Infinity;

  red.forEach((p, i) => {
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (d < closestD) {
      closestD = d;
      closestIndex = i;
    }
  });

  red.forEach((p, i) => {
    let targetX = p.homeX;
    let targetY = p.homeY;

    if (i === closestIndex) {
      targetX = ball.x;
      targetY = ball.y;
    } else {
      const side = p.homeX < W / 2 ? -1 : 1;
      targetX = clamp(ball.x + side * 170, FIELD.left + 80, FIELD.right - 80);
      targetY = clamp(ball.y - 170, H * 0.24, H * 0.58);
    }

    moveAI(p, targetX, targetY, dt, i === closestIndex ? 315 : 275);
  });
}

function moveAI(p, tx, ty, dt, speed) {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);

  if (d < 12) {
    p.vx *= .7;
    p.vy *= .7;
  } else {
    const n = norm(dx, dy);
    p.vx = n.x * speed;
    p.vy = n.y * speed;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  keepInField(p);
}

function resolvePlayerCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.r + b.r;

  if (d > 0 && d < minD) {
    const n = norm(dx, dy);
    const overlap = (minD - d) / 2;

    a.x -= n.x * overlap;
    a.y -= n.y * overlap;
    b.x += n.x * overlap;
    b.y += n.y * overlap;
  }
}

function collideBallWithPlayer(p) {
  const dx = ball.x - p.x;
  const dy = ball.y - p.y;
  const d = Math.hypot(dx, dy);
  const minD = ball.r + p.r;

  if (d > 0 && d < minD) {
    const n = norm(dx, dy);
    const overlap = minD - d;

    ball.x += n.x * overlap;
    ball.y += n.y * overlap;

    const playerSpeed = Math.hypot(p.vx, p.vy);
    const moving = playerSpeed > 35;

    // Fotbalovější dotek: míč přebírá směr pohybu hráče.
    if (moving) {
      const move = norm(p.vx, p.vy);
      const kick = p.controlled ? 360 : 320;

      ball.vx += move.x * kick;
      ball.vy += move.y * kick;

      // malá složka od těla hráče
      ball.vx += n.x * 70;
      ball.vy += n.y * 70;
    } else {
      ball.vx += n.x * 120;
      ball.vy += n.y * 120;
    }

    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > ball.maxSpeed) {
      ball.vx = ball.vx / speed * ball.maxSpeed;
      ball.vy = ball.vy / speed * ball.maxSpeed;
    }
  }
}

function updateBall(dt) {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  ball.vx *= Math.pow(ball.friction, dt * 60);
  ball.vy *= Math.pow(ball.friction, dt * 60);

  const goalL = W / 2 - FIELD.goalWidth / 2;
  const goalR = W / 2 + FIELD.goalWidth / 2;
  const inGoal = ball.x > goalL + 5 && ball.x < goalR - 5;

  if (ball.x - ball.r < FIELD.left) {
    ball.x = FIELD.left + ball.r;
    ball.vx = Math.abs(ball.vx) * .72;
  }

  if (ball.x + ball.r > FIELD.right) {
    ball.x = FIELD.right - ball.r;
    ball.vx = -Math.abs(ball.vx) * .72;
  }

  if (ball.y - ball.r < FIELD.top) {
    if (inGoal) {
      score("blue");
      return;
    }
    ball.y = FIELD.top + ball.r;
    ball.vy = Math.abs(ball.vy) * .72;
  }

  if (ball.y + ball.r > FIELD.bottom) {
    if (inGoal) {
      score("red");
      return;
    }
    ball.y = FIELD.bottom - ball.r;
    ball.vy = -Math.abs(ball.vy) * .72;
  }
}

function score(team) {
  if (state.paused) return;
  state.paused = true;

  if (team === "blue") {
    state.blueScore++;
    playerScoreEl.textContent = state.blueScore;
    message.textContent = "GÓL!";
  } else {
    state.redScore++;
    aiScoreEl.textContent = state.redScore;
    message.textContent = "GÓL SOUPEŘE";
  }

  message.classList.remove("hidden");

  setTimeout(() => {
    resetPositions();
    message.classList.add("hidden");
    state.paused = false;
  }, 1000);
}

function update(dt) {
  if (state.paused) return;

  updateTimer(dt);
  if (!state.running) return;

  chooseBestBluePlayer();
  controlHuman(dt);
  updateBlueAI(dt);
  updateRedAI(dt);

  const everyone = [...blue, ...red];

  for (let i = 0; i < everyone.length; i++) {
    for (let j = i + 1; j < everyone.length; j++) {
      resolvePlayerCollision(everyone[i], everyone[j]);
    }
  }

  everyone.forEach(collideBallWithPlayer);
  updateBall(dt);
}

function drawField() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#248c46";
  ctx.fillRect(0, 0, W, H);

  for (let y = 0; y < H; y += 110) {
    ctx.fillStyle = (Math.floor(y / 110) % 2 === 0)
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

function drawGoal(y, top) {
  const x = W / 2 - FIELD.goalWidth / 2;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.7)";
  ctx.lineWidth = 5;

  if (top) {
    ctx.strokeRect(x, y - FIELD.goalDepth, FIELD.goalWidth, FIELD.goalDepth);
  } else {
    ctx.strokeRect(x, y, FIELD.goalWidth, FIELD.goalDepth);
  }

  ctx.restore();
}

function drawPlayer(p) {
  ctx.save();

  if (p.controlled) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 12, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 8;
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
  ctx.font = "900 24px sans-serif";
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
  ctx.arc(ball.x, ball.y, 8, 0, Math.PI * 2);
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

  if (state.running) requestAnimationFrame(loop);
}

window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();
  if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(key)) {
    e.preventDefault();
    state.keys[key] = true;
  }
});

window.addEventListener("keyup", e => {
  state.keys[e.key.toLowerCase()] = false;
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
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
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

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

setupJoystick();
resetPositions();
draw();
