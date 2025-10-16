<script>
	import { goto } from '$app/navigation';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleLogin() {
		error = '';
		loading = true;

		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});

			const data = await response.json();

			if (response.ok) {
				goto('/');
			} else {
				if (data.pending) {
					error = 'Your account is awaiting admin approval. Please check back later.';
				} else {
					error = data.error || 'Login failed';
				}
			}
		} catch (err) {
			error = 'An error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}

	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			handleLogin();
		}
	}
</script>

<svelte:head>
	<title>Login - Todo List</title>
</svelte:head>

<div class="auth-container">
	<div class="auth-card">
		<h1>Welcome Back</h1>
		<p class="subtitle">Sign in to access your todos</p>

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		<form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
			<div class="form-group">
				<label for="username">Username</label>
				<input
					id="username"
					type="text"
					bind:value={username}
					onkeypress={handleKeyPress}
					placeholder="Enter your username"
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
					onkeypress={handleKeyPress}
					placeholder="Enter your password"
					disabled={loading}
					required
				/>
			</div>

			<button type="submit" class="btn-primary" disabled={loading}>
				{loading ? 'Signing in...' : 'Sign In'}
			</button>
		</form>

		<p class="switch-auth">
			Don't have an account? <a href="/register">Sign up</a>
		</p>
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
