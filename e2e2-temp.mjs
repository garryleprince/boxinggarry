
import { chromium, devices } from 'playwright';

const BASE = 'http://localhost:4173';
const OUT = process.env.SCRATCH;
const errors = [];
let step = 100;
const log = (m) => console.log(m);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ ...devices['iPhone 14 Pro'] });
const page = await context.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const shot = async (name) => {
  step += 1;
  await page.screenshot({ path: OUT + '/shot-' + step + '-' + name + '.png' });
  log('  -> ' + name);
};

const dismissHint = async () => {
  const hint = page.locator('.sheet-backdrop[aria-label="Installer sur ton iPhone"]');
  if ((await hint.count()) > 0) await page.click('.sheet button:has-text("Compris")');
};

const clearLoggers = async () => {
  const logger = page.locator('.sheet button:has-text("Valider")');
  let guard = 0;
  while ((await logger.count()) > 0 && guard++ < 40) {
    await logger.first().click();
    await page.waitForTimeout(120);
  }
};

try {
  // A Monday, so the plan gives a real training day rather than the rest day
  // the system date happens to land on.
  await page.clock.install({ time: new Date('2026-09-14T09:00:00') });

  log('1. Compte + onboarding express');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#passphrase');
  await page.fill('#passphrase', 'garde-haute-2026');
  await page.fill('#confirm', 'garde-haute-2026');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Faisons connaissance', { timeout: 30000 });
  for (let i = 0; i < 5; i++) {
    await page.click('button:has-text("Continuer")');
    await page.waitForTimeout(200);
  }
  await page.click('button:has-text("Terminer")');
  await page.waitForSelector('button:has-text("Passer pour l")', { timeout: 15000 });
  await page.click('button:has-text("Passer pour l")');

  log('2. Tableau de bord, jour d entrainement');
  await page.waitForSelector('#today-title', { timeout: 15000 });
  const name = (await page.textContent('#today-title'))?.trim();
  const mins = (await page.textContent('.hero__duration'))?.trim();
  log('   ' + name + ' - ' + mins + ' min');
  if (mins !== '20') errors.push('Duree attendue 20 min, obtenue ' + mins);
  await shot('dashboard-jour-entrainement');

  log('3. Apercu et minutage');
  await page.click('.hero button:has-text("Commencer")');
  await page.waitForSelector('.cta-dock');
  await shot('apercu-20min');
  const timing = (await page.textContent('button:has-text("minutage")'))?.trim();
  log('   ' + timing);
  if (!timing || !timing.includes('/ 20:00')) errors.push('Budget affiche inattendu: ' + timing);
  await page.evaluate(() => window.scrollTo(0, 750));
  await shot('apercu-blocs');
  await page.evaluate(() => window.scrollTo(0, 0));

  log('4. Seance complete en temps accelere');
  await page.click('.cta-dock button');
  await page.waitForSelector('text=Prêt ?');
  await page.click('button:has-text("Démarrer")');
  await page.waitForTimeout(700);
  await shot('entrainement-debut');
  log('   Premiere phase: ' + (await page.textContent('.train__exercise'))?.trim());

  const totalPhases = await page.evaluate(() => 0);
  void totalPhases;
  for (let i = 0; i < 220; i++) {
    if ((await page.locator('text=Comment était la séance ?').count()) > 0) break;
    await clearLoggers();
    const next = page.locator('button[aria-label="Phase suivante"]');
    if ((await next.count()) === 0) break;
    await next.click();
    await page.waitForTimeout(60);
  }
  await clearLoggers();
  await page.waitForSelector('text=Comment était la séance ?', { timeout: 20000 });
  const elapsed = (await page.textContent('.mono'))?.trim();
  log('   Duree mesuree en fin de seance: ' + elapsed);
  await shot('fin-seance-20min');
  const [mm, ss] = (elapsed || '00:00').split(':').map(Number);
  if (mm * 60 + ss > 1215) errors.push('Duree finale trop longue: ' + elapsed);

  await page.click('.rpe:has-text("Facile")');
  await page.click('button:has-text("Enregistrer")');
  await page.waitForSelector('text=Séance terminée', { timeout: 15000 });
  await shot('bilan-20min');
  const ext = await page.locator('button:has-text("+10 min")').count();
  log('   Bouton +10 propose au bilan: ' + (ext > 0 ? 'oui' : 'non'));
  if (ext === 0) errors.push('Le +10 n est pas propose en fin de seance');
  await page.evaluate(() => window.scrollTo(0, 500));
  await shot('bilan-20min-bas');

  log('5. Progression apres une vraie seance');
  await page.goto(BASE + '/#/progression');
  await page.waitForTimeout(900);
  await dismissHint();
  await shot('progression-apres-seance');
  await page.evaluate(() => window.scrollTo(0, 700));
  await shot('progression-semaine');

  log('6. Reprise d une seance interrompue');
  await page.goto(BASE + '/#/seance?extension=1');
  await page.waitForTimeout(800);
  await page.click('.cta-dock button');
  await page.waitForSelector('text=Prêt ?');
  await page.click('button:has-text("Démarrer")');
  await page.clock.runFor(40000);
  await page.waitForTimeout(300);
  await clearLoggers();
  await page.waitForTimeout(5000);   // let the 4 s autosave fire
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await dismissHint();
  const onTrainingResume = await page.locator('button:has-text("Reprendre")').count();
  const resumeText = (await page.locator('.train__body p').first().textContent().catch(() => '')) || '';
  log('   Ecran de reprise: ' + (onTrainingResume > 0 ? 'oui' : 'non'));
  log('   Message: ' + resumeText.replace(/\s+/g, ' ').trim().slice(0, 140));
  if (onTrainingResume === 0) errors.push('La seance en cours n est pas proposee a la reprise');
  if (!resumeText.includes('enregistr')) errors.push('La reprise ne mentionne pas le travail deja fait');
  await page.click('button:has-text("Reprendre")');
  await page.waitForTimeout(700);
  const resumedElapsed = (await page.locator('.train__top .num').textContent())?.trim();
  log('   Temps ecoule apres reprise: ' + resumedElapsed);
  if (!resumedElapsed || resumedElapsed.startsWith('00:0')) {
    errors.push('La reprise repart de zero: ' + resumedElapsed);
  }
  await page.goto(BASE + '/#/');
  await page.waitForTimeout(900);
  await dismissHint();
  const dashResume = await page.locator('button:has-text("Reprendre la séance")').count();
  log('   Carte de reprise sur le tableau de bord: ' + (dashResume > 0 ? 'oui' : 'non'));
  if (dashResume === 0) errors.push('Le tableau de bord ne propose pas de reprendre');
  await shot('reprise-seance');

  log('7. Hors connexion');
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    return { active: !!reg?.active, controlled: !!navigator.serviceWorker?.controller };
  });
  log('   Service worker actif: ' + sw.active + ', page controlee: ' + sw.controlled);
  if (!sw.active) errors.push('Service worker inactif');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await dismissHint();
  const offlineRendered = await page.evaluate(
    () => (document.getElementById('root')?.children.length ?? 0) > 0,
  );
  const offlineText = (await page.evaluate(() => (document.body.innerText || '').slice(0, 70))) || '';
  log('   Hors connexion, application rendue: ' + offlineRendered);
  log('   Contenu: ' + offlineText.replace(/\n+/g, ' | '));
  if (!offlineRendered) errors.push('L application ne demarre pas hors connexion');
  await shot('hors-connexion');

  log('8. Seance lancable hors connexion');
  await page.goto(BASE + '/#/seance', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1200);
  const ctaOffline = await page.locator('.cta-dock button').count();
  log('   Bouton Commencer disponible hors connexion: ' + (ctaOffline > 0 ? 'oui' : 'non'));
  if (ctaOffline === 0) errors.push('Impossible de lancer une seance hors connexion');
  await shot('seance-hors-connexion');
  await context.setOffline(false);

  log('');
  log('=== Erreurs ===');
  log(errors.length === 0 ? 'aucune' : errors.join('\n'));
  if (errors.length > 0) process.exitCode = 1;
} catch (error) {
  console.error('ECHEC: ' + error.message);
  await page.screenshot({ path: OUT + '/shot-echec2.png' });
  console.error('Erreurs: ' + (errors.join('\n') || 'aucune'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
