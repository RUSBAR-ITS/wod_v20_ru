// fate-hooks-dialog-item.js
// Добавляет чекбокс "Use Fate" в диалог броска предмета (DialogItem),
// если у актёра есть шкала Fate.

import { isFateEnabled } from "./settings.js";

console.log("Fate Hooks | Item Dialog Checkbox module loading");

Hooks.on("init", () => {
  console.log(
    "Fate Hooks | Item Dialog Checkbox init: registering renderDialogItem hook"
  );

  Hooks.on("renderDialogItem", (app, html, data) => {
    console.log(
      "Fate Hooks | Item Dialog Checkbox: renderDialogItem fired",
      {
        appId: app.appId,
        objectType: app.object?.constructor?.name ?? typeof app.object,
        objectSheetType: app.object?.sheettype,
        actorPresent: !!app.actor,
        actorId: app.actor?.id ?? data.actorId ?? null
      }
    );

    // 1) Fate вообще включён?
    const fateEnabled = isFateEnabled();
    console.log("Fate Hooks | Item Dialog Checkbox: isFateEnabled ->", fateEnabled);
    if (!fateEnabled) {
      return;
    }

    // 2) Получаем актёра
    const actor =
      app.actor ??
      (data.actorId ? game.actors.get(data.actorId) : null) ??
      null;

    if (!actor) {
      console.warn(
        "Fate Hooks | Item Dialog Checkbox: no actor found for DialogItem, skipping"
      );
      return;
    }

    // 3) Проверяем, что у актёра есть шкала Fate
    const hasFateTrack = !!actor.system?.fate;
    console.log(
      "Fate Hooks | Item Dialog Checkbox: actor fate track present ->",
      hasFateTrack
    );

    if (!hasFateTrack) {
      // Никакой дискриминации по типу предмета / листа, только по наличию трека Fate
      return;
    }

    // 4) Получаем объект броска (тот же объект, который крутит DialogItem)
    const rollObject = app.object ?? data.object ?? {};
    if (!rollObject) {
      console.warn(
        "Fate Hooks | Item Dialog Checkbox: roll object missing, skipping"
      );
      return;
    }

    // 5) Находим строку с Willpower, под неё будем вставлять Fate
    const willpowerInput = html.find('input[name="useWillpower"]');

    if (!willpowerInput.length) {
      console.warn(
        "Fate Hooks | Item Dialog Checkbox: useWillpower row not found, skipping"
      );
      return;
    }

    const willpowerRow = willpowerInput.closest(".dialog-checkbox");
    if (!willpowerRow.length) {
      console.warn(
        "Fate Hooks | Item Dialog Checkbox: cannot resolve useWillpower row container, skipping"
      );
      return;
    }

    // 6) Удаляем ранее вставленную строку, если она была (на случай повторного render)
    html.find(".fate-dialog-item-row").remove();

    // 7) Убеждаемся, что в объекте есть флаг useFate
    if (!Object.prototype.hasOwnProperty.call(rollObject, "useFate")) {
      rollObject.useFate = false;
    }

    const isChecked = !!rollObject.useFate;

    // 8) Вставляем строку Fate под Willpower
    const labelText =
      game.i18n.localize("WOD20RU.UseFate");

    const fateRow = $(`
      <div class="clearareaBox infobox dialog-checkbox fate-dialog-item-row">
        <div class="pullLeft">
          <input
            name="useFate"
            type="checkbox"
            ${isChecked ? 'checked="checked"' : ""}
          />
        </div>
        <div class="pullLeft">
          <label for="useFate" class="dialog-casting-type-label">
            ${labelText}
          </label>
        </div>
      </div>
    `);

    willpowerRow.after(fateRow);

    // 9) Синхронизируем чекбокс и rollObject.useFate
    const fateCheckbox = fateRow.find('input[name="useFate"]');
    fateCheckbox.on("change", (event) => {
      const checked = event.currentTarget.checked;
      rollObject.useFate = checked;

      console.log(
        "Fate Hooks | Item Dialog Checkbox: useFate changed",
        { useFate: checked }
      );
    });

    console.log(
      "Fate Hooks | Item Dialog Checkbox: Fate checkbox injected into DialogItem",
      {
        useFate: rollObject.useFate
      }
    );
  });

  console.log("Fate Hooks | Item Dialog Checkbox init complete");
});

console.log("Fate Hooks | Item Dialog Checkbox module loaded");
