import { json } from '@sveltejs/kit';
import { deleteSession } from '$lib/db.js';

export async function POST({ cookies }) {
  const sessionId = cookies.get('session');

  if (sessionId) {
    deleteSession(sessionId);
  }

  cookies.delete('session', { path: '/' });

  return json({ success: true });
}
