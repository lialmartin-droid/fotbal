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
const menuBtn = el("menuBtn");
const secondHalfBtn = el("secondHalfBtn");
const halfOverlay = el("halfOverlay");
const halfTitle = el("halfTitle");
const halfText = el("halfText");
const groupsOverlay = el("groupsOverlay");
const groupsGrid = el("groupsGrid");
const playGroupBtn = el("playGroupBtn");
const halfLabel = el("halfLabel");
const roundPill = el("roundPill");
const blueBadge = el("blueBadge");
const redBadge = el("redBadge");
const gameModeEl = el("gameMode");
const countrySelectEl = el("countrySelect");
const countryRow = el("countryRow");
const halfLengthEl = el("halfLength");
const tournamentInfoEl = el("tournamentInfo");
const tournamentProgressEl = el("tournamentProgress");
const pauseBtn = el("pauseBtn");
const joystick = el("joystick");
const stick = el("stick");
const kickBtn = el("kickBtn");
const switchBtn = el("switchBtn");
const difficultyEl = el("difficulty");

const W = canvas.width, H = canvas.height;
const FIELD = {left:68,right:W-68,top:55,bottom:H-55,goalDepth:58,goalHeight:210};
const GOAL_TOP = H/2-FIELD.goalHeight/2;
const GOAL_BOTTOM = H/2+FIELD.goalHeight/2;

const state = {
  running:false, paused:false, lastTime:0, time:120, halfLength:120, half:1, blueAttackRight:true,
  blueScore:0, redScore:0, joyX:0, joyY:0, keys:Object.create(null), activeBlue:0, frameId:null,
  possession:null,lastTouchTeam:"blue",kickChargeStart:null,kickCooldown:0,stealCooldown:0,
  keeperClearDelay:0,restartTimer:null,contestHold:0,contestOpponent:null, endAction:"restart"
};

const tournament = {
  active:false, phase:null, player:null, opponent:null,
  groups:[], playerGroupIndex:-1, groupMatchday:0,
  roundTeams:[], stageIndex:0, lastSummary:"", champion:false, eliminated:false
};

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function norm(x,y){const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d}}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

const COUNTRIES = [
  ["Česko","CZ",82],["Slovensko","SK",73],["Polsko","PL",80],["Německo","DE",90],["Rakousko","AT",79],["Švýcarsko","CH",84],["Francie","FR",94],["Španělsko","ES",94],
  ["Portugalsko","PT",91],["Itálie","IT",88],["Anglie","GB",93],["Nizozemsko","NL",91],["Belgie","BE",88],["Chorvatsko","HR",86],["Dánsko","DK",84],["Švédsko","SE",80],
  ["Norsko","NO",81],["Finsko","FI",70],["Island","IS",72],["Irsko","IE",72],["Skotsko","GB",78],["Wales","GB",75],["Ukrajina","UA",81],["Srbsko","RS",81],
  ["Slovinsko","SI",79],["Maďarsko","HU",78],["Rumunsko","RO",77],["Bulharsko","BG",69],["Řecko","GR",76],["Turecko","TR",84],["Gruzie","GE",78],["Albánie","AL",74],
  ["Brazílie","BR",95],["Argentina","AR",96],["Uruguay","UY",88],["Kolumbie","CO",87],["Chile","CL",79],["Peru","PE",74],["Ekvádor","EC",84],["Paraguay","PY",77],
  ["Mexiko","MX",84],["USA","US",83],["Kanada","CA",80],["Kostarika","CR",73],["Panama","PA",72],["Jamajka","JM",70],["Japonsko","JP",84],["Jižní Korea","KR",83],
  ["Austrálie","AU",79],["Nový Zéland","NZ",68],["Írán","IR",80],["Saúdská Arábie","SA",74],["Katar","QA",72],["Irák","IQ",70],["Maroko","MA",88],["Senegal","SN",84],
  ["Egypt","EG",81],["Alžírsko","DZ",82],["Tunisko","TN",77],["Nigérie","NG",83],["Ghana","GH",77],["Pobřeží slonoviny","CI",84],["Kamerun","CM",80],["Jihoafrická republika","ZA",72]
].map(([name,code,rating],id)=>({id,name,code,rating}));

const GROUP_NAMES="ABCDEFGHIJKLMNOP".split("");
const GROUP_SCHEDULE=[[[0,3],[1,2]],[[0,2],[3,1]],[[0,1],[2,3]]];
const KO_STAGES = [
  {teams:32,name:"Play-off – 32 týmů"},
  {teams:16,name:"Osmifinále"},
  {teams:8,name:"Čtvrtfinále"},
  {teams:4,name:"Semifinále"},
  {teams:2,name:"Finále"}
];

function flagEmoji(code){
  if(code.length!==2)return "🌍";
  return String.fromCodePoint(...code.toUpperCase().split("").map(c=>127397+c.charCodeAt()));
}
function teamLabel(country,fallback){return country?`${flagEmoji(country.code)} ${country.name}`:fallback}
function attacksRight(team){return team==="blue"?state.blueAttackRight:!state.blueAttackRight}
function attackSign(team){return attacksRight(team)?1:-1}
function attackGoalX(team){return attacksRight(team)?FIELD.right+12:FIELD.left-12}
function ownGoalIsLeft(team){return attacksRight(team)}
function mirrorX(x){return W-x}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}

function makeStanding(team){return {team,played:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}}
function standingSort(a,b){
  return b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf || b.w-a.w || b.team.rating-a.team.rating;
}
function rankedGroup(group){return [...group.standings].sort(standingSort)}
function playerGroup(){return tournament.groups[tournament.playerGroupIndex]||null}
function playerStanding(){
  const g=playerGroup();return g?g.standings.find(s=>s.team.id===tournament.player.id):null;
}
function currentStageName(){
  if(tournament.phase==="groups")return `Skupina ${GROUP_NAMES[tournament.playerGroupIndex]} – ${Math.min(3,tournament.groupMatchday+1)}. zápas`;
  const n=tournament.roundTeams.length||32;
  return (KO_STAGES.find(s=>s.teams===n)||{name:"Play-off"}).name;
}

function renderTournamentProgress(){
  tournamentProgressEl.innerHTML="";
  for(let i=0;i<6;i++){
    const dot=document.createElement("span");
    if(tournament.active||tournament.champion||tournament.eliminated){
      if(i<tournament.stageIndex)dot.className="done";
      else if(i===tournament.stageIndex&&!tournament.champion&&!tournament.eliminated)dot.className="current";
      else if(tournament.champion)dot.className="done";
    }
    tournamentProgressEl.appendChild(dot);
  }
}

function renderPlayerGroupTable(){
  const table=el("groupTable");
  if(!table)return;
  const g=playerGroup();
  if(!g||(!tournament.active&&!tournament.eliminated&&!tournament.champion)){table.innerHTML="";table.classList.add("hidden");return}
  const ranked=rankedGroup(g);
  table.classList.remove("hidden");
  table.innerHTML=`<div class="group-table-title">SKUPINA ${GROUP_NAMES[tournament.playerGroupIndex]}</div>
    <div class="group-row group-head"><span>Tým</span><b>Z</b><b>+/-</b><b>B</b></div>`+
    ranked.map((r,i)=>`<div class="group-row ${r.team.id===tournament.player.id?"me":""} ${i<2?"qualify":""}">
      <span>${i+1}. ${teamLabel(r.team,"")}</span><b>${r.played}</b><b>${r.gf-r.ga>=0?"+":""}${r.gf-r.ga}</b><b>${r.pts}</b></div>`).join("");
}

function renderAllGroups(){
  if(!groupsGrid)return;
  groupsGrid.innerHTML=tournament.groups.map((g,gi)=>{
    const ranked=rankedGroup(g);
    return `<section class="group-mini ${gi===tournament.playerGroupIndex?"my-group":""}">
      <h3>Skupina ${GROUP_NAMES[gi]}</h3>
      ${ranked.map((r,i)=>`<div class="group-mini-row ${r.team.id===tournament.player.id?"me":""}"><span>${i+1}. ${teamLabel(r.team,"")}</span><b>${r.pts} b.</b></div>`).join("")}
    </section>`;
  }).join("");
}

function updateTournamentPanel(){
  if(!tournament.active&&!tournament.champion&&!tournament.eliminated){
    tournamentInfoEl.innerHTML="<strong>64 států · 16 skupin</strong><span>4 týmy ve skupině, 3 zápasy, první dva postupují do play-off.</span>";
    renderTournamentProgress();renderPlayerGroupTable();return;
  }
  if(tournament.champion){
    tournamentInfoEl.innerHTML=`<strong>🏆 ${teamLabel(tournament.player,"")}</strong><span>Vítěz turnaje po skupinové fázi a play-off.</span>`;
  }else if(tournament.eliminated){
    tournamentInfoEl.innerHTML=`<strong>${teamLabel(tournament.player,"")}</strong><span>Turnaj skončil: ${tournament.lastSummary}</span>`;
  }else if(tournament.phase==="groups"){
    const ps=playerStanding();
    tournamentInfoEl.innerHTML=`<strong>${currentStageName()}</strong><span>${teamLabel(tournament.player,"")} vs ${teamLabel(tournament.opponent,"")} · ${ps?`${ps.pts} bodů po ${ps.played} zápasech`:"skupinová fáze"}</span>`;
  }else{
    tournamentInfoEl.innerHTML=`<strong>${currentStageName()}</strong><span>${teamLabel(tournament.player,"")} vs ${teamLabel(tournament.opponent,"")} · zbývá ${tournament.roundTeams.length} týmů</span>`;
  }
  renderTournamentProgress();renderPlayerGroupTable();
}

function setTeamBadges(){
  if(tournament.active){
    blueBadge.textContent=teamLabel(tournament.player,"TY");
    redBadge.textContent=teamLabel(tournament.opponent,"AI");
    blueBadge.title=tournament.player.name;
    redBadge.title=tournament.opponent?.name||"";
  }else{
    blueBadge.textContent="TY";redBadge.textContent="AI";blueBadge.title="";redBadge.title="";
  }
}

function setupCountrySelect(){
  countrySelectEl.innerHTML="";
  COUNTRIES.forEach(c=>{
    const o=document.createElement("option");o.value=String(c.id);o.textContent=`${flagEmoji(c.code)} ${c.name}`;
    if(c.code==="CZ")o.selected=true;countrySelectEl.appendChild(o);
  });
}

function setupTournament(){
  const player=COUNTRIES.find(c=>c.id===Number(countrySelectEl.value))||COUNTRIES[0];
  tournament.active=true;tournament.phase="groups";tournament.player=player;tournament.opponent=null;
  tournament.champion=false;tournament.eliminated=false;tournament.stageIndex=0;tournament.lastSummary="";
  tournament.groupMatchday=0;tournament.roundTeams=[];
  const teams=shuffle(COUNTRIES);
  tournament.groups=[];
  for(let i=0;i<16;i++){
    const groupTeams=teams.slice(i*4,i*4+4);
    tournament.groups.push({teams:groupTeams,standings:groupTeams.map(makeStanding)});
  }
  tournament.playerGroupIndex=tournament.groups.findIndex(g=>g.teams.some(t=>t.id===player.id));
  prepareGroupOpponent();renderAllGroups();updateTournamentPanel();
}

function prepareGroupOpponent(){
  const g=playerGroup();if(!g)return;
  const day=GROUP_SCHEDULE[tournament.groupMatchday];
  const pi=g.teams.findIndex(t=>t.id===tournament.player.id);
  let oi=-1;
  for(const [a,b] of day){if(a===pi)oi=b;else if(b===pi)oi=a}
  tournament.opponent=g.teams[oi];
  setTeamBadges();updateTournamentPanel();
}

function simulatedWinner(a,b){
  const diff=(a.rating-b.rating)/11;
  const pA=.5+(Math.tanh(diff)*.29);
  return Math.random()<pA?a:b;
}

function randomGoalCount(expected){
  let g=0,p=Math.exp(-expected),prod=Math.random();
  while(prod>p&&g<7){g++;prod*=Math.random()}
  return g;
}
function simulateGroupScore(a,b){
  const diff=(a.rating-b.rating)/18;
  const ga=randomGoalCount(clamp(1.55+diff,.65,2.8));
  const gb=randomGoalCount(clamp(1.55-diff,.65,2.8));
  return [ga,gb];
}
function applyGroupResult(group,a,b,ga,gb){
  const sa=group.standings.find(s=>s.team.id===a.id),sb=group.standings.find(s=>s.team.id===b.id);
  sa.played++;sb.played++;sa.gf+=ga;sa.ga+=gb;sb.gf+=gb;sb.ga+=ga;
  if(ga>gb){sa.w++;sb.l++;sa.pts+=3}
  else if(gb>ga){sb.w++;sa.l++;sb.pts+=3}
  else{sa.d++;sb.d++;sa.pts++;sb.pts++}
}
function simulateGroupMatchday(playerGoals,opponentGoals){
  const day=tournament.groupMatchday;
  tournament.groups.forEach((group,gi)=>{
    for(const [aIdx,bIdx] of GROUP_SCHEDULE[day]){
      const a=group.teams[aIdx],b=group.teams[bIdx];
      if(gi===tournament.playerGroupIndex&&(a.id===tournament.player.id||b.id===tournament.player.id)){
        const ga=a.id===tournament.player.id?playerGoals:opponentGoals;
        const gb=b.id===tournament.player.id?playerGoals:opponentGoals;
        applyGroupResult(group,a,b,ga,gb);
      }else{
        const [ga,gb]=simulateGroupScore(a,b);applyGroupResult(group,a,b,ga,gb);
      }
    }
  });
}
function buildKnockout32(){
  const qualified=tournament.groups.map(g=>rankedGroup(g).slice(0,2).map(s=>s.team));
  const bracket=[];
  for(let i=0;i<16;i+=2){
    bracket.push(qualified[i][0],qualified[i+1][1],qualified[i+1][0],qualified[i][1]);
  }
  tournament.phase="knockout";tournament.roundTeams=bracket;tournament.stageIndex=1;
  prepareTournamentOpponent();
}
function resolveGroupMatch(summary){
  simulateGroupMatchday(state.blueScore,state.redScore);
  tournament.lastSummary=summary;tournament.groupMatchday++;
  renderAllGroups();renderPlayerGroupTable();
  if(tournament.groupMatchday<3){prepareGroupOpponent();return "group-next"}
  const ranked=rankedGroup(playerGroup());
  const pos=ranked.findIndex(s=>s.team.id===tournament.player.id)+1;
  if(pos>2){tournament.active=false;tournament.eliminated=true;tournament.lastSummary=`${pos}. místo ve skupině`;updateTournamentPanel();return "group-eliminated"}
  buildKnockout32();updateTournamentPanel();return "group-qualified";
}

function prepareTournamentOpponent(){
  const idx=tournament.roundTeams.findIndex(c=>c.id===tournament.player.id);
  if(idx<0){tournament.opponent=null;return}
  const oppIdx=idx%2===0?idx+1:idx-1;
  tournament.opponent=tournament.roundTeams[oppIdx];
  setTeamBadges();updateTournamentPanel();
}

function simulateShootout(){
  const a=tournament.player?.rating||80,b=tournament.opponent?.rating||80;
  let blue=0,red=0;
  for(let i=0;i<5;i++){
    if(Math.random()<clamp(.73+(a-b)*.004,.58,.88))blue++;
    if(Math.random()<clamp(.73+(b-a)*.004,.58,.88))red++;
  }
  while(blue===red){if(Math.random()<.75)blue++;if(Math.random()<.75)red++}
  return {blue,red,blueWon:blue>red};
}

function resolveTournamentRound(blueWon,summary){
  const old=tournament.roundTeams;
  const winners=[];
  for(let i=0;i<old.length;i+=2){
    const a=old[i],b=old[i+1];
    if(a.id===tournament.player.id||b.id===tournament.player.id)winners.push(blueWon?tournament.player:tournament.opponent);
    else winners.push(simulatedWinner(a,b));
  }
  tournament.lastSummary=summary;
  if(!blueWon){tournament.active=false;tournament.eliminated=true;updateTournamentPanel();return "eliminated"}
  if(winners.length===1){tournament.active=false;tournament.champion=true;tournament.stageIndex=6;updateTournamentPanel();return "champion"}
  tournament.roundTeams=winners;tournament.stageIndex++;
  prepareTournamentOpponent();
  return "advanced";
}

function makePlayer(x,y,team,number,controlled=false,keeper=false){
  return {x,y,homeX:x,homeY:y,team,number,controlled,keeper,r:keeper?31:27,
    speed:controlled?235:(keeper?175:195),vx:0,vy:0,facingX:team==="blue"?1:-1,facingY:0,
    aiThink:0,color:team==="blue"?"#1676e8":"#ef4b43"};
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

const ball={x:W/2,y:H/2,r:15,vx:0,vy:0,friction:.982,maxSpeed:720};

function fieldClampPlayer(p){
  if(p.keeper){
    const minY=GOAL_TOP+p.r*.55;
    const maxY=GOAL_BOTTOM-p.r*.55;
    if(ownGoalIsLeft(p.team)) p.x=clamp(p.x,FIELD.left+30,FIELD.left+58);
    else p.x=clamp(p.x,FIELD.right-58,FIELD.right-30);
    p.y=clamp(p.y,minY,maxY);
    return;
  }
  p.x=clamp(p.x,FIELD.left+p.r,FIELD.right-p.r);
  p.y=clamp(p.y,FIELD.top+p.r,FIELD.bottom-p.r);
}

function resetPositions(){
  const bpBase=[[W*.26,H*.50],[W*.20,H*.28],[W*.44,H*.54],[FIELD.left+38,H/2]];
  const rpBase=[[W*.73,H*.32],[W*.72,H*.68],[W*.56,H*.44],[FIELD.right-38,H/2]];
  const bp=state.blueAttackRight?bpBase:bpBase.map(([x,y])=>[mirrorX(x),y]);
  const rp=state.blueAttackRight?rpBase:rpBase.map(([x,y])=>[mirrorX(x),y]);
  blue.forEach((p,i)=>{p.x=p.homeX=bp[i][0];p.y=p.homeY=bp[i][1];p.vx=p.vy=0;p.facingX=attackSign("blue");p.facingY=0;p.controlled=i===0;p.speed=i===0?235:(p.keeper?175:195);p.aiThink=0});
  red.forEach((p,i)=>{p.x=p.homeX=rp[i][0];p.y=p.homeY=rp[i][1];p.vx=p.vy=0;p.facingX=attackSign("red");p.facingY=0;p.speed=p.keeper?175:195;p.aiThink=0});
  state.activeBlue=0;state.possession=null;state.kickCooldown=0;state.stealCooldown=0;state.keeperClearDelay=0;state.contestHold=0;state.contestOpponent=null;
  ball.x=W/2;ball.y=H/2;ball.vx=ball.vy=0;
}

function resetMatch(){
  clearTimeout(state.restartTimer);
  state.halfLength=Number(halfLengthEl.value)||120;
  state.time=state.halfLength;state.half=1;state.blueAttackRight=true;
  state.blueScore=state.redScore=0;state.paused=false;state.running=true;state.lastTouchTeam="blue";state.endAction="restart";
  playerScoreEl.textContent="0";aiScoreEl.textContent="0";pauseBtn.textContent="Ⅱ";
  halfOverlay.classList.add("hidden");endOverlay.classList.add("hidden");
  resetPositions();setTeamBadges();updateTimerText();
}

function startGame(){
  if(state.frameId)cancelAnimationFrame(state.frameId);
  resetMatch();startOverlay.classList.add("hidden");groupsOverlay.classList.add("hidden");endOverlay.classList.add("hidden");
  state.lastTime=performance.now();state.frameId=requestAnimationFrame(loop);
}

function beginHalftime(){
  state.time=0;state.paused=true;updateTimerText();
  halfTitle.textContent="Konec 1. poločasu";
  halfText.textContent=`Stav ${state.blueScore}:${state.redScore} · týmy si ve 2. poločase vymění strany.`;
  halfOverlay.classList.remove("hidden");
}

function startSecondHalf(){
  if(!state.running||state.half!==1)return;
  state.half=2;state.time=state.halfLength;state.blueAttackRight=false;state.paused=false;
  halfOverlay.classList.add("hidden");resetPositions();updateTimerText();
  state.lastTime=performance.now();
}

function finishGame(){
  state.running=false;state.time=0;updateTimerText();
  roundPill.classList.add("hidden");
  let summary=`Výsledek ${state.blueScore}:${state.redScore}`;
  if(!tournament.active){
    resultTitle.textContent=state.blueScore>state.redScore?"VÝHRA!":state.blueScore<state.redScore?"PROHRA":"REMÍZA";
    resultText.textContent=summary;restartBtn.textContent="HRÁT ZNOVU";state.endAction="restart";
    endOverlay.classList.remove("hidden");return;
  }

  const playedStage=currentStageName();
  roundPill.textContent=playedStage;roundPill.classList.remove("hidden");

  if(tournament.phase==="groups"){
    const outcome=resolveGroupMatch(summary);
    if(outcome==="group-next"){
      const ps=playerStanding();
      resultTitle.textContent=state.blueScore>state.redScore?"3 BODY!":state.blueScore<state.redScore?"BEZ BODU":"1 BOD";
      resultText.textContent=`${summary}. Ve skupině máš ${ps.pts} bodů. Další soupeř: ${teamLabel(tournament.opponent,"")}.`;
      restartBtn.textContent=`ODEHRÁT ${tournament.groupMatchday+1}. ZÁPAS`;state.endAction="next";
    }else if(outcome==="group-qualified"){
      const pos=rankedGroup(playerGroup()).findIndex(s=>s.team.id===tournament.player.id)+1;
      resultTitle.textContent="POSTUP ZE SKUPINY!";
      resultText.textContent=`${summary}. Končíš ${pos}. ve skupině a postupuješ do play-off. Soupeř: ${teamLabel(tournament.opponent,"")}.`;
      restartBtn.textContent="ZAČÍT PLAY-OFF";state.endAction="next";
    }else{
      resultTitle.textContent="KONEC VE SKUPINĚ";
      resultText.textContent=`${summary}. ${tournament.lastSummary}. Do play-off postupují první dva týmy.`;
      restartBtn.textContent="NOVÝ TURNAJ";state.endAction="menu";
    }
    updateTournamentPanel();endOverlay.classList.remove("hidden");return;
  }

  let blueWon=state.blueScore>state.redScore;
  if(state.blueScore===state.redScore){
    const shootout=simulateShootout();blueWon=shootout.blueWon;summary+=` · penalty ${shootout.blue}:${shootout.red}`;
  }
  const outcome=resolveTournamentRound(blueWon,summary);
  if(outcome==="advanced"){
    resultTitle.textContent="POSTUP!";
    resultText.textContent=`${summary}. Další soupeř: ${teamLabel(tournament.opponent,"")}.`;
    restartBtn.textContent="DALŠÍ ZÁPAS";state.endAction="next";
  }else if(outcome==="champion"){
    resultTitle.textContent="🏆 MISTR SVĚTA!";
    resultText.textContent=`${summary}. ${teamLabel(tournament.player,"")} vyhrává turnaj 64 států!`;
    restartBtn.textContent="NOVÝ TURNAJ";state.endAction="menu";
  }else{
    resultTitle.textContent="VYŘAZENÍ";
    resultText.textContent=`${summary}. ${teamLabel(tournament.opponent,"")} postupuje dál.`;
    restartBtn.textContent="NOVÝ TURNAJ";state.endAction="menu";
  }
  endOverlay.classList.remove("hidden");
}

function updateTimerText(){
  const t=Math.max(0,Math.ceil(state.time));
  timerEl.textContent=`${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;
  halfLabel.textContent=`${state.half}. POLOČAS`;
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

function approach(current,target,amount){
  if(current<target)return Math.min(target,current+amount);
  if(current>target)return Math.max(target,current-amount);
  return target;
}

function controlHuman(dt){
  const p=blue[state.activeBlue];
  let input=keyboardVector();
  if(!input.x&&!input.y&&(Math.abs(state.joyX)>.02||Math.abs(state.joyY)>.02))input=norm(state.joyX,state.joyY);

  const desiredX=input.x*p.speed,desiredY=input.y*p.speed;
  const accelerating=Math.abs(input.x)+Math.abs(input.y)>0;
  const accel=(accelerating?760:1080)*dt;
  p.vx=approach(p.vx,desiredX,accel);
  p.vy=approach(p.vy,desiredY,accel);

  p.x+=p.vx*dt;p.y+=p.vy*dt;updateFacing(p);fieldClampPlayer(p);
}

function moveAI(p,tx,ty,dt,speed){
  const dx=tx-p.x,dy=ty-p.y,distance=Math.hypot(dx,dy);
  let desiredX=0,desiredY=0;
  if(distance>9){
    const d=norm(dx,dy);
    const slow=Math.min(1,Math.max(.28,distance/105));
    desiredX=d.x*speed*slow;desiredY=d.y*speed*slow;
  }
  const accel=690*dt;
  p.vx=approach(p.vx,desiredX,accel);
  p.vy=approach(p.vy,desiredY,accel);
  p.x+=p.vx*dt;p.y+=p.vy*dt;updateFacing(p);fieldClampPlayer(p);
}

function nearestIndex(team,target){
  let idx=0,best=Infinity;
  team.forEach((p,i)=>{if(p.keeper)return;const d=dist(p,target);if(d<best){best=d;idx=i}});
  return idx;
}

function switchPlayer(){
  if(!state.running||state.paused)return;

  // Přepnutí proběhne VÝHRADNĚ po stisku Q / HRÁČ.
  // Žádná herní situace, rozehrávka ani zisk míče hráče automaticky nepřepíná.
  const current=state.activeBlue;
  const playable=blue.map((p,i)=>({p,i})).filter(o=>!o.p.keeper);
  const pos=playable.findIndex(o=>o.i===current);
  const next=playable[(pos+1)%playable.length];
  if(!next)return;

  blue[current].controlled=false;
  blue[current].speed=195;
  state.activeBlue=next.i;
  blue[state.activeBlue].controlled=true;
  blue[state.activeBlue].speed=235;
}


function keeperClear(p){
  if(state.possession!==p || state.kickCooldown>0 || state.keeperClearDelay>0)return;

  const mates=(p.team==="blue"?blue:red).filter(t=>t!==p&&!t.keeper);
  const forwardSign=attackSign(p.team);

  // Gólman rozehrává pouze dopředu. Nikdy nevrací míč k vlastní bráně.
  let target=null,best=-Infinity;
  mates.forEach(t=>{
    const advance=(t.x-p.x)*forwardSign;
    if(advance<90)return;
    const distance=Math.hypot(t.x-p.x,t.y-p.y);
    const central=1-Math.min(1,Math.abs(t.y-H/2)/(H/2));
    const score=advance*1.35-distance*.08+central*70;
    if(score>best){best=score;target=t}
  });

  // Když není vhodný spoluhráč, následuje dlouhý bezpečný odkop rovně dopředu.
  const dir=target
    ?norm(target.x-p.x,target.y-p.y)
    :norm(forwardSign,(H/2-p.y)*.003);

  clearPossession();
  const power=545;
  ball.x=p.x+dir.x*(p.r+ball.r+14);
  ball.y=p.y+dir.y*(p.r+ball.r+14);
  ball.vx=dir.x*power;
  ball.vy=dir.y*power;
  state.lastTouchTeam=p.team;
  state.kickCooldown=.30;
  state.stealCooldown=.28;
}

function nearestOpponentDistance(p){
  const opps=p.team==="blue"?red:blue;
  let best=Infinity;
  opps.forEach(o=>{if(o.keeper)return;best=Math.min(best,dist(p,o))});
  return best;
}

function supportTarget(holder,p,attackingRight){
  const sign=attackingRight?1:-1;
  const lane=p.number===7||p.number===8?-1:1;
  return {
    x:clamp(holder.x+sign*145,FIELD.left+125,FIELD.right-125),
    y:clamp(H/2+lane*165,FIELD.top+75,FIELD.bottom-75)
  };
}

function updateBlueAI(dt){
  const holder=state.possession;
  const looseChaser=!holder?nearestIndex(blue,ball):-1;
  const defender=holder&&holder.team==="red"?nearestIndex(blue,holder):-1;
  const sign=attackSign("blue");

  blue.forEach((p,i)=>{
    if(i===state.activeBlue)return;
    if(p.keeper){
      if(holder===p)keeperClear(p);
      else{
        const ty=clamp(ball.y,GOAL_TOP+38,GOAL_BOTTOM-38);
        moveAI(p,ownGoalIsLeft("blue")?FIELD.left+42:FIELD.right-42,ty,dt,155);
      }
      return;
    }

    if(holder===p){
      const attackY=clamp(p.y+(H/2-p.y)*.14,FIELD.top+72,FIELD.bottom-72);
      moveAI(p,attacksRight("blue")?FIELD.right-135:FIELD.left+135,attackY,dt,190);
      const pressure=nearestOpponentDistance(p);
      const goalDistance=Math.abs((attacksRight("blue")?FIELD.right:FIELD.left)-p.x);
      const canShoot=goalDistance<W*.30&&Math.abs(p.y-H/2)<205;
      if(canShoot&&p.aiThink<=0&&state.kickCooldown<=0){aiKick(p,true);p.aiThink=.85;return}
      if(pressure<92&&p.aiThink<=0&&state.kickCooldown<=0){
        const target=findForwardPassTarget(p);
        if(target){aiKick(p,false);p.aiThink=.9;return}
      }
      return;
    }

    if(holder&&holder.team==="blue"){
      const t=supportTarget(holder,p,attacksRight("blue"));
      moveAI(p,t.x,t.y,dt,178);
      return;
    }

    if(holder&&holder.team==="red"){
      if(i===defender){
        moveAI(p,holder.x-sign*18,holder.y,dt,205);
      }else{
        const coverX=clamp(holder.x-sign*170,FIELD.left+145,FIELD.right-145);
        const coverY=clamp(p.homeY*.58+holder.y*.42,FIELD.top+80,FIELD.bottom-80);
        moveAI(p,coverX,coverY,dt,168);
      }
      return;
    }

    if(i===looseChaser)moveAI(p,ball.x,ball.y,dt,195);
    else{
      const shapeX=clamp(p.homeX+(ball.x-W/2)*.18,FIELD.left+120,FIELD.right-120);
      const shapeY=clamp(p.homeY+(ball.y-H/2)*.12,FIELD.top+75,FIELD.bottom-75);
      moveAI(p,shapeX,shapeY,dt,160);
    }
  });
}

function diffSpeed(){
  const base=difficultyEl.value==="easy"?170:difficultyEl.value==="hard"?215:192;
  const countryBonus=tournament.active&&tournament.opponent?(tournament.opponent.rating-80)*.65:0;
  return clamp(base+countryBonus,155,225);
}

function updateRedAI(dt){
  const holder=state.possession;
  const base=diffSpeed();
  const looseChaser=!holder?nearestIndex(red,ball):-1;
  const defender=holder&&holder.team==="blue"?nearestIndex(red,holder):-1;
  const sign=attackSign("red");

  red.forEach((p,i)=>{
    if(p.keeper){
      if(holder===p)keeperClear(p);
      else{
        const ty=clamp(ball.y,GOAL_TOP+38,GOAL_BOTTOM-38);
        moveAI(p,ownGoalIsLeft("red")?FIELD.left+42:FIELD.right-42,ty,dt,Math.max(145,base-25));
      }
      return;
    }

    if(holder===p){
      const attackY=clamp(p.y+(H/2-p.y)*.14,FIELD.top+72,FIELD.bottom-72);
      moveAI(p,attacksRight("red")?FIELD.right-135:FIELD.left+135,attackY,dt,base+5);
      const pressure=nearestOpponentDistance(p);
      const goalDistance=Math.abs((attacksRight("red")?FIELD.right:FIELD.left)-p.x);
      const canShoot=goalDistance<W*.30&&Math.abs(p.y-H/2)<205;
      if(canShoot&&p.aiThink<=0&&state.kickCooldown<=0){aiKick(p,true);p.aiThink=.85;return}
      if(pressure<92&&p.aiThink<=0&&state.kickCooldown<=0){
        const target=findForwardPassTarget(p);
        if(target){aiKick(p,false);p.aiThink=.9;return}
      }
      return;
    }

    if(holder&&holder.team==="red"){
      const t=supportTarget(holder,p,attacksRight("red"));
      moveAI(p,t.x,t.y,dt,Math.max(158,base-14));
      return;
    }

    if(holder&&holder.team==="blue"){
      if(i===defender){
        moveAI(p,holder.x-sign*18,holder.y,dt,base+18);
      }else{
        const coverX=clamp(holder.x-sign*170,FIELD.left+145,FIELD.right-145);
        const coverY=clamp(p.homeY*.58+holder.y*.42,FIELD.top+80,FIELD.bottom-80);
        moveAI(p,coverX,coverY,dt,Math.max(155,base-22));
      }
      return;
    }

    if(i===looseChaser)moveAI(p,ball.x,ball.y,dt,base);
    else{
      const shapeX=clamp(p.homeX+(ball.x-W/2)*.18,FIELD.left+120,FIELD.right-120);
      const shapeY=clamp(p.homeY+(ball.y-H/2)*.12,FIELD.top+75,FIELD.bottom-75);
      moveAI(p,shapeX,shapeY,dt,Math.max(148,base-30));
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
  state.possession=p;
  state.lastTouchTeam=p.team;
  state.keeperClearDelay=p.keeper?.12:0;
  state.contestHold=0;state.contestOpponent=null;
  p.aiThink=Math.max(p.aiThink,.42);
  ball.vx=ball.vy=0;
}
function clearPossession(){state.possession=null;state.keeperClearDelay=0;state.contestHold=0;state.contestOpponent=null}

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
  const ballSpeed=Math.hypot(ball.vx,ball.vy);
  [...blue,...red].forEach(p=>{
    const maxTrap=p.keeper?700:470;
    if(ballSpeed>maxTrap)return;
    const d=dist(p,ball);
    if(d<p.r+ball.r+8&&d<best){cand=p;best=d}
  });
  if(cand)setPossession(cand);
}

function trySteal(dt){
  if(!state.possession||state.stealCooldown>0){state.contestHold=0;state.contestOpponent=null;return}
  const h=state.possession,opps=h.team==="blue"?red:blue;
  let n=null,b=Infinity;
  opps.forEach(p=>{if(p.keeper)return;const d=dist(p,h);if(d<b){b=d;n=p}});
  const contact=n&&b<h.r+n.r+7;
  if(!contact){state.contestHold=Math.max(0,state.contestHold-dt*2.2);state.contestOpponent=null;return}
  if(state.contestOpponent!==n){state.contestOpponent=n;state.contestHold=0}
  state.contestHold+=dt;
  const needed=Math.hypot(h.vx,h.vy)>160?.24:.18;
  if(state.contestHold>=needed){setPossession(n);state.stealCooldown=.62}
}

function pointSegmentDistance(px,py,ax,ay,bx,by){
  const abx=bx-ax,aby=by-ay,apx=px-ax,apy=py-ay;
  const den=abx*abx+aby*aby||1;
  const t=clamp((apx*abx+apy*aby)/den,0,1);
  return Math.hypot(px-(ax+abx*t),py-(ay+aby*t));
}

function passLaneSafety(p,t){
  const opps=p.team==="blue"?red:blue;
  let nearest=999;
  opps.forEach(o=>{
    if(o.keeper)return;
    nearest=Math.min(nearest,pointSegmentDistance(o.x,o.y,p.x,p.y,t.x,t.y));
  });
  return nearest;
}

function findForwardPassTarget(p){
  const mates=p.team==="blue"?blue:red;
  let best=null,score=-Infinity;
  mates.forEach(t=>{
    if(t===p||t.keeper)return;
    const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy);
    if(d<75||d>410)return;
    const advance=dx*attackSign(p.team);
    if(advance<-8)return; // maximálně do strany, ne zpět k vlastní bráně
    const lane=passLaneSafety(p,t);
    if(lane<34)return;
    const dir=norm(dx,dy),facing=dir.x*p.facingX+dir.y*p.facingY;
    const openness=Math.min(120,lane);
    const s=advance*.72+facing*65+openness*.8-d*.10;
    if(s>score){score=s;best=t}
  });
  return best;
}

function kickFromPlayer(p,held){
  if(state.possession!==p||state.kickCooldown>0)return;
  const strong=held>.40;
  let dir;
  if(strong){
    const goalX=attackGoalX(p.team);
    const aimedY=clamp(H/2+p.facingY*FIELD.goalHeight*.34,GOAL_TOP+28,GOAL_BOTTOM-28);
    dir=norm(goalX-p.x,aimedY-p.y);
  }else{
    const target=findForwardPassTarget(p);
    dir=target?norm(target.x-p.x,target.y-p.y):norm(p.facingX,p.facingY);
    if(attackSign(p.team)>0&&dir.x<.12)dir=norm(1,dir.y*.42);
    if(attackSign(p.team)<0&&dir.x>-.12)dir=norm(-1,dir.y*.42);
  }
  clearPossession();
  const power=strong?Math.min(690,555+held*105):365;
  ball.x=p.x+dir.x*(p.r+ball.r+8);ball.y=p.y+dir.y*(p.r+ball.r+8);
  ball.vx=dir.x*power;ball.vy=dir.y*power;state.lastTouchTeam=p.team;state.kickCooldown=.28;state.stealCooldown=.24;
}

function aiKick(p,strong){
  if(state.possession!==p||state.kickCooldown>0)return;
  const goalX=attackGoalX(p.team);
  const target=strong?null:findForwardPassTarget(p);
  const accuracyBase=difficultyEl.value==="hard"?58:difficultyEl.value==="easy"?92:74;
  const rating=tournament.active&&p.team==="red"&&tournament.opponent?tournament.opponent.rating:80;
  const spread=Math.max(44,accuracyBase-(rating-80)*1.2);
  const shotY=H/2+(H/2-p.y)*.12+(Math.random()*2-1)*spread;
  let dir=strong
    ?norm(goalX-p.x,shotY-p.y)
    :(target?norm(target.x-p.x,target.y-p.y):norm(attackSign(p.team),0));

  if(attackSign(p.team)>0&&dir.x<.12)dir=norm(1,dir.y*.36);
  if(attackSign(p.team)<0&&dir.x>-.12)dir=norm(-1,dir.y*.36);

  clearPossession();
  ball.x=p.x+dir.x*(p.r+ball.r+8);
  ball.y=p.y+dir.y*(p.r+ball.r+8);
  const pow=strong?620:355;
  ball.vx=dir.x*pow;ball.vy=dir.y*pow;
  state.lastTouchTeam=p.team;state.kickCooldown=.30;state.stealCooldown=.24;
}

function updateFreeBall(dt){
  ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
  ball.vx*=Math.pow(ball.friction,dt*60);ball.vy*=Math.pow(ball.friction,dt*60);
  if(Math.hypot(ball.vx,ball.vy)<11)ball.vx=ball.vy=0;
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
    r.x=clamp(ball.x-attackSign(team)*55,FIELD.left+70,FIELD.right-70);
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
    if(inGoal){score(state.blueAttackRight?"blue":"red");return true}
    const team=state.lastTouchTeam==="blue"?"red":"blue";restartPlay("AUT",team,FIELD.right,ball.y);return true;
  }
  if(ball.x<FIELD.left){
    if(inGoal){score(state.blueAttackRight?"red":"blue");return true}
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
  state.time-=dt;updateTimerText();
  if(state.time<=0){
    state.time=0;
    if(state.half===1)beginHalftime();else finishGame();
    return;
  }
  state.kickCooldown=Math.max(0,state.kickCooldown-dt);
  state.stealCooldown=Math.max(0,state.stealCooldown-dt);
  state.keeperClearDelay=Math.max(0,state.keeperClearDelay-dt);
  [...blue,...red].forEach(p=>p.aiThink=Math.max(0,p.aiThink-dt));
  controlHuman(dt);updateBlueAI(dt);updateRedAI(dt);

  const all=[...blue,...red];
  for(let pass=0;pass<2;pass++)for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)resolvePlayerCollision(all[i],all[j]);

  if(state.possession){trySteal(dt);updatePossessionBall()}
  else{updateFreeBall(dt);tryAcquire()}

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

function updateModeControls(){
  const isTournament=gameModeEl.value==="tournament";
  countryRow.classList.toggle("hidden",!isTournament);
  startBtn.textContent=isTournament?"ZAČÍT TURNAJ":"ZAČÍT ZÁPAS";
}

function beginSelectedMode(){
  if(gameModeEl.value==="tournament"){
    setupTournament();
    startOverlay.classList.add("hidden");
    groupsOverlay.classList.remove("hidden");
    playGroupBtn.textContent="ODEHRÁT 1. ZÁPAS";
    draw();
  }else{
    tournament.active=false;tournament.phase=null;tournament.champion=false;tournament.eliminated=false;tournament.player=null;tournament.opponent=null;tournament.groups=[];tournament.playerGroupIndex=-1;tournament.groupMatchday=0;tournament.roundTeams=[];tournament.stageIndex=0;tournament.lastSummary="";
    setTeamBadges();updateTournamentPanel();startGame();
  }
}

function showMainMenu(){
  clearTimeout(state.restartTimer);
  if(state.frameId)cancelAnimationFrame(state.frameId);
  state.running=false;state.paused=false;state.frameId=null;
  halfOverlay.classList.add("hidden");groupsOverlay.classList.add("hidden");endOverlay.classList.add("hidden");startOverlay.classList.remove("hidden");
  pauseBtn.textContent="Ⅱ";updateModeControls();draw();
}

window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(!state.running&&(k==="enter"||k===" ")&&!startOverlay.classList.contains("hidden")){e.preventDefault();beginSelectedMode();return}
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

pauseBtn.addEventListener("click",()=>{
  if(!state.running||!halfOverlay.classList.contains("hidden"))return;
  state.paused=!state.paused;pauseBtn.textContent=state.paused?"▶":"Ⅱ";
});
startBtn.addEventListener("click",beginSelectedMode);
playGroupBtn.addEventListener("click",startGame);
secondHalfBtn.addEventListener("click",startSecondHalf);
restartBtn.addEventListener("click",()=>{
  if(state.endAction==="menu")showMainMenu();
  else startGame();
});
menuBtn.addEventListener("click",showMainMenu);
gameModeEl.addEventListener("change",updateModeControls);
switchBtn.addEventListener("pointerdown",e=>{e.preventDefault();switchPlayer()});
kickBtn.addEventListener("pointerdown",e=>{e.preventDefault();beginKick()});
kickBtn.addEventListener("pointerup",e=>{e.preventDefault();endKick()});
kickBtn.addEventListener("pointercancel",()=>{state.kickChargeStart=null;kickBtn.classList.remove("charging")});
setupCountrySelect();updateModeControls();updateTournamentPanel();setupJoystick();resetPositions();updateTimerText();draw();
})();
