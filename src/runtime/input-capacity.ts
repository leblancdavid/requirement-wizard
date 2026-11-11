import { z } from "zod";
import type { Project } from "../core/model.js";
import type { ContextPack } from "../core/context.js";

const nativeModel = z.object({ id:z.string(),modelID:z.string(),providerID:z.string(),enabled:z.literal(true),
  limit:z.object({context:z.number().int().positive().safe(),input:z.number().int().positive().safe().optional(),output:z.number().int().positive().safe()}) });
export class JointInputCapacityError extends Error {
  constructor(reason:string){super(`Joint evidence was not sent: ${reason} Original evidence, paid replies and spent usage remain saved. No model or route fallback was made.`);}
}
/** Separate from evidence characters: measures the COMPLETE generated app prompt.
 * UTF-8 bytes are a deliberately conservative text admission proxy for this
 * OpenAI text route, NOT a measured tokenizer count or live account guarantee. */
export function needsJointInputAdmission(context:ContextPack){
  return !!context.manifest.answerGroupStage&&(context.manifest.characters>96000||context.manifest.budget>96000
    ||JSON.stringify(context.data).length>96000||!!context.answerGroupInputCapacity);
}
export function assertJointInputAdmission(project:Project,context:ContextPack,prompt:string,models:unknown){
   if(!needsJointInputAdmission(context))return undefined;
   const policy=context.answerGroupInputCapacity;
   const phase=context.manifest.answerGroupStage?.phase;
   const pageFormat=context.answerGroupPagingAdvice?.format ?? 0;
   const paged=policy?.repairFormat===undefined&&([11,12].includes(pageFormat)&&(phase==="read"||phase==="check")||pageFormat===13&&phase==="check");
   const repair=policy?.repairFormat===2&&phase==="repair"&&!context.answerGroupPagingAdvice;
   if(!policy||policy.format!==1||policy.characters!==200000||policy.normalCharacters!==96000
     ||project.model.connectionID||project.model.providerID!=="openai"||policy.model.providerID!==project.model.providerID
     ||policy.model.modelID!==project.model.modelID||!paged&&!repair
     ||context.answerGroupLookupInspection||context.answerGroupLookupReview
     ||context.answerGroupBlockerReview)throw new JointInputCapacityError("this request has no matching guarded joint-comparison profile.");
  const characters=JSON.stringify(context.data).length;
  if(characters!==context.manifest.characters||characters>200000||context.manifest.budget!==200000)throw new JointInputCapacityError("the complete evidence exceeds or does not match its fixed 200,000-character ceiling.");
  if(!prompt.includes(JSON.stringify(context.data)))throw new JointInputCapacityError("the generated prompt does not contain the complete exact evidence packet.");
  if(!Array.isArray(models))throw new JointInputCapacityError("fresh selected-model capacity metadata is unavailable.");
  const found=models.filter(value=>value&&typeof value==="object"&&value.providerID===project.model.providerID&&value.id===project.model.modelID);
  const parsed=nativeModel.safeParse(found.length===1?found[0]:undefined);
  if(!parsed.success||parsed.data.modelID!==project.model.modelID)throw new JointInputCapacityError("fresh capacity metadata for the exact selected model is missing or invalid.");
  const limit=parsed.data.limit;
  if(limit.output>=limit.context||limit.input!==undefined&&limit.input>limit.context)throw new JointInputCapacityError("the selected model advertises inconsistent capacity limits.");
  const promptBytes=Buffer.byteLength(prompt,"utf8"),runtimeHeadroom=32768,outputReserve=limit.output;
  const inputLimit=limit.input??limit.context-limit.output;
  // Reserve the model's FULL output allowance (including reasoning), 32k of
  // runtime/framing headroom, and leave 20% of both advertised limits unused.
  const inputBudget=Math.floor(inputLimit*0.8),contextBudget=Math.floor(limit.context*0.8);
  if(promptBytes+runtimeHeadroom>inputBudget||promptBytes+runtimeHeadroom+outputReserve>contextBudget)
    throw new JointInputCapacityError(`the complete prompt (${promptBytes.toLocaleString("en-US")} UTF-8 bytes, not measured tokens) cannot fit the conservative selected-model input/context budgets with output and runtime reserves.`);
  return {promptBytes,runtimeHeadroom,outputReserve,inputBudget,contextBudget};
}
