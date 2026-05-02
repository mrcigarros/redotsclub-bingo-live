"use client";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useParams, useRouter } from "next/navigation";
import { CARDS_250 } from "../../../lib/cards";
import { supabase, SUPABASE_READY } from "../../../lib/supabase";

const C = {
  bg: "#0A0A0F",
  surface: "#121218",
  card: "#1A1A22",
  pink: "#FF1B64",
  pinkLight: "#FFB7F2",
  pinkDim: "#CC1550",
  white: "#FFFFFF",
  muted: "#6B6E82",
  border: "#2A2A3A",
  green: "#4ADE80",
};
const LETTERS = ["B", "I", "N", "G", "O"];
const LETTER_COLORS = [C.pink, C.white, C.pinkLight, C.pink, C.white];

export default function CardPage() {
  return (<Suspense fallback={<div style={{minHeight:"100vh",background:C.bg}}/>}><PlayerCard/></Suspense>);
}

function PlayerCard() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const cardNumber = parseInt(params.n, 10);
  const gameId = search.get("g");

  const [calledNumbers, setCalledNumbers] = useState([]);
  const [syncState, setSyncState] = useState("connecting"); // connecting | live | error
  const [claimerName, setClaimerName] = useState("");
  const [bingoClaimed, setBingoClaimed] = useState(false);
  const [showBingoModal, setShowBingoModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const card = useMemo(() => {
    if (!cardNumber || cardNumber < 1 || cardNumber > 250) return null;
    return CARDS_250[cardNumber - 1];
  }, [cardNumber]);

  // Restore claimer name from localStorage
  useEffect(() => {
    if (!gameId) return;
    try {
      const cached = localStorage.getItem(`redotsclub-claim-${gameId}`);
      if (cached) {
        const { claimerName } = JSON.parse(cached);
        if (claimerName) setClaimerName(claimerName);
      }
    } catch {}
  }, [gameId]);

  // Initial fetch + Realtime subscription
  useEffect(() => {
    if (!gameId || !SUPABASE_READY) { setSyncState("error"); return; }

    let mounted = true;

    const fetchInitial = async () => {
      try {
        const { data, error } = await supabase
          .from("games")
          .select("called_numbers,active")
          .eq("id", gameId)
          .maybeSingle();
        if (!mounted) return;
        if (error || !data) { setSyncState("error"); return; }
        setCalledNumbers(data.called_numbers || []);
        setSyncState("live");
      } catch { if (mounted) setSyncState("error"); }
    };
    fetchInitial();

    // Realtime: listen for UPDATE on this specific game
    const channel = supabase.channel(`game-${gameId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "games",
        filter: `id=eq.${gameId}`,
      }, (payload) => {
        if (!mounted) return;
        if (payload.new && Array.isArray(payload.new.called_numbers)) {
          setCalledNumbers(payload.new.called_numbers);
          setSyncState("live");
        }
      })
      .subscribe((status) => {
        if (!mounted) return;
        if (status === "SUBSCRIBED") setSyncState("live");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setSyncState("error");
      });

    // Polling fallback every 4s (in case Realtime drops)
    const poll = setInterval(fetchInitial, 4000);

    return () => {
      mounted = false;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // Build marked grid + detect BINGO
  const { marks, hasBingo } = useMemo(() => {
    if (!card) return { marks: [], hasBingo: false };
    const cs = new Set(calledNumbers); cs.add(0);
    const m = [];
    for (let r = 0; r < 5; r++) {
      const row = [];
      for (let col = 0; col < 5; col++) row.push(cs.has(card[col][r]));
      m.push(row);
    }
    let bingo = false;
    for (let r = 0; r < 5 && !bingo; r++) if (m[r].every(Boolean)) bingo = true;
    for (let col = 0; col < 5 && !bingo; col++) { let all=true; for(let r=0;r<5;r++) if(!m[r][col]){all=false;break;} if(all) bingo=true; }
    if (!bingo) { let all=true; for(let i=0;i<5;i++) if(!m[i][i]){all=false;break;} if(all) bingo=true; }
    if (!bingo) { let all=true; for(let i=0;i<5;i++) if(!m[i][4-i]){all=false;break;} if(all) bingo=true; }
    if (!bingo && m[0][0] && m[0][4] && m[4][0] && m[4][4]) bingo = true;
    return { marks: m, hasBingo: bingo };
  }, [card, calledNumbers]);

  // Auto-trigger the BINGO modal the first time we hit 5
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (hasBingo && !bingoClaimed && !autoOpened) {
      setShowBingoModal(true);
      setAutoOpened(true);
      // haptic feedback if available
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 400]);
      }
    }
  }, [hasBingo, bingoClaimed, autoOpened]);

  const callBingo = useCallback(async () => {
    if (!gameId || !cardNumber) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("card_claims")
        .update({ bingo_claimed_at: new Date().toISOString() })
        .eq("game_id", gameId)
        .eq("card_number", cardNumber);
      if (error) throw error;
      setBingoClaimed(true);
      setShowBingoModal(false);
    } catch (e) {
      alert("Could not submit your BINGO. Show this screen to the host!");
    } finally {
      setSubmitting(false);
    }
  }, [gameId, cardNumber]);

  if (!card) {
    return (<div style={pageStyle}><div style={{textAlign:"center",color:C.white,padding:24}}>
      <div style={{fontSize:48,marginBottom:12}}>🎲</div>
      <div style={{fontSize:18,fontWeight:700,fontFamily:"var(--fH)"}}>Invalid card number</div>
      <div style={{fontSize:13,color:C.muted,marginTop:8}}>Cards are numbered 1 to 250.</div>
    </div></div>);
  }

  const lastCalled = calledNumbers[calledNumbers.length - 1];

  return (<div style={pageStyle}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800;900&family=DM+Sans:wght@400;500;700&display=swap');:root{--fH:'Montserrat',sans-serif;--fB:'DM Sans',sans-serif}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(1.04)}}@keyframes pop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}@keyframes slideUp{0%{transform:translateY(100%)}100%{transform:translateY(0)}}@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}@keyframes bingoSpin{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.1)}100%{transform:rotate(360deg) scale(1)}}@keyframes confetti{0%{transform:translateY(-20px) rotate(0)}100%{transform:translateY(110vh) rotate(720deg)}}`}</style>

    <div style={{maxWidth:480,width:"100%",padding:"16px 12px",display:"flex",flexDirection:"column",gap:12}}>

      {/* Top bar: name + card # + sync state */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 4px"}}>
        <div>
          <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:2,fontFamily:"var(--fH)"}}>PLAYER</div>
          <div style={{fontSize:14,fontWeight:800,color:C.white,fontFamily:"var(--fH)"}}>{claimerName||"Player"}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",background:syncState==="live"?`${C.green}15`:`${C.muted}15`,border:`1px solid ${syncState==="live"?C.green:C.muted}40`,borderRadius:100}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:syncState==="live"?C.green:C.muted,animation:syncState==="live"?"pulse 2s infinite":undefined}}/>
          <span style={{fontSize:9,fontWeight:700,color:syncState==="live"?C.green:C.muted,letterSpacing:1.5,fontFamily:"var(--fH)"}}>{syncState==="live"?"LIVE":syncState==="connecting"?"CONNECTING":"ERROR"}</span>
        </div>
      </div>

      {/* Card # banner */}
      <div style={{background:`linear-gradient(135deg,${C.pink},${C.pinkDim})`,borderRadius:20,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:`0 0 30px ${C.pink}25`}}>
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.7)",letterSpacing:2,fontFamily:"var(--fH)"}}>YOUR CARD</div>
          <div style={{fontSize:32,fontWeight:900,color:"#fff",fontFamily:"var(--fH)",lineHeight:1}}>#{cardNumber}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.7)",letterSpacing:2,fontFamily:"var(--fH)"}}>BALLS DRAWN</div>
          <div style={{fontSize:24,fontWeight:900,color:"#fff",fontFamily:"var(--fH)",lineHeight:1}}>{calledNumbers.length}<span style={{fontSize:14,opacity:.6}}>/75</span></div>
        </div>
      </div>

      {/* Last called pulse */}
      {lastCalled && (<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:14}}>
        <span style={{fontSize:9,color:C.muted,letterSpacing:2,fontWeight:700,fontFamily:"var(--fH)"}}>JUST CALLED</span>
        <span style={{fontSize:18,fontWeight:900,color:C.pinkLight,fontFamily:"var(--fH)",animation:"pop .4s ease-out"}}>
          {getLetter(lastCalled)}{lastCalled}
        </span>
      </div>)}

      {/* The 5x5 card */}
      <div style={{background:C.card,borderRadius:20,border:`2px solid ${hasBingo?C.pinkLight:C.border}`,padding:"12px 8px",boxShadow:hasBingo?`0 0 40px ${C.pinkLight}40`:"none"}}>
        {/* Letter row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:8}}>
          {LETTERS.map((l,i)=>(
            <div key={l} style={{textAlign:"center",fontSize:24,fontWeight:900,fontFamily:"var(--fH)",color:LETTER_COLORS[i],letterSpacing:1}}>{l}</div>
          ))}
        </div>
        {/* 5x5 grid — render row-by-row from card[col][row] */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
          {Array.from({length:25}).map((_,idx)=>{
            const r = Math.floor(idx/5), col = idx%5;
            const num = card[col][r];
            const isFree = num === 0;
            const marked = marks[r]?.[col];
            const isLast = num === lastCalled;
            return (<div key={idx} style={{
              aspectRatio:"1/1",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              borderRadius:12,
              fontSize:isFree?16:22,
              fontWeight:900,
              fontFamily:"var(--fH)",
              background: isFree ? `${C.pinkLight}20` : marked ? (isLast?C.pinkLight:`linear-gradient(135deg,${C.pink},${C.pinkDim})`) : "rgba(255,255,255,.03)",
              color: isFree ? C.pinkLight : marked ? "#fff" : "rgba(255,255,255,.6)",
              border: marked ? "none" : `1px solid ${C.border}`,
              transform: isLast ? "scale(1.05)" : "scale(1)",
              transition: "all .25s cubic-bezier(.34,1.56,.64,1)",
              boxShadow: isLast ? `0 0 18px ${C.pinkLight}90` : marked ? `0 4px 12px ${C.pink}30` : "none",
              animation: isLast && marked ? "pop .4s ease-out" : undefined,
            }}>{isFree ? "⭐" : num}</div>);
          })}
        </div>
      </div>

      {/* BINGO banner / button */}
      {hasBingo && !bingoClaimed && (<button onClick={()=>setShowBingoModal(true)} style={{padding:"18px",fontSize:18,fontWeight:900,fontFamily:"var(--fH)",letterSpacing:6,border:"none",borderRadius:18,background:`linear-gradient(135deg,${C.pinkLight},${C.pink})`,color:"#fff",cursor:"pointer",boxShadow:`0 0 40px ${C.pinkLight}60`,animation:"pulse 1.2s infinite"}}>
        🎉 BINGO! TAP TO CLAIM
      </button>)}

      {bingoClaimed && (<div style={{padding:"18px",fontSize:13,fontWeight:800,fontFamily:"var(--fH)",letterSpacing:3,borderRadius:18,background:`${C.green}15`,border:`1px solid ${C.green}50`,color:C.green,textAlign:"center"}}>
        ✓ BINGO CLAIMED — SHOW THE HOST
      </div>)}

      {/* Footer */}
      <div style={{textAlign:"center",fontSize:9,color:"rgba(255,255,255,.2)",letterSpacing:2,fontFamily:"var(--fH)",padding:"8px 0"}}>
        REDOTSCLUB BINGO · GAME #{gameId?.slice(0,8)||"—"}
      </div>
    </div>

    {/* BINGO modal — full-screen celebration */}
    {showBingoModal && (<div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:`radial-gradient(circle at center,${C.pinkDim}d0,#000000)`,animation:"slideUp .4s ease-out"}}>
      {/* Confetti */}
      {[...Array(30)].map((_,i)=>(
        <div key={i} style={{position:"absolute",width:8,height:14,background:i%3===0?C.pinkLight:i%3===1?C.pink:"#fff",left:`${Math.random()*100}%`,top:`-10vh`,animation:`confetti ${2+Math.random()*2}s linear ${Math.random()*1.5}s infinite`,opacity:.85}}/>
      ))}
      <div style={{textAlign:"center",zIndex:2,maxWidth:380,width:"100%"}}>
        <div style={{fontSize:120,marginBottom:8,animation:"bingoSpin 1.5s ease-out"}}>🎉</div>
        <div style={{fontSize:64,fontWeight:900,fontFamily:"var(--fH)",letterSpacing:8,background:`linear-gradient(90deg,#fff,${C.pinkLight})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",lineHeight:1,marginBottom:6}}>BINGO!</div>
        <div style={{fontSize:13,color:"#fff",fontFamily:"var(--fH)",letterSpacing:2,marginBottom:6}}>{claimerName||"Player"} · Card #{cardNumber}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginBottom:32,lineHeight:1.5}}>Tap below to alert the host. They'll verify your card and call you up!</div>
        <button onClick={callBingo} disabled={submitting} style={{width:"100%",padding:"18px",fontSize:14,fontWeight:900,fontFamily:"var(--fH)",letterSpacing:4,border:"none",borderRadius:100,background:submitting?"rgba(255,255,255,.1)":"#fff",color:submitting?"#fff":C.pink,cursor:submitting?"default":"pointer",boxShadow:"0 10px 40px rgba(255,255,255,.3)"}}>
          {submitting ? "SUBMITTING..." : "🎱 CALL BINGO"}
        </button>
        <button onClick={()=>setShowBingoModal(false)} style={{marginTop:12,padding:"10px 20px",fontSize:11,fontWeight:700,fontFamily:"var(--fH)",letterSpacing:2,border:"1px solid rgba(255,255,255,.3)",borderRadius:100,background:"transparent",color:"rgba(255,255,255,.7)",cursor:"pointer"}}>Not yet — keep playing</button>
      </div>
    </div>)}
  </div>);
}

function getLetter(n) {
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}

const pageStyle = {
  minHeight: "100vh",
  background: C.bg,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  fontFamily: "var(--fB)",
  color: C.white,
};
