import { redirect } from '@sveltejs/kit';
import { hasAnyUsers } from '$lib/db';

export function load({ locals }) {
  if (!locals.user) {
    // If no users exist, redirect to registration for first-time admin setup
    if (!hasAnyUsers()) {
      throw redirect(302, '/register');
    }
    throw redirect(302, '/login');
  }

  return {
    user: locals.user
  };
}
