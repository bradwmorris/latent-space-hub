import { getSQLiteClient } from '@/services/database/sqlite-client';

export interface AutoContextSettings {
  autoContextEnabled: boolean;
  lastPinnedMigration?: string;
}

const DEFAULT_SETTINGS: AutoContextSettings = {
  autoContextEnabled: false,
};

/**
 * Auto-context settings for Latent Space Hub (Turso fork).
 *
 * Note: This fork stores settings in environment variables or database,
 * not filesystem (since Vercel is serverless/ephemeral).
 *
 * Set AUTOCONTEXT_ENABLED=true in environment to enable.
 */

let cachedSettings: AutoContextSettings | null = null;

async function bootstrapFromLegacyPins(): Promise<void> {
  // Check environment variable first
  if (process.env.AUTOCONTEXT_ENABLED === 'true') {
    cachedSettings = { autoContextEnabled: true };
    return;
  }

  // Otherwise check for pinned nodes in database
  try {
    const db = getSQLiteClient();
    const result = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM nodes WHERE is_pinned = 1'
    );
    const pinnedCount = Number(result.rows[0]?.count ?? 0);
    if (pinnedCount > 0) {
      cachedSettings = {
        autoContextEnabled: true,
        lastPinnedMigration: new Date().toISOString(),
      };
      return;
    }
  } catch (error) {
    console.warn('Auto-context pin bootstrap failed:', error);
  }

  cachedSettings = { ...DEFAULT_SETTINGS };
}

export async function getAutoContextSettings(): Promise<AutoContextSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }

  await bootstrapFromLegacyPins();
  return cachedSettings || { ...DEFAULT_SETTINGS };
}

export async function updateAutoContextSettings(
  partial: Partial<AutoContextSettings>
): Promise<AutoContextSettings> {
  const current = await getAutoContextSettings();
  const next: AutoContextSettings = {
    ...current,
    ...partial,
    autoContextEnabled:
      typeof partial.autoContextEnabled === 'boolean'
        ? partial.autoContextEnabled
        : current.autoContextEnabled,
  };

  // Update cache (persistent storage would need database table in Turso)
  cachedSettings = next;
  return next;
}

export async function setAutoContextEnabled(enabled: boolean): Promise<AutoContextSettings> {
  return updateAutoContextSettings({ autoContextEnabled: enabled });
}
