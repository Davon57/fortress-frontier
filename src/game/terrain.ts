export type Biome =
  | "grassland"
  | "river"
  | "desert"
  | "jungle"
  | "snow"
  | "islands"
  | "volcano"
  | "highland"
  | "city"
  | "capital";

export interface TerrainEffect {
  production: number;
  combat: number;
  description: string;
}

export const terrainEffects: Record<Biome, TerrainEffect> = {
  grassland: { production: 1, combat: 1, description: "标准产兵与战斗速度" },
  river: { production: 1, combat: 0.9, description: "渡河交战损耗降低 10%" },
  desert: { production: 0.8, combat: 1, description: "补给困难，产兵速度降低 20%" },
  jungle: { production: 0.9, combat: 0.8, description: "密林掩护，交战损耗降低 20%" },
  snow: { production: 0.75, combat: 0.9, description: "严寒使产兵速度降低 25%" },
  islands: { production: 0.9, combat: 1, description: "海运补给使产兵速度降低 10%" },
  volcano: { production: 1, combat: 1.25, description: "危险地形使交战损耗提高 25%" },
  highland: { production: 0.85, combat: 1.1, description: "高原补给较慢，交战损耗提高 10%" },
  city: { production: 1.15, combat: 0.9, description: "城内补给提高 15%，防御战更持久" },
  capital: { production: 1.25, combat: 1.1, description: "王都补给提高 25%，战斗更激烈" },
};
