const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),workspace=path.dirname(root);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function tree(dir){const out={};function visit(d,rel=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.angular','dist','.git','.npm-cache'].includes(e.name))continue;const r=path.join(rel,e.name);if(e.isDirectory())visit(path.join(d,e.name),r);else out[r]=hash(path.join(d,e.name));}}visit(dir);return out;}
async function snapshot(){
  const env=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
  const result={at:new Date().toISOString(),envHash:hash(path.join(root,'.env')),bonusHash:hash(path.join(workspace,'bonus.js')),
    frontend:tree('C:/Users/Mada/OneDrive/Desktop/social-login/social-login'),postman:tree(path.join(root,'postman')),
    existingTests:Object.fromEntries(fs.readdirSync(path.join(root,'test')).filter(n=>n!== 'final-audit.test.js').map(n=>[n,hash(path.join(root,'test',n))])),
    configuration:{port:env.PORT||'3001',googleConfigured:!!env.GOOGLE_CLIENT_ID,redisConfigured:!!env.REDIS_URL,otpConfigured:Buffer.byteLength(env.OTP_SECRET||'')>=32,smtpLocal:['localhost','127.0.0.1'].includes(env.SMTP_HOST),smtpPort:env.SMTP_PORT||'',legacyExplicitOptOut:env.LEGACY_REQUIRE_AUTH==='false'}};
  const mongoose=require('mongoose');const db=await mongoose.createConnection(env.MONGO_URI,{serverSelectionTimeoutMS:3000}).asPromise();
  try{
    result.developmentDatabase=db.name;result.counts={};
    for(const c of ['Users','Notes','Messages','RefreshTokens','IdentityRequests','Conversations','ConversationMessages'])result.counts[c]=await db.collection(c).countDocuments();
    const users=await db.collection('Users').find({}).sort({_id:1}).toArray();
    result.usersDigest=crypto.createHash('sha256').update(JSON.stringify(users)).digest('hex');result.adminCount=users.filter(u=>u.role==='admin').length;
  }finally{await db.close();}
  return result;
}
async function main(){const file=path.join(root,'test-results/final-audit-preservation-before.json');const now=await snapshot();
 if(process.argv.includes('--compare')){const before=JSON.parse(fs.readFileSync(file));const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const report={at:now.at,envUnchanged:before.envHash===now.envHash,bonusUnchanged:before.bonusHash===now.bonusHash,frontendUnchanged:same(before.frontend,now.frontend),originalTestsUnchanged:same(before.existingTests,now.existingTests),originalPostmanUnchanged:Object.entries(before.postman).every(([k,v])=>now.postman[k]===v),developmentUsersUnchanged:before.usersDigest===now.usersDigest,adminCountUnchanged:before.adminCount===now.adminCount,countsBefore:before.counts,countsAfter:now.counts};
 fs.writeFileSync(path.join(root,'test-results/final-audit-preservation-after.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(Object.values(report).includes(false))process.exitCode=1;
 }else{fs.writeFileSync(file,JSON.stringify(now,null,2));console.log(JSON.stringify({snapshotSaved:true,configuration:now.configuration,developmentDatabase:now.developmentDatabase}));}}
main().catch(e=>{console.error(e.name);process.exitCode=1;});
