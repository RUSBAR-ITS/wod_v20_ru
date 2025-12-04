// scripts/fate-hooks-dialog-weapon.js
//
// Fate Hooks — Weapon Dialog Checkbox
//
// - Adds "Use Fate" checkbox into the weapon attack roll dialog (vampires only)
// - Places it directly under the existing "Use Willpower" checkbox row
// - Only for attack rolls (weaponType != "Damage")
// - Stores useFate / fateDice on the dialog object (this.object)
// - Does NOT touch roll mechanics; only prepares data for the patch layer

console.log("Fate Hooks | Weapon Dialog Checkbox module loading");

import { isFateEnabled } from "./settings.js";
import { FateData } from "./fate-data.js";

Hooks.once("init", () => {
  console.log(
    "Fate Hooks | Weapon Dialog Checkbox init: registering renderDialogWeapon hook"
  );

  Hooks.on("renderDialogWeapon", (app, html, data) => {
    try {
      handleWeaponDialogRender(app, html, data);
    } catch (error) {
      console.error(
        "Fate Hooks | Weapon Dialog Checkbox: unexpected error during renderDialogWeapon",
        error
      );
    }
  });
});

/**
 * Main handler for Weapon dialog rendering.
 * @param {FormApplication} app
 * @param {JQuery} html
 * @param {any} data
 */
function handleWeaponDialogRender(app, html, data) {
  console.log("Fate Hooks | Weapon Dialog Checkbox: renderDialogWeapon fired", {
    appId: app?.appId,
    objectWeaponType: app?.object?.weaponType,
    objectSheetType: app?.object?.sheettype,
    actorPresent: !!app?.actor,
    actorId: app?.actor?.id,
    actorName: app?.actor?.name,
    actorType: app?.actor?.type
  });

  if (!isFateEnabled()) {
    console.log(
      "Fate Hooks | Weapon Dialog Checkbox: Fate system is disabled, skipping UI injection"
    );
    return;
  }

  const actor = app.actor;
  if (!actor) {
    console.warn(
      "Fate Hooks | Weapon Dialog Checkbox: app.actor is missing, cannot apply Fate UI"
    );
    return;
  }

  const rollObject = app.object || {};
  const weaponType = rollObject.weaponType || "";

  // Fate только на попадание, урон не трогаем
  if (weaponType === "Damage") {
    console.log(
      "Fate Hooks | Weapon Dialog Checkbox: weaponType is Damage, Fate not applicable here",
      { weaponType }
    );
    return;
  }

  if (!FateData.isVampire(actor)) {
    console.log(
      "Fate Hooks | Weapon Dialog Checkbox: actor is not vampire, Fate not applicable",
      { actorId: actor.id, actorType: actor.type }
    );
    return;
  }

  const vampireSheetType = CONFIG.worldofdarkness?.sheettype?.vampire;

  console.log("Fate Hooks | Weapon Dialog Checkbox: current roll object summary", {
    sheettype: rollObject.sheettype,
    actorType: actor.type,
    vampireSheetType,
    weaponType,
    hasUseFate: Object.prototype.hasOwnProperty.call(rollObject, "useFate"),
    hasFateDice: Object.prototype.hasOwnProperty.call(rollObject, "fateDice")
  });

  // Дополнительно ограничиваемся вампирской листой, если она закодирована
  if (vampireSheetType && actor.type !== vampireSheetType) {
    console.log(
      "Fate Hooks | Weapon Dialog Checkbox: actor.type is not vampire sheettype, skipping",
      { actorType: actor.type, vampireSheetType }
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

  console.log("Fate Hooks | Weapon Dialog Checkbox: normalized roll object state", {
    useFate: rollObject.useFate,
    fateDice: rollObject.fateDice
  });

  injectFateCheckboxIntoWeaponDialog(app, html, rollObject, actor);
}

/**
 * Inject Fate checkbox into the Weapon dialog UI (attack only).
 * We attach it directly under the existing "useWillpower" checkbox row.
 *
 * @param {FormApplication} app
 * @param {JQuery} html
 * @param {any} rollObject
 * @param {Actor} actor
 */
function injectFateCheckboxIntoWeaponDialog(app, html, rollObject, actor) {
  // Ищем строку с чекбоксом "useWillpower" как якорь
  const willpowerInput = html.find('input[name="useWillpower"]').first();

  console.log(
    "Fate Hooks | Weapon Dialog Checkbox: searching for useWillpower row",
    {
      found: willpowerInput.length > 0
    }
  );

  if (!willpowerInput.length) {
    console.warn(
      "Fate Hooks | Weapon Dialog Checkbox: useWillpower input not found, cannot inject Fate UI",
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
      "Fate Hooks | Weapon Dialog Checkbox: parent .dialog-checkbox for useWillpower not found, cannot inject Fate UI",
      {
        appId: app.appId,
        actorId: actor.id,
        actorName: actor.name
      }
    );
    return;
  }

  // Avoid injecting twice on re-render
  const existingRow = html.find(".wod20ru-fate-weapon-row");
  if (existingRow.length) {
    console.log(
      "Fate Hooks | Weapon Dialog Checkbox: Fate row already present, skipping reinjection",
      { existingCount: existingRow.length }
    );
    return;
  }

  const fateLabel =
    game.i18n.localize("WOD20RU.UseFate")

  const checkedAttribute = rollObject.useFate ? 'checked="checked"' : "";

  console.log("Fate Hooks | Weapon Dialog Checkbox: creating Fate row", {
    fateLabel,
    initialUseFate: rollObject.useFate,
    initialFateDice: rollObject.fateDice
  });

  const fateRow = $(`
    <div class="clearareaBox infobox dialog-checkbox wod20ru-fate-weapon-row">
      <div class="pullLeft">
        <input
          type="checkbox"
          class="wod20ru-fate-weapon-checkbox"
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
    "Fate Hooks | Weapon Dialog Checkbox: Fate row injected under useWillpower row",
    { appId: app.appId }
  );

  const checkbox = fateRow.find(".wod20ru-fate-weapon-checkbox");
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

    console.log("Fate Hooks | Weapon Dialog Checkbox: useFate checkbox changed", {
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

console.log("Fate Hooks | Weapon Dialog Checkbox module loaded");
