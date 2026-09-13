import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
const base='http://127.0.0.1:3000';
const health=await (await fetch(base+'/api/health')).json();
if(health.environment!=='test'||health.emailEnabled) throw new Error('E2E permitido somente em TEST com emails desabilitados');
const browser=process.env.SA_E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if(!existsSync(browser)) throw new Error('Configure SA_E2E_BROWSER com o navegador local');
const id=crypto.randomUUID(), fixtureName='E2E-'+id, directory=path.resolve('.local/e2e',id);
await mkdir(directory,{recursive:true});
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${directory}/profile`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let target;
for(let i=0;i<120;i++){try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x=>x.type==='page');if(target)break;}catch{}await sleep(250);}
if(!target){child.kill();throw new Error('Navegador indisponivel');}
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let next = 0; const pending = new Map(); const errors = [];
ws.onmessage = event => {
 const message = JSON.parse(event.data);
 if (message.id) { const waiter = pending.get(message.id); if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result); } }
 if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++next; pending.set(id, {resolve,reject}); ws.send(JSON.stringify({id, method, params})); }); }
async function evaluate(expression) { const result = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true}); if(result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function until(expression) { for(let i=0;i<120;i++){try{if(await evaluate(expression))return;}catch{}await sleep(500);}console.log(await evaluate('JSON.stringify({url:location.href,title:document.title,text:document.body.innerText.slice(0,1000)})')); console.log(JSON.stringify(errors)); throw new Error('A interface não atingiu o estado esperado.'); }

const outcomes=[];let quotaId,quoteId,negotiationId;
const setInput=async(selector,value)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Campo ausente');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await sleep(80);};
const click=async(selector)=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const api=async(route,method='GET',body)=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify('/api'+route)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},body:${body===undefined?'undefined':JSON.stringify(JSON.stringify(body))}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={}};if(!r.ok)throw Error('API '+r.status+' '+(data.error??''));return data;})()`);
const navigate=async(route)=>{await send('Page.navigate',{url:base+route});await until(`!!document.querySelector('.app-shell') && !!document.querySelector('h1')`);};
try {
 await send('Runtime.enable');await send('Page.enable');
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});});
 await send('Page.navigate',{url:base});await until(`!!document.querySelector('.auth-submit') && !document.querySelector('.auth-submit').disabled`);
 await setInput('input[type=email]','admin@sa-capital.test');await setInput('input[type=password]',process.env.SA_E2E_PASSWORD??'@SA20262026');await click('.auth-submit');await until(`!!document.querySelector('.app-shell')`);outcomes.push('login');
 quotaId=(await api('/stock','POST',{code:fixtureName,category:fixtureName,administrator:fixtureName,creditAmount:123456,entryAmount:20000,installmentCount:100,installmentAmount:1000,outstandingBalance:100000})).quota.id;
 await navigate('/estoque');await until(`!!document.querySelector('.smart-order-button')`);await click('.smart-order-button');await until(`!!Array.from(document.querySelectorAll('.smart-order-fields select option')).find(x=>x.value===${JSON.stringify(fixtureName)})`);
 await setInput('.smart-order-fields label:nth-child(1) select',fixtureName);await setInput('.smart-order-fields label:nth-child(2) select',fixtureName);await setInput('.smart-order-fields input','123456');await setInput('.smart-order-fields label:nth-child(4) select','entry');await click('.smart-order-modal form button');await until(`!!document.querySelector('.smart-order-result')`);outcomes.push('pedido-inteligente');
 await click('.smart-order-result button');await until(`!!document.querySelector('.quote-actions')`);await click('.quote-actions .primary-button');await until(`!!document.querySelector('.client-name-card input')`);await setInput('.client-name-card input',fixtureName);await click('.client-name-card .primary-button');await until(`!document.querySelector('.client-name-card')`);outcomes.push('salvar-cotacao');
 const quotes=await api('/quotes/saved');quoteId=quotes.items.find(q=>q.clientName===fixtureName)?.id;if(!quoteId)throw Error('Cotacao nao persistida');
 await navigate('/cotacoes');await until(`!!Array.from(document.querySelectorAll('.quote-list-row')).find(x=>x.textContent.includes(${JSON.stringify(fixtureName)}))`);await evaluate(`Array.from(document.querySelectorAll('.quote-list-row')).find(x=>x.textContent.includes(${JSON.stringify(fixtureName)})).click()`);await until(`!!document.querySelector('.quote-admin-actions')`);await evaluate(`Array.from(document.querySelectorAll('.quote-admin-actions button')).find(x=>x.textContent.includes('Solicitar reserva')).click()`);await until(`Array.from(document.querySelectorAll('.quote-admin-actions button')).some(x=>x.textContent.includes('pending'))`);outcomes.push('solicitar-reserva');
 await navigate('/');await until(`!!Array.from(document.querySelectorAll('.reservation-row')).find(x=>x.textContent.includes(${JSON.stringify(fixtureName)}))`);await evaluate(`Array.from(document.querySelectorAll('.reservation-row')).find(x=>x.textContent.includes(${JSON.stringify(fixtureName)})).querySelector('.primary-button').click()`);await until(`!Array.from(document.querySelectorAll('.reservation-row')).some(x=>x.textContent.includes(${JSON.stringify(fixtureName)}))`);outcomes.push('aprovar-reserva');
 const negotiations=await api('/negotiations?search='+encodeURIComponent(fixtureName));negotiationId=negotiations.items[0]?.id;if(!negotiationId)throw Error('Negociacao nao persistida');
 await navigate('/negociacoes');await until(`!!Array.from(document.querySelectorAll('.negotiation-table tbody tr')).find(x=>x.textContent.includes(${JSON.stringify(fixtureName)}))`);await evaluate(`Array.from(document.querySelectorAll('.negotiation-table tbody tr')).find(x=>x.textContent.includes(${JSON.stringify(fixtureName)})).click()`);await until(`!!document.querySelector('.negotiation-modal') && Array.from(document.querySelectorAll('.negotiation-modal button')).some(x=>x.textContent.includes('Cancelar'))`);await evaluate(`Array.from(document.querySelectorAll('.negotiation-modal button')).find(x=>x.textContent.includes('Cancelar')).click()`);
 for(let i=0;i<100;i++){if((await api('/negotiations/'+negotiationId)).item.status==='cancelled')break;await sleep(100);}
 if((await api('/negotiations/'+negotiationId)).item.status!=='cancelled')throw Error('Cancelamento nao persistido');
 if((await api('/stock?search='+encodeURIComponent(fixtureName))).items[0]?.status!=='available')throw Error('Estoque nao liberado');outcomes.push('cancelar-e-liberar');
 const detail=await api('/negotiations/'+negotiationId);await api('/negotiations/'+negotiationId,'DELETE',{version:detail.item.version});negotiationId=undefined;
 await api('/quotes/saved/'+quoteId,'DELETE');quoteId=undefined;await api('/stock/'+quotaId,'DELETE');quotaId=undefined;
 await navigate('/pre-analises');await until(`!!document.querySelector('nav[aria-label=Paginacao]')`);outcomes.push('pre-analises-paginacao');
 await click('[aria-label="Sair"]');await until(`!!document.querySelector('.auth-submit') && !document.querySelector('.app-shell')`);outcomes.push('logout');
 if(errors.length)throw Error('Excecoes JavaScript no E2E');
 await writeFile(path.join(directory,'result.json'),JSON.stringify({date:new Date(),outcomes,errors},null,2));console.log(JSON.stringify({outcomes,errors,directory}));
} finally {
 try{if(negotiationId){const d=await api('/negotiations/'+negotiationId);await api('/negotiations/'+negotiationId,'DELETE',{version:d.item.version});}if(quoteId)await api('/quotes/saved/'+quoteId,'DELETE');if(quotaId)await api('/stock/'+quotaId,'DELETE');}catch{console.error('Fixture E2E pendente de limpeza',fixtureName);}
 await send('Browser.close').catch(()=>{});ws.close();child.kill();
}
