<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let token = $derived($page.url.searchParams.get('token'));
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let success = $state(false);
	let loading = $state(false);

	async function handleSubmit() {
		error = '';

		// Validate passwords match
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		// Validate password length
		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, password })
			});

			const data = await response.json();

			if (response.ok) {
				success = true;
				// Redirect to login after 2 seconds
				setTimeout(() => {
					goto('/login');
				}, 2000);
			} else {
				error = data.error || 'Failed to reset password';
			}
		} catch (err) {
			error = 'An error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}

	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			handleSubmit();
		}
	}
</script>

<svelte:head>
	<title>Reset Password - Tido</title>
</svelte:head>

<div class="auth-container">
	<div class="auth-card">
		<h1>Reset Password</h1>
		<p class="subtitle">Enter your new password</p>

		{#if !token}
			<div class="error-message">
				<p><strong>Invalid reset link</strong></p>
				<p>This password reset link is invalid or missing. Please request a new password reset.</p>
				<p class="back-link"><a href="/forgot-password">Request password reset</a></p>
			</div>
		{:else if success}
			<div class="success-message">
				<p><strong>Password reset successful!</strong></p>
				<p>Your password has been reset. You can now log in with your new password.</p>
				<p>Redirecting to login page...</p>
			</div>
		{:else}
			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
				<div class="form-group">
					<label for="password">New Password</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						onkeypress={handleKeyPress}
						placeholder="Enter new password"
						disabled={loading}
						required
						minlength="8"
					/>
					<p class="hint">Password must be at least 8 characters with a mix of uppercase, lowercase, numbers, and special characters.</p>
				</div>

				<div class="form-group">
					<label for="confirmPassword">Confirm New Password</label>
					<input
						id="confirmPassword"
						type="password"
						bind:value={confirmPassword}
						onkeypress={handleKeyPress}
						placeholder="Confirm new password"
						disabled={loading}
						required
						minlength="8"
					/>
				</div>

				<button type="submit" class="btn-primary" disabled={loading}>
					{loading ? 'Resetting...' : 'Reset Password'}
				</button>
			</form>

			<p class="switch-auth">
				Remember your password? <a href="/login">Sign in</a>
			</p>
		{/if}
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

	.auth-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.auth-card {
		background: white;
		border-radius: 12px;
		padding: 3rem;
		max-width: 400px;
		width: 100%;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
	}

	h1 {
		margin: 0 0 0.5rem 0;
		color: #2c3e50;
		font-size: 2rem;
		font-weight: 600;
		text-align: center;
	}

	.subtitle {
		text-align: center;
		color: #666;
		margin: 0 0 2rem 0;
	}

	.error-message {
		background-color: #fee;
		color: #c33;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.error-message p {
		margin: 0 0 0.75rem 0;
	}

	.error-message p:last-child {
		margin-bottom: 0;
	}

	.success-message {
		background-color: #e8f5e9;
		color: #2e7d32;
		padding: 1rem;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.success-message p {
		margin: 0 0 0.75rem 0;
	}

	.success-message p:last-child {
		margin-bottom: 0;
	}

	.success-message strong {
		font-size: 1.1rem;
	}

	.back-link {
		margin-top: 1rem;
		text-align: center;
	}

	.back-link a {
		color: #667eea;
		text-decoration: none;
		font-weight: 600;
	}

	.back-link a:hover {
		text-decoration: underline;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		color: #2c3e50;
		font-weight: 500;
	}

	.hint {
		font-size: 0.85rem;
		color: #666;
		margin: 0.5rem 0 0 0;
	}

	input {
		width: 100%;
		padding: 0.75rem;
		font-size: 1rem;
		border: 2px solid #e0e0e0;
		border-radius: 4px;
		outline: none;
		transition: border-color 0.2s;
		box-sizing: border-box;
	}

	input:focus {
		border-color: #667eea;
	}

	input:disabled {
		background-color: #f5f5f5;
		cursor: not-allowed;
	}

	.btn-primary {
		width: 100%;
		padding: 0.75rem;
		background-color: #667eea;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: #5568d3;
	}

	.btn-primary:disabled {
		background-color: #a0a0a0;
		cursor: not-allowed;
	}

	.switch-auth {
		text-align: center;
		margin-top: 1.5rem;
		color: #666;
	}

	.switch-auth a {
		color: #667eea;
		text-decoration: none;
		font-weight: 600;
	}

	.switch-auth a:hover {
		text-decoration: underline;
	}
</style>
