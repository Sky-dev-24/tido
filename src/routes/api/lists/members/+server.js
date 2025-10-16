import { json } from '@sveltejs/kit';
import { getListMembersForUser } from '$lib/db.js';

export async function GET({ url, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listIdParam = url.searchParams.get('listId');
  const listId = Number.parseInt(listIdParam, 10);

  if (!Number.isInteger(listId)) {
    return json({ error: 'A valid listId query parameter is required' }, { status: 400 });
  }

  try {
    const members = getListMembersForUser(listId, locals.user.id);
    return json(members);
  } catch (error) {
    if (error.message === 'Access denied to this list') {
      return json({ error: 'Access denied to this list' }, { status: 403 });
    }
    console.error('Error fetching list members:', error);
    return json({ error: 'Failed to fetch list members' }, { status: 500 });
  }
}
