// scripts/fate-hooks-dialog-power.js
//
// Fate Hooks — Power Dialog Checkbox (Disciplines / Paths / Rituals)
//
// - Adds "Use Fate" checkbox into the power roll dialog (vampires only)
// - Places it directly under the existing "Use Willpower" checkbox row
// - Only when the dialog belongs to a vampire (sheettype = vampireDialog)
// - Stores useFate / fateDice on the dialog object (this.object)
// - Does NOT touch roll mechanics; only prepares data for the patch layer

console.log("Fate Hooks | Power Dialog Checkbox module loading");

import { isFateEnabled } from "./settings.js";
import { FateData } from "./fate-data.js";

Hooks.once("init", () => {
  console.log(
    "Fate Hooks | Power Dialog Checkbox init: registering renderDialogPower hook"
  );

  Hooks.on("renderDialogPower", (app, html, data) => {
    try {
      handlePowerDialogRender(app, html, data);
    } catch (error) {
      console.error(
        "Fate Hooks | Power Dialog Checkbox: unexpected error during renderDialogPower",
        error
      );
    }
  });
});

/**
 * Main handler for Power dialog rendering.
 * @param {FormApplication} app
 * @param {JQuery} html
 * @param {any} data
 */
function handlePowerDialogRender(app, html, data) {
  const rollObject = app.object || {};
  const actor = app.actor;

  console.log("Fate Hooks | Power Dialog Checkbox: renderDialogPower fired", {
    appId: app?.appId,
    objectType: rollObject?.type,
    objectSheetType: rollObject?.sheettype,
    actorPresent: !!actor,
    actorId: actor?.id,
    actorName: actor?.name,
    actorType: actor?.type
  });

  if (!isFateEnabled()) {
    console.log(
      "Fate Hooks | Power Dialog Checkbox: Fate system is disabled, skipping UI injection"
    );
    return;
  }

  if (!actor) {
    console.warn(
      "Fate Hooks | Power Dialog Checkbox: app.actor is missing, cannot apply Fate UI"
    );
    return;
  }

  if (!FateData.isVampire(actor)) {
    console.log(
      "Fate Hooks | Power Dialog Checkbox: actor is not vampire, Fate not applicable",
      { actorId: actor.id, actorType: actor.type }
    );
    return;
  }

  // Ограничимся вампирской диалоговой формой
  const vampireSheetType = CONFIG.worldofdarkness?.sheettype?.vampire;
  const isVampireDialog =
    rollObject.sheettype === "vampireDialog" ||
    (vampireSheetType && actor.type === vampireSheetType);

  if (!isVampireDialog) {
    console.log(
      "Fate Hooks | Power Dialog Checkbox: sheettype is not vampireDialog, skipping",
      { rollSheettype: rollObject.sheettype, actorType: actor.type }
    );
    return;
  }

  // Initialize state on the dialog object if missing
  if (rollObject.useFate == null) {
    rollObject.useFate = false;
  }
  if (rollObject.fateDice == null) {
    rollObject.fateDice = 0;
  }

  injectFateCheckboxIntoPowerDialog(app, html, rollObject, actor);
}

/**
 * Inject Fate checkbox into the Power dialog UI.
 * We attach it directly under the existing "useWillpower" checkbox row.
 *
 * @param {FormApplication} app
 * @param {JQuery} html
 * @param {any} rollObject
 * @param {Actor} actor
 */
function injectFateCheckboxIntoPowerDialog(app, html, rollObject, actor) {
  const willpowerInput = html.find('input[name="useWillpower"]').first();

  console.log(
    "Fate Hooks | Power Dialog Checkbox: searching for useWillpower row",
    {
      found: willpowerInput.length > 0
    }
  );

  if (!willpowerInput.length) {
    console.warn(
      "Fate Hooks | Power Dialog Checkbox: useWillpower input not found, cannot inject Fate UI",
      {
        appId: app.appId,
        actorId: actor.id,
        actorName: actor.name
      }
    );
    return;
  }

  const willpowerRow = willpowerInput.closest(".dialog-checkbox");
  if (!willpowerRow.length) {
    console.warn(
      "Fate Hooks | Power Dialog Checkbox: parent .dialog-checkbox for useWillpower not found, cannot inject Fate UI",
      {
        appId: app.appId,
        actorId: actor.id,
        actorName: actor.name
      }
    );
    return;
  }

  // Avoid injecting twice on re-render
  const existingRow = html.find(".wod20ru-fate-power-row");
  if (existingRow.length) {
    console.log(
      "Fate Hooks | Power Dialog Checkbox: Fate row already present, skipping reinjection",
      { existingCount: existingRow.length }
    );
    return;
  }

  const fateLabel =
    game.i18n.localize("WOD20RU.UseFate")

  const checkedAttribute = rollObject.useFate ? 'checked="checked"' : "";

  console.log("Fate Hooks | Power Dialog Checkbox: creating Fate row", {
    fateLabel,
    initialUseFate: rollObject.useFate,
    initialFateDice: rollObject.fateDice
  });

  const fateRow = $(`
    <div class="clearareaBox infobox dialog-checkbox wod20ru-fate-power-row">
      <div class="pullLeft">
        <input
          type="checkbox"
          class="wod20ru-fate-power-checkbox"
          data-wod20ru-fate="useFate"
          ${checkedAttribute}
        />
      </div>
      <div class="pullLeft">
        <label class="dialog-casting-type-label">
          ${fateLabel}
        </label>
      </div>
    </div>
  `);

  willpowerRow.after(fateRow);

  console.log(
    "Fate Hooks | Power Dialog Checkbox: Fate row injected under useWillpower row",
    { appId: app.appId }
  );

  const checkbox = fateRow.find(".wod20ru-fate-power-checkbox");
  checkbox.on("change", (event) => {
    const input = event.currentTarget;
    const checked = !!input.checked;

    const fateData = FateData.getFateData(actor);
    const rawFateValue =
      fateData?.value ??
      actor.system?.fate?.value ??
      actor.data?.data?.fate?.value ??
      0;

    const fateValue = normalizeNonNegativeInteger(rawFateValue);

    rollObject.useFate = checked;
    rollObject.fateDice = checked ? fateValue : 0;

    console.log("Fate Hooks | Power Dialog Checkbox: useFate checkbox changed", {
      appId: app.appId,
      actorId: actor.id,
      actorName: actor.name,
      checked,
      fateValueRaw: rawFateValue,
      fateValueNormalized: fateValue,
      rollObjectUseFate: rollObject.useFate,
      rollObjectFateDice: rollObject.fateDice
    });
  });
}

/**
 * Normalize value to a non-negative integer.
 * @param {unknown} value
 * @returns {number}
 */
function normalizeNonNegativeInteger(value) {
  if (Number.isFinite(value)) {
    const n = value | 0;
    return n < 0 ? 0 : n;
  }

  const parsed = parseInt(value ?? 0, 10);
  if (Number.isNaN(parsed)) return 0;
  return parsed < 0 ? 0 : parsed;
}

console.log("Fate Hooks | Power Dialog Checkbox module loaded");
