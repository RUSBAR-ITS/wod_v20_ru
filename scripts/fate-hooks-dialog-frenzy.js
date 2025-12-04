/**
 * Fate Hooks — Frenzy Dialog Checkbox
 *
 * - Adds "Use Fate" checkbox into the Frenzy check dialog (vampires only)
 * - Stores useFate / fateDice on the dialog object (this.object)
 * - Does NOT touch roll mechanics; only prepares data for the patch layer
 */

console.log("Fate Hooks | Frenzy Dialog Checkbox module loading");

import { isFateEnabled } from "./settings.js";
import { FateData } from "./fate-data.js";

Hooks.once("init", () => {
  console.log(
    "Fate Hooks | Frenzy Dialog Checkbox init: registering renderDialogCheckFrenzy hook"
  );

  Hooks.on("renderDialogCheckFrenzy", (app, html, data) => {
    try {
      handleFrenzyDialogRender(app, html, data);
    } catch (error) {
      console.error(
        "Fate Hooks | Frenzy Dialog Checkbox: unexpected error during renderDialogCheckFrenzy",
        error
      );
    }
  });
});

/**
 * Main handler for Frenzy dialog rendering.
 * @param {FormApplication} app
 * @param {JQuery} html
 * @param {any} data
 */
function handleFrenzyDialogRender(app, html, data) {
  console.log("Fate Hooks | Frenzy Dialog Checkbox: renderDialogCheckFrenzy fired", {
    appId: app?.appId,
    objectType: app?.object?.type,
    actorPresent: !!app?.actor,
    actorId: app?.actor?.id,
    actorName: app?.actor?.name,
    actorType: app?.actor?.type
  });

  if (!isFateEnabled()) {
    console.log(
      "Fate Hooks | Frenzy Dialog Checkbox: Fate system is disabled, skipping UI injection"
    );
    return;
  }

  const actor = app.actor;
  if (!actor) {
    console.warn(
      "Fate Hooks | Frenzy Dialog Checkbox: app.actor is missing, cannot apply Fate UI"
    );
    return;
  }

  if (!FateData.isVampire(actor)) {
    console.log(
      "Fate Hooks | Frenzy Dialog Checkbox: actor is not vampire, Fate not applicable",
      { actorId: actor.id, actorType: actor.type }
    );
    return;
  }

  const rollObject = app.object || {};
  const vampireSheetType = CONFIG.worldofdarkness?.sheettype?.vampire;

  console.log("Fate Hooks | Frenzy Dialog Checkbox: current roll object summary", {
    knownType: rollObject.type,
    vampireSheetType,
    hasUseFate: Object.prototype.hasOwnProperty.call(rollObject, "useFate"),
    hasFateDice: Object.prototype.hasOwnProperty.call(rollObject, "fateDice")
  });

  // Only touch vampire Frenzy dialogs
  if (vampireSheetType && rollObject.type !== vampireSheetType) {
    console.log(
      "Fate Hooks | Frenzy Dialog Checkbox: roll object type is not vampire, skipping",
      { rollObjectType: rollObject.type, vampireSheetType }
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

  console.log("Fate Hooks | Frenzy Dialog Checkbox: normalized roll object state", {
    useFate: rollObject.useFate,
    fateDice: rollObject.fateDice
  });

  injectFateCheckboxIntoFrenzyDialog(app, html, rollObject, actor);
}

/**
 * Inject Fate checkbox into the Frenzy dialog UI.
 * We attach it right after the "Difficulty" headline block.
 *
 * @param {FormApplication} app
 * @param {JQuery} html
 * @param {any} rollObject
 * @param {Actor} actor
 */
function injectFateCheckboxIntoFrenzyDialog(app, html, rollObject, actor) {
  const targetHeadlineText = game.i18n.localize("wod.labels.difficulty");

  console.log(
    "Fate Hooks | Frenzy Dialog Checkbox: searching for difficulty headline",
    {
      targetHeadlineText,
      headlineCount: html.find(".headline").length
    }
  );

  let targetArea = null;

  html.find(".headline").each((index, element) => {
    const $headline = $(element);
    const text = $headline.text().trim();

    console.log(
      "Fate Hooks | Frenzy Dialog Checkbox: inspecting headline",
      { index, text }
    );

    if (!targetArea && text === targetHeadlineText) {
      const area = $headline.closest(".dialog-area");
      if (area.length) {
        targetArea = area;
        console.log(
          "Fate Hooks | Frenzy Dialog Checkbox: matched difficulty headline",
          { index, text }
        );
      }
    }
  });

  if (!targetArea || !targetArea.length) {
    console.warn(
      "Fate Hooks | Frenzy Dialog Checkbox: difficulty headline not found, cannot inject Fate UI",
      {
        appId: app.appId,
        actorId: actor.id,
        actorName: actor.name
      }
    );
    return;
  }

  // Avoid injecting twice if dialog re-renders
  const existingArea = html.find(".wod20ru-fate-frenzy-area");
  if (existingArea.length) {
    console.log(
      "Fate Hooks | Frenzy Dialog Checkbox: Fate area already present, skipping reinjection",
      { existingCount: existingArea.length }
    );
    return;
  }

  const fateLabel =
    game.i18n.localize("WOD20RU.UseFateForFrenzy") ||
    game.i18n.localize("WOD20RU.UseFate");
  const fateHeadline =
    game.i18n.localize("WOD20RU.FateHeadlineForFrenzy") ||
    game.i18n.localize("WOD20RU.Fate");

  const checkedAttribute = rollObject.useFate ? 'checked="checked"' : "";

  console.log("Fate Hooks | Frenzy Dialog Checkbox: creating Fate area", {
    fateLabel,
    fateHeadline,
    initialUseFate: rollObject.useFate,
    initialFateDice: rollObject.fateDice
  });

  const fateArea = $(`
    <div class="dialog-area wod20ru-fate-frenzy-area">
      <div class="headline splatFont">${fateHeadline}</div>
      <div class="dialog-row wod20ru-fate-frenzy-row">
        <label class="wod20ru-fate-frenzy-label">
          <input
            type="checkbox"
            class="wod20ru-fate-frenzy-checkbox"
            data-wod20ru-fate="useFate"
            ${checkedAttribute}
          />
          ${fateLabel}
        </label>
      </div>
    </div>
  `);

  targetArea.after(fateArea);

  console.log(
    "Fate Hooks | Frenzy Dialog Checkbox: Fate area injected after difficulty block",
    { appId: app.appId }
  );

  const checkbox = fateArea.find(".wod20ru-fate-frenzy-checkbox");
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

    console.log(
      "Fate Hooks | Frenzy Dialog Checkbox: useFate checkbox changed",
      {
        appId: app.appId,
        actorId: actor.id,
        actorName: actor.name,
        checked,
        fateValueRaw: rawFateValue,
        fateValueNormalized: fateValue,
        rollObjectUseFate: rollObject.useFate,
        rollObjectFateDice: rollObject.fateDice
      }
    );
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

console.log("Fate Hooks | Frenzy Dialog Checkbox module loaded");
