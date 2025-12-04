// scripts/fate-override-dialog-generalroll-roll.js
// Hard override for DialogGeneralRoll._generalRoll
//
// Goal:
// - Replace the system implementation of _generalRoll with our own,
//   which still replicates the original behavior, BUT calls the
//   patched Fate DiceRoller (WOD20RU_DiceRoller) instead of the
//   system DiceRoller.
// - This override is installed early, so that other patches (like
//   fate-patch-dialog-generalroll.js) can safely wrap the new
//   implementation.
//
// This relies on:
//  - worldofdarkness DialogGeneralRoll class
//  - roll-dice.js -> DiceRollContainer
//  - globalThis.WOD20RU_DiceRoller installed by fate-dice-roller.js

console.log("Fate Override | DialogGeneralRoll._generalRoll override module loading");

import { DialogGeneralRoll } from "/systems/worldofdarkness/module/dialogs/dialog-generalroll.js";
import {
  DiceRollContainer,
  DiceRoller as SystemDiceRoller
} from "/systems/worldofdarkness/module/scripts/roll-dice.js";

let OriginalSystemGeneralRoll = null;

/**
 * Resolve which DiceRoller function to use:
 * - Prefer the Fate-patched DiceRoller (WOD20RU_DiceRoller),
 * - Fallback to the system DiceRoller imported from roll-dice.js.
 *
 * @returns {(diceRoll: any) => Promise<void> | void | null}
 */
function resolveDiceRoller() {
  const patched = globalThis.WOD20RU_DiceRoller;
  if (typeof patched === "function") {
    return patched;
  }

  if (typeof SystemDiceRoller === "function") {
    return SystemDiceRoller;
  }

  console.error(
    "Fate Override | No valid DiceRoller found (neither WOD20RU_DiceRoller nor SystemDiceRoller)"
  );
  return null;
}

/**
 * Install a hard override for DialogGeneralRoll.prototype._generalRoll.
 * This implementation is based on the original system code, but delegates
 * the final roll to our patched DiceRoller.
 */
function installDialogGeneralRollOverride() {
  console.log("Fate Override | Installing DialogGeneralRoll._generalRoll override");

  if (!DialogGeneralRoll || typeof DialogGeneralRoll !== "function") {
    console.warn(
      "Fate Override | DialogGeneralRoll not available, cannot override general roll dialog"
    );
    return;
  }

  const proto = DialogGeneralRoll.prototype;
  if (!proto) {
    console.warn(
      "Fate Override | DialogGeneralRoll.prototype missing, cannot override"
    );
    return;
  }

  const original = proto._generalRoll;
  if (typeof original !== "function") {
    console.warn(
      "Fate Override | DialogGeneralRoll.prototype._generalRoll is not a function, cannot override"
    );
    return;
  }

  // Avoid double override.
  if (OriginalSystemGeneralRoll && original === OriginalSystemGeneralRoll) {
    console.log(
      "Fate Override | DialogGeneralRoll._generalRoll already overridden, skipping re-install"
    );
    return;
  }

  OriginalSystemGeneralRoll = original;

  try {
    proto._wodru_originalSystemGeneralRoll = original;
  } catch (_e) {
    // Non-critical if this fails.
  }

  /**
   * Replacement for the system _generalRoll method.
   * This is a near-direct copy of the original implementation,
   * but it calls resolveDiceRoller() instead of the system DiceRoller.
   *
   * @param {Event} event
   */
  proto._generalRoll = function overriddenGeneralRoll(event) {
    console.log("Fate Override | Overridden DialogGeneralRoll._generalRoll invoked", {
      appId: this.appId
    });

    // --- Original system logic (copied & slightly normalized) ---

    if (this.object.close) {
      this.close();
      return;
    }

    this.object.canRoll = this.object.difficulty > -1 ? true : false;

    let woundPenaltyVal = 0;
    const template = [];
    let specialityText = "";
    let rollName = this.object.name;

    if (rollName === "") {
      rollName = game.i18n.localize("wod.dice.rollingdice");
    }

    const numDices =
      parseInt(this.object.attributeValue) +
      parseInt(this.object.abilityValue) +
      parseInt(this.object.bonus);

    if (!this.object.canRoll) {
      ui.notifications.warn(
        game.i18n.localize("wod.dialog.missingdifficulty")
      );
      return;
    }

    if (this.object.type === "dice") {
      woundPenaltyVal = 0;
    } else {
      template.push(
        `${this.object.attributeName} (${this.object.attributeValue})`
      );

      if (this.object.abilityName !== "") {
        template.push(
          `${this.object.abilityName} (${this.object.abilityValue})`
        );
      }

      this.object.close = true;

      if (!this.object.hasSpeciality) {
        this.object.useSpeciality = false;
      }

      if (this.object.useSpeciality) {
        specialityText = this.object.specialityText;
      }

      if (this.object.ignorepain) {
        woundPenaltyVal = 0;
      } else if (
        this.object.type === "dice" ||
        this.object.type === "noability"
      ) {
        woundPenaltyVal = 0;
      } else if (!this.object.usepain) {
        woundPenaltyVal = 0;
      } else {
        woundPenaltyVal = parseInt(
          this.actor.system?.health?.damage?.woundpenalty ?? 0
        );
      }
    }

    const generalRoll = new DiceRollContainer(this.actor);
    generalRoll.action = rollName;
    generalRoll.attribute = this.object.attributeKey;
    generalRoll.ability = this.object.abilityKey;
    generalRoll.dicetext = template;
    generalRoll.bonus = parseInt(this.object.bonus);
    generalRoll.origin = "general";
    generalRoll.numDices = numDices;
    generalRoll.woundpenalty = parseInt(woundPenaltyVal);
    generalRoll.difficulty = parseInt(this.object.difficulty);
    generalRoll.speciality = this.object.useSpeciality;
    generalRoll.usewillpower = this.object.useWillpower;
    generalRoll.specialityText = specialityText;

    // --- Our injection point: use the patched DiceRoller if available ---

    const diceRoller = resolveDiceRoller();

    if (typeof diceRoller === "function") {
      try {
        // The system DiceRoller is async, but the original code does not await it,
        // so we keep the same pattern here.
        diceRoller(generalRoll);
      } catch (error) {
        console.error(
          "Fate Override | Error while executing resolved DiceRoller",
          error
        );
      }
    } else {
      console.error(
        "Fate Override | No valid DiceRoller to execute general roll"
      );
    }

    this.object.close = true;

    console.log("Fate Override | Overridden DialogGeneralRoll._generalRoll finished", {
      appId: this.appId
    });
  };

  console.log(
    "Fate Override | DialogGeneralRoll._generalRoll successfully overridden to use Fate DiceRoller"
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Hooks.once("init", () => {
  console.log(
    "Fate Override | init hook fired, attempting to override DialogGeneralRoll._generalRoll"
  );

  try {
    installDialogGeneralRollOverride();
  } catch (error) {
    console.error(
      "Fate Override | Unexpected error during DialogGeneralRoll override installation",
      error
    );
  }
});

console.log("Fate Override | DialogGeneralRoll._generalRoll override module loaded");
