const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.LEGACY_REQUIRE_AUTH = 'true';
delete process.env.REDIS_URL;
for (const key of ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','OTP_SECRET']) process.env[key] = crypto.randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const app = require('../app');
const Users = require('../models/user.model');
const Notes = require('../models/note.model');
const password = 'final-audit-only-password';
let one,two,oneToken,twoToken,note;
const person = n => ({name:n,email:`${n}@example.test`,password,Phone:'01012345678',age:22});
const call = (method,url,token) => request(app)[method](url).set(token ? {Authorization:`Bearer ${token}`} : {});
const url = (p,id=one) => `${p}${p.includes('?')?'&':'?'}userId=${id}`;
before(async()=>{
  await mongoose.connect(`mongodb://127.0.0.1:27017/saraha_final_security_${crypto.randomBytes(6).toString('hex')}_test`,{serverSelectionTimeoutMS:3000});
  await Promise.all([Users.init(),Notes.init(),require('../models/refreshToken.model').init()]);
});
after(async()=>{await mongoose.disconnect();});
test('Assignment 8 User Q1: exact signup contract, duplicate email, hashing and role injection',async()=>{
  const r=await request(app).post('/users/signup').send(person('final_owner')).expect(201);
  one=r.body.user._id;assert.equal(r.body.message,'User added successfully.');assert.equal(r.body.user.Password,undefined);
  two=(await request(app).post('/users/signup').send(person('final_other')).expect(201)).body.user._id;
  await request(app).post('/users/signup').send(person('final_owner')).expect(409).expect(r=>assert.equal(r.body.message,'Email already exists.'));
  await request(app).post('/users/signup').send({...person('role_injection'),role:'admin'}).expect(400);
  assert.match((await Users.findById(one).select('+Password')).Password,/^\$2/);
});
test('Assignment 8 User Q2: legacy login supplies JWT without changing original fields; malformed/unknown credentials controlled',async()=>{
  const r=await request(app).post('/users/login').send({email:person('final_owner').email,password}).expect(200);
  oneToken=r.body.accessToken;assert.equal(r.body.userId,one);assert.equal(r.body.message,'Logged in');assert.ok(oneToken);
  twoToken=(await request(app).post('/users/login').send({email:person('final_other').email,password}).expect(200)).body.accessToken;
  for(const body of [{password},{email:'missing@example.test',password},{email:person('final_owner').email,password:'wrong'}])
    await request(app).post('/users/login').send(body).expect(401).expect(r=>assert.equal(r.body.message,'Invalid email or password'));
});
test('Assignment 8 User Q3: own update, duplicate email and password rejection; forged query identity blocked',async()=>{
  await call('patch',url(`/users/${one}`),oneToken).send({name:'Updated Owner'}).expect(200);
  await call('patch',url(`/users/${one}`),oneToken).send({email:person('final_other').email}).expect(409);
  await call('patch',url(`/users/${one}`),oneToken).send({Password:'forbidden'}).expect(400);
  await call('patch',url(`/users/${two}`,two),oneToken).send({name:'Intruder'}).expect(403);
  await call('patch',url(`/users/${one}`)).send({name:'Unauthenticated'}).expect(401);
  await call('patch',url(`/users/${one}`),oneToken).send({role:'admin'}).expect(400);
});
test('Assignment 8 User Q4: delete only authenticated disposable owner; guessed IDs cannot delete another account',async()=>{
  const p=person('final_delete_only');
  const id=(await request(app).post('/users/signup').send(p).expect(201)).body.user._id;
  const token=(await request(app).post('/users/login').send({email:p.email,password}).expect(200)).body.accessToken;
  await call('delete',url('/users',id),oneToken).expect(403);
  await call('delete',url('/users',id),token).expect(200).expect(r=>assert.equal(r.body.message,'User deleted'));
  assert.equal(await Users.findById(id),null);assert.ok(await Users.findById(one));
});
test('Assignment 8 User Q5: owner profile read excludes password/token; unauthenticated and forged IDs denied',async()=>{
  const r=await call('get',url('/users'),oneToken).expect(200);assert.equal(r.body._id,one);assert.equal(r.body.Password,undefined);
  await call('get',url('/users',two),oneToken).expect(403);await call('get',url('/users')).expect(401);
});
test('Assignment 8 Note Q1: create required owner note; forged body/query IDs rejected',async()=>{
  const r=await call('post',url('/notes'),oneToken).send({title:'First Note',content:'Workout Plan'}).expect(201);
  assert.equal(r.body.message,'Note created');note=r.body.note._id;
  await call('post',url('/notes',two),oneToken).send({title:'Forgery',content:'x'}).expect(403);
  await call('post',url('/notes'),oneToken).send({title:'Valid'}).expect(400);
  await call('post',url('/notes'),oneToken).send({title:'Valid',content:'x',userId:two}).expect(400);
});
test('Assignment 8 Note Q2: update retains content; actual other user and missing note rejected',async()=>{
  const r=await call('patch',url(`/notes/${note}`),oneToken).send({title:'Updated Note'}).expect(200);assert.equal(r.body.content,'Workout Plan');
  await call('patch',url(`/notes/${note}`,two),twoToken).send({title:'Forbidden'}).expect(403);
  await call('patch',url('/notes/000000000000000000000000'),oneToken).send({title:'Missing'}).expect(404);
});
test('Assignment 8 Note Q3: replacement requires all fields and preserves owner/createdAt',async()=>{
  const before=await Notes.findById(note);
  await call('put',url(`/notes/replace/${note}`),oneToken).send({title:'Incomplete'}).expect(400);
  const r=await call('put',url(`/notes/replace/${note}`),oneToken).send({title:'Replacement',content:'Workout Plan'}).expect(200);
  assert.equal(r.body.userId,one);assert.equal(+new Date(r.body.createdAt),+before.createdAt);
});
test('Assignment 8 Note Q4: update-all is scoped to authenticated owner; no invented Q5 endpoint',async()=>{
  const foreign=await Notes.create({title:'Other Note',content:'Private',userId:two});
  await call('patch',url('/notes/all'),oneToken).send({title:'Code Review Notes'}).expect(200).expect(r=>assert.equal(r.body.message,'All notes updated'));
  assert.equal((await Notes.findById(foreign.id)).title,'Other Note');
});
test('Assignment 8 Note Q6: single delete returns deleted note and enforces membership',async()=>{
  const r=await call('post',url('/notes'),oneToken).send({title:'Disposable',content:'Delete me'}).expect(201);
  const id=r.body.note._id;
  await call('delete',url(`/notes/${id}`,two),twoToken).expect(403);
  await call('delete',url(`/notes/${id}`),oneToken).expect(200).expect(r=>assert.equal(r.body._id,id));
  await call('delete',url(`/notes/${id}`),oneToken).expect(404);
});
test('Assignment 8 Note Q7: page2/limit3 stable descending ordering and foreign-note exclusion',async()=>{
  for(let i=0;i<6;i++)await Notes.create({title:`Timed ${i}`,content:'Sorted',userId:one,createdAt:new Date(2020,0,i+1)});
  const r=await call('get',url('/notes/paginate-sort?page=2&limit=3'),oneToken).expect(200);
  assert.equal(r.body.total,7);assert.deepEqual(r.body.notes.map(n=>n.title),['Timed 3','Timed 2','Timed 1']);
  await call('get',url('/notes/paginate-sort?limit=101'),oneToken).expect(400);
});
test('Assignment 8 Note Q8: get by ID checks owner and existence',async()=>{
  await call('get',url(`/notes/${note}`),oneToken).expect(200);
  await call('get',url(`/notes/${note}`,two),twoToken).expect(403);
  await call('get',url('/notes/000000000000000000000000'),oneToken).expect(404);
});
test('Assignment 8 Note Q9: exact-content search, controlled not-found and no regex expansion',async()=>{
  await call('get',url('/notes/note-by-content?content=Workout%20Plan'),oneToken).expect(200);
  await call('get',url('/notes/note-by-content?content=.*'),oneToken).expect(404).expect(r=>assert.equal(r.body.message,'No note found'));
});
test('Assignment 8 Note Q10: populate only intended note and user email fields',async()=>{
  const r=await call('get',url('/notes/note-with-user'),oneToken).expect(200);
  for(const n of r.body){assert.deepEqual(Object.keys(n).sort(),['_id','createdAt','title','userId']);assert.deepEqual(Object.keys(n.userId),['email']);}
});
test('Assignment 8 Note Q11: aggregation is owner scoped and exposes only name/email',async()=>{
  const r=await call('get',url('/notes/aggregate?title=Code%20Review%20Notes'),oneToken).expect(200);
  assert.equal(r.body.length,1);assert.deepEqual(r.body[0].user,{name:'Updated Owner',email:person('final_owner').email});
  assert.equal((await call('get',url('/notes/aggregate?title=Code%20Review%20Notes',two),twoToken).expect(200)).body.length,0);
});
test('Assignment 8 Note Q12: delete-all affects only caller; foreign records remain',async()=>{
  await call('delete',url('/notes'),oneToken).expect(200).expect(r=>assert.equal(r.body.message,'Deleted'));
  assert.equal(await Notes.countDocuments({userId:one}),0);assert.equal(await Notes.countDocuments({userId:two}),1);
});
test('Assignment 8 schemas and custom title validator: types, refs, age, timestamps and uppercase rejection',async()=>{
  for(const title of ['FIRST NOTE','A123!'])await assert.rejects(new Notes({title,content:'x',userId:one}).validate());
  await new Notes({title:'First Note',content:'x',userId:one}).validate();
  for(const age of [17,61])await assert.rejects(new Users({...person('schema'),Password:'hash',age}).validate());
  assert.equal(Notes.schema.path('userId').options.ref,'Users');assert.equal(Notes.schema.options.timestamps,true);
  for(const field of ['name','email','Password','Phone'])assert.ok(Users.schema.path(field).options.required);
});
test('legacy email change clears verification status and requires a fresh verified recipient for second-factor mail',async()=>{
  await Users.updateOne({_id:one},{$set:{isEmailVerified:true}});
  await call('patch',url(`/users/${one}`),oneToken).send({email:'changed-final@example.test'}).expect(200);
  assert.equal((await Users.findById(one)).isEmailVerified,false);
});
test('active account lock also rejects verified Google adapter without creating a session',async()=>{
  const {OAuth2Client}=require('google-auth-library');const original=OAuth2Client.prototype.verifyIdToken;
  process.env.GOOGLE_CLIENT_ID='isolated-final-client';
  await Users.updateOne({_id:one},{$set:{googleId:'locked-google-final',lockUntil:new Date(Date.now()+300000)}});
  OAuth2Client.prototype.verifyIdToken=async()=>({getPayload:()=>({sub:'locked-google-final',email:'changed-final@example.test',email_verified:true})});
  const Sessions=require('../models/refreshToken.model');const count=await Sessions.countDocuments({userId:one});
  try{await request(app).post('/auth/google').send({idToken:'mocked-signed-provider'}).expect(429);assert.equal(await Sessions.countDocuments({userId:one}),count);}
  finally{OAuth2Client.prototype.verifyIdToken=original;delete process.env.GOOGLE_CLIENT_ID;}
});
test('normal development server startup requires JWT ownership on legacy routes by default',async()=>{
  const net=require('node:net'),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const env={...process.env,NODE_ENV:'development',PORT:String(port),HOST:'127.0.0.1',MONGO_URI:`mongodb://127.0.0.1:27017/${mongoose.connection.name}`};
  delete env.LEGACY_REQUIRE_AUTH;
  const child=require('node:child_process').spawn(process.execPath,['server.js'],{cwd:require('node:path').join(__dirname,'..'),env,stdio:'ignore',windowsHide:true});
  const exited=new Promise(r=>child.once('exit',r));
  try{
    let started=false;for(let i=0;i<80;i++){try{started=(await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(200)})).status===200;}catch{}if(started)break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(started,true);assert.equal((await fetch(`http://127.0.0.1:${port}/users?userId=${two}`)).status,401);
    const response=await fetch(`http://127.0.0.1:${port}/users/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:person('final_other').email,password})});
    assert.equal(response.status,200);const body=await response.json();assert.ok(body.accessToken);
    assert.equal((await fetch(`http://127.0.0.1:${port}/users?userId=${two}`,{headers:{authorization:`Bearer ${body.accessToken}`}})).status,200);
  }finally{child.kill();await exited;}
});
