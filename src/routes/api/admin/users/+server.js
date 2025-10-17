import { json } from '@sveltejs/kit';
import {
	getPendingUsers,
	getAllUsers,
	approveUser,
	rejectUser,
	setUserAdminStatus,
	permanentlyDeleteUser,
	getUser,
	getAdminCount
} from '$lib/db.js';

export async function GET({ locals }) {
  if (!locals.user || !locals.user.is_admin) {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }

	const pendingUsers = getPendingUsers();
	const registeredUsers = getAllUsers().filter((user) => user.is_approved === 1);
	const adminUsers = registeredUsers.filter((user) => user.is_admin === 1);
	let superAdminId = null;
	if (adminUsers.length > 0) {
		adminUsers.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
		superAdminId = adminUsers[0].id;
	}
	return json({ pendingUsers, registeredUsers, superAdminId });
}

export async function POST({ request, locals }) {
  if (!locals.user || !locals.user.is_admin) {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }

	const { userId, action, makeAdmin } = await request.json();

	const targetId = Number(userId);
	if (!Number.isInteger(targetId)) {
		return json({ error: 'Valid user ID is required' }, { status: 400 });
	}

	if (targetId === locals.user.id) {
		return json({ error: 'You cannot perform this action on your own account' }, { status: 400 });
	}

	const targetUser = getUser(targetId);
	if (!targetUser) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	if (!action) {
		return json({ error: 'User ID and action are required' }, { status: 400 });
	}

	const adminUsers = getAllUsers()
		.filter((user) => user.is_admin === 1 && user.is_approved === 1)
		.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
	const superAdminId = adminUsers.length > 0 ? adminUsers[0].id : null;

	try {
		if (action === 'approve') {
			const user = approveUser(targetId);
			return json({ success: true, user });
		} else if (action === 'reject') {
			rejectUser(targetId);
			return json({ success: true });
		} else if (action === 'set_admin') {
			if (typeof makeAdmin !== 'boolean') {
				return json({ error: 'makeAdmin flag is required' }, { status: 400 });
			}

			if (targetId === superAdminId && makeAdmin === false) {
				return json({ error: 'Super-admin privileges cannot be revoked' }, { status: 400 });
			}

			if (targetUser.is_admin === 1 && makeAdmin === false) {
				const adminCount = getAdminCount();
				if (adminCount <= 1) {
					return json({ error: 'At least one admin must remain' }, { status: 400 });
				}
			}

			const updated = setUserAdminStatus(targetId, makeAdmin);
			return json({ success: true, user: updated });
		} else if (action === 'delete_user') {
			if (targetId === superAdminId) {
				return json({ error: 'Cannot delete the super-admin account' }, { status: 400 });
			}
			if (targetUser.is_admin === 1) {
				const adminCount = getAdminCount();
				if (adminCount <= 1) {
					return json({ error: 'Cannot delete the last remaining admin' }, { status: 400 });
				}
			}

		  permanentlyDeleteUser(targetId);
		  return json({ success: true });
		} else {
			return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (error) {
		console.error('Admin action error:', error);
		return json({ error: 'Action failed' }, { status: 500 });
	}
}
