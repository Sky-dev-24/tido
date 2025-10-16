import { json } from '@sveltejs/kit';
import { updateUserDarkMode, updateUserTheme, updateUserViewDensity } from '$lib/db.js';

export async function PATCH({ request, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json();
  const { darkMode, theme, viewDensity } = data;

  if (darkMode === undefined && theme === undefined && viewDensity === undefined) {
    return json({ error: 'At least one preference (darkMode, theme, or viewDensity) is required' }, { status: 400 });
  }

  try {
    let updatedUser;

    if (darkMode !== undefined) {
      updatedUser = updateUserDarkMode(locals.user.id, darkMode);
    }

    if (theme !== undefined) {
      updatedUser = updateUserTheme(locals.user.id, theme);
    }

    if (viewDensity !== undefined) {
      updatedUser = updateUserViewDensity(locals.user.id, viewDensity);
    }

    return json({
      success: true,
      darkMode: updatedUser.dark_mode,
      theme: updatedUser.theme,
      viewDensity: updatedUser.view_density
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    return json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
