// wod20-ru-lang.js
// Russian WoD20 helpers (language detection, template overrides, langRU flag)

/**
 * Return current Foundry UI language.
 */
function getCurrentLanguage() {
  // Foundry VTT v10+ usually uses game.i18n.lang
  try {
    if (game && game.i18n && game.i18n.lang) return game.i18n.lang;
  } catch (e) {
    // ignore
  }

  // Fallback to the core language setting if needed
  try {
    if (game && game.settings) {
      return game.settings.get("core", "language");
    }
  } catch (e) {
    // ignore
  }

  return "en";
}

/**
 * Template overrides registry.
 * systemPath  – partial key used by the system when including the template
 * modulePath  – path to our replacement template inside this module
 */
const TEMPLATE_OVERRIDES = [
  {
    systemPath: "systems/worldofdarkness/templates/actor/parts/combat_armor.html",
    modulePath: "modules/wod_v20_ru/templates/actor/parts/combat_armor.html"
  },
  {
    systemPath: "systems/worldofdarkness/templates/actor/parts/combat_melee.html",
    modulePath: "modules/wod_v20_ru/templates/actor/parts/combat_melee.html"
  },
  {
    systemPath: "systems/worldofdarkness/templates/actor/parts/combat_natural.html",
    modulePath: "modules/wod_v20_ru/templates/actor/parts/combat_natural.html"
  },
  {
    systemPath: "systems/worldofdarkness/templates/actor/parts/combat_ranged.html",
    modulePath: "modules/wod_v20_ru/templates/actor/parts/combat_ranged.html"
  },
  {
    systemPath: "systems/worldofdarkness/templates/actor/parts/movement.html",
    modulePath: "modules/wod_v20_ru/templates/actor/parts/movement.html"
  },
  {
    systemPath: "systems/worldofdarkness/templates/actor/parts/stats.html",
    modulePath: "modules/wod_v20_ru/templates/actor/parts/stats.html"
  },
  {
    systemPath: "systems/worldofdarkness/templates/actor/parts/settings_combat.html",
    modulePath: "modules/wod_v20_ru/templates/actor/parts/settings_combat.html"
  },
  {
    systemPath: "systems/worldofdarkness/templates/actor/vampire-sheet.html",
    modulePath: "modules/wod_v20_ru/templates/actor/vampire-sheet.html"
  }

  // Add more overrides here as needed, for example:
  // {
  //   systemPath: "systems/worldofdarkness/templates/actor/parts/combat_melee.html",
  //   modulePath: "modules/wod_v20_ru/templates/actor/parts/combat_melee.html"
  // }
];

console.log("wod_v20_ru: wod20-ru-lang.js evaluated");

/**
 * Load and register all template overrides from TEMPLATE_OVERRIDES.
 */
Hooks.once("init", async () => {
  const lang = getCurrentLanguage();
  console.log("wod_v20_ru: init hook, current language =", lang);

  // If you want these layout changes only for Russian UI,
  // uncomment the guard below:
  //
  // if (lang !== "ru") {
  //   console.log("wod_v20_ru: skipping template overrides for non-RU language");
  //   return;
  // }

  if (!TEMPLATE_OVERRIDES.length) return;

  const tasks = TEMPLATE_OVERRIDES.map(async (entry) => {
    const { systemPath, modulePath } = entry;

    try {
      const template = await getTemplate(modulePath);

      // systemPath must match exactly the key used by the system when including this partial
      Handlebars.registerPartial(systemPath, template);

      console.log(
        "wod_v20_ru: template override registered:",
        systemPath,
        "→",
        modulePath
      );
    } catch (err) {
      console.error(
        "wod_v20_ru: failed to override template",
        systemPath,
        "with",
        modulePath,
        err
      );
    }
  });

  await Promise.all(tasks);
});

/**
 * Add langRU class to <body> when Russian is active.
 * Used by CSS to scope all RU-specific layout/typography changes.
 */
Hooks.once("ready", () => {
  const lang = getCurrentLanguage();
  console.log("wod_v20_ru: ready hook fired, current language =", lang);

  if (lang === "ru") {
    document.body.classList.add("langRU");
    console.log("wod_v20_ru: langRU class added to <body>");
  } else {
    console.log("wod_v20_ru: language is not 'ru', no class added");
  }
});
