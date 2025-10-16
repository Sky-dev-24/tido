import { json } from '@sveltejs/kit';
import { getPendingUsers, approveUser, rejectUser } from '$lib/db.js';

export async function GET({ locals }) {
  if (!locals.user || !locals.user.is_admin) {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }

  const pendingUsers = getPendingUsers();
  return json({ pendingUsers });
}

export async function POST({ request, locals }) {
  if (!locals.user || !locals.user.is_admin) {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { userId, action } = await request.json();

  if (!userId || !action) {
    return json({ error: 'User ID and action are required' }, { status: 400 });
  }

  try {
    if (action === 'approve') {
      const user = approveUser(userId);
      return json({ success: true, user });
    } else if (action === 'reject') {
      rejectUser(userId);
      return json({ success: true });
    } else {
      return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin action error:', error);
    return json({ error: 'Action failed' }, { status: 500 });
  }
}
