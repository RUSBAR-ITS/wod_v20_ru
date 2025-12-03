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

// Import the system dialog class directly from the system ES module.
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
          // Flags coming from the dialog (set by fate-hooks-dialog-checkbox.js).
          const useFate = !!rollObject.useFate;

          // Prefer explicit fateDice from dialog, fall back to actor.system.fate.value.
          let fateDice = 0;

          if (rollObject.fateDice != null) {
            fateDice = toInt(rollObject.fateDice);
          } else {
            const actorFateValue =
              actor.system?.fate?.value ??
              actor.data?.data?.fate?.value ?? // legacy safety
              0;
            fateDice = toInt(actorFateValue);
          }

          console.log("Fate Patch | Computed Fate values from dialog", {
            useFate,
            dialogFateDice: rollObject.fateDice,
            actorFateValue: actor.system?.fate?.value,
            fateDice
          });

          if (useFate && fateDice > 0) {
            fateState.set(actor.id, { useFate: true, fateDice });
            console.log("Fate Patch | fateState.set applied for actor", {
              actorId: actor.id,
              actorName: actor.name,
              useFate: true,
              fateDice
            });
          } else {
            // Either Fate is not used, or there are zero dice.
            // We still consume any previous state to avoid stale data.
            const consumed = fateState.consume(actor.id);
            console.log("Fate Patch | Fate not used or 0 dice, clearing state", {
              actorId: actor.id,
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
      // Re-throw so the system can handle it as usual.
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
