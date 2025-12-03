// scripts/fate-dice-roller.js
// Wrapper around the original World of Darkness DiceRoller
// to inject Fate dice when the user opted to "Use Fate" for a roll.
//
// New architecture:
// - This module ONLY defines the patching logic and exports initFateDiceRoller().
// - It does NOT automatically hook into Foundry; another module (fate-bootstrap.js)
//   is responsible for calling initFateDiceRoller() at the right time.
//
// Strategy:
//  1) Try to locate the system's DiceRoller:
//     - from game.worldofdarkness.DiceRoller,
//     - from globalThis.DiceRoller,
//     - or by importing the roll-dice module from known paths.
//  2) Wrap DiceRoller with our logic that consults fateState for the actor.
//  3) Expose both original and patched versions in convenient namespaces.
//  4) If anything fails, log the problem and leave DiceRoller unmodified.

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
 * @param {unknown} value
 * @returns {number}
 */
function toInt(value) {
  if (Number.isFinite(value)) {
    const n = value | 0;
    return n < 0 ? 0 : n;
  }

  const parsed = parseInt(value ?? 0, 10);
  if (Number.isNaN(parsed)) return 0;
  return parsed < 0 ? 0 : parsed;
}

/**
 * Build the patched DiceRoller that adds Fate dice when requested.
 * @param {(diceRoll: any) => any | Promise<any>} originalFn
 */
function makePatchedDiceRoller(originalFn) {
  return async function PatchedDiceRoller(diceRoll) {
    try {
      console.debug("Fate DiceRoller | PatchedDiceRoller invoked", {
        isFateEnabled: isFateEnabled(),
        hasActor: !!diceRoll?.actor,
        origin: diceRoll?.origin,
        isFateRoll: diceRoll?.isFate === true,
        numDices: diceRoll?.numDices
      });

      // If Fate feature is disabled globally, do not touch the roll.
      if (!isFateEnabled()) {
        return originalFn(diceRoll);
      }

      const actor = diceRoll?.actor;
      if (!actor) {
        console.warn(
          "Fate DiceRoller | No actor on diceRoll, delegating to original"
        );
        return originalFn(diceRoll);
      }

      // Skip damage rolls entirely — Fate is not applied to damage.
      if (diceRoll.origin === "damage") {
        console.debug(
          "Fate DiceRoller | Damage roll detected, skipping Fate injection"
        );
        return originalFn(diceRoll);
      }

      // Skip if this is a special pure Fate roll already handled elsewhere.
      if (diceRoll.isFate === true) {
        console.debug(
          "Fate DiceRoller | Pure Fate roll (isFate === true), no extra Fate dice applied"
        );
        return originalFn(diceRoll);
      }

      const system = actor.system ?? actor.data?.data ?? {};
      const fate = system.fate;

      if (!fate) {
        console.debug(
          "Fate DiceRoller | Actor has no system.fate block, delegating to original"
        );
        return originalFn(diceRoll);
      }

      const baseFateDice = toInt(fate.value);

      // Read the transient UI state for this actor (set by dialog patch).
      const state =
        fateState.consume(actor.id) ?? { useFate: false, fateDice: baseFateDice };

      // Also honour diceRoll.useFate if some future integration decides to set it.
      const useFate = !!state.useFate || !!diceRoll.useFate;

      console.debug("Fate DiceRoller | Fate state for this roll", {
        actorId: actor.id,
        actorName: actor.name,
        useFate,
        stateFateDice: state.fateDice,
        actorFateValue: fate.value,
        origin: diceRoll.origin
      });

      if (!useFate) {
        // User didn't request Fate for this roll.
        return originalFn(diceRoll);
      }

      // Number of Fate dice to add: prefer state.fateDice, then actor's Fate value.
      const fateDiceToAdd = toInt(state.fateDice ?? baseFateDice);

      if (!fateDiceToAdd) {
        console.warn(
          "Fate DiceRoller | useFate=true but fateDiceToAdd is 0, delegating to original"
        );
        return originalFn(diceRoll);
      }

      // Ensure numDices is numeric.
      const baseDice = toInt(diceRoll.numDices);
      const newTotal = baseDice + fateDiceToAdd;

      console.log("Fate DiceRoller | Applying Fate dice to roll", {
        actor: { id: actor.id, name: actor.name },
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

      // NOTE:
      // We do NOT modify actor.system.fate.used here — spending the resource
      // should be handled elsewhere (e.g., via roll result or a separate hook).

      return originalFn(diceRoll);
    } catch (err) {
      console.error(
        "Fate DiceRoller | Error in patched DiceRoller, delegating to original",
        err
      );
      return originalFn(diceRoll);
    }
  };
}

/**
 * Try to import the system's roll-dice module and locate DiceRoller.
 * @returns {Promise<{ mod: any, fn: Function } | null>}
 */
async function tryImportOriginal() {
  for (const path of POSSIBLE_PATHS) {
    try {
      console.debug(
        "Fate DiceRoller | Attempting to import roll-dice module from path",
        path
      );
      const mod = await import(path);
      if (!mod) continue;

      if (typeof mod.DiceRoller === "function") {
        console.log(
          "Fate DiceRoller | Found DiceRoller export in module",
          path
        );
        return { mod, fn: mod.DiceRoller };
      }

      if (typeof mod.default === "function") {
        console.log(
          "Fate DiceRoller | Found default DiceRoller export in module",
          path
        );
        return { mod, fn: mod.default };
      }

      console.debug(
        "Fate DiceRoller | Module imported but no DiceRoller function found",
        path
      );
    } catch (err) {
      console.warn(
        "Fate DiceRoller | Failed to import roll-dice module from path",
        path,
        err
      );
    }
  }

  return null;
}

/**
 * Try to locate DiceRoller from known global namespaces.
 * @returns {Function | null}
 */
function findOriginalFromGlobals() {
  try {
    if (game.worldofdarkness?.DiceRoller) {
      console.log(
        "Fate DiceRoller | Using game.worldofdarkness.DiceRoller as original"
      );
      return game.worldofdarkness.DiceRoller;
    }
  } catch (_e) {
    // Ignore
  }

  try {
    if (typeof globalThis.DiceRoller === "function") {
      console.log(
        "Fate DiceRoller | Using globalThis.DiceRoller as original"
      );
      return globalThis.DiceRoller;
    }
  } catch (_e) {
    // Ignore
  }

  return null;
}

/**
 * Install the patched DiceRoller, exposing both original and patched
 * in a few convenient locations.
 * @param {Function} originalFn
 * @param {any} sourceModule
 * @returns {boolean}
 */
function installPatchWithOriginal(originalFn, sourceModule = null) {
  if (!originalFn || typeof originalFn !== "function") {
    console.warn(
      "Fate DiceRoller | installPatch: no original DiceRoller function available"
    );
    return false;
  }

  OriginalDiceRoller = originalFn;
  const patched = makePatchedDiceRoller(OriginalDiceRoller);

  // Try to mutate the source module if it is writable (may silently fail).
  if (sourceModule && typeof sourceModule === "object") {
    try {
      sourceModule.DiceRoller = patched;
      console.log(
        "Fate DiceRoller | Replaced rollModule.DiceRoller (if writable)."
      );
    } catch (_e) {
      // Ignore
    }

    try {
      if ("default" in sourceModule) {
        sourceModule.default = patched;
        console.log(
          "Fate DiceRoller | Replaced rollModule.default (if writable)."
        );
      }
    } catch (_e) {
      // Ignore
    }
  }

  // Expose patched DiceRoller on game.worldofdarkness for compatibility.
  try {
    if (!game.worldofdarkness) game.worldofdarkness = {};
    game.worldofdarkness.OriginalDiceRoller = OriginalDiceRoller;
    game.worldofdarkness.DiceRoller = patched;
  } catch (_e) {
    // Ignore
  }

  // Also expose on globalThis for debugging / macros.
  try {
    globalThis.WOD20RU_OriginalDiceRoller = OriginalDiceRoller;
    globalThis.WOD20RU_DiceRoller = patched;
  } catch (_e) {
    // Ignore
  }

  console.log(
    "Fate DiceRoller | DiceRoller successfully patched with Fate support.",
    {
      hasGameNamespace: !!game.worldofdarkness
    }
  );
  return true;
}

/**
 * Public entry point – called by fate-bootstrap.js on the "ready" hook.
 * Attempts to locate and patch the system's DiceRoller.
 */
export async function initFateDiceRoller() {
  console.log("Fate DiceRoller | initFateDiceRoller() called");

  if (OriginalDiceRoller) {
    console.log(
      "Fate DiceRoller | OriginalDiceRoller already set, skipping re-initialization"
    );
    return;
  }

  try {
    // 1) First, try to use already-registered globals.
    const fromGlobals = findOriginalFromGlobals();
    if (fromGlobals && installPatchWithOriginal(fromGlobals, null)) {
      console.log(
        "Fate DiceRoller | Patch installed using global DiceRoller reference"
      );
      return;
    }

    // 2) Fallback: import the roll-dice module directly.
    const result = await tryImportOriginal();
    if (result && result.fn && installPatchWithOriginal(result.fn, result.mod)) {
      console.log(
        "Fate DiceRoller | Patch installed using imported roll-dice module"
      );
      return;
    }

    console.warn(
      "Fate DiceRoller | Could not locate original DiceRoller - Fate dice injection will remain disabled."
    );
  } catch (err) {
    console.error(
      "Fate DiceRoller | Error while initializing DiceRoller patch",
      err
    );
  }
}

console.log(
  "Fate DiceRoller | Module loaded (definition only, no patch yet)"
);
