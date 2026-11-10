import assert from "node:assert/strict";
import {test} from "node:test";
import {parsePublicPage,editorialBusinessCoverage} from "./editorial-autopilot.js";
import {connectorReportVersionMatches,EDITORIAL_COLLECTION_VERSION} from "./live-connector-report-versions.js";
const source={id:"adil40-syndic-actualites",name:"ADIL des Landes",url:"https://www.anil.org/adil-40/toutes-nos-actualites/"};
const now=new Date("2026-11-10T20:00:00Z");
test("a changed source configuration refreshes the editorial collection before the normal cooldown",()=>{
  assert.equal(connectorReportVersionMatches("editorial-autopilot-report.json",{generated_at:now.toISOString()}),false);
  assert.equal(connectorReportVersionMatches("editorial-autopilot-report.json",{collector_version:"old"}),false);
  assert.equal(connectorReportVersionMatches("editorial-autopilot-report.json",{collector_version:EDITORIAL_COLLECTION_VERSION}),true);
});
test("ADIL syndic collection stays within its article path and keeps the publication date",()=>{
  const items=parsePublicPage(`<p>06 octobre 2026</p><a href="/adil-40/toutes-nos-actualites/details/salon-copropriete/">Salon de la Copropriété et de l'Habitat</a><p>Syndic, conseil syndical et travaux en copropriété.</p><a href="/adil-40/contact/">Conseil syndical et contacts de l'agence</a><a href="https://other.example.test/adil-40/toutes-nos-actualites/details/salon-copropriete/">Assemblée générale du conseil syndical</a><a href="/adil-57/toutes-nos-actualites/details/coprop/">Assemblée générale et syndic bénévole</a>`,source);
  assert.equal(items.length,1);assert.equal(items[0].published_at,"06 octobre 2026");
  assert.equal(editorialBusinessCoverage(items,now).dimensions.syndic.fresh_covered,true);
});
test("accented assembly terms count as coverage while event dates cannot freshen old or future publications",()=>{
  const item={source_id:source.id,title:"Assemblée générale des copropriétaires",summary:"Conseil sur l'organisation",published_at:"06 octobre 2026"};
  assert.equal(editorialBusinessCoverage([item],now).dimensions.syndic.fresh_covered,true);
  assert.equal(editorialBusinessCoverage([{...item,published_at:"09 avril 2026",summary:"Atelier du 5 novembre 2026"}],now).dimensions.syndic.fresh_covered,false);
  assert.equal(editorialBusinessCoverage([{...item,published_at:"19 novembre 2026"}],now).dimensions.syndic.fresh_covered,false);
});
