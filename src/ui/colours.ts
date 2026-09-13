import type { Quality, RecoveryRegion } from '@/domain/model/taxonomy';
import type { Archetype } from '@/domain/model/workout';

/** One hue per quality, resolved from the token palette so themes follow. */
export const QUALITY_COLOUR: Record<Quality, string> = {
  force: 'var(--q-force)',
  'endurance-musculaire': 'var(--q-force)',
  explosivite: 'var(--q-explosivite)',
  puissance: 'var(--q-explosivite)',
  conditioning: 'var(--q-conditioning)',
  cardio: 'var(--q-cardio)',
  vitesse: 'var(--q-vitesse)',
  coordination: 'var(--q-vitesse)',
  equilibre: 'var(--q-core)',
  mobilite: 'var(--q-mobilite)',
  stabilite: 'var(--q-core)',
  core: 'var(--q-core)',
};

export const REGION_COLOUR: Record<RecoveryRegion, string> = {
  jambes: 'var(--q-explosivite)',
  'haut-du-corps': 'var(--q-force)',
  core: 'var(--q-core)',
  cardio: 'var(--q-cardio)',
};

export const ARCHETYPE_COLOUR: Record<Archetype, string> = {
  'full-body-boxing': 'var(--q-conditioning)',
  explosivite: 'var(--q-explosivite)',
  force: 'var(--q-force)',
  conditioning: 'var(--q-cardio)',
  'core-stabilite': 'var(--q-core)',
  'hybride-boxe': 'var(--q-vitesse)',
  recovery: 'var(--q-mobilite)',
};

/** Colour for a block, so the session preview reads at a glance. */
export const BLOCK_COLOUR: Record<string, string> = {
  echauffement: 'var(--q-mobilite)',
  activation: 'var(--q-core)',
  principal: 'var(--signal)',
  finisher: 'var(--q-cardio)',
  cooldown: 'var(--q-mobilite)',
};
