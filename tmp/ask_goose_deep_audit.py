import os, pathlib, urllib.request, urllib.parse, urllib.error, json, collections, re
root=pathlib.Path('.').resolve(); env=root/'.env.local'
if env.exists():
    for line in env.read_text().splitlines():
        t=line.strip()
        if not t or t.startswith('#') or '=' not in t: continue
        k,v=t.split('=',1); os.environ.setdefault(k,v.strip().strip('"').strip("'"))
base=os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
headers={'apikey':key,'Authorization':f'Bearer {key}','Content-Type':'application/json'}

def req(path, method='GET', body=None, timeout=240):
    url = path if path.startswith('http') else base+path
    h = headers if url.startswith(base) else {'Content-Type':'application/json'}
    data = None if body is None else json.dumps(body).encode()
    r=urllib.request.Request(url, method=method, headers=h, data=data)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as res:
            txt=res.read().decode()
            try: body=json.loads(txt)
            except Exception: body=txt
            return {'ok':True,'status':res.status,'body':body,'headers':dict(res.headers)}
    except urllib.error.HTTPError as e:
        return {'ok':False,'status':e.code,'body':e.read().decode()[:1500]}

def fetch(table, select, params='', limit=50000):
    q=f'select={urllib.parse.quote(select, safe=",.*()")}&limit={limit}'
    if params: q+='&'+params
    out=req(f'/rest/v1/{table}?{q}')
    if not out['ok']:
        print(json.dumps({'fetchError':table,'status':out['status'],'body':out['body']})); return []
    return out['body']

def norm_team(s):
    if not s: return ''
    s=s.lower().replace('.', '')
    s=re.sub(r'\b(new york|los angeles|san jose|st louis|st|toronto|chicago|boston|vegas|golden state|houston|portland|philadelphia|atlanta|tampa bay|utah|colorado|calgary|edmonton|seattle|montreal|washington|carolina|florida|nashville|pittsburgh|ottawa|anaheim|buffalo|columbus|detroit|minnesota|dallas|vancouver|winnipeg|new jersey)\b','',s)
    s=re.sub(r'[^a-z0-9]+',' ',s).strip()
    aliases={'trail blazers':'blazers','maple leafs':'leafs','blue jackets':'jackets','red wings':'wings','golden knights':'knights','blue jays':'jays','white sox':'sox','red sox':'sox'}
    return aliases.get(s,s)

print('=== DEEP QUERY LAYER QUALITY ===')
for lg in ['NHL','NBA','MLB']:
    rows=fetch('ask_goose_query_layer_v1','candidate_id,event_id,canonical_game_id,league,event_date,home_team,away_team,team_name,opponent_name,market_family,market_type,market_scope,team_role,side,line,odds,sportsbook,result,graded,integrity_status,profit_units,roi_on_10_flat',f'league=eq.{lg}&event_date=gte.2026-04-01&event_date=lte.2026-04-10',50000)
    by_market=collections.defaultdict(lambda: {'rows':0,'graded':0,'lineNull':0,'ungradeable':0,'teams':set(),'events':set()})
    dup=collections.Counter(); bad_team=[]
    for r in rows:
        key=(r.get('market_family'),r.get('market_scope'))
        m=by_market[key]; m['rows']+=1; m['events'].add(r.get('event_id')); m['teams'].add(r.get('team_name'))
        if r.get('graded') is True: m['graded']+=1
        if r.get('line') is None and r.get('market_family') in ('spread','total'): m['lineNull']+=1
        if r.get('result')=='ungradeable' or r.get('integrity_status')=='unresolvable': m['ungradeable']+=1
        dup[(r.get('candidate_id'))]+=1
        tn=norm_team(r.get('team_name')); hn=norm_team(r.get('home_team')); an=norm_team(r.get('away_team'))
        if r.get('market_scope')=='game' and r.get('team_name') and tn and hn and an and tn not in (hn,an) and r.get('team_name') not in (r.get('home_team'),r.get('away_team')):
            if len(bad_team)<10: bad_team.append({k:r.get(k) for k in ['candidate_id','team_name','home_team','away_team','opponent_name','market_type','market_scope']})
    dup_count=sum(1 for k,v in dup.items() if v>1)
    print(json.dumps({'league':lg,'rows':len(rows),'duplicateCandidateIds':dup_count,'marketQuality':{str(k):{'rows':v['rows'],'graded':v['graded'],'gradeRate':round(v['graded']/v['rows'],3) if v['rows'] else 0,'lineNull':v['lineNull'],'ungradeable':v['ungradeable'],'events':len(v['events']),'teams':len([t for t in v['teams'] if t])} for k,v in by_market.items()},'badTeamSamples':bad_team},ensure_ascii=False))

print('=== REFRESH RPC SMOKE, ONE DAY ===')
for lg in ['NHL','NBA','MLB']:
    out=req('https://goosalytics.vercel.app/api/admin/ask-goose/refresh', method='POST', body={'league':lg,'mode':'batch','startDate':'2026-04-10','endDate':'2026-04-10'}, timeout=180)
    b=out.get('body') if out.get('ok') else out.get('body')
    print(json.dumps({'league':lg,'http':out.get('status'),'ok': b.get('ok') if isinstance(b,dict) else False,'rowsRefreshed': b.get('rowsRefreshed') if isinstance(b,dict) else None,'delta': b.get('delta') if isinstance(b,dict) else None,'message': b.get('message') if isinstance(b,dict) else b}, ensure_ascii=False))

print('=== LM FEATURE SUITABILITY CHECK ===')
needed=['sport','league','season','event_date','home_team','away_team','market_family','market_scope','side','line','sportsbook','team_role','opponent_name','is_favorite','is_underdog','result','graded','integrity_status','profit_units','roi_on_10_flat']
for lg in ['NHL','NBA','MLB']:
    rows=fetch('ask_goose_query_layer_v1',','.join(needed),f'league=eq.{lg}&event_date=gte.2026-04-01&event_date=lte.2026-04-10',5000)
    nulls={field:sum(1 for r in rows if r.get(field) is None) for field in needed}
    usable=sum(1 for r in rows if r.get('graded') is True and r.get('result') in ('win','loss','push') and r.get('profit_units') is not None)
    print(json.dumps({'league':lg,'sampleRows':len(rows),'lmUsableGradedRows':usable,'nullRates':{k:round(v/len(rows),3) if rows else None for k,v in nulls.items()}},ensure_ascii=False))
