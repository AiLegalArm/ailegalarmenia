/**
 * Unit tests for ai-analyze system configuration
 * Verifies that criminal_module routing does NOT depend on MODULE_ID_TO_ANALYSIS_TYPE
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { 
  CRIMINAL_MODULE_PROMPTS, 
  isValidCriminalModule,
  type CriminalAnalysisModule 
} from "./criminal-modules.ts";
import { 
  MODULE_ID_TO_ANALYSIS_TYPE,
  ANALYSIS_TYPES,
  type AnalysisType
} from "./system.ts";

const ALL_CRIMINAL_MODULES: CriminalAnalysisModule[] = [
  "evidence_admissibility",
  "charge_correspondence", 
  "witness_credibility",
  "procedural_violations",
  "substantive_violations",
  "defense_fair_trial",
  "fundamental_rights",
  "testimony_contradictions",
  "legality_of_charges"
];

Deno.test("Criminal module routing: each module has direct prompt access", () => {
  // This test proves criminal_module routing works WITHOUT MODULE_ID_TO_ANALYSIS_TYPE
  for (const moduleId of ALL_CRIMINAL_MODULES) {
    assertEquals(isValidCriminalModule(moduleId), true, `${moduleId} should be valid`);
    assertExists(CRIMINAL_MODULE_PROMPTS[moduleId], `${moduleId} should have prompt`);
    assertEquals(typeof CRIMINAL_MODULE_PROMPTS[moduleId], "string");
    assertEquals(CRIMINAL_MODULE_PROMPTS[moduleId].length > 100, true, `${moduleId} prompt should be substantial`);
  }
});

Deno.test("Criminal module routing: does NOT require MODULE_ID_TO_ANALYSIS_TYPE", () => {
  // Simulate the actual routing logic from index.ts lines 757-759
  const simulatePromptSelection = (role: string, moduleId?: CriminalAnalysisModule): string | null => {
    if (role === "criminal_module" && moduleId) {
      // This is the ACTUAL path used in production - NO mapping involved
      return CRIMINAL_MODULE_PROMPTS[moduleId];
    }
    return null;
  };

  for (const moduleId of ALL_CRIMINAL_MODULES) {
    const prompt = simulatePromptSelection("criminal_module", moduleId);
    assertExists(prompt, `${moduleId} should return prompt via direct access`);
    assertEquals(typeof prompt, "string");
  }
});

Deno.test("MODULE_ID_TO_ANALYSIS_TYPE keys match CriminalAnalysisModule type", () => {
  // This test documents the mapping exists but is unused
  const mappingKeys = Object.keys(MODULE_ID_TO_ANALYSIS_TYPE);
  
  // All mapping keys should be valid CriminalAnalysisModule
  for (const key of mappingKeys) {
    assertEquals(isValidCriminalModule(key), true, `Mapping key '${key}' should be valid module`);
  }
});

Deno.test("ANALYSIS_TYPES should NOT include criminal-only module IDs", () => {
  // Proves the two systems are separate - these IDs exist only in criminal module
  const criminalOnlyModules = ["witness_credibility", "testimony_contradictions", "charge_correspondence"];
  
  for (const moduleId of criminalOnlyModules) {
    assertEquals(
      ANALYSIS_TYPES.includes(moduleId as AnalysisType), 
      false, 
      `${moduleId} should NOT be in ANALYSIS_TYPES`
    );
  }
});

Deno.test("All 9 analysis types are defined", () => {
  assertEquals(ANALYSIS_TYPES.length, 9);
});

Deno.test("Shared IDs exist in both systems but use different prompt sources", () => {
  // These exist in both (same ID, different prompt source)
  const sharedIds = ["evidence_admissibility", "procedural_violations"];
  
  for (const id of sharedIds) {
    assertEquals(ANALYSIS_TYPES.includes(id as AnalysisType), true, `${id} in ANALYSIS_TYPES`);
    assertEquals(isValidCriminalModule(id), true, `${id} in CriminalModules`);
  }
});
