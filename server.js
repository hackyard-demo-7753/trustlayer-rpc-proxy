import http from 'node:http';
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const ALLOWED = new Set(['getSignaturesForAddress','getTransaction','getHealth','getLatestBlockhash','getBalance']);
http.createServer((req,res)=>{
  res.setHeader('access-control-allow-origin','*');
  if (req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if (req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});return res.end('{"ok":true}');}
  if (req.method!=='POST'){res.writeHead(405);return res.end();}
  let b='';req.on('data',c=>b+=c);req.on('end',async()=>{
    try{
      const{method,params,id}=JSON.parse(b);
      if(!ALLOWED.has(method)){res.writeHead(403,{'content-type':'application/json'});return res.end('{"error":"method not allowed"}');}
      const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:id??1,method,params})});
      const j=await r.text();
      res.writeHead(200,{'content-type':'application/json'});res.end(j);
    }catch(e){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:String(e)}));}
  });
}).listen(process.env.PORT||3000,()=>console.log('rpc proxy listening'));
