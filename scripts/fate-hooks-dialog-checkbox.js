/**
 * Fate Hooks — Dialog Checkbox
 *
 * - Добавляет чекбокс "Использовать Fate" в общий диалог броска
 * - Держит состояние useFate / fateDice на объекте броска (this.object)
 * - Ничего не меняет в механике броска, только подготавливает данные
 */

console.log("Fate Hooks | Dialog Checkbox module loading");

import { isFateEnabled } from "./settings.js";

Hooks.once("init", () => {
  console.log(
    "Fate Hooks | Dialog Checkbox init: registering renderDialogGeneralRoll hook"
  );

  Hooks.on("renderDialogGeneralRoll", (app, html, data) => {
    console.log("Fate Hooks | renderDialogGeneralRoll fired", {
      appId: app.appId,
      actor: app.actor
        ? { id: app.actor.id, name: app.actor.name, type: app.actor.type }
        : null,
      hasObject: !!app.object,
      isFateEnabled: isFateEnabled()
    });

    try {
      handleRenderDialogGeneralRoll(app, html, data);
    } catch (error) {
      console.error(
        "Fate Hooks | Failed in renderDialogGeneralRoll handler",
        error
      );
    }
  });

  console.log("Fate Hooks | Dialog Checkbox init complete");
});

function handleRenderDialogGeneralRoll(app, html, data) {
  if (!isFateEnabled()) {
    console.log("Fate Hooks | Fate disabled, abort checkbox insert");
    return;
  }

  // В WoD20 actor лежит внутри объекта броска
  const actor = app.actor ?? app.object?.actor;
  console.log("Fate Hooks | actor resolved for dialog", {
    actor: actor
      ? { id: actor.id, name: actor.name, type: actor.type }
      : null
  });

  if (!actor?.system) {
    console.log("Fate Hooks | No actor.system on dialog, abort");
    return;
  }

  const fate = actor.system.fate;
  console.log(
    "Fate Hooks | actor.system.fate (for checkbox) =",
    fate
  );

  if (!fate || !fate.value || fate.value <= 0) {
    console.log("Fate Hooks | No Fate value on actor, abort");
    return;
  }

  const fateValue = fate.value ?? 0;

  // Гарантируем наличие объекта броска на диалоге
  if (!app.object) {
    console.log("Fate Hooks | app.object missing, creating empty roll object");
    app.object = {};
  }

  // Инициализируем локальное состояние Fate на объекте броска
  if (typeof app.object.useFate !== "boolean") {
    app.object.useFate = false;
  }

  if (typeof app.object.fateDice !== "number") {
    app.object.fateDice = app.object.useFate ? fateValue : 0;
  }

  console.log("Fate Hooks | initial Fate state on dialog object", {
    useFate: app.object.useFate,
    fateDice: app.object.fateDice,
    isFateRoll: app.object.isFate === true
  });

  // Для чистого Fate-броска чекбокс не показываем
  if (app.object?.isFate === true) {
    console.log(
      "Fate Hooks | Pure Fate roll detected (isFate === true), skip checkbox"
    );
    return;
  }

  const rollKey = app.object?.key;

  // --- WOD20RU: Fate checkbox for pure Willpower roll (after Dice Pool) ---
  if (rollKey === "willpower") {
    console.log(
      "Fate Hooks | Willpower roll detected, inserting Fate checkbox after Dice Pool"
    );

    // Не вставляем второй раз
    if (html.find(".wod20ru-fate-checkbox").length > 0) {
      console.log(
        "Fate Hooks | Willpower Fate checkbox already present, skip"
      );
      return;
    }

    // Ищем блок «Пул кубов» (dicepool) и используем его как якорь
    const dicePoolArea = html
      .find(".dialog-area")
      .filter((i, el) => {
        const headline = $(el)
          .find(".infobox.headline")
          .text()
          .trim();
        return headline === game.i18n.localize("wod.dialog.dicepool");
      })
      .first();

    if (!dicePoolArea.length) {
      console.log(
        "Fate Hooks | Dice Pool area not found for Willpower dialog, abort"
      );
      return;
    }

    const localizedLabel = game.i18n.localize("WOD20RU.UseFate");

    const fateHtml = $(`
      <div class="dialog-area wod20ru-fate-checkbox">
        <div class="clearareaBox infobox dialog-checkbox">
          <div class="pullLeft">
            <input type="checkbox"
                   id="wod20ru-use-fate-willpower"
                   name="useFate">
          </div>
          <div class="pullLeft">
            <label class="dialog-casting-type-label"
                   for="wod20ru-use-fate-willpower">
              ${localizedLabel}
            </label>
          </div>
        </div>
      </div>
    `);

    const initialChecked = !!app.object.useFate;
    fateHtml.find('input[name="useFate"]').prop("checked", initialChecked);

    // Вставляем сразу после блока «Пул кубов»
    dicePoolArea.after(fateHtml);
    console.log(
      "Fate Hooks | Willpower Fate checkbox inserted after Dice Pool"
    );

    const checkbox = fateHtml.find('input[name="useFate"]');
    checkbox.on("change", (event) => {
      const checked = event.currentTarget.checked;
      const currentFateValue = Number(fateValue) || 0;

      app.object.useFate = checked;
      app.object.fateDice = checked ? currentFateValue : 0;

      console.log("Fate Hooks | Willpower Fate checkbox changed", {
        checked,
        useFate: app.object.useFate,
        fateDice: app.object.fateDice
      });
    });

    // Для диалога Воли дальше ничего не делаем
    return;
  }

  // Ищем чекбокс "Использовать Силу Воли", вставляем Fate прямо под ним
  const wpInput = html.find('input[name="useWillpower"]').first();
  console.log(
    "Fate Hooks | useWillpower inputs found:",
    wpInput.length
  );

  if (!wpInput.length) {
    console.log(
      "Fate Hooks | Willpower checkbox not found, abort Fate checkbox insert"
    );
    return;
  }

  const wpBox = wpInput.closest(".clearareaBox");
  if (!wpBox.length) {
    console.log("Fate Hooks | wpBox container not found, abort");
    return;
  }

  const localizedLabel = game.i18n.localize("WOD20RU.UseFate");
  console.log(
    "Fate Hooks | Inserting Fate checkbox with label:",
    localizedLabel
  );

  const fateHtml = $(`
    <div class="clearareaBox infobox dialog-checkbox wod-fate-checkbox">
      <div class="pullLeft">
        <input type="checkbox" name="useFate">
      </div>
      <div class="pullLeft">
        <label class="dialog-casting-type-label">${localizedLabel}</label>
      </div>
    </div>
  `);

  // Вставляем блок сразу после блока воли
  fateHtml.insertAfter(wpBox);
  console.log("Fate Hooks | Fate checkbox inserted into DOM");

  const checkbox = fateHtml.find('input[name="useFate"]');

  // Инициализация состояния чекбокса из объекта броска
  const initialChecked = !!app.object?.useFate;
  checkbox.prop("checked", initialChecked);

  console.log("Fate Hooks | Fate checkbox initial state", {
    checked: initialChecked,
    useFate: app.object?.useFate,
    fateDice: app.object?.fateDice
  });

  // Обработчик изменения чекбокса
  checkbox.on("change", (event) => {
    const checked = event.currentTarget.checked;

    if (app.object) {
      app.object.useFate = checked;
      app.object.fateDice = checked ? fateValue : 0;
    }

    console.log("Fate Hooks | useFate checkbox changed", {
      actor: actor ? { id: actor.id, name: actor.name } : null,
      checked,
      useFate: app.object?.useFate,
      fateDice: app.object?.fateDice,
      fateValue
    });
  });
}

console.log("Fate Hooks | Dialog Checkbox module loaded");
