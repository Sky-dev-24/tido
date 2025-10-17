<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { applyTheme } from '$lib/themes.js';

	let { data } = $props();
let darkMode = $state(data.user.dark_mode === 1);
let currentTheme = $state(data.user.theme || 'aurora');
let pendingUsers = $state([]);
let registeredUsers = $state([]);
let superAdminId = $state(null);
let loading = $state(true);
let error = $state('');
let rowActions = $state(new Map());

onMount(async () => {
	await fetchAdminUsers();
});

$effect(() => {
	if (browser) {
		document.body.classList.toggle('dark-mode', darkMode);
	}
});

$effect(() => {
	if (browser) {
		applyTheme(currentTheme);
	}
});

	function setRowAction(userId, value) {
		rowActions = new Map(rowActions).set(userId, value);
	}

	function clearRowAction(userId) {
		const next = new Map(rowActions);
		next.delete(userId);
		rowActions = next;
	}

	function isProcessing(userId) {
		return rowActions.has(userId);
	}

	async function fetchAdminUsers() {
		loading = true;
		error = '';
		try {
			const response = await fetch('/api/admin/users');
			const result = await response.json();

			if (response.ok) {
				pendingUsers = result.pendingUsers ?? [];
				registeredUsers = result.registeredUsers ?? [];
				superAdminId = result.superAdminId ?? null;
				rowActions = new Map();
			} else {
				error = result.error || 'Failed to load user data';
			}
		} catch (err) {
			error = 'An error occurred';
		} finally {
			loading = false;
		}
	}

	async function handleAction(userId, action) {
		error = '';
		try {
			const response = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, action })
			});

			if (response.ok) {
				await fetchAdminUsers();
			} else {
				const result = await response.json();
				error = result.error || 'Action failed';
			}
		} catch (err) {
			error = 'An error occurred';
		}
	}

	async function toggleAdmin(user) {
		if (user.id === superAdminId || isProcessing(user.id)) return;
		setRowAction(user.id, 'role');
		error = '';
		try {
			const response = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: user.id,
					action: 'set_admin',
					makeAdmin: user.is_admin === 1 ? false : true
				})
			});

			if (response.ok) {
				await fetchAdminUsers();
			} else {
				const result = await response.json();
				error = result.error || 'Failed to update role';
			}
		} catch (err) {
			error = 'An error occurred';
		} finally {
			clearRowAction(user.id);
		}
	}

	async function deleteUser(user) {
		if (user.id === superAdminId || isProcessing(user.id)) return;
		const confirmed = confirm(
			`Are you sure you want to permanently delete ${user.username}'s account? This cannot be undone.`
		);
		if (!confirmed) return;

		setRowAction(user.id, 'delete');
		error = '';
		try {
			const response = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: user.id,
					action: 'delete_user'
				})
			});

			if (response.ok) {
				await fetchAdminUsers();
			} else {
				const result = await response.json();
				error = result.error || 'Failed to delete account';
			}
		} catch (err) {
			error = 'An error occurred';
		} finally {
			clearRowAction(user.id);
		}
	}

	function goToTodos() {
		goto('/');
	}
</script>

<svelte:head>
	<title>Admin Dashboard - Tido</title>
</svelte:head>

<div class="admin-container">
	<div class="admin-card">
		<div class="header">
			<h1>Admin Dashboard</h1>
			<button class="btn-secondary" onclick={goToTodos}>Back to Todos</button>
		</div>

		<p class="welcome">Welcome, <strong>{data.user.username}</strong> (Admin)</p>

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		<div class="section">
			<h2>Pending User Approvals</h2>

			{#if loading}
				<p class="loading">Loading...</p>
			{:else if pendingUsers.length === 0}
				<p class="empty">No pending user approvals</p>
			{:else}
				<div class="users-list">
					{#each pendingUsers as user (user.id)}
						<div class="user-card">
							<div class="user-info">
								<div class="user-name">{user.username}</div>
								<div class="user-email">{user.email}</div>
								<div class="user-date">
									Requested: {new Date(user.created_at).toLocaleDateString()}
								</div>
							</div>
							<div class="user-actions">
								<button
									class="btn-approve"
									onclick={() => handleAction(user.id, 'approve')}
								>
									Approve
								</button>
								<button
									class="btn-reject"
									onclick={() => handleAction(user.id, 'reject')}
								>
									Reject
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="section">
			<h2>Registered Users</h2>

			{#if loading}
				<p class="loading">Loading...</p>
			{:else if registeredUsers.length === 0}
				<p class="empty">No registered users yet</p>
			{:else}
				<div class="users-table-wrapper">
					<table class="users-table">
						<thead>
							<tr>
								<th scope="col">Username</th>
								<th scope="col">Email</th>
								<th scope="col">Role</th>
								<th scope="col">Permissions</th>
								<th scope="col">Theme</th>
								<th scope="col">Joined</th>
								<th scope="col">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each registeredUsers as user (user.id)}
								<tr>
									<td data-label="Username">{user.username}</td>
									<td data-label="Email">{user.email}</td>
									<td data-label="Role">
										<span
											class="badge"
											class:badge-admin={user.is_admin === 1 && user.id !== superAdminId}
											class:badge-super={user.id === superAdminId}
										>
											{user.id === superAdminId
												? 'Super Admin'
												: user.is_admin === 1
													? 'Admin'
													: 'Member'}
										</span>
									</td>
									<td data-label="Permissions">
										<div class="table-actions" class:locked={user.id === superAdminId}>
											{#if user.id === superAdminId}
												<span class="status-note">Locked (Super Admin)</span>
											{:else}
												<button
													class="btn-inline"
													disabled={isProcessing(user.id)}
													onclick={() => toggleAdmin(user)}
												>
													{user.is_admin === 1 ? 'Revoke admin' : 'Make admin'}
												</button>
											{/if}
										</div>
									</td>
									<td data-label="Theme">
										{user.theme ? user.theme.replace(/-/g, ' ') : 'Default'}
									</td>
									<td data-label="Joined">
										{new Date(user.created_at).toLocaleDateString()}
									</td>
									<td data-label="Actions">
										<div class="table-actions" class:locked={user.id === superAdminId}>
											{#if user.id === superAdminId}
												<span class="status-note">Not available</span>
											{:else}
												<button
													class="btn-inline danger"
													disabled={isProcessing(user.id)}
													onclick={() => deleteUser(user)}
												>
													Delete
												</button>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
:global(body) {
		margin: 0;
		padding: 0;
		background: var(--color-background);
		background-attachment: fixed;
		min-height: 100vh;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
		color: var(--color-text, #2c3e50);
	}

	.admin-container {
		min-height: 100vh;
		padding: 2rem;
		color: var(--color-text, #2c3e50);
	}

	.admin-card {
		max-width: 1200px;
		margin: 0 auto;
		background: var(--color-card-bg, rgba(255, 255, 255, 0.96));
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
		border: 1px solid var(--color-card-border, rgba(0, 0, 0, 0.08));
		color: inherit;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid var(--color-card-border, rgba(0, 0, 0, 0.08));
	}

	h1 {
		margin: 0;
		color: var(--color-text, #2c3e50);
		font-size: 2rem;
		font-weight: 600;
	}

	h2 {
		color: var(--color-text, #2c3e50);
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.welcome {
		color: var(--color-text-secondary, #4a5568);
		margin-bottom: 2rem;
	}

	.welcome strong {
		color: var(--color-primary, #667eea);
	}

	.btn-secondary {
		padding: 0.5rem 1rem;
		background-color: var(--color-primary, #667eea);
		color: #ffffff;
		border: none;
		border-radius: 4px;
		font-size: 0.9rem;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.btn-secondary:hover {
		background-color: var(--color-primary-hover, #5568d3);
	}

	.error-message {
		background-color: rgba(248, 113, 113, 0.15);
		color: #b91c1c;
		padding: 0.75rem;
		border-radius: 6px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
		border: 1px solid rgba(248, 113, 113, 0.25);
	}

	.section {
		margin-top: 2rem;
	}

	.loading,
	.empty {
		text-align: center;
		color: var(--color-text-secondary, #6b7280);
		padding: 2rem;
		font-style: italic;
	}

	.users-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.user-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background-color: var(--color-card-bg, rgba(255, 255, 255, 0.95));
		border: 1px solid var(--color-card-border, rgba(0, 0, 0, 0.08));
		border-radius: 8px;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.user-card:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
	}

	.user-info {
		flex: 1;
	}

	.user-name {
		font-weight: 600;
		font-size: 1.1rem;
		color: var(--color-text, #2c3e50);
		margin-bottom: 0.25rem;
	}

	.user-email {
		color: var(--color-text-secondary, #6b7280);
		font-size: 0.9rem;
		margin-bottom: 0.25rem;
	}

	.user-date {
		color: rgba(107, 114, 128, 0.8);
		font-size: 0.85rem;
	}

	.user-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-approve,
	.btn-reject {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-approve {
		background-color: #28a745;
		color: white;
	}

	.btn-approve:hover {
		background-color: #218838;
	}

	.btn-reject {
		background-color: #dc3545;
		color: white;
	}

	.btn-reject:hover {
		background-color: #c82333;
	}

	.users-table-wrapper {
		margin-top: 1rem;
		border: 1px solid var(--color-card-border, rgba(0, 0, 0, 0.08));
		border-radius: 8px;
		overflow-x: auto;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
	}

	.users-table {
		width: 100%;
		border-collapse: collapse;
		min-width: 0;
		table-layout: auto;
	}

	.users-table th,
	.users-table td {
		padding: 0.75rem 1rem;
		text-align: left;
		border-bottom: 1px solid var(--color-card-border, rgba(0, 0, 0, 0.08));
		font-size: 0.95rem;
	}

	.users-table thead th {
		background-color: #f5f7fb;
		background-color: color-mix(in srgb, var(--color-card-bg, #ffffff) 70%, rgba(148, 163, 184, 0.2));
		color: var(--color-text, #34495e);
		font-weight: 600;
	}

	.users-table tbody tr:nth-child(even) {
		background-color: #fafbff;
		background-color: color-mix(in srgb, var(--color-card-bg, #ffffff) 90%, rgba(148, 163, 184, 0.12));
	}

	.users-table tbody tr:hover {
		background-color: #f1f5ff;
		background-color: color-mix(in srgb, var(--color-card-bg, #ffffff) 85%, rgba(99, 102, 241, 0.18));
	}

	.badge {
		display: inline-block;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		background-color: #e3f2fd;
		color: #1e88e5;
		white-space: nowrap;
	}

	.badge.badge-admin {
		background-color: #ede7f6;
		color: #5e35b1;
	}

	.badge.badge-super {
		background-color: #fff4d6;
		color: #b45309;
		border: 1px solid #facc15;
	}

	.table-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: nowrap;
	}

	.table-actions.locked {
		justify-content: flex-start;
		flex-wrap: nowrap;
	}

	.btn-inline {
		padding: 0.4rem 0.75rem;
		border-radius: 4px;
		border: 1px solid #d1d5db;
		background-color: #f8fafc;
		color: #1f2937;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.btn-inline:hover:not(:disabled) {
		background-color: #e5edff;
		border-color: #93b4ff;
		color: #1d4ed8;
	}

	.btn-inline:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-inline.danger {
		border-color: #fecdd3;
		background-color: #fff1f2;
		color: #b91c1c;
	}

	.btn-inline.danger:hover:not(:disabled) {
		background-color: #fee2e2;
		border-color: #fca5a5;
		color: #991b1b;
	}

	.status-note {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.78rem;
		color: #6b7280;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	:global(body.dark-mode) .admin-container {
		color: #e5e7eb;
	}

	:global(body.dark-mode) .admin-card {
		background: rgba(24, 26, 35, 0.92);
		border: 1px solid rgba(148, 163, 184, 0.25);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
	}

	:global(body.dark-mode) .header {
		border-bottom-color: rgba(148, 163, 184, 0.2);
	}

	:global(body.dark-mode) h1,
	:global(body.dark-mode) h2,
	:global(body.dark-mode) .welcome {
		color: #e5e7eb;
	}

	:global(body.dark-mode) .welcome strong {
		color: var(--color-secondary, #60a5fa);
	}

	:global(body.dark-mode) .btn-secondary {
		background-color: var(--color-primary, #667eea);
		color: #f8fafc;
	}

	:global(body.dark-mode) .btn-secondary:hover {
		background-color: var(--color-primary-hover, #5568d3);
	}

	:global(body.dark-mode) .user-card {
		background-color: rgba(31, 41, 55, 0.75);
		border-color: rgba(148, 163, 184, 0.25);
		box-shadow: none;
	}

	:global(body.dark-mode) .user-card:hover {
		box-shadow: 0 8px 24px rgba(15, 23, 42, 0.55);
	}

	:global(body.dark-mode) .user-name {
		color: #f1f5f9;
	}

	:global(body.dark-mode) .user-email,
	:global(body.dark-mode) .user-date,
	:global(body.dark-mode) .loading,
	:global(body.dark-mode) .empty,
	:global(body.dark-mode) .status-note {
		color: #cbd5f5;
	}

	:global(body.dark-mode) .users-table-wrapper {
		border-color: rgba(148, 163, 184, 0.25);
		box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.15);
	}

	:global(body.dark-mode) .users-table thead th {
		background-color: rgba(99, 102, 241, 0.18);
		color: #f1f5f9;
	}

	:global(body.dark-mode) .users-table tbody tr:nth-child(even) {
		background-color: rgba(148, 163, 184, 0.12);
	}

	:global(body.dark-mode) .users-table tbody tr:hover {
		background-color: rgba(99, 102, 241, 0.25);
	}

	:global(body.dark-mode) .btn-inline {
		background-color: rgba(148, 163, 184, 0.15);
		border-color: rgba(148, 163, 184, 0.35);
		color: #e5e7eb;
	}

	:global(body.dark-mode) .btn-inline:hover:not(:disabled) {
		background-color: rgba(99, 102, 241, 0.3);
		border-color: rgba(99, 102, 241, 0.45);
		color: #dbeafe;
	}

	:global(body.dark-mode) .btn-inline.danger {
		background-color: rgba(248, 113, 113, 0.18);
		border-color: rgba(248, 113, 113, 0.3);
		color: #fecaca;
	}

	:global(body.dark-mode) .btn-inline.danger:hover:not(:disabled) {
		background-color: rgba(248, 113, 113, 0.28);
	}

	:global(body.dark-mode) .badge.badge-admin {
		background-color: rgba(165, 180, 252, 0.25);
		color: #c7d2fe;
	}

	:global(body.dark-mode) .badge.badge-super {
		background-color: rgba(251, 191, 36, 0.25);
		color: #fde68a;
		border-color: rgba(253, 230, 138, 0.6);
	}

	:global(body.dark-mode) .error-message {
		background-color: rgba(248, 113, 113, 0.18);
		color: #fecaca;
		border-color: rgba(248, 113, 113, 0.35);
	}

	:global(body.dark-mode) .btn-approve {
		background-color: #22c55e;
	}

	:global(body.dark-mode) .btn-approve:hover {
		background-color: #16a34a;
	}

	:global(body.dark-mode) .btn-reject {
		background-color: #ef4444;
	}

	:global(body.dark-mode) .btn-reject:hover {
		background-color: #dc2626;
	}

	@media (max-width: 900px) {
		.users-table {
			min-width: 0;
		}

		.users-table thead {
			display: none;
		}

		.users-table,
		.users-table tbody,
		.users-table tr,
		.users-table td {
			display: block;
			width: 100%;
		}

		.users-table tr {
			margin-bottom: 1rem;
			border: 1px solid var(--color-card-border, rgba(0, 0, 0, 0.08));
			border-radius: 8px;
			overflow: hidden;
			background-color: var(--color-card-bg, rgba(255, 255, 255, 0.95));
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
		}

		.users-table td {
			padding: 0.75rem;
			border: none;
			border-bottom: 1px solid var(--color-card-border, rgba(0, 0, 0, 0.08));
			border-bottom: 1px solid color-mix(in srgb, var(--color-card-border, rgba(0, 0, 0, 0.08)) 70%, transparent);
			position: relative;
		}

		.users-table td:last-child {
			border-bottom: none;
		}

		.users-table td::before {
			content: attr(data-label);
			display: block;
			font-weight: 600;
			color: var(--color-text-secondary, #6b7280);
			margin-bottom: 0.35rem;
			font-size: 0.8rem;
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		.table-actions {
			justify-content: flex-start;
			flex-wrap: wrap;
		}

		:global(body.dark-mode) .users-table tr {
			background-color: rgba(31, 41, 55, 0.75);
			border-color: rgba(148, 163, 184, 0.25);
		}

		:global(body.dark-mode) .users-table td::before {
			color: #cbd5f5;
		}

		:global(body.dark-mode) .users-table td {
			border-bottom: 1px solid rgba(148, 163, 184, 0.25);
		}
	}
</style>
