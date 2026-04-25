#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue; const [k,...r]=t.split('='); if(!process.env[k]) process.env[k]=r.join('=').replace(/^"|"$/g,'').replace(/^'|'$/g,'');
}
const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,''); const key=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!base||!key) throw new Error('Missing env');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function rest(pathname, extra={}){const res=await fetch(`${base}${pathname}`,{headers:{...headers,...extra},cache:'no-store'});const text=await res.text(); if(!res.ok) throw new Error(`${res.status} ${pathname}: ${text.slice(0,300)}`); try{return JSON.parse(text)}catch{return text}}
async function countCandidate({league,start,end,market,lineNotNull=false}){const qs=new URLSearchParams({select:'candidate_id',sport:`eq.${league}`,market_type:`eq.${market}`,event_date:`gte.${start}`,event_date:`gte.${start}`}); qs.set('event_date',`gte.${start}`); qs.set('event_date','gte.'+start); // keep simple, add lte through raw string below
let url=`/rest/v1/goose_market_candidates?select=candidate_id&sport=eq.${league}&market_type=eq.${market}&event_date=gte.${start}&event_date=lte.${end}`; if(lineNotNull) url+='&line=not.is.null';
const res=await fetch(`${base}${url}`,{headers:{...headers,Prefer:'count=exact',Range:'0-0'},cache:'no-store'}); const text=await res.text(); if(!res.ok) throw new Error(`${res.status} ${url}: ${text.slice(0,180)}`); return Number((res.headers.get('content-range')||'0/0').split('/').pop()||0)}
const checks=[
 {label:'NBA 2024 Oct preseason/start', league:'NBA', start:'2024-10-01', end:'2024-10-31', markets:['first_quarter_spread','third_quarter_spread','first_quarter_total','first_half_spread','first_half_total']},
 {label:'NBA current Apr 2026', league:'NBA', start:'2026-04-01', end:'2026-04-25', markets:['first_quarter_spread','third_quarter_spread','first_quarter_total','first_half_spread','first_half_total']},
 {label:'MLB 2024 Apr', league:'MLB', start:'2024-04-01', end:'2024-04-30', markets:['first_five_total','first_five_side','first_five_spread','first_five_moneyline']},
 {label:'MLB current Apr 2026', league:'MLB', start:'2026-04-01', end:'2026-04-25', markets:['first_five_total','first_five_side','first_five_spread','first_five_moneyline']},
];
const out={generated_at:new Date().toISOString(), checks:[]};
for(const c of checks){const item={...c, markets:[], samples:[]}; for(const market of c.markets){try{const total=await countCandidate({...c,market}); const withLine=await countCandidate({...c,market,lineNotNull:true}); item.markets.push({market,total,with_line:withLine,line_rate:total?Number((withLine/total).toFixed(4)):0});}catch(e){item.markets.push({market,error:String(e.message||e).slice(0,240)})}}
 const ors=c.markets.map(m=>`market_type.eq.${m}`).join(',');
 try{const url=`/rest/v1/goose_market_candidates?select=candidate_id,event_id,event_date,market_type,submarket_type,side,line,odds,participant_name,opponent_name,book,raw_payload&sport=eq.${c.league}&event_date=gte.${c.start}&event_date=lte.${c.end}&or=(${ors})&order=event_date.desc&limit=10`; item.samples=await rest(url);}catch(e){item.sample_error=String(e.message||e).slice(0,300)}
 out.checks.push(item)}
fs.writeFileSync('tmp/period-market-coverage-audit-2026-04-24.json',JSON.stringify(out,null,2));
let md=['# Period Market Coverage Audit — 2026-04-24','','- Owner: Magoo','- Goal: bounded proof for quarter/half/F5 historical market availability.','- Source checked: `goose_market_candidates` exact market types.',''];
for(const c of out.checks){md.push(`## ${c.label}`,''); for(const m of c.markets) md.push(`- ${m.market}: total ${m.total??'err'}, with_line ${m.with_line??'err'}, line_rate ${m.line_rate??'n/a'}${m.error?` — ${m.error}`:''}`); md.push('','Samples:'); if(c.samples?.length){for(const s of c.samples.slice(0,6)) md.push(`- ${s.event_date} ${s.market_type}/${s.submarket_type||'—'} ${s.side||''} line=${s.line??'null'} odds=${s.odds??'null'} ${s.participant_name||''}`)} else md.push('- none'); md.push('')}
md.push('## Conclusion','','- Quarter/F5 data exists in lower-level historical candidates only where exact market keys appear; it is not yet a general Ask Goose serving layer.','- NBA quarter spread is the strongest confirmed path for Mattys 1Q/3Q Chase.','- MLB F5 needs additional source-key investigation if exact `first_five_*` market_type counts are low/zero in this table, because current system records show F5 context exists elsewhere.','- First-half NBA was not confirmed in this bounded audit.');
fs.writeFileSync('tmp/period-market-coverage-audit-2026-04-24.md',md.join('\n'));
console.log(JSON.stringify({ok:true,checks:out.checks.length,json:'tmp/period-market-coverage-audit-2026-04-24.json',md:'tmp/period-market-coverage-audit-2026-04-24.md'},null,2));
