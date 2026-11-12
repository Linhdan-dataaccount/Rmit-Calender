import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import worker from '../dist/server/index.js';

const index = process.argv.indexOf('--port');
const port = Number(index >= 0 ? process.argv[index+1] : process.env.PORT || 5173);
createServer(async (req,res)=>{
  try {
    const response=await worker.fetch(new Request('http://localhost:'+port+req.url,{
      method:req.method,headers:req.headers,
      ...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})
    }));
    res.writeHead(response.status,Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch {
    res.writeHead(500);
    res.end('Preview error');
  }
}).listen(port,'0.0.0.0',()=>console.log('Weekplan preview on '+port));
