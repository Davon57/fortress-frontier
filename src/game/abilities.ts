export type AbilityId = "forcedMarch" | "conscription" | "barrage" | "bulwark";

/** none 立即生效；squad 需要点选一支敌方行军部队；fort 需要点选一座己方堡垒。 */
export type AbilityTargeting = "none" | "squad" | "fort";

export interface AbilityProfile {
  name: string;
  hint: string;
  targeting: AbilityTargeting;
  cooldown: number;
  charges: number;
  duration: number;
}

export const MARCH_SPEED_BONUS = 1.6;
export const CONSCRIPTION_BONUS = 2;
export const BARRAGE_DAMAGE = 0.3;
export const BULWARK_DEFENSE = 2;

export const abilityOrder: AbilityId[] = ["forcedMarch", "conscription", "barrage", "bulwark"];

export const abilityProfiles: Record<AbilityId, AbilityProfile> = {
  forcedMarch: {
    name: "急行军",
    hint: "10 秒内己方部队行军速度 +60%",
    targeting: "none",
    cooldown: 26,
    charges: 3,
    duration: 10,
  },
  conscription: {
    name: "征兵令",
    hint: "15 秒内己方堡垒产兵翻倍",
    targeting: "none",
    cooldown: 30,
    charges: 3,
    duration: 15,
  },
  barrage: {
    name: "炮火支援",
    hint: "点选一支敌方行军部队，立即歼灭其 30%",
    targeting: "squad",
    cooldown: 18,
    charges: 3,
    duration: 0,
  },
  bulwark: {
    name: "坚壁",
    hint: "点选一座己方堡垒，20 秒内防御翻倍",
    targeting: "fort",
    cooldown: 24,
    charges: 2,
    duration: 20,
  },
};

export interface AbilityRuntime {
  charges: number;
  cooldown: number;
}

export type AbilityFaction = "player" | "ai";

export interface ActiveEffect {
  ability: AbilityId;
  remaining: number;
  faction: AbilityFaction;
  /** 仅 bulwark 使用，指向受保护的堡垒；全局增益为 -1。 */
  fort: number;
}

export type AbilityOutcome = "cast" | "cooling" | "depleted" | "invalid-target" | "unavailable";

export const createAbilityRuntime = (): Record<AbilityId, AbilityRuntime> =>
  Object.fromEntries(
    abilityOrder.map((id) => [id, { charges: abilityProfiles[id].charges, cooldown: 0 }]),
  ) as Record<AbilityId, AbilityRuntime>;

export const abilityReadiness = (state: AbilityRuntime): AbilityOutcome =>
  state.charges <= 0 ? "depleted" : state.cooldown > 0 ? "cooling" : "cast";
