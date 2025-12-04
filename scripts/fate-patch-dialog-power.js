// scripts/fate-patch-dialog-power.js
//
// Hard override for DialogPower._rollPower (Disciplines / Paths / Rituals)
//
// Цели:
// 1) Перед броском силы прочитать флаги Fate (useFate / fateDice) из this.object
//    и записать их в fateState для соответствующего вампира.
// 2) Для не-вампиров поведение остаётся полностью стандартным (Fate не применяется).
// 3) Воспроизводим оригинальную логику _rollPower целиком,
//    но бросаем через Fate-совместимый DiceRoller.
//
// Важно: вся логика Nightmare/Realms для Changeling (Arts) сохранена как в оригинале.

console.log("Fate Patch | DialogPower._rollPower hard override module loading");

import { isFateEnabled } from "./settings.js";
import { fateState } from "./fate-state.js";
import { FateData } from "./fate-data.js";

import CombatHelper from "/systems/worldofdarkness/module/scripts/combat-helpers.js";
import {
  DialogPower
} from "/systems/worldofdarkness/module/dialogs/dialog-power.js";
import { DiceRollContainer } from "/systems/worldofdarkness/module/scripts/roll-dice.js";

let OriginalPowerRollMethod = /** @type {((this: any, ev: Event) => any) | null} */ (
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
      "Fate Patch | Power: using global WOD20RU_DiceRoller as patched DiceRoller"
    );
    return globalPatched;
  }

  if (typeof systemPatched === "function") {
    console.log(
      "Fate Patch | Power: using game.worldofdarkness.DiceRoller as patched DiceRoller"
    );
    return systemPatched;
  }

  console.warn(
    "Fate Patch | Power: no patched DiceRoller found (WOD20RU_DiceRoller or game.worldofdarkness.DiceRoller missing)"
  );
  return null;
}

/**
 * Установка патча: жёстко переопределяем DialogPower._rollPower.
 */
function installDialogPowerPatch() {
  console.log("Fate Patch | Installing hard override for DialogPower._rollPower");

  if (!DialogPower || typeof DialogPower !== "function") {
    console.warn(
      "Fate Patch | DialogPower not available, cannot install Power patch"
    );
    return;
  }

  const proto = DialogPower.prototype;
  if (!proto) {
    console.warn(
      "Fate Patch | DialogPower.prototype missing, cannot install Power patch"
    );
    return;
  }

  if (proto._wodV20RuFatePowerPatched) {
    console.log(
      "Fate Patch | DialogPower._rollPower already patched, skipping"
    );
    return;
  }

  const original = proto._rollPower;
  if (typeof original !== "function") {
    console.warn(
      "Fate Patch | DialogPower.prototype._rollPower is not a function, cannot patch"
    );
    return;
  }

  OriginalPowerRollMethod = original;
  proto._wodV20RuFatePowerPatched = true;

  console.log(
    "Fate Patch | DialogPower._rollPower hard override installed successfully"
  );

  /**
   * Жёсткий override _rollPower:
   *  - перед основной логикой выполняем Fate-препроцессинг (только для вампиров),
   *  - затем воспроизводим оригинальный код и бросаем через патченный DiceRoller.
   */
  proto._rollPower = async function patchedFatePowerRoll(event) {
    const actor = this.actor;
    const obj = this.object || {};

    console.log("Fate Patch | DialogPower._rollPower (hard override) called", {
      appId: this?.appId,
      hasActor: !!actor,
      actorId: actor?.id,
      actorName: actor?.name,
      actorType: actor?.type,
      powerType: obj?.type,
      sheettype: obj?.sheettype,
      dice1: obj?.dice1,
      dice2: obj?.dice2,
      difficulty: obj?.difficulty
    });

    if (obj.close) {
      console.log("Fate Patch | Power: dialog already marked as close, closing");
      this.close();
      return;
    }

    obj.canRoll = obj.difficulty > -1 ? true : false;
    let woundPenaltyVal = 0;
    let numSpecialDices = 0;
    let specialDiceText = "";
    let template = [];
    let extraInfo = [];

    let selectedRealms = [];

    if (!obj.canRoll) {
      ui.notifications.warn(
        game.i18n.localize("wod.dialog.missingdifficulty")
      );
      return;
    }

    // ---------- Fate-препроцессинг (только для вампиров) ----------
    try {
      if (!isFateEnabled()) {
        console.log(
          "Fate Patch | Power: Fate system disabled, skipping Fate state handling"
        );
      } else if (actor && FateData.isVampire(actor)) {
        const vampireSheetType = CONFIG.worldofdarkness?.sheettype?.vampire;

        const isVampireDialog =
          obj.sheettype === "vampireDialog" ||
          (vampireSheetType && actor.type === vampireSheetType);

        if (isVampireDialog) {
          const useFate = !!obj.useFate;
          const actorFateValue = getActorFateValue(actor);

          let fateDice =
            obj.fateDice != null ? toInt(obj.fateDice) : actorFateValue;

          if (fateDice < 0) fateDice = 0;

          console.log("Fate Patch | Power: computed Fate values", {
            useFate,
            dialogFateDice: obj.fateDice,
            actorFateValue,
            fateDice
          });

          if (useFate && fateDice > 0) {
            fateState.set(actor.id, { useFate: true, fateDice });
            console.log(
              "Fate Patch | Power: Fate state set for actor",
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
              "Fate Patch | Power: Fate not applied or no dice > 0, clearing any previous Fate state",
              {
                actorId: actor.id,
                actorName: actor.name,
                previousState: previous
              }
            );
          }
        } else {
          console.log(
            "Fate Patch | Power: not a vampire discipline/path/ritual roll, Fate not applied",
            {
              sheettype: obj.sheettype,
              actorType: actor.type,
              powerType: obj.type
            }
          );
        }
      } else {
        console.log(
          "Fate Patch | Power: actor not vampire or missing, Fate not applicable",
          { hasActor: !!actor, actorId: actor?.id, actorType: actor?.type }
        );
      }
    } catch (error) {
      console.error(
        "Fate Patch | Power: error during Fate pre-processing",
        error
      );
      // Не ломаем бросок из-за ошибки Fate.
    }

    // ---------- Оригинальная логика _rollPower (без изменения) ----------

    if (
      obj.dice1 === "custom" ||
      obj.dice2 === "custom"
    ) {
      let item = await this.actor.getEmbeddedDocument("Item", obj._id);
      const itemData = foundry.utils.duplicate(item);
      itemData.system.secondaryabilityid = obj.secondaryabilityid;
      await item.update(itemData);
    }

    template.push(`${obj.attributeName} (${obj.attributeValue})`);

    if (obj.abilityName != "") {
      template.push(`${obj.abilityName} (${obj.abilityValue})`);
    }

    // add selected Realms
    if (obj.type == "wod.types.artpower") {
      if (obj.selectedarttype == "") {
        ui.notifications.warn(
          game.i18n.localize("wod.dialog.power.noarttype")
        );
        return;
      }

      if (!obj.isUnleashing) {
        obj.canRoll = false;

        for (const realm of obj.selectedRealms) {
          if (realm.isselected) {
            extraInfo.push(
              `${game.i18n.localize(realm.label)} (${realm.value})`
            );
            obj.canRoll = true;
          }
        }

        if (!obj.canRoll) {
          ui.notifications.warn(
            game.i18n.localize("wod.dialog.power.missingrealm")
          );
          return;
        }

        numSpecialDices =
          parseInt(this.actor.system.advantages.nightmare.temporary) +
          obj.nightmareReplace;
        specialDiceText = game.i18n.localize(
          "wod.dialog.power.nightmaredice"
        );
      } else {
        extraInfo.push(
          `${game.i18n.localize("wod.dialog.power.unleashing")}`
        );
      }

      if (obj.selectedarttype != undefined) {
        extraInfo.push(`${game.i18n.localize(obj.selectedarttype)}`);
      }
    }

    const numDices =
      parseInt(obj.attributeValue ?? 0, 10) +
      parseInt(obj.abilityValue ?? 0, 10) +
      parseInt(obj.bonus ?? 0, 10);

    let specialityText = "";
    obj.close = true;

    if (obj.useSpeciality) {
      specialityText = obj.specialityText;
    }

    if (CombatHelper.ignoresPain(this.actor)) {
      woundPenaltyVal = 0;
    } else {
      woundPenaltyVal = parseInt(
        this.actor.system.health.damage.woundpenalty ?? 0,
        10
      );
    }

    const powerRoll = new DiceRollContainer(this.actor);
    powerRoll.action = obj.name;
    powerRoll.attribute = obj.dice1;
    powerRoll.ability = obj.abilityKey;
    powerRoll.origin = "power";
    powerRoll.numDices = numDices;
    powerRoll.numSpecialDices = numSpecialDices;
    powerRoll.specialDiceText = specialDiceText;
    powerRoll.woundpenalty = parseInt(woundPenaltyVal ?? 0, 10);
    powerRoll.difficulty = parseInt(obj.difficulty ?? 0, 10);
    powerRoll.speciality = obj.useSpeciality;
    powerRoll.specialityText = specialityText;
    powerRoll.dicetext = template;
    powerRoll.bonus = parseInt(obj.bonus ?? 0, 10);
    powerRoll.extraInfo = extraInfo;
    powerRoll.systemText = obj.system;
    powerRoll.usewillpower = obj.useWillpower;

    console.log("Fate Patch | Power: prepared DiceRollContainer", {
      actorId: this.actor?.id,
      actorName: this.actor?.name,
      action: powerRoll.action,
      origin: powerRoll.origin,
      numDices: powerRoll.numDices,
      numSpecialDices: powerRoll.numSpecialDices,
      specialDiceText: powerRoll.specialDiceText,
      difficulty: powerRoll.difficulty,
      dicetext: powerRoll.dicetext,
      bonus: powerRoll.bonus,
      usewillpower: powerRoll.usewillpower
    });

    // ---------- Бросок через патченный DiceRoller ----------
    const patchedDiceRoller = resolvePatchedDiceRoller();
    if (!patchedDiceRoller) {
      console.warn(
        "Fate Patch | Power: patched DiceRoller not available, aborting power roll"
      );
      return;
    }

    try {
      await patchedDiceRoller(powerRoll);
    } catch (error) {
      console.error(
        "Fate Patch | Power: error while executing patched DiceRoller",
        error
      );
      throw error;
    }
  };
}

Hooks.once("init", () => {
  console.log(
    "Fate Patch | DialogPower._rollPower hard override init hook fired, attempting to patch DialogPower"
  );

  try {
    installDialogPowerPatch();
  } catch (error) {
    console.error(
      "Fate Patch | Unexpected error during DialogPower hard override installation",
      error
    );
  }
});

console.log("Fate Patch | DialogPower._rollPower hard override module loaded");
