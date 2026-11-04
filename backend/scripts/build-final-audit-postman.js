const fs=require('node:fs'),path=require('node:path');const root=path.join(__dirname,'..');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'postman',n)));
const c=read('Saraha_Backend.postman_collection.json'),p3=read('Saraha_Course_Part3.postman_collection.json');
c.info={name:'Saraha FINAL AUDIT',schema:c.info.schema,description:'A-Q complete course workflows. Use an isolated local database, secured legacy mode and real loopback Mailpit. Google/expired-token fixtures are explicitly manual. Runtime secrets are generated privately; never export populated variables.'};
for(const f of c.item)for(const i of f.item){delete i.response;if(i.request.body?.raw)i.request.body.raw=i.request.body.raw.replaceAll('New-course-password-123','{{finalNewPassword}}').replaceAll('Course-password-123','{{finalPassword}}');
 if((i.request.url.includes('/notes')&&!i.request.url.includes('/api/notes')) || (i.request.url.includes('/users')&&!/\/users\/(signup|login)$/.test(i.request.url)))i.request.header.push({key:'Authorization',value:'Bearer {{legacyToken}}'});
 if(i.name==='LoginUser')i.event.find(e=>e.listen==='test').script.exec.push("pm.environment.set('legacyToken',courseResponse.accessToken);");
 if(i.name==='Part2GoogleInvalidToken')i.event.find(e=>e.listen==='prerequest').script.exec=["if(pm.environment.get('googleConfigured') !== 'true') pm.execution.skipRequest();"];
}
c.event.unshift({listen:'prerequest',script:{type:'text/javascript',exec:["if(pm.info.requestName==='AddUser'){pm.environment.set('finalPassword',pm.variables.replaceIn('{{$guid}}'));pm.environment.set('finalNewPassword',pm.variables.replaceIn('{{$guid}}'));}"]}});
// Keep original A-M exports intact; only adapt the separate final collection.
const L=c.item.find(f=>f.name.startsWith('L -'));
function mailItems(label,purpose){return[
 {name:`${label} Find captured Mailpit mail`,request:{method:'GET',url:'{{mailpitUrl}}/api/v1/search?query=to%3A{{part2Email}}',header:[]},event:[{listen:'test',script:{type:'text/javascript',exec:["pm.test('HTTP 200',()=>pm.response.to.have.status(200));var finalMail=pm.response.json();pm.test('actual mail captured',()=>pm.expect(finalMail.messages.length).above(0));pm.environment.set('finalMailId',finalMail.messages[0].ID);"]}}]},
 {name:`${label} Extract ${purpose} OTP locally`,request:{method:'GET',url:'{{mailpitUrl}}/api/v1/message/{{finalMailId}}',header:[]},event:[{listen:'test',script:{type:'text/javascript',exec:["pm.test('HTTP 200',()=>pm.response.to.have.status(200));var finalCode=pm.response.json().Text.match(/\\b\\d{6}\\b/);pm.test('OTP captured',()=>pm.expect(finalCode).to.exist);",`if(finalCode)pm.environment.set('${purpose==='verification'?'emailOtp':'recoveryOtp'}',finalCode[0]);`]}}]}
];}
L.item.splice(L.item.findIndex(i=>i.name==='ConfirmEmailValidOTP'),0,...mailItems('Final email verification','verification'));
L.item.push(...mailItems('Final password recovery','recovery'));
const keys=new Set();for(const f of p3.item)for(const i of f.item)for(const e of i.event||[])for(const line of e.script.exec||[])for(const m of line.matchAll(/collectionVariables\.(?:set|get)\('([^']+)'/g))keys.add(m[1]);
keys.add('runId');keys.add('part3Password');
function rename(text){for(const key of keys){text=text.replaceAll(`{{${key}}}`,`{{finalP3_${key}}}`).replaceAll(`collectionVariables.set('${key}'`,`collectionVariables.set('finalP3_${key}'`).replaceAll(`collectionVariables.get('${key}'`,`collectionVariables.get('finalP3_${key}'`);}return text;}
c.event.push(...JSON.parse(rename(JSON.stringify(p3.event))));
for(const f of JSON.parse(rename(JSON.stringify(p3.item)))){for(const i of f.item)delete i.response;c.item.push(f);}
c.variable=[{key:'baseUrl',value:'http://localhost:3001'},{key:'mailpitUrl',value:'http://localhost:8025'}];
const keysAll=new Set();for(const m of JSON.stringify(c).matchAll(/\{\{([^{}]+)\}\}/g))if(!m[1].startsWith('$'))keysAll.add(m[1]);
for(const k of ['finalPassword','finalNewPassword','googleConfigured','skipExternalMail','emailOtp','recoveryOtp'])keysAll.add(k);
const env={name:'Saraha FINAL Local',_postman_variable_scope:'environment',values:[...keysAll].filter(k=>!k.startsWith('finalP3_')).map(key=>({key,value:key==='baseUrl'?'http://localhost:3001':key==='mailpitUrl'?'http://localhost:8025':['googleConfigured','skipExternalMail'].includes(key)?'false':'',enabled:true,type:/token|password|otp|secret/i.test(key)?'secret':'default'}))};
fs.writeFileSync(path.join(root,'postman/Saraha_FINAL_AUDIT.postman_collection.json'),JSON.stringify(c,null,2)+'\n');
fs.writeFileSync(path.join(root,'postman/Saraha_FINAL_Local.postman_environment.json'),JSON.stringify(env,null,2)+'\n');
const sdk=new(require('postman-collection').Collection)(c);console.log(JSON.stringify({folders:sdk.toJSON().item.map(f=>f.name),requests:c.item.flatMap(f=>f.item).length,variables:env.values.length}));
