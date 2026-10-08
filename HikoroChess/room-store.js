'use strict';
const {createClient}=require('@supabase/supabase-js');
// Room tokens and account bindings are server-only. Never expose this table through a public client.
function createRoomStore(env=process.env){
 if(env.SITE_REVIEW_MODE==='true')return null;
 const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(!env.SUPABASE_URL||!key)return null;
 const db=createClient(env.SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const check=r=>{if(r.error)throw r.error;return r.data;};
 return {
  async load(){return check(await db.from('hikoro_rooms').select('snapshot').gt('expires_at',new Date().toISOString())).map(r=>r.snapshot);},
  // A single transaction commits all changes in a command, including a rematch's old and new rooms.
  async commit(rows,removed){check(await db.rpc('hikoro_commit_rooms',{room_rows:rows,removed_ids:removed}));}
 };
}
module.exports={createRoomStore};
