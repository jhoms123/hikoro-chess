/* Runs Academy search off the main thread so mobile controls stay responsive. */
importScripts('/gamelogic.js?v=20261009-academy-bot','/academy-engine.js?v=20261009-academy-bot','/academy-bot.js?v=20261009-academy-bot');
self.onmessage=event=>{
    const data=event.data||{};
    try{
        const action=HikoroAcademyBot.chooseMove(data.state,data.options);
        self.postMessage({id:data.id,action});
    }catch(error){
        self.postMessage({id:data.id,error:String(error&&error.message||error)});
    }
};