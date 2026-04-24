import os, pathlib, urllib.request, urllib.parse, urllib.error, json, collections, sys
root=pathlib.Path('.').resolve(); env=root/'.env.local'
if env.exists():
    for line in env.read_text().splitlines():
        t=line.strip()
        if not t or t.startswith('#') or '=' not in t: continue
        k,v=t.split('=',1); os.environ.setdefault(k,v.strip().strip('"').strip("'"))
base=os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
headers={'apikey':key,'Authorization':f'Bearer {key}','Content-Type':'application/json'}

def req(path, method='GET', body=None, timeout=180):
    url = path if path.startswith('http') else base+path
    data = None if body is None else json.dumps(body).encode()
    h = headers if (url.startswith(base)) else {}
    r=urllib.request.Request(url, method=method, headers=h, data=data)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as res:
            txt=res.read().decode()
            try: body=json.loads(txt)
            except Exception: body=txt
            return {'ok':True,'status':res.status,'body':body,'headers':dict(res.headers)}
    except urllib.error.HTTPError as e:
        return {'ok':False,'status':e.code,'body':e.read().decode()[:1000],'headers':dict(e.headers)}

def count(table, params):
    path=f'/rest/v1/{table}?select=*&{params}'
    r=urllib.request.Request(base+path,headers={**headers,'Prefer':'count=exact'})
    try:
        with urllib.request.urlopen(r,timeout=120) as res:
            cr=res.headers.get('content-range','')
            return int(cr.split('/')[-1]) if '/' in cr and cr.split('/')[-1].isdigit() else None
    except urllib.error.HTTPError as e:
        return {'error':e.code,'body':e.read().decode()[:300]}

def fetch(table, select, params='', limit=50000):
    q=f'select={urllib.parse.quote(select, safe=",.*()")}&limit={limit}'
    if params: q+='&'+params
    out=req(f'/rest/v1/{table}?{q}', timeout=240)
    if not out['ok']:
        print('FETCH_ERR',table,out['status'],out['body'], file=sys.stderr)
        return []
    return out['body']

start='2026-04-01'; end='2026-04-10'
print('=== TABLE COVERAGE Apr1-Apr10 ===')
for lg in ['NHL','NBA','MLB','NFL']:
    counts={}
    for tbl in ['goose_market_events','goose_market_candidates','ask_goose_query_layer_v1']:
        counts[tbl]=count(tbl, f'league=eq.{lg}&event_date=gte.{start}&event_date=lte.{end}')
    rows=fetch('ask_goose_query_layer_v1','candidate_id,event_id,league,event_date,team_name,opponent_name,market_family,market_type,market_scope,line,result,graded,integrity_status,profit_units',f'league=eq.{lg}&event_date=gte.{start}&event_date=lte.{end}',50000)
    c=collections.Counter(str((r.get('market_family'),r.get('market_scope'))) for r in rows)
    res=collections.Counter(str(r.get('result')) for r in rows)
    graded=sum(1 for r in rows if r.get('graded') is True)
    ungrade=sum(1 for r in rows if r.get('result')=='ungradeable' or r.get('integrity_status')=='unresolvable')
    teams={r.get('team_name') for r in rows if r.get('team_name')}
    events={r.get('event_id') for r in rows if r.get('event_id')}
    print(json.dumps({'league':lg,'counts':counts,'queryRowsFetched':len(rows),'events':len(events),'teams':len(teams),'gradedRows':graded,'ungradeableRows':ungrade,'resultMix':dict(res),'marketScopeMix':c.most_common(12),'teamSample':sorted(teams)[:25]}, ensure_ascii=False))

print('=== EVENT SCORE AVAILABILITY ===')
for lg in ['NHL','NBA','MLB','NFL']:
    ev=fetch('goose_market_events','event_id,league,event_date,status,home_team,away_team,metadata',f'league=eq.{lg}&event_date=gte.{start}&event_date=lte.{end}',50000)
    score=0; final=0; examples=[]
    for r in ev:
        md=r.get('metadata') or {}; teams=md.get('teams') or {}
        hs=(teams.get('home') or {}).get('score'); aw=(teams.get('away') or {}).get('score')
        if r.get('status')=='final': final+=1
        if hs is not None and aw is not None: score+=1
        if len(examples)<3: examples.append({'event_id':r.get('event_id'),'status':r.get('status'),'home':r.get('home_team'),'away':r.get('away_team'),'homeScore':hs,'awayScore':aw})
    print(json.dumps({'league':lg,'events':len(ev),'final':final,'scoreAvailable':score,'examples':examples},ensure_ascii=False))

print('=== LIVE ASK GOOSE PROMPTS ===')
prompts={
 'NHL':['How have the Blackhawks performed as underdogs?','How have the Maple Leafs performed on the moneyline?','How have the Rangers performed as favorites?','How have the Golden Knights performed on the spread?','How have Utah performed on the moneyline?'],
 'NBA':['How have the 76ers performed on the moneyline?','How have the Lakers performed as underdogs?','How have the Warriors performed on the spread?','How have the Celtics performed as favorites?'],
 'MLB':['How have the Atlanta Braves performed on the moneyline?','How have the Yankees performed as underdogs?','How have the Dodgers performed on the spread?','How have the Blue Jays performed on the moneyline?'],
 'NFL':['How have the Bills performed on the moneyline?']
}
for lg,qs in prompts.items():
    for q in qs:
        url='https://goosalytics.vercel.app/api/ask-goose?league='+lg+'&q='+urllib.parse.quote(q)
        out=req(url,timeout=120)
        b=out.get('body') if out.get('ok') else {}
        print(json.dumps({'league':lg,'question':q,'http':out.get('status'),'ok':b.get('ok'),'rows':(b.get('summary') or {}).get('rows'),'gradedRows':(b.get('summary') or {}).get('gradedRows'),'message':b.get('message'),'warnings':((b.get('answer') or {}).get('warnings'))},ensure_ascii=False))
