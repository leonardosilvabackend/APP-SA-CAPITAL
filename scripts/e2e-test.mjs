import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import postgres from 'postgres';
const base='http://127.0.0.1:3000';
const health=await (await fetch(base+'/api/health')).json();
if(health.environment!=='test'||health.emailEnabled) throw new Error('E2E permitido somente em TEST com emails desabilitados');
process.env.APP_ENV='test';process.env.NODE_ENV='test';
const {assertDatabaseSafety}=await import('../server/environment.ts');assertDatabaseSafety();
const fixtures=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
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
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++next; const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},60000);timer.unref();pending.set(id, {resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}}); ws.send(JSON.stringify({id, method, params})); }); }
async function evaluate(expression) { const result = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true,userGesture:true}); if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; }
async function until(expression) { for(let i=0;i<120;i++){try{if(await evaluate(expression))return;}catch{}await sleep(500);}console.log(await evaluate('JSON.stringify({url:location.href,title:document.title,text:document.body.innerText.slice(0,1000)})')); console.log(JSON.stringify(errors)); throw new Error('A interface não atingiu o estado esperado.'); }

const outcomes=[];const extraQuotaIds=[];let quotaId,quoteId,negotiationId,administratorId,analysisId,originalIncomeSettings;
const setInput=async(selector,value)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Campo ausente');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await sleep(80);};
const click=async(selector)=>{const point=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Botao ausente');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});};
const api=async(route,method='GET',body)=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify('/api'+route)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},body:${body===undefined?'undefined':JSON.stringify(JSON.stringify(body))}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={}};if(!r.ok)throw Error('API '+r.status+' '+(data.error??''));return data;})()`);
const navigate=async(route)=>{await send('Page.navigate',{url:base+route});await until(`!!document.querySelector('.app-shell') && !!document.querySelector('h1')`);};
try {
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__saCopiedText='';if(navigator.clipboard){const write=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async text=>{await write(text);window.__saCopiedText=text;};}`});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});});
 await send('Page.navigate',{url:base});await until(`!!document.querySelector('.auth-submit') && !document.querySelector('.auth-submit').disabled`);
 await setInput('input[type=email]','admin@sa-capital.test');await setInput('input[type=password]',process.env.SA_E2E_PASSWORD??'@SA20262026');await click('.auth-submit');await until(`!!document.querySelector('.app-shell')`);outcomes.push('login');
 await send('Browser.grantPermissions',{origin:base,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 await navigate('/check-list');await until(`document.querySelectorAll('.checklist-card').length===8 && !!document.querySelector('.checklist-item')`);
 if(!await evaluate(`(()=>{const c=document.querySelectorAll('.checklist-card');return Math.abs(c[0].getBoundingClientRect().top-c[1].getBoundingClientRect().top)<2;})()`))throw Error('Check-list desktop sem colunas');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);
 if(!await evaluate(`(()=>{const c=document.querySelectorAll('.checklist-card');return c[1].getBoundingClientRect().top>c[0].getBoundingClientRect().bottom && document.documentElement.scrollWidth<=390;})()`))throw Error('Check-list mobile sem responsividade');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});outcomes.push('checklist-responsivo');
 await click('.checklist-card[data-income="MEI"] footer button');await sleep(300);
 await until(`window.__saCopiedText.includes('Pessoa jurídica')`);outcomes.push('checklist-whatsapp');
 originalIncomeSettings=(await api('/settings')).settings;
 await evaluate(`Array.from(document.querySelectorAll('.checklist-page > button')).find(b=>b.textContent.includes('Novo tipo')).click()`);await until(`!!document.querySelector('.income-type-editor')`);
 await setInput('.income-type-editor input',fixtureName);await setInput('.income-type-editor textarea','Documento E2E');await click('.income-type-editor .primary-button');await until(`!!document.querySelector('.checklist-card[data-income="${fixtureName}"]')`);
 analysisId=(await api('/pre-analyses','POST',{customerType:'PF',customerName:fixtureName,document:'52998224725',incomeType:fixtureName,consent:true})).item.id;outcomes.push('criar-tipo-renda-e-rascunho');
 await click(`.checklist-card[data-income="${fixtureName}"] .checklist-edit-actions .secondary-button`);await until(`!!document.querySelector('.income-type-editor')`);
 await setInput('.income-type-editor input',fixtureName+'-renamed');await setInput('.income-type-editor textarea','Documento E2E\nComprovante E2E');await click('.income-type-editor .primary-button');await until(`!!document.querySelector('.checklist-card[data-income="${fixtureName}-renamed"]')`);
 await navigate('/pre-analises');await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Nova pré-análise')).click()`);await until(`!!document.querySelector('.pre-analysis-form')`);
 await until(`Array.from(document.querySelectorAll('.pre-analysis-form select option')).some(o=>o.value===${JSON.stringify(fixtureName+'-renamed')})`);
 await navigate('/check-list');await until(`!!document.querySelector('.checklist-card[data-income="${fixtureName}-renamed"]')`);await click(`.checklist-card[data-income="${fixtureName}-renamed"] .checklist-edit-actions .danger-button`);await until(`!document.querySelector('.checklist-card[data-income="${fixtureName}-renamed"]')`);
 const historical=(await api('/pre-analyses')).items.find(i=>i.id===analysisId);if(historical?.incomeType!==fixtureName||JSON.stringify(historical.requiredDocumentsSnapshot)!=='["Documento E2E"]')throw Error('Histórico alterado ao renomear/excluir renda');outcomes.push('renomear-excluir-e-preservar-historico');
 await api('/pre-analyses/'+analysisId,'DELETE');analysisId=undefined;
 const config=(await api('/settings')).settings;
 const configBody={...config,companyEmail:config.companyEmail??'',companyPhone:config.companyPhone??''};
 const competing=await evaluate(`(async()=>Promise.all([1,2].map(()=>fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(configBody)})}).then(r=>r.status))))()`);
 if(JSON.stringify(competing.sort())!=='[200,409]')throw Error('Edições simultâneas sobrescreveram configurações');outcomes.push('conflito-configuracoes');
 const latest=(await api('/settings')).settings;
 const invalid=await evaluate(`fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({...latest,companyEmail:latest.companyEmail??'',companyPhone:latest.companyPhone??'',incomeDocuments:{...latest.incomeDocuments,Invalido:[]}})})}).then(r=>r.status)`);
 if(invalid!==400)throw Error('Backend aceitou tipo de renda sem documentos');outcomes.push('validacao-documentos-backend');

 await navigate('/usuarios');await until(`!!document.querySelector('.user-search input')`);await setInput('.user-search input','administrador teste');await until(`document.querySelectorAll('.users-table tbody tr').length===1`);outcomes.push('pesquisar-usuarios');
 administratorId=(await api('/administrators','POST',{name:fixtureName,characteristics:'Informações comerciais para o teste de cópia.',website:'https://example.com',documents:[]})).item.id;
 await navigate('/administradoras');await until(`!!document.querySelector('.administrator-card')`);await evaluate(`Array.from(document.querySelectorAll('.administrator-card-footer button')).find(x=>x.textContent.includes('Copiar')).click()`);await sleep(300);
 await until(`window.__saCopiedText.startsWith('ADMINISTRADORA:')`);outcomes.push('administradora-whatsapp');
 const exported=await evaluate(`(async()=>{const r=await fetch('/api/stock/export-sa');return {status:r.status,type:r.headers.get('Content-Type'),size:(await r.blob()).size};})()`);if(exported.status!==200||!exported.type.includes('spreadsheet')||exported.size<1000)throw Error('Exportacao indisponivel');outcomes.push('baixar-estoque');
 quotaId=(await api('/stock','POST',{code:fixtureName,category:fixtureName,administrator:'CNP',creditAmount:123456,entryAmount:20000,installmentCount:100,installmentAmount:1000,outstandingBalance:100000})).quota.id;
 for(const [suffix,entryAmount,installmentAmount] of [['A',10000,4000],['B',30000,500]])extraQuotaIds.push((await api('/stock','POST',{code:fixtureName+suffix,category:fixtureName,administrator:'CNP',creditAmount:123456,entryAmount,installmentCount:100,installmentAmount,outstandingBalance:suffix==='A'?120000:110000})).quota.id);
 await navigate('/estoque');await until(`!!document.querySelector('.smart-order-button')`);await click('.smart-order-button');await until(`!!Array.from(document.querySelectorAll('.smart-order-fields select option')).find(x=>x.value===${JSON.stringify(fixtureName)})`);
 await setInput('.smart-order-fields label:nth-child(1) select','CNP');await setInput('.smart-order-fields label:nth-child(2) select',fixtureName);
 await click('.smart-order-fields input');for(const digit of '1000000'){await send('Input.insertText',{text:digit});await sleep(40);}
 if(!await evaluate(`document.querySelector('.smart-order-fields input').value.split(String.fromCharCode(160)).join('').split(' ').join('')==='R$1.000.000,00'`))throw Error('Máscara alterou o valor em reais');outcomes.push('mascara-monetaria');
 await setInput('.smart-order-fields input','123456');await setInput('.smart-order-fields label:nth-child(4) select','entry');await click('.smart-order-modal form button');await until(`document.querySelectorAll('.smart-order-result').length===3`);
 if(!await evaluate(`['Menor entrada','Menor parcela','Menor saldo devedor'].every(text=>document.querySelector('.smart-order-results').textContent.includes(text)) && document.querySelector('.smart-order-fields').textContent.includes('(Opcional)')`))throw Error('Comparações sem segundo fator incorretas');if(await evaluate(`!!document.querySelector('.smart-result-flags')`))throw Error('Flags repetidas ainda visíveis');outcomes.push('pedido-com-fator-opcional-vazio');
 await setInput('.smart-order-fields label:nth-child(5) input','1200');await click('.smart-order-modal form button');await until(`document.querySelectorAll('.smart-order-result').length===3`);outcomes.push('pedido-inteligente');
 if(!await evaluate(`(()=>{const c=document.querySelectorAll('.smart-order-result');return Math.abs(c[0].getBoundingClientRect().top-c[1].getBoundingClientRect().top)<2 && Math.abs(c[0].getBoundingClientRect().top-c[2].getBoundingClientRect().top)<2 && !document.querySelector('.smart-order-modal').textContent.includes('0,10');})()`))throw Error('Resultados desktop sem colunas');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);
 if(!await evaluate(`(()=>{const c=document.querySelectorAll('.smart-order-result');return c[1].getBoundingClientRect().top>c[0].getBoundingClientRect().bottom && document.documentElement.scrollWidth<=390;})()`))throw Error('Resultados mobile sem responsividade');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});outcomes.push('pedido-responsivo');
 await click('.smart-order-result button');await until(`!!document.querySelector('.quote-actions')`);
 if(!await evaluate(`document.querySelector('.quote-balance').textContent.includes('100.000,00')`))throw Error('Saldo devedor ausente');outcomes.push('saldo-na-cotacao');
 await send('Browser.grantPermissions',{origin:base,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 await evaluate(`Array.from(document.querySelectorAll('.quote-actions button')).find(x=>x.textContent.includes('Copiar')).click()`);await sleep(300);
 await until(`window.__saCopiedText.includes(${JSON.stringify(fixtureName)})`);const commercial=await evaluate(`window.__saCopiedText`);if(!commercial.startsWith('ADMINISTRADORA:')||commercial.includes('CARTA DE'))throw Error('Formato comercial incorreto');outcomes.push('copiar-cotacao');
 await evaluate(`Array.from(document.querySelectorAll('.quote-actions button')).find(x=>x.textContent.includes('Gerar card')).click()`);await until(`document.querySelector('.promo-card-preview')?.naturalWidth===1080`);
 if(!await evaluate(`document.querySelector('.promo-card-preview').naturalHeight===1920`))throw Error('Dimensoes incorretas do card');
 const card=await evaluate(`(async()=>{const blob=await(await fetch(document.querySelector('.promo-card-preview').src)).blob();return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});})()`);await writeFile(path.join(directory,'card.png'),Buffer.from(card,'base64'));outcomes.push('gerar-card-png');
 for(const [label,file] of [['Destaque','card-highlight.png'],['caminhão','card-truck.png']]){const previous=await evaluate(`document.querySelector('.promo-card-preview').src`);await evaluate(`Array.from(document.querySelectorAll('.promo-designs button')).find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`);await until(`document.querySelector('.promo-card-preview')?.naturalHeight===1920 && document.querySelector('.promo-card-preview').src!==${JSON.stringify(previous)}`);const png=await evaluate(`(async()=>{const blob=await(await fetch(document.querySelector('.promo-card-preview').src)).blob();return new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});})()`);await writeFile(path.join(directory,file),Buffer.from(png,'base64'));}
 await setInput('.promo-format select','square');await until(`document.querySelector('.promo-card-preview')?.naturalHeight===1080`);outcomes.push('escolher-arte-e-formato');
 const propertyQuote=await api('/quotes/calculate','POST',{quotaIds:[quotaId],commissionRate:0});propertyQuote.quotas=propertyQuote.quotas.map(q=>({...q,category:'Imóvel'}));
 for(const design of ['modern','highlight']){const png=await evaluate(`(async()=>{const m=await import('/src/pages/quotes/promo-card.ts');const blob=await m.renderPromoCard(${JSON.stringify(propertyQuote)},${JSON.stringify(design)},'portrait');return new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});})()`);await writeFile(path.join(directory,'card-property-'+design+'.png'),Buffer.from(png,'base64'));}outcomes.push('artes-imovel');
 await click('.promo-card-modal [aria-label="Fechar card"]');await click('.quote-actions .primary-button');await until(`!!document.querySelector('.client-name-card input')`);await setInput('.client-name-card input',fixtureName);await click('.client-name-card .primary-button');await until(`!document.querySelector('.client-name-card')`);outcomes.push('salvar-cotacao');
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
} catch(error) {
 await writeFile(path.join(directory,'failure.json'),JSON.stringify({outcomes,error:String(error)},null,2));
 const screenshot=await send('Page.captureScreenshot',{format:'png'}).catch(()=>null);if(screenshot)await writeFile(path.join(directory,'failure.png'),Buffer.from(screenshot.data,'base64'));
 throw error;
} finally {
 try{if(negotiationId){const d=await api('/negotiations/'+negotiationId);await api('/negotiations/'+negotiationId,'DELETE',{version:d.item.version});}if(quoteId)await api('/quotes/saved/'+quoteId,'DELETE');if(quotaId)await api('/stock/'+quotaId,'DELETE');}catch{console.error('Fixture E2E pendente de limpeza',fixtureName);}
 for(const id of extraQuotaIds)await fixtures`delete from quotas where id=${id} and category=${fixtureName}`;
 if(analysisId)await fixtures`delete from pre_analyses where id=${analysisId} and customer_name=${fixtureName}`;
 if(originalIncomeSettings)await fixtures`update app_settings set income_documents=${fixtures.json(originalIncomeSettings.incomeDocuments)},income_types=${originalIncomeSettings.incomeTypes?fixtures.json(originalIncomeSettings.incomeTypes):null} where id='default'`;
 if(administratorId)await fixtures`delete from administrators where id=${administratorId} and name=${fixtureName}`;
 await fixtures.end();
 await send('Browser.close').catch(()=>{});ws.close();child.kill();
}
