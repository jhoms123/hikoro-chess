const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = file => fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');
async function until(predicate) { for (let i=0;i<60;i++) { if(predicate())return; await new Promise(r=>setTimeout(r,5)); } assert.fail('Expected account UI did not render'); }
async function setup(t, emailSignup=false) {
    const dom = new JSDOM(source('player.html'), { url: 'https://hikorochess.org/player.html', runScripts:'outside-only' }); t.after(()=>dom.window.close());
    const w=dom.window, calls=[];
    w.fetch=async(url,options)=>{if(url==='/api/account-config')return {ok:true,json:async()=>({enabled:true,url:'https://example.supabase.co',key:'sb_publishable_test',providers:['github'],usernameSignup:true,emailSignup})};calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({created:true})};};
    w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{},signUp:async data=>{calls.push(data);return {data:{}};}}})};
    w.eval(source('player-identity.js'));w.eval(source('accounts.js'));
    await until(()=>w.document.querySelector('.account-access-form'));return {w,calls,click:text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text).click()};
}
test('username signup requires matching passwords and never asks for email', async t=>{
    const h=await setup(t);h.click('Create an account');await until(()=>h.w.document.querySelector('[name=confirm]'));
    const form=h.w.document.querySelector('.account-access-form');assert.equal(form.querySelector('[type=email]'),null);
    assert.match(form.parentElement.textContent,/forgotten password cannot be recovered/);
    form.elements.identifier.value='Ocean_Player';form.elements.password.value='fixture-password';form.elements.confirm.value='mismatched-password';
    form.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await until(()=>h.w.document.getElementById('account-message').textContent.includes('do not match'));assert.equal(h.calls.length,0);
    form.elements.confirm.value='fixture-password';form.dispatchEvent(new h.w.Event('submit',{cancelable:true}));
    await until(()=>h.calls.length===1);assert.equal(h.calls[0].url,'/api/account/username/signup');assert.deepEqual(h.calls[0].body,{username:'Ocean_Player',password:'fixture-password'});
    await until(()=>h.w.document.getElementById('account-message').textContent.includes('Account created'));
});
test('email option remains visible and accurately reports missing SMTP', async t=>{
    const h=await setup(t);h.click('Email & password');assert.ok(h.w.document.querySelector('[type=email]'));h.click('Create an account');
    await until(()=>h.w.document.querySelector('[name=confirm]'));const submit=h.w.document.querySelector('.account-access-form [type=submit]');assert.equal(submit.disabled,true);assert.match(h.w.document.querySelector('#account-body').textContent,/production email delivery/);
});
test('configured email signup uses verified Supabase signup, never the username admin endpoint', async t=>{
    const h=await setup(t,true);h.click('Email & password');h.click('Create an account');await until(()=>h.w.document.querySelector('[name=confirm]'));
    const form=h.w.document.querySelector('.account-access-form');form.elements.identifier.value='fixture@example.com';form.elements.password.value='fixture-password';form.elements.confirm.value='fixture-password';form.dispatchEvent(new h.w.Event('submit',{cancelable:true}));
    await until(()=>h.calls.length===1);assert.equal(h.calls[0].email,'fixture@example.com');assert.equal(h.calls[0].options.emailRedirectTo,'https://hikorochess.org/?account=1');
    await until(()=>h.w.document.getElementById('account-message').textContent.includes('confirm your account'));
});
