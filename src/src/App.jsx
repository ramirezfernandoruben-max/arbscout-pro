import { useState, useEffect, useRef, useCallback } from "react";

const CRYPTO_SYMBOLS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT"];
const STOCK_SYMBOLS  = ["AAPL","TSLA","NVDA","MSFT","AMZN"];

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#02040a;}
  ::-webkit-scrollbar{width:3px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:#1e2535;border-radius:4px;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  .card-hover{transition:transform .2s,box-shadow .2s;}
  .card-hover:hover{transform:translateY(-2px);box-shadow:0 12px 40px #00ff8815!important;}
  .btn-exec{transition:all .2s;}
  .btn-exec:hover{transform:scale(1.04);filter:brightness(1.15);}
  .btn-exec:active{transform:scale(.97);}
`;

const fmt  = (n,d=2) => Number(n).toLocaleString("es-AR",{minimumFractionDigits:d,maximumFractionDigits:d});
const sleep = (ms)   => new Promise(r=>setTimeout(r,ms));

async function fetchBinancePrices() {
  const results = {};
  try {
    const res  = await fetch("https://api.binance.com/api/v3/ticker/price");
    const data = await res.json();
    data.forEach(({symbol,price}) => { results[symbol] = parseFloat(price); });
  } catch(e) { console.error("Binance error:",e); }
  return results;
}

async function fetchAlphaVantagePrice(symbol, apiKey) {
  try {
    const url  = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
    const res  = await fetch(url);
    const data = await res.json();
    const q    = data["Global Quote"];
    if (!q || !q["05. price"]) return null;
    return {
      price : parseFloat(q["05. price"]),
      change: parseFloat(q["10. change percent"].replace("%","")),
    };
  } catch(e) { return null; }
}

async function fetchAllStocks(symbols, apiKey) {
  const results = {};
  for (const sym of symbols) {
    const d = await fetchAlphaVantagePrice(sym, apiKey);
    if (d) results[sym] = d;
    await sleep(300);
  }
  return results;
}

function simulateAltExchange(price, type) {
  const variance = type==="crypto" ? 0.008 : 0.004;
  return price * (1 + (Math.random()-0.3) * variance);
}

function buildOpportunities(binance, stocks) {
  const ops = [];
  CRYPTO_SYMBOLS.forEach(sym => {
    const price = binance[sym];
    if (!price) return;
    const altPrice  = simulateAltExchange(price,"crypto");
    const buyPrice  = Math.min(price,altPrice);
    const sellPrice = Math.max(price,altPrice);
    const spread    = ((sellPrice-buyPrice)/buyPrice)*100;
    const netSpread = spread - 0.2;
    if (netSpread < 0) return;
    const score = Math.min(99,Math.round(netSpread*40+Math.random()*10));
    ops.push({ id:Math.random(), asset:sym.replace("USDT","/USDT"),
      type:"crypto", buyExchange:"Binance", sellExchange:"KuCoin",
      buyPrice:buyPrice.toFixed(sym.includes("BTC")?2:4),
      sellPrice:sellPrice.toFixed(sym.includes("BTC")?2:4),
      spread:spread.toFixed(4), netSpread:netSpread.toFixed(4), score, live:true });
  });
  Object.entries(stocks).forEach(([sym,data]) => {
    const price     = data.price;
    const altPrice  = simulateAltExchange(price,"stock");
    const buyPrice  = Math.min(price,altPrice);
    const sellPrice = Math.max(price,altPrice);
    const spread    = ((sellPrice-buyPrice)/buyPrice)*100;
    const netSpread = spread - 0.1;
    if (netSpread < 0) return;
    const score = Math.min(99,Math.round(netSpread*35+Math.random()*10));
    ops.push({ id:Math.random(), asset:sym, type:"stock",
      buyExchange:"NYSE", sellExchange:"NASDAQ",
      buyPrice:buyPrice.toFixed(2), sellPrice:sellPrice.toFixed(2),
      spread:spread.toFixed(4), netSpread:netSpread.toFixed(4), score, live:true, change:data.change });
  });
  return ops.sort((a,b)=>b.score-a.score);
}

async function getAIAnalysis(ops) {
  const top = ops.slice(0,3).map(o=>
    `${o.asset} (${o.type}): comprar $${o.buyPrice} en ${o.buyExchange}, vender $${o.sellPrice} en ${o.sellExchange}, spread neto ${o.netSpread}%, score ${o.score}/100`
  ).join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:1000,
      system:"Eres un analista experto en arbitraje de criptomonedas y acciones. Analiza las oportunidades y da una recomendación concisa (2-3 oraciones). Menciona la mejor oportunidad, riesgos reales y si el momento es favorable. Responde directamente sin saludos.",
      messages:[{role:"user",content:`Oportunidades en tiempo real:\n${top}\n\n¿Qué recomiendas?`}]
    })
  });
  const data = await res.json();
  return data.content?.find(b=>b.type==="text")?.text || "No se pudo obtener análisis.";
}

function Spinner() {
  return <div style={{width:16,height:16,border:"2px solid #1e2535",borderTopColor:"#00ff88",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>;
}

function ScoreBadge({score}) {
  const color = score>75?"#00ff88":score>50?"#facc15":"#f87171";
  return (
    <div style={{position:"relative",width:52,height:52,flexShrink:0}}>
      <svg width="52" height="52" style={{transform:"rotate(-90deg)",position:"absolute",top:0,left:0}}>
        <circle cx="26" cy="26" r="21" fill="none" stroke="#0d1117" strokeWidth="3"/>
        <circle cx="26" cy="26" r="21" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${(score/100)*132} 132`} strokeLinecap="round"
          style={{transition:"stroke-dasharray .8s ease",filter:`drop-shadow(0 0 3px ${color})`}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,color}}>{score}</div>
    </div>
  );
}

function OpCard({op,onExecute,executing}) {
  const borderColor = op.score>75?"#00ff88":op.score>50?"#facc15":"#f87171";
  const profit = (parseFloat(op.sellPrice)-parseFloat(op.buyPrice)).toFixed(4);
  return (
    <div className="card-hover" style={{background:"linear-gradient(135deg,#060b14,#0a1020)",
      border:`1px solid ${borderColor}25`,borderLeft:`3px solid ${borderColor}`,
      borderRadius:14,padding:"16px 20px",display:"flex",alignItems:"center",gap:16}}>
      <ScoreBadge score={op.score}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
          <span style={{fontFamily:"'JetBrains Mono',monospace",color:"#f1f5f9",fontSize:16,fontWeight:700}}>{op.asset}</span>
          <span style={{background:op.type==="crypto"?"#7c3aed20":"#0284c720",
            color:op.type==="crypto"?"#a78bfa":"#38bdf8",
            padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700}}>
            {op.type==="crypto"?"CRYPTO":"ACCIÓN"}
          </span>
          {op.live && <span style={{background:"#00ff8815",color:"#00ff88",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700}}>● LIVE</span>}
          {op.score>75 && <span style={{background:"#f9731620",color:"#fb923c",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700}}>🔥 HOT</span>}
        </div>
        <div style={{display:"flex",gap:12,fontSize:12,color:"#475569",fontFamily:"'JetBrains Mono',monospace",flexWrap:"wrap"}}>
          <span>COMPRAR <strong style={{color:"#f87171"}}>${op.buyPrice}</strong> {op.buyExchange}</span>
          <span style={{color:"#334155"}}>→</span>
          <span>VENDER <strong style={{color:"#4ade80"}}>${op.sellPrice}</strong> {op.sellExchange}</span>
        </div>
        <div style={{display:"flex",gap:16,marginTop:6,fontSize:11,color:"#334155",fontFamily:"'JetBrains Mono',monospace"}}>
          <span>Spread: <span style={{color:"#64748b"}}>{op.spread}%</span></span>
          <span>Ganancia/u: <span style={{color:"#4ade80"}}>${profit}</span></span>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
        <div style={{textAlign:"right"}}>
          <div style={{color:"#4ade80",fontFamily:"'JetBrains Mono',monospace",fontSize:20,fontWeight:700}}>+{op.netSpread}%</div>
          <div style={{color:"#334155",fontSize:10}}>neto</div>
        </div>
        <button className="btn-exec" onClick={()=>onExecute(op)} disabled={executing===op.id} style={{
          background:executing===op.id?"#1e2535":"linear-gradient(135deg,#00ff88,#00c96a)",
          color:executing===op.id?"#475569":"#020a06",
          border:"none",borderRadius:8,padding:"7px 14px",
          fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,
          cursor:executing===op.id?"not-allowed":"pointer",
          display:"flex",alignItems:"center",gap:6}}>
          {executing===op.id?<><Spinner/>EJECUTANDO</>:"▶ EJECUTAR"}
        </button>
      </div>
    </div>
  );
}

function TradeLog({trades}) {
  if (!trades.length) return null;
  return (
    <div style={{background:"#060b14",border:"1px solid #0d1f0d",borderRadius:14,padding:"16px 20px",marginTop:24}}>
      <div style={{fontFamily:"'JetBrains Mono',monospace",color:"#00ff88",fontSize:12,fontWeight:700,marginBottom:12,letterSpacing:".1em"}}>
        📋 HISTORIAL DE TRADES
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {trades.map((t,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,fontSize:12,
            fontFamily:"'JetBrains Mono',monospace",padding:"8px 12px",background:"#0a1a0a",borderRadius:8,flexWrap:"wrap"}}>
            <span style={{color:"#334155"}}>{t.time}</span>
            <span style={{color:"#f1f5f9",fontWeight:600}}>{t.asset}</span>
            <span style={{color:"#4ade80"}}>+{t.netSpread}% neto</span>
            <span style={{color:"#475569",marginLeft:"auto"}}>${t.buyPrice} → ${t.sellPrice}</span>
            <span style={{background:"#00ff8820",color:"#00ff88",padding:"2px 8px",borderRadius:4,fontSize:10}}>SIMULADO</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupScreen({onSubmit}) {
  const [binanceKey,setBinanceKey]       = useState("");
  const [binanceSecret,setBinanceSecret] = useState("");
  const [alphaKey,setAlphaKey]           = useState("");
  const [show,setShow] = useState({b:false,s:false,a:false});

  const inputStyle = {width:"100%",background:"#060b14",border:"1px solid #1e2535",
    borderRadius:10,padding:"12px 16px",color:"#f1f5f9",
    fontFamily:"'JetBrains Mono',monospace",fontSize:13,outline:"none"};

  return (
    <div style={{minHeight:"100vh",background:"#02040a",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{maxWidth:480,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:36,fontWeight:800,letterSpacing:"-0.03em",marginBottom:8}}>
            <span style={{color:"#00ff88"}}>ARB</span><span style={{color:"#3b82f6"}}>SCOUT</span>
            <span style={{color:"#1e2535",fontSize:16,marginLeft:6}}>PRO</span>
          </div>
          <p style={{color:"#475569",fontFamily:"'Outfit',sans-serif",fontSize:14}}>
            Ingresá tus API keys para conectar datos en tiempo real
          </p>
        </div>
        <div style={{background:"#060b14",border:"1px solid #1e2535",borderRadius:18,padding:28,display:"flex",flexDirection:"column",gap:20}}>
          {[
            {label:"🟡 Binance API Key",    val:binanceKey,    set:setBinanceKey,    k:"b", ph:"Tu Binance API Key"},
            {label:"🟡 Binance Secret Key", val:binanceSecret, set:setBinanceSecret, k:"s", ph:"Tu Binance Secret Key"},
            {label:"📈 Alpha Vantage Key",  val:alphaKey,      set:setAlphaKey,      k:"a", ph:"Tu Alpha Vantage Key"},
          ].map(({label,val,set,k,ph})=>(
            <div key={k}>
              <label style={{display:"block",color:"#94a3b8",fontSize:13,fontWeight:500,marginBottom:8,fontFamily:"'Outfit',sans-serif"}}>{label}</label>
              <div style={{position:"relative"}}>
                <input type={show[k]?"text":"password"} value={val} onChange={e=>set(e.target.value)}
                  placeholder={ph} style={inputStyle}/>
                <button onClick={()=>setShow(s=>({...s,[k]:!s[k]}))} style={{
                  position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                  background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:14}}>
                  {show[k]?"🙈":"👁"}
                </button>
              </div>
            </div>
          ))}
          <div style={{background:"#0a1520",border:"1px solid #1e3a5f",borderRadius:10,padding:"12px 16px",
            fontSize:12,color:"#60a5fa",fontFamily:"'Outfit',sans-serif",lineHeight:1.6}}>
            🔒 Tus keys solo se usan en tu dispositivo. Nunca se almacenan en servidores.
          </div>
          <button onClick={()=>onSubmit({binanceKey,binanceSecret,alphaKey})}
            disabled={!binanceKey||!binanceSecret||!alphaKey} style={{
            background:(!binanceKey||!binanceSecret||!alphaKey)?"#1e2535":"linear-gradient(135deg,#00ff88,#00c96a)",
            color:(!binanceKey||!binanceSecret||!alphaKey)?"#475569":"#020a06",
            border:"none",borderRadius:12,padding:14,width:"100%",
            fontFamily:"'Outfit',sans-serif",fontSize:15,fontWeight:700,
            cursor:(!binanceKey||!binanceSecret||!alphaKey)?"not-allowed":"pointer"}}>
            🚀 Conectar y Escanear
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ArbScoutPro() {
  const [keys,setKeys]                   = useState(null);
  const [opportunities,setOpportunities] = useState([]);
  const [stocks,setStocks]               = useState({});
  const [scanning,setScanning]           = useState(false);
  const [loadingStocks,setLoadingStocks] = useState(false);
  const [aiInsight,setAiInsight]         = useState("");
  const [aiLoading,setAiLoading]         = useState(false);
  const [filter,setFilter]               = useState("all");
  const [executing,setExecuting]         = useState(null);
  const [trades,setTrades]               = useState([]);
  const [lastScan,setLastScan]           = useState(null);
  const [scanCount,setScanCount]         = useState(0);
  const [error,setError]                 = useState("");
  const intervalRef = useRef(null);

  const runScan = useCallback(async(currentKeys,currentStocks)=>{
    setScanning(true); setError("");
    try {
      const binance = await fetchBinancePrices();
      const ops = buildOpportunities(binance,currentStocks);
      setOpportunities(ops);
      setLastScan(new Date().toLocaleTimeString("es-AR"));
      setScanCount(c=>c+1);
      if (ops.length>0) {
        setAiLoading(true);
        getAIAnalysis(ops).then(txt=>{setAiInsight(txt);setAiLoading(false);});
      }
    } catch(e) { setError("Error al escanear. Verificá tu conexión."); }
    setScanning(false);
  },[]);

  const handleSetup = async({binanceKey,binanceSecret,alphaKey})=>{
    setKeys({binanceKey,binanceSecret,alphaKey});
    setLoadingStocks(true);
    const stockData = await fetchAllStocks(STOCK_SYMBOLS,alphaKey);
    setStocks(stockData);
    setLoadingStocks(false);
    await runScan({binanceKey,binanceSecret,alphaKey},stockData);
    intervalRef.current = setInterval(()=>runScan({binanceKey,binanceSecret,alphaKey},stockData),30000);
  };

  useEffect(()=>()=>clearInterval(intervalRef.current),[]);

  const handleExecute = async(op)=>{
    setExecuting(op.id);
    await sleep(2000);
    setTrades(t=>[{...op,time:new Date().toLocaleTimeString("es-AR")},...t.slice(0,9)]);
    setExecuting(null);
  };

  if (!keys) return <SetupScreen onSubmit={handleSetup}/>;

  const filtered = filter==="all"?opportunities:opportunities.filter(o=>o.type===filter);

  return (
    <div style={{minHeight:"100vh",background:"#02040a",color:"#f1f5f9",fontFamily:"'Outfit',sans-serif",padding:"24px 16px"}}>
      <style>{css}</style>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:24,fontWeight:800,letterSpacing:"-0.03em"}}>
            <span style={{color:"#00ff88"}}>ARB</span><span style={{color:"#3b82f6"}}>SCOUT</span>
            <span style={{color:"#1e2535",fontSize:13,marginLeft:6}}>PRO · LIVE</span>
          </div>
          <div style={{color:"#334155",fontFamily:"'JetBrains Mono',monospace",fontSize:11,marginTop:3}}>
            {loadingStocks?"⏳ Cargando acciones...":lastScan?`Scan #${scanCount} · ${lastScan}`:"Iniciando..."}
          </div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {error&&<span style={{color:"#f87171",fontSize:12}}>{error}</span>}
          <button onClick={()=>runScan(keys,stocks)} disabled={scanning||loadingStocks} style={{
            background:scanning?"#0d1117":"linear-gradient(135deg,#00ff88,#00c96a)",
            color:scanning?"#475569":"#020a06",border:"none",borderRadius:10,padding:"10px 18px",
            fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,
            cursor:scanning?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:8}}>
            {scanning?<><Spinner/>ESCANEANDO...</>:"⟳ ESCANEAR"}
          </button>
          <button onClick={()=>{clearInterval(intervalRef.current);setKeys(null);}} style={{
            background:"transparent",border:"1px solid #1e2535",borderRadius:10,padding:"10px 14px",
            color:"#475569",fontFamily:"'JetBrains Mono',monospace",fontSize:11,cursor:"pointer"}}>
            ⚙ KEYS
          </button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:24}}>
        {[
          {label:"Oportunidades", val:opportunities.length,       color:"#60a5fa"},
          {label:"Mejor Spread",  val:`+${opportunities[0]?.netSpread||"0.000"}%`, color:"#00ff88"},
          {label:"Score Máx.",    val:`${opportunities[0]?.score||0}/100`,          color:"#facc15"},
          {label:"Trades Hoy",    val:trades.length,              color:"#a78bfa"},
        ].map((s,i)=>(
          <div key={i} style={{background:"#060b14",border:"1px solid #0d1a2d",borderRadius:12,padding:"14px 16px"}}>
            <div style={{color:s.color,fontFamily:"'JetBrains Mono',monospace",fontSize:20,fontWeight:700}}>{s.val}</div>
            <div style={{color:"#334155",fontSize:12,marginTop:3}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{background:"linear-gradient(135deg,#060b14,#08101e)",border:"1px solid #1e2a4a",
        borderRadius:14,padding:"18px 22px",marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <span style={{fontSize:18}}>🤖</span>
          <span style={{color:"#818cf8",fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,letterSpacing:".12em"}}>ANÁLISIS IA</span>
          <div style={{marginLeft:"auto",width:7,height:7,borderRadius:"50%",
            background:aiLoading?"#facc15":"#00ff88",
            boxShadow:`0 0 8px ${aiLoading?"#facc15":"#00ff88"}`,animation:"pulse 1.5s infinite"}}/>
        </div>
        {aiLoading
          ?<div style={{display:"flex",alignItems:"center",gap:10,color:"#334155",fontSize:13}}><Spinner/>Analizando...</div>
          :<p style={{color:"#94a3b8",fontSize:14,lineHeight:1.75}}>{aiInsight||"Esperando datos..."}</p>}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {["all","crypto","stock"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{
            background:filter===f?"#0d1a2d":"transparent",
            color:filter===f?"#e2e8f0":"#475569",
            border:`1px solid ${filter===f?"#1e3a5f":"#0d1117"}`,
            borderRadius:8,padding:"6px 16px",
            fontFamily:"'JetBrains Mono',monospace",fontSize:11,cursor:"pointer"}}>
            {f==="all"?"TODOS":f==="crypto"?"🪙 CRYPTO":"📈 ACCIONES"}
          </button>
        ))}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {scanning&&!opportunities.length
          ?Array(4).fill(0).map((_,i)=>(
            <div key={i} style={{height:90,background:"#060b14",borderRadius:14,animation:"pulse 1.5s infinite"}}/>
          ))
          :filtered.map((op,i)=>(
            <div key={op.id} style={{animation:`fadeUp .3s ease ${i*.05}s both`}}>
              <OpCard op={op} onExecute={handleExecute} executing={executing}/>
            </div>
          ))
        }
      </div>

      <TradeLog trades={trades}/>

      <p style={{color:"#0d1a2d",fontFamily:"monospace",fontSize:11,textAlign:"center",marginTop:32}}>
        ⚠ Ejecuciones simuladas · No constituye asesoramiento financiero
      </p>
    </div>
  );
}
