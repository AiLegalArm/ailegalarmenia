// =============================================================================
// DOCUMENT PROMPTS - AGGREGATED INDEX
// =============================================================================

import { generalPrompts } from "./general.ts";
import { civilPrompts } from "./civil.ts";
import { criminalPrompts } from "./criminal.ts";
import { administrativePrompts } from "./administrative.ts";
import { echrPrompts } from "./echr.ts";
import { fallbackPrompts } from "./fallback.ts";

export const DOCUMENT_PROMPTS: Record<string, string> = {
  ...generalPrompts,
  ...civilPrompts,
  ...criminalPrompts,
  ...administrativePrompts,
  ...echrPrompts,
  ...fallbackPrompts,
};

export {
  generalPrompts,
  civilPrompts,
  criminalPrompts,
  administrativePrompts,
  echrPrompts,
  fallbackPrompts,
};
