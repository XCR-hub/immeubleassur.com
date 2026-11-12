import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {basename,isAbsolute,join,relative,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {versionedAsset} from './editorial-autopilot.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const repository=resolve('.');
for(const key of ['sitemap.xml','sitemap'])test(`a held edition retains its articles while its ${key} base is refreshed`,()=>{
 const parent=realpathSync(tmpdir()),root=mkdtempSync(join(parent,'immeubleassur-sitemap-'));
 try{
  const publicRoot=join(root,'public'),scripts=join(root,'scripts'),reports=join(root,'reports'),publications=join(root,'publications'),versionRoot=join(publications,'versions','retained');
  for(const directory of [publicRoot,scripts,reports,join(versionRoot,'news')])mkdirSync(directory,{recursive:true});
  writeFileSync(join(root,'package.json'),'{"type":"module"}');
  for(const name of ['local-editorial-publisher.js','local-env.js','turnstile-markup.js','site-navigation.js'])copyFileSync(join(repository,'scripts',name),join(scripts,name));
  writeFileSync(join(scripts,'editorial-autopilot.js'),`import {writeFileSync} from 'node:fs';import {join} from 'node:path';writeFileSync(join(process.env.LOCAL_RUNTIME_REPORTS_ROOT,'editorial-autopilot-report.json'),JSON.stringify({publication_gate:{ready:false},public_write_enabled:false}));`);
  const today=new Date().toISOString().slice(0,10),slug='news/veille-assurance-immeuble-'+today;
  const article='<html><body><main>Previous trusted edition, preserved verbatim.</main></body></html>';
  writeFileSync(join(versionRoot,slug+'.html'),article);
  const retainedEntry=`<url><loc>https://immeubleassur.com/${slug}</loc><lastmod>${today}</lastmod></url>`;
  const oldBase='<urlset><url><loc>https://immeubleassur.com/</loc></url></urlset>';
  const oldSitemap=oldBase.replace('</urlset>',retainedEntry+'</urlset>');
  writeFileSync(join(versionRoot,'sitemap.xml'),oldSitemap);
  const newBase=oldBase.replace('</urlset>','<url><loc>https://immeubleassur.com/assurance-garages-parkings</loc></url></urlset>');
  writeFileSync(join(publicRoot,'sitemap.xml'),newBase);
  writeFileSync(join(publicRoot,'faq.html'),'<main>FAQ</main>');writeFileSync(join(publicRoot,'villes.html'),'<main>Villes</main>');
  const inputs=Object.fromEntries(['scripts/editorial-autopilot.js','scripts/site-navigation.js','scripts/editorial-public-metadata-policy.js','scripts/turnstile-markup.js','scripts/local-editorial-publisher.js','public/assets/styles.css','public/assets/app.js','public/assets/editorial-live.js'].map(name=>[name,existsSync(join(root,name))?hash(readFileSync(join(root,name))):'']));
  const current={marker:'runtime-editorial-publication-v1',version:'retained',activated_at:today+'T00:00:00Z',issue:{slug,title:'Retained edition'},allowed_files:['sitemap.xml',slug+'.html'],files:[{path:'sitemap.xml',bytes:Buffer.byteLength(oldSitemap),sha256:hash(oldSitemap)}],public_content_provider:'deterministic',public_content_ai_generated:false,ai_draft_allowed_publication:false,base_hub_hashes:{faq:hash('<main>FAQ</main>'),villes:hash('<main>Villes</main>'),[key]:hash(oldBase)},publication_build_hash:hash(JSON.stringify(inputs)),hub_enrichment:{faq:{marker_count:1,end_marker_count:1},cities:{marker_count:1,end_marker_count:1,linked_city_count:3}}};
  writeFileSync(join(publications,'current.json'),JSON.stringify(current));
  const run=()=>{const result=spawnSync(process.execPath,['scripts/local-editorial-publisher.js'],{cwd:root,env:{...process.env,LOCAL_SITE_PUBLIC_ROOT:publicRoot,LOCAL_RUNTIME_REPORTS_ROOT:reports,LOCAL_RUNTIME_PUBLICATIONS_ROOT:publications,LOCAL_EDITORIAL_PUBLISHER_REPORT:join(reports,'publisher.json')},encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(result.status,0,result.stderr||result.stdout);return JSON.parse(readFileSync(join(reports,'publisher.json'),'utf8'));};
  const report=run();assert.equal(report.status,'held-by-publication-gate');assert.equal(report.preserved_sitemap_refreshed,true);
  const sitemap=readFileSync(join(versionRoot,'sitemap.xml'),'utf8');
  assert.match(sitemap,/assurance-garages-parkings/);assert.ok(sitemap.includes(retainedEntry));
  assert.equal(readFileSync(join(versionRoot,slug+'.html'),'utf8'),article);
  assert.equal(existsSync(join(versionRoot,'news','sitemap.xml')),false,'The live artifact belongs at the version root.');
  const after=JSON.parse(readFileSync(join(publications,'current.json'),'utf8'));
  assert.equal(after.version,current.version);assert.deepEqual(after.issue,current.issue);assert.deepEqual(after.allowed_files,current.allowed_files);
  assert.equal(after.files.find(file=>file.path==='sitemap.xml').sha256,hash(sitemap));assert.equal(after.files.find(file=>file.path==='sitemap.xml').bytes,Buffer.byteLength(sitemap));
  assert.equal(after.base_hub_hashes.sitemap,hash(newBase));assert.equal(after.ai_draft_allowed_publication,false);
  assert.equal(run().status,'already-published-today','An unchanged base does not regenerate the edition.');
 }finally{
  const target=realpathSync(root),within=relative(parent,target);assert.ok(within&&!within.startsWith('..')&&!isAbsolute(within)&&basename(target).startsWith('immeubleassur-sitemap-'));
  rmSync(target,{recursive:true,force:true});
 }
});

test('isolated editions version their CSS and script against the served public assets',()=>{
 const parent=realpathSync(tmpdir()),root=mkdtempSync(join(parent,'immeubleassur-assets-'));
 try{
  mkdirSync(join(root,'assets'));
  for(const name of ['styles.css','app.js','editorial-live.js']){
   const path=join(root,'assets',name),url='/assets/'+name;
   writeFileSync(path,'first public asset');
   const first=versionedAsset(url,root);
   assert.equal(first,url+'?v='+hash('first public asset').slice(0,10));
   writeFileSync(path,'updated public asset');
   assert.notEqual(versionedAsset(url,root),first,'A changed served asset must invalidate cached editions.');
  }
  assert.equal(versionedAsset('/assets/missing.js',root),'/assets/missing.js');
 }finally{
  const target=realpathSync(root),within=relative(parent,target);assert.ok(within&&!within.startsWith('..')&&!isAbsolute(within)&&basename(target).startsWith('immeubleassur-assets-'));
  rmSync(target,{recursive:true,force:true});
 }
});
