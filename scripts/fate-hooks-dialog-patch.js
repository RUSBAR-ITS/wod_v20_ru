/**
 * Fate Hooks — Dialog Patch (pure Fate rolls only)
 *
 * Purpose in the new architecture:
 * - Only adjust the *UI* of DialogGeneralRoll when this is a pure Fate roll
 *   (this.object.isFate === true).
 * - For all other rolls, do NOTHING.
 *
 * Behavior:
 * - Patch DialogGeneralRoll.getData to:
 *   - detect pure Fate rolls,
 *   - override displayed attribute name/value with Fate (label + dots),
 *   - disable speciality on the dialog.
 *
 * It does NOT:
 * - touch RollDice,
 * - change any mechanics for normal rolls,
 * - interact with fateState or the patched DiceRoller.
 */

console.log("Fate Hooks | Dialog Patch module loading (pure Fate UI only)");

import { isFateEnabled } from "./settings.js";
import { FateData } from "./fate-data.js";
import { DialogGeneralRoll } from "/systems/worldofdarkness/module/dialogs/dialog-generalroll.js";

/**
 * Install a lightweight patch on DialogGeneralRoll.getData
 * which only affects pure Fate rolls.
 */
function installDialogGeneralRollFateGetDataPatch() {
  console.log(
    "Fate Hooks | Dialog Patch: installing DialogGeneralRoll.getData patch (pure Fate UI)"
  );

  if (!DialogGeneralRoll || typeof DialogGeneralRoll !== "function") {
    console.warn(
      "Fate Hooks | Dialog Patch: DialogGeneralRoll not available, cannot patch"
    );
    return;
  }

  const proto = DialogGeneralRoll.prototype;
  if (!proto) {
    console.warn(
      "Fate Hooks | Dialog Patch: DialogGeneralRoll.prototype missing, cannot patch"
    );
    return;
  }

  // Avoid double-patching.
  if (proto._wodV20RuFateGetDataPatched) {
    console.log(
      "Fate Hooks | Dialog Patch: DialogGeneralRoll.getData already patched, skipping"
    );
    return;
  }

  const originalGetData = proto.getData;
  if (typeof originalGetData !== "function") {
    console.warn(
      "Fate Hooks | Dialog Patch: DialogGeneralRoll.prototype.getData is not a function, cannot patch"
    );
    return;
  }

  proto.getData = async function patchedFateGetData(...args) {
    const data = await originalGetData.call(this, ...args);

    try {
      const fateEnabled = isFateEnabled();
      const actor = this.actor ?? null;
      const rollObject = this.object ?? data?.object ?? {};
      const isFateRoll = rollObject?.isFate === true;

      console.debug("Fate Hooks | Dialog Patch getData (pure Fate)", {
        fateEnabled,
        isFateRoll,
        actor: actor
          ? { id: actor.id, name: actor.name, type: actor.type }
          : null
      });

      // If Fate is disabled or this is NOT a pure Fate roll, do not touch anything.
      if (!fateEnabled || !isFateRoll || !actor) {
        if (!fateEnabled || !isFateRoll) {
          console.debug(
            "Fate Hooks | Dialog Patch getData: not a pure Fate roll or Fate disabled, leaving data untouched."
          );
        } else if (!actor) {
          console.warn(
            "Fate Hooks | Dialog Patch getData: pure Fate roll but no actor found, cannot override UI."
          );
        }
        return data;
      }

      // At this point we know:
      // - Fate is enabled,
      // - this is a pure Fate roll (isFate === true),
      // - we have a valid actor.

      const fateData = FateData.getFateData(actor);
      const label = game.i18n.localize("WOD20RU.Fate");
      const value = fateData?.value ?? 0;

      console.log(
        "Fate Hooks | Dialog Patch getData: applying pure Fate UI override",
        {
          actorId: actor.id,
          actorName: actor.name,
          label,
          value
        }
      );

      // Update data for the template — what the dialog will display.
      if (data.object) {
        data.object.attributeName = label;
        data.object.attributeValue = value;
        data.object.name = label;
        data.object.hasSpeciality = false;
      }

      // Mirror these changes on the dialog's internal state for consistency.
      if (this.object) {
        this.object.attributeName = label;
        this.object.attributeValue = value;
        this.object.name = label;
        this.object.hasSpeciality = false;
        this.object.useSpeciality = false;
      }

    } catch (e) {
      console.error(
        "Fate Hooks | Dialog Patch getData: error in pure Fate UI override",
        e
      );
    }

    return data;
  };

  proto._wodV20RuFateGetDataPatched = true;
  console.log(
    "Fate Hooks | Dialog Patch: DialogGeneralRoll.getData patched for pure Fate UI only"
  );
}

// ---------------------------------------------------------------------------
// Entry point: patch only on init, after system classes are registered.
// ---------------------------------------------------------------------------

Hooks.once("init", () => {
  console.log(
    "Fate Hooks | Dialog Patch init: attempting to patch DialogGeneralRoll (pure Fate UI only)"
  );

  try {
    installDialogGeneralRollFateGetDataPatch();
  } catch (error) {
    console.error(
      "Fate Hooks | Dialog Patch: unexpected error during patch installation",
      error
    );
  }
});

console.log("Fate Hooks | Dialog Patch module loaded (pure Fate UI only)");
