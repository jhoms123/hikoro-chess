document.addEventListener('DOMContentLoaded',()=>{
 const formations={
  hero:[['neptune',4,3,'black'],['cthulhu',5,3,'black'],['mermaid',3,4,'black'],['lupa',4,11,'white'],['prince',5,11,'white'],['zur',3,10,'white'],['fin',6,10,'white'],['pawn',4,9,'white']],
  hikoro:[['neptune',4,3,'black'],['cthulhu',5,3,'black'],['mermaid',3,4,'black'],['lupa',4,11,'white'],['prince',5,11,'white'],['zur',3,10,'white'],['fin',6,10,'white'],['pawn',4,9,'white']],
  academy:[['lupa',3,7,'white'],['prince',4,7,'white'],['zur',2,6,'white'],['fin',5,6,'white'],['pawn',3,5,'white'],['lupa',4,0,'black'],['prince',3,0,'black'],['pilut',2,1,'black']],
  selected:[['neptune',4,3,'black'],['cthulhu',5,3,'black'],['mermaid',3,4,'black'],['lupa',4,11,'white'],['prince',5,11,'white'],['zur',3,10,'white'],['fin',6,10,'white']]
 };
 for(const layer of document.querySelectorAll('[data-wood-scene]')){
  const name=layer.dataset.woodScene,academy=name==='academy',cols=academy?8:10,rows=academy?8:16;
  for(const [type,x,y,color] of formations[name]||[]){
   const holder=document.createElement('span');holder.className='wood-lobby-token';
   holder.style.left=((x+.5)/cols*100)+'%';holder.style.top=((y+.5)/rows*100)+'%';
   holder.style.width=(100/cols)+'%';holder.style.height=(100/rows)+'%';
   holder.append(HikoroWood.make(type,color));layer.append(holder);
  }
 }
 const selected=document.getElementById('selected-wood-art');
 const img=document.getElementById('selected-table-art');
 const picker=document.getElementById('game-type-select');
 function refresh(){
  const active=picker?.value;
  const wood=active==='hikoro'||active==='academy';
  if(selected)selected.hidden=!wood;
  if(img)img.hidden=wood;
  if(selected){selected.classList.toggle('wood-academy-scene',active==='academy');const layer=selected.querySelector('[data-wood-scene]');if(layer){layer.replaceChildren();const key=active==='academy'?'academy':'selected',cols=active==='academy'?8:10,rows=active==='academy'?8:16;for(const [type,x,y,color] of formations[key]){const holder=document.createElement('span');holder.className='wood-lobby-token';holder.style.left=((x+.5)/cols*100)+'%';holder.style.top=((y+.5)/rows*100)+'%';holder.style.width=(100/cols)+'%';holder.style.height=(100/rows)+'%';holder.append(HikoroWood.make(type,color));layer.append(holder);}}}
 }
 picker?.addEventListener('change',refresh);refresh();
});
