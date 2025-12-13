// scripts/fate-dice-roller.js
// Variant A:
// - No fateState.
// - No dialog patch dependency.
// - We only react to flags already present on diceRoll:
//    * diceRoll.isFate === true  -> PURE Fate roll (Fate-only pool)
//    * diceRoll.useFate === true -> add Fate dice (only if diceRoll.fateDice or actor fate value is available)
//
// Important:
// - This module does NOT implement Fate rules itself. It only prepares diceRoll
//   so that our forked WoDRU DiceRoller (wodru-dice-roller.js) can:
//    * color Fate dice via Dice So Nice colorset,
//    * count Fate 1s/10s and compute fateNet,
//    * render Fate summary in chat.

import { isFateEnabled } from "./settings.js";
import { DiceRoller as WODRUDiceRoller } from "./wodru-dice-roller.js";

console.log("Fate DiceRoller | Loading module (Variant A)");

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
 * Read actor Fate value (system.fate.value) safely.
 * @param {any} actor
 * @returns {number}
 */
function getActorFateValue(actor) {
  const system = actor?.system ?? actor?.data?.data ?? {};
  const fate = system?.fate;
  return toInt(fate?.value ?? 0);
}

/**
 * Ensure targetlist exists and is consistent with diceRoll.numDices.
 * The WoD system sometimes relies on targetlist; our forked DiceRoller
 * also supports it.
 *
 * @param {any} diceRoll
 */
function normalizeTargetList(diceRoll) {
  if (!diceRoll) return;

  // If system already created targetlist, keep it.
  if (Array.isArray(diceRoll.targetlist) && diceRoll.targetlist.length > 0) {
    // Some callers store numDices per-target; do not forcibly overwrite.
    return;
  }

  // Create a single default target if missing.
  diceRoll.targetlist = [{ numDices: toInt(diceRoll.numDices) }];
}

/**
 * Build Fate metadata block consumed by wodru-dice-roller.js.
 *
 * @param {any} actor
 * @param {number} baseDice
 * @param {number} fateDice
 * @param {boolean} fateOnly
 */
function buildFateMeta(actor, baseDice, fateDice, fateOnly) {
  const totalDice = baseDice + fateDice;

  return {
    enabled: true,
    baseDice,
    fateDice,
    totalDice,
    actorId: actor?.id ?? null,
    // Optional: allows wodru-dice-roller.js to treat pure Fate specially later
    // if you decide to add fateOnly result semantics.
    fateOnly: fateOnly === true
  };
}

/**
 * Build the patched DiceRoller.
 *
 * @param {(diceRoll: any) => any | Promise<any>} originalFn
 */
function makePatchedDiceRoller(originalFn) {
  return async function PatchedDiceRoller(diceRoll) {
    try {
      console.debug("Fate DiceRoller | PatchedDiceRoller invoked", {
        enabled: isFateEnabled(),
        origin: diceRoll?.origin,
        hasActor: !!diceRoll?.actor,
        isFate: diceRoll?.isFate === true,
        useFate: diceRoll?.useFate === true,
        numDices: diceRoll?.numDices,
        fateDice: diceRoll?.fateDice
      });

      // Global switch off -> do not touch anything.
      if (!isFateEnabled()) {
        return WODRUDiceRoller(diceRoll);
      }

      const actor = diceRoll?.actor;
      if (!actor) {
        console.warn("Fate DiceRoller | No actor on diceRoll, delegating");
        return WODRUDiceRoller(diceRoll);
      }

      // Never apply Fate to damage rolls.
      if (diceRoll?.origin === "damage") {
        console.debug("Fate DiceRoller | Damage roll detected, skip Fate");
        return WODRUDiceRoller(diceRoll);
      }

      const actorFateValue = getActorFateValue(actor);

      // -------------------------------------------------------------------
      // PURE Fate roll (sheet banner / header click).
      // Contract for Variant A:
      // - Roll ONLY Fate dice.
      // - Mark ALL dice as Fate in slot logic by setting baseDice=0
      //   and fateDice=numDices.
      // - Do not depend on any external transient state.
      // -------------------------------------------------------------------
      if (diceRoll?.isFate === true) {
        const fateDiceToRoll = toInt(diceRoll?.fateDice ?? actorFateValue);

        console.log("Fate DiceRoller | PURE Fate roll -> forcing Fate-only pool", {
          actor: { id: actor.id, name: actor.name },
          requestedFateDice: diceRoll?.fateDice,
          actorFateValue,
          fateDiceToRoll
        });

        if (fateDiceToRoll <= 0) {
          console.warn("Fate DiceRoller | PURE Fate requested but fateDiceToRoll <= 0, delegating");
          return WODRUDiceRoller(diceRoll);
        }

        // Force Fate-only pool:
        // - numDices must be exactly Fate dice count
        // - wound penalty must NOT reduce pure Fate unless you explicitly want that
        diceRoll.numDices = fateDiceToRoll;
        diceRoll.woundpenalty = 0;

        // Make sure roll is marked as Fate
        diceRoll.useFate = true;
        diceRoll.fateDice = fateDiceToRoll;

        // IMPORTANT: baseDice=0 so that all slots become Fate slots
        const fateMeta = buildFateMeta(actor, 0, fateDiceToRoll, true);

        diceRoll._wodru_fateMeta = fateMeta;
        diceRoll._wodru_usedFate = fateMeta;

        // Ensure the target list exists so we don't accidentally roll old numDices
        normalizeTargetList(diceRoll);

        return WODRUDiceRoller(diceRoll);
      }

      // -------------------------------------------------------------------
      // Normal roll with Fate enabled (Variant A):
      // - We ONLY honor diceRoll.useFate and diceRoll.fateDice.
      // - We do NOT read fateState.
      //
      // This will work ONLY if the caller actually sets diceRoll.useFate=true.
      // If your checkbox UI currently does NOT persist it into diceRoll, then
      // this branch will never trigger (by design in Variant A).
      // -------------------------------------------------------------------
      const useFate = diceRoll?.useFate === true;
      if (!useFate) {
        return WODRUDiceRoller(diceRoll);
      }

      const fateDiceToAdd = toInt(diceRoll?.fateDice ?? actorFateValue);
      if (fateDiceToAdd <= 0) {
        console.warn("Fate DiceRoller | useFate=true but fateDiceToAdd <= 0, delegating");
        return WODRUDiceRoller(diceRoll);
      }

      const baseDice = toInt(diceRoll?.numDices);
      const newTotal = baseDice + fateDiceToAdd;

      console.log("Fate DiceRoller | Normal roll -> adding Fate dice", {
        actor: { id: actor.id, name: actor.name },
        origin: diceRoll?.origin,
        baseDice,
        fateDiceToAdd,
        newTotal
      });

      diceRoll.numDices = newTotal;

      const fateMeta = buildFateMeta(actor, baseDice, fateDiceToAdd, false);
      diceRoll._wodru_fateMeta = fateMeta;
      diceRoll._wodru_usedFate = fateMeta;

      normalizeTargetList(diceRoll);

      return WODRUDiceRoller(diceRoll);
    } catch (err) {
      console.error("Fate DiceRoller | Error in patched DiceRoller, delegating", err);
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
      console.debug("Fate DiceRoller | Attempting import", path);
      const mod = await import(path);
      if (!mod) continue;

      if (typeof mod.DiceRoller === "function") {
        console.log("Fate DiceRoller | Found DiceRoller export", path);
        return { mod, fn: mod.DiceRoller };
      }

      if (typeof mod.default === "function") {
        console.log("Fate DiceRoller | Found default export DiceRoller", path);
        return { mod, fn: mod.default };
      }
    } catch (err) {
      console.warn("Fate DiceRoller | Import failed", path, err);
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
      console.log("Fate DiceRoller | Using game.worldofdarkness.DiceRoller");
      return game.worldofdarkness.DiceRoller;
    }
  } catch (_e) {}

  try {
    if (typeof globalThis.DiceRoller === "function") {
      console.log("Fate DiceRoller | Using globalThis.DiceRoller");
      return globalThis.DiceRoller;
    }
  } catch (_e) {}

  return null;
}

/**
 * Install the patched DiceRoller.
 * @param {Function} originalFn
 * @param {any} sourceModule
 * @returns {boolean}
 */
function installPatchWithOriginal(originalFn, sourceModule = null) {
  if (!originalFn || typeof originalFn !== "function") {
    console.warn("Fate DiceRoller | installPatch: no original function");
    return false;
  }

  OriginalDiceRoller = originalFn;
  const patched = makePatchedDiceRoller(OriginalDiceRoller);

  // Attempt to replace exports (may fail in ESM, harmless).
  if (sourceModule && typeof sourceModule === "object") {
    try { sourceModule.DiceRoller = patched; } catch (_e) {}
    try { if ("default" in sourceModule) sourceModule.default = patched; } catch (_e) {}
  }

  // Expose in game namespace for debugging/compat.
  try {
    if (!game.worldofdarkness) game.worldofdarkness = {};
    game.worldofdarkness.OriginalDiceRoller = OriginalDiceRoller;
    game.worldofdarkness.DiceRoller = patched;
  } catch (_e) {}

  try {
    globalThis.WOD20RU_OriginalDiceRoller = OriginalDiceRoller;
    globalThis.WOD20RU_DiceRoller = patched;
  } catch (_e) {}

  console.log("Fate DiceRoller | Patch installed (Variant A)");
  return true;
}

/**
 * Public entry point – called by fate-bootstrap.js on "ready".
 */
export async function initFateDiceRoller() {
  console.log("Fate DiceRoller | initFateDiceRoller() called (Variant A)");

  if (OriginalDiceRoller) {
    console.log("Fate DiceRoller | Already initialized, skipping");
    return;
  }

  try {
    const fromGlobals = findOriginalFromGlobals();
    if (fromGlobals && installPatchWithOriginal(fromGlobals, null)) return;

    const result = await tryImportOriginal();
    if (result && result.fn && installPatchWithOriginal(result.fn, result.mod)) return;

    console.warn("Fate DiceRoller | Could not locate original DiceRoller");
  } catch (err) {
    console.error("Fate DiceRoller | init error", err);
  }
}

console.log("Fate DiceRoller | Module loaded (Variant A)");
