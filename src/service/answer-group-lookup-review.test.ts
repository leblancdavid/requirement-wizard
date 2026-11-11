import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import Database from "better-sqlite3";
import {analysisSchema} from "../core/model.js";
import {answerGroupMaterials,planAnswerGroup,adoptAnswerGroupPlay,adoptAnswerGroupRepairPolicy,boundAnswerGroupEvidence,acceptAnswerGroup,replayAnswerGroup,answerGroupDraftSchema,answerGroupProgress,planAnswerGroupEvidencePages,planAnswerGroupLookupReview,prepareAnswerGroupLookupInspection,adoptAnswerGroupInputCapacity,answerGroupPageCounts} from "../core/answer-group.js";
import {ProjectStore} from "../storage/store.js";
import {continuationState,decodePortable} from "../storage/portable.js";
import {renderWorkspace} from "../storage/workspace.js";
import {DiscoveryService} from "./discovery.js";
import {discoveryPrompt} from "../runtime/discovery.js";
import {assertJointInputAdmission} from "../runtime/input-capacity.js";
const empty=()=>analysisSchema.parse({summary:"Retain each original answer",goals:[],actors:[],assumptions:[],questions:[],requirements:[],retireQuestions:[]});
function fixture(store:ProjectStore,nonPinned=false,phrases=false,scale=1,sourceCounterpart=false,requirementCount=4){
 let p=store.create("Lookup clarification","Preserve all original decisions",{providerID:"openai",modelID:"fixture"});
 const text=(bytes:number)=>phrases?Array.from({length:100},(_,i)=>`${i}: Preserve every original human choice, exact punctuation, quoted evidence and complete supporting records without dropping any acceptance scenario or declaring separate rules independent. ${randomBytes(20).toString("hex")} `).join("").slice(0,Math.floor(bytes*1.32)):randomBytes(Math.min(6000,Math.floor(bytes*scale))).toString("hex");
 const seed=store.beginJob(p.id,p.revision).job;store.claimJob(seed.id,Date.now()+60000);
 store.finishJob(seed.id,{...empty(),requirements:Array.from({length:requirementCount},()=>({epicID:"project",statement:text(4000),rationale:text(4500),acceptance:Array.from({length:3},()=>text(3000)),sourceIDs:[p.sources[0]!.id]})),
 questions:["Which first behavior?","Which second behavior?"].map(text=>({epicID:"project",text,whyItMatters:"Retain the original decision",options:[{label:"Keep",consequence:"Preserve"},{label:"Change",consequence:"Review"}]}))});
 p=store.get(p.id);for(const r of p.requirements)p=store.review(p.id,p.revision,r.id,"accepted","Original supported behavior");
 for(const q of p.questions)store.enqueue(p.id,{id:randomUUID(),auto:false,research:false,input:{type:"answer",questionID:q.id,questionText:q.text,sourceID:null,answer:{kind:"answer",text:"Keep this original choice"}}});
 store.applyQueued(p.id,store.submissions(p.id).map(s=>s.id));p=store.get(p.id);const items=store.submissions(p.id),m=answerGroupMaterials(p,items);
 const state=store.workflow(p.id);state.enabled=true;state.paused=false;state.playPolicy={format:1,stopped:false};state.grant={id:randomUUID(),used:0,continuous:{format:1},remainingMs:300000,submissionIDs:items.map(s=>s.id)};store.saveWorkflow(p.id,state);
 const owner=store.claimWorkflow(p.id).owner!,job=store.beginJob(p.id,p.revision,undefined,false,owner).job;store.claimJob(job.id,Date.now()+60000);
 const w=adoptAnswerGroupPlay(m,planAnswerGroup(m),job);adoptAnswerGroupRepairPolicy(w);
 const draft=answerGroupDraftSchema.parse({analysis:empty(),answers:items.map(s=>({submissionID:s.id,outcome:"no-change",explanation:"Provisional original decision retained"}))});
 boundAnswerGroupEvidence(m,w);w.attempts++;w.automation!.requests++;acceptAnswerGroup(m,w,undefined,{answerGroupDraft:draft},job);
  let context=boundAnswerGroupEvidence(m,w,draft);
  if(scale>1)for(let i=0;i<16&&!p.requirements.some(r=>context.manifest.includedIDs.includes(r.id));i++){
   w.attempts++;w.automation!.requests++;acceptAnswerGroup(m,w,draft,{answerGroupKeep:true},job);context=boundAnswerGroupEvidence(m,w,draft);
  }
  const missing=p.requirements.filter(r=>!context.manifest.includedIDs.includes(r.id)).map(r=>r.id);assert.ok(missing.length>=3);
 const counterparts=nonPinned?[(sourceCounterpart?undefined:p.requirements.find(r=>context.manifest.includedIDs.includes(r.id)))?.id??p.sources.find(s=>!m.pins.has(s.id)&&context.manifest.includedIDs.includes(s.id))!.id]:items.map(s=>s.appliedSourceID!);
 w.attempts++;w.automation!.requests++;acceptAnswerGroup(m,w,draft,{answerGroupEvidence:{recordIDs:missing,withRecordIDs:counterparts}},job);
 store.checkpointAnswerGroup(job.id,w,context.manifest);store.failJob(job.id,"failed","Retained oversized joint lookup");store.releaseWorkflow(p.id,owner);
 for(const s of items){s.status="needs-attention";s.jobID=job.id;store.saveSubmission(s);}
 return {p,items,m,w,draft,job:store.getJob(job.id),missing};
}
test("oversized pin-only joint lookup requires a paid clarification before bounded unit reads; all originals and verification remain mandatory",async()=>{
 const store=new ProjectStore(":memory:");try{
  const f=fixture(store),copy=structuredClone(f.w),context=boundAnswerGroupEvidence(f.m,copy,f.draft);
  assert.ok(context.answerGroupLookupReview);assert.ok(context.manifest.characters<96000);assert.deepEqual(copy.receipts,f.w.receipts);assert.equal(copy.attempts,f.w.attempts);
  assert.deepEqual(replayAnswerGroup(f.m,copy).draft,f.draft);assert.match(discoveryPrompt(f.p,context),/SCOPE CLARIFICATION/);
  const invalid=structuredClone(copy);invalid.attempts++;invalid.automation!.requests++;
  assert.throws(()=>acceptAnswerGroup(f.m,invalid,f.draft,{answerGroupKeep:true},f.job),/cannot edit/);
  let clarifications=0,reads=0,checks=0;const seen=new Set<string>();
  const done=await new DiscoveryService(store,{async analyze(_p,{context:packet}){
   assert.ok(packet.manifest.characters<=96000);assert.ok([...f.m.pins].every(id=>packet.manifest.includedIDs.includes(id)));
   if(packet.answerGroupLookupReview){clarifications++;return {answerGroupLoadPlan:{separateOriginalUnits:true,reason:"These are separate original-unit loads beside the always-pinned answers, not an all-bodies joint comparison."}};}
   for(const id of f.missing)if(packet.manifest.includedIDs.includes(id))seen.add(id);
   if(packet.manifest.answerGroupStage!.phase==="read"){reads++;return {answerGroupKeep:true};}
   checks++;return {answerGroupCheck:{valid:true,reason:"This complete original unit agrees with the full retained draft and every answer"}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
  assert.equal(done.status,"completed",done.diagnostic);assert.equal(clarifications,1);assert.ok(reads>=3);assert.ok(checks>=f.w.batches.length);
  assert.equal(seen.size,f.missing.length);assert.deepEqual(done.answerGroupWork!.receipts.slice(0,f.w.receipts.length),f.w.receipts);
  assert.equal(done.answerGroupWork!.automation!.requests,f.w.automation!.requests+clarifications+reads+checks);
  assert.equal(done.answerGroupWork!.receipts[f.w.receipts.length]!.attempt,f.w.attempts+1);
  assert.equal(answerGroupProgress(done.answerGroupWork!).phase,"complete");
 }finally{store.close();}
});
for(const outcome of ["block","malformed","cancel"]as const)test(`lookup clarification ${outcome} cannot discard the original joint request or earn a read`,async()=>{
 const store=new ProjectStore(":memory:");try{
  const f=fixture(store),controller=new AbortController();let calls=0;
  const stopped=await new DiscoveryService(store,{async analyze(_p,{context}){calls++;assert.ok(context.answerGroupLookupReview);
   if(outcome==="cancel")controller.abort(new DOMException("Stopped","AbortError"));
   return outcome==="block"?{answerGroupBlocked:{reason:"All requested originals really are indispensable together"}}:outcome==="malformed"?{}:{answerGroupLoadPlan:{separateOriginalUnits:true,reason:"Separate retrieval only"}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id),signal:controller.signal});
  assert.equal(stopped.status,outcome==="cancel"?"cancelled":"failed");assert.equal(calls,outcome==="malformed"?3:1);
  assert.deepEqual(stopped.answerGroupWork!.receipts.slice(0,f.w.receipts.length),f.w.receipts);
  assert.equal(answerGroupProgress(stopped.answerGroupWork!).completed,answerGroupProgress(f.w).completed);
  assert.equal(stopped.answerGroupWork!.attempts,f.w.attempts+calls);assert.equal(stopped.answerGroupWork!.automation!.requests,f.w.automation!.requests+calls);
  assert.deepEqual(replayAnswerGroup(f.m,stopped.answerGroupWork!).draft,f.draft);
  if(outcome==="cancel"){
   let clarifications=0;
   const resumed=await new DiscoveryService(store,{async analyze(_p,{context}){
    if(context.answerGroupLookupReview){clarifications++;return {answerGroupLoadPlan:{separateOriginalUnits:true,reason:"Separate original-unit retrieval beside every original answer"}};}
    return context.manifest.answerGroupStage!.phase==="read"?{answerGroupKeep:true}:{answerGroupCheck:{valid:true,reason:"Original packet agrees"}};
   }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
   assert.equal(resumed.status,"completed",resumed.diagnostic);assert.equal(clarifications,1);
   assert.equal(resumed.answerGroupWork!.receipts[f.w.receipts.length]!.attempt,f.w.attempts+2);
  }
 }finally{store.close();}
});
test("a non-pinned joint counterpart requires v2 clarification, never the pin-only waiver or a silent split",()=>{
 const store=new ProjectStore(":memory:");try{const f=fixture(store,true),copy=structuredClone(f.w),context=boundAnswerGroupEvidence(f.m,copy,f.draft);
  assert.equal(context.answerGroupLookupReviewFormat,2);assert.equal(copy.lookupReviews!.at(-1)!.format,2);assert.deepEqual(copy.receipts,f.w.receipts);assert.equal(copy.attempts,f.w.attempts);assert.deepEqual(copy.evidencePages,f.w.evidencePages);
  assert.match(discoveryPrompt(f.p,context),/ALL counterpart bodies\/support/);assert.deepEqual(replayAnswerGroup(f.m,copy).draft,f.draft);
 }finally{store.close();}
});
test("v2 explicitly confirms separate comparisons and retains exact non-pinned counterpart/support on every read through final verification",async()=>{
 const store=new ProjectStore(":memory:");try{
  const f=fixture(store,true),lookup=f.w.receipts.at(-1)!.response;assert.ok("answerGroupEvidence"in lookup);
  const counterparts=lookup.answerGroupEvidence.withRecordIDs!,seen=new Set<string>();let reviews=0,reads=0,checks=0;
  const done=await new DiscoveryService(store,{async analyze(_p,{context}){
   assert.ok(context.manifest.characters<=96000);assert.ok([...f.m.pins].every(id=>context.manifest.includedIDs.includes(id)));
   if(context.answerGroupLookupReview){reviews++;assert.equal(context.answerGroupLookupReviewFormat,2);return {answerGroupLoadPlan:{separateOriginalUnits:true,reason:"Each requested original is compared separately against ALL unchanged counterparts; no requested-records-together comparison is indispensable."}};}
   if(context.manifest.answerGroupStage!.phase==="read"){
    reads++;const present=f.missing.filter(id=>context.manifest.includedIDs.includes(id));
    if(present.length && context.manifest.answerGroupStage!.step===f.w.receipts.at(-1)!.step){assert.ok(counterparts.every(id=>context.manifest.includedIDs.includes(id)));const decoded=expand(context.data);
     for(const field of ["sources","questions","requirements","research"]as const)for(const record of decoded[field])assert.deepEqual(record,f.p[field].find(r=>r.id===record.id));
     for(const id of present)seen.add(id);
    }return {answerGroupKeep:true};
   }checks++;return {answerGroupCheck:{valid:true,reason:"Every supplied original unit agrees with the full draft and original answers"}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
  assert.equal(done.status,"completed",done.diagnostic);assert.equal(reviews,1);assert.equal(seen.size,f.missing.length);assert.ok(checks>=f.w.batches.length);assert.ok(reads>=f.missing.length);
  assert.deepEqual(done.answerGroupWork!.receipts.slice(0,f.w.receipts.length),f.w.receipts);assert.equal(done.answerGroupWork!.automation!.requests,f.w.automation!.requests+reviews+reads+checks);
 }finally{store.close();}
});
for(const outcome of ["block","malformed","cancel"]as const)test(`v2 ${outcome} grants no split, read or refund`,async()=>{
 const store=new ProjectStore(":memory:");try{const f=fixture(store,true),controller=new AbortController();let calls=0;
  const stopped=await new DiscoveryService(store,{async analyze(_p,{context}){calls++;assert.equal(context.answerGroupLookupReviewFormat,2);
   if(outcome==="cancel")controller.abort(new DOMException("Stopped","AbortError"));
   return outcome==="block"?{answerGroupBlocked:{reason:"These requested records really must be compared together"}}:outcome==="malformed"?{}:{answerGroupLoadPlan:{separateOriginalUnits:true,reason:"Each original with every counterpart"}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id),signal:controller.signal});
  assert.equal(stopped.status,outcome==="cancel"?"cancelled":"failed");assert.deepEqual(stopped.answerGroupWork!.receipts.slice(0,f.w.receipts.length),f.w.receipts);
  assert.equal(answerGroupProgress(stopped.answerGroupWork!).completed,answerGroupProgress(f.w).completed);assert.equal(stopped.answerGroupWork!.attempts,f.w.attempts+calls);assert.equal(stopped.answerGroupWork!.automation!.requests,f.w.automation!.requests+calls);
  assert.deepEqual(stopped.answerGroupWork!.evidencePages,f.w.evidencePages);assert.deepEqual(replayAnswerGroup(f.m,stopped.answerGroupWork!).draft,f.draft);
 }finally{store.close();}
});
test("v2 counterpart cohorts survive partial completion and relayout; a repeated joint comparison cannot buy another clarification",()=>{
 const store=new ProjectStore(":memory:");try{const f=fixture(store,true),w=structuredClone(f.w),original=f.w.receipts.at(-1)!.response;assert.ok("answerGroupEvidence"in original);
  boundAnswerGroupEvidence(f.m,w,f.draft);w.attempts++;w.automation!.requests++;acceptAnswerGroup(f.m,w,f.draft,{answerGroupLoadPlan:{separateOriginalUnits:true,reason:"Separate comparisons each retaining every counterpart"}},f.job);
  const before=answerGroupProgress(w).completed;boundAnswerGroupEvidence(f.m,w,f.draft);w.attempts++;w.automation!.requests++;acceptAnswerGroup(f.m,w,f.draft,{answerGroupKeep:true},f.job);
  assert.equal(answerGroupProgress(w).completed,before,"Fixture has additional pages in the same original step");
  const plan=planAnswerGroupEvidencePages(f.m,w,f.draft,10)!;assert.ok(plan);w.evidencePages!.push(plan);
  const packet=boundAnswerGroupEvidence(f.m,w,f.draft);assert.ok(original.answerGroupEvidence.withRecordIDs!.every(id=>packet.manifest.includedIDs.includes(id)));assert.deepEqual(replayAnswerGroup(f.m,w).draft,f.draft);
  const repeated=structuredClone(w);repeated.receipts.push({...f.w.receipts.at(-1)!,response:{answerGroupEvidence:{recordIDs:[...original.answerGroupEvidence.recordIDs].reverse(),withRecordIDs:original.answerGroupEvidence.withRecordIDs}}});
  assert.equal(planAnswerGroupLookupReview(f.m,repeated,f.draft),undefined);
 }finally{store.close();}
});
test("v2 refuses clarification when one requested original cannot fit with its complete counterpart",()=>{
 const store=new ProjectStore(":memory:");try{const f=fixture(store,true,false,1.4),w=structuredClone(f.w);
  assert.equal(planAnswerGroupLookupReview(f.m,w,f.draft),undefined);assert.throws(()=>boundAnswerGroupEvidence(f.m,w,f.draft),/safe dispatch bound/);assert.deepEqual(w,f.w);
 }finally{store.close();}
});
test("v2 check-phase comparisons retain every counterpart and finish every original verification batch",async()=>{
 const store=new ProjectStore(":memory:");try{const f=fixture(store,true);let requested:string[]|undefined,counterparts:string[]=[],step=-1,reviews=0,checks=0;const seen=new Set<string>();
  const done=await new DiscoveryService(store,{async analyze(_p,{context}){
   const stage=context.manifest.answerGroupStage!;assert.ok(context.manifest.characters<=96000);
   if(context.answerGroupLookupReview){assert.equal(context.answerGroupLookupReviewFormat,2);reviews++;return {answerGroupLoadPlan:{separateOriginalUnits:true,reason:"Separate original comparisons retain ALL counterparts; no requested originals must be together"}};}
   if(stage.phase==="read")return {answerGroupKeep:true};
   const missing=f.p.requirements.filter(r=>!context.manifest.includedIDs.includes(r.id)).map(r=>r.id),loaded=f.p.requirements.find(r=>context.manifest.includedIDs.includes(r.id));
   if(!requested&&loaded&&missing.length>=2){requested=missing;counterparts=[loaded.id];step=stage.step;return {answerGroupEvidence:{recordIDs:requested,withRecordIDs:counterparts}};}
   if(requested&&stage.step===step&&requested.some(id=>context.manifest.includedIDs.includes(id))){assert.ok(counterparts.every(id=>context.manifest.includedIDs.includes(id)));for(const id of requested)if(context.manifest.includedIDs.includes(id))seen.add(id);}
   checks++;return {answerGroupCheck:{valid:true,reason:"Detailed original units and complete counterparts agree with every original answer and the full frozen draft"}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
  assert.equal(done.status,"completed",done.diagnostic);assert.ok(requested);assert.equal(seen.size,requested.length);assert.equal(reviews,2);assert.ok(checks>=f.w.batches.length);
 }finally{store.close();}
});
/** Independent decoder: no production expansion helper may mask an encoder loss. */
function expand(input:unknown):any{
 const root=input as {sharedText?:{values:Record<string,string>};identifierTable?:{values:string[]}};
 const decode=(value:any,field=""):any=>{
  if(typeof value==="number"&&root.identifierTable&&field!=="sharedTextID"&&(field==="id"||field.endsWith("ID")||field.endsWith("IDs")||field==="dependencies"))return root.identifierTable.values[value];
  if(Array.isArray(value))return value.map(v=>decode(v,field));
  if(value&&typeof value==="object"){
   if(Object.keys(value).length===1&&value.recordTable){const t=value.recordTable,absent=new Set(t.absent?.map(([r,c]:number[])=>`${r}:${c}`));return t.rows.map((row:unknown[],r:number)=>Object.fromEntries(t.columns.flatMap((key:string,c:number)=>absent.has(`${r}:${c}`)?[]:[[key,decode(row[c],key)]])));}
   if(Object.keys(value).length===1&&typeof value.sharedTextID==="string"){assert.ok(root.sharedText&&Object.hasOwn(root.sharedText.values,value.sharedTextID));return root.sharedText.values[value.sharedTextID];}
   if(Object.keys(value).length===1&&Array.isArray(value.textParts))return value.textParts.map((p:unknown)=>decode(p)).join("");
   return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v,k)]));
  }return value;
 };return decode(input);
}
function blockedInspectionFixture(store:ProjectStore){
 const f=fixture(store,true,false,0.8,true),work=structuredClone(f.w),context=boundAnswerGroupEvidence(f.m,work,f.draft);
 assert.equal(context.answerGroupLookupReviewFormat,2);const job=store.beginJob(f.p.id,f.p.revision).job;store.claimJob(job.id,Date.now()+60000);
 work.attempts++;work.automation!.requests++;acceptAnswerGroup(f.m,work,f.draft,{answerGroupBlocked:{reason:"Missing original bodies prevent deciding whether these comparisons can be separated"}},job);
 store.checkpointAnswerGroup(job.id,work,context.manifest);store.failJob(job.id,"failed","Retained exclusive lookup clarification blocker");
 for(const s of f.items){s.jobID=job.id;s.status="needs-attention";store.saveSubmission(s);}
 return {...f,w:work,job:store.getJob(job.id)};
}
function prepareInspection(store:ProjectStore,f:ReturnType<typeof blockedInspectionFixture>){
 const workflow=store.workflow(f.p.id),ids=store.prepareAnswerGroupPlay(f.p.id,f.p.revision,workflow.settingsVersion);assert.deepEqual(ids,[f.job.id]);
 const saved=store.getJob(f.job.id).answerGroupWork!;assert.deepEqual(saved.receipts,f.w.receipts);assert.equal(saved.attempts,f.w.attempts);assert.equal(saved.automation!.requests,f.w.automation!.requests);
 assert.equal(replayAnswerGroup(f.m,saved).blocked,undefined);assert.deepEqual(answerGroupProgress(saved),answerGroupProgress(f.w));return saved;
}
function retainedAllJointPlan(store:ProjectStore){
 const f=blockedInspectionFixture(store),work=prepareInspection(store,f),job=store.beginJob(f.p.id,f.p.revision).job;store.claimJob(job.id,Date.now()+60000);
 for(;;){const context=boundAnswerGroupEvidence(f.m,work,f.draft),stage=context.answerGroupLookupInspection!;if(stage.phase==="plan")break;
  work.attempts++;work.automation!.requests++;acceptAnswerGroup(f.m,work,f.draft,{answerGroupInspection:{recordID:stage.recordID!,note:"Retain every peer as a conservative exact joint set",compareWithRecordIDs:stage.recordIDs.filter(id=>id!==stage.recordID)}},job);
 }
 work.attempts++;work.automation!.requests++;acceptAnswerGroup(f.m,work,f.draft,{answerGroupComparisons:{groups:[f.missing],reason:"All inspected originals remain one indivisible comparison"}},job);
 let context:NonNullable<typeof job.context>|undefined;try{boundAnswerGroupEvidence(f.m,work,f.draft);}catch(error){context=(error as {manifest:NonNullable<typeof job.context>}).manifest;}
 assert.ok(context);store.checkpointAnswerGroup(job.id,work,context);store.failJob(job.id,"failed","Retained joint comparison exceeds the old 96k bound");
 for(const s of f.items){s.jobID=job.id;s.status="needs-attention";store.saveSubmission(s);}return {...f,w:work,job:store.getJob(job.id)};
}
test("guarded 200k Play retains all paid inspections/planning, serves the indivisible joint alone and completes all original verification without new inspections",async()=>{
 const store=new ProjectStore(":memory:");try{const f=retainedAllJointPlan(store),state=store.workflow(f.p.id);
  assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id,f.p.revision,state.settingsVersion),[f.job.id]);const saved=store.getJob(f.job.id).answerGroupWork!;
  assert.equal(saved.inputCapacity!.characters,200000);assert.deepEqual(saved.receipts,f.w.receipts);assert.equal(saved.attempts,f.w.attempts);assert.equal(saved.automation!.requests,f.w.automation!.requests);
  const prepared=structuredClone(saved),packet=boundAnswerGroupEvidence(f.m,prepared,f.draft),layouts=prepared.evidencePages!.length;
  assert.equal(packet.answerGroupPagingAdvice!.format,11);assert.ok(packet.manifest.characters>96000&&packet.manifest.characters<=200000);assert.equal(packet.manifest.budget,200000);
  assert.ok(f.missing.every(id=>packet.manifest.includedIDs.includes(id)));assert.equal(boundAnswerGroupEvidence(f.m,prepared,f.draft).manifest.characters,packet.manifest.characters);assert.equal(prepared.evidencePages!.length,layouts);
  assert.equal(answerGroupProgress(prepared).completed,answerGroupProgress(f.w).completed);assert.equal(answerGroupPageCounts(prepared).completedReplies,answerGroupPageCounts(f.w).completedReplies);
  const seeds=prepared.evidencePages!.at(-1)!.pages[0]!;assert.ok(seeds.every(id=>f.missing.includes(id)||f.p.sources.some(s=>s.id===id)),"No unrelated background requirement fills a large joint page");
  const model={providerID:"openai",id:"fixture",modelID:"fixture",enabled:true,limit:{context:628000,input:500000,output:128000}};let large=0,checks=0;
  const done=await new DiscoveryService(store,{async analyze(p,{context}){
   assert.equal(context.answerGroupLookupInspection,undefined);assert.equal(context.answerGroupLookupReview,undefined);
   if(context.manifest.characters>96000){large++;assert.ok(assertJointInputAdmission(p,context,discoveryPrompt(p,context,false),[model]));assert.ok(f.missing.every(id=>context.manifest.includedIDs.includes(id)));}
   else assert.equal(context.manifest.budget,96000,"Ordinary packets keep the normal target");
   const decoded=expand(context.data);for(const field of ["sources","questions","requirements","research"]as const)for(const record of decoded[field])assert.deepEqual(record,f.p[field].find(r=>r.id===record.id));
   if(context.manifest.answerGroupStage!.phase==="read")return {answerGroupKeep:true};checks++;return {answerGroupCheck:{valid:true,reason:"All detailed exact originals agree with the complete frozen draft and human answers"}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
  assert.equal(done.status,"completed",done.diagnostic);assert.ok(large>=1);assert.ok(checks>=f.w.batches.length);assert.deepEqual(done.answerGroupWork!.receipts.slice(0,f.w.receipts.length),f.w.receipts);
 }finally{store.close();}
});
test("200k remains a hard bound and neither direct routes nor changed model identities acquire it",()=>{
 const store=new ProjectStore(":memory:");try{const f=fixture(store,true,false,1,true,8),w=structuredClone(f.w);
  assert.ok(adoptAnswerGroupInputCapacity(f.m,w));assert.throws(()=>boundAnswerGroupEvidence(f.m,w,f.draft),/200,000/);assert.deepEqual(w.receipts,f.w.receipts);assert.equal(w.attempts,f.w.attempts);
  const direct={...f.m,project:{...f.p,model:{...f.p.model,connectionID:"direct"}}},original=structuredClone(f.w);assert.equal(adoptAnswerGroupInputCapacity(direct,original),false);assert.deepEqual(original,f.w);
  const changed={...f.m,model:{providerID:"openai",modelID:"other"}};assert.throws(()=>replayAnswerGroup(changed,w),/exact OpenCode model/);
 }finally{store.close();}
});
test("54 to 55 retains the paid joint plan; capacity/pages survive repeated reopen and portable adoption, downgrade/tampering/future formats reject transactionally",()=>{
 const root=resolve(".reqwizit-state/tests");mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,"joint-capacity-")),path=join(dir,"state.sqlite");let store=new ProjectStore(path);
 try{const f=retainedAllJointPlan(store),original=store.getJob(f.job.id);store.close();let db=new Database(path);db.exec("DELETE FROM migration_history WHERE version>=55; PRAGMA user_version=54");db.close();
  for(let i=0;i<2;i++){store=new ProjectStore(path);assert.deepEqual(store.getJob(f.job.id),original);store.close();}store=new ProjectStore(path);
  const state=store.workflow(f.p.id);assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id,f.p.revision,state.settingsVersion),[f.job.id]);const work=store.getJob(f.job.id).answerGroupWork!,context=boundAnswerGroupEvidence(f.m,work,f.draft),job=store.beginJob(f.p.id,f.p.revision).job;
  store.claimJob(job.id,Date.now()+60000);store.checkpointAnswerGroup(job.id,work,context.manifest);
  const bad=structuredClone(work);bad.inputCapacity!.prefixKey="0".repeat(64);assert.throws(()=>replayAnswerGroup(f.m,bad));assert.throws(()=>store.checkpointAnswerGroup(job.id,bad,context.manifest),/capacity/);
  store.failJob(job.id,"interrupted","Guarded joint saved before dispatch");for(const s of f.items){s.jobID=job.id;store.saveSubmission(s);}const saved=store.getJob(job.id);store.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(job.id),saved);
  const files=renderWorkspace(f.p,undefined,continuationState(f.p,store.jobs(f.p.id),store.submissions(f.p.id),rev=>store.get(f.p.id,rev)));assert.equal(JSON.parse(files["state.json"]!).formatVersion,29);
  assert.doesNotThrow(()=>decodePortable(files,f.p.model));assert.throws(()=>decodePortable({...files,"state.json":JSON.stringify({...JSON.parse(files["state.json"]!),formatVersion:28})},f.p.model),/format 29/);
  const folder=join(dir,"clone");for(const[name,value]of Object.entries(files)){const file=join(folder,".reqwizit",name);mkdirSync(resolve(file,".."),{recursive:true});writeFileSync(file,value);}
  const clone=new ProjectStore(":memory:");try{const project=clone.openWorkspace(folder,f.p.model),retained=clone.getJob(job.id).answerGroupWork!,material=answerGroupMaterials(project,retained.submissionIDs.map(id=>clone.submissions(project.id).find(s=>s.id===id)!));assert.deepEqual(replayAnswerGroup(material,retained).draft,f.draft);assert.deepEqual(boundAnswerGroupEvidence(material,retained,f.draft).data,context.data);assert.equal(clone.workflow(project.id).paused,true);}finally{clone.close();}
  store.close();db=new Database(path);const future=structuredClone(saved);future.answerGroupWork!.inputCapacity!.format=2 as never;db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future),saved.id);db.exec("DELETE FROM migration_history WHERE version>=55; PRAGMA user_version=54");db.close();
  assert.throws(()=>new ProjectStore(path));db=new Database(path);assert.equal(db.pragma("user_version",{simple:true}),54);db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved),saved.id);db.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(saved.id),saved);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test("evidence-first Play preserves a blocked paid prefix, inspects complete originals without approval, then checks exact multi-original groups and every original batch",async()=>{
 const store=new ProjectStore(":memory:");try{const f=blockedInspectionFixture(store);prepareInspection(store,f);
  const [first,second,third]=f.missing;assert.ok(first&&second&&third);let inspections=0,plans=0,checks=0,reads=0;const grouped=new Set<string>();
  const done=await new DiscoveryService(store,{async analyze(_p,{context}){
   assert.ok(context.manifest.characters<=96000);const stage=context.answerGroupLookupInspection;
   if(stage){const decoded=expand((context.data as any).workingEvidence);assert.deepEqual(decoded.draft,f.draft);
    for(const indexed of (context.data as any).lookupInspection.requestedOriginalIndex){const original=f.p.requirements.find(r=>r.id===indexed.id)!;assert.equal(indexed.statement,original.statement,"Peer identity fields are complete exact originals, not generated summaries or truncated snippets");}
    for(const field of ["sources","questions","requirements","research"]as const)for(const record of decoded[field])assert.deepEqual(record,f.p[field].find(r=>r.id===record.id));
    assert.match(discoveryPrompt(f.p,context),/no tools/);assert.ok([...f.m.pins].every(id=>context.manifest.includedIDs.includes(id)));
    const live=store.jobs(f.p.id).find(j=>j.status==="running")!.answerGroupWork!;assert.deepEqual(answerGroupProgress(live),answerGroupProgress(f.w));
    if(stage.phase==="inspect"){inspections++;return {answerGroupInspection:{recordID:stage.recordID!,note:"Retrieval observation only; exact originals still require a joint read and all verification",compareWithRecordIDs:stage.recordID===first?[second]:stage.recordID===second?[first]:[]}};}
    plans++;return {answerGroupComparisons:{groups:[[first,second],...f.missing.slice(2).map(id=>[id])],reason:"Preserve the flagged joint pair and schedule every remaining original with every counterpart"}};
   }
   assert.equal(context.answerGroupLookupReview,undefined);
   if(context.manifest.answerGroupStage!.phase==="read"){
    reads++;if(context.manifest.answerGroupStage!.step===f.w.receipts.at(-1)!.step){
     if(context.manifest.includedIDs.includes(first)||context.manifest.includedIDs.includes(second)){assert.ok([first,second].every(id=>context.manifest.includedIDs.includes(id)));grouped.add("pair");}
     if(context.manifest.includedIDs.includes(third))grouped.add("single");
    }return {answerGroupKeep:true};
   }checks++;return {answerGroupCheck:{valid:true,reason:"All detailed originals/support agree with the complete draft and every original human answer"}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
  assert.equal(done.status,"completed",done.diagnostic);assert.equal(inspections,f.missing.length);assert.equal(plans,1);assert.equal(grouped.size,2);assert.ok(checks>=f.w.batches.length);
  assert.deepEqual(done.answerGroupWork!.receipts.slice(0,f.w.receipts.length),f.w.receipts);assert.equal(done.answerGroupWork!.automation!.requests,f.w.automation!.requests+inspections+plans+reads+checks);
 }finally{store.close();}
});
test("inspection cannot grant a verdict/edit, invent peers, skip originals or narrow a flagged joint set",()=>{
 const store=new ProjectStore(":memory:");try{const f=blockedInspectionFixture(store),w=prepareInspection(store,f),originalProgress=answerGroupProgress(w);
  const stage=boundAnswerGroupEvidence(f.m,w,f.draft).answerGroupLookupInspection!;
  for(const response of [{answerGroupKeep:true},{answerGroupCheck:{valid:true,reason:"Premature approval"}},{answerGroupRepair:f.draft},{answerGroupComparisons:{groups:[f.missing],reason:"Skipped inspection"}},{answerGroupInspection:{recordID:stage.recordID!,note:"Invalid foreign peer",compareWithRecordIDs:[randomUUID()]}}]){
   const invalid=structuredClone(w);invalid.attempts++;invalid.automation!.requests++;assert.throws(()=>acceptAnswerGroup(f.m,invalid,f.draft,response,f.job));assert.equal(invalid.receipts.length,w.receipts.length);
  }
  for(const id of f.missing){w.attempts++;w.automation!.requests++;acceptAnswerGroup(f.m,w,f.draft,{answerGroupInspection:{recordID:id,note:"Conservative joint scope",compareWithRecordIDs:id===f.missing[0]?[f.missing[1]!]:[]}},f.job);}
  assert.deepEqual(answerGroupProgress(w),originalProgress);const invalid=structuredClone(w);invalid.attempts++;invalid.automation!.requests++;
  assert.throws(()=>acceptAnswerGroup(f.m,invalid,f.draft,{answerGroupComparisons:{groups:f.missing.map(id=>[id]),reason:"Dropped required joint pair"}},f.job),/flagged joint set/);
  assert.equal(prepareAnswerGroupLookupInspection(f.m,w,f.draft),false);assert.deepEqual(replayAnswerGroup(f.m,w).draft,f.draft);
 }finally{store.close();}
});
test("an honest oversized all-original inspection plan is retained and stops before any further model call",async()=>{
 const store=new ProjectStore(":memory:");try{const f=blockedInspectionFixture(store);prepareInspection(store,f);let calls=0;
  const stopped=await new DiscoveryService(store,{async analyze(_p,{context}){calls++;const stage=context.answerGroupLookupInspection!;assert.ok(stage);
   return stage.phase==="inspect"?{answerGroupInspection:{recordID:stage.recordID!,note:"Every peer may be indispensable; retain the full joint set",compareWithRecordIDs:stage.recordIDs.filter(id=>id!==stage.recordID)}}:{answerGroupComparisons:{groups:[stage.recordIDs],reason:"All inspected originals must remain together"}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
  assert.equal(stopped.status,"failed");assert.equal(calls,f.missing.length+1);assert.ok("answerGroupComparisons"in stopped.answerGroupWork!.receipts.at(-1)!.response);assert.deepEqual(stopped.answerGroupWork!.receipts.slice(0,f.w.receipts.length),f.w.receipts);
  assert.deepEqual(answerGroupProgress(stopped.answerGroupWork!),answerGroupProgress(f.w));assert.deepEqual(replayAnswerGroup(f.m,stopped.answerGroupWork!).draft,f.draft);
  assert.equal(prepareAnswerGroupLookupInspection(f.m,stopped.answerGroupWork!,f.draft),false);
 }finally{store.close();}
});
for(const outcome of ["cancel","malformed","block"]as const)test(`evidence inspection ${outcome} retains accepted observations and cannot rearm its one-pass recovery`,async()=>{
 const store=new ProjectStore(":memory:");try{const f=blockedInspectionFixture(store);prepareInspection(store,f);const controller=new AbortController();let calls=0;
  const stopped=await new DiscoveryService(store,{async analyze(_p,{context}){
   calls++;const stage=context.answerGroupLookupInspection!;assert.equal(stage.phase,"inspect");
   if(calls===1)return {answerGroupInspection:{recordID:stage.recordID!,note:"Accepted exact original, no approval",compareWithRecordIDs:[]}};
   if(outcome==="cancel")controller.abort(new DOMException("Stopped","AbortError"));
   return outcome==="malformed"?{answerGroupKeep:true}:outcome==="block"?{answerGroupBlocked:{reason:"Genuine human conflict remains in the detailed original"}}:{answerGroupInspection:{recordID:stage.recordID!,note:"Cancelled response",compareWithRecordIDs:[]}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id),signal:controller.signal});
  assert.equal(stopped.status,outcome==="cancel"?"cancelled":"failed");const saved=stopped.answerGroupWork!;
  assert.equal(saved.receipts.filter(r=>"answerGroupInspection"in r.response).length,1);assert.deepEqual(saved.receipts.slice(0,f.w.receipts.length),f.w.receipts);
  assert.equal(saved.attempts,f.w.attempts+calls);assert.equal(saved.automation!.requests,f.w.automation!.requests+calls);assert.deepEqual(answerGroupProgress(saved),answerGroupProgress(f.w));
  assert.equal(prepareAnswerGroupLookupInspection(f.m,saved,f.draft),false);assert.deepEqual(replayAnswerGroup(f.m,saved).draft,f.draft);
  if(outcome==="cancel"){
   let resumed=0;const next=await new DiscoveryService(store,{async analyze(_p,{context}){const stage=context.answerGroupLookupInspection;
    if(stage?.phase==="inspect"){resumed++;assert.notEqual(stage.recordID,f.missing[0]);return {answerGroupInspection:{recordID:stage.recordID!,note:"Remaining exact original",compareWithRecordIDs:[]}};}
    if(stage)return {answerGroupComparisons:{groups:stage.recordIDs.map(id=>[id]),reason:"All inspected originals remain scheduled with every counterpart"}};
    return context.manifest.answerGroupStage!.phase==="read"?{answerGroupKeep:true}:{answerGroupCheck:{valid:true,reason:"Exact supplied evidence agrees"}};
   }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
   assert.equal(next.status,"completed",next.diagnostic);assert.equal(resumed,f.missing.length-1);assert.deepEqual(next.answerGroupWork!.receipts.slice(0,saved.receipts.length),saved.receipts);
  }
 }finally{store.close();}
});
test("53 to 54 preserves the blocked cohort; partial inspections and grouped plans survive reopen/portable adoption, downgrade rejection, tampering and future-format rollback",()=>{
 const root=resolve(".reqwizit-state/tests");mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,"lookup-inspection-")),path=join(dir,"state.sqlite");let store=new ProjectStore(path);
 try{const f=blockedInspectionFixture(store),original=store.getJob(f.job.id);store.close();let db=new Database(path);db.exec("DELETE FROM migration_history WHERE version>=54; PRAGMA user_version=53");db.close();
  for(let i=0;i<2;i++){store=new ProjectStore(path);assert.deepEqual(store.getJob(f.job.id),original);store.close();}store=new ProjectStore(path);
  const work=prepareInspection(store,f),job=store.beginJob(f.p.id,f.p.revision).job;store.claimJob(job.id,Date.now()+60000);let context=boundAnswerGroupEvidence(f.m,work,f.draft);
  work.attempts++;work.automation!.requests++;acceptAnswerGroup(f.m,work,f.draft,{answerGroupInspection:{recordID:context.answerGroupLookupInspection!.recordID!,note:"Retained paid inspection, no verdict",compareWithRecordIDs:[]}},job);
  context=boundAnswerGroupEvidence(f.m,work,f.draft);store.checkpointAnswerGroup(job.id,work,context.manifest);store.failJob(job.id,"interrupted","Inspection paused before next original");
  for(const s of f.items){s.jobID=job.id;store.saveSubmission(s);}const saved=store.getJob(job.id);store.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(job.id),saved);
  const bad=structuredClone(work);bad.lookupInspections![0]!.draftKey="0".repeat(64);assert.throws(()=>replayAnswerGroup(f.m,bad));
  const files=renderWorkspace(f.p,undefined,continuationState(f.p,store.jobs(f.p.id),store.submissions(f.p.id),rev=>store.get(f.p.id,rev)));
  assert.equal(JSON.parse(files["state.json"]!).formatVersion,28);assert.doesNotThrow(()=>decodePortable(files,f.p.model));assert.throws(()=>decodePortable({...files,"state.json":JSON.stringify({...JSON.parse(files["state.json"]!),formatVersion:27})},f.p.model),/format 28/);
  const folder=join(dir,"clone");for(const[name,value]of Object.entries(files)){const file=join(folder,".reqwizit",name);mkdirSync(resolve(file,".."),{recursive:true});writeFileSync(file,value);}
  const clone=new ProjectStore(":memory:");try{const project=clone.openWorkspace(folder,f.p.model),retained=clone.getJob(job.id).answerGroupWork!,material=answerGroupMaterials(project,retained.submissionIDs.map(id=>clone.submissions(project.id).find(s=>s.id===id)!));
   assert.deepEqual(replayAnswerGroup(material,retained).draft,f.draft);assert.deepEqual(boundAnswerGroupEvidence(material,retained,f.draft).data,context.data);assert.equal(clone.workflow(project.id).paused,true);
  }finally{clone.close();}
  const grouped=structuredClone(work),next=store.beginJob(f.p.id,f.p.revision).job;store.claimJob(next.id,Date.now()+60000);
  for(;;){const packet=boundAnswerGroupEvidence(f.m,grouped,f.draft),stage=packet.answerGroupLookupInspection!;if(stage.phase==="plan")break;
   grouped.attempts++;grouped.automation!.requests++;acceptAnswerGroup(f.m,grouped,f.draft,{answerGroupInspection:{recordID:stage.recordID!,note:"Retained remaining evidence-only original",compareWithRecordIDs:[]}},next);
  }
  grouped.attempts++;grouped.automation!.requests++;acceptAnswerGroup(f.m,grouped,f.draft,{answerGroupComparisons:{groups:[f.missing.slice(0,2),...f.missing.slice(2).map(id=>[id])],reason:"Preserved exact joint pair and all remaining originals"}},next);
  const groupedContext=boundAnswerGroupEvidence(f.m,grouped,f.draft);store.checkpointAnswerGroup(next.id,grouped,groupedContext.manifest);store.failJob(next.id,"interrupted","Grouped exact comparison paused before dispatch");
  for(const s of f.items){s.jobID=next.id;store.saveSubmission(s);}store.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(next.id).answerGroupWork,grouped);
  const groupedFiles=renderWorkspace(f.p,undefined,continuationState(f.p,store.jobs(f.p.id),store.submissions(f.p.id),rev=>store.get(f.p.id,rev)));assert.doesNotThrow(()=>decodePortable(groupedFiles,f.p.model));
  for(const[name,value]of Object.entries(groupedFiles))writeFileSync(join(folder,".reqwizit",name),value);
  const groupedClone=new ProjectStore(":memory:");try{const project=groupedClone.openWorkspace(folder,f.p.model),retained=groupedClone.getJob(next.id).answerGroupWork!,material=answerGroupMaterials(project,retained.submissionIDs.map(id=>groupedClone.submissions(project.id).find(s=>s.id===id)!));assert.deepEqual(replayAnswerGroup(material,retained).draft,f.draft);assert.deepEqual(boundAnswerGroupEvidence(material,retained,f.draft).data,groupedContext.data);}finally{groupedClone.close();}
  store.close();db=new Database(path);const future=structuredClone(saved);future.answerGroupWork!.lookupInspections![0]!.format=2 as never;db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future),saved.id);db.exec("DELETE FROM migration_history WHERE version>=54; PRAGMA user_version=53");db.close();
  assert.throws(()=>new ProjectStore(path));db=new Database(path);assert.equal(db.pragma("user_version",{simple:true}),53);db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved),saved.id);db.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(job.id),saved);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test("v10 pools exact literal phrases without splitting a non-pinned joint set, changing evidence, or refunding the saved prefix",async()=>{
 const store=new ProjectStore(":memory:");try{
  const f=fixture(store,true,true),work=structuredClone(f.w);
  assert.throws(()=>planAnswerGroupEvidencePages(f.m,work,f.draft,9),/safe dispatch bound/);
  const context=boundAnswerGroupEvidence(f.m,work,f.draft);assert.equal(context.answerGroupPagingAdvice!.format,10);assert.ok(context.manifest.characters<=96000);
  const lookup=f.w.receipts.at(-1)!.response;assert.ok("answerGroupEvidence"in lookup);
  assert.ok([...lookup.answerGroupEvidence.recordIDs,...lookup.answerGroupEvidence.withRecordIDs!].every(id=>context.manifest.includedIDs.includes(id)));
  const decoded=expand(context.data);assert.deepEqual(decoded.draft,f.draft);
  for(const field of ["sources","questions","requirements","research"]as const)for(const record of decoded[field])assert.deepEqual(record,f.p[field].find(r=>r.id===record.id));
  assert.deepEqual(work.receipts,f.w.receipts);assert.equal(work.attempts,f.w.attempts);assert.equal(work.automation!.requests,f.w.automation!.requests);
  assert.deepEqual(replayAnswerGroup(f.m,work).draft,f.draft);
  let checks=0;
  const done=await new DiscoveryService(store,{async analyze(_p,{context:packet}){assert.equal(packet.answerGroupLookupReview,undefined);assert.ok(packet.manifest.characters<=96000);
   if(packet.manifest.answerGroupStage!.phase==="read")return {answerGroupKeep:true};checks++;return {answerGroupCheck:{valid:true,reason:"Every exact supplied original agrees with the retained draft"}};
  }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
  assert.equal(done.status,"completed",done.diagnostic);assert.ok(checks>=f.w.batches.length);assert.deepEqual(done.answerGroupWork!.receipts.slice(0,f.w.receipts.length),f.w.receipts);
 }finally{store.close();}
});
test("51 to 52 preserves old joint work; v10 layout and paid hashes survive reopen, portable cloning and future-format rollback",()=>{
 const root=resolve(".reqwizit-state/tests");mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,"joint-v10-")),path=join(dir,"state.sqlite");let store=new ProjectStore(path);
 try{
  const f=fixture(store,true,true),original=store.getJob(f.job.id);store.close();let db=new Database(path);db.exec("DELETE FROM migration_history WHERE version>=52; PRAGMA user_version=51");db.close();
  for(let i=0;i<2;i++){store=new ProjectStore(path);assert.deepEqual(store.getJob(f.job.id),original);store.close();}store=new ProjectStore(path);
  const work=structuredClone(f.w),context=boundAnswerGroupEvidence(f.m,work,f.draft);assert.equal(context.answerGroupPagingAdvice!.format,10);
  const job=store.beginJob(f.p.id,f.p.revision).job;store.claimJob(job.id,Date.now()+60000);store.checkpointAnswerGroup(job.id,work,context.manifest);store.failJob(job.id,"interrupted","Joint v10 saved before dispatch");
  const saved=store.getJob(job.id);for(const s of f.items){s.jobID=job.id;store.saveSubmission(s);}store.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(job.id),saved);
  const files=renderWorkspace(f.p,undefined,continuationState(f.p,store.jobs(f.p.id),store.submissions(f.p.id),rev=>store.get(f.p.id,rev)));assert.equal(JSON.parse(files["state.json"]!).formatVersion,26);
  assert.doesNotThrow(()=>decodePortable(files,f.p.model));assert.throws(()=>decodePortable({...files,"state.json":JSON.stringify({...JSON.parse(files["state.json"]!),formatVersion:25})},f.p.model),/format 26/);
  const folder=join(dir,"clone");for(const[name,value]of Object.entries(files)){const file=join(folder,".reqwizit",name);mkdirSync(resolve(file,".."),{recursive:true});writeFileSync(file,value);}
  const clone=new ProjectStore(":memory:");try{const project=clone.openWorkspace(folder,f.p.model),retained=clone.getJob(saved.id).answerGroupWork!;
   const material=answerGroupMaterials(project,retained.submissionIDs.map(id=>clone.submissions(project.id).find(s=>s.id===id)!));
   assert.deepEqual(replayAnswerGroup(material,retained).draft,f.draft);assert.deepEqual(boundAnswerGroupEvidence(material,retained,f.draft).data,context.data);assert.equal(clone.workflow(project.id).paused,true);
  }finally{clone.close();}
  store.close();db=new Database(path);const future=structuredClone(saved);future.answerGroupWork!.evidencePages!.at(-1)!.format=14 as never;
  db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future),saved.id);db.exec("DELETE FROM migration_history WHERE version>=52; PRAGMA user_version=51");db.close();
  assert.throws(()=>new ProjectStore(path));db=new Database(path);assert.equal(db.pragma("user_version",{simple:true}),51);db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved),saved.id);db.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(saved.id),saved);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
for(const nonPinned of [false,true])test(`${nonPinned?"52 to 53":"50 to 51"} preserves the old lookup; pending and resolved clarification survive reopen/portable adoption and reject tampering, downgrade and future formats`,()=>{
 const root=resolve(".reqwizit-state/tests");mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,"lookup-review-")),path=join(dir,"state.sqlite");let store=new ProjectStore(path);
 try{
   const source=nonPinned?52:50,format=nonPinned?27:25;
   const f=fixture(store,nonPinned),original=store.getJob(f.job.id);store.close();let db=new Database(path);db.exec(`DELETE FROM migration_history WHERE version>=${source+1}; PRAGMA user_version=${source}`);db.close();
  for(let i=0;i<2;i++){store=new ProjectStore(path);assert.deepEqual(store.getJob(f.job.id),original);store.close();}store=new ProjectStore(path);
  const work=structuredClone(f.w),context=boundAnswerGroupEvidence(f.m,work,f.draft),job=store.beginJob(f.p.id,f.p.revision).job;store.claimJob(job.id,Date.now()+60000);store.checkpointAnswerGroup(job.id,work,context.manifest);store.failJob(job.id,"interrupted","Lookup clarification saved before dispatch");
  const saved=store.getJob(job.id);for(const s of f.items){s.jobID=job.id;store.saveSubmission(s);}store.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(job.id),saved);
  const bad=structuredClone(work);bad.lookupReviews![0]!.prefixKey="0".repeat(64);assert.throws(()=>replayAnswerGroup(f.m,bad));
  const files=renderWorkspace(f.p,undefined,continuationState(f.p,store.jobs(f.p.id),store.submissions(f.p.id),rev=>store.get(f.p.id,rev)));
   assert.equal(JSON.parse(files["state.json"]!).formatVersion,format);assert.doesNotThrow(()=>decodePortable(files,f.p.model));
   assert.throws(()=>decodePortable({...files,"state.json":JSON.stringify({...JSON.parse(files["state.json"]!),formatVersion:format-1})},f.p.model),new RegExp(`format ${format}`));
  const folder=join(dir,"clone");for(const[name,value]of Object.entries(files)){const file=join(folder,".reqwizit",name);mkdirSync(resolve(file,".."),{recursive:true});writeFileSync(file,value);}
  const clone=new ProjectStore(":memory:");try{const project=clone.openWorkspace(folder,f.p.model),retained=clone.getJob(saved.id).answerGroupWork!;
   const material=answerGroupMaterials(project,retained.submissionIDs.map(id=>clone.submissions(project.id).find(s=>s.id===id)!));
   assert.deepEqual(replayAnswerGroup(material,retained).draft,f.draft);assert.ok(boundAnswerGroupEvidence(material,retained,f.draft).answerGroupLookupReview);
   assert.equal(clone.workflow(project.id).paused,true);
  }finally{clone.close();}
  const resolved=structuredClone(work),next=store.beginJob(f.p.id,f.p.revision).job;store.claimJob(next.id,Date.now()+60000);
  resolved.attempts++;resolved.automation!.requests++;acceptAnswerGroup(f.m,resolved,f.draft,{answerGroupLoadPlan:{separateOriginalUnits:true,reason:"Separate retrieval alongside every pinned answer"}},next);
  store.checkpointAnswerGroup(next.id,resolved,context.manifest);store.failJob(next.id,"interrupted","Clarification accepted before next read");
  for(const s of f.items){s.jobID=next.id;store.saveSubmission(s);}
  const resolvedFiles=renderWorkspace(f.p,undefined,continuationState(f.p,store.jobs(f.p.id),store.submissions(f.p.id),rev=>store.get(f.p.id,rev)));
   const projected=decodePortable(resolvedFiles,f.p.model).continuation.jobs.find(j=>j.id===next.id)!.answerGroupWork!;
   assert.deepEqual(replayAnswerGroup(f.m,projected).draft,f.draft);assert.equal(boundAnswerGroupEvidence(f.m,projected,f.draft).answerGroupLookupReview,undefined);
   if(nonPinned){const lookup=f.w.receipts.at(-1)!.response;assert.ok("answerGroupEvidence"in lookup);const packet=boundAnswerGroupEvidence(f.m,projected,f.draft);assert.ok(lookup.answerGroupEvidence.withRecordIDs!.every(id=>packet.manifest.includedIDs.includes(id)));}
   for(const[name,value]of Object.entries(resolvedFiles))writeFileSync(join(folder,".reqwizit",name),value);
   const resolvedClone=new ProjectStore(":memory:");try{const project=resolvedClone.openWorkspace(folder,f.p.model),retained=resolvedClone.getJob(next.id).answerGroupWork!,material=answerGroupMaterials(project,retained.submissionIDs.map(id=>resolvedClone.submissions(project.id).find(s=>s.id===id)!));assert.deepEqual(replayAnswerGroup(material,retained).draft,f.draft);assert.equal(boundAnswerGroupEvidence(material,retained,f.draft).answerGroupLookupReview,undefined);}finally{resolvedClone.close();}
   store.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(next.id).answerGroupWork,resolved);
   store.close();db=new Database(path);const future=structuredClone(saved);(future.answerGroupWork!.lookupReviews![0]as{format:number}).format=3;db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future),saved.id);db.exec(`DELETE FROM migration_history WHERE version>=${source+1}; PRAGMA user_version=${source}`);db.close();
   assert.throws(()=>new ProjectStore(path));db=new Database(path);assert.equal(db.pragma("user_version",{simple:true}),source);db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved),saved.id);db.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(saved.id),saved);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
