/**
 * Fate Hooks — Dialog Patch
 *
 * - Патчит DialogGeneralRoll.getData:
 *   если это Fate-бросок (roll.isFate === true), подменяем имя/значение атрибута
 *   на Fate, отключаем специализацию.
 * - Патчит DialogGeneralRoll.RollDice только для логирования:
 *   логирует состояние Fate прямо перед оригинальным DiceRoller.
 *
 * НИЧЕГО не меняет в логике броска кроме подготовки данных
 * для шаблона и логов.
 */

console.log("Fate Hooks | Dialog Patch module loading");

import { isFateEnabled } from "./settings.js";
import { FateData } from "./fate-data.js";
import {
  DialogGeneralRoll
} from "../../../systems/worldofdarkness/module/dialogs/dialog-generalroll.js";

(function patchDialogGeneralRollForFate() {
  const proto = DialogGeneralRoll.prototype;

  if (proto._wodV20RuFatePatched) {
    console.log(
      "Fate Hooks | Dialog Patch: DialogGeneralRoll already patched, skip"
    );
    return;
  }

  const originalGetData = proto.getData;
  const originalRollDice = proto.RollDice;

  // ---------------------------------------------------------------------------
  // Патч getData: если это Fate-бросок, подменяем отображаемый атрибут
  // ---------------------------------------------------------------------------

  proto.getData = async function (...args) {
    const data = await originalGetData.call(this, ...args);

    try {
      const actor = this.actor;
      const isFateRoll = this.object?.isFate === true;

      console.log("Fate Hooks | Dialog Patch getData", {
        actor: actor
          ? { id: actor.id, name: actor.name, type: actor.type }
          : null,
        isFateRoll,
        fateEnabled: isFateEnabled(),
        objectState: {
          attributeName: this.object?.attributeName,
          attributeValue: this.object?.attributeValue,
          useFate: this.object?.useFate,
          fateDice: this.object?.fateDice
        },
        dataObject: {
          attributeName: data?.object?.attributeName,
          attributeValue: data?.object?.attributeValue
        }
      });

      if (isFateEnabled() && isFateRoll && actor) {
        const fateData = FateData.getFateData(actor);
        const label = game.i18n.localize("WOD20RU.Fate");
        const value = fateData?.value ?? 0;

        // То, что увидит шаблон
        if (data.object) {
          data.object.attributeName = label;
          data.object.attributeValue = value;
          data.object.name = label;
          data.object.hasSpeciality = false;
        }

        // И сам объект диалога (для дальнейшей логики)
        if (this.object) {
          this.object.attributeName = label;
          this.object.attributeValue = value;
          this.object.name = label;
          this.object.hasSpeciality = false;
          this.object.useSpeciality = false;
        }

        console.log(
          "Fate Hooks | Dialog Patch getData: pure Fate override applied",
          {
            label,
            value
          }
        );
      }
    } catch (e) {
      console.error(
        "Fate Hooks | Dialog Patch getData: error in Fate override",
        e
      );
    }

    return data;
  };

  // ---------------------------------------------------------------------------
  // Патч RollDice: только логирование состояния Fate перед броском
  // ---------------------------------------------------------------------------

  proto.RollDice = function (...args) {
    try {
      console.log("Fate Hooks | Dialog Patch RollDice BEFORE original", {
        actor: this.actor
          ? { id: this.actor.id, name: this.actor.name, type: this.actor.type }
          : null,
        isFateRoll: this.object?.isFate === true,
        useFate: this.object?.useFate,
        fateDice: this.object?.fateDice,
        origin: this.object?.origin,
        attribute: this.object?.attribute,
        ability: this.object?.ability
      });
    } catch (e) {
      console.error(
        "Fate Hooks | Dialog Patch RollDice: error while logging BEFORE",
        e
      );
    }

    const result = originalRollDice.call(this, ...args);

    try {
      console.log("Fate Hooks | Dialog Patch RollDice AFTER original", {
        actor: this.actor
          ? { id: this.actor.id, name: this.actor.name }
          : null
      });
    } catch (e) {
      console.error(
        "Fate Hooks | Dialog Patch RollDice: error while logging AFTER",
        e
      );
    }

    return result;
  };

  proto._wodV20RuFatePatched = true;
  console.log(
    "Fate Hooks | Dialog Patch: DialogGeneralRoll patched (getData + RollDice)"
  );
})();

console.log("Fate Hooks | Dialog Patch module loaded");
