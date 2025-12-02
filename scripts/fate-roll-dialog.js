/**
 * Fate Roll Dialog
 * Dialog for rolling Fate similar to Willpower roll
 */

export class FateRollDialog extends Dialog {
    constructor(actor, sheet, options = {}) {
        super(options);
        this.actor = actor;
        this.sheet = sheet;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            template: "modules/wod_v20_ru/templates/dialogs/fate-roll-dialog.html",
            classes: ["wod-dialog", "fate-roll-dialog"],
            width: 400,
            height: "auto"
        });
    }

    getData() {
        const fateData = this.actor.system.fate || { value: 0, used: 0, max: 10 };
        const canUseFate = fateData.used < fateData.max;
        
        return {
            actor: this.actor,
            fate: fateData,
            canUseFate: canUseFate,
            config: CONFIG.WOD20
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        html.find('.roll-fate-button').click(async (event) => {
            event.preventDefault();
            
            const fateData = this.actor.system.fate || { value: 0, used: 0, max: 10 };
            const used = fateData.used || 0;
            const max = fateData.max || 10;
            
            if (used >= max) {
                ui.notifications.warn(game.i18n.localize("WOD20RU.FateRollMaxUsed"));
                return;
            }
            
            // Execute Fate roll
            await this.rollFate();
            this.close();
        });
        
        html.find('.cancel-button').click((event) => {
            event.preventDefault();
            this.close();
        });
    }

    async rollFate() {
        try {
            const fateData = this.actor.system.fate || { value: 0, used: 0, max: 10 };
            const used = fateData.used || 0;
            const max = fateData.max || 10;
            
            // Check if Fate can be used
            if (used >= max) {
                ui.notifications.warn(game.i18n.localize("WOD20RU.FateRollMaxUsed"));
                return;
            }
            
            // Roll Fate dice (always 10 dice)
            const diceCount = 10;
            
            // Create Fate dice roll
            const rollData = {
                actor: this.actor,
                diceCount: diceCount,
                difficulty: 6, // Default difficulty
                specialty: false,
                useFate: true
            };
            
            // This is a placeholder - actual roll implementation will be in dice system
            console.log(`Fate Roll | Rolling ${diceCount} Fate dice for ${this.actor.name}`);
            
            // Increment used counter
            await this.actor.update({
                "system.fate.used": used + 1
            });
            
            // Show notification
            ui.notifications.info(game.i18n.format("WOD20RU.FateRollRolled", { 
                name: this.actor.name, 
                dice: diceCount 
            }));
            
        } catch (error) {
            console.error("Fate Roll | Error rolling Fate:", error);
            ui.notifications.error(game.i18n.localize("WOD20RU.FateRollError"));
        }
    }
}
