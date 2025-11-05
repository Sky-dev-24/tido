<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let token = $derived($page.url.searchParams.get('token'));
	let error = $state('');
	let success = $state(false);
	let loading = $state(true);

	onMount(async () => {
		if (!token) {
			error = 'Invalid verification link';
			loading = false;
			return;
		}

		try {
			const response = await fetch('/api/auth/verify-email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token })
			});

			const data = await response.json();

			if (response.ok) {
				success = true;
				// Redirect to home after 3 seconds
				setTimeout(() => {
					goto('/');
				}, 3000);
			} else {
				error = data.error || 'Failed to verify email';
			}
		} catch (err) {
			error = 'An error occurred. Please try again.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Verify Email - Tido</title>
</svelte:head>

<div class="auth-container">
	<div class="auth-card">
		<h1>Email Verification</h1>

		{#if loading}
			<div class="loading-message">
				<div class="spinner"></div>
				<p>Verifying your email address...</p>
			</div>
		{:else if success}
			<div class="success-message">
				<div class="checkmark">✓</div>
				<p><strong>Email verified successfully!</strong></p>
				<p>Your email has been verified. You can now access all features of Tido.</p>
				<p>Redirecting you to the app...</p>
			</div>
		{:else if error}
			<div class="error-message">
				<p><strong>Verification failed</strong></p>
				<p>{error}</p>
				{#if error.includes('expired')}
					<p class="back-link">
						You can request a new verification email from your account settings.
					</p>
				{/if}
				<p class="back-link"><a href="/login">Go to login</a></p>
			</div>
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
		margin: 0 0 2rem 0;
		color: #2c3e50;
		font-size: 2rem;
		font-weight: 600;
		text-align: center;
	}

	.loading-message {
		text-align: center;
		padding: 2rem 0;
	}

	.loading-message p {
		color: #666;
		margin-top: 1rem;
	}

	.spinner {
		margin: 0 auto;
		width: 50px;
		height: 50px;
		border: 4px solid #e0e0e0;
		border-top: 4px solid #667eea;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.error-message {
		background-color: #fee;
		color: #c33;
		padding: 1rem;
		border-radius: 4px;
		font-size: 0.9rem;
		text-align: center;
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
		padding: 2rem 1rem;
		border-radius: 4px;
		font-size: 0.9rem;
		text-align: center;
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

	.checkmark {
		font-size: 4rem;
		color: #2e7d32;
		margin-bottom: 1rem;
		animation: checkmark-pop 0.3s ease-in-out;
	}

	@keyframes checkmark-pop {
		0% {
			transform: scale(0);
		}
		50% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	.back-link {
		margin-top: 1rem;
	}

	.back-link a {
		color: #667eea;
		text-decoration: none;
		font-weight: 600;
	}

	.back-link a:hover {
		text-decoration: underline;
	}
</style>
