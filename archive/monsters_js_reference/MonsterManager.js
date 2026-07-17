import Monster from "./Monster.js";

export default class MonsterManager {

    constructor() {
        this.monsters = [];
    }

    addMonster(monsterData) {
        this.monsters.push(new Monster(monsterData));
    }

    getMonster(id) {
        return this.monsters.find(monster => monster.id === id);
    }

    getCurrentPhase(id) {
        return this.getMonster(id)?.getPhase();
    }

    advancePhase(id) {
        const monster = this.getMonster(id);

        if (monster?.hasNextPhase()) {
            monster.nextPhase();
            return true;
        }

        return false;
    }

    getFrenzyLevel(id) {
        return this.getMonster(id)?.getFrenzyLevel() ?? 0;
    }

    getFrenzySymbols(id) {
        return this.getMonster(id)?.getFrenzySymbols() ?? [];
    }

    hasFrenzySymbol(id, symbolName) {
        return this.getMonster(id)?.hasFrenzySymbol(symbolName) ?? false;
    }

    getAllMonsters() {
        return this.monsters;
    }
}