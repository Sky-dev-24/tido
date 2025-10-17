import { hasAnyUsers } from '$lib/db';

export function load() {
  return {
    isFirstUser: !hasAnyUsers()
  };
}
