import assert from "node:assert/strict";
import test from "node:test";
import type {ContextPack} from "../core/context.js";
import {ProjectStore} from "../storage/store.js";
import {assertJointInputAdmission,needsJointInputAdmission,JointInputCapacityError} from "./input-capacity.js";
import {OpenCodeDiscovery,discoveryPrompt} from "./discovery.js";
import {ConnectedDiscovery} from "../providers/discovery.js";

const selected={providerID:"openai",modelID:"fixture"};
const model={providerID:"openai",id:"fixture",modelID:"fixture",enabled:true,limit:{context:628000,input:500000,output:128000}};
function fixture(text="x".repeat(120000)){
 const store=new ProjectStore(":memory:"),project=store.create("Capacity fixture","Exact original evidence",selected);store.close();
 const data={text},context:ContextPack={data,manifest:{revision:project.revision,focusEpicID:"project",characters:JSON.stringify(data).length,budget:200000,includedIDs:[],omittedIDs:[],epicIDs:["project"],partial:true,
  answerGroupStage:{policy:"exact-answer-group-v1",planKey:"a".repeat(64),step:0,phase:"read"}},
  answerGroupPagingAdvice:{scheduledIDs:[],format:11,number:1,total:1},answerGroupInputCapacity:{format:1,characters:200000,normalCharacters:96000,model:{providerID:"openai",modelID:"fixture"}}};
 return {project,context,prompt:discoveryPrompt(project,context,false)};
}
test("joint admission measures the whole app prompt, reserves full advertised output and runtime headroom, and never calls bytes tokens",()=>{
 const f=fixture(),result=assertJointInputAdmission(f.project,f.context,f.prompt,[{...model,headers:{authorization:"never-project"}}])!;
 assert.equal(result.promptBytes,Buffer.byteLength(f.prompt,"utf8"));assert.equal(result.outputReserve,128000);assert.equal(result.runtimeHeadroom,32768);
 assert.equal(result.inputBudget,400000);assert.equal(result.contextBudget,502400);assert.ok(!JSON.stringify(result).includes("never-project"));
 assert.ok(result.promptBytes>f.context.manifest.characters,"Schema/instructions outside the evidence count are included");
});
test("Unicode bytes and large prompt/schema overhead can reject an otherwise fitting evidence character count",()=>{
 const unicode=fixture("界".repeat(120000));assert.ok(unicode.context.manifest.characters<200000);
 assert.throws(()=>assertJointInputAdmission(unicode.project,unicode.context,unicode.prompt,[model]),JointInputCapacityError);
 const f=fixture();assert.throws(()=>assertJointInputAdmission(f.project,f.context,"z".repeat(300000)+f.prompt,[model]),/complete prompt/);
 assert.throws(()=>assertJointInputAdmission(f.project,f.context,"tiny replacement",[model]),/complete exact evidence/);
});
test("unknown/disabled/mismatched/inconsistent capacities and smaller input/context budgets fail closed",()=>{
 const f=fixture();
 for(const models of [undefined,[],[model,model],[{...model,enabled:false}],[{...model,modelID:"other"}],[{...model,providerID:"other"}],
  [{...model,limit:{context:Number.MAX_SAFE_INTEGER+1,output:128000}}],
  [{...model,limit:{context:628000,output:128000,input:0}}],[{...model,limit:{context:128000,output:128000}}],
  [{...model,limit:{context:628000,output:128000,input:700000}}],[{...model,limit:{context:628000,output:128000,input:100000}}],
  [{...model,limit:{context:250000,output:128000}}]])assert.throws(()=>assertJointInputAdmission(f.project,f.context,f.prompt,models),JointInputCapacityError);
 assert.ok(assertJointInputAdmission(f.project,f.context,f.prompt,[{...model,limit:{context:628000,output:128000}}]));
});
test("malformed joint profiles, direct selections and forged character counts cannot bypass admission; ordinary packets retain existing behavior",()=>{
 const f=fixture();for(const change of [(c:ContextPack)=>delete c.answerGroupInputCapacity,(c:ContextPack)=>{c.manifest.characters=12;},
  (c:ContextPack)=>{c.answerGroupPagingAdvice!.format=9;},(c:ContextPack)=>{c.manifest.budget=256000;},(c:ContextPack)=>{c.answerGroupLookupInspection={phase:"plan",recordID:null,recordIDs:[]};}]){
   const context=structuredClone(f.context);change(context);assert.throws(()=>assertJointInputAdmission(f.project,context,f.prompt,[model]),JointInputCapacityError);
  }
 const direct=structuredClone(f.project);direct.model.connectionID="direct";assert.throws(()=>assertJointInputAdmission(direct,f.context,f.prompt,[model]),JointInputCapacityError);
 const ordinary=structuredClone(f.context);ordinary.data={text:"small"};ordinary.manifest.characters=JSON.stringify(ordinary.data).length;ordinary.manifest.budget=96000;delete ordinary.answerGroupInputCapacity;ordinary.answerGroupPagingAdvice!.format=9;
 assert.equal(needsJointInputAdmission(ordinary),false);assert.equal(assertJointInputAdmission(f.project,ordinary,"ordinary",undefined),undefined);
});
test("complete repair admission requires its explicit v2 profile and rejects missing/mixed profiles and the 200k hard stop",()=>{
 const f=fixture();delete f.context.answerGroupPagingAdvice;f.context.manifest.answerGroupStage!.phase="repair";
 f.context.answerGroupInputCapacity!.repairFormat=2;f.prompt=discoveryPrompt(f.project,f.context,false);
 assert.ok(assertJointInputAdmission(f.project,f.context,f.prompt,[model]));
 for(const change of [(c:ContextPack)=>{delete c.answerGroupInputCapacity!.repairFormat;},
   (c:ContextPack)=>{c.manifest.answerGroupStage!.phase="check";},
   (c:ContextPack)=>{c.answerGroupPagingAdvice={scheduledIDs:[],format:11,number:1,total:1};},
   (c:ContextPack)=>{c.data={text:"z".repeat(200001)};c.manifest.characters=JSON.stringify(c.data).length;}]){
   const context=structuredClone(f.context);change(context);assert.throws(()=>assertJointInputAdmission(f.project,context,discoveryPrompt(f.project,context,false),[model]),JointInputCapacityError);
 }
 assert.throws(()=>assertJointInputAdmission(f.project,f.context,f.prompt,[]),JointInputCapacityError);
 assert.throws(()=>assertJointInputAdmission(f.project,f.context,f.prompt,[{...model,limit:{context:128000,input:100000,output:32000}}]),JointInputCapacityError);
});
for(const phase of ["read","check","repair"] as const)for(const accepted of [false,true])test(`OpenCode ${accepted?"admits":"rejects"} fresh ${phase} capacity before any session/prompt creation and closes only its owned runtime`,async()=>{
  const f=fixture(),calls:string[]=[];
  if(phase==="repair"){delete f.context.answerGroupPagingAdvice;f.context.manifest.answerGroupStage!.phase="repair";f.context.answerGroupInputCapacity!.repairFormat=2;}
  if(phase==="check"){f.context.answerGroupPagingAdvice!.format=12;f.context.manifest.answerGroupStage!.phase="check";}
 const bootstrap=async()=>({directory:"fixture",close:async()=>{calls.push("close");},client:{
  provider:{list:async()=>({data:{connected:["openai"],all:[{id:"openai",models:{fixture:{name:"Fixture"}}}]}})},
  native:{model:{list:async()=>{calls.push("capacity");return {data:accepted?[model]:[]};}}},
  session:{create:async()=>{calls.push("create");return {data:{id:"session"}};},prompt:async()=>{calls.push("prompt");return {data:{info:{providerID:"openai",modelID:"fixture"},parts:[{type:"text",text:"{}"}]}};}},
  event:{subscribe:async()=>({stream:(async function*(){})()})}
 }}) as never;
 const adapter=new OpenCodeDiscovery("fixture",bootstrap),options={context:f.context,signal:AbortSignal.timeout(5000),research:false,onSession:()=>{},onTelemetry:()=>{},onResearch:()=>{},onProgress:()=>{}};
 if(accepted){assert.deepEqual(await adapter.analyze(f.project,options),{});assert.deepEqual(calls,["capacity","create","prompt","close"]);}
 else{await assert.rejects(adapter.analyze(f.project,options),JointInputCapacityError);assert.deepEqual(calls,["capacity","close"]);}
});
test("direct large requests reject before account/credential access and cannot fall back to OpenCode",()=>{
 const f=fixture();f.project.model.connectionID="direct";
 const adapter=new ConnectedDiscovery({withAccount(){assert.fail("No account access");}}as never,{async analyze(){assert.fail("No fallback");}});
 assert.throws(()=>adapter.analyze(f.project,{context:f.context,signal:AbortSignal.timeout(1000),research:false,onSession:()=>{},onTelemetry:()=>{},onResearch:()=>{},onProgress:()=>{}}),JointInputCapacityError);
});
test("cancellation during fresh capacity lookup cannot create a session or dispatch a prompt",async()=>{
 const f=fixture(),controller=new AbortController(),calls:string[]=[];
 const bootstrap=async()=>({directory:"fixture",close:async()=>{calls.push("close");},client:{
  provider:{list:async()=>({data:{connected:["openai"],all:[{id:"openai",models:{fixture:{name:"Fixture"}}}]}})},
  native:{model:{list:async()=>{calls.push("capacity");controller.abort(new Error("Capacity lookup cancelled"));return {data:[model]};}}},
  session:{create:async()=>{assert.fail("No session creation after cancellation");}}
 }}) as never;
 await assert.rejects(new OpenCodeDiscovery("fixture",bootstrap).analyze(f.project,{context:f.context,signal:controller.signal,research:false,onSession:()=>{},onTelemetry:()=>{},onResearch:()=>{},onProgress:()=>{}}),/Capacity lookup cancelled/);
 assert.deepEqual(calls,["capacity","close"]);
});
