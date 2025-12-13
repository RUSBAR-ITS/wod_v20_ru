// scripts/wodru-dice-roller.js
// Fork of the original World of Darkness DiceRoller with Fate support.
//
// Key points:
// - WoD mechanics remain unchanged: Fate dice are regular d10 for success/botch/exploding.
// - If diceRoll._wodru_fateMeta is present (set by our Fate wrapper), we:
//    * determine how many effective dice are "base" and how many are "Fate",
//    * mark Fate slots (including all their exploding rolls),
//    * count Fate 1s and 10s separately per target,
//    * store the result in diceResult.fate = { ones, tens, net, type, value }.
// - Individual dice in diceResult.dices get a flag `isFate` (true/false) for UI.
// - InitiativeRoll is copied verbatim from the system and is not Fate-aware.
// - For each result we also store `botchDegree` when rollResult === "botch":
//    botchDegree ≈ onesCount - successesBeforeOnesAndWillpower (с безопасным фолбэком).
//
// Pure Fate support (diceRoll.isFate === true):
// - Roll ONLY Fate dice (all dice flagged as Fate, DSN colorset applied).
// - Resolve ONLY Fate rules: net = tens - ones, type = success/botch/zero.
// - Do NOT apply WoD difficulty/success/botch/exploding rules for pure Fate.

import BonusHelper from "/systems/worldofdarkness/module/scripts/bonus-helpers.js";
import CombatHelper from "/systems/worldofdarkness/module/scripts/combat-helpers.js";
import { isEvilBotchesEnabled } from "./settings.js";

// Dice So Nice colorset name for Fate dice.
// This must match the name registered in wodru-dice-so-nice.js
const WODRU_FATE_DSN_COLORSET = "wodru-fate-emerald";

let _diceColor;
let _specialDiceType = "";

/**
 * Helper from the original system: determine base dice color by actor type.
 * Left unchanged to preserve existing behavior.
 */
function _GetDiceColors(actor) {
  _diceColor = "black_";

  if (actor == undefined) {
    _diceColor = "black_";
    return;
  }

  let diceType = actor?.type.toLowerCase();

  if (actor?.system?.settings?.dicesetting != "") {
    diceType = actor.system.settings.dicesetting;
  }
  if (
    actor.system.settings.variantsheet ==
      CONFIG.worldofdarkness.sheettype.changeling &&
    actor.system.settings.dicesetting == ""
  ) {
    _diceColor = "blue_";
  }
  if (
    actor.system.settings.variantsheet ==
      CONFIG.worldofdarkness.sheettype.werewolf &&
    actor.system.settings.dicesetting == ""
  ) {
    _diceColor = "brown_";
  }
  if (
    actor.system.settings.variantsheet ==
      CONFIG.worldofdarkness.sheettype.mage &&
    actor.system.settings.dicesetting == ""
  ) {
    _diceColor = "purple_";
  }
  if (
    actor.system.settings.variantsheet ==
      CONFIG.worldofdarkness.sheettype.vampire &&
    actor.system.settings.dicesetting == ""
  ) {
    _diceColor = "red_";
  }
  if (
    actor.system.settings.variantsheet ==
      CONFIG.worldofdarkness.sheettype.wraith &&
    actor.system.settings.dicesetting == ""
  ) {
    _diceColor = "death_";
  }

  if (diceType == CONFIG.worldofdarkness.sheettype.mortal.toLowerCase()) {
    _diceColor = "blue_";
  }
  if (
    diceType == CONFIG.worldofdarkness.sheettype.werewolf.toLowerCase() ||
    diceType == "changing breed"
  ) {
    _diceColor = "brown_";
  }
  if (diceType == CONFIG.worldofdarkness.sheettype.mage.toLowerCase()) {
    _diceColor = "purple_";
  }
  if (diceType == CONFIG.worldofdarkness.sheettype.vampire.toLowerCase()) {
    _diceColor = "red_";
  }
  if (diceType == CONFIG.worldofdarkness.sheettype.changeling.toLowerCase()) {
    _diceColor = "blue_";
    _specialDiceType = "black_";
  }
  if (
    diceType == CONFIG.worldofdarkness.sheettype.hunter.toLowerCase() ||
    diceType == CONFIG.worldofdarkness.sheettype.demon.toLowerCase()
  ) {
    _diceColor = "orange_";
  }
  if (
    diceType == CONFIG.worldofdarkness.sheettype.wraith.toLowerCase() ||
    actor.system.settings.variantsheet == CONFIG.worldofdarkness.sheettype.wraith
  ) {
    _diceColor = "death_";
  }
  if (diceType == CONFIG.worldofdarkness.sheettype.mummy.toLowerCase()) {
    _diceColor = "yellow_";
  }
  if (diceType == "none") {
    _diceColor = "black_";
  }
}

/**
 * Data container from the original system (left for compatibility).
 */
export class DiceRollContainer {
  constructor(actor) {
    this.actor = actor; // rolling actor
    this.attribute = "noselected";
    this.ability = "noselected";
    this.dicetext = [];
    this.bonus = 0;
    this.extraInfo = [];
    this.origin = "";

    this.numDices = 0;
    this.numSpecialDices = 0;
    this.woundpenalty = 0;
    this.difficulty = 6;
    this.action = "";
    this.targetlist = [];

    this.speciality = false;
    this.usewillpower = false;
    this.specialityText = "";
    this.systemText = "";
  }
}

/**
 * Main DiceRoller with Fate support and optional evil botches logic.
 *
 * Evil botчи:
 * - Для каждой цели считаем:
 *    * successesBeforeOnesAndWillpower — ВСЕ успехи до вычитания единиц:
 *      автоуспехи + успех от Воли (если есть) + успехи с кубов (10 и значения ≥ сложности).
 *    * onesCount — общее количество выпавших 1 на всех кубах.
 * - Если onesCount > successesBeforeOnesAndWillpower и ботчи вообще разрешены:
 *    → считаем бросок злым ботчем (rollResult = "botch", успехи = 0).
 *
 * Механика WoD (сколько даёт 10, взрыв, soak и т.п.) не меняется.
 *
 * Pure Fate (diceRoll.isFate === true):
 * - No WoD difficulty/success rules apply.
 * - All dice are Fate dice; result is fateNet = tens - ones.
 */
export async function DiceRoller(diceRoll) {
  const actor = diceRoll.actor;
  let difficulty = diceRoll.difficulty;
  let specialityText = diceRoll.specialityText;
  const systemText = diceRoll.systemText;
  let targetlist = diceRoll.targetlist;
  let usewillpower = diceRoll.usewillpower;

  let diceResult;

  // multi damage dices
  const allDiceResult = [];
  let rollInfo = "";

  // dices to Dice So Nice :)
  const allDices = [];

  let rolledDices;
  let success;
  let bonusSuccesses = 0; // авто успехи от бафов
  let willpowerBonus = 0; // отдельный успех от Воли
  let rolledOne = false;
  let rolledAnySuccesses = false;
  let isfavorited = false;
  let canBotch = true;
  let rollResult = "";
  let info = [];
  let systemtext = [];

  // -------------------------------------------------------------------------
  // Fate flags
  // -------------------------------------------------------------------------
  const fateOnly = diceRoll?.isFate === true; // pure Fate roll
  const fateMeta = diceRoll._wodru_fateMeta;

  // Fate injected into a normal WoD roll (from wrapper)
  const fateInjected =
    !!fateMeta &&
    fateMeta.enabled === true &&
    Number.isFinite(fateMeta.fateDice) &&
    fateMeta.fateDice > 0 &&
    diceRoll.origin !== "damage"; // we do not use Fate on damage rolls

  // Convenience: any Fate mode active (either injected or pure)
  const fateActive = fateOnly || fateInjected;

  const globalBaseDice =
    fateInjected && Number.isFinite(fateMeta.baseDice)
      ? Math.max(0, fateMeta.baseDice | 0)
      : 0;

  const evilBotchesEnabled = isEvilBotchesEnabled() === true;

  // WoD difficulty clamping (doesn't matter for Fate-only, but harmless)
  difficulty =
    difficulty < CONFIG.worldofdarkness.lowestDifficulty
      ? CONFIG.worldofdarkness.lowestDifficulty
      : difficulty;

  // Auto successes and willpower (WoD-only; pure Fate ignores these)
  if (!fateOnly && actor != undefined) {
    if (await BonusHelper.CheckAttributeAutoBuff(actor, diceRoll.attribute)) {
      bonusSuccesses = await BonusHelper.GetAttributeAutoBuff(
        actor,
        diceRoll.attribute
      );
    }
  }

  if (!fateOnly && usewillpower) {
    if (actor) {
      const currentWillpower = actor.system.advantages.willpower.temporary;
      if (currentWillpower > 0) {
        const newWillpower = currentWillpower - 1;
        await actor.update({
          "system.advantages.willpower.temporary": newWillpower,
        });
      }
    }
    rolledAnySuccesses = true;
    willpowerBonus = 1; // этот успех учитывается и в success, и в "до вычета единиц"
  } else if (fateOnly) {
    // Pure Fate does not spend Willpower nor gain +1 success from it.
    usewillpower = false;
    willpowerBonus = 0;
  }

  if (diceRoll.origin == "soak" && !CONFIG.worldofdarkness.useOnesSoak) {
    canBotch = false;
  }

  if (diceRoll.origin == "damage" && !CONFIG.worldofdarkness.useOnesDamage) {
    canBotch = false;
  }

  // set correct dice colors (still used for non-fate dice visuals)
  _GetDiceColors(actor);

  if (targetlist.length == 0) {
    const target = {
      numDices: diceRoll.numDices,
    };
    targetlist.push(target);
  }

  for (const target of targetlist) {
    // Start WoD with auto successes + willpower; Fate-only starts at 0
    success = fateOnly ? 0 : bonusSuccesses + willpowerBonus;
    rolledAnySuccesses = success > 0;
    rolledDices = 0;
    diceResult = [];
    diceResult.dices = [];
    diceResult.successes = success;
    diceResult.rolledAnySuccesses = rolledAnySuccesses;

    // WoD counters
    let diceSuccessesBeforeOnes = 0;
    let onesCount = 0;

    // Base dice count (note: Fate-only uses the same pool size)
    let numberDices = target.numDices + (diceRoll.woundpenalty ?? 0);

    if (numberDices < 0) {
      numberDices = 0;
    }

    // --- Fate slot bookkeeping for this target -----------------------------
    const totalSlotsForTarget = numberDices;

    // In Fate-only, ALL slots are Fate slots.
    let baseSlotsForTarget = fateOnly ? 0 : totalSlotsForTarget;
    let fateSlotsForTarget = fateOnly ? totalSlotsForTarget : 0;

    if (!fateOnly && fateInjected && totalSlotsForTarget > 0) {
      baseSlotsForTarget = Math.min(totalSlotsForTarget, globalBaseDice);
      fateSlotsForTarget = Math.max(
        0,
        totalSlotsForTarget - baseSlotsForTarget
      );
    }

    // Per-target Fate counters
    let fateOnes = 0;
    let fateTens = 0;

    // Slot index and exploding flag
    let slotIndex = 0; // 0 .. totalSlotsForTarget - 1
    let currentSlotIsFate = fateOnly ? true : false;
    let explodingSameSlot = false;

    // ----------------------------------------------------------------------

    while (numberDices > rolledDices) {
      // Decide which slot we are in and whether it is a Fate slot.
      // In Fate-only: always Fate, and we never explode the slot.
      if (!fateOnly) {
        if (!explodingSameSlot) {
          currentSlotIsFate =
            fateInjected &&
            totalSlotsForTarget > 0 &&
            slotIndex >= baseSlotsForTarget &&
            slotIndex < totalSlotsForTarget;
          slotIndex += 1;
        }
      } else {
        currentSlotIsFate = true;
      }

      const isFateDie = fateActive && currentSlotIsFate === true;

      let chosenDiceColor = _diceColor;
      const roll = await new Roll("1d10");
      await roll.evaluate();

      // Dice So Nice colorset for Fate dice
      if (isFateDie) {
        if (roll.dice && roll.dice[0]) {
          if (!roll.dice[0].options) {
            roll.dice[0].options = {};
          }
          roll.dice[0].options.colorset = WODRU_FATE_DSN_COLORSET;
        } else if (roll.terms && roll.terms[0]) {
          if (!roll.terms[0].options) {
            roll.terms[0].options = {};
          }
          roll.terms[0].options.colorset = WODRU_FATE_DSN_COLORSET;
        }
      }

      allDices.push(roll);

      rolledDices += 1;

      // In Fate-only we never do exploding logic
      explodingSameSlot = false;

      roll.terms[0].results.forEach((dice) => {
        const dieValue = parseInt(dice.result, 10);

        // ------------------------------------------------------------------
        // WoD logic (disabled for Fate-only)
        // ------------------------------------------------------------------
        if (!fateOnly) {
          if (dieValue === 10) {
            let gainedSuccesses = 0;

            if (
              CONFIG.worldofdarkness.usespecialityAddSuccess &&
              diceRoll.speciality
            ) {
              gainedSuccesses = CONFIG.worldofdarkness.specialityAddSuccess;
            } else if (CONFIG.worldofdarkness.usetenAddSuccess) {
              gainedSuccesses = CONFIG.worldofdarkness.tenAddSuccess;
            } else {
              gainedSuccesses = 1;
            }

            success += gainedSuccesses;
            diceSuccessesBeforeOnes += gainedSuccesses;

            if (CONFIG.worldofdarkness.useexplodingDice) {
              if (
                CONFIG.worldofdarkness.explodingDice == "speciality" &&
                diceRoll.speciality
              ) {
                rolledDices -= 1;
                explodingSameSlot = true;
              }
              if (CONFIG.worldofdarkness.explodingDice == "always") {
                rolledDices -= 1;
                explodingSameSlot = true;
              }
            }

            rolledAnySuccesses = true;
          } else if (dieValue >= difficulty) {
            rolledAnySuccesses = true;
            success += 1;
            diceSuccessesBeforeOnes += 1;
          } else if (dieValue === 1) {
            onesCount += 1;

            if (actor !== undefined) {
              if (
                CONFIG.worldofdarkness.handleOnes &&
                canBotch &&
                !actor.system.attributes[diceRoll.attribute]?.isfavorited &&
                !actor.system.attributes[diceRoll.ability]?.isfavorited &&
                !actor.system.abilities[diceRoll.attribute]?.isfavorited &&
                !actor.system.abilities[diceRoll.ability]?.isfavorited
              ) {
                success--;
              }
              // special rules regarding Exalted
              else if (
                actor.system.attributes[diceRoll.attribute]?.isfavorited ||
                (actor.system.attributes[diceRoll.ability]?.isfavorited &&
                  actor.system.abilities[diceRoll.attribute]?.isfavorited) ||
                actor.system.abilities[diceRoll.ability]?.isfavorited
              ) {
                isfavorited = true;
              }
            }

            rolledOne = true;
          }
        } else {
          // Fate-only: still track whether any 1 was rolled for logging symmetry
          if (dieValue === 1) rolledOne = true;
        }

        // ------------------------------------------------------------------
        // Fate counters
        // - Fate-only: all dice count
        // - Fate-injected: only Fate slots count
        // ------------------------------------------------------------------
        if (fateActive && currentSlotIsFate) {
          if (dieValue === 1) {
            fateOnes += 1;
          } else if (dieValue === 10) {
            fateTens += 1;
          }
        }

        // ------------------------------------------------------------------
        // Special dice colors (WoD-only; Fate-only doesn't need special dice)
        // ------------------------------------------------------------------
        if (
          !fateOnly &&
          diceRoll.numSpecialDices >= rolledDices &&
          diceRoll.numSpecialDices > 0
        ) {
          chosenDiceColor = _specialDiceType;
        }

        const result = {
          value: dieValue,
          color: chosenDiceColor,
          isFate: fateActive && currentSlotIsFate,
        };

        diceResult.dices.push(result);
      });
    }

    // ----------------------------------------------------------------------
    // Resolve outcomes
    // ----------------------------------------------------------------------

    // Fate net (for fateActive, including Fate-only)
    let fateNet = 0;
    if (fateActive) {
      fateNet = fateTens - fateOnes;
    }

    // Fate-only resolution: ignore WoD success/botch rules entirely
    if (fateOnly) {
      let type = "zero";
      if (fateNet > 0) type = "success";
      else if (fateNet < 0) type = "botch";

      // Map to rollResult for template compatibility
      if (type === "success") rollResult = "success";
      else if (type === "botch") rollResult = "botch";
      else rollResult = "fail";

      // Pure Fate has no WoD "successes"; keep successes at 0.
      // (Template should render fate block.)
      success = 0;
      rolledAnySuccesses = fateNet > 0;

      diceResult.successes = success;
      diceResult.rolledAnySuccesses = rolledAnySuccesses;
      diceResult.rollResult = rollResult;

      if (rollResult === "botch") {
        // For Fate-only, botchDegree reflects magnitude of negative net
        diceResult.botchDegree = Math.max(1, Math.abs(fateNet));
      }

      diceResult.fate = {
        ones: fateOnes,
        tens: fateTens,
        net: fateNet,
        value: Math.abs(fateNet),
        type,
      };

      // Optional logging (reuses the existing evil botches toggle for verbosity)
      if (evilBotchesEnabled) {
        console.log(
          "Evil Botches | roll summary",
          `actor=${actor?.name}`,
          `origin=${diceRoll.origin}`,
          `attr=${diceRoll.attribute}`,
          `ability=${diceRoll.ability}`,
          `diff=${difficulty}`,
          `useWP=${usewillpower}`,
          `bonusSucc=${bonusSuccesses}`,
          `wpSucc=${willpowerBonus}`,
          `diceSuccBeforeOnes=${diceSuccessesBeforeOnes}`,
          `succBeforeOnesTotal=${bonusSuccesses + willpowerBonus + diceSuccessesBeforeOnes}`,
          `ones=${onesCount}`,
          `finalSucc=${success}`,
          `rolledAnySucc=${rolledAnySuccesses}`,
          `rolledOne=${rolledOne}`,
          `canBotch=${canBotch}`,
          `evilApplied=false`,
          `rollResult=${rollResult}`,
          `botchDegree=${diceResult.botchDegree ?? 0}`,
          `fateEnabled=true`,
          `fateOnly=true`,
          `fateOnes=${fateOnes}`,
          `fateTens=${fateTens}`,
          `fateNet=${fateNet}`
        );
      }

      allDiceResult.push(diceResult);
      continue;
    }

    // ----------------------------------------------------------------------
    // WoD resolution (original behavior + optional evil botches)
    // ----------------------------------------------------------------------

    // Успехи "до вычета единиц": авто + воля + успехи с кубов
    const successesBeforeOnesAndWillpower =
      bonusSuccesses + willpowerBonus + diceSuccessesBeforeOnes;

    // Применяем волю / обрезаем отрицательные успехи (как в оригинале)
    if (usewillpower && success < 1) {
      success = 1;
    } else if (success < 0) {
      success = 0;
    }

    // Злой ботч
    let evilBotchApplied = false;
    if (evilBotchesEnabled && canBotch) {
      if (onesCount > successesBeforeOnesAndWillpower) {
        rollResult = "botch";
        success = 0;
        evilBotchApplied = true;
      }
    }

    // Стандартное определение результата, если злой ботч не сработал
    if (!evilBotchApplied) {
      if (success > 0) {
        rollResult = "success";
      } else if (
        CONFIG.worldofdarkness.handleOnes &&
        rolledOne &&
        !rolledAnySuccesses &&
        canBotch
      ) {
        rollResult = "botch";
      } else if (!CONFIG.worldofdarkness.handleOnes && rolledOne && canBotch) {
        rollResult = "botch";
      } else {
        rollResult = "fail";
      }
    }

    // Если по настройкам ботча со специализацией быть не должно
    if (
      rollResult == "botch" &&
      !CONFIG.worldofdarkness.specialityAllowBotch &&
      diceRoll.speciality
    ) {
      rollResult = "fail";
    }

    // Степень ботча (botchDegree) — считаем после финального rollResult
    let botchDegree = 0;
    if (rollResult === "botch") {
      const rawDegree = onesCount - successesBeforeOnesAndWillpower;

      if (rawDegree > 0) {
        botchDegree = rawDegree;
      } else if (onesCount > 0) {
        // Фолбэк на "количество единиц", если по какой-то причине
        // rawDegree не положителен, но мы всё равно в состоянии botch.
        botchDegree = onesCount;
      } else {
        // Минимум 1, чтобы не показывать "Ботч: 0"
        botchDegree = 1;
      }
    }

    // Подробный лог, чтобы видеть все цифры
    if (evilBotchesEnabled) {
      console.log(
        "Evil Botches | roll summary",
        `actor=${actor?.name}`,
        `origin=${diceRoll.origin}`,
        `attr=${diceRoll.attribute}`,
        `ability=${diceRoll.ability}`,
        `diff=${difficulty}`,
        `useWP=${usewillpower}`,
        `bonusSucc=${bonusSuccesses}`,
        `wpSucc=${willpowerBonus}`,
        `diceSuccBeforeOnes=${diceSuccessesBeforeOnes}`,
        `succBeforeOnesTotal=${successesBeforeOnesAndWillpower}`,
        `ones=${onesCount}`,
        `finalSucc=${success}`,
        `rolledAnySucc=${rolledAnySuccesses}`,
        `rolledOne=${rolledOne}`,
        `canBotch=${canBotch}`,
        `evilApplied=${evilBotchApplied}`,
        `rollResult=${rollResult}`,
        `botchDegree=${botchDegree}`,
        `fateEnabled=${fateInjected}`,
        `fateOnly=false`,
        `fateOnes=${fateOnes}`,
        `fateTens=${fateTens}`,
        `fateNet=${fateNet}`
      );
    }

    // Сохраняем в результат ЧИСЛО успехов (шаблон сам пишет "Успехи:")
    diceResult.successes = success;
    diceResult.rolledAnySuccesses = rolledAnySuccesses;
    diceResult.rollResult = rollResult;
    if (rollResult === "botch") {
      diceResult.botchDegree = botchDegree;
    }

    // --- Fate summary for this target -------------------------------------
    if (fateInjected) {
      let type = "zero";
      if (fateNet > 0) type = "success";
      else if (fateNet < 0) type = "botch";

      diceResult.fate = {
        ones: fateOnes,
        tens: fateTens,
        net: fateNet,
        value: Math.abs(fateNet),
        type,
      };
    }

    allDiceResult.push(diceResult);
  }

  for (const property of diceRoll.dicetext) {
    if (rollInfo != "") {
      rollInfo += " + ";
    }
    rollInfo += property;
  }

  if (diceRoll.bonus > 0) {
    rollInfo += ` + ${diceRoll.bonus}`;
  } else if (diceRoll.bonus < 0) {
    rollInfo += ` ${diceRoll.bonus}`;
  }

  // if attack then there will be a damage code in the information
  if (diceRoll.damageCode != undefined) {
    if (rollInfo != "") {
      rollInfo += " ";
    }
    rollInfo += diceRoll.damageCode;
  }

  // if any wound penalty show in message
  if (
    diceRoll.woundpenalty < 0 &&
    actor != undefined &&
    actor.system.health != undefined &&
    actor.system.health.damage.woundlevel != ""
  ) {
    info.push(
      `${game.i18n.localize(actor.system.health.damage.woundlevel)} (${
        diceRoll.woundpenalty
      })`
    );
  }

  if (diceRoll.speciality) {
    if (specialityText == "") {
      specialityText = game.i18n.localize("wod.dialog.usingspeciality");
    }
  } else {
    specialityText = "";
  }

  difficulty = `${game.i18n.localize("wod.labels.difficulty")}: ${difficulty}`;

  for (const property of diceRoll.extraInfo) {
    info.push(property);
  }

  if (difficulty != "") {
    info.push(difficulty);
  }
  if (specialityText != "") {
    info.push(specialityText);
  }
  if (usewillpower) {
    info.push(game.i18n.localize("wod.dice.usingwillpower"));
  }
  if (systemText != "") {
    systemtext.push(systemText);
  }
  if (bonusSuccesses > 0) {
    const text = game.i18n.localize("wod.dice.addedautosucc");
    info.push(text.replace("{0}", bonusSuccesses));
  }
  if (isfavorited) {
    info.push(game.i18n.localize("wod.dice.favored"));
  }

  const templateData = {
    data: {
      actor: diceRoll.actor,
      type: diceRoll.origin,
      action: diceRoll.action,
      title: rollInfo,
      info: info,
      systemtext: systemtext,
      multipleresult: allDiceResult,
    },
  };

  // Render the chat card template
  const template = "modules/wod_v20_ru/templates/dialogs/roll-template.hbs";
  const html = await foundry.applications.handlebars.renderTemplate(
    template,
    templateData
  );

  const chatData = {
    rolls: allDices,
    content: html,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    rollMode: game.settings.get("core", "rollMode"),
  };
  ChatMessage.applyRollMode(chatData, "roll");
  ChatMessage.create(chatData);

  // For WoD: return success count.
  // For Fate-only: return fate net (tens - ones).
  // (Callers typically ignore this value, but this is the most meaningful.)
  if (diceRoll?.isFate === true) {
    const last = allDiceResult?.[allDiceResult.length - 1];
    const net = last?.fate?.net ?? 0;
    return net;
  }

  return allDiceResult?.[allDiceResult.length - 1]?.successes ?? 0;
}

/**
 * InitiativeRoll is copied as-is from the system.
 * It does NOT use Fate.
 */
export async function InitiativeRoll(diceRoll) {
  const actor = diceRoll.actor;

  let allDiceResult = [];
  let diceResult = [];
  diceResult.dices = [];
  let info = [];

  let rollInfo = "";

  let foundToken = false;
  let foundEncounter = true;
  let tokenAdded = false;
  let rolledInitiative = false;
  let init = 0;
  let initAttribute;

  const token = await canvas.tokens.placeables.find(
    (t) => t.document.actor._id === actor._id
  );

  if (token) foundToken = true;

  if (game.combat == null) {
    foundEncounter = false;
  }

  // set correct dice colors
  _GetDiceColors(actor);

  const roll = new Roll("1d10");
  await roll.evaluate();
  roll.terms[0].results.forEach((dice) => {
    init += parseInt(dice.result, 10) + parseInt(actor.system.initiative.total);

    const result = {
      value: parseInt(dice.result, 10),
      color: _diceColor,
    };

    diceResult.dices.push(result);

    rollInfo = `${dice.result} + ${actor.system.initiative.total} = ${
      dice.result + actor.system.initiative.total
    }`;
  });

  allDiceResult.push(diceResult);

  if (foundToken && foundEncounter) {
    if (!CombatHelper._inTurn(token)) {
      await token.document.toggleCombatant();

      if (token.combatant.system.initiative == undefined) {
        await token.combatant.update({ initiative: init });
        rolledInitiative = true;
      }

      tokenAdded = true;
    }
  }

  if (actor.type != CONFIG.worldofdarkness.sheettype.spirit) {
    if (
      parseInt(actor.system.attributes.dexterity.total) >=
      parseInt(actor.system.attributes.wits.total)
    ) {
      initAttribute =
        game.i18n.localize(actor.system.attributes.dexterity.label) +
        " " +
        actor.system.attributes.dexterity.total;
    } else {
      initAttribute =
        game.i18n.localize(actor.system.attributes.wits.label) +
        " " +
        actor.system.attributes.wits.total;
    }
  } else {
    initAttribute =
      game.i18n.localize(actor.system.advantages.willpower.label) +
      " " +
      actor.system.advantages.willpower.permanent;
  }

  // (info)
  if (!foundEncounter) {
    info.push(game.i18n.localize("wod.dice.noencounterfound"));
  } else {
    if (!foundToken) {
      info.push(game.i18n.localize("wod.dice.notokenfound"));
    } else {
      if (!tokenAdded) {
        info.push(game.i18n.localize("wod.dice.characteradded"));
        allDiceResult = [];
      }
      if (!rolledInitiative) {
        info.push(
          `${actor.name} ${game.i18n.localize("wod.dice.initiativealready")}`
        );
        allDiceResult = [];
      }
    }
  }

  const templateData = {
    data: {
      actor: diceRoll.actor,
      type: diceRoll.origin,
      action: game.i18n.localize("wod.dice.rollinginitiative"),
      title: rollInfo,
      info: info,
      multipleresult: allDiceResult,
    },
  };

  const template = "modules/wod_v20_ru/templates/dialogs/roll-template.hbs";
  const html = await foundry.applications.handlebars.renderTemplate(
    template,
    templateData
  );

  const chatData = {
    content: html,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    rollMode: game.settings.get("core", "rollMode"),
  };
  ChatMessage.applyRollMode(chatData, "roll");
  ChatMessage.create(chatData);

  return true;
}
