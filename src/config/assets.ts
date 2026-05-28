export const assetPath = (path: string) => `/assets/${path}`;

export const AssetKeys = {
  backgroundCity: "background-city-neon",
  uiPortraitFrame: "ui-portrait-frame",
  uiHealthBar: "ui-health-bar",
  uiEnergyBar: "ui-energy-bar",
  uiBossBar: "ui-boss-bar",
  slash1: "effect-slash-crescent-1",
  slash2: "effect-slash-crescent-2",
  energyBlastSheet: "effect-energy-blasts-sheet",
  hitSparksSheet: "effect-hit-sparks-sheet",
  explosionsSheet: "effect-explosions-sheet",
  crawlerIdle: "enemy-crawler-idle",
  crawlerWalk: "enemy-crawler-walk",
  crawlerExplode: "enemy-crawler-explode",
  mutantIdle: "enemy-mutant-idle",
  mutantWalk1: "enemy-mutant-walk-1",
  mutantWalk2: "enemy-mutant-walk-2",
  mutantAttack: "enemy-mutant-attack",
  bossMain: "enemy-boss-main",
  bossIdle: "enemy-boss-idle",
  bossSlam: "enemy-boss-slam",
  bossRage: "enemy-boss-rage",
  skyHunterIdle: "enemy-sky-hunter-idle",
  skyHunterFire: "enemy-sky-hunter-fire",
  cityTiles: "tiles-city-platform",
};

export const StaticAssets = {
  backgrounds: [
    { key: AssetKeys.backgroundCity, path: assetPath("backgrounds/city_neon.png") },
  ],
  ui: [
    { key: AssetKeys.uiPortraitFrame, path: assetPath("ui/portrait/hero_portrait_frame.png") },
    { key: AssetKeys.uiHealthBar, path: assetPath("ui/hud/health_bar.png") },
    { key: AssetKeys.uiEnergyBar, path: assetPath("ui/hud/energy_bar.png") },
    { key: AssetKeys.uiBossBar, path: assetPath("ui/hud/boss_bar.png") },
  ],
  effects: [
    { key: AssetKeys.slash1, path: assetPath("effects/slash_crescent_1.png") },
    { key: AssetKeys.slash2, path: assetPath("effects/slash_crescent_2.png") },
    { key: AssetKeys.energyBlastSheet, path: assetPath("effects/energy_blasts_sheet.png") },
    { key: AssetKeys.hitSparksSheet, path: assetPath("effects/hit_sparks_sheet.png") },
    { key: AssetKeys.explosionsSheet, path: assetPath("effects/explosions_sheet.png") },
  ],
  enemies: [
    { key: AssetKeys.crawlerIdle, path: assetPath("enemies/crawler/crawler_main.png") },
    { key: AssetKeys.crawlerWalk, path: assetPath("enemies/crawler/crawl.png") },
    { key: AssetKeys.crawlerExplode, path: assetPath("enemies/crawler/explode.png") },
    { key: AssetKeys.mutantIdle, path: assetPath("enemies/horned_mutant/mutant_main.png") },
    { key: AssetKeys.mutantWalk1, path: assetPath("enemies/horned_mutant/walk_1.png") },
    { key: AssetKeys.mutantWalk2, path: assetPath("enemies/horned_mutant/walk_2.png") },
    { key: AssetKeys.mutantAttack, path: assetPath("enemies/horned_mutant/attack_punch.png") },
    { key: AssetKeys.bossMain, path: assetPath("enemies/boss/abyssal_colossus_main.png") },
    { key: AssetKeys.bossIdle, path: assetPath("enemies/boss/idle.png") },
    { key: AssetKeys.bossSlam, path: assetPath("enemies/boss/slam.png") },
    { key: AssetKeys.bossRage, path: assetPath("enemies/boss/rage.png") },
    { key: AssetKeys.skyHunterIdle, path: assetPath("enemies/sky_hunter/sky_hunter_main.png") },
    { key: AssetKeys.skyHunterFire, path: assetPath("enemies/sky_hunter/fire.png") },
  ],
  tiles: [
    { key: AssetKeys.cityTiles, path: assetPath("tiles/city_platform_tiles.png") },
  ],
};

export const REQUIRED_RUNTIME_ASSETS = [
  ...StaticAssets.backgrounds,
  ...StaticAssets.ui,
  ...StaticAssets.effects,
  ...StaticAssets.enemies,
  ...StaticAssets.tiles,
];
