import type { IdentityLockRequirement, ProviderLaneName } from "@/lib/types";

/**
 * Three-lane router (section 7). Identity lock is detected at planning time
 * and drives lane selection — it cannot be discovered after the fact.
 */
export function selectModel(
  identityLockRequirement: IdentityLockRequirement,
): ProviderLaneName {
  switch (identityLockRequirement) {
    case "none":
      return "text-to-image"; // any cheap KIE text-to-image model
    case "single":
      return "ideogram-character"; // model "ideogram/character", 1 reference image
    case "multi":
      return "flux2-multi"; // KIE Flux 2, up to 8 reference images
  }
}
