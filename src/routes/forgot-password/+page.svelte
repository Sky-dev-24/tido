<script>
	let email = $state('');
	let error = $state('');
	let success = $state(false);
	let loading = $state(false);

	async function handleSubmit() {
		error = '';
		loading = true;

		try {
			const response = await fetch('/api/auth/request-password-reset', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});

			const data = await response.json();

			if (response.ok) {
				success = true;
			} else {
				error = data.error || 'Failed to send password reset email';
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
	<title>Forgot Password - Tido</title>
</svelte:head>

<div class="auth-container">
	<div class="auth-card">
		<h1>Forgot Password</h1>
		<p class="subtitle">Enter your email address to receive a password reset link</p>

		{#if success}
			<div class="success-message">
				<p><strong>Email sent!</strong></p>
				<p>If an account with that email exists, we've sent a password reset link. Please check your inbox.</p>
				<p class="back-link"><a href="/login">Back to login</a></p>
			</div>
		{:else}
			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
				<div class="form-group">
					<label for="email">Email Address</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						onkeypress={handleKeyPress}
						placeholder="Enter your email"
						disabled={loading}
						required
					/>
				</div>

				<button type="submit" class="btn-primary" disabled={loading}>
					{loading ? 'Sending...' : 'Send Reset Link'}
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
		color: #2e7d32;
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
