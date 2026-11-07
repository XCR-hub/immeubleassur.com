import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {analyticsMeasurementId,analyticsTagBlock} from './analytics-config.js';
const root='public';
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
let tagged=0,excluded=0,changed=0;
if(!analyticsMeasurementId())throw new Error('Verified site measurement configuration missing');
for(const path of walk(root).filter(p=>p.endsWith('.html'))){
 const slug=relative(root,path).replaceAll('\\','/').replace(/\.html$/,'');
 const before=readFileSync(path,'utf8');
 const block=analyticsTagBlock(slug);
 let html=before.replace(/<!-- analytics:start -->[\s\S]*?<!-- analytics:end -->\s*/g,'');
 if(block){if(!/<\/head>/i.test(html))throw Error('Missing head: '+path);html=html.replace(/<\/head>/i,block+'\n</head>');tagged++}else excluded++;
 if(html!==before){writeFileSync(path,html);changed++;}
}
console.log('Analytics tags: '+tagged+' public pages, '+excluded+' private/success pages excluded; '+changed+' pages updated.');
