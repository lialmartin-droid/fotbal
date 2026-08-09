(() => {
"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const mini = document.getElementById("miniMap");
const mctx = mini.getContext("2d");

const el = id => document.getElementById(id);
const playerScoreEl = el("playerScore");
const aiScoreEl = el("aiScore");
const timerEl = el("timer");
const startOverlay = el("startOverlay");
const endOverlay = el("endOverlay");
const resultTitle = el("resultTitle");
const resultText = el("resultText");
const message = el("message");
const startBtn = el("startBtn");
const restartBtn = el("restartBtn");
const pauseBtn = el("pauseBtn");
const joystick = el("joystick");
const stick = el("stick");
const kickBtn = el("kickBtn");
const switchBtn = el("switchBtn");
const difficultyEl = el("difficulty");
const matchLengthEl = el("matchLength");

const W = canvas.width, H = canvas.height;
const FIELD = {left:68,right:W-68,top:55,bottom:H-55,goalDepth:58,goalHeight:210};
const GOAL_TOP = H/2-FIELD.goalHeight/2;
const GOAL_BOTTOM = H/2+FIELD.goalHeight/2;

const state = {
  running:false, paused:false, lastTime:0, time:120, blueScore:0, redScore:0,
  joyX:0, joyY:0, keys:Object.create(null), activeBlue:0, frameId:null,
  possession:null,lastTouchTeam:"blue",kickChargeStart:null,kickCooldown:0,stealCooldown:0,
  restartTimer:null
};

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function norm(x,y){const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d}}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

function makePlayer(x,y,team,number,controlled=false,keeper=false){
  return {x,y,homeX:x,homeY:y,team,number,controlled,keeper,r:keeper?31:27,
    speed:controlled?385:(keeper?265:285),vx:0,vy:0,facingX:team==="blue"?1:-1,facingY:0,
    color:team==="blue"?"#1676e8":"#ef4b43"};
}

const blue=[
  makePlayer(W*.26,H*.50,"blue",10,true),
  makePlayer(W*.20,H*.28,"blue",7),
  makePlayer(W*.44,H*.54,"blue",11),
  makePlayer(FIELD.left+38,H/2,"blue",1,false,true)
];

const red=[
  makePlayer(W*.73,H*.32,"red",8),
  makePlayer(W*.72,H*.68,"red",6),
  makePlayer(W*.56,H*.44,"red",9),
  makePlayer(FIELD.right-38,H/2,"red",1,false,true)
];

const ball={x:W/2,y:H/2,r:15,vx:0,vy:0,friction:.989,maxSpeed:980};

function fieldClampPlayer(p){
  p.x=clamp(p.x,FIELD.left+p.r,FIELD.right-p.r);
  p.y=clamp(p.y,FIELD.top+p.r,FIELD.bottom-p.r);
}

function resetPositions(){
  const bp=[[W*.26,H*.50],[W*.20,H*.28],[W*.44,H*.54],[FIELD.left+38,H/2]];
  const rp=[[W*.73,H*.32],[W*.72,H*.68],[W*.56,H*.44],[FIELD.right-38,H/2]];
  blue.forEach((p,i)=>{p.x=p.homeX=bp[i][0];p.y=p.homeY=bp[i][1];p.vx=p.vy=0;p.facingX=1;p.facingY=0;p.controlled=i===0;p.speed=i===0?385:(p.keeper?265:285)});
  red.forEach((p,i)=>{p.x=p.homeX=rp[i][0];p.y=p.homeY=rp[i][1];p.vx=p.vy=0;p.facingX=-1;p.facingY=0});
  state.activeBlue=0;state.possession=null;state.kickCooldown=0;state.stealCooldown=0;
  ball.x=W/2;ball.y=H/2;ball.vx=ball.vy=0;
}

function resetMatch(){
  clearTimeout(state.restartTimer);
  state.time=Number(matchLengthEl.value)||120;
  state.blueScore=state.redScore=0;
  state.paused=false;state.running=true;state.lastTouchTeam="blue";
  playerScoreEl.textContent="0";aiScoreEl.textContent="0";
  resetPositions();updateTimerText();
}

function startGame(){
  if(state.frameId)cancelAnimationFrame(state.frameId);
  resetMatch();startOverlay.classList.add("hidden");endOverlay.classList.add("hidden");
  state.lastTime=performance.now();state.frameId=requestAnimationFrame(loop);
}

function finishGame(){
  state.running=false;
  resultTitle.textContent=state.blueScore>state.redScore?"VÝHRA!":state.blueScore<state.redScore?"PROHRA":"REMÍZA";
  resultText.textContent=`Výsledek ${state.blueScore}:${state.redScore}`;
  endOverlay.classList.remove("hidden");
}

function updateTimerText(){
  const t=Math.max(0,Math.ceil(state.time));
  timerEl.textContent=`${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;
}

function showMessage(text,ms=700){
  message.textContent=text;message.classList.remove("hidden");
  clearTimeout(showMessage.t);showMessage.t=setTimeout(()=>message.classList.add("hidden"),ms);
}

function keyboardVector(){
  let x=0,y=0;
  if(state.keys.arrowleft||state.keys.a)x--;
  if(state.keys.arrowright||state.keys.d)x++;
  if(state.keys.arrowup||state.keys.w)y--;
  if(state.keys.arrowdown||state.keys.s)y++;
  return x||y?norm(x,y):{x:0,y:0};
}

function updateFacing(p){
  if(Math.hypot(p.vx,p.vy)>18){const n=norm(p.vx,p.vy);p.facingX=n.x;p.facingY=n.y}
}

function controlHuman(dt){
  const p=blue[state.activeBlue];
  let input=keyboardVector();
  if(!input.x&&!input.y&&(Math.abs(state.joyX)>.02||Math.abs(state.joyY)>.02))input=norm(state.joyX,state.joyY);
  p.vx=input.x*p.speed;p.vy=input.y*p.speed;
  p.x+=p.vx*dt;p.y+=p.vy*dt;updateFacing(p);fieldClampPlayer(p);
}

function moveAI(p,tx,ty,dt,speed){
  const d=norm(tx-p.x,ty-p.y);
  if(Math.hypot(tx-p.x,ty-p.y)<12){p.vx*=.5;p.vy*=.5}
  else{p.vx=d.x*speed;p.vy=d.y*speed}
  p.x+=p.vx*dt;p.y+=p.vy*dt;updateFacing(p);fieldClampPlayer(p);
}

function nearestIndex(team,target){
  let idx=0,best=Infinity;
  team.forEach((p,i)=>{if(p.keeper)return;const d=dist(p,target);if(d<best){best=d;idx=i}});
  return idx;
}

function switchPlayer(){
  if(!state.running||state.paused)return;
  const current=state.activeBlue;
  const choices=blue.map((p,i)=>({p,i})).filter(o=>o.i!==current&&!o.p.keeper);
  choices.sort((a,b)=>dist(a.p,state.possession&&state.possession.team==="red"?state.possession:ball)-dist(b.p,state.possession&&state.possession.team==="red"?state.possession:ball));
  if(!choices.length)return;
  blue[current].controlled=false;blue[current].speed=285;
  state.activeBlue=choices[0].i;
  blue[state.activeBlue].controlled=true;blue[state.activeBlue].speed=385;
}


function keeperClear(p){
  if(state.possession!==p || state.kickCooldown>0) return;

  const mates=(p.team==="blue"?blue:red).filter(t=>t!==p && !t.keeper);
  const forwardSign=p.team==="blue"?1:-1;

  // Prefer the most advanced teammate, but only in the forward direction.
  let target=null;
  let best=-Infinity;

  mates.forEach(t=>{
    const forward=(t.x-p.x)*forwardSign;
    if(forward<70) return;

    const centralBonus=220-Math.abs(t.y-H/2);
    const score=forward*1.15+centralBonus*.28;

    if(score>best){
      best=score;
      target=t;
    }
  });

  let dir;
  if(target){
    dir=norm(target.x-p.x,target.y-p.y);
  }else{
    // Safety clear: always away from own goal and slightly toward centre.
    dir=norm(forwardSign, (H/2-p.y)*0.0025);
  }

  clearPossession();

  const power=690;
  ball.x=p.x+dir.x*(p.r+ball.r+12);
  ball.y=p.y+dir.y*(p.r+ball.r+12);
  ball.vx=dir.x*power;
  ball.vy=dir.y*power;

  state.lastTouchTeam=p.team;
  state.kickCooldown=.32;
  state.stealCooldown=.25;
}

function updateBlueAI(dt){
  const holder=state.possession;
  blue.forEach((p,i)=>{
    if(i===state.activeBlue)return;
    if(p.keeper){
      if(holder===p){
        // Brankář už míč nedrží – po krátkém získání okamžitě rozehraje dopředu.
        keeperClear(p);
      }else{
        let ty=clamp(ball.y,GOAL_TOP+35,GOAL_BOTTOM-35);
        moveAI(p,FIELD.left+42,ty,dt,245);
      }
      return;
    }
    if(holder===p){
      moveAI(p,FIELD.right-170,clamp(H/2+(p.y-H/2)*.4,FIELD.top+80,FIELD.bottom-80),dt,300);
      if(p.x>W*.74&&Math.abs(p.y-H/2)<190&&state.kickCooldown<=0)aiKick(p,true);
      return;
    }
    if(holder&&holder.team==="blue"){
      const lane=p.number===7?-1:1;
      moveAI(p,clamp(holder.x+180,FIELD.left+130,FIELD.right-170),clamp(H/2+lane*155,FIELD.top+80,FIELD.bottom-80),dt,270);
    }else{
      const chase=nearestIndex(blue,ball);
      if(i===chase&&!holder)moveAI(p,ball.x,ball.y,dt,280);
      else moveAI(p,p.homeX,p.homeY,dt,245);
    }
  });
}

function diffSpeed(){return difficultyEl.value==="easy"?245:difficultyEl.value==="hard"?320:285}

function updateRedAI(dt){
  const holder=state.possession;
  red.forEach((p,i)=>{
    if(p.keeper){
      if(holder===p){
        keeperClear(p);
      }else{
        const ty=clamp(ball.y,GOAL_TOP+35,GOAL_BOTTOM-35);
        moveAI(p,FIELD.right-42,ty,dt,diffSpeed()-20);
      }
      return;
    }
    if(holder&&holder.team==="red"){
      if(holder===p){
        moveAI(p,FIELD.left+170,clamp(H/2+(p.y-H/2)*.4,FIELD.top+80,FIELD.bottom-80),dt,diffSpeed()+15);
        if(p.x<W*.27&&Math.abs(p.y-H/2)<190&&state.kickCooldown<=0)aiKick(p,true);
      }else{
        const lane=p.number===8?-1:1;
        moveAI(p,clamp(holder.x-170,FIELD.left+170,FIELD.right-130),clamp(H/2+lane*155,FIELD.top+80,FIELD.bottom-80),dt,diffSpeed()-20);
      }
      return;
    }
    if(holder&&holder.team==="blue"){
      const presser=nearestIndex(red,holder);
      if(i===presser)moveAI(p,holder.x,holder.y,dt,diffSpeed()+10);
      else moveAI(p,clamp(holder.x+150,W*.52,FIELD.right-120),p.homeY,dt,diffSpeed()-25);
    }else{
      const presser=nearestIndex(red,ball);
      if(i===presser)moveAI(p,ball.x,ball.y,dt,diffSpeed());
      else moveAI(p,p.homeX,p.homeY,dt,diffSpeed()-35);
    }
  });
}

function resolvePlayerCollision(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.r+b.r+5;
  if(d>0&&d<min){
    const n=norm(dx,dy),o=min-d;
    a.x-=n.x*o*.5;a.y-=n.y*o*.5;b.x+=n.x*o*.5;b.y+=n.y*o*.5;
    fieldClampPlayer(a);fieldClampPlayer(b);
  }
}

function setPossession(p){
  state.possession=p;state.lastTouchTeam=p.team;ball.vx=ball.vy=0;
}
function clearPossession(){state.possession=null}

function updatePossessionBall(){
  const p=state.possession;if(!p)return;
  const gap=p.r+ball.r+5;
  ball.x=p.x+p.facingX*gap;ball.y=p.y+p.facingY*gap;
  ball.vx=p.vx;ball.vy=p.vy;
  checkOut();
}

function tryAcquire(){
  if(state.possession||state.kickCooldown>0)return;
  let cand=null,best=Infinity;
  [...blue,...red].forEach(p=>{const d=dist(p,ball);if(d<p.r+ball.r+8&&d<best){cand=p;best=d}});
  if(cand)setPossession(cand);
}

function trySteal(){
  if(!state.possession||state.stealCooldown>0)return;
  const h=state.possession,opps=h.team==="blue"?red:blue;
  let n=null,b=Infinity;opps.forEach(p=>{const d=dist(p,h);if(d<b){b=d;n=p}});
  if(n&&b<h.r+n.r+3){setPossession(n);state.stealCooldown=.55}
}

function findForwardPassTarget(p){
  const mates=p.team==="blue"?blue:red;
  let best=null,score=-Infinity;
  mates.forEach(t=>{
    if(t===p||t.keeper)return;
    const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy);
    if(d<70||d>430)return;
    const forward=p.team==="blue"?dx>35:dx<-35;
    if(!forward)return; // nikdy dozadu
    const dir=norm(dx,dy),facing=dir.x*p.facingX+dir.y*p.facingY;
    const advance=p.team==="blue"?dx:-dx;
    const s=advance*.9+facing*110-d*.08;
    if(s>score){score=s;best=t}
  });
  return best;
}

function kickFromPlayer(p,held){
  if(state.possession!==p||state.kickCooldown>0)return;
  const strong=held>.42;
  let dir;
  if(strong){
    const goalX=p.team==="blue"?FIELD.right+20:FIELD.left-20;
    dir=norm(goalX-p.x,H/2-p.y);
  }else{
    const target=findForwardPassTarget(p);
    dir=target?norm(target.x-p.x,target.y-p.y):norm(p.facingX,p.facingY);
    // Pokud hráč kouká dozadu, krátký kop přesto pošleme dopředu.
    if(p.team==="blue"&&dir.x<.15)dir=norm(1,dir.y*.35);
    if(p.team==="red"&&dir.x>-.15)dir=norm(-1,dir.y*.35);
  }
  clearPossession();
  const power=strong?Math.min(960,690+held*220):500;
  ball.x=p.x+dir.x*(p.r+ball.r+8);ball.y=p.y+dir.y*(p.r+ball.r+8);
  ball.vx=dir.x*power;ball.vy=dir.y*power;state.lastTouchTeam=p.team;state.kickCooldown=.22;state.stealCooldown=.2;
}

function aiKick(p,strong){
  if(state.possession!==p||state.kickCooldown>0)return;
  const goalX=p.team==="blue"?FIELD.right+20:FIELD.left-20;
  const dir=strong?norm(goalX-p.x,H/2-p.y):(findForwardPassTarget(p)?norm(findForwardPassTarget(p).x-p.x,findForwardPassTarget(p).y-p.y):norm(p.team==="blue"?1:-1,0));
  clearPossession();ball.x=p.x+dir.x*(p.r+ball.r+8);ball.y=p.y+dir.y*(p.r+ball.r+8);
  const pow=strong?740:470;ball.vx=dir.x*pow;ball.vy=dir.y*pow;state.lastTouchTeam=p.team;state.kickCooldown=.25;state.stealCooldown=.2;
}

function updateFreeBall(dt){
  ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
  ball.vx*=Math.pow(ball.friction,dt*60);ball.vy*=Math.pow(ball.friction,dt*60);
  if(Math.hypot(ball.vx,ball.vy)<16)ball.vx=ball.vy=0;
  checkOut();
}

function restartPlay(type,team,x,y){
  if(state.paused||!state.running)return;
  state.paused=true;clearPossession();ball.vx=ball.vy=0;showMessage(type,620);
  state.restartTimer=setTimeout(()=>{
    if(!state.running)return;
    ball.x=clamp(x,FIELD.left+90,FIELD.right-90);ball.y=clamp(y,FIELD.top+80,FIELD.bottom-80);
    const candidates=(team==="blue"?blue:red).filter(p=>!p.keeper);
    candidates.sort((a,b)=>dist(a,ball)-dist(b,ball));
    const r=candidates[0];
    r.x=clamp(ball.x+(team==="blue"?-55:55),FIELD.left+70,FIELD.right-70);
    r.y=clamp(ball.y,FIELD.top+70,FIELD.bottom-70);
    setPossession(r);state.stealCooldown=.75;state.paused=false;
  },650);
}

function score(team){
  if(state.paused)return;state.paused=true;clearPossession();
  if(team==="blue"){state.blueScore++;playerScoreEl.textContent=state.blueScore;showMessage("GÓL!",850)}
  else{state.redScore++;aiScoreEl.textContent=state.redScore;showMessage("GÓL SOUPEŘE",850)}
  state.restartTimer=setTimeout(()=>{if(!state.running)return;resetPositions();state.paused=false},900);
}

function checkOut(){
  const inGoal=ball.y>GOAL_TOP&&ball.y<GOAL_BOTTOM;
  if(ball.x>FIELD.right){
    if(inGoal){score("blue");return true}
    const team=state.lastTouchTeam==="blue"?"red":"blue";restartPlay("AUT",team,FIELD.right,ball.y);return true;
  }
  if(ball.x<FIELD.left){
    if(inGoal){score("red");return true}
    const team=state.lastTouchTeam==="blue"?"red":"blue";restartPlay("AUT",team,FIELD.left,ball.y);return true;
  }
  if(ball.y<FIELD.top||ball.y>FIELD.bottom){
    const team=state.lastTouchTeam==="blue"?"red":"blue";
    restartPlay("AUT",team,ball.x,ball.y<FIELD.top?FIELD.top:FIELD.bottom);return true;
  }
  return false;
}

function update(dt){
  if(state.paused)return;
  state.time-=dt;updateTimerText();if(state.time<=0){state.time=0;finishGame();return}
  state.kickCooldown=Math.max(0,state.kickCooldown-dt);state.stealCooldown=Math.max(0,state.stealCooldown-dt);
  controlHuman(dt);updateBlueAI(dt);updateRedAI(dt);

  const all=[...blue,...red];
  for(let pass=0;pass<2;pass++)for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)resolvePlayerCollision(all[i],all[j]);

  if(state.possession){trySteal();updatePossessionBall()}
  else{updateFreeBall(dt);tryAcquire()}

  if(state.possession&&state.possession.team==="red"&&!state.possession.keeper&&state.kickCooldown<=0){
    const p=state.possession;
    if(Math.random()<.008)aiKick(p,false);
  }
}


function drawGoalNet(goalX,leftSide){
  const depth=FIELD.goalDepth;
  const top=GOAL_TOP;
  const height=FIELD.goalHeight;
  const outerX=leftSide?goalX-depth:goalX;

  ctx.save();

  // Bílé konstrukce branky.
  ctx.strokeStyle="rgba(250,255,250,.95)";
  ctx.lineWidth=4;
  ctx.strokeRect(outerX,top,depth,height);

  // Síť.
  ctx.strokeStyle="rgba(235,245,235,.55)";
  ctx.lineWidth=1.4;

  for(let yy=top+18;yy<top+height;yy+=18){
    ctx.beginPath();
    ctx.moveTo(outerX,yy);
    ctx.lineTo(outerX+depth,yy);
    ctx.stroke();
  }

  for(let xx=outerX+10;xx<outerX+depth;xx+=10){
    ctx.beginPath();
    ctx.moveTo(xx,top);
    ctx.lineTo(xx,top+height);
    ctx.stroke();
  }

  ctx.restore();
}

function drawField(){
  ctx.clearRect(0,0,W,H);

  // Trávník – jemná textura a svislé pruhy jako v návrhu.
  ctx.fillStyle="#339d2f";
  ctx.fillRect(0,0,W,H);

  const stripeW=95;
  for(let x=0;x<W;x+=stripeW){
    ctx.fillStyle=(Math.floor(x/stripeW)%2===0)
      ?"rgba(255,255,255,.038)"
      :"rgba(0,0,0,.035)";
    ctx.fillRect(x,0,stripeW,H);
  }

  // Jemná textura trávy.
  ctx.save();
  ctx.globalAlpha=.07;
  ctx.fillStyle="#d9ffbf";
  for(let y=18;y<H;y+=34){
    for(let x=22;x<W;x+=47){
      const off=((y/34)%2)*11;
      ctx.fillRect(x+off,y,2,7);
    }
  }
  ctx.restore();

  ctx.strokeStyle="rgba(245,255,244,.96)";
  ctx.lineWidth=5;
  ctx.strokeRect(FIELD.left,FIELD.top,FIELD.right-FIELD.left,FIELD.bottom-FIELD.top);

  // Středová čára a kruh.
  ctx.beginPath();
  ctx.moveTo(W/2,FIELD.top);
  ctx.lineTo(W/2,FIELD.bottom);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W/2,H/2,92,0,Math.PI*2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W/2,H/2,5,0,Math.PI*2);
  ctx.fillStyle="#f7fff7";
  ctx.fill();

  const boxW=160,boxH=330;
  ctx.strokeRect(FIELD.left,H/2-boxH/2,boxW,boxH);
  ctx.strokeRect(FIELD.right-boxW,H/2-boxH/2,boxW,boxH);

  // Menší brankoviště.
  const sixW=72,sixH=160;
  ctx.strokeRect(FIELD.left,H/2-sixH/2,sixW,sixH);
  ctx.strokeRect(FIELD.right-sixW,H/2-sixH/2,sixW,sixH);

  drawGoalNet(FIELD.left,true);
  drawGoalNet(FIELD.right,false);
}

function drawPlayer(p){
  ctx.save();

  // Aktivní hráč – žlutý kroužek.
  if(p.controlled){
    ctx.beginPath();
    ctx.ellipse(p.x,p.y+p.r*.72,p.r+12,p.r*.56,0,0,Math.PI*2);
    ctx.strokeStyle="#ffd426";
    ctx.lineWidth=6;
    ctx.stroke();
  }

  // Stín pod postavou.
  ctx.beginPath();
  ctx.ellipse(p.x+4,p.y+p.r*.78,p.r*.72,p.r*.34,0,0,Math.PI*2);
  ctx.fillStyle="rgba(0,0,0,.28)";
  ctx.fill();

  const teamColor=p.keeper
    ?(p.team==="blue"?"#185da8":"#8b2019")
    :p.color;

  // Nohy.
  ctx.strokeStyle="#141414";
  ctx.lineWidth=7;
  ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(p.x-8,p.y+12);
  ctx.lineTo(p.x-12,p.y+25);
  ctx.moveTo(p.x+8,p.y+12);
  ctx.lineTo(p.x+12,p.y+25);
  ctx.stroke();

  // Kopačky.
  ctx.strokeStyle="#080808";
  ctx.lineWidth=6;
  ctx.beginPath();
  ctx.moveTo(p.x-14,p.y+26);
  ctx.lineTo(p.x-7,p.y+27);
  ctx.moveTo(p.x+8,p.y+27);
  ctx.lineTo(p.x+15,p.y+26);
  ctx.stroke();

  // Ruce.
  ctx.strokeStyle="#d6a16e";
  ctx.lineWidth=7;
  ctx.beginPath();
  ctx.moveTo(p.x-13,p.y-2);
  ctx.lineTo(p.x-22,p.y+8);
  ctx.moveTo(p.x+13,p.y-2);
  ctx.lineTo(p.x+22,p.y+8);
  ctx.stroke();

  // Trup / dres.
  ctx.beginPath();
  ctx.roundRect(p.x-16,p.y-13,32,35,9);
  ctx.fillStyle=teamColor;
  ctx.fill();

  // Černé trenýrky.
  ctx.fillStyle="#111";
  ctx.fillRect(p.x-14,p.y+13,28,10);

  // Hlava.
  ctx.beginPath();
  ctx.arc(p.x,p.y-23,10,0,Math.PI*2);
  ctx.fillStyle="#d7a16d";
  ctx.fill();

  // Vlasy.
  ctx.beginPath();
  ctx.arc(p.x,p.y-26,10,Math.PI,Math.PI*2);
  ctx.fillStyle="#111";
  ctx.fill();

  // Číslo.
  ctx.fillStyle="#fff";
  ctx.font="900 16px sans-serif";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText(p.number,p.x,p.y+1);

  // Směrová šipka jen u právě ovládaného hráče s míčem.
  if(p.controlled && state.possession===p){
    const sx=p.x+p.facingX*46;
    const sy=p.y+p.facingY*46;
    ctx.strokeStyle="#ffd426";
    ctx.fillStyle="#ffd426";
    ctx.lineWidth=5;

    ctx.beginPath();
    ctx.moveTo(sx,sy);
    ctx.lineTo(sx+p.facingX*34,sy+p.facingY*34);
    ctx.stroke();

    const px=-p.facingY,py=p.facingX;
    const ex=sx+p.facingX*38,ey=sy+p.facingY*38;
    ctx.beginPath();
    ctx.moveTo(ex+p.facingX*10,ey+p.facingY*10);
    ctx.lineTo(ex-p.facingX*8+px*9,ey-p.facingY*8+py*9);
    ctx.lineTo(ex-p.facingX*8-px*9,ey-p.facingY*8-py*9);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawBall(){
  ctx.save();

  // Stín.
  ctx.beginPath();
  ctx.ellipse(ball.x+3,ball.y+5,ball.r*.95,ball.r*.58,0,0,Math.PI*2);
  ctx.fillStyle="rgba(0,0,0,.28)";
  ctx.fill();

  // Míč.
  ctx.beginPath();
  ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);
  ctx.fillStyle="#fff";
  ctx.fill();
  ctx.strokeStyle="#151515";
  ctx.lineWidth=2.6;
  ctx.stroke();

  // Jednoduchý fotbalový vzor.
  ctx.beginPath();
  ctx.arc(ball.x,ball.y,5,0,Math.PI*2);
  ctx.fillStyle="#111";
  ctx.fill();

  for(let i=0;i<5;i++){
    const a=-Math.PI/2+i*(Math.PI*2/5);
    const cx=ball.x+Math.cos(a)*9;
    const cy=ball.y+Math.sin(a)*9;
    ctx.beginPath();
    ctx.arc(cx,cy,2.8,0,Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

function drawMini(){
  const mw=mini.width,mh=mini.height;
  mctx.clearRect(0,0,mw,mh);mctx.fillStyle="#207b29";mctx.fillRect(0,0,mw,mh);
  mctx.strokeStyle="#fff";mctx.lineWidth=2;mctx.strokeRect(4,4,mw-8,mh-8);
  mctx.beginPath();mctx.moveTo(mw/2,4);mctx.lineTo(mw/2,mh-4);mctx.stroke();
  const sx=mw/W,sy=mh/H;
  [...blue,...red].forEach(p=>{mctx.beginPath();mctx.arc(p.x*sx,p.y*sy,5,0,Math.PI*2);mctx.fillStyle=p.team==="blue"?"#1f86ff":"#ed5148";mctx.fill()});
  mctx.beginPath();mctx.arc(ball.x*sx,ball.y*sy,3,0,Math.PI*2);mctx.fillStyle="#fff";mctx.fill();
}

function draw(){drawField();blue.forEach(drawPlayer);red.forEach(drawPlayer);drawBall();drawMini()}

function loop(now){
  if(!state.running)return;
  const dt=Math.min((now-state.lastTime)/1000,.033);state.lastTime=now;
  if(!state.paused)update(dt);draw();
  if(state.running)state.frameId=requestAnimationFrame(loop);
}

function beginKick(){
  if(!state.running||state.paused)return;
  const p=blue[state.activeBlue];
  if(state.possession!==p)return;
  state.kickChargeStart=performance.now();kickBtn.classList.add("charging");
}
function endKick(){
  if(state.kickChargeStart===null)return;
  const held=(performance.now()-state.kickChargeStart)/1000;state.kickChargeStart=null;kickBtn.classList.remove("charging");
  kickFromPlayer(blue[state.activeBlue],held);
}

window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(!state.running&&(k==="enter"||k===" ")){e.preventDefault();startGame();return}
  if(["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(k)){e.preventDefault();state.keys[k]=true}
  if(k==="q"&&state.running&&!e.repeat){e.preventDefault();switchPlayer()}
  if(k===" "&&state.running&&!e.repeat){e.preventDefault();beginKick()}
});
window.addEventListener("keyup",e=>{const k=e.key.toLowerCase();state.keys[k]=false;if(k===" "){e.preventDefault();endKick()}});

function setupJoystick(){
  let pointer=null;const max=48;
  function move(e){
    const r=joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    let dx=e.clientX-cx,dy=e.clientY-cy,d=Math.hypot(dx,dy);
    if(d>max){dx=dx/d*max;dy=dy/d*max}
    state.joyX=dx/max;state.joyY=dy/max;stick.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
  }
  joystick.addEventListener("pointerdown",e=>{pointer=e.pointerId;joystick.setPointerCapture(pointer);move(e)});
  joystick.addEventListener("pointermove",e=>{if(e.pointerId===pointer)move(e)});
  function end(e){if(e.pointerId!==pointer)return;pointer=null;state.joyX=state.joyY=0;stick.style.transform="translate(-50%,-50%)"}
  joystick.addEventListener("pointerup",end);joystick.addEventListener("pointercancel",end);
}

pauseBtn.addEventListener("click",()=>{if(!state.running)return;state.paused=!state.paused;pauseBtn.textContent=state.paused?"▶":"Ⅱ"});
startBtn.addEventListener("click",startGame);restartBtn.addEventListener("click",startGame);
switchBtn.addEventListener("pointerdown",e=>{e.preventDefault();switchPlayer()});
kickBtn.addEventListener("pointerdown",e=>{e.preventDefault();beginKick()});
kickBtn.addEventListener("pointerup",e=>{e.preventDefault();endKick()});
kickBtn.addEventListener("pointercancel",()=>{state.kickChargeStart=null;kickBtn.classList.remove("charging")});
setupJoystick();resetPositions();draw();
})();
