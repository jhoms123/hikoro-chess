"""Download human-authored interface emblems and photographed materials from the source manifest."""
from pathlib import Path
import urllib.request,json,xml.etree.ElementTree as ET,io
from PIL import Image
P=Path(__file__).resolve().parents[1]/'HikoroChess/public/assets/collection'
manifest=json.loads((P/'sources.json').read_text())
ET.register_namespace('','http://www.w3.org/2000/svg')
for name,source in manifest['icons'].items():
 with urllib.request.urlopen(f'https://raw.githubusercontent.com/game-icons/icons/master/{source}.svg',timeout=45) as r:root=ET.fromstring(r.read())
 for el in list(root):
  if el.tag.endswith('path') and el.get('d')=='M0 0h512v512H0z':root.remove(el)
 root.set('viewBox','0 0 512 512');root.set('fill','#dec48f')
 for el in root.iter():
  if 'fill' in el.attrib and el.get('fill')!='none':el.set('fill','#dec48f')
 (P/'icons').mkdir(exist_ok=True)
 (P/'icons'/f'{name}.svg').write_text(ET.tostring(root,encoding='unicode'))
for material in manifest['materials']:
 with urllib.request.urlopen(material['download'],timeout=45) as r:image=Image.open(io.BytesIO(r.read())).convert('RGB')
 image.thumbnail((768,768),Image.Resampling.LANCZOS)
 target=P/material['asset'];target.parent.mkdir(parents=True,exist_ok=True);image.save(target,'WEBP',quality=85,method=6)
print('Imported credited emblems and photographic textures; original gameplay artwork untouched.')
