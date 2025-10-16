<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let pendingUsers = $state([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		await fetchPendingUsers();
	});

	async function fetchPendingUsers() {
		loading = true;
		try {
			const response = await fetch('/api/admin/users');
			const result = await response.json();

			if (response.ok) {
				pendingUsers = result.pendingUsers;
			} else {
				error = result.error || 'Failed to load pending users';
			}
		} catch (err) {
			error = 'An error occurred';
		} finally {
			loading = false;
		}
	}

	async function handleAction(userId, action) {
		try {
			const response = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, action })
			});

			if (response.ok) {
				await fetchPendingUsers();
			} else {
				const result = await response.json();
				error = result.error || 'Action failed';
			}
		} catch (err) {
			error = 'An error occurred';
		}
	}

	function goToTodos() {
		goto('/');
	}
</script>

<svelte:head>
	<title>Admin Dashboard - Todo List</title>
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
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		min-height: 100vh;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
	}

	.admin-container {
		min-height: 100vh;
		padding: 2rem;
	}

	.admin-card {
		max-width: 900px;
		margin: 0 auto;
		background: white;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid #e0e0e0;
	}

	h1 {
		margin: 0;
		color: #2c3e50;
		font-size: 2rem;
		font-weight: 600;
	}

	h2 {
		color: #2c3e50;
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.welcome {
		color: #666;
		margin-bottom: 2rem;
	}

	.welcome strong {
		color: #667eea;
	}

	.btn-secondary {
		padding: 0.5rem 1rem;
		background-color: #6c757d;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.9rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-secondary:hover {
		background-color: #5a6268;
	}

	.error-message {
		background-color: #fee;
		color: #c33;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.section {
		margin-top: 2rem;
	}

	.loading,
	.empty {
		text-align: center;
		color: #999;
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
		background-color: #f8f9fa;
		border: 1px solid #e0e0e0;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.user-card:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		background-color: white;
	}

	.user-info {
		flex: 1;
	}

	.user-name {
		font-weight: 600;
		font-size: 1.1rem;
		color: #2c3e50;
		margin-bottom: 0.25rem;
	}

	.user-email {
		color: #666;
		font-size: 0.9rem;
		margin-bottom: 0.25rem;
	}

	.user-date {
		color: #999;
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
</style>
