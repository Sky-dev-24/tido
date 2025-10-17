<script>
	import { goto } from '$app/navigation';

	let { data } = $props();
	let isFirstUser = data?.isFirstUser ?? false;

	let username = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);
	let needsApproval = $state(false);

	async function handleRegister() {
		error = '';

		// Validation
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (password.length < 6) {
			error = 'Password must be at least 6 characters';
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, email, password })
			});

			const data = await response.json();

			if (response.ok) {
				if (data.needsApproval) {
					needsApproval = true;
				} else {
					goto('/');
				}
			} else {
				error = data.error || 'Registration failed';
			}
		} catch (err) {
			error = 'An error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Register - Tido</title>
</svelte:head>

<div class="auth-container">
	<div class="auth-card">
		{#if needsApproval}
			<h1>Registration Pending</h1>
			<div class="success-message">
				<p><strong>Your account has been created successfully!</strong></p>
				<p>Please wait for an administrator to approve your account before you can sign in.</p>
				<p>You will be able to log in once your account is approved.</p>
			</div>
			<a href="/login" class="btn-primary">Return to Login</a>
		{:else}
			{#if isFirstUser}
				<h1>Welcome to Tido</h1>
				<p class="subtitle">Create your administrator account</p>

				<div class="info-message">
					<p><strong>First-time setup</strong></p>
					<p>You're creating the first account for this Tido instance. This account will have administrator privileges and can approve other users.</p>
				</div>
			{:else}
				<h1>Create Account</h1>
				<p class="subtitle">Sign up to start using Tido</p>
			{/if}

			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
			<div class="form-group">
				<label for="username">Username</label>
				<input
					id="username"
					type="text"
					bind:value={username}
					placeholder="Choose a username"
					disabled={loading}
					required
					minlength="3"
				/>
			</div>

			<div class="form-group">
				<label for="email">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					placeholder="Enter your email"
					disabled={loading}
					required
				/>
			</div>

			<div class="form-group">
				<label for="password">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					placeholder="Create a password"
					disabled={loading}
					required
					minlength="6"
				/>
			</div>

			<div class="form-group">
				<label for="confirmPassword">Confirm Password</label>
				<input
					id="confirmPassword"
					type="password"
					bind:value={confirmPassword}
					placeholder="Confirm your password"
					disabled={loading}
					required
				/>
			</div>

			<button type="submit" class="btn-primary" disabled={loading}>
				{loading ? (isFirstUser ? 'Creating Admin Account...' : 'Creating Account...') : (isFirstUser ? 'Create Admin Account' : 'Sign Up')}
			</button>
		</form>

			{#if !isFirstUser}
				<p class="switch-auth">
					Already have an account? <a href="/login">Sign in</a>
				</p>
			{/if}
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

	.info-message {
		background-color: #e3f2fd;
		color: #0d47a1;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
		border-left: 4px solid #2196f3;
	}

	.info-message p {
		margin: 0.5rem 0;
	}

	.info-message p:first-child {
		margin-top: 0;
	}

	.info-message p:last-child {
		margin-bottom: 0;
	}

	.success-message {
		background-color: #d4edda;
		color: #155724;
		padding: 1.5rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
	}

	.success-message p {
		margin: 0.5rem 0;
	}

	.success-message p:first-child {
		margin-top: 0;
	}

	.success-message p:last-child {
		margin-bottom: 0;
	}

	a.btn-primary {
		display: block;
		text-align: center;
		text-decoration: none;
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
