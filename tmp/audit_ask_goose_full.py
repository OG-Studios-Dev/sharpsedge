import os, pathlib, urllib.request, urllib.parse, json, urllib.error
root=pathlib.Path('.').resolve(); env=root/'.env.local'
if env.exists():
  for line in env.read_text().splitlines():
    t=line.strip()
    if not t or t.startswith('#') or '=' not in t: continue
    k,v=t.split('=',1); os.environ.setdefault(k,v.strip().strip('"').strip("'"))
base=os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
headers={'apikey':key,'Authorization':f'Bearer {key}','Content-Type':'application/json'}
def get(path, timeout=180):
  req=urllib.request.Request(base+path,headers=headers)
  try:
    with urllib.request.urlopen(req,timeout=timeout) as r:
      return r.status, json.loads(r.read().decode()), dict(r.headers)
  except urllib.error.HTTPError as e:
    return e.code, e.read().decode(), dict(e.headers)
def count(table, league, extra=''):
  path=f'/rest/v1/{table}?select=*&league=eq.{league}{extra}'
  req=urllib.request.Request(base+path,headers={**headers,'Prefer':'count=exact','Range':'0-0'})
  try:
    with urllib.request.urlopen(req,timeout=180) as r:
      cr=r.headers.get('content-range','0-0/0')
      return int(cr.split('/')[-1])
  except Exception as e:
    return f'ERR {e}'
print('=== TABLE COUNTS ===')
for lg in ['NHL','NBA','MLB','NFL']:
  print(json.dumps({
    'league':lg,
    'events':count('goose_market_events',lg),
    'candidates':count('goose_market_candidates',lg),
    'query_rows':count('ask_goose_query_layer_v1',lg),
    'graded_query_rows':count('ask_goose_query_layer_v1',lg,'&graded=eq.true'),
  }))
print('\n=== MARKET QUALITY SAMPLE 5000 ===')
for lg in ['NHL','NBA','MLB','NFL']:
  s,rows,h=get(f'/rest/v1/ask_goose_query_layer_v1?select=candidate_id,event_id,event_date,market_family,market_scope,market_type,submarket_type,line,result,graded,integrity_status,team_name,opponent_name,sportsbook&league=eq.{lg}&limit=5000&order=event_date.desc')
  if s!=200:
    print(lg,'ERR',s,rows); continue
  q={}
  bad=[]
  dup=len(rows)-len({r['candidate_id'] for r in rows})
  for r in rows:
    k=(r.get('market_family'),r.get('market_scope'),r.get('market_type'),r.get('submarket_type'))
    d=q.setdefault(k,{'rows':0,'graded':0,'lineNull':0,'ungradeable':0,'teams':set(),'events':set()})
    d['rows']+=1
    d['graded']+=1 if r.get('graded') else 0
    d['lineNull']+=1 if r.get('line') is None else 0
    d['ungradeable']+=1 if r.get('result')=='ungradeable' or r.get('integrity_status')=='unresolvable' else 0
    if r.get('team_name'): d['teams'].add(r.get('team_name'))
    if r.get('event_id'): d['events'].add(r.get('event_id'))
    tn=(r.get('team_name') or '').lower()
    if any(x in tn for x in ['goals','assists','shots','points (','rebounds','passing','receiving']): bad.append(r)
  out={str(k):{**{kk:vv for kk,vv in d.items() if kk not in ('teams','events')},'teams':len(d['teams']),'events':len(d['events']),'gradeRate':round(d['graded']/d['rows'],3) if d['rows'] else 0} for k,d in q.items()}
  print(json.dumps({'league':lg,'rows':len(rows),'duplicateCandidateIds':dup,'marketQuality':out,'badTeamSamples':bad[:3]}, default=str))
print('\n=== ASK GOOSE LIVE PROMPTS ===')
live='https://goosalytics.vercel.app'
for lg, prompts in {
 'NHL':['How have the Blackhawks performed as underdogs?','How have the Blackhawks performed on the puckline?','How have the Maple Leafs performed on the moneyline?'],
 'NBA':['How have the Lakers performed as underdogs?','How have the Warriors performed on the spread?','How have the Celtics performed on the moneyline?'],
 'MLB':['How have the Yankees performed as underdogs?','How have the Dodgers performed on the spread?','How have the Braves performed on the moneyline?'],
 'NFL':['How have the Chiefs performed on the spread?','How have the Cowboys performed as underdogs?']
}.items():
  for q in prompts:
    try:
      with urllib.request.urlopen(live+'/api/ask-goose?league='+lg+'&q='+urllib.parse.quote(q)+'&limit=100',timeout=120) as r:
        b=json.loads(r.read().decode())
      print(json.dumps({'league':lg,'q':q,'http':200,'rows':b.get('summary',{}).get('rows'),'gradedRows':b.get('summary',{}).get('gradedRows'),'message':b.get('message')}))
    except urllib.error.HTTPError as e:
      print(json.dumps({'league':lg,'q':q,'http':e.code,'body':e.read().decode()[:300]}))
