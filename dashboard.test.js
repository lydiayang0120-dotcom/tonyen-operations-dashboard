const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = require('./dashboard-data.js');
const table = rows => {const h=Object.keys(rows[0]);return [h,...rows.map(r=>h.map(k=>r[k]))];};
function fixtures() {
  const newRows=[],metaRows=[],budgetRows=[];
  const names=['彤顏醫美','彤顏健保','八德玥顏','琢顏診所','林口彤顏','永和彤顏','青埔臻顏'];
  for(let m=0;m<12;m++) {
    for(const name of names) {
      newRows.push({'月份':data.months[m],'品牌代碼':'TY','年度歸屬':2026,'年度月序':m+1,'分店':name,'資料狀態':m<2?'已匯入':'待匯入','實際新客':name==='彤顏醫美'?1:name==='彤顏健保'?2:0,'到店數':name==='彤顏醫美'?2:name==='彤顏健保'?4:0,'新客目標':10});
      if(m<2) metaRows.push({'月份':data.months[m],'品牌代碼':'TY','年度歸屬':2026,'月序':m+1,'分店':name,'實際花費':100,'訊息花費':80,'Meta詢問數':4,'Meta預算':120,'資料完整性':'已確認','查詢備註':''});
    }
    if(m<2) metaRows.push({'月份':data.months[m],'品牌代碼':'TY','年度歸屬':2026,'月序':m+1,'分店':'品牌整體','實際花費':0,'訊息花費':0,'Meta詢問數':0,'Meta預算':0,'資料完整性':'已確認','查詢備註':'無法歸屬單店的品牌活動'});
    for(const platform of ['Meta','G關鍵字','G多媒體','LAP']) budgetRows.push({'月份':data.months[m],'品牌代碼':'TY','年度歸屬':2026,'年度月序':m+1,'廣告平台':platform,'預算金額':300,'實際花費':m<2?(platform==='Meta'?700:platform==='G關鍵字'?20:platform==='G多媒體'?30:10):null,'實際花費來源':'測試資料','填寫狀態':m<2?'已填':'待補'});
  }
  const overview=[],detail=[];
  for(let m=0;m<2;m++) {
    overview.push({'月份':data.months[m],'品牌代碼':'TY','客群':'新客','到店數':6,'消費數':3,'消費金額':700});
    overview.push({'月份':data.months[m],'品牌代碼':'TY','客群':'舊客','到店數':m,'消費數':m,'消費金額':m*50});
    for(const [name,arrivals,count,amount] of [['彤顏醫美',2,1,100],['彤顏健保',4,2,600]]) detail.push({'月份':data.months[m],'品牌代碼':'TY','客群':'新客','統計基準':'依預約日期','預約店':name,'來源店名':name,'來源代碼':1,'到店數':arrivals,'消費數':count,'消費金額':amount});
    if(m) detail.push({'月份':data.months[m],'品牌代碼':'TY','客群':'舊客','統計基準':'依預約日期','預約店':'彤顏健保','來源店名':'彤顏健保','來源代碼':1,'到店數':1,'消費數':1,'消費金額':50});
  }
  return [newRows,metaRows,budgetRows,overview,detail];
}
const rangeNames=['月度KPI!A1:Y200','Meta月度KPI!A1:T200','年度預算!A1:R100','月報總覽!A1:P40','分店消費!A1:R1000'];
const ranges=(raw,names=rangeNames)=>raw.map((rows,index)=>({range:names[index],values:table(rows)}));
test('fiscal year, confirmed months and message-cost CPA',()=>{
  const r=data.parseAll(ranges(fixtures()));
  assert.equal(r.newRows.length,2);
  assert.equal(r.newRows[0].tm.a,2);
  assert.equal(data.months[0],'2025/12');
  assert.equal(data.months[11],'2026/11');
  assert.equal(data.metaTotal(r.metaRows,'all').cpa,20);
  assert.equal(r.budgetRows[11].meta.a,null);
});
test('missing Meta zero placeholders remain unknown; confirmed zero stays zero',()=>{
  const raw=fixtures();
  Object.assign(raw[1][0],{'實際花費':0,'訊息花費':0,'Meta詢問數':0,'Meta預算':null,'資料完整性':'部分資料','查詢備註':'該分店資料待補'});
  const r=data.parseMetaRows(table(raw[1]));
  assert.equal(data.metaTotal([r[0]],'tm').s,null);
  assert.equal(data.metaTotal([r[0]],'all').status,'部分資料');
  Object.assign(raw[1][0],{'資料完整性':'已確認','查詢備註':''});
  const zero=data.metaTotal([data.parseMetaRows(table(raw[1]))[0]],'tm');
  assert.equal(zero.s,0);assert.equal(zero.cpa,null);
});
test('duplicate keys, missing new-customer months and invalid numbers fail closed',()=>{
  const raw=fixtures();
  assert.throws(()=>data.parseNewRows(table([...raw[0],raw[0][0]])),/重複/);
  assert.throws(()=>data.parseNewRows(table(raw[0].filter(r=>r['年度月序']!==1))),/完整/);
  assert.throws(()=>data.number('#DIV/0!'),/無效/);
  assert.throws(()=>data.parseNewRows(table(raw[0].map((r,i)=>i===0?{...r,'到店數':null}:r))),/缺少/);
});
test('mismatched dates, schema and source totals fail closed',()=>{
  const raw=fixtures();
  assert.throws(()=>data.parseNewRows([['incorrect'],[1]]),/欄位/);
  const date=structuredClone(raw);date[0][0]['月份']='2026/01';
  assert.throws(()=>data.parseNewRows(table(date[0])),/月序/);
  raw[2][0]['實際花費']=201;
  assert.throws(()=>data.parseAll(ranges(raw)),/不一致/);
});
test('partial-platform budgets are not reported complete',()=>{
  const raw=fixtures();raw[2][3]['實際花費']=null;
  const r=data.parseBudgetRows(table(raw[2]));
  assert.equal(data.budgetAggregate(r[0],'all').a,750);
  assert.equal(data.budgetAggregate(r[0],'all').partial,true);
  assert.equal(data.budgetAggregate(r[0],'lap').a,null);
});
test('anonymous HTML is data-free and JS has no persistent credential store',()=>{
  const html=fs.readFileSync(__dirname+'/index.html','utf8');
  assert.match(html,/<div id="sms-dashboard-web"[^>]+ hidden>/);
  assert.doesNotMatch(html,/實際花費\s*\d/);
  const js=fs.readFileSync(__dirname+'/dashboard.js','utf8');
  assert.doesNotMatch(js,/localStorage|sessionStorage|client_secret|GOCSPX/);
  assert.match(js,/cache:'no-store'/);
  new vm.Script(js);
});
test('Meta budget copy consistently means the monthly execution target',()=>{
  const html=fs.readFileSync(__dirname+'/index.html','utf8');
  const js=fs.readFileSync(__dirname+'/dashboard.js','utf8');
  assert.match(html,/Meta 預算＝每月執行目標/);
  assert.match(html,/<th>Meta 預算<\/th>/);
  assert.match(html,/實際花費 ÷ Meta 預算/);
  assert.doesNotMatch(html+js,/參考預算|PM 核定/);
  const rows=data.parseAll(ranges(fixtures())).metaRows;
  assert.equal(data.metaTotal(rows,'all').rate,1400/1680);
});
test('UI login, refresh, four panels, consumption filters and logout',async()=>{
  const elements=new Map(),intervals=[],tabs=[],panels=[];
  function el(id,tag='DIV',value='') {
    const e={id,tagName:tag,value,hidden:false,dataset:{},events:{},textContent:'',disabled:false,html:'',
      addEventListener(name,fn){this.events[name]=fn;},setAttribute(){},replaceChildren(){this.html='';this.textContent='';},
      get innerHTML(){return this.html;},set innerHTML(s){this.html=s;if(this.tagName==='SELECT'){this.value=(s.match(/value="(\d+)" selected/)||s.match(/value="(\d+)"/)||['',''])[1];}}
    };elements.set('#'+id,e);return e;
  }
  const root=el('sms-dashboard-web');root.hidden=true;
  const doc={hidden:false,getElementById:id=>elements.get('#'+id)||el(id)};
  root.querySelector=s=>elements.get(s)||el(s.slice(1));
  root.querySelectorAll=s=>s.includes('[id^=')?[...elements.values()].filter(e=>/^sms-(new|meta|budget|consumption)-|sms-store-progress/.test(e.id)):s.includes('sms-tab')?tabs:panels;
  for(const view of ['new','consumption','meta','budget']){const t=el('tab-'+view);t.dataset.view=view;tabs.push(t);const p=el('panel-'+view);p.dataset.panel=view;panels.push(p);}
  for(const [id,value] of [['new-mode','cumulative'],['new-store','all'],['new-month',''],['meta-store','all'],['meta-month',''],['budget-type','all'],['budget-month',''],['consumption-mode','cumulative'],['consumption-cohort','new'],['consumption-store','all'],['consumption-month','']]) el('sms-'+id,'SELECT',value);
  let oauth,reads=0,fetchGate=null,failNext=false,nextBudget=120,partialBudgetOnce=true;
  const google={accounts:{oauth2:{initTokenClient(opts){oauth=opts;return {requestAccessToken(){}};}}}};
  const window={SMSData:data,SMS_CONFIG:{sheetId:'synthetic',googleClientId:'synthetic'},google,setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){},addEventListener(){}};
  const fetch=async url=>{
    reads++;
    if(fetchGate) await fetchGate;
    if(failNext){failNext=false;throw new TypeError('Failed to fetch');}
    const raw=fixtures();raw[1].forEach(row=>row['Meta預算']=row['分店']==='品牌整體'?null:nextBudget);
    const budgetOnly=String(url).includes(encodeURIComponent('年度預算!A1:R100'))&&!String(url).includes(encodeURIComponent('月度KPI!A1:Y200'));
    if(budgetOnly) return {ok:true,json:async()=>({valueRanges:ranges([raw[2]],['年度預算!A1:R100'])})};
    if(partialBudgetOnce){partialBudgetOnce=false;raw[2]=raw[2].filter(row=>row['年度月序']!==12);}
    return {ok:true,json:async()=>({valueRanges:ranges(raw)})};
  };
  vm.runInNewContext(fs.readFileSync(__dirname+'/dashboard.js','utf8'),{window,document:doc,google,fetch,AbortSignal,Date,console});
  assert.equal(root.hidden,true);assert.equal(reads,0);
  intervals[0]();oauth.callback({access_token:'synthetic-token',expires_in:3600});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.hidden,false);assert.equal(reads,2);
  assert.match(elements.get('#sms-new-actual').html,/12</);
  assert.match(elements.get('#sms-meta-cpa').html,/20</);
  assert.match(elements.get('#sms-meta-completeness').textContent,/每月執行目標/);
  assert.match(elements.get('#sms-budget-total').html,/14400</);
  tabs[1].events.click();
  assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);
  assert.match(elements.get('#sms-consumption-amount').html,/1400</);
  elements.get('#sms-consumption-mode').value='monthly';elements.get('#sms-consumption-store').value='th';elements.get('#sms-consumption-cohort').value='returning';
  elements.get('#sms-consumption-mode').events.change();
  assert.match(elements.get('#sms-consumption-amount').html,/50</);
  assert.equal(elements.get('#sms-consumption-rate').textContent,'100.0%');
  assert.doesNotMatch(elements.get('#sms-consumption-table').html,/2025\/12/);
  elements.get('#sms-new-mode').value='monthly';elements.get('#sms-new-store').value='tm';
  elements.get('#sms-new-mode').events.change();
  assert.match(elements.get('#sms-new-actual').html,/2</);
  let releaseFetch;
  fetchGate=new Promise(resolve=>{releaseFetch=resolve;});nextBudget=150;
  const refreshing=elements.get('#sms-refresh').events.click();
  assert.equal(reads,3);
  assert.equal(elements.get('#sms-refresh').disabled,true);
  assert.equal(elements.get('#sms-refresh').textContent,'更新中…');
  assert.match(elements.get('#sms-data-updated').textContent,/更新中/);
  await elements.get('#sms-refresh').events.click();assert.equal(reads,3);
  releaseFetch();await refreshing;fetchGate=null;
  assert.equal(elements.get('#sms-refresh').disabled,false);
  assert.equal(elements.get('#sms-refresh').textContent,'更新資料');
  assert.match(elements.get('#sms-data-updated').textContent,/更新完成.*\d+:\d+:\d+/);
  assert.match(elements.get('#sms-meta-table').html,/<td>700<\/td>/);
  assert.equal(elements.get('#sms-meta-rate').textContent,'233.3%');
  assert.match(elements.get('#sms-meta-completeness').textContent,/年度規劃的每月執行目標/);
  assert.match(elements.get('#sms-budget-total').html,/14400</);
  assert.equal(elements.get('#sms-new-mode').value,'monthly');
  assert.equal(elements.get('#sms-new-store').value,'tm');
  failNext=true;await elements.get('#sms-refresh').events.click();
  assert.equal(reads,4);assert.equal(root.hidden,true);
  assert.match(elements.get('#sms-auth-status').textContent,/更新失敗：無法連上 Google Sheet/);
  assert.equal(elements.get('#sms-refresh').disabled,false);
  assert.equal(elements.get('#sms-refresh').textContent,'更新資料');
  assert.equal(elements.get('#sms-consumption-amount').html,'');
  oauth.callback({access_token:'synthetic-token',expires_in:3600});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.hidden,false);assert.equal(reads,5);
  elements.get('#sms-signout').events.click();
  assert.equal(root.hidden,true);assert.equal(elements.get('#sms-new-actual').html,'');
  assert.equal(elements.get('#sms-consumption-amount').html,'');assert.equal(elements.get('#sms-consumption-total').html,'');
});

test('consumption is reconciled by month, cohort and store; weighted average uses arrivals',()=>{
  const raw=fixtures(),rows=data.parseConsumptionRows(table(raw[3]),table(raw[4]));
  assert.deepEqual(data.consumptionTotal(rows,'all','new'),{amount:1400,count:6,arrivals:12,average:1400/12,rate:0.5});
  assert.equal(data.consumptionTotal(rows,'tm','new').amount,200);
  assert.equal(data.consumptionTotal(rows,'all','all').amount,1450);
  assert.equal(data.consumptionTotal([rows[0]],'all','returning').average,null);
  assert.equal(data.consumptionTotal(rows,'tm','returning').amount,0);
  assert.equal(data.consumptionTotal([]).amount,null);
});

test('consumption rejects missing values, duplicates, missing cohorts and mismatched totals',()=>{
  const raw=fixtures(),parse=(a=raw[3],b=raw[4])=>data.parseConsumptionRows(table(a),table(b));
  assert.throws(()=>parse([...raw[3],raw[3][0]]),/重複/);
  assert.throws(()=>parse(raw[3],[...raw[4],raw[4][0]]),/重複/);
  assert.throws(()=>parse(raw[3],raw[4].slice(1)),/不一致/);
  assert.throws(()=>parse(raw[3].filter(r=>r['客群']==='新客')),/不符|不完整/);
  assert.throws(()=>parse(raw[3],raw[4].map((r,i)=>i===0?{...r,'消費金額':null}:r)),/缺少/);
  assert.throws(()=>parse(raw[3],raw[4].map((r,i)=>i===0?{...r,'統計基準':'依詢問日期'}:r)),/統計基準/);
});

test('consumption accepts Sheet serial dates, excludes other fiscal years, and blocks truncation',()=>{
  const raw=fixtures();raw[3][0]['月份']=45992;raw[4][0]['月份']=45992;
  raw[3].push({...raw[3][0],'月份':'2025-11'});
  raw[4].push({...raw[4][0],'月份':'2025-11'});
  assert.equal(data.parseConsumptionRows(table(raw[3]),table(raw[4])).length,2);
  assert.throws(()=>data.parseConsumptionRows(table(raw[3]),Array(1000).fill([])),/上限/);
});

test('renamed source groups with the same source code aggregate into one stable store',()=>{
  const raw=fixtures(),aliasRow={...raw[4][0],'預約店':'彤醫','來源店名':'彤醫'};
  raw[4].push(aliasRow);
  Object.assign(raw[3][0],{'到店數':8,'消費數':4,'消費金額':800});
  const rows=data.parseConsumptionRows(table(raw[3]),table(raw[4]));
  assert.deepEqual(rows[0].new.tm,{amount:200,count:2,arrivals:4});
  assert.equal(data.consumptionTotal(rows,'all','new').amount,1500);
});

test('seven-store totals and missing targets never become zero targets',()=>{
  const rows=[{m:0,tm:{a:1,t:10},th:{a:2,t:20},bd:{a:3,t:30},ta:{a:4,t:40},lk:{a:5,t:50},yh:{a:6,t:60},qp:{a:7,t:null}}];
  assert.deepEqual(data.newTotal(rows,'all'),{a:28,t:null,d:null,rate:null});
  assert.deepEqual(data.newTotal(rows,'qp'),{a:7,t:null,d:null,rate:null});
  rows[0].qp.t=0;
  assert.deepEqual(data.newTotal(rows,'all'),{a:28,t:210,d:-182,rate:28/210});
  const raw=fixtures();raw[0][0]['新客目標']=null;
  assert.equal(data.parseAll(ranges(raw)).newRows[0].tm.t,null);
  raw[2].forEach(row=>{row['預算金額']=null;row['實際花費']=null;row['填寫狀態']='待補';});
  const parsed=data.parseAll(ranges(raw));
  assert.equal(data.budgetAggregate(parsed.budgetRows[0],'all').b,null);
  assert.equal(data.budgetAggregate(parsed.budgetRows[0],'all').a,null);
});

test('new-customer arrivals and consumption arrivals mismatches fail closed',()=>{
  const raw=fixtures();raw[0][0]['到店數']=9;
  assert.throws(()=>data.parseAll(ranges(raw)),/新客到店實績與分店消費到店數/);
});
