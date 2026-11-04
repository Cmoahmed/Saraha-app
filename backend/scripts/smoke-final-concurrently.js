const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
async function main(){const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const root=path.resolve(__dirname,'..');const env={...process.env,PORT:String(port),HOST:'127.0.0.1',NODE_ENV:'test',MONGO_URI:`mongodb://127.0.0.1:27017/saraha_final_watch_${crypto.randomBytes(6).toString('hex')}_test`,NO_COLOR:'1',REDIS_URL:''};
 for(const k of ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','OTP_SECRET'])env[k]=crypto.randomBytes(48).toString('hex');env.ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');
 const child=require('node:child_process').spawn(process.execPath,['scripts/dev-course.js'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>{output+=b.toString();});child.stderr.on('data',b=>{output+=b.toString();});
 const report={backendHealthy:false,typeScriptWatcher:false,ownedProcessTreeStopped:false};
 try{for(let i=0;i<120;i++){try{report.backendHealthy=(await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(200)})).status===200;}catch{}report.typeScriptWatcher=output.includes('Watching for file changes');if(report.backendHealthy&&report.typeScriptWatcher)break;await new Promise(r=>setTimeout(r,100));}
 if(!report.backendHealthy||!report.typeScriptWatcher)throw Error('Both development watchers did not become ready');
 }finally{if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>require('node:child_process').execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>resolve()));report.ownedProcessTreeStopped=true;report.diagnostics=output.slice(0,4000);fs.writeFileSync(path.join(root,'test-results/final-audit-concurrently-smoke.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report));}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
