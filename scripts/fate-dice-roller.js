// scripts/fate-dice-roller.js
// Wrapper around the original World of Darkness DiceRoller
// to inject Fate dice when the user opted to "Use Fate" for a roll.
//
// New strategy (v2):
//  1) Expose an explicit async initFateDiceRoller() entry point.
//  2) The orchestrator (fate-dialog-patches-init.js) calls it
//     only if Fate is enabled in module settings.
//  3) We import the system's roll-dice module and grab its DiceRoller export.
//  4) We build a patched DiceRoller that:
//      - checks module settings,
//      - reads transient Fate state (fateState) and diceRoll flags,
//      - adds Fate dice when appropriate,
//      - delegates to the original system DiceRoller.
//  5) We DO NOT mutate the system module exports. Instead, we expose:
//      - globalThis.WOD20RU_OriginalDiceRoller
//      - globalThis.WOD20RU_DiceRoller
//     and patched dialogs call WOD20RU_DiceRoller directly.

import { isFateEnabled } from "./settings.js";
import { fateState } from "./fate-state.js";

console.log("Fate DiceRoller | Module loaded (definition only, no patch yet)");

const POSSIBLE_PATHS = [
  "/systems/worldofdarkness/module/scripts/roll-dice.js",
  "/systems/worldofdarkness/module/scripts/roll-dice.mjs",
  "/systems/worldofdarkness/module/scripts/roll-dice.min.js",
  "/systems/worldofdarkness/module/scripts/roll-dice.min.mjs"
];

/** @type {((diceRoll: any) => Promise<any>) | null} */
let OriginalDiceRoller = null;

/**
 * Convert any value to a non-negative integer (for dice counts).
 * Always safe; never throws.
 * @param {unknown} value
 * @returns {number}
 */
function toInt(value) {
  if (Number.isFinite(value)) {
    return Math.max(0, /** @type {number} */ (value) | 0);
  }

  const parsed = parseInt(value ?? 0, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed | 0);
}

/**
 * Build the patched DiceRoller that adds Fate dice when requested.
 *
 * @param {(diceRoll: any) => Promise<any>} originalFn
 * @returns {(diceRoll: any) => Promise<any>}
 */
function makePatchedDiceRoller(originalFn) {
  return async function PatchedDiceRoller(diceRoll) {
    // Defensive guard: if something is badly wrong, never break the game.
    try {
      // If Fate is globally disabled, don't touch the roll.
      if (!isFateEnabled()) {
        // This log is intentionally low-noise: only when Fate was previously enabled
        // and someone still tries to use the patched roller.
        console.debug("Fate DiceRoller | Fate disabled in settings, delegating to original.");
        return originalFn(diceRoll);
      }

      const actor = diceRoll?.actor;
      const origin = diceRoll?.origin ?? "(unknown)";

      if (!actor) {
        console.warn(
          "Fate DiceRoller | No actor on diceRoll, delegating to original.",
          { origin }
        );
        return originalFn(diceRoll);
      }

      // Log incoming roll with minimal context for debugging.
      console.debug("Fate DiceRoller | Incoming roll", {
        actor: actor.name,
        origin,
        numDices: toInt(diceRoll?.numDices)
      });

      // Skip damage rolls entirely (Fate is not applied to weapon damage).
      if (origin === "damage") {
        console.debug("Fate DiceRoller | Origin 'damage' – Fate is not applied, delegating.");
        return originalFn(diceRoll);
      }

      // Skip special "pure Fate" rolls (they are handled elsewhere, via DialogFate).
      if (diceRoll.isFate === true) {
        console.debug("Fate DiceRoller | isFate=true – this is a dedicated Fate roll, delegating.");
        return originalFn(diceRoll);
      }

      const system = actor.system ?? actor.data?.data ?? {};
      const fate = system.fate;

      // If the actor has no Fate block, just delegate.
      if (!fate) {
        console.debug("Fate DiceRoller | Actor has no system.fate, delegating.", {
          actor: actor.name,
          origin
        });
        return originalFn(diceRoll);
      }

      // Base number of Fate dice from actor's Fate value.
      const baseFateDice = toInt(fate.value);
      if (!baseFateDice) {
        console.debug("Fate DiceRoller | Actor Fate value is 0, delegating.", {
          actor: actor.name,
          origin
        });
        return originalFn(diceRoll);
      }

      // Read transient UI state for this actor (set by dialog patches).
      const consumedState = fateState.consume(actor.id);
      const state = consumedState || { useFate: false, fateDice: baseFateDice };

      console.debug("Fate DiceRoller | State after consume", {
        actor: actor.name,
        origin,
        consumedState,
        effectiveState: state
      });

      // Also honour diceRoll.useFate if some integration sets it directly.
      const effectiveUseFate = !!state.useFate || !!diceRoll.useFate;

      if (!effectiveUseFate) {
        // User didn't request Fate for this roll.
        console.debug(
          "Fate DiceRoller | useFate=false (both state and diceRoll), no Fate dice applied.",
          { actor: actor.name, origin }
        );
        return originalFn(diceRoll);
      }

      // Number of Fate dice to add: prefer state.fateDice, then actor's Fate value.
      const fateDiceToAdd = toInt(state.fateDice ?? baseFateDice);

      if (!fateDiceToAdd) {
        console.warn(
          "Fate DiceRoller | useFate=true but fateDiceToAdd=0, delegating to original.",
          {
            actor: actor.name,
            origin,
            baseFateDice,
            stateFateDice: state.fateDice
          }
        );
        return originalFn(diceRoll);
      }

      // Ensure numDices is numeric.
      const baseDice = toInt(diceRoll.numDices);
      const newTotal = baseDice + fateDiceToAdd;

      console.log("Fate DiceRoller | Applying Fate dice", {
        actor: actor.name,
        origin,
        baseDice,
        fateDiceToAdd,
        newTotal
      });

      diceRoll.numDices = newTotal;

      // Annotate the roll so that chat rendering / other code can detect Fate usage.
      diceRoll.useFate = true;
      diceRoll.fateDice = fateDiceToAdd;
      diceRoll._wodru_fateInfo = {
        amount: fateDiceToAdd,
        baseDice,
        totalDice: newTotal,
        actorId: actor.id
      };

      // NOTE: We intentionally do NOT modify actor.system.fate.used here.
      // Spending/marking Fate resource should be handled by separate logic
      // (e.g. after a successful roll or via a dedicated hook).

      return originalFn(diceRoll);
    } catch (err) {
      console.error(
        "Fate DiceRoller | Error in patched DiceRoller, delegating to original.",
        {
          error: err,
          origin: diceRoll?.origin,
          actorName: diceRoll?.actor?.name
        }
      );
      return originalFn(diceRoll);
    }
  };
}

/**
 * Try to import the system's roll-dice module and locate DiceRoller.
 * This uses a small list of known paths and stops at the first success.
 *
 * @returns {Promise<{ mod: any, fn: (diceRoll: any) => Promise<any> } | null>}
 */
async function tryImportOriginal() {
  console.log("Fate DiceRoller | Attempting to import roll-dice module from known paths.");

  for (const path of POSSIBLE_PATHS) {
    try {
      console.debug("Fate DiceRoller | Trying import", { path });
      const mod = await import(path);
      if (!mod) {
        console.debug("Fate DiceRoller | Import returned falsy module", { path });
        continue;
      }

      if (typeof mod.DiceRoller === "function") {
        console.log("Fate DiceRoller | Found DiceRoller named export.", { path });
        return { mod, fn: mod.DiceRoller };
      }

      if (typeof mod.default === "function") {
        console.log("Fate DiceRoller | Found default DiceRoller export.", { path });
        return { mod, fn: mod.default };
      }

      console.debug("Fate DiceRoller | No suitable export in module.", { path });
    } catch (err) {
      console.warn("Fate DiceRoller | Failed to import roll-dice module path.", {
        path,
        error: err
      });
    }
  }

  console.error("Fate DiceRoller | Could not import any roll-dice module from known paths.");
  return null;
}

/**
 * Install the patched DiceRoller, exposing both original and patched
 * on globalThis (and optionally game.worldofdarkness) so that dialog
 * patches can call WOD20RU_DiceRoller directly.
 *
 * @param {(diceRoll: any) => Promise<any>} originalFn
 */
function installPatchWithOriginal(originalFn) {
  if (!originalFn || typeof originalFn !== "function") {
    console.error(
      "Fate DiceRoller | installPatchWithOriginal: no valid original DiceRoller function provided."
    );
    return false;
  }

  // Avoid double-patching: if we already have an original, don't overwrite it.
  if (OriginalDiceRoller && originalFn !== OriginalDiceRoller) {
    console.warn(
      "Fate DiceRoller | installPatchWithOriginal called more than once with a different function. Skipping."
    );
    return false;
  }

  if (!OriginalDiceRoller) {
    OriginalDiceRoller = originalFn;
  }

  const patched = makePatchedDiceRoller(OriginalDiceRoller);

  // Expose on globalThis for dialog patches.
  try {
    globalThis.WOD20RU_OriginalDiceRoller = OriginalDiceRoller;
    globalThis.WOD20RU_DiceRoller = patched;
    console.log("Fate DiceRoller | Exposed patched DiceRoller on globalThis.", {
      hasOriginal: !!OriginalDiceRoller
    });
  } catch (err) {
    console.error(
      "Fate DiceRoller | Failed to expose patched DiceRoller on globalThis.",
      err
    );
  }

  // Optionally expose on game.worldofdarkness for debugging / manual use.
  try {
    // eslint-disable-next-line no-undef
    if (typeof game !== "undefined") {
      // @ts-ignore - game is a Foundry global
      if (!game.worldofdarkness) {
        // @ts-ignore
        game.worldofdarkness = {};
      }
      // @ts-ignore
      game.worldofdarkness.OriginalDiceRoller = OriginalDiceRoller;
      // @ts-ignore
      game.worldofdarkness.FateDiceRoller = patched;

      console.log(
        "Fate DiceRoller | Exposed patched DiceRoller on game.worldofdarkness.FateDiceRoller."
      );
    }
  } catch (err) {
    console.warn(
      "Fate DiceRoller | Could not expose patched DiceRoller on game.worldofdarkness.",
      err
    );
  }

  console.log("Fate DiceRoller | DiceRoller successfully patched with Fate support.");
  return true;
}

/**
 * Public entry point.
 *
 * Called by the Fate dialog patch orchestrator ONCE, and only if the
 * module setting "use Fate" is enabled.
 *
 * - If Fate is disabled in settings, this function logs and returns.
 * - If a patch is already installed, it does nothing.
 * - Otherwise, it imports the system's roll-dice module and installs the patch.
 *
 * @returns {Promise<void>}
 */
export async function initFateDiceRoller() {
  console.log("Fate DiceRoller | initFateDiceRoller() called.");

  // If Fate is disabled, do nothing (orchestrator should usually check this already).
  if (!isFateEnabled()) {
    console.log("Fate DiceRoller | Fate is disabled in settings, init aborted.");
    return;
  }

  // If we already have a patched roller exposed, do not re-initialize.
  if (globalThis.WOD20RU_DiceRoller && OriginalDiceRoller) {
    console.log(
      "Fate DiceRoller | Patched DiceRoller already initialized, skipping re-init."
    );
    return;
  }

  try {
    const result = await tryImportOriginal();

    if (!result || !result.fn) {
      console.error(
        "Fate DiceRoller | initFateDiceRoller: could not locate original DiceRoller. Fate support will be inactive."
      );
      return;
    }

    const ok = installPatchWithOriginal(result.fn);
    if (!ok) {
      console.error(
        "Fate DiceRoller | initFateDiceRoller: installPatchWithOriginal returned false. Fate support will be inactive."
      );
      return;
    }

    console.log(
      "Fate DiceRoller | initFateDiceRoller completed successfully. Patched DiceRoller is ready."
    );
  } catch (err) {
    console.error("Fate DiceRoller | initFateDiceRoller: unexpected error.", err);
  }
}
