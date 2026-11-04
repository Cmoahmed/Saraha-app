const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),mongoose=require('mongoose');
const root=path.join(__dirname,'..');process.env.NODE_ENV='test';process.env.LEGACY_REQUIRE_AUTH='true';
for(const k of ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','OTP_SECRET'])process.env[k]=crypto.randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_PORT='1025';process.env.SMTP_SECURE='false';
process.env.AVATAR_DIR=path.join(root,'test-results/final-audit-avatars-'+crypto.randomUUID());
for(const k of ['REDIS_URL','SMTP_USER','SMTP_PASS','GOOGLE_CLIENT_ID'])delete process.env[k];
let server;const report={at:new Date().toISOString(),realMailpit:true,legacyOwnershipEnforced:true};
const mode=process.argv.includes('--original')?'original':process.argv.includes('--part3')?'part3':'final';
if(mode==='original'){process.env.LEGACY_REQUIRE_AUTH='false';report.legacyOwnershipEnforced=false;}
async function run(){
 report.database=`saraha_final_newman_${crypto.randomBytes(6).toString('hex')}_test`;
 await mongoose.connect(`mongodb://127.0.0.1:27017/${report.database}`,{serverSelectionTimeoutMS:3000});
 await Promise.all(['user','note','message','refreshToken','challenge','identity-request','conversation','conversation-message'].map(n=>require(`../models/${n}.model`).init()));
 const assertMailpit=await fetch('http://127.0.0.1:8025/api/v1/info',{signal:AbortSignal.timeout(3000)});if(assertMailpit.status!==200)throw Error('Mailpit unavailable');
 server=require('../app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const collection=JSON.parse(fs.readFileSync(path.join(root,mode==='original'?'postman/Saraha_Backend.postman_collection.json':mode==='part3'?'postman/Saraha_Course_Part3.postman_collection.json':'postman/Saraha_FINAL_AUDIT.postman_collection.json')));
 const environment=JSON.parse(fs.readFileSync(path.join(root,mode==='original'?'postman/Saraha_Local.postman_environment.json':mode==='part3'?'postman/Saraha_Part3_Local.postman_environment.json':'postman/Saraha_FINAL_Local.postman_environment.json')));
 if(mode==='original'){environment.values=environment.values.filter(v=>v.key!=='skipExternalMail');environment.values.push({key:'skipExternalMail',value:'true',enabled:true});}
 environment.values.find(v=>v.key==='baseUrl').value=`http://127.0.0.1:${server.address().port}`;
 const mailpit=environment.values.find(v=>v.key==='mailpitUrl');if(mailpit)mailpit.value='http://127.0.0.1:8025';else environment.values.push({key:'mailpitUrl',value:'http://127.0.0.1:8025',enabled:true});
 const summary=await new Promise((resolve,reject)=>require('newman').run({collection,environment,workingDir:root,timeoutRequest:25000,reporters:[]},(e,s)=>e?reject(e):resolve(s)));
 report.stats=summary.run.stats;report.failures=summary.run.failures.map(f=>({request:f.source.name,message:f.error.message}));
 report.requests=summary.run.executions.map(e=>({name:e.item.name,status:e.response?.code,assertions:e.assertions?.length||0}));
 report.skippedRequests=summary.run.stats.items.total-summary.run.stats.requests.total;
 const names=new Set(report.requests.filter(e=>e.status).map(e=>e.name));report.skippedNames=collection.item.flatMap(f=>f.item).map(i=>i.name).filter(n=>!names.has(n));
 report.fixtureUsers=await require('../models/user.model').find({}).select('_id name email role isEmailVerified isTwoFactorEnabled').lean();
 console.log(JSON.stringify({stats:report.stats,failures:report.failures,skippedRequests:report.skippedRequests,skippedNames:report.skippedNames}));
 if(report.failures.length)process.exitCode=1;
}
run().catch(e=>{report.error=e.message;console.error(e.message);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(root,mode==='final'?'test-results/final-audit-newman.json':`test-results/final-audit-${mode}-newman.json`),JSON.stringify(report,null,2));if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();});
