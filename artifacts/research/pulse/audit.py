import json, math
from pathlib import Path
root=Path(__file__).resolve().parent
cases={p.stem:json.loads(p.read_text()) for p in root.glob('*.json') if not p.name.endswith('.patient.json') and p.name not in ['qualification-summary.json','integration-replay-audit.json']}
# Integration envelopes contain matched native runs, not an engine output root.
for name, envelope in list(cases.items()):
 if 'baseline' in envelope and 'modified' in envelope:
  del cases[name]
  cases[name+'-baseline']=envelope['baseline']
  cases[name+'-modified']=envelope['modified']
maximum_mean_rounding_error=0.0
for name,c in cases.items():
 assert c['version']=='4.4.0' and c['git_hash']=='5e29e5b', name
 for row in c['rows']:
  assert not row.get('engineStopped'), (name,row)
  assert all(math.isfinite(x) for x in row['values'].values()), name
  assert 0<=row['values']['OxygenSaturation']<=1, name
 if 'dense_rows' in c:
  assert len(c['dense_rows'])==1500, name
  keys=list(c['property_units'])
  for j,key in enumerate(keys):
   mean=sum(row[j+1] for row in c['dense_rows'])/1500
   maximum_mean_rounding_error=max(maximum_mean_rounding_error,abs(mean-c['trailing_30s_mean'][key]))
   assert math.isclose(mean,c['trailing_30s_mean'][key],rel_tol=1e-12,abs_tol=1e-12), (name,key)
for a,b in [('baseline','baseline-repeat'),('breathing-sudden','breathing-sudden-repeat')]:
 assert cases[a]['rows']==cases[b]['rows'], (a,b)
 assert cases[a]['stabilized_values']==cases[b]['stabilized_values'], (a,b)
 if 'dense_rows' in cases[a]:
  assert cases[a]['dense_rows']==cases[b]['dense_rows'], (a,b)
summary={name:{'wall_seconds':c.get('wall_seconds'),'post_actions_engine_time_s':c.get('post_actions_engine_time_s',0),
 'mean':c.get('trailing_30s_mean'),'events':c['rows'][-1]['events']} for name,c in cases.items()}
report={'maximum_mean_rounding_error':maximum_mean_rounding_error,'engine':'Pulse 4.4.0 5e29e5b','cases':len(cases),'exact_replays':['baseline','breathing-sudden'],
 'note':'Software qualification only; not independent physiological calibration. Hypocapnia event classification has a source defect and is excluded from trustworthy diagnosis.',
 'results':summary}
(root/'qualification-summary.json').write_text(json.dumps(report,indent=2))
print(f"{len(cases)} runs: finite outputs, exact repeated baseline and modified trajectories, dense means independently reproduced")
