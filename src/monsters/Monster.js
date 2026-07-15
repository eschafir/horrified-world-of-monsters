export default class Monster {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.complexity = data.complexity;
        this.hasLair = data.hasLair;
        this.objective = data.objective;

        // Frenzy data for single-phase monsters
        this.frenzyLevel = data.frenzyLevel ?? 0;
        this.frenzySymbols = data.frenzySymbols ?? [];

        this.phases = data.phases ?? [];

        this.currentPhase = 0;
    }

    getPhase() {
        return this.phases[this.currentPhase];
    }

    nextPhase() {
        if (this.currentPhase < this.phases.length - 1) {
            this.currentPhase++;
        }
    }

    hasNextPhase() {
        return this.currentPhase < this.phases.length - 1;
    }

    /**
     * Returns the frenzy level for the current phase.
     * Supports both:
     * - Monster-level frenzy (Yeti, Sphinx, Jiangshi)
     * - Phase-level frenzy (Cthulhu)
     */
    getFrenzyLevel() {
        const phase = this.getPhase();

        if (phase?.frenzyLevel !== undefined) {
            return phase.frenzyLevel;
        }

        return this.frenzyLevel;
    }

    /**
     * Returns the frenzy symbols for the current phase.
     * Supports both:
     * - Monster-level symbols
     * - Phase-level symbols
     */
    getFrenzySymbols() {
        const phase = this.getPhase();

        if (phase?.frenzySymbols !== undefined) {
            return phase.frenzySymbols;
        }

        return this.frenzySymbols;
    }

    /**
     * Helper function to check if a monster has a specific frenzy symbol.
     */
    hasFrenzySymbol(symbolName) {
        return this.getFrenzySymbols()
            .some(symbol => symbol.symbol === symbolName);
    }
}