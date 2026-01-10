import { redirect } from '@sveltejs/kit';
import { hasAnyUsers } from '$lib/db';

export function load({ locals, cookies }) {
  if (!locals.user) {
    // If no users exist, redirect to registration for first-time admin setup
    if (!hasAnyUsers()) {
      throw redirect(302, '/register');
    }
    throw redirect(302, '/login');
  }

  // Get session ID for WebSocket authentication
  const sessionId = cookies.get('session');

  return {
    user: locals.user,
    sessionId
  };
}
