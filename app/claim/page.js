"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

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
};

function getDeviceUuid() {
  if (typeof window === "undefined") return null;
  let u = localStorage.getItem("redotsclub-device-uuid");
  if (!u) {
    u = crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("redotsclub-device-uuid", u);
  }
  return u;
}

export default function ClaimPage() {
  return (<Suspense fallback={<div style={{minHeight:"100vh",background:C.bg}}/>}><Claim/></Suspense>);
}

function Claim() {
  const params = useSearchParams();
  const router = useRouter();
  const gameId = params.get("g");

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(true);

  // On mount, check if this device already has a card for this game → auto-redirect
  useEffect(() => {
    if (!gameId) { setCheckingExisting(false); return; }
    const cached = localStorage.getItem(`redotsclub-claim-${gameId}`);
    if (cached) {
      try {
        const { cardNumber, claimerName } = JSON.parse(cached);
        if (cardNumber) {
          router.replace(`/card/${cardNumber}?g=${gameId}`);
          return;
        }
      } catch {}
    }
    setCheckingExisting(false);
  }, [gameId, router]);

  const submit = async () => {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) { setError("Type your name (at least 2 characters)"); return; }
    if (!gameId) { setError("Missing game ID — scan the QR again"); return; }

    setSubmitting(true);
    try {
      const deviceUuid = getDeviceUuid();
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, name: trimmed, deviceUuid }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not claim a card. Try again.");
        setSubmitting(false);
        return;
      }
      localStorage.setItem(`redotsclub-claim-${gameId}`, JSON.stringify(data));
      router.replace(`/card/${data.cardNumber}?g=${gameId}`);
    } catch (e) {
      setError("Network error. Check your connection and try again.");
      setSubmitting(false);
    }
  };

  if (!gameId) {
    return (<div style={pageStyle}><div style={{textAlign:"center",color:C.white,padding:24}}>
      <div style={{fontSize:48,marginBottom:12}}>🎲</div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8,fontFamily:"var(--fH)"}}>No game ID</div>
      <div style={{fontSize:13,color:C.muted}}>Scan the QR code from the bingo screen to join a game.</div>
    </div></div>);
  }

  if (checkingExisting) {
    return (<div style={pageStyle}><div style={{color:C.muted,fontSize:12,letterSpacing:2,fontFamily:"var(--fH)"}}>LOADING...</div></div>);
  }

  return (<div style={pageStyle}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800;900&family=DM+Sans:wght@400;500;700&display=swap');:root{--fH:'Montserrat',sans-serif;--fB:'DM Sans',sans-serif}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}input{font-family:var(--fB)}`}</style>

    <div style={{maxWidth:420,width:"100%",padding:"32px 24px"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:11,fontWeight:700,fontFamily:"var(--fH)",color:C.pinkLight,letterSpacing:4,marginBottom:8}}>REDOTSCLUB</div>
        <div style={{fontSize:42,fontWeight:900,fontFamily:"var(--fH)",letterSpacing:5,background:`linear-gradient(90deg,${C.pink},${C.pinkLight})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>BINGO</div>
        <div style={{fontSize:13,color:C.muted,marginTop:8,fontFamily:"var(--fH)",letterSpacing:1}}>Claim your card</div>
      </div>

      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"24px 20px",marginBottom:16}}>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:C.muted,letterSpacing:2,marginBottom:8,fontFamily:"var(--fH)"}}>YOUR NAME</label>
        <input
          type="text"
          value={name}
          onChange={(e)=>setName(e.target.value)}
          onKeyDown={(e)=>{if(e.key==="Enter")submit();}}
          placeholder="e.g. João Silva"
          maxLength={40}
          autoFocus
          style={{width:"100%",padding:"14px 16px",fontSize:18,fontWeight:600,background:"rgba(0,0,0,.4)",border:`1.5px solid ${C.border}`,borderRadius:12,color:C.white,outline:"none"}}
        />
      </div>

      {error && (<div style={{background:"#FF1B6420",border:`1px solid ${C.pink}50`,color:C.pinkLight,padding:"10px 14px",borderRadius:12,fontSize:12,marginBottom:12,textAlign:"center"}}>{error}</div>)}

      <button
        onClick={submit}
        disabled={submitting||name.trim().length<2}
        style={{width:"100%",padding:"16px",fontSize:14,fontWeight:800,fontFamily:"var(--fH)",letterSpacing:3,border:"none",borderRadius:100,background:submitting||name.trim().length<2?"rgba(255,255,255,.06)":`linear-gradient(160deg,${C.pink},${C.pinkDim})`,color:submitting||name.trim().length<2?C.muted:"#fff",cursor:submitting||name.trim().length<2?"default":"pointer",boxShadow:submitting||name.trim().length<2?"none":`0 0 30px ${C.pink}40`,transition:"all .2s"}}
      >
        {submitting ? "CLAIMING..." : "GET MY CARD 🎱"}
      </button>

      <div style={{textAlign:"center",marginTop:24,fontSize:10,color:"rgba(255,255,255,.25)",letterSpacing:2,fontFamily:"var(--fH)"}}>
        GAME #{gameId.slice(0,8)}
      </div>
    </div>
  </div>);
}

const pageStyle = {
  minHeight: "100vh",
  background: C.bg,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--fB)",
  color: C.white,
};
