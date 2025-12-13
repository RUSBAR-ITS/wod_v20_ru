// scripts/fate-patch-dialog-generalroll.js
// Patch for DialogGeneralRoll._generalRoll
// Goal:
// - Before the system executes the standard general roll logic,
//   read Fate flags from the dialog object (this.object)
//   and push them into fateState for the actor.
// - Do NOT reimplement the roll logic itself; we just wrap the
//   original _generalRoll and call it afterwards.
//
// This relies on:
//  - settings.js -> isFateEnabled()
//  - fate-state.js -> fateState
//  - worldofdarkness DialogGeneralRoll class

console.log("Fate Patch | DialogGeneralRoll patch module loading");

import { isFateEnabled } from "./settings.js";
import { fateState } from "./fate-state.js";

import { DialogGeneralRoll } from "/systems/worldofdarkness/module/dialogs/dialog-generalroll.js";

let OriginalGeneralRollMethod = null;

/**
 * Safely convert value to non-negative integer.
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
 * Install wrapper around DialogGeneralRoll.prototype._generalRoll
 * so that we push Fate state before the original logic runs.
 */
function installDialogGeneralRollPatch() {
  console.log("Fate Patch | Installing DialogGeneralRoll._generalRoll patch");

  if (!DialogGeneralRoll || typeof DialogGeneralRoll !== "function") {
    console.warn(
      "Fate Patch | DialogGeneralRoll not available, cannot patch general roll dialog"
    );
    return;
  }

  const proto = DialogGeneralRoll.prototype;
  if (!proto) {
    console.warn(
      "Fate Patch | DialogGeneralRoll.prototype missing, cannot patch"
    );
    return;
  }

  const original = proto._generalRoll;
  if (typeof original !== "function") {
    console.warn(
      "Fate Patch | DialogGeneralRoll.prototype._generalRoll is not a function, cannot patch"
    );
    return;
  }

  // Avoid double-patching.
  if (OriginalGeneralRollMethod && original === OriginalGeneralRollMethod) {
    console.log(
      "Fate Patch | DialogGeneralRoll._generalRoll already patched, skipping re-install"
    );
    return;
  }

  OriginalGeneralRollMethod = original;

  // Keep a reference on the prototype for debugging.
  try {
    proto._wodru_originalGeneralRoll = original;
  } catch (_e) {
    // Not critical if this fails.
  }

  proto._generalRoll = function patchedGeneralRoll(event) {
    console.log("Fate Patch | DialogGeneralRoll._generalRoll invoked", {
      appId: this.appId,
      hasObject: !!this.object,
      isFateEnabled: isFateEnabled()
    });

    try {
      if (isFateEnabled()) {
        const rollObject = this.object || {};
        const actor = this.actor ?? rollObject.actor ?? null;

        console.log("Fate Patch | Resolved actor and rollObject", {
          hasActor: !!actor,
          actorId: actor ? actor.id : null,
          actorName: actor ? actor.name : null,
          rollKeys: Object.keys(rollObject)
        });

        if (actor) {
          // Flags coming from the dialog.
          // useFate: checkbox in normal WoD rolls (add Fate dice to pool)
          // isFate: pure Fate roll (Fate dice ONLY, Fate rules ONLY)
          const useFate = !!rollObject.useFate;
          const isPureFate = rollObject.isFate === true;

          // Prefer explicit fateDice from dialog, fall back to actor.system.fate.value.
          let fateDice = 0;

          if (rollObject.fateDice != null) {
            fateDice = toInt(rollObject.fateDice);
          } else {
            const actorFateValue =
              actor.system?.fate?.value ??
              actor.data?.data?.fate?.value ??
              0;
            fateDice = toInt(actorFateValue);
          }

          console.log("Fate Patch | Computed Fate values from dialog", {
            useFate,
            isPureFate,
            dialogFateDice: rollObject.fateDice,
            actorFateValue: actor.system?.fate?.value,
            fateDice
          });

          // -----------------------------------------------------------------
          // PURE FATE FLAGS (IMPORTANT)
          // Pure Fate rolls must be processed by Fate rules and displayed
          // with Fate dice visuals only. This module cannot enforce visuals
          // itself, but we can set explicit markers for downstream DiceRoller.
          // -----------------------------------------------------------------
          if (isPureFate) {
            // Explicitly mark this roll as "Fate-only" for any downstream roller.
            rollObject._wodru_fateOnly = true;
            rollObject._wodru_forceFateDice = true;

            // Provide a normalized Fate dice count for Fate-only mode.
            // If the dialog already computed a pool, downstream can decide which
            // field to trust; this is just a reliable reference.
            rollObject._wodru_fateDice = fateDice;

            // Pure Fate must NOT also consume/produce transient "add Fate dice"
            // state; it is already a Fate pool.
            const consumed = fateState.consume(actor.id);
            console.log("Fate Patch | Pure Fate roll detected, state cleared", {
              actorId: actor.id,
              actorName: actor.name,
              fateDice,
              previousState: consumed
            });
          } else if (useFate && fateDice > 0) {
            // Normal roll + "Use Fate" => add Fate dice to the WoD pool.
            fateState.set(actor.id, { useFate: true, fateDice });
            console.log("Fate Patch | fateState.set applied for actor", {
              actorId: actor.id,
              actorName: actor.name,
              useFate: true,
              fateDice
            });
          } else {
            // Either Fate is not used, or there are zero dice.
            // Consume any previous state to avoid stale data.
            const consumed = fateState.consume(actor.id);
            console.log("Fate Patch | Fate state cleared / not applied", {
              actorId: actor.id,
              isPureFate,
              previousState: consumed
            });
          }
        } else {
          console.warn(
            "Fate Patch | No actor found on DialogGeneralRoll, Fate state not applied"
          );
        }
      } else {
        console.log(
          "Fate Patch | Fate feature disabled in settings, skipping Fate state injection"
        );
      }
    } catch (error) {
      console.error(
        "Fate Patch | Error while preparing Fate state before general roll",
        error
      );
    }

    // Call the original system logic to actually perform the roll.
    let result;
    try {
      result = OriginalGeneralRollMethod.call(this, event);
    } catch (error) {
      console.error(
        "Fate Patch | Error when calling original DialogGeneralRoll._generalRoll",
        error
      );
      throw error;
    }

    console.log("Fate Patch | DialogGeneralRoll._generalRoll finished", {
      appId: this.appId
    });

    return result;
  };

  console.log(
    "Fate Patch | DialogGeneralRoll._generalRoll successfully wrapped with Fate support"
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Hooks.once("init", () => {
  console.log(
    "Fate Patch | init hook fired, attempting to patch DialogGeneralRoll"
  );

  try {
    installDialogGeneralRollPatch();
  } catch (error) {
    console.error(
      "Fate Patch | Unexpected error during DialogGeneralRoll patch installation",
      error
    );
  }
});

console.log("Fate Patch | DialogGeneralRoll patch module loaded");
