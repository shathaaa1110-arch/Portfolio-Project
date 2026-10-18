"""Rebuild the self-contained design handoff from screens.json and template.html."""
from pathlib import Path
import json
R=Path(__file__).resolve().parent
D=json.loads((R/'screens.json').read_text())
assert len(D['screens'])==16
assert len({s['id'] for s in D['screens']})==16
active={s['source'] for s in D['screens']}
assert active.isdisjoint(D['reference_only'])
assert active|set(D['reference_only'])=={p.name for p in R.parent.glob('*.png')}
for s in D['screens']:
 assert (R.parent/s['source']).exists()
 for p in [s['title'],s['audit'],*s['fields'],*s['actions'],*s['states'],*s['notes']]:
  assert p['en'] and p['ar'] and any('\u0600'<=c<='\u06ff' for c in p['ar'])
html=(R/'template.html').read_text().replace('__SCREEN_DATA__',json.dumps(D,ensure_ascii=False).replace('<','\\u003c'))
(R/'index.html').write_text(html)
print('Built 16 screens; all 24 original mockups mapped; bilingual content valid.')
