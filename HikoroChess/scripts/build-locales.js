const fs=require('node:fs'),path=require('node:path');
const publicDir=path.join(__dirname,'../public');
const dictionary=JSON.parse(fs.readFileSync(path.join(publicDir,'locales/es-CU.json'),'utf8'));
const patterns=JSON.parse(fs.readFileSync(path.join(publicDir,'locales/es-CU-patterns.json'),'utf8'));
const result='window.HikoroSpanish = '+JSON.stringify(dictionary)+';\nwindow.HikoroSpanishPatterns = '+JSON.stringify(patterns)+';\n';
if(process.argv.includes('--check')){if(result!==fs.readFileSync(path.join(publicDir,'i18n-catalog.js'),'utf8'))throw Error('Run node scripts/build-locales.js to update the catalog');}else fs.writeFileSync(path.join(publicDir,'i18n-catalog.js'),result);
