import { browserManager, importBrowserState, exportBrowserState } from '../browser/manager.js';
import { createProfile, getProfile, getProfiles, deleteProfile, updateProfileLastUsed } from '../db/queries.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('profiles');

export async function createProfileFromCurrent(name: string): Promise<any> {
  const page = browserManager.getPage();
  const state = await exportBrowserState(page);
  
  return createProfile({
    name,
    cookies: JSON.stringify(state.cookies),
    local_storage: JSON.stringify(state.localStorage),
    session_storage: JSON.stringify(state.sessionStorage),
    user_agent: await page.evaluate(() => navigator.userAgent),
  });
}

export async function loadProfile(profileId: string): Promise<void> {
  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  await browserManager.initialize();
  const page = browserManager.getPage();

  await importBrowserState(page, {
    cookies: profile.cookies ? JSON.parse(profile.cookies) : undefined,
    localStorage: profile.local_storage ? JSON.parse(profile.local_storage) : undefined,
    sessionStorage: profile.session_storage ? JSON.parse(profile.session_storage) : undefined,
  });

  updateProfileLastUsed(profileId);
  logger.info('Profile loaded', { profileId, name: profile.name });
}

export { getProfiles, getProfile, deleteProfile };
