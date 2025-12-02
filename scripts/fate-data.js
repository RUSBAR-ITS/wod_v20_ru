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
                "system.fate": {
                    value: 0,      // Number of filled dots (0-10)
                    used: 0,       // Number of filled boxes (0-10)
                    max: 10        // Maximum value
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
        
        // Try different data paths
        if (actor.system?.fate) {
            return actor.system.fate;
        }
        
        return null;
    }

    /**
     * Prepare Fate data for template (like willpower)
     */
    static prepareFateForTemplate(fateData) {
        console.log(`Fate Data | Preparing Fate data for template:`, fateData);
        
        if (!fateData) {
            console.log(`Fate Data | No Fate data provided`);
            return null;
        }
        
        const value = fateData.value || 0;
        const used = fateData.used || 0;
        const max = fateData.max || 10;
        
        console.log(`Fate Data | value=${value}, used=${used}, max=${max}`);
        
        // Prepare dots array (like willpower.dots) - IMPORTANT: 0-indexed!
        const dots = [];
        for (let i = 0; i < max; i++) {
            dots.push({
                cssClass: i < value ? "filled" : "",
                index: i,  // 0-based index
                type: "dots"
            });
        }
        
        // Prepare boxes array (like willpower.boxes) - IMPORTANT: 0-indexed!
        const boxes = [];
        for (let i = 0; i < max; i++) {
            boxes.push({
                cssClass: i < used ? "filled" : "",
                index: i,  // 0-based index
                type: "boxes"
            });
        }
        
        const result = {
            value: value,
            used: used,
            max: max,
            dots: dots,
            boxes: boxes
        };
        
        console.log(`Fate Data | Prepared data:`, result);
        console.log(`Fate Data | Dots array length: ${dots.length}`);
        console.log(`Fate Data | Boxes array length: ${boxes.length}`);
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
                // Click on dot - set value
                // Note: index is 0-based from template, value is 1-based
                const newValue = (index === currentValue - 1) ? index : index + 1;
                console.log(`Fate Data | Setting value to: ${newValue}`);
                
                await actor.update({
                    "system.fate.value": newValue
                });
                
                // If used exceeds new value, adjust it
                if (currentUsed > newValue) {
                    console.log(`Fate Data | Adjusting used to: ${newValue}`);
                    await actor.update({
                        "system.fate.used": newValue
                    });
                }
            } else if (type === "boxes") {
                // Click on box - set used
                // Note: index is 0-based from template, used is 1-based
                let newUsed = (index === currentUsed - 1) ? index : index + 1;
                // Cannot exceed value
                newUsed = Math.min(newUsed, currentValue);
                console.log(`Fate Data | Setting used to: ${newUsed}`);
                
                await actor.update({
                    "system.fate.used": newUsed
                });
            }
            
            console.log(`Fate Data | Updated Fate for ${actor.name}`);
        } catch (error) {
            console.error("Fate Data | Error updating Fate:", error);
        }
    }
}

console.log("Fate Data | Module loaded");
