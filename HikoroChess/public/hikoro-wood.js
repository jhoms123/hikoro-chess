/* One wooden token atlas for both courts; rotation indicates ownership. */
(function(root){'use strict';
const names=['lupa','prince','zur','kota','fin','yoli','pilut','sult','pawn','cope','chair','jotu','kor','finor','greatshield','greathorsegeneral','neptune','mermaid','cthulhu','pilut_alt'];
const locations=Object.freeze(Object.fromEntries(names.map((type,i)=>[type,{column:i%5,row:Math.floor(i/5)}])));
function make(type,color){const at=locations[type];if(!at)throw Error('Unknown Hikoro piece '+type);const el=document.createElement('span');el.className='hikoro-wood-sprite '+((color==='black'||color===2)?'faces-south':'faces-north');el.dataset.type=type;el.style.backgroundPosition=(at.column*25)+'% '+(at.row*100/3)+'%';el.setAttribute('role','img');el.setAttribute('aria-label',((color==='black'||color===2)?'Black ':'White ')+type);return el;}
root.HikoroWood=Object.freeze({make,names,locations});
})(window);
