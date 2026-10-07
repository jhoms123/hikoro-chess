"""Optimize supplied garden artwork for delivery. Does not generate artwork."""
from pathlib import Path
from PIL import Image
import json,sys
from io import BytesIO
PUBLIC=Path(__file__).resolve().parents[1]/"HikoroChess/public"
ART=PUBLIC/"assets/collection"
FLOWERS=PUBLIC/"assets/flowers"
ART.mkdir(parents=True,exist_ok=True)
FLOWERS.mkdir(parents=True,exist_ok=True)
# Delivery images, retaining original flower and board source images outside referenced paths.
report=[]
for source in sorted((PUBLIC/'sprites').glob('*_flower_*.png')):
 dest=FLOWERS/(source.stem+'.webp'); image=Image.open(source).convert('RGBA');image.thumbnail((192,192),Image.Resampling.LANCZOS);encoded=BytesIO();image.save(encoded,'WEBP',quality=88,method=6);dest.write_bytes(encoded.getvalue());Image.open(dest).load()
 report.append({'source':str(source.relative_to(PUBLIC)),'delivery':str(dest.relative_to(PUBLIC)),'before':source.stat().st_size,'after':dest.stat().st_size})
source=PUBLIC/'shodanshoboardsmall.png';dest=ART/'garden-board.webp';image=Image.open(source);image.thumbnail((1600,1600),Image.Resampling.LANCZOS);encoded=BytesIO();image.save(encoded,'WEBP',quality=90,method=6);dest.write_bytes(encoded.getvalue());Image.open(dest).load()
report.append({'source':source.name,'delivery':str(dest.relative_to(PUBLIC)),'before':source.stat().st_size,'after':dest.stat().st_size})
(ART/'optimization.json').write_text(json.dumps(report,indent=2)+'\n')
print('Delivery image bytes:',sum(x['before']for x in report),'->',sum(x['after']for x in report))
