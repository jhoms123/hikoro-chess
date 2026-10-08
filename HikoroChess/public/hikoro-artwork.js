/* The same supplied image is used for both owners. */
window.HikoroArtwork=Object.freeze({
 sprite:type=>'assets/hikoro-wood/'+type+'.webp',
 angle:(owner,bottomOwner)=>owner===bottomOwner?0:180,
 orient:(image,owner,bottomOwner)=>{image.style.transform='rotate('+(owner===bottomOwner?0:180)+'deg)';image.dataset.owner=String(owner);}
});
