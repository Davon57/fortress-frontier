export type BuildingKind =
  "house" | "lumberyard" | "forager" | "farm" | "granary" | "smithy" | "watchtower";
export interface ManorState {
  season: "春" | "夏" | "秋" | "冬";
  day: number;
  population: number;
  workers: number;
  food: number;
  wood: number;
  tools: number;
  influence: number;
  militia: number;
  jobs: { logger: number; farmer: number; smith: number };
  buildings: Record<BuildingKind, number>;
  raidIn: number;
  manorHealth: number;
  ended: boolean;
  log: string[];
  territories: Record<"home" | "north" | "south" | "enemy", "player" | "neutral" | "ai">;
  threats: Record<"north" | "south", number>;
}
const cost: Record<BuildingKind, number> = {
  house: 8,
  lumberyard: 12,
  forager: 10,
  farm: 14,
  granary: 16,
  smithy: 20,
  watchtower: 18,
};
export class ManorSimulation {
  state: ManorState = {
    season: "春",
    day: 1,
    population: 6,
    workers: 6,
    food: 28,
    wood: 30,
    tools: 0,
    influence: 5,
    militia: 0,
    jobs: { logger: 0, farmer: 4, smith: 0 },
    buildings: {
      house: 1,
      lumberyard: 0,
      forager: 1,
      farm: 0,
      granary: 0,
      smithy: 0,
      watchtower: 0,
    },
    raidIn: 90,
    manorHealth: 100,
    ended: false,
    log: ["春天来到：规划你的第一座村庄。"],
    territories: { home: "player", north: "neutral", south: "neutral", enemy: "ai" },
    threats: { north: 12, south: 18 },
  };
  build(kind: BuildingKind) {
    if (this.state.wood < cost[kind] || this.state.ended) return false;
    this.state.wood -= cost[kind];
    this.state.buildings[kind]++;
    this.state.log.unshift(`建成${kind}。`);
    return true;
  }
  assign(job: "logger" | "farmer" | "smith", amount: number) {
    const s = this.state;
    const capacity = job === "logger" ? s.buildings.lumberyard * 3 : job === "farmer" ? (s.buildings.forager + s.buildings.farm) * 4 : s.buildings.smithy * 2;
    const other = Object.entries(s.jobs).filter(([key]) => key !== job).reduce((total, [, value]) => total + value, 0);
    s.jobs[job] = Math.max(0, Math.min(capacity, s.population - s.militia - other, Math.trunc(amount)));
  }
  recruit() {
    const s = this.state;
    if (s.influence < 4 || s.tools < 1 || s.workers < 1 || s.ended) return false;
    s.influence -= 4;
    s.tools--;
    s.workers--;
    s.militia++;
    return true;
  }
  clearThreat(region: "north" | "south") {
    const s = this.state;
    if (s.militia < 2 || s.threats[region] <= 0 || s.ended) return false;
    s.threats[region] = 0;
    s.log.unshift(`${region === "north" ? "北境" : "南境"}的野兽与匪徒已被民兵驱散。`);
    return true;
  }
  establishOutpost(region: "north" | "south") {
    const s = this.state;
    if (s.threats[region] > 0 || s.territories[region] !== "neutral" || s.wood < 24) return false;
    s.wood -= 24;
    s.territories[region] = "player";
    s.log.unshift(`前哨在${region === "north" ? "北境" : "南境"}建立，领地已并入庄园。`);
    return true;
  }
  canInvade() {
    const s = this.state;
    return s.territories.north === "player" && s.territories.south === "player" && s.militia >= 5;
  }
  update(seconds: number) {
    const s = this.state;
    if (s.ended) return;
    const days = Math.floor(seconds);
    if (!days) return;
    for (let i = 0; i < days; i++) {
      s.day++;
      const foodCap = 40 + s.buildings.granary * 80;
      s.wood += s.jobs.logger * 0.7;
      s.food = Math.min(foodCap, s.food + s.jobs.farmer * (s.buildings.farm ? 0.9 : 0.45));
      s.tools += s.jobs.smith * 0.35;
      s.influence += s.buildings.watchtower * 0.5;
      s.raidIn--;
      if (s.day % 30 === 0) {
        s.season = ({ 春: "夏", 夏: "秋", 秋: "冬", 冬: "春" } as const)[s.season];
        if (s.season === "冬") {
          s.food -= s.population * 4;
          if (s.food < 0) {
            s.population = Math.max(1, s.population - 1);
            s.workers = Math.min(s.workers, s.population - s.militia);
            s.food = 0;
            s.log.unshift("饥荒夺走了一名村民。");
          }
        }
      }
      if (s.raidIn <= 0) {
        const damage = Math.max(0, 18 - s.militia * 6 - s.buildings.watchtower * 3);
        s.manorHealth -= damage;
        s.raidIn = 120;
        s.log.unshift(damage ? `劫掠者突破防线，宅邸受损 ${damage}。` : "民兵击退了劫掠者！");
      }
      if (s.manorHealth <= 0) {
        s.ended = true;
        s.log.unshift("宅邸失守，领地覆灭。");
      }
      if (s.population >= 16) {
        s.ended = true;
        s.log.unshift("领地繁荣：你已建立稳固的庄园。");
      }
    }
  }
}
