import { useState, useEffect, useRef, useCallback } from "react";

const TRACKS = [
  { id:1, title:"God's Plan (Live Session)", artist:"Drake", handle:"@drake", genre:"Hip-Hop", me:1784, color:"#6366f1", seed:"drk1" },
  { id:2, title:"Crown Season", artist:"Nova Reigns", handle:"@novareigns", genre:"R&B", me:850, color:"#a78bfa", seed:"nv1" },
  { id:3, title:"Never Make A Promise", artist:"Dru Hill", handle:"@druhill", genre:"R&B Soul", me:830, color:"#34d399", seed:"dh1" },
  { id:4, title:"Empire Rise", artist:"Nova Reigns", handle:"@novareigns", genre:"R&B", me:850, color:"#f472b6", seed:"nv2" },
  { id:5, title:"Hotline Bling (Empire Cut)", artist:"Drake", handle:"@drake", genre:"Hip-Hop", me:1784, color:"#fbbf24", seed:"drk2" },
];

const VIDEOS = [
  { id:1, title:"Spring Lookbook 2025", creator:"Glamour Studio", handle:"@glamourstudio", views:"3.1K", me:1700, seed:"gl1" },
  { id:2, title:"How I Edit for the Culture", creator:"PixelKingz", handle:"@pixelkingz", views:"987", me:1100, seed:"pk1" },
  { id:3, title:"My Investment Strategy", creator:"LEVIAS", handle:"@levias", views:"445", me:461, seed:"lv1" },
  { id:4, title:"Tampa Community Talk", creator:"Marcus Williams", handle:"@marcuswilliams", views:"2.1K", me:1300, seed:"mw1" },
];

const PHOTOS = [
  { id:1, title:"Behind the Lens — NYC", creator:"PixelKingz", seed:"pk_nyc" },
  { id:2, title:"Raw Bundle Arrivals", creator:"Glamour Studio", seed:"gl_bundle" },
  { id:3, title:"Studio Session Vibes", creator:"Drake", seed:"drk_studio" },
  { id:4, title:"Tampa Street Art", creator:"Marcus Williams", seed:"mw_tampa" },
  { id:5, title:"Crown Season Shoot", creator:"Nova Reigns", seed:"nv_shoot" },
  { id:6, title:"Empire Collective Night", creator:"PixelKingz", seed:"pk_empire" },
];

const ACTIVITY = [
  "levias bought 3 shares $DRAKE",
  "Alex R. tipped 20 ME to Nova",
  "TampaRoots went LIVE",
  "PixelKingz posted new drop",
  "850 fans streaming now",
  "Hot Take Arena — vote now",
  "Squad Wars — top squad changes",
  "Bella's merch drop LIVE",
];

// LED Bar visualizer data generator
function genBars(n, intensity = 1) {
  return Array.from({ length: n }, (_, i) => {
    const base = Math.sin(i * 0.6) * 0.5 + 0.5;
    return Math.max(0.05, Math.min(1, base * intensity * (0.6 + Math.random() * 0.4)));
  });
}

export default function TriplePlayer() {
  // Audio state
  const [playing, setPlaying] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);
  const [progress, setProgress] = useState(22);
  const [volume, setVolume] = useState(78);
  const [bars, setBars] = useState(() => genBars(32, 0.8));
  const [vuL, setVuL] = useState(0.6);
  const [vuR, setVuR] = useState(0.55);

  // Video state
  const [videoIdx, setVideoIdx] = useState(0);
  const [videoPlay, setVideoPlay] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [scanline, setScanline] = useState(0);

  // Photo state
  const [photoIdx, setPhotoIdx] = useState(0);
  const [photoAnim, setPhotoAnim] = useState(true);
  const [slideTimer, setSlideTimer] = useState(100);

  // Shared
  const [meEarned, setMeEarned] = useState(0);
  const [activity, setActivity] = useState(0);
  const [liked, setLiked] = useState({});
  const [intensity, setIntensity] = useState(0.8);

  const progressRef = useRef(progress);
  const playingRef = useRef(playing);
  progressRef.current = progress;
  playingRef.current = playing;

  // LED animation loop
  useEffect(() => {
    const iv = setInterval(() => {
      const i = playingRef.current ? 0.7 + Math.random() * 0.3 : 0.15 + Math.random() * 0.1;
      setIntensity(i);
      setBars(genBars(32, i));
      setVuL(playingRef.current ? 0.4 + Math.random() * 0.55 : 0.05 + Math.random() * 0.08);
      setVuR(playingRef.current ? 0.35 + Math.random() * 0.6 : 0.04 + Math.random() * 0.08);
      if (playingRef.current) {
        setProgress(p => p >= 100 ? 0 : p + 0.3);
        setMeEarned(m => Math.round((m + 0.08) * 10) / 10);
      }
    }, 80);
    return () => clearInterval(iv);
  }, []);

  // Video scanline
  useEffect(() => {
    const iv = setInterval(() => {
      setScanline(s => (s + 2) % 110);
      if (videoPlay) setVideoProgress(p => p >= 100 ? 0 : p + 0.2);
    }, 50);
    return () => clearInterval(iv);
  }, [videoPlay]);

  // Photo auto-slide
  useEffect(() => {
    const iv = setInterval(() => {
      setSlideTimer(t => {
        if (t <= 0) {
          setPhotoAnim(false);
          setTimeout(() => {
            setPhotoIdx(p => (p + 1) % PHOTOS.length);
            setPhotoAnim(true);
          }, 300);
          return 100;
        }
        return t - 0.5;
      });
    }, 80);
    return () => clearInterval(iv);
  }, []);

  // Activity ticker
  useEffect(() => {
    const iv = setInterval(() => setActivity(a => (a + 1) % ACTIVITY.length), 3200);
    return () => clearInterval(iv);
  }, []);

  const track = TRACKS[trackIdx];
  const video = VIDEOS[videoIdx];
  const photo = PHOTOS[photoIdx];

  const nextTrack = () => { setTrackIdx(i => (i + 1) % TRACKS.length); setProgress(0); };
  const prevTrack = () => { setTrackIdx(i => (i - 1 + TRACKS.length) % TRACKS.length); setProgress(0); };
  const nextVideo = () => { setVideoIdx(i => (i + 1) % VIDEOS.length); setVideoProgress(0); };
  const nextPhoto = () => { setPhotoAnim(false); setTimeout(() => { setPhotoIdx(p => (p + 1) % PHOTOS.length); setPhotoAnim(true); }, 200); };
  const prevPhoto = () => { setPhotoAnim(false); setTimeout(() => { setPhotoIdx(p => (p - 1 + PHOTOS.length) % PHOTOS.length); setPhotoAnim(true); }, 200); };

  const doLike = (key) => setLiked(l => ({ ...l, [key]: !l[key] }));
  const earnME = (amt) => setMeEarned(m => Math.round((m + amt) * 10) / 10);

  // LED bar color based on height
  const ledColor = (h, isPlaying) => {
    if (!isPlaying) return "#1a1a2e";
    if (h > 0.85) return "#f87171";
    if (h > 0.65) return "#fbbf24";
    return "#6366f1";
  };

  const vuColor = (v) => {
    if (v > 0.85) return "#f87171";
    if (v > 0.6) return "#fbbf24";
    return "#34d399";
  };

  return (
    <div style={{
      background: "linear-gradient(160deg,#04040e 0%,#080818 50%,#04040e 100%)",
      minHeight: "100vh",
      padding: "20px 16px",
      fontFamily: "'Courier New', monospace",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&display=swap');
        @keyframes ledPulse{0%,100%{opacity:1}50%{opacity:.7}}
        @keyframes chromeSweep{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes glassShimmer{0%{opacity:.3}50%{opacity:.6}100%{opacity:.3}}
        @keyframes slideIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
        @keyframes tickerMove{from{transform:translateX(100%)}to{transform:translateX(-100%)}}
        @keyframes orbit{0%{transform:rotate(0deg) translateX(28px) rotate(0deg)}100%{transform:rotate(360deg) translateX(28px) rotate(-360deg)}}
        @keyframes scanPulse{0%,100%{opacity:0}50%{opacity:.08}}
        .chrome-text{background:linear-gradient(180deg,#fff 0%,#aaa 40%,#888 60%,#ccc 80%,#fff 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
        .led-seg{transition:background .06s ease,box-shadow .06s ease;}
        .glass-panel{background:linear-gradient(135deg,rgba(255,255,255,.04) 0%,rgba(255,255,255,.01) 50%,rgba(255,255,255,.03) 100%);backdrop-filter:blur(1px);}
        .ctrl-btn{background:linear-gradient(180deg,#1e1e2e,#0d0d1a);border:1px solid #2a2a3e;border-radius:6px;color:#888;cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;}
        .ctrl-btn:hover{background:linear-gradient(180deg,#2a2a3e,#161628);color:#fff;border-color:#6366f1;}
        .ctrl-btn:active{transform:scale(.95);}
      `}</style>

      {/* Background grid */}
      <div style={{ position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(99,102,241,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.03) 1px,transparent 1px)",backgroundSize:"40px 40px",pointerEvents:"none" }} />

      {/* Header */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,position:"relative" }}>
        <div>
          <div style={{ fontFamily:"'Orbitron',monospace",fontSize:18,fontWeight:900,letterSpacing:".1em" }}>
            <span style={{ color:"#fff" }}>DMEG</span><span style={{ color:"#6366f1" }}>.TV</span>
            <span style={{ fontSize:10,color:"#444",marginLeft:10,letterSpacing:".15em" }}>MEDIA STATION v2.0</span>
          </div>
          <div style={{ display:"flex",gap:8,alignItems:"center",marginTop:4 }}>
            <span style={{ width:6,height:6,borderRadius:"50%",background:"#34d399",display:"inline-block",animation:"ledPulse 1s infinite" }} />
            <span style={{ fontSize:9,color:"#34d399",letterSpacing:".12em" }}>ALL SYSTEMS ONLINE</span>
            <span style={{ fontSize:9,color:"#333",marginLeft:8 }}>●</span>
            <span style={{ fontSize:9,color:"#f87171",letterSpacing:".1em",animation:"ledPulse 1.5s infinite" }}>LIVE FEED ACTIVE</span>
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <div style={{ background:"#6366f108",border:"1px solid #6366f133",borderRadius:8,padding:"6px 14px",textAlign:"center" }}>
            <div style={{ fontFamily:"'Orbitron',monospace",fontSize:16,fontWeight:900,color:"#a78bfa" }}>{meEarned.toFixed(1)}</div>
            <div style={{ fontSize:8,color:"#555",letterSpacing:".1em" }}>ME EARNED</div>
          </div>
          <div style={{ background:"#f8717108",border:"1px solid #f8717133",borderRadius:8,padding:"6px 14px",textAlign:"center" }}>
            <div style={{ fontFamily:"'Orbitron',monospace",fontSize:16,fontWeight:900,color:"#f87171",animation:"ledPulse 1.2s infinite" }}>LIVE</div>
            <div style={{ fontSize:8,color:"#555",letterSpacing:".1em" }}>3 STREAMS</div>
          </div>
        </div>
      </div>

      {/* ═══ MAIN THREE-PANEL GRID ═══ */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1.4fr 1fr",gap:12,marginBottom:12 }}>

        {/* ── PANEL 1: AUDIO PLAYER ── */}
        <div style={{
          background:"linear-gradient(160deg,#0d0d1e 0%,#090915 100%)",
          border:"1px solid #1e1e30",
          borderRadius:14,
          overflow:"hidden",
          position:"relative",
          boxShadow:"0 0 0 1px #0a0a15, inset 0 1px 0 rgba(255,255,255,.06)",
        }}>
          {/* Chrome top bar */}
          <div style={{ height:3,background:"linear-gradient(90deg,transparent,#6366f1,#a78bfa,#6366f1,transparent)" }} />

          <div style={{ padding:"14px 14px 0" }}>
            {/* Album art with orbit ring */}
            <div style={{ position:"relative",width:100,height:100,margin:"0 auto 12px" }}>
              <div style={{ position:"absolute",inset:-8,borderRadius:"50%",border:"1px solid #6366f122",animation:"orbit 8s linear infinite" }}>
                <div style={{ width:6,height:6,borderRadius:"50%",background:"#6366f1",boxShadow:"0 0 8px #6366f1",position:"absolute",top:-3,left:"50%",transform:"translateX(-50%)" }} />
              </div>
              <div style={{ position:"absolute",inset:-4,borderRadius:"50%",border:`1px solid ${track.color}44` }} />
              <div style={{ width:100,height:100,borderRadius:"50%",overflow:"hidden",border:`2px solid ${track.color}66`,boxShadow:`0 0 20px ${track.color}33, inset 0 0 20px rgba(0,0,0,.5)` }}>
                <img src={`https://picsum.photos/seed/${track.seed}/200/200`} style={{ width:"100%",height:"100%",objectFit:"cover",filter:`hue-rotate(${trackIdx*40}deg) saturate(1.3)` }} />
              </div>
              {/* Center dot */}
              <div style={{ position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:14,height:14,borderRadius:"50%",background:"#06060f",border:`2px solid ${track.color}` }} />
            </div>

            {/* Track info */}
            <div style={{ textAlign:"center",marginBottom:10 }}>
              <div style={{ fontFamily:"'Orbitron',monospace",fontSize:11,fontWeight:700,color:"#fff",letterSpacing:".04em",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{track.title}</div>
              <div style={{ fontSize:10,color:track.color,letterSpacing:".06em" }}>{track.artist}</div>
              <div style={{ fontSize:9,color:"#333",marginTop:1,letterSpacing:".08em" }}>{track.genre}</div>
            </div>

            {/* Progress bar */}
            <div style={{ background:"#0a0a15",borderRadius:3,height:3,margin:"0 0 8px",cursor:"pointer",position:"relative",border:"1px solid #1a1a2a" }}
              onClick={e => { const r=e.currentTarget.getBoundingClientRect(); setProgress(Math.round((e.clientX-r.left)/r.width*100)); }}>
              <div style={{ height:"100%",background:`linear-gradient(90deg,${track.color},#fff)`,borderRadius:3,width:`${progress}%`,boxShadow:`0 0 6px ${track.color}` }} />
              <div style={{ position:"absolute",top:"50%",left:`${progress}%`,transform:"translate(-50%,-50%)",width:8,height:8,borderRadius:"50%",background:"#fff",boxShadow:`0 0 6px ${track.color}` }} />
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:9,color:"#444",marginBottom:10,fontFamily:"'Orbitron',monospace" }}>
              <span>{Math.floor(progress*3.7/100).toString().padStart(1,"0")}:{Math.floor((progress*3.7%1)*60).toString().padStart(2,"0")}</span>
              <span>3:42</span>
            </div>

            {/* Controls */}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:12 }}>
              <button className="ctrl-btn" style={{ width:30,height:30,fontSize:12 }} onClick={prevTrack}>⏮</button>
              <button onClick={() => { setPlaying(p=>!p); earnME(0.25); }} style={{ width:44,height:44,borderRadius:"50%",background:`linear-gradient(135deg,${track.color},#8b5cf6)`,border:"none",color:"#fff",fontSize:18,cursor:"pointer",boxShadow:`0 0 16px ${track.color}66`,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s" }}>
                {playing ? "⏸" : "▶"}
              </button>
              <button className="ctrl-btn" style={{ width:30,height:30,fontSize:12 }} onClick={nextTrack}>⏭</button>
              <button className="ctrl-btn" style={{ width:30,height:30,fontSize:11,color:liked.audio?"#f87171":"#555",borderColor:liked.audio?"#f8717155":"#2a2a3e" }} onClick={() => { doLike("audio"); earnME(0.5); }}>♥</button>
            </div>

            {/* Volume */}
            <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:12 }}>
              <span style={{ fontSize:10,color:"#444" }}>◀</span>
              <div style={{ flex:1,height:2,background:"#0a0a15",borderRadius:2,position:"relative",cursor:"pointer",border:"1px solid #1a1a2a" }}
                onClick={e => { const r=e.currentTarget.getBoundingClientRect(); setVolume(Math.round((e.clientX-r.left)/r.width*100)); }}>
                <div style={{ height:"100%",background:`linear-gradient(90deg,#6366f1,${track.color})`,borderRadius:2,width:`${volume}%`,boxShadow:`0 0 4px ${track.color}` }} />
              </div>
              <span style={{ fontSize:9,color:"#444",fontFamily:"'Orbitron',monospace",minWidth:24 }}>{volume}</span>
            </div>
          </div>

          {/* ═ LED VU METERS ═ */}
          <div style={{ background:"#04040c",borderTop:"1px solid #0e0e1e",padding:"8px 14px" }}>
            <div style={{ fontSize:8,color:"#333",letterSpacing:".12em",marginBottom:6 }}>SPECTRUM ANALYZER</div>
            <div style={{ display:"flex",gap:2,alignItems:"flex-end",height:40,marginBottom:6 }}>
              {bars.map((h, i) => (
                <div key={i} className="led-seg" style={{
                  flex:1, height:`${h*100}%`, borderRadius:1,
                  background: playing ? ledColor(h, true) : "#1a1a2e",
                  boxShadow: playing && h > 0.6 ? `0 0 4px ${ledColor(h,true)}` : "none",
                  minHeight:2,
                }} />
              ))}
            </div>
            {/* L/R VU */}
            <div style={{ display:"flex",gap:4 }}>
              {["L","R"].map((ch, ci) => {
                const v = ci===0?vuL:vuR;
                const segs = 12;
                return (
                  <div key={ch} style={{ flex:1 }}>
                    <div style={{ display:"flex",gap:1,height:5 }}>
                      {Array.from({length:segs}).map((_, si) => {
                        const active = si/segs < v;
                        const col = si>9?"#f87171":si>7?"#fbbf24":"#34d399";
                        return <div key={si} className="led-seg" style={{ flex:1,height:"100%",background:active?col:"#0e0e1a",borderRadius:1,boxShadow:active?`0 0 3px ${col}`:undefined }} />;
                      })}
                    </div>
                    <div style={{ fontSize:7,color:"#333",marginTop:2,letterSpacing:".1em" }}>{ch}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Track queue */}
          <div style={{ padding:"8px 14px 12px" }}>
            <div style={{ fontSize:8,color:"#333",letterSpacing:".12em",marginBottom:6 }}>QUEUE</div>
            {TRACKS.slice(0,3).map((t,i) => (
              <div key={t.id} onClick={() => { setTrackIdx(i); setProgress(0); earnME(0.25); }} style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 6px",borderRadius:5,cursor:"pointer",background:i===trackIdx?"#111128":"transparent",marginBottom:2,transition:"background .2s" }}>
                <div style={{ width:4,height:24,borderRadius:2,background:i===trackIdx?t.color:"#1e1e2e",flexShrink:0 }} />
                <div style={{ width:24,height:24,borderRadius:4,overflow:"hidden",flexShrink:0 }}>
                  <img src={`https://picsum.photos/seed/${t.seed}/48/48`} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:9,fontWeight:600,color:i===trackIdx?"#fff":"#666",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{t.title}</div>
                  <div style={{ fontSize:8,color:"#444" }}>{t.artist}</div>
                </div>
                {i===trackIdx && <span style={{ width:5,height:5,borderRadius:"50%",background:t.color,animation:"ledPulse 1s infinite",flexShrink:0 }} />}
              </div>
            ))}
          </div>
        </div>

        {/* ── PANEL 2: VIDEO PLAYER (CENTER — DOMINANT) ── */}
        <div style={{
          background:"#000",
          border:"1px solid #1e1e30",
          borderRadius:14,
          overflow:"hidden",
          position:"relative",
          boxShadow:"0 0 0 1px #0a0a15, 0 0 40px rgba(99,102,241,.1), inset 0 1px 0 rgba(255,255,255,.06)",
          display:"flex",
          flexDirection:"column",
        }}>
          {/* Chrome bezel top */}
          <div style={{ height:4,background:"linear-gradient(90deg,#1a1a2e,#6366f1,#fff,#a78bfa,#6366f1,#1a1a2e)",flexShrink:0 }} />

          {/* Video viewport */}
          <div style={{ position:"relative",flex:1,overflow:"hidden",minHeight:220,cursor:"pointer" }} onClick={() => { setVideoPlay(v=>!v); earnME(0.25); }}>
            <img
              src={`https://picsum.photos/seed/${video.seed}/800/450`}
              style={{ width:"100%",height:"100%",objectFit:"cover",filter:"brightness(.7)",display:"block" }}
            />

            {/* Scanline effect */}
            <div style={{ position:"absolute",left:0,right:0,height:"3px",background:"linear-gradient(to bottom,transparent,rgba(99,102,241,.12),transparent)",top:`${scanline}%`,pointerEvents:"none",animation:"scanPulse 3s infinite" }} />

            {/* CRT overlay */}
            <div style={{ position:"absolute",inset:0,backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.04) 2px,rgba(0,0,0,.04) 4px)",pointerEvents:"none" }} />

            {/* Glass reflection */}
            <div className="glass-panel" style={{ position:"absolute",inset:0,pointerEvents:"none" }} />

            {/* Gradient overlay */}
            <div style={{ position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(0,0,0,.4) 0%,transparent 30%,transparent 60%,rgba(0,0,0,.8) 100%)",pointerEvents:"none" }} />

            {/* Channel bug */}
            <div style={{ position:"absolute",top:10,left:10,background:"rgba(0,0,0,.8)",border:"1px solid rgba(255,255,255,.1)",borderRadius:5,padding:"3px 8px",backdropFilter:"blur(4px)" }}>
              <span style={{ fontFamily:"'Orbitron',monospace",fontSize:10,fontWeight:900,color:"#fff",letterSpacing:".08em" }}>DMEG<span style={{ color:"#6366f1" }}>.TV</span></span>
            </div>

            {/* Live indicator */}
            <div style={{ position:"absolute",top:10,right:10,display:"flex",alignItems:"center",gap:5,background:"rgba(0,0,0,.75)",border:"1px solid rgba(248,113,113,.4)",borderRadius:20,padding:"3px 10px" }}>
              <span style={{ width:5,height:5,borderRadius:"50%",background:"#f87171",display:"inline-block",animation:"ledPulse 1s infinite" }} />
              <span style={{ fontSize:9,fontWeight:700,color:"#f87171",letterSpacing:".1em" }}>HD</span>
            </div>

            {/* Play/pause center */}
            <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
              {!videoPlay && (
                <div style={{ width:60,height:60,borderRadius:"50%",background:"rgba(99,102,241,.85)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 30px rgba(99,102,241,.5)" }}>
                  <span style={{ fontSize:22,color:"#fff",marginLeft:4 }}>▶</span>
                </div>
              )}
            </div>

            {/* Bottom info */}
            <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"10px 14px" }}>
              <div style={{ fontFamily:"'Orbitron',monospace",fontSize:12,fontWeight:700,color:"#fff",marginBottom:4,textShadow:"0 1px 6px rgba(0,0,0,.8)" }}>{video.title}</div>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <div style={{ fontSize:10,color:"rgba(255,255,255,.5)" }}>@{video.handle} · {video.views} views</div>
                <div style={{ fontSize:10,color:"#a78bfa",fontWeight:700 }}>{video.me.toLocaleString()} ME</div>
              </div>
            </div>
          </div>

          {/* Video progress */}
          <div style={{ background:"#02020a",padding:"8px 14px",flexShrink:0,borderTop:"1px solid #0e0e1e" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
              <span style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:"#444",minWidth:28 }}>
                {Math.floor(videoProgress*.87/100).toString().padStart(1,"0")}:{Math.floor((videoProgress*.87%1)*60).toString().padStart(2,"0")}
              </span>
              <div style={{ flex:1,height:3,background:"#0a0a15",borderRadius:2,cursor:"pointer",position:"relative",border:"1px solid #1a1a2a" }}
                onClick={e => { const r=e.currentTarget.getBoundingClientRect(); setVideoProgress(Math.round((e.clientX-r.left)/r.width*100)); }}>
                <div style={{ height:"100%",background:"linear-gradient(90deg,#6366f1,#a78bfa)",borderRadius:2,width:`${videoProgress}%`,boxShadow:"0 0 6px #6366f1" }} />
              </div>
              <span style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:"#444",minWidth:28 }}>5:14</span>
            </div>

            {/* Video controls */}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <div style={{ display:"flex",gap:6 }}>
                <button className="ctrl-btn" style={{ width:28,height:24,fontSize:10 }} onClick={() => { nextVideo(); earnME(0.25); }}>⏭</button>
                <button className="ctrl-btn" style={{ width:28,height:24,fontSize:10,color:liked.video?"#f87171":"#555",borderColor:liked.video?"#f8717144":"#2a2a3e" }} onClick={() => { doLike("video"); earnME(0.5); }}>♥</button>
                <button className="ctrl-btn" style={{ width:28,height:24,fontSize:10 }} onClick={() => earnME(1.5)}>🔗</button>
              </div>
              <div style={{ display:"flex",gap:5 }}>
                {VIDEOS.map((v,i) => (
                  <button key={v.id} onClick={() => { setVideoIdx(i); setVideoProgress(0); }} style={{ width:28,height:20,borderRadius:4,overflow:"hidden",border:`1px solid ${i===videoIdx?"#6366f1":"#1e1e2e"}`,padding:0,cursor:"pointer",opacity:i===videoIdx?1:.5,transition:"all .2s" }}>
                    <img src={`https://picsum.photos/seed/${v.seed}/56/40`} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom chrome */}
          <div style={{ height:3,background:"linear-gradient(90deg,#1a1a2e,#a78bfa,#fff,#6366f1,#1a1a2e)",flexShrink:0 }} />
        </div>

        {/* ── PANEL 3: PHOTO SLIDESHOW ── */}
        <div style={{
          background:"linear-gradient(160deg,#0d0d1e 0%,#090915 100%)",
          border:"1px solid #1e1e30",
          borderRadius:14,
          overflow:"hidden",
          position:"relative",
          boxShadow:"0 0 0 1px #0a0a15, inset 0 1px 0 rgba(255,255,255,.06)",
          display:"flex",
          flexDirection:"column",
        }}>
          {/* Chrome top */}
          <div style={{ height:3,background:"linear-gradient(90deg,transparent,#fbbf24,#f87171,#fbbf24,transparent)",flexShrink:0 }} />

          {/* Photo display */}
          <div style={{ position:"relative",flex:1,overflow:"hidden",minHeight:180,cursor:"pointer" }} onClick={() => { nextPhoto(); earnME(0.5); }}>
            <img
              src={`https://picsum.photos/seed/${photo.seed}/640/400`}
              style={{ width:"100%",height:"100%",objectFit:"cover",display:"block",transition:"opacity .3s ease, transform 4s ease",opacity:photoAnim?1:0,transform:photoAnim?"scale(1.06)":"scale(1)" }}
            />
            {/* Glass overlay */}
            <div style={{ position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,.04) 0%,transparent 50%,rgba(0,0,0,.3) 100%)",pointerEvents:"none" }} />
            <div style={{ position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(0,0,0,.3) 0%,transparent 40%,rgba(0,0,0,.7) 100%)",pointerEvents:"none" }} />

            {/* Photo badge */}
            <div style={{ position:"absolute",top:10,left:10,background:"rgba(0,0,0,.75)",border:"1px solid rgba(251,191,36,.3)",borderRadius:5,padding:"2px 8px" }}>
              <span style={{ fontSize:8,fontWeight:700,color:"#fbbf24",letterSpacing:".1em" }}>◈ GALLERY</span>
            </div>

            {/* Counter */}
            <div style={{ position:"absolute",top:10,right:10,fontFamily:"'Orbitron',monospace",fontSize:9,color:"rgba(255,255,255,.6)",background:"rgba(0,0,0,.6)",borderRadius:4,padding:"2px 7px" }}>
              {photoIdx+1}/{PHOTOS.length}
            </div>

            {/* Nav arrows */}
            <button onClick={e => { e.stopPropagation(); prevPhoto(); }} style={{ position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",background:"rgba(0,0,0,.65)",border:"1px solid rgba(255,255,255,.12)",borderRadius:6,color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center" }}>‹</button>
            <button onClick={e => { e.stopPropagation(); nextPhoto(); }} style={{ position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"rgba(0,0,0,.65)",border:"1px solid rgba(255,255,255,.12)",borderRadius:6,color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center" }}>›</button>

            {/* Photo info */}
            <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"8px 10px" }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#fff",marginBottom:2 }}>{photo.title}</div>
              <div style={{ fontSize:9,color:"rgba(255,255,255,.4)" }}>{photo.creator}</div>
            </div>
          </div>

          {/* Slide timer bar */}
          <div style={{ height:2,background:"#0a0a15",flexShrink:0 }}>
            <div style={{ height:"100%",background:"linear-gradient(90deg,#fbbf24,#f87171)",width:`${slideTimer}%`,transition:"width .08s linear",boxShadow:"0 0 4px #fbbf24" }} />
          </div>

          {/* Photo grid thumbnails */}
          <div style={{ padding:"10px 12px",background:"#04040c",borderTop:"1px solid #0e0e1e",flexShrink:0 }}>
            <div style={{ fontSize:8,color:"#333",letterSpacing:".12em",marginBottom:7 }}>GALLERY — {PHOTOS.length} ITEMS</div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4 }}>
              {PHOTOS.map((p,i) => (
                <div key={p.id} onClick={() => { setPhotoAnim(false); setTimeout(()=>{setPhotoIdx(i);setPhotoAnim(true)},200); earnME(0.5); }} style={{ aspectRatio:"16/9",borderRadius:4,overflow:"hidden",border:`1px solid ${i===photoIdx?"#fbbf24":"#1e1e2e"}`,cursor:"pointer",opacity:i===photoIdx?1:.55,transition:"all .2s",position:"relative" }}>
                  <img src={`https://picsum.photos/seed/${p.seed}/120/68`} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                  {i===photoIdx && <div style={{ position:"absolute",inset:0,border:"1.5px solid #fbbf24",borderRadius:4,boxShadow:"0 0 6px #fbbf2466",pointerEvents:"none" }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Photo actions */}
          <div style={{ padding:"8px 12px 12px",display:"flex",gap:6,alignItems:"center" }}>
            <button className="ctrl-btn" style={{ flex:1,height:28,fontSize:10,color:liked.photo?"#f87171":"#555",borderColor:liked.photo?"#f8717144":"#2a2a3e" }} onClick={() => { doLike("photo"); earnME(0.5); }}>♥ Like</button>
            <button className="ctrl-btn" style={{ flex:1,height:28,fontSize:10 }} onClick={() => earnME(1.5)}>🔗 Share</button>
            <button className="ctrl-btn" style={{ flex:1,height:28,fontSize:10 }} onClick={() => earnME(5)}>📸 Save</button>
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM STATUS BAR ═══ */}
      <div style={{ background:"linear-gradient(90deg,#04040c,#08081a,#04040c)",border:"1px solid #0e0e1e",borderRadius:10,padding:"8px 16px",display:"flex",alignItems:"center",gap:16,overflow:"hidden",position:"relative" }}>
        {/* LED status dots */}
        <div style={{ display:"flex",gap:4,flexShrink:0 }}>
          {["#34d399","#6366f1","#fbbf24"].map((c,i) => (
            <div key={i} style={{ width:5,height:5,borderRadius:"50%",background:c,boxShadow:`0 0 4px ${c}`,animation:`ledPulse ${1+i*.3}s infinite` }} />
          ))}
        </div>

        {/* Activity ticker */}
        <div style={{ flex:1,overflow:"hidden",position:"relative" }}>
          <div style={{ fontSize:10,color:"#555",letterSpacing:".06em",whiteSpace:"nowrap",transition:"opacity .3s" }}>
            <span style={{ color:"#f87171",marginRight:8,fontFamily:"'Orbitron',monospace",fontSize:9 }}>◆ LIVE</span>
            {ACTIVITY[activity]}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"flex",gap:12,flexShrink:0 }}>
          {[
            { label:"AUDIO", val:playing?"ON":"IDLE", col:playing?"#6366f1":"#333" },
            { label:"VIDEO", val:videoPlay?"ON":"IDLE", col:videoPlay?"#a78bfa":"#333" },
            { label:"GALLERY", val:"LIVE", col:"#fbbf24" },
          ].map(s => (
            <div key={s.label} style={{ textAlign:"center" }}>
              <div style={{ fontFamily:"'Orbitron',monospace",fontSize:9,fontWeight:700,color:s.col,animation:s.col!=="#333"?"ledPulse 1.5s infinite":undefined }}>{s.val}</div>
              <div style={{ fontSize:7,color:"#2a2a3a",letterSpacing:".1em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ME counter */}
        <div style={{ background:"#6366f110",border:"1px solid #6366f133",borderRadius:6,padding:"4px 10px",flexShrink:0 }}>
          <span style={{ fontFamily:"'Orbitron',monospace",fontSize:11,fontWeight:900,color:"#a78bfa" }}>+{meEarned.toFixed(1)}</span>
          <span style={{ fontSize:8,color:"#555",marginLeft:4,letterSpacing:".08em" }}>ME</span>
        </div>
      </div>
    </div>
  );
}
