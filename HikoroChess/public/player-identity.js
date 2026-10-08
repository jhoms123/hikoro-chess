(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PlayerIdentity=factory();})(typeof globalThis==='undefined'?this:globalThis,()=>{
'use strict';const icons=['hikoro','shodansho','shavari','hikoruka','go','academy'];
function cleanName(value,fallback='Guest'){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,30)||fallback:fallback;}
function portrait(identity={},supabaseUrl=''){const icon=icons.includes(identity.avatar_icon)?identity.avatar_icon:'hikoro',path=identity.avatar_path;if(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)&&typeof path==='string'&&/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path))return supabaseUrl+'/storage/v1/object/public/hikoro-avatars/'+path;return '/assets/collection/icons/'+icon+'.svg';}
function publicIdentity(row,fallback='Guest'){return {display_name:cleanName(row?.display_name,fallback),avatar_icon:icons.includes(row?.avatar_icon)?row.avatar_icon:'hikoro',avatar_path:typeof row?.avatar_path==='string'&&/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(row.avatar_path)?row.avatar_path:null};}
return {icons,cleanName,portrait,publicIdentity};
});
