/* Run Hikorüka alpha-beta off the main browser thread. */
importScripts('/hikoruka-engine.js?v=20261010-bot-difficulty','/hikoruka-bot.js?v=20261010-bot-difficulty');
self.onmessage=event=>{
 const {id,state,timeMs}=event.data||{};
 try{self.postMessage({id,action:HikorukaSearchBot.chooseMove(state,{timeMs,maxDepth:12})});}
 catch(error){self.postMessage({id,error:String(error?.message||error)});}
};
