// emerald-icons.js
// Emerald Fate d10 icons (0–9), based on system xd10 from icons.js

import IconHelper from "./icons.js";

export default class EmeraldFateIconHelper {
    /**
     * Get single emerald fate d10 icon
     * @param {string} icon   - "fatexd10"
     * @param {string} type   - actor type (kept for API compatibility, but colors are fixed emerald/gold)
     * @param {number} number - digit 0–9
     * @returns {string} SVG string
     */
    static GetIcon(icon, type, number = undefined) {
        let data = "";

        switch (icon) {
            case "fatexd10":
                data = this._getFatexD10(number, type);
                break;
        }

        return data;
    }

    /**
     * Icon list for emerald fate dice: fate0 … fate9
     * @param {string} race - kept for API compatibility, not used for colors
     */
    static GetIconlist(race) {
        return {
            fate0: this.GetIcon("fatexd10", race, 0),
            fate1: this.GetIcon("fatexd10", race, 1),
            fate2: this.GetIcon("fatexd10", race, 2),
            fate3: this.GetIcon("fatexd10", race, 3),
            fate4: this.GetIcon("fatexd10", race, 4),
            fate5: this.GetIcon("fatexd10", race, 5),
            fate6: this.GetIcon("fatexd10", race, 6),
            fate7: this.GetIcon("fatexd10", race, 7),
            fate8: this.GetIcon("fatexd10", race, 8),
            fate9: this.GetIcon("fatexd10", race, 9),
        };
    }

    /**
     * Emerald fate d10 (0–9), same shape as system xd10, recolored:
     *  - background: dark emerald
     *  - facets: emerald shades
     *  - number text: gold
     */
    static _getFatexD10(number, type, height = 30, width = 30) {
        // Берём БАЗОВЫЙ xd10 из системного IconHelper — форма и верстка 1:1 как в системе
        let svg = IconHelper.GetIcon("xd10", type, number);

        const emeraldBase  = "#003b2f"; // фон (поле за кубом)
        const emeraldLight = "#00a36c"; // первая грань
        const emeraldEdge  = "#00c896"; // вторая грань / ребра
        const gold         = "#FFD700"; // цифры

        // 1) Перекрашиваем фон: прямоугольник на весь viewBox
        svg = svg.replace(
            /(<path d="M0 0h512v512H0z" fill=")[^"]+(")/,
            `$1${emeraldBase}$2`
        );

        // 2) Перекрашиваем белые элементы:
        //    в системном xd10 белым (#fff) идут:
        //      - 1-й path: одна грань
        //      - 2-й path: другая грань/контур
        //      - text: цифра
        //    Используем счётчик, чтобы дать двум первым – изумруд, третьему – золото.
        let whiteIndex = 0;
        svg = svg.replace(/fill="#fff"/g, () => {
            whiteIndex += 1;
            if (whiteIndex === 1) return `fill="${emeraldLight}"`;
            if (whiteIndex === 2) return `fill="${emeraldEdge}"`;
            return `fill="${gold}"`; // текст с цифрой
        });

        // 3) На всякий случай подправляем высоту/ширину, если хочешь отличать размер
        svg = svg.replace(
            /style="border-radius: 3px; height: \d+px; width: \d+px;"/,
            `style="border-radius: 3px; height: ${height}px; width: ${width}px;"`
        );

        return svg;
    }
}
