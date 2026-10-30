import { definitionPartitionFixtures } from "../src/core/definition-partition-fixtures.js";
import { evaluateDefinitionPartitions } from "../src/core/definition-partition-evaluation.js";

// No app startup, database, provider, credentials or network access.
const report = evaluateDefinitionPartitions(definitionPartitionFixtures());
console.log(JSON.stringify(report, null, 2));
if (report.candidates.some((c) => c.policy.includes("control") && (c.counterexamples.length || c.unavailableCases.length))) process.exitCode = 1;
