// scripts/fate-dice-roller.js
// Wrapper around the original World of Darkness DiceRoller
// to inject Fate dice when the user opted to "Use Fate" for a roll.
//
// Strategy:
//  1) Import the system's roll-dice module and grab its DiceRoller export.
//  2) Wrap DiceRoller with our logic that consults fateState for the actor.
//  3) If anything fails, fall back to the original DiceRoller.

import { isFateEnabled } from "./settings.js";
import { fateState } from "./fate-state.js";

console.log("Fate DiceRoller | Loading module");

const POSSIBLE_PATHS = [
  "/systems/worldofdarkness/module/scripts/roll-dice.js",
  "/systems/worldofdarkness/module/scripts/roll-dice.mjs",
  "/systems/worldofdarkness/module/scripts/roll-dice.min.js",
  "/systems/worldofdarkness/module/scripts/roll-dice.min.mjs"
];

let OriginalDiceRoller = null;

/**
 * Convert any value to a non-negative integer (for dice counts).
 */
function toInt(value) {
  if (Number.isFinite(value)) return Math.max(0, value | 0);
  const parsed = parseInt(value ?? 0, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed | 0);
}

/**
 * Build the patched DiceRoller that adds Fate dice when requested.
 */
function makePatchedDiceRoller(originalFn) {
  return async function PatchedDiceRoller(diceRoll) {
    try {
      const actor = diceRoll?.actor;
      if (!actor) {
        console.warn("Fate DiceRoller | No actor on diceRoll, delegating to original");
        return originalFn(diceRoll);
      }

      // Skip damage rolls entirely.
      if (diceRoll.origin === "damage") {
        return originalFn(diceRoll);
      }

      // Skip if this is some special Fate-only roll already handled elsewhere.
      if (diceRoll.isFate === true) {
        return originalFn(diceRoll);
      }

      const system = actor.system ?? actor.data?.data ?? {};
      const fate = system.fate;

      // If Fate is disabled in settings or the actor has no Fate block, just delegate.
      if (!isFateEnabled() || !fate) {
        return originalFn(diceRoll);
      }

      // Base number of Fate dice taken from actor's Fate value.
      const baseFateDice = toInt(fate.value);

      // Read the transient UI state for this actor (set by hooks.js).
      const state = fateState.consume(actor.id) || { useFate: false, fateDice: baseFateDice };

      // Also honour diceRoll.useFate if some future integration decides to set it.
      const useFate = !!state.useFate || !!diceRoll.useFate;

      if (!useFate) {
        // User didn't request Fate for this roll.
        return originalFn(diceRoll);
      }

      // Number of Fate dice to add: prefer state.fateDice, then actor's Fate value.
      const fateDiceToAdd = toInt(state.fateDice ?? baseFateDice);

      if (!fateDiceToAdd) {
        console.warn("Fate DiceRoller | useFate=true but fateDiceToAdd is 0, delegating to original");
        return originalFn(diceRoll);
      }

      // Ensure numDices is numeric.
      const baseDice = toInt(diceRoll.numDices);
      const newTotal = baseDice + fateDiceToAdd;

      console.log("Fate DiceRoller | applying Fate", {
        actor: actor.name,
        origin: diceRoll.origin,
        baseDice,
        fateDiceToAdd,
        newTotal
      });

      diceRoll.numDices = newTotal;

      // Annotate the roll so that chat rendering / other code can detect Fate usage.
      diceRoll.useFate = true;
      diceRoll._wodru_usedFate = {
        amount: fateDiceToAdd,
        actorId: actor.id
      };

      // NOTE: здесь мы пока не трогаем actor.system.fate.used — т.е. расходование ресурса
      // и заполнение квадратиков Судьбы можно сделать отдельно в другой логике
      // (например, обработкой результата броска или через отдельный хук).

      return originalFn(diceRoll);
    } catch (err) {
      console.error("Fate DiceRoller | Error in patched DiceRoller, delegating to original", err);
      return originalFn(diceRoll);
    }
  };
}

/**
 * Try to import the system's roll-dice module and locate DiceRoller.
 */
async function tryImportOriginal() {
  for (const path of POSSIBLE_PATHS) {
    try {
      const mod = await import(path);
      if (!mod) continue;

      if (typeof mod.DiceRoller === "function") {
        console.log(`Fate DiceRoller | Found DiceRoller export in ${path}`);
        return { mod, fn: mod.DiceRoller };
      }

      if (typeof mod.default === "function") {
        console.log(`Fate DiceRoller | Found default DiceRoller export in ${path}`);
        return { mod, fn: mod.default };
      }
    } catch (err) {
      // Ignore and try next path.
    }
  }

  return null;
}

/**
 * Install the patched DiceRoller, exposing both original and patched
 * in a few convenient locations.
 */
function installPatchWithOriginal(originalFn, sourceModule = null) {
  if (!originalFn || typeof originalFn !== "function") {
    console.warn("Fate DiceRoller | installPatch: no original DiceRoller function available");
    return false;
  }

  OriginalDiceRoller = originalFn;
  const patched = makePatchedDiceRoller(OriginalDiceRoller);

  // Try to mutate the source module if it is writable (may silently fail).
  if (sourceModule && typeof sourceModule === "object") {
    try {
      sourceModule.DiceRoller = patched;
      console.log("Fate DiceRoller | Replaced rollModule.DiceRoller (if writable).");
    } catch (_e) {
      // Ignore
    }

    try {
      if ("default" in sourceModule) {
        sourceModule.default = patched;
        console.log("Fate DiceRoller | Replaced rollModule.default (if writable).");
      }
    } catch (_e) {
      // Ignore
    }
  }

  // Expose patched DiceRoller on game.worldofdarkness for compatibility.
  if (!game.worldofdarkness) game.worldofdarkness = {};
  game.worldofdarkness.OriginalDiceRoller = OriginalDiceRoller;
  game.worldofdarkness.DiceRoller = patched;

  // Also expose on globalThis.
  try {
    globalThis.WOD20RU_OriginalDiceRoller = OriginalDiceRoller;
    globalThis.WOD20RU_DiceRoller = patched;
  } catch (_e) {
    // Ignore
  }

  console.log("Fate DiceRoller | DiceRoller successfully patched with Fate support.", {
    hasGameNamespace: !!game.worldofdarkness
  });
  return true;
}

// ---------------------------------------------------------------------------
// Entry point – try eager import, then fall back to ready hook.
// ---------------------------------------------------------------------------

(async () => {
  try {
    const result = await tryImportOriginal();

    if (result && result.fn) {
      installPatchWithOriginal(result.fn, result.mod);
      return;
    }

    console.warn("Fate DiceRoller | Could not import roll-dice module directly, will retry on ready hook.");
  } catch (err) {
    console.error("Fate DiceRoller | Error while trying to import roll-dice module", err);
  }

  // Fallback: wait for game ready and look for DiceRoller in known namespaces.
  Hooks.once("ready", () => {
    try {
      console.log("Fate DiceRoller | Trying to locate DiceRoller on ready fallback");

      let candidate = null;

      if (game.worldofdarkness?.DiceRoller) {
        candidate = game.worldofdarkness.DiceRoller;
      }

      if (!candidate && typeof globalThis.DiceRoller === "function") {
        candidate = globalThis.DiceRoller;
      }

      if (candidate) {
        installPatchWithOriginal(candidate, null);
        return;
      }

      (async () => {
        const retry = await tryImportOriginal();
        if (retry && retry.fn) {
          installPatchWithOriginal(retry.fn, retry.mod);
          return;
        }

        console.warn(
          "Fate DiceRoller | Could not locate original DiceRoller - Fate dice injection will be disabled until resolved."
        );
      })().catch((err) => {
        console.error("Fate DiceRoller | Error during DiceRoller patch retry", err);
      });
    } catch (err) {
      console.error("Fate DiceRoller | Error in ready fallback for DiceRoller patch", err);
    }
  });
})();

console.log("Fate DiceRoller | Module loaded");
