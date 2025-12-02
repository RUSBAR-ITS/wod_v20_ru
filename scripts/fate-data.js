/**
 * Fate Data Management System
 * Identical to Willpower implementation
 */

console.log("Fate Data | Loading module");

import { isFateEnabled } from "./settings.js";

export class FateData {
    /**
     * Initialize Fate data for an actor if needed
     */
    static async initializeActorFate(actor) {
        // Check if Fate system is enabled and actor is vampire
        if (!isFateEnabled() || !this.isVampire(actor)) {
            return;
        }

        console.log(`Fate Data | Initializing Fate for: ${actor.name}`);

        // Check if Fate data already exists
        const existingFate = this.getFateData(actor);
        if (existingFate) {
            console.log(`Fate Data | ${actor.name} already has Fate data:`, existingFate);
            return;
        }

        // Create initial Fate data exactly like willpower
        try {
            await actor.update({
                system: {
                    fate: {
                        value: 0,      // Number of filled dots (0-10)
                        used: 0,       // Number of filled boxes (0-10)
                        max: 10        // Maximum value
                    }
                }
            });
            console.log(`Fate Data | Initialized Fate for ${actor.name}`);
        } catch (error) {
            console.error(`Fate Data | Failed to initialize Fate for ${actor.name}:`, error);
        }
    }

    /**
     * Check if actor is a vampire
     */
    static isVampire(actor) {
        if (!actor) return false;
        const type = actor.type?.toLowerCase?.();
        return type === "vampire" || type === "vampirecharacter";
    }

    /**
     * Get Fate data from actor
     */
    static getFateData(actor) {
        if (!actor) return null;
        
        console.log(`Fate Data | Getting Fate data for ${actor.name}`);
        console.log(`Fate Data | actor.system:`, actor.system);
        
        // Try different data paths
        if (actor.system?.fate) {
            console.log(`Fate Data | Found in actor.system.fate`);
            return actor.system.fate;
        }
        
        return null;
    }

    /**
     * Prepare Fate data for template (like willpower)
     */
    static prepareFateForTemplate(fateData) {
        console.log(`Fate Data | Preparing Fate data for template:`, fateData);
        
        if (!fateData) return null;
        
        const value = fateData.value || 0;
        const used = fateData.used || 0;
        const max = fateData.max || 10;
        
        console.log(`Fate Data | value=${value}, used=${used}, max=${max}`);
        
        // Prepare dots array (like willpower.dots)
        const dots = [];
        for (let i = 0; i < max; i++) {
            dots.push({
                cssClass: i < value ? "filled" : "",
                index: i,
                type: "dots"
            });
        }
        
        // Prepare boxes array (like willpower.boxes)
        const boxes = [];
        for (let i = 0; i < max; i++) {
            boxes.push({
                cssClass: i < used ? "filled" : "",
                index: i,
                type: "boxes"
            });
        }
        
        const result = {
            dots: dots,
            boxes: boxes,
            value: value,
            used: used,
            max: max
        };
        
        console.log(`Fate Data | Prepared data:`, result);
        return result;
    }

    /**
     * Handle Fate click - exactly like willpower logic
     */
    static async handleFateClick(actor, index, type) {
        console.log(`Fate Data | Handling click: index=${index}, type=${type}`);
        
        const fate = this.getFateData(actor);
        if (!fate) {
            console.log(`Fate Data | No Fate data found for ${actor.name}`);
            return;
        }
        
        const currentValue = fate.value || 0;
        const currentUsed = fate.used || 0;
        
        console.log(`Fate Data | Current: value=${currentValue}, used=${currentUsed}`);
        
        try {
            if (type === "dots") {
                // Left click on dot - set value
                const newValue = (index < currentValue) ? index : index + 1;
                console.log(`Fate Data | Setting value to: ${newValue}`);
                await actor.update({ "system.fate.value": newValue });
                
                // If used exceeds new value, adjust it
                if (currentUsed > newValue) {
                    console.log(`Fate Data | Adjusting used to: ${newValue}`);
                    await actor.update({ "system.fate.used": newValue });
                }
            } else if (type === "boxes") {
                // Left click on box - set used
                let newUsed = (index < currentUsed) ? index : index + 1;
                // Cannot exceed value
                newUsed = Math.min(newUsed, currentValue);
                console.log(`Fate Data | Setting used to: ${newUsed}`);
                await actor.update({ "system.fate.used": newUsed });
            }
            
            console.log(`Fate Data | Updated Fate for ${actor.name}`);
        } catch (error) {
            console.error("Fate Data | Error updating Fate:", error);
        }
    }
}

console.log("Fate Data | Module loaded");
