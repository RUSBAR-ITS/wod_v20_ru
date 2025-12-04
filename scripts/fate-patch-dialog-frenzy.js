// scripts/fate-patch-dialog-frenzy.js
// Hard override for DialogCheckFrenzy._checkFrenzy
//
// Цели:
// 1) Перед броском Frenzy прочитать флаги Fate (useFate / fateDice) из this.object
//    и записать их в fateState для соответствующего актёра.
// 2) НЕ вызывать системный DiceRoller из dialog-checkfrenzy.js, а вместо этого
//    самостоятельно собрать DiceRollContainer и кинуть его через патченный
//    Fate-совместимый DiceRoller (WOD20RU_DiceRoller / game.worldofdarkness.DiceRoller).
//
// При этом:
// - Логика вычисления пула и сложности целиком повторяет системный _checkFrenzy:
//   * оборотень: _calculateDifficulty(true) + rage.roll + bonuses
//   * вампир: totalDifficulty > -1, пул = virtues.selfcontrol.roll + bonuses
// - _calculateDifficulty(showMessage) не трогаем и не патчим.

console.log("Fate Patch | DialogCheckFrenzy hard override module loading");

import { isFateEnabled } from "./settings.js";
import { fateState } from "./fate-state.js";
import { FateData } from "./fate-data.js";

import {
  DialogCheckFrenzy,
  WerewolfFrenzy // импорт не обязателен, но полезен для контекста
} from "/systems/worldofdarkness/module/dialogs/dialog-checkfrenzy.js";

import { DiceRollContainer } from "/systems/worldofdarkness/module/scripts/roll-dice.js";

let OriginalCheckFrenzyMethod = /** @type {((this: any, ev: Event) => Promise<any>) | null} */ (
  null
);

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
      "Fate Patch | Frenzy: using global WOD20RU_DiceRoller as patched DiceRoller"
    );
    return globalPatched;
  }

  if (typeof systemPatched === "function") {
    console.log(
      "Fate Patch | Frenzy: using game.worldofdarkness.DiceRoller as patched DiceRoller"
    );
    return systemPatched;
  }

  console.warn(
    "Fate Patch | Frenzy: no patched DiceRoller found (WOD20RU_DiceRoller or game.worldofdarkness.DiceRoller missing)"
  );
  return null;
}

/**
 * Основная установка патча: жёстко переопределяем DialogCheckFrenzy._checkFrenzy.
 */
function installDialogCheckFrenzyPatch() {
  console.log("Fate Patch | Installing hard override for DialogCheckFrenzy._checkFrenzy");

  if (!DialogCheckFrenzy || typeof DialogCheckFrenzy !== "function") {
    console.warn(
      "Fate Patch | DialogCheckFrenzy not available, cannot install Frenzy patch"
    );
    return;
  }

  const proto = DialogCheckFrenzy.prototype;
  if (!proto) {
    console.warn(
      "Fate Patch | DialogCheckFrenzy.prototype missing, cannot install Frenzy patch"
    );
    return;
  }

  if (proto._wodV20RuFateFrenzyPatched) {
    console.log(
      "Fate Patch | DialogCheckFrenzy._checkFrenzy already patched, skipping"
    );
    return;
  }

  const original = proto._checkFrenzy;
  if (typeof original !== "function") {
    console.warn(
      "Fate Patch | DialogCheckFrenzy.prototype._checkFrenzy is not a function, cannot patch"
    );
    return;
  }

  OriginalCheckFrenzyMethod = original;
  proto._wodV20RuFateFrenzyPatched = true;

  console.log(
    "Fate Patch | DialogCheckFrenzy hard override installed successfully"
  );

  /**
   * Жёсткий override _checkFrenzy:
   *  - сначала обрабатываем Fate (fateState),
   *  - потом воспроизводим оригинальную логику определения пула / сложности,
   *  - затем создаём DiceRollContainer и кидаем его через патченный DiceRoller.
   */
  proto._checkFrenzy = async function patchedFateCheckFrenzy(event) {
    console.log(
      "Fate Patch | DialogCheckFrenzy._checkFrenzy (hard override) called",
      {
        appId: this?.appId,
        hasActor: !!this?.actor,
        actorId: this?.actor?.id,
        actorName: this?.actor?.name,
        actorType: this?.actor?.type,
        rollObjectType: this?.object?.type
      }
    );

    const actor = this.actor;
    const rollObject = this.object || {};
    const vampireSheetType = CONFIG.worldofdarkness?.sheettype?.vampire;
    const werewolfSheetType = CONFIG.worldofdarkness?.sheettype?.werewolf;

    // ---------- Шаг 1. Fate-препроцессинг ----------
    try {
      if (!isFateEnabled()) {
        console.log(
          "Fate Patch | Frenzy: Fate system disabled, skipping Fate state handling"
        );
      } else if (
        actor &&
        FateData.isVampire(actor) &&
        (!vampireSheetType || rollObject.type === vampireSheetType)
      ) {
        const useFate = !!rollObject.useFate;
        const actorFateValue = getActorFateValue(actor);

        let fateDice =
          rollObject.fateDice != null
            ? toInt(rollObject.fateDice)
            : actorFateValue;

        console.log("Fate Patch | Frenzy: computed Fate values before clamp", {
          useFate,
          dialogFateDice: rollObject.fateDice,
          actorFateValue,
          fateDice
        });

        if (fateDice < 0) fateDice = 0;

        console.log("Fate Patch | Frenzy: computed Fate values", {
          useFate,
          fateDice
        });

        if (useFate && fateDice > 0) {
          fateState.set(actor.id, { useFate: true, fateDice });
          console.log(
            "Fate Patch | Frenzy: Fate state set for actor",
            {
              actorId: actor.id,
              actorName: actor.name,
              useFate,
              fateDice
            }
          );
        } else {
          const previous = fateState.consume(actor.id);
          console.log(
            "Fate Patch | Frenzy: Fate not applied or no dice > 0, clearing any previous Fate state",
            {
              actorId: actor.id,
              actorName: actor.name,
              previousState: previous
            }
          );
        }
      } else {
        console.log(
          "Fate Patch | Frenzy: actor not vampire or roll type mismatch, Fate not applicable",
          {
            hasActor: !!actor,
            actorId: actor?.id,
            actorType: actor?.type,
            rollObjectType: rollObject.type,
            vampireSheetType
          }
        );
      }
    } catch (error) {
      console.error(
        "Fate Patch | Frenzy: error during Fate pre-processing",
        error
      );
      // Не ломаем диалог из-за ошибки Fate.
    }

    // ---------- Шаг 2. Воспроизведение логики _checkFrenzy ----------
    let frenzyBonus = 0;
    let numDices = 0;
    const template = [];

    try {
      frenzyBonus = parseInt(actor?.system?.advantages?.rage?.bonus ?? 0, 10);
      if (Number.isNaN(frenzyBonus)) frenzyBonus = 0;
    } catch (e) {
      frenzyBonus = 0;
    }

    console.log("Fate Patch | Frenzy: base frenzy bonus computed", {
      frenzyBonus
    });

    // Оборотень: считаем сложность через _calculateDifficulty(true),
    // пул = rage.roll + frenzyBonus + dialog.rageBonus
    if (rollObject.type === werewolfSheetType) {
      rollObject.canRoll = this._calculateDifficulty(true);

      template.push(
        `${game.i18n.localize("wod.dialog.neededsuccesses")}: ${
          rollObject.successesRequired
        }`
      );

      const rageRoll = parseInt(
        actor?.system?.advantages?.rage?.roll ?? 0,
        10
      );
      const dialogRageBonus = parseInt(rollObject.rageBonus ?? 0, 10);

      numDices = (Number.isNaN(rageRoll) ? 0 : rageRoll) +
        frenzyBonus +
        (Number.isNaN(dialogRageBonus) ? 0 : dialogRageBonus);

      rollObject.close = true;

      console.log("Fate Patch | Frenzy: werewolf branch", {
        canRoll: rollObject.canRoll,
        rageRoll,
        frenzyBonus,
        dialogRageBonus,
        numDices,
        totalDifficulty: rollObject.totalDifficulty,
        successesRequired: rollObject.successesRequired
      });
    }
    // Вампир: canRoll = totalDifficulty > -1,
    // пул = virtues.selfcontrol.roll + frenzyBonus + dialog.rageBonus
    else if (rollObject.type === vampireSheetType) {
      rollObject.canRoll = rollObject.totalDifficulty > -1 ? true : false;

      template.push(
        `${game.i18n.localize("wod.dialog.numbersuccesses")}: ${
          rollObject.numSuccesses
        }`
      );

      const selfControlRoll = parseInt(
        actor?.system?.advantages?.virtues?.selfcontrol?.roll ?? 0,
        10
      );
      const dialogRageBonus = parseInt(rollObject.rageBonus ?? 0, 10);

      numDices = (Number.isNaN(selfControlRoll) ? 0 : selfControlRoll) +
        frenzyBonus +
        (Number.isNaN(dialogRageBonus) ? 0 : dialogRageBonus);

      console.log("Fate Patch | Frenzy: vampire branch", {
        canRoll: rollObject.canRoll,
        selfControlRoll,
        frenzyBonus,
        dialogRageBonus,
        numDices,
        totalDifficulty: rollObject.totalDifficulty,
        numSuccesses: rollObject.numSuccesses
      });
    } else {
      console.log(
        "Fate Patch | Frenzy: rollObject.type is neither werewolf nor vampire, skipping roll",
        { rollObjectType: rollObject.type, werewolfSheetType, vampireSheetType }
      );
      return;
    }

    // ---------- Шаг 3. Сам бросок через патченный DiceRoller ----------
    if (!rollObject.canRoll) {
      console.log(
        "Fate Patch | Frenzy: canRoll == false, roll will not be executed",
        { rollObjectType: rollObject.type }
      );
      return;
    }

    const patchedDiceRoller = resolvePatchedDiceRoller();
    if (!patchedDiceRoller) {
      console.warn(
        "Fate Patch | Frenzy: patched DiceRoller not available, aborting roll"
      );
      return;
    }

    const frenzyRoll = new DiceRollContainer(actor);
    frenzyRoll.action = game.i18n.localize("wod.dialog.checkfrenzy.headline");
    frenzyRoll.dicetext = template;
    frenzyRoll.bonus = frenzyBonus;
    frenzyRoll.origin = "general";
    frenzyRoll.numDices = numDices;
    frenzyRoll.woundpenalty = 0;
    frenzyRoll.usewillpower = false;
    frenzyRoll.difficulty = parseInt(rollObject.totalDifficulty ?? 0, 10);

    console.log("Fate Patch | Frenzy: prepared DiceRollContainer", {
      actorId: actor?.id,
      actorName: actor?.name,
      action: frenzyRoll.action,
      dicetext: frenzyRoll.dicetext,
      bonus: frenzyRoll.bonus,
      origin: frenzyRoll.origin,
      numDices: frenzyRoll.numDices,
      woundpenalty: frenzyRoll.woundpenalty,
      usewillpower: frenzyRoll.usewillpower,
      difficulty: frenzyRoll.difficulty
    });

    try {
      const successes = await patchedDiceRoller(frenzyRoll);
      const successesInt = toInt(successes);

      rollObject.numSuccesses = (toInt(rollObject.numSuccesses) || 0) + successesInt;

      console.log("Fate Patch | Frenzy: roll executed via patched DiceRoller", {
        actorId: actor?.id,
        actorName: actor?.name,
        addedSuccesses: successesInt,
        totalSuccesses: rollObject.numSuccesses
      });
    } catch (error) {
      console.error(
        "Fate Patch | Frenzy: error while executing patched DiceRoller",
        error
      );
      throw error;
    }
  };
}

Hooks.once("init", () => {
  console.log(
    "Fate Patch | DialogCheckFrenzy hard override init hook fired, attempting to patch DialogCheckFrenzy"
  );

  try {
    installDialogCheckFrenzyPatch();
  } catch (error) {
    console.error(
      "Fate Patch | Unexpected error during DialogCheckFrenzy hard override installation",
      error
    );
  }
});

console.log("Fate Patch | DialogCheckFrenzy hard override module loaded");
