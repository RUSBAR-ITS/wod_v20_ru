// scripts/fate-dice-roller.js
// Robust patcher for the World of Darkness DiceRoller to inject Fate dice
// when the user opted to "Use Fate" for the next roll (one-shot flag).
//
// Strategy:
// 1) Try several absolute import paths for the system module.
// 2) If import succeeds, wrap the found DiceRoller.
// 3) If import fails, wait for ready and try to find DiceRoller on game.worldofdarkness or window.
// 4) Expose the patched function on game.worldofdarkness.DiceRoller so callers that read it from there will use the patched one.

import { isFateEnabled } from "./settings.js";

const POSSIBLE_PATHS = [
  "/systems/worldofdarkness/module/scripts/roll-dice.js",
  "/systems/worldofdarkness/module/scripts/roll-dice.mjs",
  "/systems/worldofdarkness/module/scripts/roll-dice.min.js",
  "/systems/worldofdarkness/module/scripts/roll-dice.jsx",
  // fallback without leading slash (some hosts might still resolve it)
  "systems/worldofdarkness/module/scripts/roll-dice.js",
  "systems/worldofdarkness/module/scripts/roll-dice.mjs"
];

let OriginalDiceRoller = null;
let isPatched = false;

function makePatchedDiceRoller(originalFn) {
  // Keep originalFn reference
  return async function PatchedDiceRoller(diceRoll) {
    try {
      const actor = diceRoll?.actor;

      // If no actor - fallback to original
      if (!actor) return originalFn(diceRoll);

      // 1) Skip damage rolls
      if (diceRoll.origin === "damage") {
        return originalFn(diceRoll);
      }

      // 2) Skip pure Fate rolls
      if (diceRoll.isFate === true) {
        return originalFn(diceRoll);
      }

      // 3) Fate must be enabled and actor must have fate data
      const fateData = actor.system?.fate;
      if (!isFateEnabled() || !fateData) {
        return originalFn(diceRoll);
      }

      const fateValue = Number.isFinite(fateData.value)
        ? fateData.value
        : parseInt(fateData.value ?? 0, 10);

      if (!fateValue || fateValue <= 0) {
        return originalFn(diceRoll);
      }

      // 4) Check one-shot user flag
      const flag = await game.user.getFlag("wod_v20_ru", "useFateNextRoll").catch(() => null);
      const useFate = flag && flag.actorId === actor.id && flag.useFate === true;

      if (useFate) {
        // Ensure numDices is numeric
        const baseDice = Number.isFinite(diceRoll.numDices)
          ? diceRoll.numDices
          : parseInt(diceRoll.numDices ?? 0, 10) || 0;

        diceRoll.numDices = baseDice + fateValue;

        // Consume the one-shot flag so it only applies to a single roll
        await game.user.unsetFlag("wod_v20_ru", "useFateNextRoll").catch(() => null);

        // Optional: annotate the roll so chat renderer can show it (left for future)
        diceRoll._wodru_usedFate = {
          amount: fateValue,
          actorId: actor.id
        };
      }

      return originalFn(diceRoll);
    } catch (err) {
      console.error("WOD20-RU | PatchedDiceRoller error - falling back to original", err);
      return originalFn(diceRoll);
    }
  };
}

/** Try to import system module by list of paths */
async function tryImportOriginal() {
  for (const p of POSSIBLE_PATHS) {
    try {
      const mod = await import(p);
      if (mod) {
        const candidate =
          mod.DiceRoller || mod.default || mod?.DiceRoller?.default || null;
        if (typeof candidate === "function") {
          console.log(`WOD20-RU | Loaded DiceRoller from ${p}`);
          return { mod, original: candidate };
        } else {
          // If module loaded but no function found, still return the module for possible patching.
          return { mod, original: mod.DiceRoller || mod.default || null };
        }
      }
    } catch (e) {
      // ignore and try next path
      // console.debug("WOD20-RU | import failed for", p, e);
    }
  }
  return null;
}

/** Install patch when we have an original function reference */
function installPatchWithOriginal(originalFn, sourceModule = null) {
  if (!originalFn || typeof originalFn !== "function") {
    console.warn("WOD20-RU | installPatch: no original DiceRoller function available");
    return false;
  }

  OriginalDiceRoller = originalFn;
  const patched = makePatchedDiceRoller(OriginalDiceRoller);

  // Try to poke the source module (may fail - module namespace can be immutable)
  try {
    if (sourceModule && typeof sourceModule === "object") {
      try {
        // Some environments may allow assignment - try to set it
        sourceModule.DiceRoller = patched;
        console.log("WOD20-RU | Replaced rollModule.DiceRoller (if writable).");
      } catch (e) {
        // ignore - many browsers prevent this
      }
    }
  } catch (e) {
    // ignore
  }

  // Expose patched under game.worldofdarkness so other code that consults this will see patched version
  if (!game.worldofdarkness) game.worldofdarkness = {};
  game.worldofdarkness.OriginalDiceRoller = OriginalDiceRoller;
  game.worldofdarkness.DiceRoller = patched;

  // Also set it as a property on globalThis for maximum compatibility
  try {
    globalThis.WOD_RU_PatchedDiceRoller = patched;
  } catch (e) {
    // ignore
  }

  isPatched = true;
  console.log("WOD20-RU | DiceRoller patched successfully.");
  return true;
}

/** Main init flow */
(async () => {
  // Try immediate import first (this handles most servers / clients)
  const res = await tryImportOriginal();
  if (res && res.original) {
    installPatchWithOriginal(res.original, res.mod);
    return;
  }

  // If import did not yield a usable function, postpone until ready and try to discover existing references.
  Hooks.once("ready", async () => {
    try {
      // Common places where the system might have stored the function
      const candidates = [
        game.worldofdarkness?.DiceRoller,
        game.worldofdarkness?.OriginalDiceRoller,
        window?.DiceRoller,
        globalThis?.DiceRoller
      ];

      for (const cand of candidates) {
        if (typeof cand === "function") {
          console.log("WOD20-RU | Found existing DiceRoller on global candidate, installing patch.");
          installPatchWithOriginal(cand, null);
          return;
        }
      }

      // As a last resort, try import again but using absolute path only (retry)
      const retryPaths = [
        "/systems/worldofdarkness/module/scripts/roll-dice.js",
        "/systems/worldofdarkness/module/scripts/roll-dice.mjs"
      ];
      for (const p of retryPaths) {
        try {
          const mod = await import(p);
          const candidate = mod?.DiceRoller || mod?.default || null;
          if (typeof candidate === "function") {
            installPatchWithOriginal(candidate, mod);
            return;
          }
        } catch (e) {
          // ignore
        }
      }

      console.warn("WOD20-RU | Could not locate original DiceRoller - Fate dice injection will be disabled until resolved.");
    } catch (err) {
      console.error("WOD20-RU | Error during DiceRoller patch retry", err);
    }
  });
})();
