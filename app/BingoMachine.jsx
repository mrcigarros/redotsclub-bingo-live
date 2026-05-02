"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { CARDS_250 } from "../lib/cards";
import { supabase, SUPABASE_READY } from "../lib/supabase";

const MAX_NUMBER = 75;
const LETTERS = ["B", "I", "N", "G", "O"];
const LETTER_RANGES = { B: [1, 15], I: [16, 30], N: [31, 45], G: [46, 60], O: [61, 75] };
const LS_KEY = "redotsclub-bingo-v2";

// RedotsClub Global Brand
const C = {
  bg: "#0A0A0F",
  surface: "#121218",
  card: "#1A1A22",
  pink: "#FF1B64",
  pinkLight: "#FFB7F2",
  pinkDim: "#CC1550",
  black: "#000000",
  white: "#FFFFFF",
  muted: "#6B6E82",
  border: "#2A2A3A",
};
const LETTER_COLORS = [C.pink, C.white, C.pinkLight, C.pink, C.white];
const getLetter = (n) => { if (!n) return ""; if (n <= 15) return "B"; if (n <= 30) return "I"; if (n <= 45) return "N"; if (n <= 60) return "G"; return "O"; };
const getLetterIdx = (n) => LETTERS.indexOf(getLetter(n));
const getBallColor = (n) => LETTER_COLORS[getLetterIdx(n)] || C.white;

// ============================================================
// Hot card analysis — runs on every draw to spot near-winners
// ============================================================
function analyzeCards(calledNumbers) {
  const cs = new Set(calledNumbers); cs.add(0);
  let bingo = 0, hot4 = 0, warm3 = 0;
  const winners = [];
  for (let ci = 0; ci < CARDS_250.length; ci++) {
    const card = CARDS_250[ci];
    const m = [];
    for (let r = 0; r < 5; r++) { const row = []; for (let col = 0; col < 5; col++) row.push(cs.has(card[col][r])); m.push(row); }
    let best = 0;
    for (let r = 0; r < 5; r++) { let c = 0; for (let col = 0; col < 5; col++) if (m[r][col]) c++; best = Math.max(best, c); }
    for (let col = 0; col < 5; col++) { let c = 0; for (let r = 0; r < 5; r++) if (m[r][col]) c++; best = Math.max(best, c); }
    { let c = 0; for (let i = 0; i < 5; i++) if (m[i][i]) c++; best = Math.max(best, c); }
    { let c = 0; for (let i = 0; i < 5; i++) if (m[i][4-i]) c++; best = Math.max(best, c); }
    { let c = 0; if (m[0][0]) c++; if (m[0][4]) c++; if (m[4][0]) c++; if (m[4][4]) c++; best = Math.max(best, c); }
    if (best >= 5) { bingo++; winners.push(ci + 1); }
    else if (best >= 4) hot4++;
    else if (best >= 3) warm3++;
  }
  return { bingo, hot4, warm3, total: CARDS_250.length, winners };
}

// ============================================================
// Voice characters — edit this list freely
// ============================================================
const VOICE_CHARACTERS = [
  { id: "radialist", name: "Cool Radialist", emoji: "🎙️", desc: "Smooth FM vibes", pitch: 0.85, rate: 0.75 },
  { id: "rodeo", name: "Rodeo Narrator", emoji: "🤠", desc: "Yeehaw energy", pitch: 1.1, rate: 1.0 },
  { id: "scammer", name: "Indian Scammer", emoji: "📞", desc: "Hello sir...", pitch: 1.3, rate: 1.15 },
  { id: "warden", name: "Prison Warden", emoji: "🔒", desc: "No funny business", pitch: 0.7, rate: 0.85 },
  { id: "grandpa", name: "Angry Grandpa", emoji: "👴", desc: "Back in my day...", pitch: 0.95, rate: 0.9 },
];
const FALLBACK_LINES = {
  radialist:{getLine:(l,n)=>[`And sliding in smooth... ${l}... ${n}`,`Coming at you live... ${l}... ${n}`,`That\'s right baby... ${l}... ${n}`,`Smooth like butter... ${l}... ${n}`][Math.floor(Math.random()*4)]},
  rodeo:{getLine:(l,n)=>[`Yeee-haw! ${l}... ${n}!`,`Hold onto your hats! ${l}... ${n}!`,`Hot diggity dog! ${l}... ${n}!`,`Whoooo-eeee! ${l}... ${n}!`][Math.floor(Math.random()*4)]},
  scammer:{getLine:(l,n)=>[`Sir, your number is ${l}... ${n}`,`Sir... please listen... ${l}... ${n}`,`Calling from bingo department... ${l}... ${n}`,`Your account shows ${l}... ${n}`][Math.floor(Math.random()*4)]},
  warden:{getLine:(l,n)=>[`Listen up... ${l}... ${n}... nobody move`,`${l}... ${n}... that\'s an order`,`${l}... ${n}... mark it or solitary`,`I said ${l}... ${n}... did I stutter?`][Math.floor(Math.random()*4)]},
  grandpa:{getLine:(l,n)=>[`What?! ${l}... ${n}?! Ridiculous!`,`${l}... ${n}... back in my day!`,`Oh for crying out loud... ${l}... ${n}!`,`${l}... ${n}... hurry up!`][Math.floor(Math.random()*4)]},
};
const useVoice=()=>{const sr=useRef(null);useEffect(()=>{const ld=()=>{const v=window.speechSynthesis?.getVoices()||[];sr.current=v.find(x=>x.lang.startsWith("en"))||v[0]||null;};if(window.speechSynthesis){ld();window.speechSynthesis.onvoiceschanged=ld;}},[]);const fb=useCallback((t,ch)=>{if(!window.speechSynthesis)return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.pitch=ch.pitch;u.rate=ch.rate;u.volume=1;if(sr.current)u.voice=sr.current;window.speechSynthesis.speak(u);},[]);const announce=useCallback(async(num,ch)=>{window.speechSynthesis?.cancel();const l=getLetter(num);const f=FALLBACK_LINES[ch.id];if(f)fb(f.getLine(l,num),ch);},[fb]);const intro=useCallback(async(ch)=>{window.speechSynthesis?.cancel();},[]);const stop=useCallback(()=>{window.speechSynthesis?.cancel();},[]);return{announce,intro,stop};};

// ============================================================
// Sound effects (oscillator-based, no audio files needed)
// ============================================================
const useSound=()=>{const cx=useRef(null);const gc=()=>{if(!cx.current)cx.current=new(window.AudioContext||window.webkitAudioContext)();return cx.current;};const t=(f,d,tp="sine",v=.15)=>{try{const c=gc(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=f;o.type=tp;g.gain.setValueAtTime(v,c.currentTime);g.gain.exponentialRampToValueAtTime(.01,c.currentTime+d);o.start(c.currentTime);o.stop(c.currentTime+d);}catch(e){}};return{call:()=>{t(523,.1,"sine",.25);setTimeout(()=>t(659,.1,"sine",.25),100);setTimeout(()=>t(784,.15,"sine",.3),200);},roll:()=>t(180+Math.random()*350,.04,"triangle",.1),reset:()=>{t(400,.1,"sine",.12);setTimeout(()=>t(300,.15,"sine",.08),80);},win:()=>{[523,659,784,1047].forEach((f,i)=>setTimeout(()=>t(f,.18,"sine",.3),i*120));}};};

// ============================================================
// Visual components (ball, board, panels, modals)
// ============================================================
const BigBall=({number,isRolling})=>{
  if(!number)return(<div style={{width:130,height:130,borderRadius:"50%",background:`radial-gradient(circle at 38% 32%,#2a2a3a,#0a0a0f)`,border:`3px solid ${C.pink}25`,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:44,color:"rgba(255,255,255,.05)",fontWeight:800,fontFamily:"var(--fH)"}}>?</span></div>);
  const l=getLetter(number),bc=getBallColor(number),w=bc===C.white;
  return(<div style={{width:130,height:130,animation:isRolling?"pulse .25s infinite":"ballPop .5s cubic-bezier(.34,1.56,.64,1)"}}>
    <svg viewBox="0 0 130 130" width={130} height={130}><defs><radialGradient id="bBg" cx="38%" cy="28%"><stop offset="0%" stopColor="#fff" stopOpacity=".92"/><stop offset="38%" stopColor={bc} stopOpacity=".72"/><stop offset="100%" stopColor={bc}/></radialGradient><filter id="bGl"><feGaussianBlur stdDeviation="5" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter></defs>
      <circle cx="65" cy="65" r="61" fill="url(#bBg)" stroke={w?C.muted:bc} strokeWidth="2.5" filter="url(#bGl)"/><ellipse cx="65" cy="65" rx="42" ry="26" fill="white" opacity=".96"/>
      <text x="65" y="52" textAnchor="middle" fill={w?C.pink:bc===C.pinkLight?"#333":"#fff"} fontSize="22" fontWeight="900" fontFamily="var(--fH)">{l}</text>
      <text x="65" y="80" textAnchor="middle" fill="#111" fontSize="32" fontWeight="900" fontFamily="var(--fH)">{number}</text></svg></div>);
};

const NumberBoard=({calledNumbers,latestNumber})=>{const cs=new Set(calledNumbers);return(<div style={{background:C.card,borderRadius:18,border:`2px solid ${C.pink}20`,padding:"14px 6px",width:"100%"}}><div style={{display:"flex"}}>{LETTERS.map((letter,li)=>{const[lo]=LETTER_RANGES[letter],cc=LETTER_COLORS[li];return(<div key={letter} style={{flex:1}}><div style={{textAlign:"center",fontSize:22,fontWeight:800,color:cc,fontFamily:"var(--fH)",padding:"2px 0 8px",textShadow:cc===C.pink?`0 0 10px ${C.pink}30`:"none",borderBottom:`2px solid ${cc}30`,marginBottom:4}}>{letter}</div><div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>{Array.from({length:15},(_,i)=>{const num=lo+i,called=cs.has(num),latest=num===latestNumber;return(<div key={num} style={{width:"90%",textAlign:"center",fontSize:18,fontWeight:800,fontFamily:"var(--fH)",padding:"5.5px 0",margin:"1.5px 0",borderRadius:9,color:called?"#fff":"rgba(255,255,255,.35)",background:called?(cc===C.pinkLight?"#8B3A6B":cc):"transparent",boxShadow:latest?`0 0 18px ${cc}55`:"none",transform:latest?"scale(1.1)":"scale(1)",transition:"all .3s"}}>{num}</div>);})}</div></div>);})}</div></div>);};

const HotCardsPanel=({stats})=>{if(!stats)return null;const{bingo,hot4,warm3,total,winners}=stats,any=bingo>0||hot4>0;return(<div style={{background:any?`linear-gradient(135deg,${C.pink}15,rgba(0,0,0,.3))`:C.card,borderRadius:14,border:`1px solid ${any?C.pink+"35":C.border}`,padding:"10px 14px",width:"100%",marginBottom:10,boxShadow:bingo>0?`0 0 20px ${C.pinkLight}20`:"none"}}>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
    <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:14}}>🔥</span><span style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:2}}>HOT CARDS</span></div>
    <span style={{fontSize:9,color:C.muted}}>/ {total} cards</span>
  </div>
  <div style={{display:"flex",gap:6}}>{[{v:bingo,l:"BINGO!",c:C.pinkLight},{v:hot4,l:"4/5 HOT",c:C.pink},{v:warm3,l:"3/5 WARM",c:C.white}].map(({v,l,c},i)=>(<div key={i} style={{flex:1,textAlign:"center",padding:"8px 4px",background:v>0&&i<2?`${c}12`:"rgba(255,255,255,.02)",border:`1px solid ${v>0&&i<2?c+"30":C.border}`,borderRadius:10}}><div style={{fontSize:24,fontWeight:800,fontFamily:"var(--fH)",color:v>0?c:"rgba(255,255,255,.15)",lineHeight:1}}>{v}</div><div style={{fontSize:7,fontWeight:700,color:v>0?c:C.muted,letterSpacing:1.5,marginTop:3}}>{l}</div></div>))}</div>
  {bingo>0&&winners&&winners.length>0&&(<div style={{marginTop:10,padding:"8px 10px",background:`${C.pinkLight}10`,borderRadius:8,fontSize:11,color:C.pinkLight,fontFamily:"var(--fH)",fontWeight:700,letterSpacing:1}}>WINNING CARD #: {winners.slice(0,8).join(", ")}{winners.length>8?` +${winners.length-8}`:""}</div>)}
</div>);};

const VoiceModal=({open,onClose,selected,onSelect,voiceOn,onToggle})=>{if(!open)return null;return(<><div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)",zIndex:200}}/><div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:201,background:C.surface,borderTop:`2px solid ${C.pink}40`,borderRadius:"24px 24px 0 0",padding:"20px 16px 32px",maxWidth:900,margin:"0 auto",animation:"slideUp .3s ease-out"}}><div style={{width:40,height:4,borderRadius:2,background:C.border,margin:"0 auto 16px"}}/><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><div style={{fontSize:14,fontWeight:800,fontFamily:"var(--fH)",color:C.white}}>Choose Announcer</div><button onClick={onToggle} style={{background:voiceOn?`${C.pink}15`:"rgba(255,255,255,.03)",border:`1px solid ${voiceOn?C.pink:C.muted}30`,borderRadius:100,padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:14}}>{voiceOn?"🔊":"🔇"}</span><span style={{fontSize:10,fontWeight:700,color:voiceOn?C.pink:C.muted}}>{voiceOn?"ON":"OFF"}</span></button></div><div style={{display:"flex",flexDirection:"column",gap:6}}>{VOICE_CHARACTERS.map(vc=>{const a=selected===vc.id;return(<button key={vc.id} onClick={()=>{onSelect(vc.id);onClose();}} style={{width:"100%",padding:"14px 16px",background:a?`${C.pink}15`:"rgba(255,255,255,.02)",border:`1.5px solid ${a?C.pink:C.border}`,borderRadius:14,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,boxShadow:a?`0 0 16px ${C.pink}15`:"none"}}><span style={{fontSize:28}}>{vc.emoji}</span><div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,fontFamily:"var(--fH)",color:a?C.white:"rgba(255,255,255,.55)"}}>{vc.name}</div><div style={{fontSize:10,color:a?C.pink:C.muted,marginTop:2}}>{vc.desc}</div></div>{a&&<div style={{width:8,height:8,borderRadius:"50%",background:C.pink,boxShadow:`0 0 8px ${C.pink}60`}}/>}</button>);})}</div></div></>);};

// Resume modal — shown on mount when localStorage has a partial game
const ResumeModal=({open,calledCount,onResume,onDiscard})=>{if(!open)return null;return(<><div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",zIndex:300}}/><div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:301,background:C.surface,border:`2px solid ${C.pink}50`,borderRadius:20,padding:"28px 24px",maxWidth:340,width:"90%",boxShadow:`0 20px 60px ${C.pink}25`,textAlign:"center"}}>
  <div style={{fontSize:32,marginBottom:8}}>⏸</div>
  <div style={{fontSize:18,fontWeight:800,fontFamily:"var(--fH)",color:C.white,marginBottom:6}}>Resume previous game?</div>
  <div style={{fontSize:12,color:C.muted,marginBottom:20,lineHeight:1.5}}>You have a saved game with <span style={{color:C.pinkLight,fontWeight:700}}>{calledCount} balls</span> already drawn.</div>
  <div style={{display:"flex",gap:8}}>
    <button onClick={onDiscard} style={{flex:1,padding:"12px",fontSize:11,fontWeight:700,fontFamily:"var(--fH)",letterSpacing:2,border:`1px solid ${C.border}`,borderRadius:100,background:"rgba(255,255,255,.02)",color:C.muted,cursor:"pointer"}}>NEW GAME</button>
    <button onClick={onResume} style={{flex:1,padding:"12px",fontSize:11,fontWeight:800,fontFamily:"var(--fH)",letterSpacing:2,border:"none",borderRadius:100,background:`linear-gradient(160deg,${C.pink},${C.pinkDim})`,color:"#fff",cursor:"pointer",boxShadow:`0 0 20px ${C.pink}40`}}>RESUME</button>
  </div>
</div></>);};

// Sync status pill — top-right indicator showing Supabase connection state
const SyncStatus=({state,gameId})=>{const colors={offline:C.muted,connecting:"#FFA500",live:"#4ADE80",error:"#EF4444"};const labels={offline:"OFFLINE",connecting:"CONNECTING",live:"LIVE",error:"SYNC ERROR"};const c=colors[state]||C.muted;return(<div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",background:`${c}15`,border:`1px solid ${c}40`,borderRadius:100}}>
  <div style={{width:6,height:6,borderRadius:"50%",background:c,animation:state==="live"?"pulse 2s infinite":undefined}}/>
  <span style={{fontSize:9,fontWeight:700,color:c,letterSpacing:1.5,fontFamily:"var(--fH)"}}>{labels[state]}</span>
  {gameId&&state==="live"&&(<span style={{fontSize:8,color:C.muted,fontFamily:"monospace",marginLeft:4}}>#{gameId.slice(0,6)}</span>)}
</div>);};

// BINGO claim notifications — listens for card_claims with bingo_claimed_at set, shows in a queue
const BingoAlertOverlay=({alert,onDismiss})=>{
  if(!alert)return null;
  return(<><div onClick={onDismiss} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",zIndex:400}}/>
  <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:401,background:`linear-gradient(135deg,${C.pink},${C.pinkDim})`,borderRadius:24,padding:"36px 32px",maxWidth:420,width:"90%",boxShadow:`0 30px 80px ${C.pink}60`,textAlign:"center",animation:"ballPop .5s cubic-bezier(.34,1.56,.64,1)"}}>
    <div style={{fontSize:60,marginBottom:8,animation:"bingoSpin 1.2s ease-out"}}>🎉</div>
    <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,.9)",letterSpacing:4,fontFamily:"var(--fH)",marginBottom:6}}>BINGO CLAIMED</div>
    <div style={{fontSize:42,fontWeight:900,color:"#fff",fontFamily:"var(--fH)",lineHeight:1.1,marginBottom:8,letterSpacing:1}}>{alert.claimer_name}</div>
    <div style={{fontSize:18,fontWeight:800,color:"#fff",fontFamily:"var(--fH)",letterSpacing:2,opacity:.9,marginBottom:20}}>CARD #{alert.card_number}</div>
    <div style={{fontSize:11,color:"rgba(255,255,255,.85)",fontFamily:"var(--fH)",letterSpacing:1.5,marginBottom:24,lineHeight:1.5}}>Verify against the Hot Cards list →<br/>If card #{alert.card_number} is in the winners, it's legit!</div>
    <button onClick={onDismiss} style={{padding:"14px 32px",fontSize:13,fontWeight:800,fontFamily:"var(--fH)",letterSpacing:3,border:"none",borderRadius:100,background:"#fff",color:C.pink,cursor:"pointer"}}>DISMISS</button>
  </div></>);
};

// Hook: subscribe to bingo claims for current game
function useBingoAlerts(gameId){
  const[queue,setQueue]=useState([]);
  useEffect(()=>{
    if(!gameId||!SUPABASE_READY)return;
    const channel=supabase.channel(`alerts-${gameId}`)
      .on("postgres_changes",{
        event:"UPDATE",
        schema:"public",
        table:"card_claims",
        filter:`game_id=eq.${gameId}`,
      },(payload)=>{
        if(payload.new&&payload.new.bingo_claimed_at&&!payload.old?.bingo_claimed_at){
          setQueue(q=>[...q,{
            card_number:payload.new.card_number,
            claimer_name:payload.new.claimer_name,
            at:payload.new.bingo_claimed_at,
          }]);
        }
      })
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[gameId]);
  const dismiss=useCallback(()=>setQueue(q=>q.slice(1)),[]);
  return{current:queue[0]||null,dismiss,queueLength:queue.length};
}

// ============================================================
// Main component
// ============================================================
export default function RedotsClubBingo(){
  const[called,setCalled]=useState([]);
  const[cur,setCur]=useState(null);
  const[rolling,setRolling]=useState(false);
  const[auto,setAuto]=useState(false);
  const[vOn,setVOn]=useState(true);
  const[vId,setVId]=useState("radialist");
  const[showVM,setShowVM]=useState(false);
  const[gameId,setGameId]=useState(null);
  const[syncState,setSyncState]=useState("offline"); // offline | connecting | live | error
  const[showResume,setShowResume]=useState(false);
  const[hydrated,setHydrated]=useState(false);
  const[savedSnapshot,setSavedSnapshot]=useState(null);

  const timer=useRef(null);
  const histRef=useRef(null);
  const snd=useSound();
  const{announce,intro,stop:stopV}=useVoice();
  const ch=VOICE_CHARACTERS.find(v=>v.id===vId)||VOICE_CHARACTERS[0];
  const hot=useMemo(()=>called.length<4?null:analyzeCards(called),[called]);
  const bingoAlerts=useBingoAlerts(gameId);

  // ---- localStorage: hydrate on mount ----
  useEffect(()=>{
    try{
      const raw=localStorage.getItem(LS_KEY);
      if(raw){
        const data=JSON.parse(raw);
        if(data && Array.isArray(data.called) && data.called.length>0){
          setSavedSnapshot(data);
          setShowResume(true);
        }else if(data){
          // Restore preferences but no in-progress game
          if(data.vId)setVId(data.vId);
          if(typeof data.vOn==="boolean")setVOn(data.vOn);
        }
      }
    }catch(e){console.warn("[ls] hydrate failed",e);}
    setHydrated(true);
  },[]);

  // ---- localStorage: persist on every change (after hydration) ----
  useEffect(()=>{
    if(!hydrated)return;
    try{
      localStorage.setItem(LS_KEY,JSON.stringify({called,vId,vOn,gameId,savedAt:Date.now()}));
    }catch(e){console.warn("[ls] save failed",e);}
  },[called,vId,vOn,gameId,hydrated]);

  // ---- Supabase: create or resume a game ----
  const createGame = useCallback(async (initialCalled = [])=>{
    if(!SUPABASE_READY){setSyncState("offline");return null;}
    setSyncState("connecting");
    try{
      const{data,error}=await supabase
        .from("games")
        .insert({event_name:`Game ${new Date().toLocaleString("pt-BR")}`,called_numbers:initialCalled,active:true})
        .select()
        .single();
      if(error)throw error;
      setGameId(data.id);
      setSyncState("live");
      return data.id;
    }catch(e){
      console.error("[supabase] createGame failed",e);
      setSyncState("error");
      return null;
    }
  },[]);

  // ---- Supabase: write called_numbers on every draw ----
  const syncCalled = useCallback(async (gid, calledArr)=>{
    if(!SUPABASE_READY||!gid)return;
    try{
      const{error}=await supabase
        .from("games")
        .update({called_numbers:calledArr})
        .eq("id",gid);
      if(error)throw error;
      setSyncState("live");
    }catch(e){
      console.error("[supabase] syncCalled failed",e);
      setSyncState("error");
    }
  },[]);

  // ---- Resume modal handlers ----
  const handleResume=useCallback(async()=>{
    if(!savedSnapshot){setShowResume(false);return;}
    setCalled(savedSnapshot.called||[]);
    if(savedSnapshot.vId)setVId(savedSnapshot.vId);
    if(typeof savedSnapshot.vOn==="boolean")setVOn(savedSnapshot.vOn);

    // If there was a gameId, try to keep using it; if it doesn't exist anymore, create a new one
    if(savedSnapshot.gameId&&SUPABASE_READY){
      setSyncState("connecting");
      try{
        const{data,error}=await supabase.from("games").select("id").eq("id",savedSnapshot.gameId).maybeSingle();
        if(error||!data){
          // game was deleted, create fresh one with the saved called numbers
          await createGame(savedSnapshot.called||[]);
        }else{
          setGameId(savedSnapshot.gameId);
          // re-sync the called numbers in case they drifted
          await syncCalled(savedSnapshot.gameId,savedSnapshot.called||[]);
        }
      }catch(e){console.error(e);setSyncState("error");}
    }
    setShowResume(false);
  },[savedSnapshot,createGame,syncCalled]);

  const handleDiscard=useCallback(()=>{
    setSavedSnapshot(null);
    setShowResume(false);
    try{localStorage.removeItem(LS_KEY);}catch(e){}
  },[]);

  // ---- Auto-create game on first call if none exists ----
  const ensureGame=useCallback(async()=>{
    if(gameId)return gameId;
    return await createGame([]);
  },[gameId,createGame]);

  // ---- The "Call!" button ----
  const callNum=useCallback(()=>{
    if(rolling)return;
    setRolling(true);
    let rc=0;
    const ri=setInterval(()=>{
      setCur(Math.floor(Math.random()*MAX_NUMBER)+1);
      snd.roll();
      rc++;
      if(rc>=10){
        clearInterval(ri);
        setCalled(prev=>{
          const av=[];for(let i=1;i<=MAX_NUMBER;i++)if(!prev.includes(i))av.push(i);
          if(!av.length){setRolling(false);return prev;}
          const num=av[Math.floor(Math.random()*av.length)];
          setCur(num);
          setRolling(false);
          snd.call();
          if(vOn){const c=VOICE_CHARACTERS.find(v=>v.id===vId)||VOICE_CHARACTERS[0];announce(num,c);}
          const nextCalled=[...prev,num];
          // fire & forget: ensure game exists, then sync
          (async()=>{const gid=await ensureGame();if(gid)syncCalled(gid,nextCalled);})();
          return nextCalled;
        });
      }
    },70);
  },[rolling,snd,vOn,vId,announce,ensureGame,syncCalled]);

  // ---- Auto-call timer ----
  useEffect(()=>{
    if(auto&&called.length<MAX_NUMBER&&!showResume){
      const c=VOICE_CHARACTERS.find(v=>v.id===vId)||VOICE_CHARACTERS[0];
      const ms=c.id==="scammer"||c.id==="grandpa"?5000:c.id==="radialist"?4500:4000;
      timer.current=setInterval(callNum,ms);
    }
    return()=>clearInterval(timer.current);
  },[auto,called.length,callNum,vId,showResume]);

  useEffect(()=>{if(called.length>=MAX_NUMBER)setAuto(false);},[called.length]);
  useEffect(()=>{if(histRef.current)histRef.current.scrollLeft=histRef.current.scrollWidth;},[called.length]);

  // ---- Win celebration sound trigger ----
  const prevBingoCount=useRef(0);
  useEffect(()=>{
    const cur=hot?.bingo||0;
    if(cur>prevBingoCount.current&&cur>0){snd.win();}
    prevBingoCount.current=cur;
  },[hot,snd]);

  // ---- Reset game (also marks the Supabase game inactive) ----
  const reset=useCallback(async()=>{
    stopV();
    setCalled([]);
    setCur(null);
    setRolling(false);
    setAuto(false);
    snd.reset();
    if(gameId&&SUPABASE_READY){
      try{await supabase.from("games").update({active:false}).eq("id",gameId);}catch(e){}
    }
    setGameId(null);
    setSyncState("offline");
    try{localStorage.removeItem(LS_KEY);}catch(e){}
  },[stopV,snd,gameId]);

  const pickV=(id)=>{setVId(id);if(vOn){const c=VOICE_CHARACTERS.find(v=>v.id===id);if(c)intro(c);}};
  const done=called.length>=MAX_NUMBER;

  // ---- Open Lobby (QR view) in a new window ----
  const openLobby=async()=>{
    const gid=await ensureGame();
    if(gid){
      window.open(`/lobby?g=${gid}`,"_blank","width=900,height=900");
    }else{
      alert("Could not create game — Supabase not connected. Check console.");
    }
  };

  return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"var(--fB)"}}>
    <style suppressHydrationWarning dangerouslySetInnerHTML={{__html:`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=DM+Sans:wght@400;500;700&display=swap');:root{--fH:'Montserrat',sans-serif;--fB:'DM Sans',sans-serif}@keyframes ballPop{0%{transform:scale(.4) translateY(-20px);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1) translateY(0);opacity:1}}@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.7}}@keyframes tumble0{0%,100%{transform:translateY(8px)}50%{transform:translateY(55px)}}@keyframes tumble1{0%,100%{transform:translateY(50px)}50%{transform:translateY(10px)}}@keyframes tumble2{0%,100%{transform:translateY(25px)}50%{transform:translateY(60px)}}@keyframes slideUp{0%{transform:translateY(100%)}100%{transform:translateY(0)}}@keyframes bingoSpin{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.1)}100%{transform:rotate(360deg) scale(1)}}*{box-sizing:border-box;margin:0;padding:0}body{background:${C.bg}}::-webkit-scrollbar{height:4px;width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.pink}30;border-radius:10px}`}} />
    <div style={{position:"fixed",inset:0,backgroundImage:`radial-gradient(${C.pink}08 1px, transparent 1px)`,backgroundSize:"20px 20px",pointerEvents:"none"}}/>
    <div style={{width:"100%",maxWidth:900,padding:"0 16px",position:"relative",zIndex:1}}>

      {/* Header */}
      <div style={{background:C.pink,margin:"0 -16px",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"center",gap:24,position:"relative"}}>
        <svg width="36" height="36" viewBox="0 0 100 100" fill="none">
          <path d="M10 95V5h50c19.3 0 35 15.7 35 35S79.3 75 60 75H40v20H10zm30-50h18c5.5 0 10-4.5 10-10s-4.5-10-10-10H40v20z" fill="white"/>
          <rect x="60" y="70" width="20" height="20" fill="white" opacity=".4"/>
          <rect x="60" y="70" width="20" height="20" rx="0" fill="#FF1B64"/>
        </svg>
        <div style={{display:"flex",flexDirection:"column",lineHeight:1.1}}>
          <span style={{fontSize:18,fontWeight:800,fontFamily:"var(--fH)",color:C.white,letterSpacing:0.5}}>Redots<span style={{color:C.pinkLight}}>Club</span></span>
        </div>
        <div style={{width:2,height:28,background:"rgba(255,255,255,.25)",borderRadius:1}}/>
        <span style={{fontSize:28,fontWeight:800,fontFamily:"var(--fH)",color:C.white,letterSpacing:3}}>BINGO</span>
        <div style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)"}}>
          <SyncStatus state={syncState} gameId={gameId}/>
        </div>
      </div>

      {/* Lobby button */}
      {SUPABASE_READY&&(<div style={{margin:"12px 0 0",display:"flex",justifyContent:"flex-end"}}>
        <button onClick={openLobby} style={{padding:"8px 14px",fontSize:10,fontWeight:700,fontFamily:"var(--fH)",letterSpacing:1.5,border:`1px solid ${C.pink}40`,borderRadius:100,background:`${C.pink}10`,color:C.pinkLight,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
          📱 OPEN LOBBY (QR)
        </button>
      </div>)}

      {/* Game Layout: History | Machine+Board */}
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        {/* Left: Ball History Column */}
        <div style={{width:70,flexShrink:0,display:"flex",flexDirection:"column",gap:4,maxHeight:"calc(100vh - 120px)",overflowY:"auto",paddingRight:4}}>
          <div style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,.4)",letterSpacing:2,textAlign:"center",marginBottom:4}}>HISTORY</div>
          {called.map((n,i)=>{ const l=getLetter(n),bc=getBallColor(n),w=bc===C.white; return(<div key={n} style={{width:56,height:56,flexShrink:0,margin:"0 auto",animation:i===called.length-1?"ballPop .4s ease-out":undefined}}><svg viewBox="0 0 56 56" width={56} height={56}><defs><radialGradient id={`h${n}`} cx="35%" cy="30%"><stop offset="0%" stopColor="#fff" stopOpacity=".85"/><stop offset="45%" stopColor={bc} stopOpacity=".7"/><stop offset="100%" stopColor={bc}/></radialGradient></defs><circle cx="28" cy="28" r="26" fill={`url(#h${n})`} stroke={w?`${C.muted}70`:`${bc}80`} strokeWidth="1"/><ellipse cx="28" cy="28" rx="18" ry="11" fill="white" opacity=".95"/><text x="28" y="24" textAnchor="middle" fill={w?C.pink:bc===C.pinkLight?"#333":"#fff"} fontSize="10" fontWeight="900" fontFamily="var(--fH)">{l}</text><text x="28" y="36" textAnchor="middle" fill="#111" fontSize="14" fontWeight="900" fontFamily="var(--fH)">{n}</text></svg></div>); })}
        </div>

        {/* Right: Machine + Controls + Board */}
        <div style={{flex:1,minWidth:0}}>
          {/* Machine */}
          <div style={{background:`linear-gradient(180deg,#1a1a28,${C.bg},#1a1a28)`,borderRadius:22,border:`2px solid ${C.pink}25`,padding:"18px 16px",margin:"12px 0",position:"relative",overflow:"hidden",boxShadow:`0 0 40px ${C.pink}08`}}>
            <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.04) 2px,rgba(0,0,0,.04) 4px)",pointerEvents:"none",zIndex:2}}/>
            <div style={{position:"relative",height:160,display:"flex",alignItems:"center",justifyContent:"center",background:`radial-gradient(ellipse at center,${C.pink}08,transparent 70%)`,borderRadius:20,border:"1px solid rgba(255,255,255,.04)"}}>
              {rolling&&(<div style={{position:"absolute",inset:0,overflow:"hidden",borderRadius:20}}>{[...Array(8)].map((_,i)=>(<div key={i} style={{position:"absolute",width:11,height:11,borderRadius:"50%",background:i%3===0?C.pink:i%3===1?C.white:C.pinkLight,opacity:.3,left:`${8+i*11}%`,animation:`tumble${i%3} ${.35+i*.08}s infinite ease-in-out`}}/>))}</div>)}
              <div style={{position:"relative",zIndex:3}}><BigBall number={cur} isRolling={rolling}/></div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,padding:"10px 16px",background:"rgba(0,0,0,.3)",borderRadius:12,border:"1px solid rgba(255,255,255,.04)",position:"relative",zIndex:3}}>
              <span style={{fontSize:10,color:"rgba(255,255,255,.4)",fontWeight:600,letterSpacing:1.5}}>BALLS DRAWN</span>
              <span style={{fontSize:22,fontWeight:800,fontFamily:"var(--fH)",color:called.length>=60?C.pink:called.length>=40?C.pinkLight:C.white}}>{called.length}/{MAX_NUMBER}</span>
            </div>
          </div>

          <HotCardsPanel stats={hot}/>

          {/* Controls */}
          <div style={{display:"flex",gap:7,margin:"0 0 12px"}}>
            <button onClick={callNum} disabled={rolling||done} style={{flex:2,padding:"14px",fontSize:15,fontWeight:800,fontFamily:"var(--fH)",letterSpacing:3,border:"none",borderRadius:100,background:done?"rgba(255,255,255,.04)":`linear-gradient(160deg,${C.pink},${C.pinkDim})`,color:done?C.muted:"#fff",cursor:done?"default":"pointer",opacity:rolling?.6:1,boxShadow:done?"none":`0 0 25px ${C.pink}25`,transition:"all .2s"}}>{rolling?"ROLLING...":done?"ALL CALLED":"CALL! 🎱"}</button>
            <button onClick={()=>setAuto(!auto)} disabled={done} style={{padding:"14px 14px",fontSize:10,fontWeight:700,border:`1px solid ${auto?C.pink:C.white}28`,borderRadius:100,background:auto?`${C.pink}12`:"rgba(255,255,255,.03)",color:auto?C.pink:C.white,cursor:done?"default":"pointer"}}>{auto?"⏸":"▶"}</button>
            <button onClick={()=>setShowVM(true)} style={{padding:"14px 14px",border:`1px solid ${vOn?C.pink:C.muted}30`,borderRadius:100,background:vOn?`${C.pink}12`:"rgba(255,255,255,.02)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:16}}>{vOn?ch.emoji:"🔇"}</span></button>
            <button onClick={reset} style={{padding:"14px 14px",fontSize:12,fontWeight:700,border:`1px solid ${C.border}`,borderRadius:100,background:"rgba(255,255,255,.02)",color:C.muted,cursor:"pointer"}}>↺</button>
          </div>

          <NumberBoard calledNumbers={called} latestNumber={cur&&!rolling?cur:null}/>
        </div>
      </div>

      <div style={{textAlign:"center",padding:"16px 0 24px"}}>
        <div style={{fontSize:11,fontWeight:700,fontFamily:"var(--fH)",opacity:.2,marginBottom:4}}><span style={{color:C.white}}>Redots</span><span style={{color:C.pink}}>Club</span></div>
        <div style={{fontSize:8,color:"rgba(255,255,255,.1)",letterSpacing:1}}>REDOTSCLUB BINGO LIVE · v2</div>
      </div>
    </div>
    <VoiceModal open={showVM} onClose={()=>setShowVM(false)} selected={vId} onSelect={pickV} voiceOn={vOn} onToggle={()=>setVOn(!vOn)}/>
    <ResumeModal open={showResume} calledCount={savedSnapshot?.called?.length||0} onResume={handleResume} onDiscard={handleDiscard}/>
    <BingoAlertOverlay alert={bingoAlerts.current} onDismiss={bingoAlerts.dismiss}/>
  </div>);
}
