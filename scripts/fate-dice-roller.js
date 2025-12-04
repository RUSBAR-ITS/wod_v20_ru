// scripts/fate-dice-roller.js
// Wrapper around the original World of Darkness DiceRoller
// to inject Fate dice when the user opted to "Use Fate" for a roll.
//
// New architecture (aligned with slot-based Fate algorithm):
// - This module ONLY defines the patching logic and exports initFateDiceRoller().
// - It does NOT change WoD mechanics: Fate dice are regular d10s in the pool.
// - It enlarges the dice pool when Fate is used and annotates the roll with
//   metadata (baseDice, fateDice, totalDice, actorId) for later processing
//   in the roll implementation / chat template.
//
// Strategy:
//  1) Try to locate the system's DiceRoller:
//     - from game.worldofdarkness.DiceRoller,
//     - from globalThis.DiceRoller,
//     - or by importing the roll-dice module from known paths.
//  2) Wrap DiceRoller with our logic that consults fateState for the actor.
//  3) When Fate is requested, increase diceRoll.numDices by fateDice, and
//     store a _wodru_fateMeta block on diceRoll:
//        {
//          enabled: true,
//          baseDice: <original numDices>,
//          fateDice: <added Fate dice>,
//          totalDice: <base + fate>,
//          actorId: <actor.id>
//        }
//     This metadata will later be used by a forked DiceRoller implementation
//     to:
//        - treat all dice mechanically the same,
//        - but mark last `fateDice` slots as Fate,
//        - count Fate 1s and 10s separately,
//        - render "Fate Success / Fate Botch" in chat.
//  4) Expose both original and patched versions in convenient namespaces.
//  5) If anything fails, log the problem and leave DiceRoller unmodified.

import { isFateEnabled } from "./settings.js";
import { fateState } from "./fate-state.js";
import {DiceRoller as WODRUDiceRoller } from "./wodru-dice-roller.js";

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
 * Fate dice are mechanically identical to normal dice (same success / botch /
 * exploding rules). The only difference is that we *also* track how many
 * dice were added as Fate in order to post-process them later.
 *
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
        return WODRUDiceRoller(diceRoll);
      }

      const actor = diceRoll?.actor;
      if (!actor) {
        console.warn(
          "Fate DiceRoller | No actor on diceRoll, delegating to original"
        );
        return WODRUDiceRoller(diceRoll);
      }

      // Skip damage rolls entirely — Fate is not applied to damage.
      if (diceRoll.origin === "damage") {
        console.debug(
          "Fate DiceRoller | Damage roll detected, skipping Fate injection"
        );
        return WODRUDiceRoller(diceRoll);
      }

      // Skip if this is a special pure Fate roll already handled elsewhere.
      if (diceRoll.isFate === true) {
        console.debug(
          "Fate DiceRoller | Pure Fate roll (isFate === true), no extra Fate dice applied"
        );
        return WODRUDiceRoller(diceRoll);
      }

      const system = actor.system ?? actor.data?.data ?? {};
      const fate = system.fate;

      if (!fate) {
        console.debug(
          "Fate DiceRoller | Actor has no system.fate block, delegating to original"
        );
        return WODRUDiceRoller(diceRoll);
      }

      const baseFateDice = toInt(fate.value);

      // Read the transient UI state for this actor (set by dialog patch).
      // state.useFate: whether user ticked "Use Fate" in the dialog.
      // state.fateDice: how many Fate dice to add for THIS roll (can differ from actor's fate.value).
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
        return WODRUDiceRoller(diceRoll);
      }

      // Number of Fate dice to add: prefer state.fateDice, then actor's Fate value.
      const fateDiceToAdd = toInt(state.fateDice ?? baseFateDice);

      if (!fateDiceToAdd) {
        console.warn(
          "Fate DiceRoller | useFate=true but fateDiceToAdd is 0, delegating to original"
        );
        return WODRUDiceRoller(diceRoll);
      }

      // Ensure numDices is numeric.
      const baseDice = toInt(diceRoll.numDices);
      const newTotal = baseDice + fateDiceToAdd;

      // Fate dice are mechanically identical to normal ones:
      // we simply increase the pool by `fateDiceToAdd`.
      console.log("Fate DiceRoller | Applying Fate dice to roll", {
        actor: { id: actor.id, name: actor.name },
        origin: diceRoll.origin,
        baseDice,
        fateDiceToAdd,
        newTotal
      });

      diceRoll.numDices = newTotal;

      // Annotate the roll with Fate metadata so that a forked DiceRoller /
      // chat template can:
      //  - know how many *base* dice there were,
      //  - know how many *Fate* dice were added,
      //  - treat all dice identically for mechanics,
      //  - but mark last `fateDice` slots as Fate when building results.
      const fateMeta = {
        enabled: true,
        baseDice,
        fateDice: fateDiceToAdd,
        totalDice: newTotal,
        actorId: actor.id
      };

      diceRoll.useFate = true;
      diceRoll._wodru_fateMeta = fateMeta;

      // Backward-compatible alias for any existing code that already uses
      // _wodru_usedFate.
      diceRoll._wodru_usedFate = fateMeta;

      // NOTE:
      // We do NOT modify actor.system.fate.used here — spending the resource
      // should be handled elsewhere (e.g., via roll result or a separate hook).

      return WODRUDiceRoller(diceRoll);
    } catch (err) {
      console.error(
        "Fate DiceRoller | Error in patched DiceRoller, delegating to original",
        err
      );
      return WODRUDiceRoller(diceRoll);
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