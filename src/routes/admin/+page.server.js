import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  if (!locals.user.is_admin) {
    throw redirect(302, '/');
  }

  return {
    user: locals.user
  };
}
