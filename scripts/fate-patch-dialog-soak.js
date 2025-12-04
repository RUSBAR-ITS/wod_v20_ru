// scripts/fate-patch-dialog-soak.js
//
// Hard override for DialogSoakRoll._soakRoll
//
// Цели:
// 1) Перед броском Soak прочитать флаги Fate (useFate / fateDice) из this.object
//    и записать их в fateState для соответствующего актёра.
// 2) НЕ вызывать системный DiceRoller из dialog-soak.js, а вместо этого
//    самостоятельно собрать DiceRollContainer и кинуть его через патченный
//    Fate-совместимый DiceRoller (WOD20RU_DiceRoller / game.worldofdarkness.DiceRoller).
//
// При этом:
// - Логика вычисления пула и текста полностью повторяет системный _soakRoll.
// - Остальные методы DialogSoakRoll не трогаем.

console.log("Fate Patch | DialogSoakRoll hard override module loading");

import { isFateEnabled } from "./settings.js";
import { fateState } from "./fate-state.js";
import { FateData } from "./fate-data.js";

import { DialogSoakRoll } from "/systems/worldofdarkness/module/dialogs/dialog-soak.js";
import { DiceRollContainer } from "/systems/worldofdarkness/module/scripts/roll-dice.js";

let OriginalSoakMethod = /** @type {((this: any, ev: Event) => any) | null} */ (
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
      "Fate Patch | Soak: using global WOD20RU_DiceRoller as patched DiceRoller"
    );
    return globalPatched;
  }

  if (typeof systemPatched === "function") {
    console.log(
      "Fate Patch | Soak: using game.worldofdarkness.DiceRoller as patched DiceRoller"
    );
    return systemPatched;
  }

  console.warn(
    "Fate Patch | Soak: no patched DiceRoller found (WOD20RU_DiceRoller or game.worldofdarkness.DiceRoller missing)"
  );
  return null;
}

/**
 * Основная установка патча: жёстко переопределяем DialogSoakRoll._soakRoll.
 */
function installDialogSoakPatch() {
  console.log("Fate Patch | Installing hard override for DialogSoakRoll._soakRoll");

  if (!DialogSoakRoll || typeof DialogSoakRoll !== "function") {
    console.warn(
      "Fate Patch | DialogSoakRoll not available, cannot install Soak patch"
    );
    return;
  }

  const proto = DialogSoakRoll.prototype;
  if (!proto) {
    console.warn(
      "Fate Patch | DialogSoakRoll.prototype missing, cannot install Soak patch"
    );
    return;
  }

  if (proto._wodV20RuFateSoakPatched) {
    console.log(
      "Fate Patch | DialogSoakRoll._soakRoll already patched, skipping"
    );
    return;
  }

  const original = proto._soakRoll;
  if (typeof original !== "function") {
    console.warn(
      "Fate Patch | DialogSoakRoll.prototype._soakRoll is not a function, cannot patch"
    );
    return;
  }

  OriginalSoakMethod = original;
  proto._wodV20RuFateSoakPatched = true;

  console.log(
    "Fate Patch | DialogSoakRoll hard override installed successfully"
  );

  /**
   * Жёсткий override _soakRoll:
   *  - сначала обрабатываем Fate (fateState),
   *  - потом воспроизводим оригинальную логику определения пула / текста,
   *  - затем создаём DiceRollContainer и кидаем его через патченный DiceRoller.
   */
  proto._soakRoll = async function patchedFateSoakRoll(event) {
    console.log(
      "Fate Patch | DialogSoakRoll._soakRoll (hard override) called",
      {
        appId: this?.appId,
        hasActor: !!this?.actor,
        actorId: this?.actor?.id,
        actorName: this?.actor?.name,
        actorType: this?.actor?.type,
        damageKey: this?.object?.damageKey,
        difficulty: this?.object?.difficulty
      }
    );

    const actor = this.actor;
    const rollObject = this.object || {};
    const vampireSheetType = CONFIG.worldofdarkness?.sheettype?.vampire;

    // ---------- Шаг 1. Обработка закрытия ----------
    if (rollObject.close) {
      console.log(
        "Fate Patch | Soak: dialog already marked as close, closing"
      );
      this.close();
      return;
    }

    // ---------- Шаг 2. Fate-препроцессинг ----------
    try {
      if (!isFateEnabled()) {
        console.log(
          "Fate Patch | Soak: Fate system disabled, skipping Fate state handling"
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

        console.log("Fate Patch | Soak: computed Fate values before clamp", {
          useFate,
          dialogFateDice: rollObject.fateDice,
          actorFateValue,
          fateDice
        });

        if (fateDice < 0) fateDice = 0;

        console.log("Fate Patch | Soak: computed Fate values", {
          useFate,
          fateDice
        });

        if (useFate && fateDice > 0) {
          fateState.set(actor.id, { useFate: true, fateDice });
          console.log(
            "Fate Patch | Soak: Fate state set for actor",
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
            "Fate Patch | Soak: Fate not applied or no dice > 0, clearing any previous Fate state",
            {
              actorId: actor.id,
              actorName: actor.name,
              previousState: previous
            }
          );
        }
      } else {
        console.log(
          "Fate Patch | Soak: actor not vampire or sheettype mismatch, Fate not applicable",
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
        "Fate Patch | Soak: error during Fate pre-processing",
        error
      );
      // Не ломаем диалог из-за ошибки Fate.
    }

    // ---------- Шаг 3. Проверки canRoll (как в оригинале) ----------
    rollObject.canRoll = rollObject.damageKey !== "" ? true : false;

    if (!rollObject.canRoll) {
      console.log(
        "Fate Patch | Soak: cannot roll, damageKey is empty, showing notification",
        { damageKey: rollObject.damageKey }
      );
      ui.notifications.warn(game.i18n.localize("wod.dialog.soak.missingdamage"));
      return;
    }

    // ---------- Шаг 4. Воспроизведение системной логики Soak ----------
    let template = [];

    const attributeValue = parseInt(rollObject.attributeValue ?? 0, 10);
    const bonus = parseInt(rollObject.bonus ?? 0, 10);
    const attributeBonus = parseInt(rollObject.attributeBonus ?? 0, 10);

    let numDices =
      (Number.isNaN(attributeValue) ? 0 : attributeValue) +
      (Number.isNaN(bonus) ? 0 : bonus) +
      (Number.isNaN(attributeBonus) ? 0 : attributeBonus);

    let damage = `${game.i18n.localize(
      CONFIG.worldofdarkness.damageTypes[rollObject.damageKey]
    )}`;
    damage += ` (${attributeValue || 0})`;

    if (attributeBonus > 0) {
      damage += ` + ${attributeBonus}`;
    }

    if (rollObject.soaktype === "chimerical") {
      damage += ` ${game.i18n.localize("wod.health.chimerical")}`;
    }

    template.push(damage);

    console.log("Fate Patch | Soak: computed pool and template", {
      attributeValue,
      bonus,
      attributeBonus,
      numDices,
      damageText: damage,
      soaktype: rollObject.soaktype,
      difficulty: rollObject.difficulty,
      useWillpower: rollObject.useWillpower
    });

    // ---------- Шаг 5. Бросок через патченный DiceRoller ----------
    const patchedDiceRoller = resolvePatchedDiceRoller();
    if (!patchedDiceRoller) {
      console.warn(
        "Fate Patch | Soak: patched DiceRoller not available, aborting roll"
      );
      return;
    }

    const soakRoll = new DiceRollContainer(actor);
    soakRoll.action = game.i18n.localize("wod.dice.rollingsoak");
    soakRoll.attribute = "stamina";
    soakRoll.dicetext = template;
    soakRoll.bonus = Number.isNaN(bonus) ? 0 : bonus;
    soakRoll.origin = "soak";
    soakRoll.numDices = numDices;
    soakRoll.woundpenalty = 0;
    soakRoll.difficulty = rollObject.difficulty;
    soakRoll.usewillpower = rollObject.useWillpower;

    console.log("Fate Patch | Soak: prepared DiceRollContainer", {
      actorId: actor?.id,
      actorName: actor?.name,
      action: soakRoll.action,
      dicetext: soakRoll.dicetext,
      bonus: soakRoll.bonus,
      origin: soakRoll.origin,
      numDices: soakRoll.numDices,
      woundpenalty: soakRoll.woundpenalty,
      difficulty: soakRoll.difficulty,
      usewillpower: soakRoll.usewillpower
    });

    try {
      // Оригинальный Soak не использует результат напрямую (DiceRoller сам пишет в чат),
      // но на всякий случай логируем возвращённое значение.
      const result = await patchedDiceRoller(soakRoll);

      console.log("Fate Patch | Soak: roll executed via patched DiceRoller", {
        actorId: actor?.id,
        actorName: actor?.name,
        rollerResult: result
      });

      rollObject.close = true;
    } catch (error) {
      console.error(
        "Fate Patch | Soak: error while executing patched DiceRoller",
        error
      );
      // При ошибке не трогаем rollObject.close, чтобы пользователь мог повторить/закрыть диалог.
      throw error;
    }
  };
}

Hooks.once("init", () => {
  console.log(
    "Fate Patch | DialogSoakRoll hard override init hook fired, attempting to patch DialogSoakRoll"
  );

  try {
    installDialogSoakPatch();
  } catch (error) {
    console.error(
      "Fate Patch | Unexpected error during DialogSoakRoll hard override installation",
      error
    );
  }
});

console.log("Fate Patch | DialogSoakRoll hard override module loaded");
