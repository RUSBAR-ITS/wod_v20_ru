// scripts/fate-patch-dialog-weapon.js
//
// Hard override for DialogWeapon._rollAttack (attack only)
//
// Цели:
// 1) Перед броском атаки прочитать флаги Fate (useFate / fateDice) из this.object
//    и записать их в fateState для соответствующего актёра.
// 2) НЕ трогать урон (weaponType === "Damage" → делегируем в оригинальный метод).
// 3) Для атак воспроизводим системную логику, но кидаем через патченный
//    Fate-совместимый DiceRoller (WOD20RU_DiceRoller / game.worldofdarkness.DiceRoller).

console.log("Fate Patch | DialogWeapon._rollAttack hard override module loading");

import { isFateEnabled } from "./settings.js";
import { fateState } from "./fate-state.js";
import { FateData } from "./fate-data.js";

import CombatHelper from "/systems/worldofdarkness/module/scripts/combat-helpers.js";
import {
  DialogWeapon,
  Damage
} from "/systems/worldofdarkness/module/dialogs/dialog-weapon.js";
import { DiceRollContainer } from "/systems/worldofdarkness/module/scripts/roll-dice.js";

let OriginalWeaponRollMethod = /** @type {((this: any, ev: Event) => any) | null} */ (
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
      "Fate Patch | Weapon: using global WOD20RU_DiceRoller as patched DiceRoller"
    );
    return globalPatched;
  }

  if (typeof systemPatched === "function") {
    console.log(
      "Fate Patch | Weapon: using game.worldofdarkness.DiceRoller as patched DiceRoller"
    );
    return systemPatched;
  }

  console.warn(
    "Fate Patch | Weapon: no patched DiceRoller found (WOD20RU_DiceRoller or game.worldofdarkness.DiceRoller missing)"
  );
  return null;
}

/**
 * Основная установка патча: жёстко переопределяем DialogWeapon._rollAttack.
 */
function installDialogWeaponPatch() {
  console.log("Fate Patch | Installing hard override for DialogWeapon._rollAttack");

  if (!DialogWeapon || typeof DialogWeapon !== "function") {
    console.warn(
      "Fate Patch | DialogWeapon not available, cannot install Weapon patch"
    );
    return;
  }

  const proto = DialogWeapon.prototype;
  if (!proto) {
    console.warn(
      "Fate Patch | DialogWeapon.prototype missing, cannot install Weapon patch"
    );
    return;
  }

  if (proto._wodV20RuFateWeaponPatched) {
    console.log(
      "Fate Patch | DialogWeapon._rollAttack already patched, skipping"
    );
    return;
  }

  const original = proto._rollAttack;
  if (typeof original !== "function") {
    console.warn(
      "Fate Patch | DialogWeapon.prototype._rollAttack is not a function, cannot patch"
    );
    return;
  }

  OriginalWeaponRollMethod = original;
  proto._wodV20RuFateWeaponPatched = true;

  console.log(
    "Fate Patch | DialogWeapon._rollAttack hard override installed successfully"
  );

  /**
   * Жёсткий override _rollAttack:
   *  - если weaponType === "Damage" → вызываем оригинальный метод (без Fate);
   *  - иначе (атака) сначала обрабатываем Fate (fateState),
   *    потом воспроизводим оригинальную логику атаки и кидаем через патченный DiceRoller.
   */
  proto._rollAttack = async function patchedFateWeaponRoll(event) {
    const actor = this.actor;
    const rollObject = this.object || {};
    const weaponType = rollObject.weaponType || "";

    console.log(
      "Fate Patch | DialogWeapon._rollAttack (hard override) called",
      {
        appId: this?.appId,
        hasActor: !!actor,
        actorId: actor?.id,
        actorName: actor?.name,
        actorType: actor?.type,
        weaponType,
        difficulty: rollObject.difficulty,
        dice1: rollObject.dice1,
        dice2: rollObject.dice2
      }
    );

    // ---------- Ветку урона не трогаем вообще ----------
    if (weaponType === "Damage") {
      console.log(
        "Fate Patch | Weapon: weaponType is Damage, delegating to original _rollAttack without Fate",
        { weaponType }
      );
      return OriginalWeaponRollMethod.call(this, event);
    }

    // ---------- Общие проверки (как в оригинале) ----------
    if (rollObject.close) {
      console.log("Fate Patch | Weapon: dialog already marked as close, closing");
      this.close();
      return;
    }

    rollObject.canRoll = rollObject.difficulty > -1 ? true : false;
    let woundPenaltyVal = 0;

    if (!rollObject.canRoll) {
      console.log(
        "Fate Patch | Weapon: cannot roll, missing or invalid difficulty, showing notification",
        { difficulty: rollObject.difficulty }
      );
      ui.notifications.warn(
        game.i18n.localize("wod.dialog.missingdifficulty")
      );
      return;
    }

    // ---------- Шаг 1. Fate-препроцессинг (только на атаку) ----------
    try {
      if (!isFateEnabled()) {
        console.log(
          "Fate Patch | Weapon: Fate system disabled, skipping Fate state handling"
        );
      } else if (actor && FateData.isVampire(actor)) {
        const vampireSheetType = CONFIG.worldofdarkness?.sheettype?.vampire;

        if (!vampireSheetType || actor.type === vampireSheetType) {
          const useFate = !!rollObject.useFate;
          const actorFateValue = getActorFateValue(actor);

          let fateDice =
            rollObject.fateDice != null
              ? toInt(rollObject.fateDice)
              : actorFateValue;

          console.log(
            "Fate Patch | Weapon: computed Fate values before clamp",
            {
              useFate,
              dialogFateDice: rollObject.fateDice,
              actorFateValue,
              fateDice
            }
          );

          if (fateDice < 0) fateDice = 0;

          console.log("Fate Patch | Weapon: computed Fate values", {
            useFate,
            fateDice
          });

          if (useFate && fateDice > 0) {
            fateState.set(actor.id, { useFate: true, fateDice });
            console.log(
              "Fate Patch | Weapon: Fate state set for actor",
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
              "Fate Patch | Weapon: Fate not applied or no dice > 0, clearing any previous Fate state",
              {
                actorId: actor.id,
                actorName: actor.name,
                previousState: previous
              }
            );
          }
        } else {
          console.log(
            "Fate Patch | Weapon: actor.type does not match vampire sheettype, Fate not applied",
            {
              actorType: actor.type,
              vampireSheetType
            }
          );
        }
      } else {
        console.log(
          "Fate Patch | Weapon: actor not vampire or missing, Fate not applicable",
          { hasActor: !!actor, actorId: actor?.id, actorType: actor?.type }
        );
      }
    } catch (error) {
      console.error(
        "Fate Patch | Weapon: error during Fate pre-processing",
        error
      );
      // Не ломаем бросок из-за ошибки Fate.
    }

    // ---------- Шаг 2. Воспроизведение логики атаки ----------
    let template = [];
    let numDices = 0;

    const weaponRoll = new DiceRollContainer(actor);
    weaponRoll.attribute = rollObject.dice1;
    weaponRoll.ability = rollObject.dice2;

    // Атака (weaponType != "Damage")
    weaponRoll.origin = "attack";
    weaponRoll.action = `${rollObject.name} (${game.i18n.localize(
      "wod.dialog.weapon.attack"
    )})`;

    template.push(
      `${rollObject.attributeName} (${rollObject.attributeValue})`
    );

    if (rollObject.abilityName != "") {
      template.push(
        `${rollObject.abilityName} (${rollObject.abilityValue})`
      );
    }

    if (rollObject.modename != "single") {
      if (rollObject.modename == "burst") {
        weaponRoll.extraInfo.push(
          game.i18n.localize("wod.dialog.weapon.usingburst")
        );
      }
      if (rollObject.modename == "fullauto") {
        weaponRoll.extraInfo.push(
          game.i18n.localize("wod.dialog.weapon.usingauto")
        );
      }
      if (rollObject.modename == "spray") {
        weaponRoll.extraInfo.push(
          game.i18n.localize("wod.dialog.weapon.usingspray")
        );
      }
    }

    if (CombatHelper.ignoresPain(actor)) {
      woundPenaltyVal = 0;
    } else {
      woundPenaltyVal = parseInt(
        actor.system.health.damage.woundpenalty ?? 0,
        10
      );
    }

    numDices =
      parseInt(rollObject.attributeValue ?? 0, 10) +
      parseInt(rollObject.abilityValue ?? 0, 10) +
      parseInt(rollObject.bonus ?? 0, 10);

    console.log("Fate Patch | Weapon: computed attack pool and template", {
      numDices,
      attributeValue: rollObject.attributeValue,
      abilityValue: rollObject.abilityValue,
      bonus: rollObject.bonus,
      modename: rollObject.modename,
      difficulty: rollObject.difficulty,
      woundPenaltyVal,
      template
    });

    // ---------- Шаг 3. Специализация и общие поля DiceRollContainer ----------
    let specialityText = "";
    rollObject.close = true;

    if (rollObject.useSpeciality) {
      specialityText = rollObject.specialityText || "";
    }

    weaponRoll.numDices = numDices;
    weaponRoll.difficulty = parseInt(rollObject.difficulty ?? 0, 10);
    weaponRoll.dicetext = template;
    weaponRoll.usewillpower = rollObject.useWillpower;
    weaponRoll.woundpenalty = parseInt(woundPenaltyVal ?? 0, 10);
    weaponRoll.systemText = rollObject.system;
    weaponRoll.speciality = rollObject.useSpeciality;
    weaponRoll.specialityText = specialityText;

    console.log("Fate Patch | Weapon: prepared DiceRollContainer for attack", {
      actorId: actor?.id,
      actorName: actor?.name,
      action: weaponRoll.action,
      origin: weaponRoll.origin,
      dicetext: weaponRoll.dicetext,
      difficulty: weaponRoll.difficulty,
      usewillpower: weaponRoll.usewillpower,
      woundpenalty: weaponRoll.woundpenalty,
      speciality: weaponRoll.speciality,
      specialityText: weaponRoll.specialityText
    });

    // ---------- Шаг 4. Бросок через патченный DiceRoller + переход к урону ----------
    const patchedDiceRoller = resolvePatchedDiceRoller();
    if (!patchedDiceRoller) {
      console.warn(
        "Fate Patch | Weapon: patched DiceRoller not available, aborting attack roll"
      );
      return;
    }

    weaponRoll.bonus = parseInt(rollObject.bonus ?? 0, 10);

    let item = await actor.getEmbeddedDocument("Item", rollObject._id);

    if (rollObject.dice2 == "custom") {
      const itemData = foundry.utils.duplicate(item);
      itemData.system.attack.secondaryabilityid = rollObject.secondaryabilityid;
      await item.update(itemData);
    }

    try {
      const numberOfSuccesses = await patchedDiceRoller(weaponRoll);

      console.log(
        "Fate Patch | Weapon: attack roll executed via patched DiceRoller",
        {
          actorId: actor?.id,
          actorName: actor?.name,
          numberOfSuccesses
        }
      );

      if (
        numberOfSuccesses > 0 &&
        rollObject.rolldamage &&
        weaponRoll.origin === "attack"
      ) {
        // add number of successes to Damage roll (как в оригинале)
        item.system.extraSuccesses = parseInt(numberOfSuccesses, 10) - 1;
        item.system.numberoftargets = rollObject.numberoftargets;
        item.system.modename = rollObject.modename;

        const damageData = new Damage(item);
        const rollDamage = new DialogWeapon(actor, damageData);

        console.log(
          "Fate Patch | Weapon: opening damage dialog after successful attack",
          {
            extraSuccesses: item.system.extraSuccesses,
            numberoftargets: item.system.numberoftargets,
            modename: item.system.modename
          }
        );

        rollDamage.render(true);
      }
    } catch (error) {
      console.error(
        "Fate Patch | Weapon: error while executing patched DiceRoller",
        error
      );
      throw error;
    }
  };
}

Hooks.once("init", () => {
  console.log(
    "Fate Patch | DialogWeapon._rollAttack hard override init hook fired, attempting to patch DialogWeapon"
  );

  try {
    installDialogWeaponPatch();
  } catch (error) {
    console.error(
      "Fate Patch | Unexpected error during DialogWeapon hard override installation",
      error
    );
  }
});

console.log("Fate Patch | DialogWeapon._rollAttack hard override module loaded");
