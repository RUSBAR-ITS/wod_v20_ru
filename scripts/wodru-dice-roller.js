// scripts/wodru-dice-roller.js
// Fork of the original World of Darkness DiceRoller with Fate support.
//
// Key points:
// - WoD mechanics remain unchanged: Fate dice are regular d10 for success/botch/exploding.
// - If diceRoll._wodru_fateMeta is present (set by our Fate wrapper), we:
//    * determine how many effective dice are "base" and how many are "Fate",
//    * mark Fate slots (including all their exploding rolls),
//    * count Fate 1s and 10s separately per target,
//    * store the result in diceResult.fate = { ones, tens, net, type }.
// - Individual dice in diceResult.dices get a flag `isFate` (true/false) for UI.
// - InitiativeRoll is copied verbatim from the system and is not Fate-aware.

import BonusHelper from "/systems/worldofdarkness/module/scripts/bonus-helpers.js";
import CombatHelper from "/systems/worldofdarkness/module/scripts/combat-helpers.js";

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
 * Main DiceRoller with Fate support.
 * This is a fork of the original implementation with the following additions:
 *
 * - Reads diceRoll._wodru_fateMeta (if present) to know how many dice in this roll
 *   were added as Fate dice.
 * - For each target, after wound penalties:
 *    * totalSlots = numberDices (as in the original),
 *    * baseSlots = min(totalSlots, fateMeta.baseDice),
 *    * fateSlots = max(0, totalSlots - baseSlots).
 *   Conceptually:
 *    - the first `baseSlots` slots are "normal" dice,
 *    - the remaining `fateSlots` slots are "Fate" dice.
 *
 * - A "slot" is one logical die (with possible exploding re-rolls):
 *    * New slot → slotIndex increments.
 *    * Exploding die → all subsequent rolls for that slot inherit the same
 *      Fate/non-Fate status.
 *
 * - For each target:
 *    * count Fate 1s and 10s as fateOnes / fateTens,
 *    * write diceResult.fate = { ones, tens, net, type },
 *      where type is "success"/"botch"/"zero".
 *
 * Mechanics (success / botch / exploding / soak rules) are otherwise unchanged.
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
  let bonusSuccesses = 0;
  let rolledOne = false;
  let rolledAnySuccesses = false;
  let isfavorited = false;
  let canBotch = true;
  let rollResult = "";
  let info = [];
  let systemtext = [];

  // Fate metadata for this roll (set by our Fate wrapper).
  // If absent or disabled, this function behaves exactly like the original.
  const fateMeta = diceRoll._wodru_fateMeta;
  const fateEnabled =
    !!fateMeta &&
    fateMeta.enabled === true &&
    Number.isFinite(fateMeta.fateDice) &&
    fateMeta.fateDice > 0 &&
    diceRoll.origin !== "damage"; // we do not use Fate on damage rolls

  const globalBaseDice =
    fateEnabled && Number.isFinite(fateMeta.baseDice)
      ? Math.max(0, fateMeta.baseDice | 0)
      : 0;

  difficulty =
    difficulty < CONFIG.worldofdarkness.lowestDifficulty
      ? CONFIG.worldofdarkness.lowestDifficulty
      : difficulty;

  if (actor != undefined) {
    if (await BonusHelper.CheckAttributeAutoBuff(actor, diceRoll.attribute)) {
      bonusSuccesses = await BonusHelper.GetAttributeAutoBuff(
        actor,
        diceRoll.attribute
      );
    }
  }

  if (usewillpower) {
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
    bonusSuccesses += 1;
  }

  if (diceRoll.origin == "soak" && !CONFIG.worldofdarkness.useOnesSoak) {
    canBotch = false;
  }

  if (diceRoll.origin == "damage" && !CONFIG.worldofdarkness.useOnesDamage) {
    canBotch = false;
  }

  // set correct dice colors
  _GetDiceColors(actor);

  if (targetlist.length == 0) {
    const target = {
      numDices: diceRoll.numDices,
    };
    targetlist.push(target);
  }

  for (const target of targetlist) {
    success = bonusSuccesses;
    rolledAnySuccesses = success > 0;
    rolledDices = 0;
    diceResult = [];
    diceResult.dices = [];
    diceResult.successes = success;
    diceResult.rolledAnySuccesses = rolledAnySuccesses;

    let numberDices = target.numDices + diceRoll.woundpenalty;

    if (numberDices < 0) {
      numberDices = 0;
    }

    // --- Fate slot bookkeeping for this target -----------------------------
    // We treat the *effective* number of dice after wound penalty as "slots".
    // The first `baseSlotsForTarget` are normal, the rest are Fate.
    const totalSlotsForTarget = numberDices;
    let baseSlotsForTarget = totalSlotsForTarget;
    let fateSlotsForTarget = 0;

    if (fateEnabled && totalSlotsForTarget > 0) {
      // We assume: there were `globalBaseDice` "normal" dice in the original pool.
      // After penalties, base slots are capped by both total slots and globalBaseDice.
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
    let currentSlotIsFate = false;
    let explodingSameSlot = false;

    // ----------------------------------------------------------------------

    while (numberDices > rolledDices) {
      // Decide which slot we are in and whether it is a Fate slot.
      if (!explodingSameSlot) {
        // New logical slot
        currentSlotIsFate =
          fateEnabled &&
          totalSlotsForTarget > 0 &&
          slotIndex >= baseSlotsForTarget &&
          slotIndex < totalSlotsForTarget;
        slotIndex += 1;
      }
      // If explodingSameSlot is true, we stay in the same slot and keep
      // currentSlotIsFate as-is.

      let chosenDiceColor = _diceColor;
      const roll = await new Roll("1d10");
      await roll.evaluate();
      allDices.push(roll);

      // Increment the number of dices that've been rolled
      rolledDices += 1;

      // Reset exploding flag; we will set it to true again if exploding triggers.
      explodingSameSlot = false;

      // Evaluate each roll term
      roll.terms[0].results.forEach((dice) => {
        // --- Original WoD success / botch / exploding logic ----------------
        if (dice.result == 10) {
          if (
            CONFIG.worldofdarkness.usespecialityAddSuccess &&
            diceRoll.speciality
          ) {
            success += CONFIG.worldofdarkness.specialityAddSuccess;
          } else if (CONFIG.worldofdarkness.usetenAddSuccess) {
            success += CONFIG.worldofdarkness.tenAddSuccess;
          } else {
            success += 1;
          }
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
        } else if (dice.result >= difficulty) {
          rolledAnySuccesses = true;
          success += 1;
        } else if (dice.result == 1 && actor !== undefined) {
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
            actor.system.attributes[diceRoll.ability]?.isfavorited &&
              actor.system.abilities[diceRoll.attribute]?.isfavorited ||
            actor.system.abilities[diceRoll.ability]?.isfavorited
          ) {
            isfavorited = true;
          }

          rolledOne = true;
        }

        // --- Fate counters: only statistics, mechanics unchanged -----------
        if (fateEnabled && currentSlotIsFate) {
          const value = parseInt(dice.result, 10);
          if (value === 1) {
            fateOnes += 1;
          } else if (value === 10) {
            fateTens += 1;
          }
        }

        // --- Original special dice color logic -----------------------------
        if (
          diceRoll.numSpecialDices >= rolledDices &&
          diceRoll.numSpecialDices > 0
        ) {
          chosenDiceColor = _specialDiceType;
        }

        // Result object for this die as used by the original template.
        const result = {
          value: parseInt(dice.result, 10),
          color: chosenDiceColor,
          // New flag: is this die from a Fate slot?
          isFate: fateEnabled && currentSlotIsFate,
        };

        diceResult.dices.push(result);
      });
    }

    if (usewillpower && success < 1) {
      success = 1;
    } else if (success < 0) {
      success = 0;
    }

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

    // if setting of speciality not allow botch is in effect it is a fail instead
    if (
      rollResult == "botch" &&
      !CONFIG.worldofdarkness.specialityAllowBotch &&
      diceRoll.speciality
    ) {
      rollResult = "fail";
    }

    diceResult.successes = `${game.i18n.localize("wod.dice.successes")}: ${success}`;
    diceResult.rolledAnySuccesses = rolledAnySuccesses;
    diceResult.rollResult = rollResult;

    // --- Fate summary for this target -------------------------------------
    if (fateEnabled) {
      const net = fateTens - fateOnes;
      let type = "zero";
      if (net > 0) type = "success";
      else if (net < 0) type = "botch";

      diceResult.fate = {
        ones: fateOnes,
        tens: fateTens,
        net,
        value: Math.abs(net),
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
  const template =
    "modules/wod_v20_ru/templates/dialogs/roll-template.hbs";
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

  return success;
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

  // Render the chat card template
  const template =
    "modules/wod_v20_ru/templates/dialogs/roll-template.hbs";
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
