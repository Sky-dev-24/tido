import { json } from '@sveltejs/kit';
import {
  getUser,
  updateUserDarkMode,
  updateUserTheme,
  updateUserViewDensity,
  updateUserPreferences
} from '$lib/db.js';

export async function PATCH({ request, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json();
  const {
    darkMode,
    theme,
    viewDensity,
    fontScale,
    fontFamily,
    defaultTaskPriority,
    defaultTaskDueOffsetDays,
    defaultTaskReminderMinutes,
    autoArchiveDays,
    weekStartDay
  } = data;

  const hasBasicUpdate =
    darkMode !== undefined || theme !== undefined || viewDensity !== undefined;
  const hasAdvancedUpdate =
    fontScale !== undefined ||
    fontFamily !== undefined ||
    defaultTaskPriority !== undefined ||
    defaultTaskDueOffsetDays !== undefined ||
    defaultTaskReminderMinutes !== undefined ||
    autoArchiveDays !== undefined ||
    weekStartDay !== undefined;

  if (!hasBasicUpdate && !hasAdvancedUpdate) {
    return json(
      {
        error:
          'At least one preference (appearance, typography, defaults, autoArchiveDays, or weekStartDay) is required'
      },
      { status: 400 }
    );
  }

  try {
    let updatedUser = getUser(locals.user.id);

    if (darkMode !== undefined) {
      updatedUser = updateUserDarkMode(locals.user.id, darkMode);
    }

    if (theme !== undefined) {
      updatedUser = updateUserTheme(locals.user.id, theme);
    }

    if (viewDensity !== undefined) {
      updatedUser = updateUserViewDensity(locals.user.id, viewDensity);
    }

    if (hasAdvancedUpdate) {
      updatedUser = updateUserPreferences(locals.user.id, {
        fontScale,
        fontFamily,
        defaultTaskPriority,
        defaultTaskDueOffsetDays,
        defaultTaskReminderMinutes,
        autoArchiveDays,
        weekStartDay
      });
    }

    return json({
      success: true,
      user: {
        id: updatedUser.id,
        darkMode: updatedUser.dark_mode,
        theme: updatedUser.theme,
        viewDensity: updatedUser.view_density,
        fontScale: updatedUser.font_scale,
        fontFamily: updatedUser.font_family,
        defaultTaskPriority: updatedUser.default_task_priority,
        defaultTaskDueOffsetDays: updatedUser.default_task_due_offset_days,
        defaultTaskReminderMinutes: updatedUser.default_task_reminder_minutes,
        autoArchiveDays: updatedUser.auto_archive_days,
        weekStartDay: updatedUser.week_start_day
      }
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    return json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
