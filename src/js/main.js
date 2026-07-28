/* ================= オンライン対戦モジュール ================= */
import './online.js';

/* ================= 盤面と定数 ================= */
const HOUSES=['tl','tr','c','bl','br'];
const HLABEL={tl:'北西',tr:'北東',c:'中央',bl:'南西',br:'南東'};
const ADJ={tl:['tr','bl','c'],tr:['tl','br','c'],bl:['tl','br','c'],br:['tr','bl','c'],c:['tl','tr','bl','br']};
const POS={tl:[20,18],tr:[80,18],c:[50,46],bl:[20,74],br:[80,74]};  // 左右対称・上下対称。縦横の道が垂直水平になる
const EDGES=[['tl','tr'],['tl','bl'],['tr','br'],['bl','br'],['c','tl'],['c','tr'],['c','bl'],['c','br']];
const edgeKey=(a,b)=>[a,b].sort().join('-');   // 道（辺）を順不同のキーに
const EDGE_KEYS=EDGES.map(([a,b])=>edgeKey(a,b));
const ROLE_LABEL={wolf:'人狼',guard:'護衛',villager:'村人',madman:'狂人',medium:'霊媒師',dog:'犬飼い'};
const TICKS=5,SHARPEN=3,SPOIL=2,EXPOSE=3,DAYS=3;
const NAMES=['佐吉','源蔵','卯之助','六助','甚平','与市','平次','権三','伊助','藤吉','弥七','太一','喜三郎','徳蔵',
             '民江','きく','さと','とめ','つる','うめ','しの','かね','ふじ','なつ','いと','はな','よね','すえ'];
const rnd=a=>a[Math.floor(Math.random()*a.length)];
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const other=p=>p===1?2:1;

let G=null;

/* ================= 生成 ================= */
function rolesFor(opt){
  const r=['wolf','guard'];
  if(opt.madmanDog)r.push('madman','dog');
  if(opt.medium)r.push('medium');
  while(r.length<5)r.push('villager');
  return shuf(r);
}
function mkVillage(id,names,isCPU,opt){
  const roles=rolesFor(opt);
  return{id,isCPU,people:names.map((n,i)=>({id:i,name:n,role:roles[i],house:null,alive:true})),
    permit:false,fed:false,explorer:null,route:[],sharpenStart:null,spoiled:false,
    attackTarget:null,protectTarget:null,log:[],reveal:[],placeIdx:0,permitFound:null,notice:null,memo:[],
    heardToday:null,
    madClaw:false,madClawFound:null,
    madStart:null,
    mediumFound:false,mediumResult:null,
    pitEdge:null,        // この村の道に置いた落とし穴（辺キー）
    pitSeen:false,       // 相手がその道を通って落とし穴が露見したか
    gotPermit:false,gotClaw:false,gotMedium:false,  // その日その家で取得済みか（落とし穴で失っても再取得しない）
    suspicion:{}};         // CPU用：相手の各personId→狼らしさスコア（高いほど狼疑い）
}
function buildSchedule(opt){
  opt=opt||{};
  // 配置の直後に（有効なら）ひったくり配置。1P連続→2P連続なので受け渡しは増えない
  const s=[{who:1,ph:'place'}];
  if(opt.pit)s.push({who:1,ph:'pit'});
  s.push({who:2,ph:'place'});
  if(opt.pit)s.push({who:2,ph:'pit'});
  for(let d=1;d<=DAYS;d++){
    s.push({who:1,ph:'explorer',day:d},
           {who:2,ph:'explorer',day:d},{who:2,ph:'route',day:d},
           {who:1,ph:'route',day:d},{who:1,ph:'ticks',day:d},
           {who:2,ph:'ticks',day:d},{who:2,ph:'night',day:d},
           {who:1,ph:'night',day:d},
           {who:0,ph:'morning',day:d});
  }
  s.push({who:0,ph:'end'});
  return s;
}
function countHandoffs(sched){
  let n=0,prev=null;
  sched.forEach(e=>{if(e.who===0)return; if(e.who!==prev)n++; prev=e.who});
  return n;
}
function newGame(mode,opt){
  opt=opt||{madmanDog:false,medium:false};
  const pool=shuf(NAMES);
  G={mode,opt,V:{1:mkVillage(1,pool.slice(0,5),false,opt),2:mkVillage(2,pool.slice(5,10),mode==='cpu',opt)},
     sched:buildSchedule(opt),idx:0,day:1,tickIdx:0,instantWin:null,
     permitHouse:{1:null,2:null},madHouse:{1:null,2:null},mediumHouse:{1:null,2:null},
     handoffs:0,endView:1,publicLog:[],done:false,swap:false,_shown:-1};
  G.totalHandoffs=countHandoffs(G.sched);
  const extra=[];
  if(opt.madmanDog)extra.push('狂人＋犬飼い');
  if(opt.medium)extra.push('霊媒師');
  document.getElementById('modeline').textContent =
    (mode==='cpu'?'対CPU':'1台を交代で使う2人対戦 ／ ホットシート')+
    (extra.length?'　／　'+extra.join('・'):'');
  startDay();
  sync();
}
let TITLE_OPT={madmanDog:false,medium:false,pit:false};
function toggleLedger(){document.body.classList.toggle('ledger-open')}
function openLedger(){document.body.classList.add('ledger-open')}
function closeLedger(){document.body.classList.remove('ledger-open')}
// スマホ：右端からの左スワイプで開く／右スワイプで閉じる
(function(){
  let x0=null,y0=null,tracking=false;
  const isMobile=()=>window.matchMedia('(max-width:980px)').matches;
  window.addEventListener('touchstart',e=>{
    if(!isMobile())return;
    const t=e.touches[0];x0=t.clientX;y0=t.clientY;
    // 画面右端24px以内から始まったスワイプだけ、開く操作の候補にする
    const open=document.body.classList.contains('ledger-open');
    tracking = open || (x0 > window.innerWidth-24);
  },{passive:true});
  window.addEventListener('touchend',e=>{
    if(!isMobile()||!tracking||x0===null)return;
    const t=e.changedTouches[0];const dx=t.clientX-x0, dy=t.clientY-y0;
    if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)){
      if(dx<0)openLedger(); else closeLedger();
    }
    x0=y0=null;tracking=false;
  },{passive:true});
})();
function showTitle(){
  const el=document.getElementById('veil');
  el.style.display='flex';document.body.style.overflow='hidden';
  const chip=(key,label,desc)=>'<button class="optchip '+(TITLE_OPT[key]?'on':'')+'" onclick="toggleOpt(\''+key+'\')"><span class="ck">'+(TITLE_OPT[key]?'✓':'')+'</span>'+label+'<small>'+desc+'</small></button>';
  el.innerHTML=`<div class="inner">
    <div class="title">人狼　村vs村</div>
    <div class="tagline">1対1の対戦型人狼 ／ 議論なし、3日3夜の読み合い</div>
    <div class="opts">
      <div class="optlabel">追加の役職（任意）</div>
      ${chip('madmanDog','狂人 ＋ 犬飼い','狂人の爪で研ぎ音を撹乱／犬飼いは本物の音を聞き分ける')}
      ${chip('medium','霊媒師','霊媒の札で、倒した相手の役職が分かる')}
      ${chip('pit','落とし穴','自分の村の道に1つ仕掛ける。通った相手は持ち物を全部落とす')}
    </div>
    <div class="modebtns">
      <button class="primary big" onclick="pick('cpu')">対CPU<span class="note">1人で遊ぶ</span></button>
      <button class="big" onclick="pick('pvp')">2人で対戦<span class="note">1台を交代で使う</span></button>
      <button class="big" onclick="window.onlineShowMenu()">オンライン対戦<span class="note">インターネット経由で対戦</span></button>
    </div>
  </div>`;
}
function toggleOpt(k){TITLE_OPT[k]=!TITLE_OPT[k];showTitle()}
function pick(m){document.body.style.overflow='';newGame(m,{...TITLE_OPT})}

/* ================= 参照 ================= */
const cur=()=>G.sched[G.idx];
const who=()=>cur().who;
const me=()=>G.V[who()||1];
const opp=()=>G.V[other(who()||1)];
const wolfOf=v=>v.people.find(p=>p.role==='wolf');
const guardOf=v=>v.people.find(p=>p.role==='guard');
const alive=v=>v.people.filter(p=>p.alive);
const personAt=(v,h)=>v.people.find(p=>p.house===h);
const freeHouse=(v,h)=>!personAt(v,h);
function houseName(v,h){const p=v.people.find(x=>x.house===h);return p?`${p.name}の家`:`${HLABEL[h]}の家`}
function log(v,t,cls){let d=v.log.find(x=>x.day===G.day);if(!d){d={day:G.day,lines:[]};v.log.push(d)}d.lines.push({t,cls})}
// 表示名：対CPUなら「自分／相手」、対人なら「1P／2P」
function vname(v){
  if(G.mode==='cpu')return v.isCPU?'相手の村':'自分の村';
  return `${v.id}Pの村`;
}

/* ================= 進行 ================= */
function advance(){
  G.idx++;
  const c=cur();
  if(c.day)G.day=c.day;
  if(c.ph==='ticks')G.tickIdx=0;
  sync();
}
// CPUの手番を自動で消化してから、人の手番で止める
function sync(){
  let guard=0;
  while(guard++<400){
    const c=cur();
    if(c.who===0)break;                 // 公開画面は人が進める
    const v=G.V[c.who];
    if(!v.isCPU)break;
    runCPU(c,v);
    if(G.done)return;                   // 即決着で終わった
    G.idx++;
    const n=cur();
    if(n.day)G.day=n.day;
    if(n.ph==='ticks')G.tickIdx=0;
  }
  showVeilIfNeeded();
}
function showVeilIfNeeded(){
  const el=document.getElementById('veil');
  const w=who();
  if(G.mode==='cpu'||w===0){hideVeil();return}
  let prev=null;
  for(let i=G.idx-1;i>=0;i--){if(G.sched[i].who!==0){prev=G.sched[i].who;break}}
  if(w===prev){hideVeil();return}
  G.handoffs++;
  el.className='veil';el.style.display='flex';
  document.body.style.overflow='hidden';window.scrollTo(0,0);
  el.innerHTML=`<div class="inner">
    <div class="count">受け渡し ${G.handoffs} / ${G.totalHandoffs}</div>
    <div class="to p${w}">${w}P</div>
    <p>${w}P に端末を渡してください。<br>渡すまで画面を見ないこと。</p>
    <button class="primary" onclick="hideVeil()">${w}Pです。準備できました</button>
  </div>`;
}
function hideVeil(){
  document.getElementById('veil').style.display='none';
  document.body.style.overflow='';
  render();
}

/* ================= CPU ================= */
function tour(){
  for(let k=0;k<400;k++){const r=[rnd(HOUSES)];
    while(r.length<TICKS){const nx=ADJ[r[r.length-1]].filter(h=>!r.includes(h));if(!nx.length)break;r.push(rnd(nx))}
    if(r.length===TICKS)return r}
  return ['tl','tr','br','bl','c'];
}
function stake2(t){const a=rnd(ADJ[t]);return [t,t,a,a,rnd(ADJ[a].concat([a]))]}
function stake3(t){
  const a=rnd(ADJ[t]),b=rnd(ADJ[t]),pat=Math.floor(Math.random()*3);
  if(pat===0)return [t,t,t,a,rnd(ADJ[a].concat([a]))];
  if(pat===1)return [a,t,t,t,b];
  const x=rnd(ADJ[a].concat([a]));
  return [x,a,t,t,t];
}
function runCPU(c,v){
  const o=G.V[other(v.id)];
  if(c.ph==='place'){shuf(HOUSES).forEach((h,i)=>{v.people[i].house=h});return}
  if(c.ph==='pit'){
    // 狼の家に隣接する道の1本に置く（相手が狼を追うと通りやすい）。なければ任意
    const w=wolfOf(v);
    const cand=EDGE_KEYS.filter(k=>k.split('-').includes(w.house));
    v.pitEdge=rnd(cand.length?cand:EDGE_KEYS);
    return;
  }
  if(c.ph==='explorer'){
    v.mediumResult=null;
    const liv=alive(v),w=wolfOf(v);
    // CPUは基本、夜に働く役（護衛・霊媒師）や狂人はなるべく探索に出さない
    const plain=liv.filter(p=>p.role==='villager'||p.role==='dog');
    let sendWolf=false;
    if(v.memo.length&&w.alive){const safe=v.fed||G.day<DAYS;sendWolf=Math.random()<(safe?0.5:0.12)}
    // 相手が狂人の爪を使いそうな気配（過去に贋物で撹乱された記憶）は今は簡略化し、たまに犬飼いを送る
    let pick;
    if(sendWolf){pick=w}
    else{
      const dog=dogOf(v);
      if(dog&&dog.alive&&v.memo.length&&Math.random()<0.4)pick=dog;
      else pick=(plain.length?rnd(plain):rnd(liv));
    }
    v.explorer=pick.id;v._sendWolf=sendWolf;return;
  }
  if(c.ph==='route'){
    let r;
    if(v._sendWolf&&v.memo.length)r=stake3(rnd(v.memo));
    else if(v.memo.length&&Math.random()<0.7)r=stake2(rnd(v.memo));
    else if(Math.random()<0.42)r=tour();
    else r=stake2(rnd(HOUSES));
    // 露見済みのひったくりの道は、可能なら避けてルートを引き直す（数回試す）
    if(o.pitEdge&&o.pitSeen){
      for(let tryn=0;tryn<12;tryn++){
        let bad=false;
        for(let i=0;i<r.length-1;i++){if(r[i]!==r[i+1]&&o.pitEdge===edgeKey(r[i],r[i+1])){bad=true;break}}
        if(!bad)break;
        // 引き直し
        if(v._sendWolf&&v.memo.length)r=stake3(rnd(v.memo));
        else if(v.memo.length&&Math.random()<0.7)r=stake2(rnd(v.memo));
        else if(Math.random()<0.42)r=tour();
        else r=stake2(rnd(HOUSES));
      }
    }
    v.route=r;
    // アイテムは経路の順に取得。落とし穴の道を通った時点で、その時「持っている」分を落とす。
    // 「取得済み(got)」は落としても消えない＝一度取った家に戻っても再取得しない。
    let held={permit:false,mad:false,medium:false};   // 今持っているか
    let got={permit:false,mad:false,medium:false};    // その家で取得済みか
    for(let i=0;i<r.length;i++){
      if(i>0 && r[i-1]!==r[i] && o.pitEdge===edgeKey(r[i-1],r[i])){
        if(held.permit||held.mad||held.medium)o.pitSeen=true;
        else if(o.pitEdge)o.pitSeen=true;
        held={permit:false,mad:false,medium:false};   // 所持だけ失う。got は残す
      }
      const h=r[i];
      if(h===G.permitHouse[v.id]&&!got.permit){held.permit=true;got.permit=true;}
      if(G.madHouse[v.id]&&h===G.madHouse[v.id]&&!got.mad){held.mad=true;got.mad=true;}
      if(G.mediumHouse[v.id]&&h===G.mediumHouse[v.id]&&!got.medium){held.medium=true;got.medium=true;}
    }
    v.permit=held.permit; v.permitFound=held.permit?G.permitHouse[v.id]:null;
    v.madClaw=held.mad;    v.madClawFound=held.mad?G.madHouse[v.id]:null;
    v.mediumFound=held.medium;
    v.gotPermit=got.permit; v.gotClaw=got.mad; v.gotMedium=got.medium;
    return;
  }
  if(c.ph==='ticks'){
    const w=wolfOf(v);
    if(w.alive&&v.explorer!==w.id){
      for(let k=1;k<=TICKS-SHARPEN+1;k++){
        if(cpuSharpen(v,o,k)){v.sharpenStart=k;break}
      }
    }
    // 狂人の爪が有効なら、狂人を独立して研がせる。相手の探索者が狂人の家に居合わせるティックを狙う。
    // 人狼が研ぐ夜はその音に重ねて隠し、人狼が研がない夜は囮として鳴らす。
    if(madActive(v)){
      const m=madmanOf(v);
      let best=null,bestScore=-1;
      for(let k=1;k<=TICKS-SHARPEN+1;k++){
        let sc=[0,1,2].map(i=>k+i).filter(t=>t<=TICKS).filter(t=>o.route[t-1]===m.house).length;
        // 人狼が研いでいるなら、その開始に重ねるのも有力
        if(v.sharpenStart!==null&&k===v.sharpenStart)sc+=0.5;
        if(sc>bestScore){bestScore=sc;best=k}
      }
      // 相手が狂人の家に一度も来ないなら鳴らしても無駄なので、来る見込みがあるときだけ鳴らす
      v.madStart=(bestScore>=1)?best:(v.sharpenStart!==null?v.sharpenStart:best);
    }
    G.tickIdx=TICKS;
    if(overlapFull(v,o.route)>=SPOIL)v.spoiled=true;
    if(v.id===2)resolveDay();
    return;
  }
  if(c.ph==='night'){
    cpuUpdateSuspicion(v,o);   // その日の相手探索者などから狼らしさを更新
    v.attackTarget=canAttack(v)?cpuPickAttack(v,o):null;
    // 護衛先：一番失いたくない味方（霊媒師＞犬飼い＞村人）を守る。相手の狼が襲ってきそうな相手。
    if(canProtect(v)){
      const guard=alive(v).filter(p=>p.role!=='guard'&&p.role!=='wolf');
      if(Math.random()<0.4){v.protectTarget=rnd(guard).id;}   // 4割は素朴に
      else{const pri=p=>p.role==='medium'?3:p.role==='dog'?2:1;
        guard.sort((a,b)=>pri(b)-pri(a));v.protectTarget=guard.length?guard[0].id:null;}
    }else v.protectTarget=null;
    return;
  }
}
// CPUの襲撃先選び：狼らしい相手を避け、狼でなさそうな相手（＝安全に殺せる）を狙う。
// 護衛を落とせると大きいので、護衛らしさも加味する。
function cpuPickAttack(v,o){
  const targets=alive(o);
  if(!targets.length)return null;
  // suspicion が高い＝狼疑い＝狙うと空振りリスク。避けたい。
  // その日 o が探索に出した人物は、この夜は狼でない（狼を出したら襲撃放棄で即勝利狙い）可能性が高い→安全
  const susp=v.suspicion||{};
  // 3割ほどは素朴に選ぶ（初心者にも勝ち筋を残すため、読みすぎない）
  if(Math.random()<0.3)return rnd(targets).id;
  const scored=targets.map(p=>{
    let score=0;
    score-=(susp[p.id]||0)*2.2;                 // 狼疑いは避けるが、以前より控えめ
    if(o.explorer===p.id)score+=1.6;            // 当日の探索者は安全牌
    score+=Math.random()*2.2;                   // 揺らぎを大きめに
    return {p,score};
  });
  scored.sort((a,b)=>b.score-a.score);
  return scored[0].p.id;
}
// CPUの推理更新：昼の終わりに、相手（探索を送ってくる側）の情報から狼らしさを更新する。
// v=CPU側の村、foe=相手の村。foe の誰が狼か（vが襲うべきでない相手）を推理。
function cpuUpdateSuspicion(v,foe){
  if(!v.suspicion)v.suspicion={};
  const s=v.suspicion;
  foe.people.forEach(p=>{if(s[p.id]===undefined)s[p.id]=1;});
  // foe がこの日探索に出した人物は、この日は襲撃を放棄している＝狼なら即勝利狙いのときだけ。
  // 多くの場合、探索に出た者は狼でない。疑いを下げる。
  if(foe.explorer!==null && foe.explorer!==undefined){
    s[foe.explorer]=Math.max(0,(s[foe.explorer]||1)-0.6);
  }
  // foe の襲撃がこの夜あった（vの誰かが襲われた）なら、foe の狼は在宅していた＝この日の探索者は確実に狼でない
  // （呼び出し側で foe.attackHappened を見る）
}
function cpuSharpen(v,o,k){
  const W=wolfOf(v).house;
  const urgent=(G.day===DAYS&&!v.fed)?2:(G.day===DAYS-1&&!v.fed)?1:0;
  let risk;
  if(k===1)risk=0.4;
  else{
    const last=o.route[k-2];
    if(last===W)risk=0.9;
    else if(ADJ[last].includes(W))risk=0.5;
    else risk=0.12;
  }
  let p=1-risk;
  if(urgent===2)p=Math.max(p,k===TICKS-SHARPEN+1?0.97:0.62);
  if(urgent===1)p=Math.min(1,p+0.18);
  return Math.random()<p;
}

/* ================= 地図 ================= */
function drawMap(el,village,o){
  el.innerHTML='';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');
  EDGES.forEach(([a,b])=>{
    const key=edgeKey(a,b);
    const isPit=(o.pitEdge===key);
    const l=document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1',POS[a][0]);l.setAttribute('y1',POS[a][1]);
    l.setAttribute('x2',POS[b][0]);l.setAttribute('y2',POS[b][1]);
    if(isPit){l.setAttribute('style','stroke:var(--akane-glow);stroke-width:2.4;stroke-dasharray:none;opacity:0.9')}
    svg.appendChild(l);
    // 辺を選ぶモード：透明な太い線を重ねてタップしやすく
    if(o.edgePick){
      const hit=document.createElementNS('http://www.w3.org/2000/svg','line');
      hit.setAttribute('x1',POS[a][0]);hit.setAttribute('y1',POS[a][1]);
      hit.setAttribute('x2',POS[b][0]);hit.setAttribute('y2',POS[b][1]);
      // CSSの .map svg line{stroke-dasharray:5 6} に勝つため、インラインstyleで上書きする
      hit.setAttribute('style','cursor:pointer;stroke:rgba(0,0,0,0.001);stroke-width:13;stroke-dasharray:none;stroke-linecap:round');
      hit.addEventListener('click',()=>o.onEdgePick(key));
      svg.appendChild(hit);
    }
    // ひったくりの目印（ビックリマーク）を道の中点に
    if(isPit){
      const mx=(POS[a][0]+POS[b][0])/2, my=(POS[a][1]+POS[b][1])/2;
      const g=document.createElementNS('http://www.w3.org/2000/svg','g');
      const circ=document.createElementNS('http://www.w3.org/2000/svg','circle');
      circ.setAttribute('cx',mx);circ.setAttribute('cy',my);circ.setAttribute('r','5.5');
      circ.setAttribute('fill','var(--akane)');circ.setAttribute('stroke','var(--kinari)');circ.setAttribute('stroke-width','0.6');
      const tx=document.createElementNS('http://www.w3.org/2000/svg','text');
      tx.setAttribute('x',mx);tx.setAttribute('y',my);tx.setAttribute('text-anchor','middle');
      tx.setAttribute('dominant-baseline','central');tx.setAttribute('fill','var(--kinari)');
      tx.setAttribute('font-size','8');tx.setAttribute('font-weight','700');tx.textContent='!';
      g.appendChild(circ);g.appendChild(tx);svg.appendChild(g);
    }
  });
  // 経路の矢印（補助・細く半透明）。同じ家に留まった区間や重なりは番号バッジで読む
  const rp=o.routePath||[];
  for(let i=0;i<rp.length-1;i++){
    const a=rp[i],b=rp[i+1];
    if(a===b)continue;                 // 留まりは矢印なし
    const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
    // 家の中心どうしを結ぶが、両端を少し縮めて矢印が家に潜らないようにする
    const x1=POS[a][0],y1=POS[a][1],x2=POS[b][0],y2=POS[b][1];
    const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    const pad=9;
    ln.setAttribute('x1',x1+ux*pad);ln.setAttribute('y1',y1+uy*pad);
    ln.setAttribute('x2',x2-ux*pad);ln.setAttribute('y2',y2-uy*pad);
    ln.setAttribute('stroke',o.routeMine?'var(--moon)':'var(--kuchiba)');
    ln.setAttribute('stroke-width','1.1');ln.setAttribute('opacity','0.55');
    ln.setAttribute('stroke-dasharray','none');ln.setAttribute('marker-end','url(#arrow-'+(o.routeMine?'m':'f')+')');
    svg.appendChild(ln);
  }
  // 矢印マーカー定義
  if(rp.length>1){
    const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
    ['m','f'].forEach(k=>{
      const mk=document.createElementNS('http://www.w3.org/2000/svg','marker');
      mk.setAttribute('id','arrow-'+k);mk.setAttribute('markerWidth','5');mk.setAttribute('markerHeight','5');
      mk.setAttribute('refX','4');mk.setAttribute('refY','2.5');mk.setAttribute('orient','auto');
      const pa=document.createElementNS('http://www.w3.org/2000/svg','path');
      pa.setAttribute('d','M0,0 L5,2.5 L0,5 Z');
      pa.setAttribute('fill',k==='m'?'var(--moon)':'var(--kuchiba)');pa.setAttribute('opacity','0.7');
      mk.appendChild(pa);defs.appendChild(mk);
    });
    svg.appendChild(defs);
  }
  // 各家に、何ティック目に来たかの番号を集める
  const tickNums={};
  rp.forEach((h,i)=>{(tickNums[h]=tickNums[h]||[]).push(i+1)});
  el.appendChild(svg);
  HOUSES.forEach(h=>{
    const d=document.createElement('div');d.className='house';
    d.style.left=POS[h][0]+'%';d.style.top=POS[h][1]+'%';
    let occ='—',cls='role-villager',rt='',occCls='';
    const p=personAt(village,h);
    if(p){
      occ=p.name;
      if(!p.alive){cls='role-dead';rt='死亡';occCls=' occ-dead'}
      else if(o.omniscient){cls='role-'+p.role;rt=ROLE_LABEL[p.role]}
      else if(o.showExplorer&&village.explorer===p.id){cls='role-away';rt='探索者'}
    }
    d.innerHTML=`<span class="hname">${HLABEL[h]}</span><span class="occ${occCls}">${occ}</span><span class="role ${cls}">${rt}</span>`;
    if(o.omniscient&&o.sharpenHouse===h){d.classList.add('sharpening');if(village.spoiled)d.classList.add('spoiled')}
    if(!o.omniscient&&o.itemHouses){
      const badges=[];
      if(o.itemHouses.permit===h)badges.push('護衛届');
      if(o.itemHouses.claw===h)badges.push('狂人の爪');
      if(o.itemHouses.medium===h)badges.push('霊媒の札');
      if(badges.length){
        d.classList.add('permitfound');
        badges.forEach(b=>{d.innerHTML+='<span class="badge">'+b+'</span>';});
      }
    }
    if(o.pickable){if(o.pickable(h)){d.classList.add('pick');d.onclick=()=>o.onPick(h)}else d.classList.add('disabled')}
    if(o.attackTargetHouse===h){d.classList.add('attacksel')}
    if(tickNums[h]){
      const nb=document.createElement('div');
      nb.className='ticknum'+(o.routeMine?' mine':'');
      nb.textContent=tickNums[h].join(',');
      d.appendChild(nb);
    }
    el.appendChild(d);
  });
  (o.tokens||[]).forEach(t=>{const s=document.createElement('div');
    s.className='token'+(t.mine?' mine':'');s.textContent=t.label;
    s.style.left=POS[t.house][0]+'%';s.style.top=(POS[t.house][1]+13)+'%';el.appendChild(s)});
}

/* ================= 主従レイアウト ================= */
const isNarrow=()=>!!(window.matchMedia&&window.matchMedia('(max-width:820px)').matches);
// そのフェーズで「触る／見る」村はどちらか
const mainSide=ph=>ph==='route'?'opp':'own';
function toggleSwap(){G.swap=!G.swap;render()}
function applyStage(c,pub){
  const stage=document.getElementById('stage');
  const bm=document.getElementById('board-mine'),bf=document.getElementById('board-foe');
  const flip=document.getElementById('stageflip');
  stage.className='stage';bm.className='board';bf.className='board';flip.innerHTML='';
  if(pub){stage.classList.add('equal');bm.classList.add('is-main');bf.classList.add('is-main');return}
  if(c.ph==='place'){ // 配置中は相手の間取りを見せない（先後の不公平をなくす）
    stage.classList.add('solo');bm.classList.add('is-main');bf.classList.add('is-hidden');return}
  let side=mainSide(c.ph);
  if(G.swap)side=(side==='own')?'opp':'own';
  const ownMain=(side==='own');
  bm.classList.add(ownMain?'is-main':'is-sub');
  bf.classList.add(ownMain?'is-sub':'is-main');
  if(isNarrow()){
    const sub=ownMain?bf:bm;
    sub.classList.remove('is-sub');sub.classList.add('is-hidden');
    stage.classList.add('solo');
  }
  flip.innerHTML=`<button class="flip" onclick="toggleSwap()">`+
    (isNarrow()?(ownMain?'相手の村を見る':'自分の村を見る'):'大きく映す村を入れ替える')+` ⇄</button>`;
}

/* ================= 描画 ================= */
function render(){
  if(!G)return;
  const c=cur(),w=who();
  if(G._shown!==G.idx){G.swap=false;G._shown=G.idx;if(document.body.classList)document.body.classList.remove('ledger-open')}   // フェーズが変わったら主従を既定に戻し、覚え書きの引き出しも閉じる
  const pub=(w===0), revealAll=(c.ph==='end');
  const M=pub?G.V[G.endView]:me(), F=pub?G.V[other(G.endView)]:opp();

  document.getElementById('t-mine').textContent=
    pub?`${vname(M)}の地図`:(G.mode==='cpu'?'自分の村の地図':`自分の村の地図（${M.id}P）`);
  document.getElementById('t-foe').textContent=
    pub?`${vname(F)}の地図`:(G.mode==='cpu'?'相手の村の地図':`相手の村の地図（${F.id}P）`);
  document.getElementById('ledger-title').textContent=pub?`覚え書き（${vname(M)}）`:'覚え書き';

  const st=document.getElementById('status');
  st.innerHTML=`<span><b>${G.day}</b>日目 / ${DAYS}</span>`+
    (G.mode==='cpu'
      ? `<span>自村 <b>${alive(G.V[1]).length}</b>人</span><span>敵村 <b>${alive(G.V[2]).length}</b>人</span>`
      : `<span>1P <b>${alive(G.V[1]).length}</b>人</span><span>2P <b>${alive(G.V[2]).length}</b>人</span>`)+
    (pub
      ? `<span class="turnbadge pub">${G.mode==='cpu'?'結果':'1P・2P とも観覧可'}</span>`
      : `<span class="${M.permit?'on':''}">護衛届 ${M.permit?'取得':'—'}</span>`+
        (M.explorer!==null&&guardAway(M)?`<span style="color:var(--akane-glow)">護衛は探索中</span>`:'')+
        `<span>狼の食事 ${M.fed?'済':'まだ'}</span>`+
        (G.mode==='cpu'?'':`<span class="turnbadge p${w}">${w}P の手番</span>`));

  const wl=wolfOf(M);
  const sharpH=(!pub&&M.sharpenStart!==null&&wl.alive)?wl.house:null;
  const mineTokens=[],foeTokens=[];
  if(!pub){
    if(c.ph==='route'&&M.route.length)
      foeTokens.push({house:M.route[M.route.length-1],label:M.people[M.explorer].name,mine:true});
    else if((c.ph==='ticks'||c.ph==='night')&&G.tickIdx>0&&M.route[G.tickIdx-1])
      foeTokens.push({house:M.route[G.tickIdx-1],label:M.people[M.explorer].name,mine:true});
    if((c.ph==='ticks'||c.ph==='night')&&G.tickIdx>0&&F.route[G.tickIdx-1])
      mineTokens.push({house:F.route[G.tickIdx-1],label:F.people[F.explorer].name,mine:false});
  }
  // 経路の番号と矢印用のパス
  let myRoutePath=[];   // 自分の探索経路（相手の村を回る）：組んだ分を表示
  if(!pub&&(c.ph==='route'||c.ph==='ticks'||c.ph==='night'))myRoutePath=M.route.slice();
  let foeRoutePath=[];  // 相手の探索者の経路（自分の村を回る）：ティックで明かされた分だけ
  if(!pub&&(c.ph==='ticks'||c.ph==='night'))foeRoutePath=F.route.slice(0,G.tickIdx);
  const pitPicking=(!pub&&c.ph==='pit');
  drawMap(document.getElementById('map-mine'),M,{
    omniscient:pub?revealAll:true,sharpenHouse:sharpH,tokens:mineTokens,
    routePath:foeRoutePath,routeMine:false,
    pitEdge:(pub?(revealAll?M.pitEdge:null):M.pitEdge),   // 自分の村：自分のひったくりは見える
    edgePick:pitPicking,onEdgePick:placePit,
    pickable:(!pub&&c.ph==='place')?(h=>freeHouse(M,h)):null,onPick:placeNext});
  // 夜、襲撃できるなら相手の家をタップで選べる（人狼の家も選べる＝空振り）
  const nightPick=(!pub&&c.ph==='night'&&canAttack(M));
  drawMap(document.getElementById('map-foe'),F,{
    omniscient:pub?revealAll:false,showExplorer:!pub&&['route','ticks','night'].includes(c.ph),
    itemHouses:pub?null:{
      permit: M.gotPermit?G.permitHouse[M.id]:null,
      claw:   M.gotClaw?G.madHouse[M.id]:null,
      medium: M.gotMedium?G.mediumHouse[M.id]:null
    },
    tokens:foeTokens,
    routePath:myRoutePath,routeMine:true,
    pitEdge:(pub?(revealAll?F.pitEdge:null):(F.pitSeen?F.pitEdge:null)),  // 相手の村：露見後のみ

    attackTargetHouse:(nightPick&&M.attackTarget!==null)?F.people[M.attackTarget].house:null,
    pickable:(!pub&&c.ph==='route')?routeValid:(nightPick?(h=>!!personAt(F,h)):null),
    onPick:(!pub&&c.ph==='route')?pickRoute:(nightPick?pickAttackHouse:null)});

  applyStage(c,pub);

  if(pub&&!revealAll){
    document.getElementById('ledger').innerHTML='<div class="entry none">覚え書きは各自の手番でだけ開く。</div>';
    document.getElementById('ledger-title').textContent='覚え書き';
  }else renderLedger(M);
  renderPanel();
}
function renderLedger(v){
  const el=document.getElementById('ledger');
  if(!v.log.length){el.innerHTML='<div class="entry none">まだ何も起きていない。</div>';return}
  el.innerHTML=v.log.slice().reverse().map(d=>
    `<div class="dayblock"><div class="dayhead">${d.day}日目</div>`+
    d.lines.map(l=>`<div class="entry ${l.cls||''}">${l.t}</div>`).join('')+`</div>`).join('');
}

/* ================= 昼 ================= */
function startDay(){
  [1,2].forEach(p=>{const v=G.V[p];
    v.permit=false;v.route=[];v.sharpenStart=null;v.spoiled=false;
    v.explorer=null;v.attackTarget=null;v.protectTarget=null;v.permitFound=null;v.notice=null;
    v.heardToday=null;v.madClaw=false;v.madClawFound=null;v.madStart=null;v.mediumFound=false;
    v.gotPermit=false;v.gotClaw=false;v.gotMedium=false;
    v.heardMad=null;v.heardWolf=null;v.routeDone=false;v.tickDone=false});
  G.tickIdx=0;
  [1,2].forEach(p=>{
    const ph=rnd(HOUSES);
    G.permitHouse[p]=ph;
    const pool=shuf(HOUSES.filter(h=>h!==ph));
    G.madHouse[p]=(G.opt.madmanDog&&G.day<=2)?pool[0]:null;
    G.mediumHouse[p]=(G.opt.medium&&G.day<=2)?(pool[1]!==undefined?pool[1]:pool[0]):null;
  });
}
function placePit(key){
  const v=me();v.pitEdge=key;render();
}
function confirmPit(){advance();}
function placeNext(h){
  const v=me();v.people[v.placeIdx].house=h;v.placeIdx++;
  if(v.placeIdx>=5)advance();else render();
}
function chooseExplorer(id){const v=me();v.explorer=id;v.mediumResult=null;advance()}
function routeValid(h){
  const r=me().route;
  if(r.length>=TICKS)return false;
  if(r.length===0)return true;
  const last=r[r.length-1];
  return h===last||ADJ[last].includes(h);
}
function pickRoute(h){
  const v=me(),o=opp();
  const prev=v.route.length?v.route[v.route.length-1]:null;
  v.route.push(h);
  v.notice=null;
  // ひったくり：相手の村の道を通った瞬間、持っているアイテムを全部失う
  if(prev!==null && prev!==h && o.pitEdge===edgeKey(prev,h)){
    const had=[];
    if(v.permit)had.push('護衛届');
    if(v.madClaw)had.push('狂人の爪');
    if(v.mediumFound)had.push('霊媒の札');
    o.pitSeen=true;                 // 露見：以後、相手（探索側）に道が見える
    if(had.length){
      v.permit=false;v.permitFound=null;v.madClaw=false;v.madClawFound=null;v.mediumFound=false;
      v.notice='<b>落とし穴に落ちた。</b>'+houseName(o,prev)+'から'+houseName(o,h)+'へ抜ける道に仕掛けてあり、'+had.join('・')+'を落としてしまった。';
      log(v,houseName(o,prev)+'〜'+houseName(o,h)+'の道の落とし穴に落ち、'+had.join('・')+'を落とした。','kill');
    }else{
      v.notice='<b>落とし穴があった。</b>'+houseName(o,prev)+'から'+houseName(o,h)+'へ抜ける道に仕掛けてあった。幸い、まだ何も持っていなかった。';
      log(v,houseName(o,prev)+'〜'+houseName(o,h)+'の道に落とし穴があった（持ち物なし）。');
    }
  }
  if(h===G.permitHouse[v.id]&&!v.gotPermit){
    v.permit=true;v.permitFound=h;v.gotPermit=true;
    v.notice=`<b>護衛届を手に入れた。</b>${houseName(opp(),h)}のタンスの中にあった。今夜、村人1人を守れる。`;
    log(v,`${houseName(opp(),h)}で護衛届を手に入れた。`);
  }
  else if(h===G.madHouse[v.id]&&!v.gotClaw){
    v.madClaw=true;v.madClawFound=h;v.gotClaw=true;
    const mad=madmanOf(v);
    const usable=mad&&mad.alive&&v.explorer!==mad.id;
    const madReason = !mad ? '' : (!mad.alive ? '狂人はすでにいない' : (v.explorer===mad.id ? '狂人は探索に出て眠っている' : ''));
    v.notice='<b>狂人の爪を手に入れた。</b>'+houseName(opp(),h)+'にあった。'+
      (usable?'今夜、狂人に爪を研がせて相手の探索者を惑わせられる。'
             :'だが今夜、'+madReason+'。爪は鳴らせない。');
    if(usable)log(v,houseName(opp(),h)+'で狂人の爪を手に入れた。');
    else log(v,houseName(opp(),h)+'で狂人の爪を取ったが、'+madReason+'ため使えなかった。');
  }
  else if(h===G.mediumHouse[v.id]&&!v.gotMedium){
    v.mediumFound=true;v.gotMedium=true;
    const med=mediumOf(v);
    const usable=med&&med.alive&&v.explorer!==med.id;
    const medReason = !med ? '' : (!med.alive ? '霊媒師はすでにいない' : (v.explorer===med.id ? '霊媒師は探索に出て眠っている' : ''));
    v.notice='<b>霊媒の札を手に入れた。</b>'+houseName(opp(),h)+'にあった。'+
      (usable?'今夜倒した相手がいれば、その正体が分かる。'
             :'だが今夜、'+medReason+'。札は働かない。');
    if(usable)log(v,houseName(opp(),h)+'で霊媒の札を手に入れた。');
    else log(v,houseName(opp(),h)+'で霊媒の札を取ったが、'+medReason+'ため使えなかった。');
  }
  if(v.route.length>=TICKS)v.routeDone=true;   // 即進まず、確認画面を出す
  render();
}
function confirmRoute(){me().routeDone=false;advance();}
function pickAttackHouse(h){
  const v=me(),o=opp();
  const p=personAt(o,h);
  if(!p||!p.alive)return;
  v.attackTarget=p.id;render();
}

/* ================= ティック ================= */
const sharpenTicks=v=>v.sharpenStart===null?[]:[0,1,2].map(i=>v.sharpenStart+i).filter(t=>t<=TICKS);
function overlapSoFar(v,route){const w=wolfOf(v);
  return sharpenTicks(v).filter(t=>t<=G.tickIdx&&route[t-1]===w.house).length}
function overlapFull(v,route){const w=wolfOf(v);
  return sharpenTicks(v).filter(t=>route[t-1]===w.house).length}
// 狂人が実際に研ぐティック列。人狼とは完全に独立し、ユーザーが決めた madStart から研ぐ
function madSharpenTicks(v){
  if(!madActive(v))return [];
  const start=v.madStart;
  if(start===null||start===undefined)return [];
  return [0,1,2].map(i=>start+i).filter(t=>t<=TICKS);
}
// 狂人の囮の研ぎに、経路 route が居合わせた回数（狂人の家で鳴る）
function overlapMad(v,route){const m=madmanOf(v);
  if(!m||!madActive(v))return 0;
  return madSharpenTicks(v).filter(t=>route[t-1]===m.house).length}
// 狂人の爪が有効なら、人狼の在不在に関係なく、狂人を独立して研がせる操作を出す
function madManualNeeded(v){ return madActive(v); }
function canSharpenMad(v){return madManualNeeded(v)&&v.madStart===null&&G.tickIdx<=TICKS-SHARPEN}
function startSharpenMad(){me().madStart=G.tickIdx+1;render()}
// 探索者 att が村 def で聞いた音を、覚え書きに書く
function reportHearing(att,def,r){
  const where=[...new Set(att.route)].map(h=>houseName(def,h)).join('・');
  if(r.isDog){
    // 犬飼い：狂人の囮を無視し、人狼の音だけを聞き分ける
    if(r.wolfHit>=1)log(att,'犬が反応した。人狼の爪を研ぐ音がした。狂人の贋物ではない。','hintline');
    else log(att,'犬は人狼の爪の音を捉えなかった。','none');
  }else{
    const any=r.wolfHit+r.madHit;
    if(any>=1)log(att,'探索の途中、どこかで爪を研ぐ音を聞いた。','hintline');
    else log(att,'探索の途中、怪しい音はなかった。','none');
  }
  att._heardWhere=where;
}
function canSharpen(){const v=me(),w=wolfOf(v);
  return w.alive&&v.explorer!==w.id&&v.sharpenStart===null&&G.tickIdx<=TICKS-SHARPEN}
function startSharpen(){me().sharpenStart=G.tickIdx+1;render()}
function advanceTick(){
  G.tickIdx++;
  const v=me();
  if(overlapSoFar(v,opp().route)>=SPOIL)v.spoiled=true;
  if(G.tickIdx>=TICKS)v.tickDone=true;   // 5ティック目を表示。確認してから昼を終える
  render();
}
function finishDay(){                     // 「昼を終える」で呼ぶ
  const v=me();v.tickDone=false;
  if(v.id===2){resolveDay();if(G.done)return}
  advance();
}

/* ================= 夜 ================= */
const canAttack=v=>{const w=wolfOf(v);
  return w.alive&&v.explorer!==w.id&&v.sharpenStart!==null&&!v.spoiled&&sharpenTicks(v).length===SHARPEN};
const guardAway=v=>v.explorer===guardOf(v).id;      // 護衛が探索に出ている＝夜は眠る
const roleOf=(v,role)=>v.people.find(p=>p.role===role);
const madmanOf=v=>roleOf(v,'madman');
const mediumOf=v=>roleOf(v,'medium');
const dogOf=v=>roleOf(v,'dog');
const madActive=v=>v.madClaw&&madmanOf(v)&&madmanOf(v).alive&&v.explorer!==madmanOf(v).id;
const canProtect=v=>guardOf(v).alive&&v.permit&&!guardAway(v)&&alive(v).some(p=>p.role!=='guard'&&p.role!=='wolf');
function protectReason(v){
  if(!guardOf(v).alive)return '護衛が生きていない。';
  if(guardAway(v))return '護衛は探索から帰って眠っている。今夜は守れない。';
  if(!v.permit)return '護衛届を取れなかった。';
  return '守れる一般村人がいない。';
}
function confirmNight(){
  if(me().id===1)endOfNight();else advance();   // 1Pの夜が一日の締め
}
function endOfNight(){
  resolveNight();
  if(G.done)return;
  if(G.day<DAYS)startDay();        // 翌日の護衛届を先に抽選
  advance();                       // → 夜明け
}

/* ================= 判定 ================= */
function wolfActOf(v){
  const w=wolfOf(v);
  if(v.explorer===w.id)return '探索に出ていた。この夜は襲えなかった';
  if(v.sharpenStart===null)return '爪を研がなかった';
  if(v.spoiled)return '爪を研いだが、探索者に見つかって止まった';
  return '爪を研ぎ切って、襲撃してきた';
}
function resolveDay(){
  const A=G.V[1],B=G.V[2];
  [A,B].forEach(v=>{const e=G.V[other(v.id)];if(overlapFull(v,e.route)>=SPOIL)v.spoiled=true});
  const path=(v,r)=>r.map(h=>houseName(v,h)).join(' → ');
  log(A,`自分の探索者 ${A.people[A.explorer].name}：${path(B,A.route)}`,'route');
  log(A,`相手の探索者 ${B.people[B.explorer].name}：${path(A,B.route)}`,'route');
  log(B,`自分の探索者 ${B.people[B.explorer].name}：${path(A,B.route)}`,'route');
  log(B,`相手の探索者 ${A.people[A.explorer].name}：${path(B,A.route)}`,'route');

  // 音の報告：探索者( att )が、相手( def )の村で聞いた研ぎ音
  //   通常の探索者 … 狼の音も狂人の囮も「爪を研ぐ音」として混ざって聞こえる
  //   犬飼い       … 狂人の囮を無視し、人狼の音だけを聞き分ける
  function hearing(att,def){
    const isDog = att.explorer!==null && def===G.V[other(att.id)] &&
                  att.people[att.explorer] && att.people[att.explorer].role==='dog';
    const wolfHit = overlapFull(def,att.route);          // 本物の狼の研ぎに居合わせた回数
    const madHit  = madActive(def) ? overlapMad(def,att.route) : 0; // 狂人の囮に居合わせた回数
    return {isDog,wolfHit,madHit};
  }
  const rHearA=hearing(A,B), rHearB=hearing(B,A);
  reportHearing(A,B,rHearA);   // A が B の村で聞いた
  reportHearing(B,A,rHearB);
  A._todayHear=rHearA; B._todayHear=rHearB;
  A.heardToday = rHearA.isDog ? (rHearA.wolfHit>=1) : ((rHearA.wolfHit+rHearA.madHit)>=1);
  B.heardToday = rHearB.isDog ? (rHearB.wolfHit>=1) : ((rHearB.wolfHit+rHearB.madHit)>=1);
  if(rHearA.wolfHit>=1)A.memo=A.memo.concat([wolfOf(B).house]);
  if(rHearB.wolfHit>=1)B.memo=B.memo.concat([wolfOf(A).house]);

  const aWin=(A.explorer===wolfOf(A).id)&&rHearA.wolfHit>=EXPOSE;
  const bWin=(B.explorer===wolfOf(B).id)&&rHearB.wolfHit>=EXPOSE;
  if(aWin||bWin){  // 昼のうちに決着
    G.instantWin=(aWin&&bWin)?'draw':(aWin?1:2);
    if(aWin){wolfOf(B).alive=false;
      log(A,`${A.people[A.explorer].name}が、相手の人狼${wolfOf(B).name}を暴き追放した。`,'kill');
      log(B,`訪ねてきた${A.people[A.explorer].name}に、自村の人狼${wolfOf(B).name}を暴かれた。`,'kill')}
    if(bWin){wolfOf(A).alive=false;
      log(B,`${B.people[B.explorer].name}が、相手の人狼${wolfOf(A).name}を暴き追放した。`,'kill');
      log(A,`訪ねてきた${B.people[B.explorer].name}に、自村の人狼${wolfOf(A).name}を暴かれた。`,'kill')}
    [A,B].forEach(v=>{const e=G.V[other(v.id)];
      const hear=v._todayHear||{};
      const heardMad=(hear.madHit||0)>=1;
      const vExpRole=(v.explorer!==null&&v.people[v.explorer])?v.people[v.explorer].role:null;
      const got=[];
      if(e.permitFound)got.push('護衛届');
      if(e.madClawFound)got.push('狂人の爪');
      if(e.mediumFound)got.push('霊媒の札');
      v.reveal.push({day:G.day,hasNight:false,wolfAct:wolfActOf(e),
        heardMad:heardMad,dogHeardMad:(heardMad&&vExpRole==='dog'),foeGot:got,foeMedium:null});
    });
    finish();return;
  }
}

/* 夜の判定（1Pの夜のあと） */
function resolveNight(){
  const A=G.V[1],B=G.V[2];
  const strike=(att,def)=>{
    if(!canAttack(att)||att.attackTarget===null)return null;
    const t=def.people[att.attackTarget];
    if(!t||!t.alive)return null;
    if(def.protectTarget===t.id)return{ok:false,t,why:'guard'};
    if(t.role==='wolf')return{ok:false,t,why:'wolf'};
    t.alive=false;att.fed=true;return{ok:true,t};
  };
  const rA=strike(A,B),rB=strike(B,A);
  const report=(v,mine,theirs)=>{
    if(mine){if(mine.ok)log(v,`${mine.t.name}を襲撃した。息絶えた。`,'kill');
             else log(v,`${mine.t.name}を襲撃したが、失敗した。理由は分からない。`)}
    else log(v,`こちらからの襲撃はなかった。`,'none');
    if(theirs){
      if(theirs.ok)log(v,`${theirs.t.name}が襲撃された。${theirs.t.name}は死んだ。`,'kill');
      else if(theirs.why==='wolf')log(v,`${theirs.t.name}が襲撃された。${theirs.t.name}は人狼なので襲撃を逃れた。`);
      else log(v,`${theirs.t.name}が襲撃された。${theirs.t.name}は護衛に守られた。`);
    }else log(v,`襲撃は無かったようだ。`,'none');
  };
  report(A,rA,rB);report(B,rB,rA);
  // 霊媒の札：取得していて霊媒師が生きていて留守でなく、倒せた相手がいれば正体が分かる
  const mediumWork=(att,r)=>{
    att._mediumHit=null;
    if(!att.mediumFound)return;
    const med=mediumOf(att);
    if(!med||!med.alive||att.explorer===med.id)return;
    if(r&&r.ok){
      att.mediumResult='昨晩倒した'+r.t.name+'は、'+ROLE_LABEL[r.t.role]+'だった。';
      att._mediumHit={name:r.t.name,role:ROLE_LABEL[r.t.role]};
      log(att,'霊媒の札が働いた。'+r.t.name+'は'+ROLE_LABEL[r.t.role]+'だった。','hintline');
    }else{
      att.mediumResult='霊媒の札は働いたが、昨晩は誰も倒せなかった。';
      log(att,'霊媒の札は働いたが、昨晩は誰も倒せず、正体は分からなかった。');
    }
  };
  mediumWork(A,rA);mediumWork(B,rB);
  [[A,rA],[B,rB]].forEach(([v,r])=>{const e=G.V[other(v.id)];
    const hear=v._todayHear||{};
    const heardMad=(hear.madHit||0)>=1;
    const vExpRole=(v.explorer!==null&&v.people[v.explorer])?v.people[v.explorer].role:null;
    const got=[];
    if(e.permitFound)got.push('護衛届');
    if(e.madClawFound)got.push('狂人の爪');
    if(e.mediumFound)got.push('霊媒の札');
    v.reveal.push({day:G.day,hasNight:true,wolfAct:wolfActOf(e),
      failWhy:(r&&!r.ok)?r.why:null,failTarget:(r&&!r.ok)?r.t.name:null,
      protect:(e.protectTarget!==null&&e.protectTarget!==undefined)?e.people[e.protectTarget].name:null,
      heardMad:heardMad,dogHeardMad:(heardMad&&vExpRole==='dog'),
      foeGot:got,
      foeMedium:e._mediumHit?('相手は霊媒の札で、'+e._mediumHit.name+'が'+e._mediumHit.role+'だと見抜いていた。'):null});
  });
  G.publicLog.push({day:G.day,a:rB&&rB.ok?rB.t.name:null,b:rA&&rA.ok?rA.t.name:null});
}
function applyReveal(v){
  v.reveal.forEach(r=>{
    const d=v.log.find(x=>x.day===r.day);if(!d)return;
    const add=t=>d.lines.push({t:'◇ '+t,cls:'reveal-line'});
    add(`相手の人狼は${r.wolfAct}。`);
    if(!r.hasNight){
      if(r.heardMad){
        if(r.dogHeardMad)add('相手の狂人の爪研ぎを、あなたは犬飼いで聞き分けていた。');
        else add('あの日の音には、相手の狂人の爪研ぎが混じっていた。');
      }
      if(r.foeGot&&r.foeGot.length)add('相手はこの日、'+r.foeGot.join('と')+'を取っていた。');
      return;
    }
    if(r.failWhy==='guard')add(`${r.failTarget}への襲撃は、護衛に守られて失敗していた。`);
    if(r.failWhy==='wolf')add(`${r.failTarget}は相手の人狼だった。あの襲撃は空振りだった。`);
    add(r.protect?`相手は${r.protect}を護衛していた。`:`相手はこの夜、誰も護衛していなかった。`);
    if(r.heardMad){
      if(r.dogHeardMad)add('相手の狂人の爪研ぎを、あなたは犬飼いで聞き分けていた。');
      else add('あの日の音には、相手の狂人の爪研ぎが混じっていた。');
    }
    if(r.foeGot&&r.foeGot.length)add('相手はこの日、'+r.foeGot.join('と')+'を取っていた。');
    if(r.foeMedium)add(r.foeMedium);
  });
}
function finish(){
  [1,2].forEach(p=>{const v=G.V[p],w=wolfOf(v);
    if(w.alive&&!v.fed&&!G.instantWin){w.alive=false;log(v,`自村の人狼${w.name}は一度も食べられず、飢えて死んだ。`,'kill')}});
  [1,2].forEach(p=>applyReveal(G.V[p]));
  G.done=true;G.idx=G.sched.length-1;
  hideVeil();
}
function nextFromMorning(){ if(G.day>=DAYS)finish(); else advance() }

/* ================= パネル ================= */
function renderPanel(){
  const el=document.getElementById('panel'),c=cur(),w=who();
  const H=(h,b)=>`<h3>${h}</h3>${b}`;
  const v=w?me():null,o=w?opp():null;
  const tag=G.mode==='cpu'?'':`${v?v.id:''}P・`;

  if(c.ph==='place'){
    const p=v.people[v.placeIdx];
    el.innerHTML=H(`${tag}配置`,`
      <p class="lead"><b>${p.name}（${ROLE_LABEL[p.role]}）</b>をどの家に住まわせる？ <b>自分の村の地図</b>で選ぶ。</p>
      <p>一度決めたら3夜のあいだ動かせない。</p>
      <p style="color:var(--kinari-faint)">残り ${5-v.placeIdx} 人</p>`);return;
  }
  if(c.ph==='pit'){
    const placed=!!v.pitEdge;
    el.innerHTML=H(`${tag}落とし穴を仕掛ける`,`
      <p class="lead"><b>自分の村の地図</b>で、道を1本選んで落とし穴を仕掛ける。相手の探索者がその道を通ると、<b>その時持っている護衛届・狂人の爪・霊媒の札を全部落とす</b>。</p>
      <p>相手は一度その道を通るまで、落とし穴の場所を知らない。落ちた後は相手にも見える。アイテムを取る前に通られると落とせないので、<b>アイテムのある家から出る道</b>に仕掛けると効きやすい。一度決めたら変えられない。</p>
      ${placed?`<p class="good">${(function(){const [a,b]=v.pitEdge.split('-');return houseName(v,a)+'〜'+houseName(v,b)})()}の道に仕掛けた。</p>`:`<p style="color:var(--kinari-faint)">道（点線）をタップして選ぶ。</p>`}
      <div class="btnrow"><button class="primary" onclick="confirmPit()" ${placed?'':'disabled'}>これでいく</button></div>`);return;
  }
  if(c.ph==='explorer'){
    let med='';
    if(v.mediumResult){med=`<div class="notice"><b>${v.mediumResult}</b></div>`;}
    let extra='';
    if(G.opt&&G.opt.madmanDog)extra+='<p>犬飼いを送ると、狂人の贋物を無視して<b>人狼の爪の音だけ</b>を聞き分けられる。狂人を送ると、その夜は狂人の爪が鳴らない。</p>';
    el.innerHTML=H(`${G.day}日目・昼　探索者を選ぶ`,`
      ${med}
      <p class="lead">相手の村へ送る探索者を1人選ぶ。<b>互いに伏せて選ぶ</b>ので、相手が誰を出すかはまだ分からない。</p>
      <p><b>探索から帰った者は疲れて眠る。</b>その夜、能力は使えない。人狼を送れば襲撃できず、護衛を送れば守れず、霊媒師を送れば札は働かない。一般村人には夜の役目がないので、影響はない。</p>
      <p>ただし人狼を送り、相手の爪研ぎ3ティックすべてに居合わせれば<b>その場で勝てる</b>。</p>
      ${extra}
      <div class="chips">${alive(v).map(p=>
        `<div class="chip" onclick="chooseExplorer(${p.id})">${p.name}<small>${ROLE_LABEL[p.role]}</small></div>`).join('')}</div>`);return;
  }
  if(c.ph==='route'){
    const mine=v.people[v.explorer],theirs=o.people[o.explorer];
    const tickRow=[1,2,3,4,5].map(i=>{const h=v.route[i-1];
      return `<div class="tick ${h?'done':''}">${i}　${h?houseName(o,h):'—'}</div>`}).join('');
    if(v.routeDone){
      // 経路が5ティック確定。取得アイテムをまとめて確認してから進む
      const got=[];
      if(v.permitFound)got.push('護衛届');
      if(v.madClawFound)got.push('狂人の爪');
      if(v.mediumFound)got.push('霊媒の札');
      const gotLine = got.length
        ? `<div class="notice"><b>手に入れたもの：${got.join('、')}</b><span class="where">${v.route.map(h=>houseName(o,h)).join(' → ')}</span></div>`
        : `<div class="notice quiet"><b>この探索では、何も手に入らなかった。</b><span class="where">${v.route.map(h=>houseName(o,h)).join(' → ')}</span></div>`;
      el.innerHTML=H(`${G.day}日目・昼　経路が決まった`,`
        ${gotLine}
        <p class="lead">${mine.name}は5軒を回り終えた。</p>
        <div class="ticks">${tickRow}</div>
        <div class="btnrow"><button class="primary" onclick="confirmRoute()">昼へ進む</button></div>`);
      return;
    }
    el.innerHTML=H(`${G.day}日目・昼　経路を組む（${v.route.length}/${TICKS}）`,`
      ${v.notice?`<div class="notice">${v.notice}</div>`:''}
      <p class="lead">こちらの探索者は <b>${mine.name}</b>、相手から来ているのは <b>${theirs.name}</b>。</p>
      <p>${mine.name}が回る家を、<b>相手の村の地図</b>で1つずつ選ぶ。同じ家に留まるのも1ティック。5軒すべて回れば護衛届は必ず見つかるが、2ティック留まらないと爪研ぎは妨げられない。</p>
      <div class="ticks">${tickRow}</div>
      <p class="warn" style="font-size:13px">選んだ家は戻せない。護衛届はその場で判定される。</p>`);return;
  }
  if(c.ph==='ticks'){
    const wl=wolfOf(v),s=v.sharpenStart,st=sharpenTicks(v);
    const row=[1,2,3,4,5].map(i=>{let cl='tick';
      if(i<=G.tickIdx)cl+=' done';
      if(st.includes(i))cl+=' claw';
      if(i<=G.tickIdx&&st.includes(i)&&o.route[i-1]===wl.house)cl+=' seen';
      if(i===G.tickIdx+1)cl+=' now';
      const nm=i<=G.tickIdx?(personAt(v,o.route[i-1])?personAt(v,o.route[i-1]).name:HLABEL[o.route[i-1]]):'—';
      return `<div class="${cl}"><b>${i}</b><span>${nm}</span></div>`}).join('');
    let b=`<p class="lead">${o.people[o.explorer].name}の位置が、1ティックずつ明らかになる。表示は自分の村での位置。</p>
      <div class="ticks">${row}</div>`;
    if(!wl.alive)b+=`<p>自村の人狼はもういない。</p>`;
    else if(v.explorer===wl.id)b+=`<p>人狼は探索に出ている。今夜は襲撃できない。</p>`;
    else if(s!==null){
      const seen=overlapSoFar(v,o.route);
      if(v.spoiled)b+=`<p class="warn">研ぎを2度見られた。今夜の襲撃はできない。</p>`;
      else{b+=`<p class="warn">ティック${s}〜${s+SHARPEN-1}で爪を研いでいる。止められない。${seen?`（すでに${seen}度、居合わせられた）`:''}</p>`;
        if(seen>=SPOIL)b+=`<p class="warn">あと1度居合わせられ、あの訪問者が人狼だったら、この村は負ける。</p>`}
    }
    else if(canSharpen()){/* 説明はボタンに集約 */}
    else b+=`<p class="dim">もう研ぎ始められない。今夜の襲撃は放棄になる。</p>`;

    // 狂人の爪：人狼が留守の夜は、狂人を独自に研がせる操作を出す
    const md=madmanOf(v);
    if(madManualNeeded(v)){
      const ms=v.madStart, mst=madSharpenTicks(v);
      const mrow=[1,2,3,4,5].map(i=>{let cl='tick';
        if(i<=G.tickIdx)cl+=' done';
        if(mst.includes(i))cl+=' claw';
        if(i===G.tickIdx+1)cl+=' now';
        return `<div class="${cl}">${i}</div>`}).join('');
      const madHouseName=md?(personAt(v,md.house)?personAt(v,md.house).name:HLABEL[md.house]):'';
      b+=`<div class="madsec">
        <div class="madhead"><b>狂人の爪</b>（${madHouseName}）
          <button class="mini" onclick="G._madHelp=!G._madHelp;render()">${G._madHelp?'閉じる':'？'}</button></div>`;
      if(G._madHelp)b+=`<p class="dim small">人狼とは別に狂人を研がせられる。人狼に研がせず狂人だけ鳴らせば、相手を狼の家から遠ざけられる。捕まっても何も起きない。</p>`;
      if(ms!==null)b+=`<p class="good">狂人はティック${ms}〜${Math.min(ms+SHARPEN-1,TICKS)}で研いでいる。</p>`;
      b+=`<div class="ticks">${mrow}</div>`;
      if(ms===null&&canSharpenMad(v))b+=`<div class="btnrow"><button class="danger" onclick="startSharpenMad()">狂人を研がせる</button></div>`;
      b+=`</div>`;
    }

    b+=`<div class="btnrow tickbtns">`;
    if(v.tickDone){
      b+=`<button class="primary" onclick="finishDay()">昼を終える</button>`;
    }else{
      if(canSharpen())b+=`<button class="danger" onclick="startSharpen()">爪を研ぐ</button>`;
      b+=`<button class="primary" onclick="advanceTick()">次へ</button>`;
    }
    b+=`</div>`;
    const head = v.tickDone
      ? `${G.day}日目・昼　5ティック目まで明けた`
      : `${G.day}日目・昼　ティック ${G.tickIdx}/${TICKS}`;
    el.innerHTML=H(head,b);return;
  }
  if(c.ph==='night'){
    let b='';
    if(v.heardToday!==null){
      const where=[...new Set(v.route)].map(h=>houseName(o,h)).join('・');
      const exRole=v.people[v.explorer]?v.people[v.explorer].role:null;
      if(exRole==='dog'){
        b+=v.heardToday
          ? `<div class="notice"><b>犬が反応した。人狼の爪を研ぐ音がした。</b>狂人の贋物ではない。相手の人狼は、今日犬飼いが入った家のどれかにいる。<span class="where">回った家：${where}</span></div>`
          : `<div class="notice quiet"><b>犬は人狼の爪の音を捉えなかった。</b>相手が研がなかったか、居合わせなかったか。<span class="where">回った家：${where}</span></div>`;
      }else{
        b+=v.heardToday
          ? `<div class="notice"><b>探索の途中、どこかで爪を研ぐ音を聞いた。</b>ただし狂人の贋物かもしれない。今日${v.people[v.explorer].name}が入った家のどれかで鳴った。<span class="where">回った家：${where}</span></div>`
          : `<div class="notice quiet"><b>探索の途中、怪しい音はなかった。</b>相手が研がなかったか、居合わせなかったかは分からない。<span class="where">回った家：${where}</span></div>`;
      }
    }
    if(canAttack(v)){
      b+=`<p class="lead">爪は研げた。相手の村の誰を襲う？ 下のチップか、相手の村の地図の家をタップして選ぶ。人狼を狙うと空振りになる。</p>
        <div class="chips">${alive(o).map(p=>
          `<div class="chip ${v.attackTarget===p.id?'sel':''}" onclick="G.V[${v.id}].attackTarget=${p.id};render()">${p.name}<small>${HLABEL[p.house]}の家</small></div>`).join('')}</div>`;
    }else b+=`<p class="warn">今夜、こちらから襲撃はできない。${v.spoiled?'研ぎを見られた。':''}</p>`;
    if(canProtect(v)){
      b+=`<p class="good">護衛届がある。味方1人を守れる（護衛自身と人狼は守れない）。</p>
        <div class="chips">${alive(v).filter(p=>p.role!=='guard'&&p.role!=='wolf').map(p=>
          `<div class="chip ${v.protectTarget===p.id?'sel':''}" onclick="G.V[${v.id}].protectTarget=${p.id};render()">${p.name}<small>${ROLE_LABEL[p.role]}</small></div>`).join('')}</div>`;
    }else{b+=`<p class="${guardAway(v)?'warn':''}">護衛は使えない。${protectReason(v)}</p>`;v.protectTarget=null}
    const need=canAttack(v)&&v.attackTarget===null;
    b+=`<div class="btnrow"><button class="primary" onclick="confirmNight()" ${need?'disabled':''}>夜を明かす</button></div>`;
    el.innerHTML=H(`${G.day}日目・夜${G.mode==='cpu'?'':`　（${v.id}P）`}`,b);return;
  }
  if(c.ph==='morning'){
    const r=G.publicLog.find(x=>x.day===G.day)||{};
    const n1=G.mode==='cpu'?'自分の村':'1Pの村', n2=G.mode==='cpu'?'相手の村':'2Pの村';
    el.innerHTML=H(`${G.day}日目・夜明け`,`
      <p class="lead">${n1}：${r.a?`<b>${r.a}</b>が死んだ。`:'誰も欠けていない。'}</p>
      <p class="lead">${n2}：${r.b?`<b>${r.b}</b>が死んだ。`:'誰も欠けていない。'}</p>
      <p>失敗の理由は、襲われた側にしか分からない。</p>
      <div class="btnrow"><button class="primary" onclick="nextFromMorning()">${G.day>=DAYS?'決着を見る':'次の日へ'}</button></div>`);return;
  }
  if(c.ph==='end'){
    const a=alive(G.V[1]).length,f=alive(G.V[2]).length;
    const nm=p=>G.mode==='cpu'?(p===1?'あなた':'CPU'):`${p}P`;
    let verdict,head,note='';
    if(G.instantWin){head=`${G.day}日目の昼、決着した`;
      if(G.instantWin==='draw'){verdict='引き分け';note='双方の人狼が同時に暴かれた。'}
      else{verdict=G.mode==='cpu'?(G.instantWin===1?'勝ち':'負け'):`${G.instantWin}P の勝ち`;
        note=`${nm(other(G.instantWin))}の人狼が暴かれた。生存数は問わない。`}
    }else{head='3夜が明けた';
      verdict=G.mode==='cpu'?(a>f?'勝ち':a<f?'負け':'引き分け')
                            :(a>f?'1P の勝ち':a<f?'2P の勝ち':'引き分け')}
    el.innerHTML=`<div class="final">
      <div class="sub">${head}</div>
      <div class="score">${a} — ${f}</div>
      <div class="verdict">${verdict}</div>
      ${note?`<p style="color:var(--kinari-dim);margin-top:8px">${note}</p>`:''}
      <p style="color:var(--midori);margin-top:6px;font-size:13px">覚え書きに、伏せられていたことを書き足した。</p>
      <div class="btnrow" style="justify-content:center;margin-top:18px">
        <button onclick="G.endView=1;render()">${nm(1)}の覚え書き</button>
        <button onclick="G.endView=2;render()">${nm(2)}の覚え書き</button>
        <button class="primary" onclick="showTitle()">もう一度</button>
      </div>
      <div class="reveal">
        ${nm(1)}の村：${G.V[1].people.map(p=>`${p.name}（${ROLE_LABEL[p.role]}${p.alive?'':'・死亡'}）`).join('　')}<br>
        ${nm(2)}の村：${G.V[2].people.map(p=>`${p.name}（${ROLE_LABEL[p.role]}${p.alive?'':'・死亡'}）`).join('　')}
      </div></div>`;return;
  }
}
if(window.addEventListener)window.addEventListener('resize',()=>{if(G)render()});

// グローバル関数の公開（online.jsから使用）
window.showTitle = showTitle;
window.newGame = newGame;
window.render = render;
window.G = G;
window.TITLE_OPT = TITLE_OPT;

showTitle();
