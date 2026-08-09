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
  restartTimer: null
};

function makePlayer(x, y, team, number, controlled = false) {
  return {
    x, y, homeX: x, homeY: y,
    team, number, controlled,
    r: 32,
    speed: controlled ? 390 : 305,
    vx: 0, vy: 0,
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
  r: 21,
  vx: 0,
  vy: 0,
  friction: .984,
  maxSpeed: 790
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
    p.controlled = i === 0;
    p.speed = i === 0 ? 390 : 305;
  });

  red.forEach((p, i) => {
    p.x = p.homeX = rp[i][0];
    p.y = p.homeY = rp[i][1];
    p.vx = p.vy = 0;
  });

  state.activeBlue = 0;
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
  state.lastTouchTeam = "blue";
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
  keepPlayerInField(p);
}

function chooseBestBluePlayer() {
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

  if (nearest !== state.activeBlue && best + 135 < currentD) {
    blue[state.activeBlue].controlled = false;
    blue[state.activeBlue].speed = 305;
    state.activeBlue = nearest;
    blue[state.activeBlue].controlled = true;
    blue[state.activeBlue].speed = 390;
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
  keepPlayerInField(p);
}

function updateBlueAI(dt) {
  const active = blue[state.activeBlue];

  // Pouze jeden spoluhráč smí aktivně napadat míč.
  let supportIndex = -1;
  let supportDist = Infinity;

  blue.forEach((p, i) => {
    if (i === state.activeBlue) return;
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (d < supportDist) {
      supportDist = d;
      supportIndex = i;
    }
  });

  blue.forEach((p, i) => {
    if (i === state.activeBlue) return;

    const side = p.homeX < W / 2 ? -1 : 1;
    let tx = p.homeX;
    let ty = p.homeY;

    const activeD = Math.hypot(ball.x - active.x, ball.y - active.y);

    if (i === supportIndex && supportDist + 150 < activeD) {
      tx = ball.x;
      ty = ball.y;
    } else if (ball.y < H * .62) {
      tx = clamp(W / 2 + side * 190, FIELD.left + 90, FIELD.right - 90);
      ty = clamp(ball.y + 180, H * .44, H * .70);
    }

    moveAI(p, tx, ty, dt, 280);
  });
}

function updateRedAI(dt) {
  let presser = 0;
  let best = Infinity;

  red.forEach((p, i) => {
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (d < best) {
      best = d;
      presser = i;
    }
  });

  red.forEach((p, i) => {
    const side = p.homeX < W / 2 ? -1 : 1;
    let tx, ty;

    if (i === presser) {
      tx = ball.x;
      ty = ball.y;
    } else {
      // Ostatní drží rozestupy místo tlačenice.
      tx = clamp(W / 2 + side * 185, FIELD.left + 90, FIELD.right - 90);
      ty = clamp(ball.y - 210, H * .23, H * .52);
    }

    moveAI(p, tx, ty, dt, i === presser ? 310 : 265);
  });
}

function resolvePlayerCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.r + b.r;

  if (d > 0 && d < minD) {
    const n = norm(dx, dy);
    const overlap = minD - d;

    // Menší posun než předtím => hráči se méně "zamknou".
    a.x -= n.x * overlap * .38;
    a.y -= n.y * overlap * .38;
    b.x += n.x * overlap * .38;
    b.y += n.y * overlap * .38;

    a.vx *= .82;
    a.vy *= .82;
    b.vx *= .82;
    b.vy *= .82;

    keepPlayerInField(a);
    keepPlayerInField(b);
  }
}

function collideBallWithPlayer(p) {
  const dx = ball.x - p.x;
  const dy = ball.y - p.y;
  const d = Math.hypot(dx, dy);
  const minD = ball.r + p.r;

  if (d > 0 && d < minD) {
    state.lastTouchTeam = p.team;

    const n = norm(dx, dy);
    const overlap = minD - d;
    ball.x += n.x * (overlap + 2);
    ball.y += n.y * (overlap + 2);

    const playerSpeed = Math.hypot(p.vx, p.vy);

    if (playerSpeed > 45) {
      // Klíčová změna: směr míče se nastaví podle pohybu hráče,
      // takže jde míč z rohu/tlačenice opravdu vyvést.
      const move = norm(p.vx, p.vy);
      const power = p.controlled ? 455 : 390;

      ball.vx = ball.vx * .20 + move.x * power + n.x * 60;
      ball.vy = ball.vy * .20 + move.y * power + n.y * 60;
    } else {
      ball.vx += n.x * 115;
      ball.vy += n.y * 115;
    }

    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > ball.maxSpeed) {
      ball.vx = ball.vx / speed * ball.maxSpeed;
      ball.vy = ball.vy / speed * ball.maxSpeed;
    }
  }
}

function restartPlay(type, team, x, y) {
  if (state.paused || !state.running) return;

  state.paused = true;
  ball.vx = 0;
  ball.vy = 0;

  showMessage(type, 700);

  state.restartTimer = setTimeout(() => {
    if (!state.running) return;

    // Položíme míč vždy trochu dovnitř hřiště, aby se okamžitě znovu nezasekl.
    ball.x = clamp(x, FIELD.left + 70, FIELD.right - 70);
    ball.y = clamp(y, FIELD.top + 85, FIELD.bottom - 85);

    // Malý automatický rozehrávací impulz do hřiště.
    if (type === "AUT") {
      const fromLeft = x <= FIELD.left + 10;
      ball.vx = fromLeft ? 155 : -155;
      ball.vy = team === "blue" ? -35 : 35;
    } else if (type === "ROH") {
      ball.vx = x < W / 2 ? 130 : -130;
      ball.vy = team === "blue" ? -165 : 165;
    } else {
      ball.vx = 0;
      ball.vy = team === "blue" ? -150 : 150;
    }

    state.lastTouchTeam = team;
    state.paused = false;
  }, 720);
}

function score(team) {
  if (state.paused) return;
  state.paused = true;

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

function updateBall(dt) {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  ball.vx *= Math.pow(ball.friction, dt * 60);
  ball.vy *= Math.pow(ball.friction, dt * 60);

  const goalL = W / 2 - FIELD.goalWidth / 2;
  const goalR = W / 2 + FIELD.goalWidth / 2;
  const inGoalMouth = ball.x > goalL && ball.x < goalR;

  // AUTY - už žádné odrážení od bočních zdí.
  if (ball.x + ball.r < FIELD.left) {
    const team = state.lastTouchTeam === "blue" ? "red" : "blue";
    restartPlay("AUT", team, FIELD.left, ball.y);
    return;
  }

  if (ball.x - ball.r > FIELD.right) {
    const team = state.lastTouchTeam === "blue" ? "red" : "blue";
    restartPlay("AUT", team, FIELD.right, ball.y);
    return;
  }

  // Branková čára.
  if (ball.y + ball.r < FIELD.top) {
    if (inGoalMouth) {
      score("blue");
      return;
    }

    // Pokud se poslední dotkl obránce, je roh. Jinak odkop od brány.
    if (state.lastTouchTeam === "red") {
      restartPlay("ROH", "blue", ball.x < W/2 ? FIELD.left : FIELD.right, FIELD.top);
    } else {
      restartPlay("ODKOP", "red", W / 2, FIELD.top + 145);
    }
    return;
  }

  if (ball.y - ball.r > FIELD.bottom) {
    if (inGoalMouth) {
      score("red");
      return;
    }

    if (state.lastTouchTeam === "blue") {
      restartPlay("ROH", "red", ball.x < W/2 ? FIELD.left : FIELD.right, FIELD.bottom);
    } else {
      restartPlay("ODKOP", "blue", W / 2, FIELD.bottom - 145);
    }
  }
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
    ctx.arc(p.x, p.y, p.r + 11, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 7;
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
  ctx.font = "900 22px sans-serif";
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

window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();

  if (
    !state.running &&
    (key === "enter" || key === " ")
  ) {
    e.preventDefault();
    startGame();
    return;
  }

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

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

setupJoystick();
resetPositions();
draw();

})();
