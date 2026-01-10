import { json } from '@sveltejs/kit';
import {
	createInvitation,
	getUserInvitations,
	acceptInvitation,
	rejectInvitation,
	removeMember
} from '$lib/db.js';
import { requireCsrfToken } from '$lib/csrf.js';

// GET - Fetch all pending invitations for the authenticated user
export async function GET({ locals }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const invitations = getUserInvitations(locals.user.id);
		return json(invitations);
	} catch (error) {
		console.error('Error fetching invitations:', error);
		return json({ error: 'Failed to fetch invitations' }, { status: 500 });
	}
}

// POST - Create a new invitation or accept/reject an existing invitation
export async function POST({ request, locals, cookies }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Validate CSRF token
	const csrfError = requireCsrfToken({ request, cookies });
	if (csrfError) {
		return json(csrfError, { status: 403 });
	}

	try {
		const { action, listId, username, permissionLevel, invitationId } = await request.json();

		if (action === 'create') {
			// Create a new invitation
			if (!listId || !username) {
				return json({ error: 'List ID and username are required' }, { status: 400 });
			}

			const invitation = createInvitation(
				listId,
				locals.user.id,
				username,
				permissionLevel || 'editor'
			);
			return json(invitation, { status: 201 });
		} else if (action === 'accept') {
			// Accept an invitation
			if (!invitationId) {
				return json({ error: 'Invitation ID is required' }, { status: 400 });
			}

			const list = acceptInvitation(invitationId, locals.user.id);
			return json(list);
		} else if (action === 'reject') {
			// Reject an invitation
			if (!invitationId) {
				return json({ error: 'Invitation ID is required' }, { status: 400 });
			}

			rejectInvitation(invitationId, locals.user.id);
			return json({ success: true });
		} else {
			return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (error) {
		if (error.message === 'User not found') {
			return json({ error: 'User not found' }, { status: 404 });
		}
		if (error.message === 'Insufficient permissions') {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}
		if (error.message === 'User is already a member of this list') {
			return json({ error: 'User is already a member of this list' }, { status: 400 });
		}
		if (error.message === 'Invitation already sent to this user') {
			return json({ error: 'Invitation already sent to this user' }, { status: 400 });
		}
		if (error.message === 'Invitation not found') {
			return json({ error: 'Invitation not found' }, { status: 404 });
		}
		if (error.message === 'Invitation already processed') {
			return json({ error: 'Invitation already processed' }, { status: 400 });
		}
		console.error('Error processing invitation:', error);
		return json({ error: 'Failed to process invitation' }, { status: 500 });
	}
}

// DELETE - Remove a member from a list
export async function DELETE({ request, locals, cookies }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Validate CSRF token
	const csrfError = requireCsrfToken({ request, cookies });
	if (csrfError) {
		return json(csrfError, { status: 403 });
	}

	try {
		const { listId, memberId } = await request.json();

		if (!listId || !memberId) {
			return json({ error: 'List ID and member ID are required' }, { status: 400 });
		}

		removeMember(listId, locals.user.id, memberId);
		return json({ success: true });
	} catch (error) {
		if (error.message === 'Insufficient permissions') {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}
		if (error.message === 'Cannot remove list creator') {
			return json({ error: 'Cannot remove list creator' }, { status: 400 });
		}
		console.error('Error removing member:', error);
		return json({ error: 'Failed to remove member' }, { status: 500 });
	}
}
