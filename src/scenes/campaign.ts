import type { CampaignProgress } from '../game/progress';
import type { SceneId } from './types';

/** Player navigation only. Simulation, level definitions and developer fixtures stay independent. */
export function campaignComplete(progress: CampaignProgress): boolean {
  return !!(progress.level0Complete && progress.level1Complete && progress.level2Complete);
}

export function isSceneUnlocked(id: SceneId, progress: CampaignProgress): boolean {
  switch (id) {
    case 'title': case 'tutorial_part_1': return true;
    case 'tutorial_part_2': return !!(progress.tutorialPart1Complete || progress.level0Complete);
    case 'prototype': case 'solar_system': return progress.level0Complete;
    case 'black_hole': return !!(progress.level0Complete && progress.level1Complete);
    case 'endless': case 'galactic_rest': return campaignComplete(progress);
    case 'coop_test': return false;
  }
}

export function recommendedScene(progress: CampaignProgress): SceneId {
  if (!progress.level0Complete) return progress.tutorialPart1Complete ? 'tutorial_part_2' : 'tutorial_part_1';
  if (!progress.level1Complete) return 'solar_system';
  if (!progress.level2Complete) return 'black_hole';
  return 'endless';
}

export function completedChapters(progress: CampaignProgress): number {
  return Number(progress.level0Complete) + Number(!!progress.level1Complete) + Number(!!progress.level2Complete);
}
