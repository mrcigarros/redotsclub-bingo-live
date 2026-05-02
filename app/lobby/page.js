"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, SUPABASE_READY } from "../../lib/supabase";

export const dynamic = "force-dynamic";

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

// Lightweight QR generator using qrcode lib lazy-loaded
function useQR(text) {
  const [dataUrl, setDataUrl] = useState(null);
  useEffect(() => {
    if (!text) return;
    let active = true;
    import("qrcode").then(QR => {
      QR.toDataURL(text, {
        errorCorrectionLevel: "H",
        margin: 1,
        width: 600,
        color: { dark: "#0A0A0F", light: "#FFFFFFFF" },
      }).then(url => { if (active) setDataUrl(url); });
    }).catch(e => console.error("qrcode load failed", e));
    return () => { active = false; };
  }, [text]);
  return dataUrl;
}

export default function LobbyPage() {
  return (<Suspense fallback={<div style={{minHeight:"100vh",background:C.bg}}/>}><Lobby/></Suspense>);
}

function Lobby() {
  const params = useSearchParams();
  const gameId = params.get("g");
  const [claims, setClaims] = useState([]);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const claimUrl = useMemo(() => {
    if (!gameId || !origin) return "";
    return `${origin}/claim?g=${gameId}`;
  }, [gameId, origin]);

  const qr = useQR(claimUrl);

  // Subscribe to claims for this game so the lobby shows live count
  useEffect(() => {
    if (!gameId || !SUPABASE_READY) return;

    // Initial fetch
    supabase.from("card_claims").select("card_number,claimer_name").eq("game_id", gameId)
      .then(({ data }) => { if (data) setClaims(data); });

    // Realtime subscription
    const channel = supabase.channel(`lobby-${gameId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "card_claims",
        filter: `game_id=eq.${gameId}`,
      }, (payload) => {
        setClaims(prev => [...prev, { card_number: payload.new.card_number, claimer_name: payload.new.claimer_name }]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameId]);

  if (!gameId) {
    return (<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontFamily:"sans-serif",padding:24,textAlign:"center"}}>
      <div>
        <div style={{fontSize:32,marginBottom:12}}>🎲</div>
        <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>No game ID provided</div>
        <div style={{fontSize:13,color:C.muted}}>Open this page from the operator screen using the "OPEN LOBBY" button.</div>
      </div>
    </div>);
  }

  return (<div style={{minHeight:"100vh",background:C.bg,color:C.white,fontFamily:"var(--fB)",padding:"24px 16px",display:"flex",flexDirection:"column",alignItems:"center"}}>
    <style suppressHydrationWarning dangerouslySetInnerHTML={{__html:`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800;900&family=DM+Sans:wght@400;500;700&display=swap');:root{--fH:'Montserrat',sans-serif;--fB:'DM Sans',sans-serif}*{box-sizing:border-box}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}@keyframes pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}`}} />

    {/* Header */}
    <div style={{textAlign:"center",marginBottom:20}}>
      <div style={{fontSize:14,fontWeight:700,fontFamily:"var(--fH)",color:C.pinkLight,letterSpacing:3,marginBottom:6}}>REDOTSCLUB</div>
      <div style={{fontSize:48,fontWeight:900,fontFamily:"var(--fH)",letterSpacing:6,background:`linear-gradient(90deg,${C.pink},${C.pinkLight})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>BINGO</div>
      <div style={{fontSize:13,color:C.muted,marginTop:4,letterSpacing:2,fontFamily:"var(--fH)"}}>SCAN TO PLAY</div>
    </div>

    {/* QR */}
    <div style={{background:"#fff",padding:24,borderRadius:24,boxShadow:`0 0 60px ${C.pink}30`,marginBottom:24,position:"relative"}}>
      {qr ? (
        <img src={qr} alt="Scan to claim a card" style={{width:300,height:300,display:"block"}}/>
      ) : (
        <div style={{width:300,height:300,display:"flex",alignItems:"center",justifyContent:"center",color:"#999",fontFamily:"var(--fH)",fontSize:12,letterSpacing:2}}>LOADING QR...</div>
      )}
    </div>

    {/* Manual URL fallback */}
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"12px 18px",marginBottom:16,maxWidth:520,width:"100%",textAlign:"center"}}>
      <div style={{fontSize:9,color:C.muted,letterSpacing:2,marginBottom:4,fontWeight:700}}>OR TYPE THIS URL</div>
      <div style={{fontSize:13,color:C.pinkLight,fontFamily:"monospace",wordBreak:"break-all"}}>{claimUrl||"…"}</div>
    </div>

    {/* Live claim counter */}
    <div style={{background:`linear-gradient(135deg,${C.pink}15,rgba(0,0,0,.3))`,border:`1px solid ${C.pink}30`,borderRadius:18,padding:"18px 28px",marginTop:8,minWidth:280,textAlign:"center"}}>
      <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:3,marginBottom:6}}>CARDS CLAIMED</div>
      <div style={{fontSize:48,fontWeight:900,fontFamily:"var(--fH)",color:C.pinkLight,lineHeight:1}}>
        {claims.length}<span style={{fontSize:18,color:C.muted,fontWeight:700}}> / 250</span>
      </div>
    </div>

    {/* Recent claimers — last 6 */}
    {claims.length>0 && (<div style={{marginTop:24,display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",maxWidth:600}}>
      {claims.slice(-6).reverse().map(c=>(
        <div key={c.card_number} style={{padding:"6px 14px",background:`${C.pink}12`,border:`1px solid ${C.pink}30`,borderRadius:100,fontSize:11,fontFamily:"var(--fH)",fontWeight:700,letterSpacing:1,animation:"pop .3s ease-out"}}>
          <span style={{color:C.pinkLight}}>#{c.card_number}</span>
          <span style={{color:C.muted,margin:"0 6px"}}>·</span>
          <span style={{color:C.white}}>{c.claimer_name}</span>
        </div>
      ))}
    </div>)}

    <div style={{marginTop:32,fontSize:9,color:"rgba(255,255,255,.15)",letterSpacing:2,fontFamily:"var(--fH)"}}>
      GAME #{gameId.slice(0,8)}
    </div>
  </div>);
}
