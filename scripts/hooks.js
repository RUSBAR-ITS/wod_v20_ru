/**
 * Fate System Hooks
 */

console.log("Fate Hooks | Loading module");

import { isFateEnabled } from "./settings.js";
import { FateData } from "./fate-data.js";
import { GeneralRoll, DialogGeneralRoll } from "../../../systems/worldofdarkness/module/dialogs/dialog-generalroll.js";

// ---------------------------------------------------------------------------
// Патч DialogGeneralRoll: если это Fate-ролл, подменяем имя и значение атрибута
// ---------------------------------------------------------------------------

(function patchDialogGeneralRollForFate() {
  const proto = DialogGeneralRoll.prototype;
  if (proto._wodV20RuFatePatched) return;

  const originalGetData = proto.getData;

  proto.getData = async function (...args) {
    const data = await originalGetData.call(this, ...args);

    try {
      // Наш Fate-бросок помечаем флагом isFate
      if (this.object?.isFate && this.actor) {
        const fateData = FateData.getFateData(this.actor);
        const label = game.i18n.localize("WOD20RU.Fate");
        const value = fateData?.value ?? 0;

        // То, что уйдёт в шаблон
        data.object.attributeName  = label;
        data.object.attributeValue = value;
        data.object.name           = label;

        // И сам объект диалога (для расчёта пулов и логики броска)
        this.object.attributeName  = label;
        this.object.attributeValue = value;
        this.object.name           = label;

        // На всякий случай выключаем специализацию
        data.object.hasSpeciality  = false;
        this.object.hasSpeciality  = false;
        this.object.useSpeciality  = false;
      }
    } catch (e) {
      console.error("Fate Hooks | Error in patched DialogGeneralRoll.getData", e);
    }

    return data;
  };

  proto._wodV20RuFatePatched = true;
  console.log("Fate Hooks | DialogGeneralRoll patched for Fate");
})();

// ---------------------------------------------------------------------------
// Инициализация хуков
// ---------------------------------------------------------------------------

console.log("Fate Hooks | Initializing immediately");

if (game.actors) {
  initializeHooks();
} else {
  Hooks.once("init", initializeHooks);
}

function initializeHooks() {
  console.log("Fate Hooks | Initializing hooks");

  // Handlebars-хелперы для шаблона листа
  Handlebars.registerHelper("isFateEnabled", function () {
    return isFateEnabled();
  });

  Handlebars.registerHelper("prepareFateDots", function (fateData) {
    if (!fateData) return [];
    return FateData.prepareFateDots(fateData);
  });

  Handlebars.registerHelper("prepareFateBoxes", function (fateData) {
    if (!fateData) return [];
    return FateData.prepareFateBoxes(fateData);
  });

  // Инициализируем Fate-данные на всех вампирах при загрузке мира
  Hooks.once("ready", () => {
    console.log("Fate Hooks | Game ready, initializing Fate data for all actors");
    initializeAllActors();
  });

  // Новый актёр — проверяем, нужно ли ему Fate
  Hooks.on("createActor", (actor) => {
    console.log(`Fate Hooks | New actor created: ${actor.name}`);
    FateData.initializeActorFate(actor);
  });

  // Подвешиваем клики на листы
  Hooks.on("renderActorSheet", (app, html, data) => {
    if (!isFateEnabled()) return;

    const actor = app.object;
    if (!actor || !FateData.isVampire(actor)) return;

    console.log(`Fate Hooks | Setting up click handlers for: ${actor.name}`);

    // Клики по точкам и квадратикам Fate
    html.on("click", ".fate-dot, .fate-box", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const target = event.currentTarget;
      const index = Number(target.dataset.index ?? 0);
      const type  = target.dataset.type; // "dots" или "boxes"

      console.log(`Fate Hooks | Click on Fate element: index=${index}, type=${type}`);

      await FateData.handleFateClick(actor, index, type);
      app.render(false);
    });

    // Клик по заголовку Fate — открываем диалог броска,
    // полностью аналогичный броску Силы Воли
    html.on("click", '[data-roll="fate"]', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      console.log(`Fate Hooks | Click on Fate banner roll for: ${actor.name}`);

      const fateData = FateData.getFateData(actor);
      if (!fateData) return;

      const used = fateData.used ?? 0;
      const max  = fateData.max ?? 10;

      // Если все квадратики Fate уже потрачены — не даём бросать
      if (used >= max) {
        ui.notifications.warn(game.i18n.localize("WOD20RU.FateRollMaxUsed"));
        return;
      }

      // ВАЖНО: используем ту же комбинацию, что система для Воли:
      // key = "willpower", type = "noability"
      const roll = new GeneralRoll("willpower", "noability", actor);

      // Помечаем бросок как Fate, чтобы патч getData его перехватил
      roll.isFate = true;

      const dialog = new DialogGeneralRoll(actor, roll);
      dialog.render(true);
    });
  });

  console.log("Fate Hooks | Hooks initialized");
}

// ---------------------------------------------------------------------------
// Инициализация Fate-данных у существующих актёров
// ---------------------------------------------------------------------------

async function initializeAllActors() {
  if (!isFateEnabled()) {
    console.log("Fate Hooks | Fate system disabled, skipping actor initialization");
    return;
  }

  const actors = game.actors;
  if (!actors || actors.size === 0) {
    console.log("Fate Hooks | No actors found");
    return;
  }

  console.log(`Fate Hooks | Found ${actors.size} actors, checking for vampires`);

  let vampireCount = 0;
  for (const actor of actors) {
    if (FateData.isVampire(actor)) {
      vampireCount++;
      await FateData.initializeActorFate(actor);
    }
  }

  console.log(`Fate Hooks | Initialized Fate data for ${vampireCount} vampires`);
}

console.log("Fate Hooks | Module loaded");
