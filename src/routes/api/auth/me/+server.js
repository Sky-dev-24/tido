import { json } from '@sveltejs/kit';

export async function GET({ locals }) {
  if (!locals.user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  return json({ user: locals.user });
}
