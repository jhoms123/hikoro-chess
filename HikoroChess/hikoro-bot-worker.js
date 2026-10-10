/* Server-side Hikoro search worker: never block the Socket.IO event loop. */
const {parentPort,workerData}=require('node:worker_threads');
const Bot=require('./hikoro-bot');
try{
 const budgetMs=Math.max(500,Math.min(4000,Number(workerData.budgetMs)||1000));
 const width=Math.min(48,Math.max(14,Math.round(10+budgetMs/115)));
 parentPort.postMessage({move:Bot.chooseMove(workerData.game,{budgetMs,width})});
}catch(error){parentPort.postMessage({error:String(error?.stack||error)});}
