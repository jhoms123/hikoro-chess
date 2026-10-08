importScripts('/gamelogic.js','/go-engine.js','/academy-engine.js','/hikoruka-engine.js','/shavari-engine.js','/sds-replay-context.js','/shodansho-engine.js','/match-record.js','/match-analysis.js');
onmessage=({data})=>{try{postMessage({id:data.id,report:MatchAnalysis.inspect(data.record,data.cursor)});}catch{postMessage({id:data.id,error:'Analysis is unavailable for this position.'});}};
