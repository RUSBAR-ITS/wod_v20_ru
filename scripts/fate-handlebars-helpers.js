// fate-handlebars-helpers.js
// Отдельный Handlebars-хелпер для эмеральдовых fate d10,
// использует emerald-icons.js и НИЧЕГО не трогает в системном templates.js

import EmeraldFateIconHelper from "./emerald-icons.js";

/**
 * Регистрирует хелперы для fate-дайсов
 * Вызываешь это из своего модуля (init/ready/hooks),
 * например: registerFateHandlebarsHelpers();
 */
export const registerFateHandlebarsHelpers = function () {
	/**
	 * Аналог SvgHtml, но специально под эмеральдовые fate d10.
	 *
	 * В шаблоне можно вызывать:
	 *   {{SvgHtmlFate "fate" dice "fate"}}
	 *
	 * Параметры:
	 *  - icon      — строка-префикс, ожидаем "fate" → fate0…fate9
	 *  - dice      — объект с полем value (0–10), как в системе
	 *  - sheettype — по договорённости будет передаваться "fate",
	 *                но для цветов нам он не важен (иконки всегда emerald/gold)
	 *  - options   — как в оригинальном SvgHtml, может переопределить sheettype
	 */
	Handlebars.registerHelper("SvgHtmlFate", (icon, dice, sheettype, options) => {
		let value = 0;

		if (dice && typeof dice.value !== "undefined" && dice.value !== null) {
			value = parseInt(dice.value);
			if (isNaN(value)) value = 0;
		}

		// Как в оригинальной системе: 10 считается как 0
		if (value === 10) {
			value = 0;
		}

		// Совместимость с сигнатурой SvgHtml: options может переопределить sheettype
		if (options !== "" && options !== undefined && options !== null) {
			sheettype = options;
		}

		// Для наших дайсов всё равно используется единый набор, но sheettype оставляем,
		// чтобы API выглядел знакомо. По твоим словам сюда будет передаваться "fate".
		if (!sheettype) {
			sheettype = "fate";
		}

		// Ключ иконки: "fate0"…"fate9"
		const key = `${icon}${value}`;

		// Берём уже подготовленный список иконок из emerald-icons.js
		const iconMap = EmeraldFateIconHelper.GetIconlist(sheettype) || {};
		const svg = iconMap[key] || "";

		// Как в системном SvgHtml: возвращаем URI-encoded SVG
		return encodeURIComponent(svg);
	});
};

// Зарегистрировать хелпер на этапе init Foundry
Hooks.once("init", () => {
    console.log("WOD20RU | Registering Fate Handlebars helpers");
    registerFateHandlebarsHelpers();
});

export default {
	registerFateHandlebarsHelpers
};
