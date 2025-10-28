import { getSession, cleanupOldDeletedTodos } from '$lib/db.js';

// Run cleanup of old deleted todos every hour
setInterval(() => {
  try {
    const deleted = cleanupOldDeletedTodos();
    if (deleted > 0) {
      console.log(`[Cleanup] Permanently deleted ${deleted} old todo(s)`);
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning up old deleted todos:', error);
  }
}, 60 * 60 * 1000); // Every hour

// Run cleanup on startup
cleanupOldDeletedTodos();

export async function handle({ event, resolve }) {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const session = getSession(sessionId);

    if (session && session.is_approved) {
      event.locals.user = {
        id: session.user_id,
        username: session.username,
        email: session.email,
        is_admin: Boolean(session.is_admin),
        dark_mode: session.dark_mode || 0,
        theme: session.theme,
        view_density: session.view_density,
        font_scale: session.font_scale,
        font_family: session.font_family,
        default_task_priority: session.default_task_priority,
        default_task_due_offset_days: session.default_task_due_offset_days,
        default_task_reminder_minutes: session.default_task_reminder_minutes,
        auto_archive_days: session.auto_archive_days,
        week_start_day: session.week_start_day
      };
    } else {
      // Session expired, invalid, or user not approved - clear cookie
      event.cookies.delete('session', { path: '/' });
    }
  }

  return resolve(event);
}
