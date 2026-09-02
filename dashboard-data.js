(function (host) {
  'use strict';
  const months = ['2025/12','2026/01','2026/02','2026/03','2026/04','2026/05','2026/06','2026/07','2026/08','2026/09','2026/10','2026/11'];
  const number = value => {
    if (value === null || value === undefined || value === '') return null;
    const result = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(result) || result < 0) throw new Error('來源含無效或負數，請檢查數值欄位。');
    return result;
  };
  const required = value => {
    const result = number(value);
    if (result === null) throw new Error('已匯入資料缺少必要數字，未將空白當成零。');
    return result;
  };
  function records(values, fields) {
    const [header = [], ...rows] = values || [];
    if (fields.some(field => !header.includes(field))) throw new Error('來源工作表欄位不符，停止顯示以避免誤算。');
    return rows.filter(row => row.some(value => value !== null && value !== '')).map(row => Object.fromEntries(header.map((key, i) => [key, row[i] ?? null])));
  }
  const isBrand = row => row['品牌代碼'] === 'TY';
  const selected = row => isBrand(row) && Number(row['年度歸屬']) === 2026;
  const storeCodes = ['tm','th','bd','ta','lk','yh','qp'];
  const storeAliases = new Map([
    ['彤顏醫美','tm'],['彤醫','tm'],
    ['彤顏健保','th'],['彤健','th'],
    ['八德彤顏','bd'],['八德玥顏','bd'],
    ['桃園彤顏','ta'],['琢顏診所','ta'],['琢顏','ta'],
    ['林口彤顏','lk'],['林口','lk'],
    ['永和彤顏','yh'],['永和','yh'],
    ['青埔彤顏','qp'],['青埔臻顏','qp'],['青埔','qp']
  ]);
  const storeCode = value => storeAliases.get(String(value || '').trim()) || null;
  const metaCodes = [...storeCodes,'brand'];
  const metaCode = value => storeCode(value) || (value === '品牌整體' ? 'brand' : null);
  const sumComplete = values => values.length && values.every(Number.isFinite) ? values.reduce((a,b)=>a+b,0) : null;
  function monthIndex(row, field) {
    const index = required(row[field]) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= months.length) throw new Error('年度月序不正確。');
    const value = row['月份'];
    let label;
    if (typeof value === 'number') {
      const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      label = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    } else {
      const match = String(value).match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
      label = match && `${match[1]}/${match[2].padStart(2, '0')}`;
    }
    if (label !== months[index]) throw new Error('月份與年度月序不一致。');
    return index;
  }
  function add(grouped, m, key, value) {
    const item = grouped.get(m) || {m};
    if (item[key]) throw new Error('同月份／分店或平台有重複資料，停止加總。');
    item[key] = value;
    grouped.set(m, item);
  }
  const sorted = grouped => [...grouped.values()].sort((a, b) => a.m - b.m);
  function parseNewRows(values) {
    const grouped = new Map();
    for (const row of records(values, ['月份','品牌代碼','年度歸屬','年度月序','分店','資料狀態','實際新客','新客目標'])) {
      if (!selected(row) || row['資料狀態'] !== '已匯入') continue;
      const key = storeCode(row['分店']);
      if (!key) throw new Error('新客工作表出現未設定的分店。');
      const a = required(row['實際新客']), t = number(row['新客目標']);
      if (!Number.isInteger(a) || (t !== null && !Number.isInteger(t))) throw new Error('新客數與目標必須是整數。');
      add(grouped, monthIndex(row, '年度月序'), key, {a, t});
    }
    const result = sorted(grouped);
    if (result.some((row, i) => storeCodes.some(code=>!row[code]) || row.m !== i)) throw new Error('新客月份或分店尚未完整匯入，停止累積以避免低估。');
    return result;
  }
  const missingMeta = () => ({s:null,ms:null,q:null,b:null,partial:true});
  function parseMetaRows(values) {
    const grouped = new Map();
    for (const row of records(values, ['月份','品牌代碼','年度歸屬','月序','分店','實際花費','訊息花費','Meta詢問數','Meta預算','資料完整性','查詢備註'])) {
      if (!selected(row)) continue;
      const key = metaCode(row['分店']);
      if (!key) throw new Error('Meta 工作表出現未設定的分店。');
      // Existing pending rows contain placeholder zeroes; keep those unknown.
      const pending = String(row['查詢備註'] || '').includes('該分店資料待補') || /待補|待匯入/.test(row['資料完整性'] || '');
      const value = pending ? {...missingMeta(), b:number(row['Meta預算'])} : {
        s:number(row['實際花費']), ms:number(row['訊息花費']), q:number(row['Meta詢問數']), b:number(row['Meta預算']),
        partial:row['資料完整性'] !== '已確認'
      };
      if (value.ms !== null && value.s !== null && value.ms > value.s) throw new Error('訊息花費大於全部花費，請核對來源。');
      add(grouped, monthIndex(row, '月序'), key, value);
    }
    return sorted(grouped).map(row => ({...row, ...Object.fromEntries(metaCodes.map(code=>[code,row[code]||missingMeta()]))}));
  }
  function parseBudgetRows(values) {
    const grouped = new Map();
    for (const row of records(values, ['月份','品牌代碼','年度歸屬','年度月序','廣告平台','預算金額','實際花費','實際花費來源','填寫狀態'])) {
      if (!selected(row)) continue;
      const platform = String(row['廣告平台'] || '');
      const key = platform === 'Meta' ? 'meta' : platform.startsWith('LAP') ? 'lap' : null;
      if (!key) throw new Error('年度預算出現未設定的平台。');
      const a = /待補|待匯入/.test(row['填寫狀態'] || '') ? null : number(row['實際花費']);
      add(grouped, monthIndex(row, '年度月序'), key, {b:number(row['預算金額']), a, partial:a === null || /部分|待補/.test(row['實際花費來源'] || '')});
    }
    const result = sorted(grouped);
    if (result.length !== 12 || result.some(row => !row.meta || !row.lap)) throw new Error('年度預算須具備十二個月份與兩個平台。');
    return result;
  }
  const sumKnown = values => values.every(value => value === null) ? null : values.reduce((total, value) => total + (value ?? 0), 0);
  const stores = (row, store) => store === 'all' ? storeCodes.map(code=>row[code]) : [row[store]];
  const metaStores = (row, store) => store === 'all' ? metaCodes.map(code=>row[code]) : [row[store]];
  function newTotal(rows,store='all') {
    const list=rows.flatMap(row=>stores(row,store));
    const a=sumComplete(list.map(item=>item.a)),t=sumComplete(list.map(item=>item.t));
    return {a,t,d:t===null||a===null?null:a-t,rate:t>0?a/t:null};
  }
  function metaTotal(rows, store) {
    const list = rows.flatMap(row => metaStores(row, store));
    const pairs = list.filter(item => item.s !== null && item.b !== null);
    const messages = list.filter(item => item.ms !== null && item.q !== null);
    const result = Object.fromEntries(['s','ms','q','b'].map(key => [key, sumKnown(list.map(item => item[key]))]));
    result.partial = list.some(item => item.partial || item.s === null || item.ms === null || item.q === null);
    result.status = result.s === null ? '待補' : result.partial ? '部分資料' : '已確認';
    const q = sumKnown(messages.map(item => item.q));
    result.cpa = q > 0 ? sumKnown(messages.map(item => item.ms)) / q : null;
    const budget = sumKnown(pairs.map(item => item.b));
    result.rate = budget > 0 ? sumKnown(pairs.map(item => item.s)) / budget : null;
    return result;
  }
  function budgetAggregate(row, type) {
    const list = type === 'all' ? [row.meta,row.lap] : [row[type]];
    return {b:sumComplete(list.map(item => item.b)), a:sumKnown(list.map(item => item.a)), partial:list.some(item => item.partial || item.a === null || item.b === null)};
  }
  function consumptionMonth(value) {
    let label;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      label = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    } else {
      const match = String(value).match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
      if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error('消費資料月份格式不正確。');
      label = `${match[1]}/${match[2].padStart(2, '0')}`;
    }
    return months.indexOf(label);
  }
  const consumptionFields = ['amount','count','arrivals'];
  const emptyConsumption = () => ({amount:0,count:0,arrivals:0});
  function consumptionValues(row) {
    const value = {amount:required(row['消費金額']),count:required(row['消費數']),arrivals:required(row['到店數'])};
    if (!Number.isInteger(value.count) || !Number.isInteger(value.arrivals) || value.count > value.arrivals || (value.count === 0 && value.amount > 0)) throw new Error('消費數、到店數或金額不一致。');
    return value;
  }
  function parseConsumptionRows(overview, detail) {
    if ((overview || []).length >= 40 || (detail || []).length >= 1000) throw new Error('消費資料已達讀取上限，請先擴充範圍。');
    const grouped = new Map(), seen = new Set();
    for (const row of records(overview, ['月份','品牌代碼','客群','到店數','消費數','消費金額'])) {
      if (!isBrand(row)) continue;
      const m = consumptionMonth(row['月份']);
      if (m < 0) continue;
      const cohort = row['客群'] === '新客' ? 'new' : row['客群'] === '舊客' ? 'returning' : null;
      if (!cohort) throw new Error('月報出現未設定的客群。');
      add(grouped, m, cohort, {total:consumptionValues(row),...Object.fromEntries(storeCodes.map(code=>[code,emptyConsumption()]))});
    }
    for (const row of records(detail, ['月份','品牌代碼','客群','統計基準','預約店','來源代碼','到店數','消費數','消費金額','來源店名'])) {
      if (!isBrand(row)) continue;
      const m = consumptionMonth(row['月份']);
      if (m < 0) continue;
      const cohort = row['客群'] === '新客' ? 'new' : row['客群'] === '舊客' ? 'returning' : null;
      const code = storeCode(row['預約店']), group = grouped.get(m)?.[cohort];
      if (!group || !code || row['統計基準'] !== '依預約日期') throw new Error('分店消費的客群、分店、月份或統計基準不符。');
      if (row['來源代碼'] === null) throw new Error('分店消費缺少來源代碼。');
      const originalStore = String(row['來源店名'] || '').trim();
      if (!originalStore) throw new Error('分店消費缺少來源店名。');
      // A monthly report can contain both the old and new branch names during a rename.
      // They share one stable dashboard store code but remain distinct source groups.
      const key = `${m}/${cohort}/${code}/${originalStore}/${row['來源代碼']}`;
      if (seen.has(key)) throw new Error('分店消費出現重複來源，停止加總。');
      seen.add(key);
      const value = consumptionValues(row);
      consumptionFields.forEach(field => group[code][field] += value[field]);
    }
    const result = sorted(grouped);
    if (!result.length || result.some((row, i) => row.m !== i || !row.new || !row.returning)) throw new Error('消費月份或新舊客月報不完整。');
    // Sparse source rows mean zero only after reconciliation with monthly totals.
    for (const row of result) for (const cohort of ['new','returning']) {
      const group = row[cohort];
      for (const field of consumptionFields) {
        if (Math.abs(storeCodes.reduce((total,code)=>total+group[code][field],0) - group.total[field]) > 0.01) throw new Error(`${months[row.m]} 消費明細與月報總覽不一致，停止顯示。`);
      }
    }
    return result;
  }
  function consumptionTotal(rows, store = 'all', cohort = 'new') {
    if (!['all',...storeCodes].includes(store) || !['all','new','returning'].includes(cohort)) throw new Error('消費篩選條件無效。');
    if (!rows.length) return {amount:null,count:null,arrivals:null,average:null,rate:null};
    const result = emptyConsumption();
    for (const row of rows) for (const key of (cohort === 'all' ? ['new','returning'] : [cohort])) {
      const value = row[key][store === 'all' ? 'total' : store];
      consumptionFields.forEach(field => result[field] += value[field]);
    }
    // The source report's average uses arrivals, including non-purchasers.
    return {...result,average:result.arrivals > 0 ? result.amount / result.arrivals : null,rate:result.arrivals > 0 ? result.count / result.arrivals : null};
  }
  function parseAll(ranges) {
    const newRows = parseNewRows(ranges[0]?.values), metaRows = parseMetaRows(ranges[1]?.values), budgetRows = parseBudgetRows(ranges[2]?.values);
    if (!newRows.length || !metaRows.length) throw new Error('來源尚無可顯示的新客或 Meta 資料。');
    for (const row of metaRows) {
      const meta = metaTotal([row], 'all'), budget = budgetRows.find(item => item.m === row.m).meta;
      if (meta.s !== null && budget.a !== null && Math.abs(meta.s - budget.a) > 0.01) throw new Error(`Meta 與年度預算的 ${months[row.m]} 花費不一致，請同步來源。`);
      if (meta.partial && budget.a !== null) budget.partial = true;
    }
    const consumptionRows = parseConsumptionRows(ranges[3]?.values, ranges[4]?.values);
    if(newRows.length!==consumptionRows.length) throw new Error('新客與消費月份不一致。');
    for(const row of newRows) for(const code of storeCodes) {
      if(row[code].a!==consumptionRows.find(r=>r.m===row.m)?.new[code].count) throw new Error('新客實績與分店消費數不一致。');
    }
    return {newRows, metaRows, budgetRows, consumptionRows};
  }
  const api = {months,number,storeCodes,sumComplete,sumKnown,newTotal,parseNewRows,parseMetaRows,parseBudgetRows,parseAll,metaTotal,budgetAggregate,parseConsumptionRows,consumptionTotal};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else host.SMSData = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
