// scripts/fate-patch-dialog-item.js
//
// Hard override for DialogItem._rollPower
//
// Цели:
// 1) Перед броском предмета прочитать флаги Fate (useFate / fateDice) из this.object
//    и записать их в fateState для соответствующего актёра (как в Soak/Weapon/Power).
// 2) НЕ вызывать системный DiceRoller из dialog-item.js, а вместо этого
//    самостоятельно собрать DiceRollContainer и кинуть его через патченный
//    Fate-совместимый DiceRoller (WOD20RU_DiceRoller / game.worldofdarkness.DiceRoller).
//
// При этом:
// - Логика вычисления пула и текста полностью повторяет системный _rollPower
//   из /systems/worldofdarkness/module/dialogs/dialog-item.js.
// - Остальные методы DialogItem не трогаем.

console.log("Fate Patch | DialogItem._rollPower hard override module loading");

import { isFateEnabled } from "./settings.js";
import { fateState } from "./fate-state.js";
import { FateData } from "./fate-data.js";

import { DialogItem } from "/systems/worldofdarkness/module/dialogs/dialog-item.js";
import { DiceRollContainer } from "/systems/worldofdarkness/module/scripts/roll-dice.js";
import CombatHelper from "/systems/worldofdarkness/module/scripts/combat-helpers.js";

let OriginalItemRollMethod =
  /** @type {((this: any, ev: Event) => any) | null} */ (null);

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
 * Получить Fate-значение для актёра (базовое количество кубов Fate).
 * @param {Actor} actor
 */
function getActorFateValue(actor) {
  const fateData = FateData.getFateData(actor);
  const raw =
    fateData?.value ??
    actor.system?.fate?.value ??
    actor.data?.data?.fate?.value ??
    0;

  return toInt(raw);
}

/**
 * Попробовать получить Fate-совместимый DiceRoller.
 * Порядок:
 *  - глобальный WOD20RU_DiceRoller (наш патч)
 *  - game.worldofdarkness.DiceRoller (уже патченный fate-dice-roller'ом)
 * @returns {((diceRoll: any) => Promise<number>) | null}
 */
function resolvePatchedDiceRoller() {
  const globalPatched = globalThis.WOD20RU_DiceRoller;
  const systemPatched = game.worldofdarkness?.DiceRoller;

  if (typeof globalPatched === "function") {
    console.log(
      "Fate Patch | Item: using global WOD20RU_DiceRoller as patched DiceRoller"
    );
    return globalPatched;
  }

  if (typeof systemPatched === "function") {
    console.log(
      "Fate Patch | Item: using game.worldofdarkness.DiceRoller as patched DiceRoller"
    );
    return systemPatched;
  }

  console.warn(
    "Fate Patch | Item: no patched DiceRoller found (WOD20RU_DiceRoller or game.worldofdarkness.DiceRoller missing)"
  );
  return null;
}

/**
 * Основная установка патча: жёстко переопределяем DialogItem._rollPower.
 */
function installDialogItemPatch() {
  console.log("Fate Patch | Installing hard override for DialogItem._rollPower");

  if (!DialogItem || typeof DialogItem !== "function") {
    console.warn(
      "Fate Patch | DialogItem not available, cannot install Item patch"
    );
    return;
  }

  const proto = DialogItem.prototype;
  if (!proto) {
    console.warn(
      "Fate Patch | DialogItem.prototype missing, cannot install Item patch"
    );
    return;
  }

  if (proto._wodV20RuFateItemPatched) {
    console.log(
      "Fate Patch | DialogItem._rollPower already patched, skipping"
    );
    return;
  }

  const original = proto._rollPower;
  if (typeof original !== "function") {
    console.warn(
      "Fate Patch | DialogItem.prototype._rollPower is not a function, cannot patch"
    );
    return;
  }

  OriginalItemRollMethod = original;
  proto._wodV20RuFateItemPatched = true;

  console.log(
    "Fate Patch | DialogItem hard override installed successfully"
  );

  /**
   * Жёсткий override _rollPower:
   *  - сначала обрабатываем Fate (fateState),
   *  - потом воспроизводим оригинальную логику определения пула / текста,
   *  - затем создаём DiceRollContainer и кидаем его через патченный DiceRoller.
   */
  proto._rollPower = async function patchedFateItemRoll(event) {
    console.log("Fate Patch | DialogItem._rollPower (hard override) called", {
      appId: this?.appId,
      hasActor: !!this?.actor,
      actorId: this?.actor?.id,
      actorName: this?.actor?.name,
      actorType: this?.actor?.type,
      objectName: this?.object?.name,
      difficulty: this?.object?.difficulty
    });

    const actor = this.actor;
    const rollObject = this.object || {};
    const vampireSheetType = CONFIG.worldofdarkness?.sheettype?.vampire;

    // ---------- Шаг 1. Обработка закрытия ----------
    if (rollObject.close) {
      console.log("Fate Patch | Item: dialog already marked as close, closing");
      this.close();
      return;
    }

    // ---------- Шаг 2. Fate-препроцессинг ----------
    try {
      if (!isFateEnabled()) {
        console.log(
          "Fate Patch | Item: Fate system disabled, skipping Fate state handling"
        );
      } else if (
        actor &&
        FateData.isVampire(actor) &&
        (!vampireSheetType || actor.type === vampireSheetType)
      ) {
        const useFate = !!rollObject.useFate;
        const actorFateValue = getActorFateValue(actor);

        let fateDice =
          rollObject.fateDice != null
            ? toInt(rollObject.fateDice)
            : actorFateValue;

        console.log(
          "Fate Patch | Item: computed Fate values before clamp",
          {
            useFate,
            dialogFateDice: rollObject.fateDice,
            actorFateValue,
            fateDice
          }
        );

        if (fateDice < 0) fateDice = 0;

        console.log("Fate Patch | Item: computed Fate values", {
          useFate,
          fateDice
        });

        if (useFate && fateDice > 0) {
          fateState.set(actor.id, { useFate: true, fateDice });
          console.log("Fate Patch | Item: Fate state set for actor", {
            actorId: actor.id,
            actorName: actor.name,
            useFate,
            fateDice
          });
        } else {
          const previous = fateState.consume(actor.id);
          console.log(
            "Fate Patch | Item: Fate not applied or no dice > 0, clearing any previous Fate state",
            {
              actorId: actor.id,
              actorName: actor.name,
              previousState: previous
            }
          );
        }
      } else {
        console.log(
          "Fate Patch | Item: actor not vampire or sheettype mismatch, Fate not applicable",
          {
            hasActor: !!actor,
            actorId: actor?.id,
            actorType: actor?.type,
            vampireSheetType
          }
        );
      }
    } catch (error) {
      console.error(
        "Fate Patch | Item: error during Fate pre-processing",
        error
      );
      // Не ломаем диалог из-за ошибки Fate.
    }

    // ---------- Шаг 3. Проверка canRoll (как в оригинале) ----------
    rollObject.canRoll = rollObject.difficulty > -1 ? true : false;

    if (!rollObject.canRoll) {
      console.log(
        "Fate Patch | Item: cannot roll, difficulty < 0, showing notification",
        { difficulty: rollObject.difficulty }
      );
      ui.notifications.warn(game.i18n.localize("wod.dialog.missingdifficulty"));
      return;
    }

    // ---------- Шаг 4. Воспроизведение системной логики _rollPower ----------
    let woundPenaltyVal = 0;
    let numSpecialDices = 0;
    let specialDiceText = "";
    let template = [];

    // Текст пула:
    template.push(
      `${rollObject.attributeName} (${rollObject.attributeValue})`
    );

    if (rollObject.abilityName != "") {
      template.push(
        `${rollObject.abilityName} (${rollObject.abilityValue})`
      );
    }

    const attributeValue = parseInt(rollObject.attributeValue ?? 0, 10);
    const abilityValue = parseInt(rollObject.abilityValue ?? 0, 10);
    const bonusValue = parseInt(rollObject.bonus ?? 0, 10);

    const numDices =
      (Number.isNaN(attributeValue) ? 0 : attributeValue) +
      (Number.isNaN(abilityValue) ? 0 : abilityValue) +
      (Number.isNaN(bonusValue) ? 0 : bonusValue);

    let specialityText = "";
    rollObject.close = true;

    if (rollObject.useSpeciality) {
      specialityText = rollObject.specialityText ?? "";
    }

    if (CombatHelper.ignoresPain(actor)) {
      woundPenaltyVal = 0;
    } else {
      woundPenaltyVal = parseInt(
        actor.system?.health?.damage?.woundpenalty ?? 0,
        10
      );
      if (Number.isNaN(woundPenaltyVal)) woundPenaltyVal = 0;
    }

    console.log("Fate Patch | Item: computed pool and template", {
      attributeValue,
      abilityValue,
      bonusValue,
      numDices,
      specialityText,
      woundPenaltyVal,
      difficulty: rollObject.difficulty,
      useSpeciality: rollObject.useSpeciality,
      useWillpower: rollObject.useWillpower
    });

    // ---------- Шаг 5. Бросок через патченный DiceRoller ----------
    const patchedDiceRoller = resolvePatchedDiceRoller();
    if (!patchedDiceRoller) {
      console.warn(
        "Fate Patch | Item: patched DiceRoller not available, aborting roll"
      );
      return;
    }

    const dialogRoll = new DiceRollContainer(actor);
    dialogRoll.action = rollObject.name;
    dialogRoll.attribute = rollObject.dice1;
    dialogRoll.ability = rollObject.dice2;
    dialogRoll.dicetext = template;
    dialogRoll.bonus = Number.isNaN(bonusValue) ? 0 : bonusValue;
    dialogRoll.origin = "item";
    dialogRoll.numDices = numDices;
    dialogRoll.numSpecialDices = numSpecialDices;
    dialogRoll.specialDiceText = specialDiceText;
    dialogRoll.woundpenalty = woundPenaltyVal;
    dialogRoll.difficulty = parseInt(rollObject.difficulty ?? 0, 10);
    dialogRoll.speciality = !!rollObject.useSpeciality;
    dialogRoll.specialityText = specialityText;
    dialogRoll.systemText = rollObject.details ?? "";
    dialogRoll.usewillpower = !!rollObject.useWillpower;

    console.log(
      "Fate Patch | DialogItem._rollPower: final roll payload",
      dialogRoll
    );

    try {
      const result = await patchedDiceRoller(dialogRoll);

      console.log(
        "Fate Patch | Item: roll executed via patched DiceRoller",
        {
          actorId: actor?.id,
          actorName: actor?.name,
          rollerResult: result
        }
      );
    } catch (error) {
      console.error(
        "Fate Patch | Item: error while executing patched DiceRoller",
        error
      );
      // При ошибке не трогаем rollObject.close, чтобы пользователь мог повторить/закрыть диалог.
      throw error;
    }
  };
}

Hooks.once("init", () => {
  console.log(
    "Fate Patch | DialogItem._rollPower hard override init hook fired, attempting to patch DialogItem"
  );

  try {
    installDialogItemPatch();
  } catch (error) {
    console.error(
      "Fate Patch | Unexpected error during DialogItem hard override installation",
      error
    );
  }
});

console.log("Fate Patch | DialogItem._rollPower hard override module loaded");