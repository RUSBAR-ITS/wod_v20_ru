/**
 * Fate Hooks — Sheet (actor sheet / track)
 *
 * - Handlebars-хелперы для отрисовки шкалы Fate
 * - Инициализация Fate-данных актёров
 * - Клики по точкам/квадратикам Fate на листе
 * - Клик по заголовку Fate (чистый Fate-бросок)
 */

console.log("Fate Hooks | Sheet module loading");

import { isFateEnabled } from "./settings.js";
import { FateData } from "./fate-data.js";
import {
  GeneralRoll,
  DialogGeneralRoll
} from "../../../systems/worldofdarkness/module/dialogs/dialog-generalroll.js";

/**
 * Регистрация хуков уровня листа и Handlebars-хелперов
 */
Hooks.once("init", () => {
  console.log("Fate Hooks | Sheet init: registering helpers and hooks");

  // Handlebars helpers
  Handlebars.registerHelper("isFateEnabled", function () {
    const enabled = isFateEnabled();
    console.log("Fate Hooks | Handlebars.isFateEnabled ->", enabled);
    return enabled;
  });

  Handlebars.registerHelper("prepareFateDots", function (fateData) {
    console.log("Fate Hooks | Handlebars.prepareFateDots input =", fateData);
    if (!fateData) return [];
    const dots = FateData.prepareFateDots(fateData);
    console.log("Fate Hooks | Handlebars.prepareFateDots output =", dots);
    return dots;
  });

  Handlebars.registerHelper("prepareFateBoxes", function (fateData) {
    console.log("Fate Hooks | Handlebars.prepareFateBoxes input =", fateData);
    if (!fateData) return [];
    const boxes = FateData.prepareFateBoxes(fateData);
    console.log("Fate Hooks | Handlebars.prepareFateBoxes output =", boxes);
    return boxes;
  });

  // Жизненный цикл актёров
  Hooks.once("ready", () => {
    console.log("Fate Hooks | Sheet ready: initializing Fate data for all actors");
    initializeAllActors().catch((e) =>
      console.error("Fate Hooks | initializeAllActors failed", e)
    );
  });

  Hooks.on("createActor", (actor) => {
    console.log(
      "Fate Hooks | createActor:",
      actor ? { id: actor.id, name: actor.name, type: actor.type } : null
    );

    if (!isFateEnabled()) {
      console.log("Fate Hooks | Fate disabled, skip createActor handling");
      return;
    }

    if (!actor) return;

    if (!FateData.isVampire(actor)) {
      console.log(
        "Fate Hooks | createActor: not a vampire, skip Fate init",
        actor.name
      );
      return;
    }

    FateData.initializeActorFate(actor).catch((e) =>
      console.error(
        `Fate Hooks | Failed to initialize Fate for new actor: ${actor.name}`,
        e
      )
    );
  });

  Hooks.on("renderActorSheet", onRenderActorSheet);

  console.log("Fate Hooks | Sheet init complete");
});

/**
 * Обработка отрисовки листа актёра:
 * - клики по .fate-dot / .fate-box
 * - клик по заголовку Fate (data-roll="fate")
 */
function onRenderActorSheet(app, html, data) {
  console.log("Fate Hooks | renderActorSheet fired", {
    appId: app.appId,
    actor: app.object ? { id: app.object.id, name: app.object.name, type: app.object.type } : null,
    fateEnabled: isFateEnabled()
  });

  if (!isFateEnabled()) {
    console.log("Fate Hooks | Fate disabled, abort renderActorSheet");
    return;
  }

  const actor = app.object;
  if (!actor) {
    console.log("Fate Hooks | renderActorSheet: no actor on app.object");
    return;
  }

  if (!FateData.isVampire(actor)) {
    console.log(
      "Fate Hooks | renderActorSheet: actor is not vampire, skip Fate UI",
      actor.name
    );
    return;
  }

  const fate = actor.system?.fate;
  console.log("Fate Hooks | renderActorSheet: actor.system.fate =", fate);

  if (!fate) {
    console.log(
      "Fate Hooks | renderActorSheet: actor has no system.fate, skip Fate UI",
      actor.name
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Клики по точкам и квадратикам Fate
  // ---------------------------------------------------------------------------

  html.on("click", ".fate-dot, .fate-box", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget;
    const index = Number(target.dataset.index ?? 0);
    const type = target.dataset.type; // "dots" или "boxes"

    console.log("Fate Hooks | Sheet click on Fate element", {
      actor: { id: actor.id, name: actor.name },
      index,
      type,
      dataset: target.dataset
    });

    try {
      await FateData.handleFateClick(actor, index, type);
      console.log(
        "Fate Hooks | Fate value after click",
        actor.system?.fate ?? null
      );
      app.render(false);
    } catch (e) {
      console.error(
        "Fate Hooks | Failed to handle Fate click on sheet",
        e
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Клик по заголовку Fate — чистый Fate-бросок (аналогично Willpower roll)
  // ---------------------------------------------------------------------------

  html.on("click", '[data-roll="fate"]', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    console.log("Fate Hooks | Sheet Fate banner clicked", {
      actor: { id: actor.id, name: actor.name }
    });

    try {
      const fateData = FateData.getFateData(actor);
      console.log("Fate Hooks | Sheet Fate banner: FateData.getFateData =", fateData);

      if (!fateData) {
        ui.notifications.warn(
          game.i18n.localize("WOD20RU.FateNoValueForActor")
        );
        return;
      }

      const used = fateData.used ?? 0;
      const max = fateData.max ?? 10;

      if (used >= max) {
        console.log(
          "Fate Hooks | Sheet Fate banner: all Fate boxes already used",
          { used, max }
        );
        ui.notifications.warn(
          game.i18n.localize("WOD20RU.FateRollMaxUsed")
        );
        return;
      }

      const fateValue = fateData.value ?? 0;

      console.log("Fate Hooks | Sheet Fate banner: creating pure Fate roll", {
        fateValue,
        used,
        max
      });

      // Создаём GeneralRoll как для воли, но ставим флаги Fate
      const roll = new GeneralRoll("willpower", "noability", actor);

      // Флаг "это Fate-бросок"
      roll.isFate = true;

      // Локальное состояние Fate в самом объекте броска
      roll.useFate = true;
      roll.fateDice = fateValue;

      console.log("Fate Hooks | Sheet Fate banner: GeneralRoll prepared", {
        attribute: roll.attribute,
        ability: roll.ability,
        isFate: roll.isFate,
        useFate: roll.useFate,
        fateDice: roll.fateDice
      });

      const dialog = new DialogGeneralRoll(actor, roll);
      dialog.render(true);

      console.log(
        "Fate Hooks | Sheet Fate banner: DialogGeneralRoll opened for pure Fate roll"
      );
    } catch (e) {
      console.error(
        "Fate Hooks | Sheet Fate banner: failed to open Fate roll dialog",
        e
      );
    }
  });
}

/**
 * Инициализация Fate-данных у всех существующих актёров (при ready)
 */
async function initializeAllActors() {
  if (!isFateEnabled()) {
    console.log(
      "Fate Hooks | initializeAllActors: Fate system disabled, skipping"
    );
    return;
  }

  const actors = game.actors;
  if (!actors || actors.size === 0) {
    console.log("Fate Hooks | initializeAllActors: no actors found");
    return;
  }

  console.log(
    "Fate Hooks | initializeAllActors: processing actors",
    actors.size
  );

  let vampireCount = 0;

  for (const actor of actors) {
    try {
      if (FateData.isVampire(actor)) {
        vampireCount++;
        console.log(
          "Fate Hooks | initializeAllActors: initializing Fate for vampire",
          { id: actor.id, name: actor.name }
        );
        await FateData.initializeActorFate(actor);
      } else {
        console.log(
          "Fate Hooks | initializeAllActors: skip non-vampire actor",
          actor.name
        );
      }
    } catch (e) {
      console.error(
        `Fate Hooks | initializeAllActors: failed for actor ${actor.name}`,
        e
      );
    }
  }

  console.log(
    `Fate Hooks | initializeAllActors: initialized Fate for ${vampireCount} vampires`
  );
}

console.log("Fate Hooks | Sheet module loaded");
