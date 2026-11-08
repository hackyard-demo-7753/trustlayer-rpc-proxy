import http from 'node:http';
import crypto from 'node:crypto';
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const RELAY_KEY = process.env.RELAY_KEY || '';
const READ_ALLOWED = new Set(['getSignaturesForAddress','getTransaction','getSignatureStatuses','getAccountInfo','getHealth','getLatestBlockhash','getBalance','getBlockHeight']);
const WRITE_ALLOWED = new Set(['sendTransaction']);
const isDevnet = /devnet/i.test(RPC);
// naive per-key/ip sliding-window rate limiter
const hits = new Map();
function limited(bucket, max, windowMs){
  const now = Date.now();
  const arr = (hits.get(bucket)||[]).filter(t=>now-t<windowMs);
  if (arr.length>=max){ hits.set(bucket,arr); return true; }
  arr.push(now); hits.set(bucket,arr); return false;
}
const json = (res,code,obj)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(obj));};
http.createServer((req,res)=>{
  res.setHeader('access-control-allow-origin','*');
  if (req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if (req.url==='/health'){return json(res,200,{ok:true,writeEnabled:!!(RELAY_KEY&&isDevnet),cluster:isDevnet?'devnet':'other'});}
  if (req.method!=='POST'){res.writeHead(405);return res.end();}
  const ip = req.headers['cf-connecting-ip']||req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown';
  let b='';req.on('data',c=>{b+=c;if(b.length>2_000_000)req.destroy();});req.on('end',async()=>{
    try{
      const{method,params,id}=JSON.parse(b);
      if(READ_ALLOWED.has(method)){
        if(limited('r:'+ip,120,60_000))return json(res,429,{error:'rate limited'});
      }else if(WRITE_ALLOWED.has(method)){
        // fail closed: write methods require relay key AND a devnet upstream
        if(!RELAY_KEY||!isDevnet)return json(res,403,{error:'write methods disabled on this relay'});
        const key=req.headers['x-relay-key']||'';
        const a=Buffer.from(String(key)),c=Buffer.from(RELAY_KEY);
        if(a.length!==c.length||!crypto.timingSafeEqual(a,c))return json(res,401,{error:'invalid relay key'});
        if(limited('w:'+ip,20,60_000))return json(res,429,{error:'rate limited'});
      }else{
        return json(res,403,{error:'method not allowed'});
      }
      const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:id??1,method,params})});
      const j=await r.text();
      res.writeHead(200,{'content-type':'application/json'});res.end(j);
    }catch(e){json(res,400,{error:String(e)});}
  });
}).listen(process.env.PORT||3000,()=>console.log('rpc proxy listening, devnet='+isDevnet+' write='+(!!RELAY_KEY)));
