import Phaser from "phaser";

export type LoadableAsset = {
  key: string;
  path: string;
};

export type SkillCardInput = "basic" | "skill1" | "skill2" | "ultimate";
export type SkillSheetType = "column" | "header" | "hero_header" | "skill_column";
export type SkillReferenceId = "controls" | "notes" | "status" | "status_effects" | "full_skill_sheet" | "full_skill_sheet_v2" | "full_skill23_sheet";
export type DetailedEnemyPreviewId = "crawler" | "sky_hunter" | "horned_mutant" | "aegis_elite" | "abyssal_colossus";

export const assetPath = (path: string) => `/assets/${path}`;
export const getAssetPath = assetPath;

const HERO_SKILL_IDS = ["nova_blade", "crimson_flare", "volt_sentinel", "emerald_phantom"] as const;

export const AssetKeys = {
  backgroundCity: "background-city-neon",
  backgroundLab: "background-lab-sewer",
  backgroundLava: "background-lava-fortress",
  detailBackgroundCity: "detail-background-cyber-city",
  detailGameplayLane: "detail-environment-gameplay-lane",
  detailPlatformTiles: "detail-environment-platform-tiles",
  detailFullDesignSheet: "detail-sheet-full-design",

  uiPortraitFrame: "ui-portrait-frame",
  uiHealthBar: "ui-health-bar",
  uiEnergyBar: "ui-energy-bar",
  uiBossBar: "ui-boss-bar",
  uiMissionPanel: "ui-mission-panel",
  uiButtonStates: "ui-button-states",
  uiDialogueBox: "ui-dialogue-box",
  uiMenuButtons: "ui-menu-buttons",
  uiStageSelectButton: "ui-stage-select-button",
  detailHudPanel: "detail-ui-hud-panel",
  detailMainButtonsPanel: "detail-ui-main-buttons-panel",
  detailPausePanel: "detail-ui-pause-panel",
  detailStageClearPanel: "detail-ui-stage-clear-panel",
  detailGameOverPanel: "detail-ui-game-over-panel",

  slash1: "effect-slash-crescent-1",
  slash2: "effect-slash-crescent-2",
  slashSheet: "effect-slash-effects-sheet",
  energyBlastSheet: "effect-energy-blasts-sheet",
  hitSparksSheet: "effect-hit-sparks-sheet",
  explosionsSheet: "effect-explosions-sheet",
  detailEffectNova: "detail-effect-nova-blade",
  detailEffectCrimson: "detail-effect-crimson-flare",
  detailEffectVolt: "detail-effect-volt-sentinel",
  detailEffectEmerald: "detail-effect-emerald-phantom",
  detailEffectCommon: "detail-effect-common",

  crawlerIdle: "enemy-crawler-idle",
  crawlerWalk: "enemy-crawler-walk",
  crawlerAlert: "enemy-crawler-alert",
  crawlerLeap: "enemy-crawler-leap",
  crawlerExplode: "enemy-crawler-explode",
  mutantIdle: "enemy-mutant-idle",
  mutantMain: "enemy-mutant-main",
  mutantWalk1: "enemy-mutant-walk-1",
  mutantWalk2: "enemy-mutant-walk-2",
  mutantAttack: "enemy-mutant-attack",
  mutantCharge: "enemy-mutant-charge",
  skyHunterIdle: "enemy-sky-hunter-idle",
  skyHunterHover: "enemy-sky-hunter-hover",
  skyHunterDive: "enemy-sky-hunter-dive",
  skyHunterFire: "enemy-sky-hunter-fire",
  skyHunterSweep: "enemy-sky-hunter-sweep",
  aegisMain: "enemy-aegis-main",
  aegisIdle: "enemy-aegis-idle",
  aegisWalk: "enemy-aegis-walk",
  aegisBash: "enemy-aegis-bash",
  aegisShot: "enemy-aegis-shot",
  aegisBreak: "enemy-aegis-break",
  bossMain: "enemy-boss-main",
  bossIdle: "enemy-boss-idle",
  bossBeam: "enemy-boss-beam",
  bossSlam: "enemy-boss-slam",
  bossRage: "enemy-boss-rage",
  bossSpires: "enemy-boss-spires",
  bossWhip: "enemy-boss-whip",

  itemCredit: "item-credit-coin",
  itemEnergy: "item-energy-crystal",
  itemHealth: "item-health-pickup",
  itemKeycard: "item-keycard",
  itemTreasure: "item-treasure-chest",
  itemUpgrade: "item-upgrade-chip",
  detailItemHealth: "detail-item-health-pickup",
  detailItemEnergy: "detail-item-energy-pickup",
  detailItemScore: "detail-item-score-crystal",
  detailItemArmorCore: "detail-item-armor-core",

  cityProps: "props-city",
  cityNewsScreen: "props-city-news-screen",
  cityCanister: "props-city-canister",
  cityLaserGate: "props-city-laser-gate",
  cityFloorPad: "props-city-floor-pad",
  labProps: "props-lab",
  lavaProps: "props-lava",
  cityTiles: "tiles-city-platform",
  labTiles: "tiles-lab-platform",
  lavaTiles: "tiles-lava-platform",
};

export const skillIconKey = (heroId: string, input: SkillCardInput) => `skill-ui-${heroId}-${input}-icon`;
export const basicAttackCardKey = (heroId: string) => `skill-card-${heroId}-basic`;
export const skillCardKey = (heroId: string, input: Exclude<SkillCardInput, "basic">) => `skill-card-${heroId}-${input}`;
export const skillSheetKey = (heroId: string, type: SkillSheetType) => `skill-sheet-${heroId}-${type}`;
export const skillReferenceKey = (id: SkillReferenceId) => `skill-reference-${id}`;
export const detailedHeroCardKey = (heroId: string) => `detail-hero-${heroId}-card`;
export const detailedHeroArtKey = (heroId: string) => `detail-hero-${heroId}-art`;
export const detailedHeroStripKey = (heroId: string) => `detail-hero-${heroId}-sprite-strip`;
export const detailedEnemyPreviewKey = (id: DetailedEnemyPreviewId) => `detail-enemy-${id}-preview`;

export const getSkillIcon = (heroId: string, input: SkillCardInput) => {
  const file =
    input === "basic"
      ? "j_basic_attack_icon.png"
      : input === "skill1"
        ? "k_skill1_icon.png"
        : input === "skill2"
          ? "l_skill2_icon.png"
          : "u_ultimate_icon.png";
  return assetPath(`skills/${heroId}/icons/${file}`);
};

export const getSkillCard = (heroId: string, input: SkillCardInput) => {
  const file =
    input === "basic"
      ? "j_basic_attack_card.png"
      : input === "skill1"
        ? "k_skill1_card.png"
        : input === "skill2"
          ? "l_skill2_card.png"
          : "u_ultimate_card.png";
  return assetPath(`skills/${heroId}/cards/${file}`);
};

export const getSkillSheet = (heroId: string, type: SkillSheetType) => assetPath(`skills/${heroId}/sheet/${heroId}_${type}.png`);

export const safeLoadImage = (scene: Phaser.Scene, key: string, path: string, fallbackKey?: string) => {
  if (scene.textures.exists(key) || (fallbackKey && scene.textures.exists(fallbackKey))) return;
  scene.load.image(key, path);
};

const skillMenuAssets = (): LoadableAsset[] =>
  HERO_SKILL_IDS.flatMap((heroId) => [
    { key: skillIconKey(heroId, "basic"), path: getSkillIcon(heroId, "basic") },
    { key: skillIconKey(heroId, "skill1"), path: getSkillIcon(heroId, "skill1") },
    { key: skillIconKey(heroId, "skill2"), path: getSkillIcon(heroId, "skill2") },
    { key: skillIconKey(heroId, "ultimate"), path: getSkillIcon(heroId, "ultimate") },
    { key: basicAttackCardKey(heroId), path: getSkillCard(heroId, "basic") },
    { key: skillCardKey(heroId, "skill1"), path: getSkillCard(heroId, "skill1") },
    { key: skillCardKey(heroId, "skill2"), path: getSkillCard(heroId, "skill2") },
    { key: skillCardKey(heroId, "ultimate"), path: getSkillCard(heroId, "ultimate") },
    { key: skillSheetKey(heroId, "column"), path: getSkillSheet(heroId, "column") },
    { key: skillSheetKey(heroId, "header"), path: getSkillSheet(heroId, "header") },
    { key: skillSheetKey(heroId, "hero_header"), path: getSkillSheet(heroId, "hero_header") },
    { key: skillSheetKey(heroId, "skill_column"), path: getSkillSheet(heroId, "skill_column") },
  ]);

export const StaticAssets = {
  backgrounds: [
    { key: AssetKeys.backgroundCity, path: assetPath("backgrounds/city_neon.png") },
    { key: AssetKeys.backgroundLab, path: assetPath("backgrounds/lab_sewer.png") },
    { key: AssetKeys.backgroundLava, path: assetPath("backgrounds/lava_fortress.png") },
    { key: AssetKeys.detailBackgroundCity, path: assetPath("detail/environment/cyber_city_parallax_background.png") },
    { key: AssetKeys.detailGameplayLane, path: assetPath("detail/environment/gameplay_lane_example.png") },
    { key: AssetKeys.detailPlatformTiles, path: assetPath("detail/environment/industrial_platform_tiles.png") },
    { key: AssetKeys.detailFullDesignSheet, path: assetPath("detail/sheets/full_design_sheet.png") },
  ],
  ui: [
    { key: AssetKeys.uiPortraitFrame, path: assetPath("ui/portrait/hero_portrait_frame.png") },
    { key: AssetKeys.uiHealthBar, path: assetPath("ui/hud/health_bar.png") },
    { key: AssetKeys.uiEnergyBar, path: assetPath("ui/hud/energy_bar.png") },
    { key: AssetKeys.uiBossBar, path: assetPath("ui/hud/boss_bar.png") },
    { key: AssetKeys.uiMissionPanel, path: assetPath("ui/hud/mission_panel.png") },
    { key: AssetKeys.uiButtonStates, path: assetPath("ui/buttons/button_states.png") },
    { key: AssetKeys.uiDialogueBox, path: assetPath("ui/dialog/dialogue_box.png") },
    { key: AssetKeys.uiMenuButtons, path: assetPath("ui/menu/menu_buttons.png") },
    { key: AssetKeys.uiStageSelectButton, path: assetPath("ui/menu/stage_select_button.png") },
    { key: AssetKeys.detailHudPanel, path: assetPath("detail/ui/hud_p1_p2_boss_panel.png") },
    { key: AssetKeys.detailMainButtonsPanel, path: assetPath("detail/ui/main_buttons_panel.png") },
    { key: AssetKeys.detailPausePanel, path: assetPath("detail/ui/pause_panel.png") },
    { key: AssetKeys.detailStageClearPanel, path: assetPath("detail/ui/stage_clear_panel.png") },
    { key: AssetKeys.detailGameOverPanel, path: assetPath("detail/ui/game_over_panel.png") },
  ],
  effects: [
    { key: AssetKeys.slash1, path: assetPath("effects/slash_crescent_1.png") },
    { key: AssetKeys.slash2, path: assetPath("effects/slash_crescent_2.png") },
    { key: AssetKeys.slashSheet, path: assetPath("effects/slash_effects_sheet.png") },
    { key: AssetKeys.energyBlastSheet, path: assetPath("effects/energy_blasts_sheet.png") },
    { key: AssetKeys.hitSparksSheet, path: assetPath("effects/hit_sparks_sheet.png") },
    { key: AssetKeys.explosionsSheet, path: assetPath("effects/explosions_sheet.png") },
    { key: AssetKeys.detailEffectNova, path: assetPath("detail/effects/nova_blade_effects.png") },
    { key: AssetKeys.detailEffectCrimson, path: assetPath("detail/effects/crimson_flare_effects.png") },
    { key: AssetKeys.detailEffectVolt, path: assetPath("detail/effects/volt_sentinel_effects.png") },
    { key: AssetKeys.detailEffectEmerald, path: assetPath("detail/effects/emerald_phantom_effects.png") },
    { key: AssetKeys.detailEffectCommon, path: assetPath("detail/effects/common_effects.png") },
  ],
  enemies: [
    { key: AssetKeys.crawlerIdle, path: assetPath("enemies/crawler/crawler_main.png") },
    { key: AssetKeys.crawlerWalk, path: assetPath("enemies/crawler/crawl.png") },
    { key: AssetKeys.crawlerAlert, path: assetPath("enemies/crawler/alert.png") },
    { key: AssetKeys.crawlerLeap, path: assetPath("enemies/crawler/leap.png") },
    { key: AssetKeys.crawlerExplode, path: assetPath("enemies/crawler/explode.png") },
    { key: AssetKeys.mutantIdle, path: assetPath("enemies/horned_mutant/idle.png") },
    { key: AssetKeys.mutantMain, path: assetPath("enemies/horned_mutant/mutant_main.png") },
    { key: AssetKeys.mutantWalk1, path: assetPath("enemies/horned_mutant/walk_1.png") },
    { key: AssetKeys.mutantWalk2, path: assetPath("enemies/horned_mutant/walk_2.png") },
    { key: AssetKeys.mutantAttack, path: assetPath("enemies/horned_mutant/attack_punch.png") },
    { key: AssetKeys.mutantCharge, path: assetPath("enemies/horned_mutant/attack_charge.png") },
    { key: AssetKeys.skyHunterIdle, path: assetPath("enemies/sky_hunter/sky_hunter_main.png") },
    { key: AssetKeys.skyHunterHover, path: assetPath("enemies/sky_hunter/hover.png") },
    { key: AssetKeys.skyHunterDive, path: assetPath("enemies/sky_hunter/dive.png") },
    { key: AssetKeys.skyHunterFire, path: assetPath("enemies/sky_hunter/fire.png") },
    { key: AssetKeys.skyHunterSweep, path: assetPath("enemies/sky_hunter/sweep.png") },
    { key: AssetKeys.aegisMain, path: assetPath("enemies/aegis_elite/aegis_main.png") },
    { key: AssetKeys.aegisIdle, path: assetPath("enemies/aegis_elite/shield_idle.png") },
    { key: AssetKeys.aegisWalk, path: assetPath("enemies/aegis_elite/walk.png") },
    { key: AssetKeys.aegisBash, path: assetPath("enemies/aegis_elite/shield_bash.png") },
    { key: AssetKeys.aegisShot, path: assetPath("enemies/aegis_elite/shot.png") },
    { key: AssetKeys.aegisBreak, path: assetPath("enemies/aegis_elite/shield_break.png") },
    { key: AssetKeys.bossMain, path: assetPath("enemies/boss/abyssal_colossus_main.png") },
    { key: AssetKeys.bossIdle, path: assetPath("enemies/boss/idle.png") },
    { key: AssetKeys.bossBeam, path: assetPath("enemies/boss/beam_cannon.png") },
    { key: AssetKeys.bossSlam, path: assetPath("enemies/boss/slam.png") },
    { key: AssetKeys.bossRage, path: assetPath("enemies/boss/rage.png") },
    { key: AssetKeys.bossSpires, path: assetPath("enemies/boss/summon_spires.png") },
    { key: AssetKeys.bossWhip, path: assetPath("enemies/boss/tentacle_whip.png") },
    { key: detailedEnemyPreviewKey("crawler"), path: assetPath("detail/enemies/crawler_drone_card.png") },
    { key: detailedEnemyPreviewKey("sky_hunter"), path: assetPath("detail/enemies/sky_hunter_card.png") },
    { key: detailedEnemyPreviewKey("horned_mutant"), path: assetPath("detail/enemies/horned_mutant_card.png") },
    { key: detailedEnemyPreviewKey("aegis_elite"), path: assetPath("detail/enemies/aegis_elite_card.png") },
    { key: detailedEnemyPreviewKey("abyssal_colossus"), path: assetPath("detail/enemies/abyssal_colossus_boss.png") },
  ],
  items: [
    { key: AssetKeys.itemCredit, path: assetPath("items/credit_coin.png") },
    { key: AssetKeys.itemEnergy, path: assetPath("items/energy_crystal.png") },
    { key: AssetKeys.itemHealth, path: assetPath("items/health_pickup.png") },
    { key: AssetKeys.itemKeycard, path: assetPath("items/keycard.png") },
    { key: AssetKeys.itemTreasure, path: assetPath("items/treasure_chest.png") },
    { key: AssetKeys.itemUpgrade, path: assetPath("items/upgrade_chip.png") },
    { key: AssetKeys.detailItemHealth, path: assetPath("detail/items/health_pickup.png") },
    { key: AssetKeys.detailItemEnergy, path: assetPath("detail/items/energy_pickup.png") },
    { key: AssetKeys.detailItemScore, path: assetPath("detail/items/score_crystal.png") },
    { key: AssetKeys.detailItemArmorCore, path: assetPath("detail/items/armor_core.png") },
  ],
  props: [
    { key: AssetKeys.cityProps, path: assetPath("props/city_props.png") },
    { key: AssetKeys.cityNewsScreen, path: assetPath("processed/environment/city/news_screen.png") },
    { key: AssetKeys.cityCanister, path: assetPath("processed/environment/city/canister.png") },
    { key: AssetKeys.cityLaserGate, path: assetPath("processed/environment/city/laser_gate.png") },
    { key: AssetKeys.cityFloorPad, path: assetPath("processed/environment/city/floor_pad.png") },
    { key: AssetKeys.labProps, path: assetPath("props/lab_props.png") },
    { key: AssetKeys.lavaProps, path: assetPath("props/lava_props.png") },
  ],
  tiles: [
    { key: AssetKeys.cityTiles, path: assetPath("tiles/city_platform_tiles.png") },
    { key: AssetKeys.labTiles, path: assetPath("tiles/lab_platform_tiles.png") },
    { key: AssetKeys.lavaTiles, path: assetPath("tiles/lava_platform_tiles.png") },
  ],
  skillMenu: skillMenuAssets(),
  skillReferences: [
    { key: skillReferenceKey("controls"), path: assetPath("skills/reference/controls_reference.png") },
    { key: skillReferenceKey("notes"), path: assetPath("skills/reference/notes_reference.png") },
    { key: skillReferenceKey("status"), path: assetPath("skills/reference/status_reference.png") },
    { key: skillReferenceKey("status_effects"), path: assetPath("skills/reference/status_effects_reference.png") },
    { key: skillReferenceKey("full_skill_sheet"), path: assetPath("skills/full_skill_sheet.png") },
    { key: skillReferenceKey("full_skill_sheet_v2"), path: assetPath("skills/full_skill_sheet_v2.png") },
    { key: skillReferenceKey("full_skill23_sheet"), path: assetPath("skills/full_skill23_sheet.png") },
  ],
  detailedHeroes: HERO_SKILL_IDS.flatMap((heroId) => [
    { key: detailedHeroCardKey(heroId), path: assetPath(`detail/heroes/${heroId}/hero_card.png`) },
    { key: detailedHeroArtKey(heroId), path: assetPath(`detail/heroes/${heroId}/hero_art.png`) },
    { key: detailedHeroStripKey(heroId), path: assetPath(`detail/heroes/${heroId}/sprite_strip_reference.png`) },
  ]),
};

export const REQUIRED_RUNTIME_ASSETS = [
  ...StaticAssets.backgrounds,
  ...StaticAssets.ui,
  ...StaticAssets.effects,
  ...StaticAssets.enemies,
  ...StaticAssets.items,
  ...StaticAssets.props,
  ...StaticAssets.tiles,
  ...StaticAssets.skillMenu,
  ...StaticAssets.skillReferences,
  ...StaticAssets.detailedHeroes,
];
