<script>
	import { themes, applyTheme } from '$lib/themes.js';

	let {
		onSave = () => {},
		onCancel = () => {},
		editingTheme = null
	} = $props();

	let themeName = $state(editingTheme?.name || '');
	let themeKey = $state(editingTheme?.key || '');
	let colors = $state(editingTheme?.colors || {
		primary: '#8b5cf6',
		primaryHover: '#7c3aed',
		secondary: '#06b6d4',
		background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 33%, #06b6d4 66%, #10b981 100%)',
		cardBg: '#ffffff',
		cardBorder: '#e0e7ff',
		text: '#4338ca',
		textSecondary: '#6366f1',
		accent: '#06b6d4',
		accentHover: '#0891b2'
	});

	let gradientType = $state('linear');
	let gradientAngle = $state('135');
	let gradientStops = $state([
		{ color: '#6366f1', position: '0' },
		{ color: '#8b5cf6', position: '33' },
		{ color: '#06b6d4', position: '66' },
		{ color: '#10b981', position: '100' }
	]);

	// Parse existing gradient if editing
	$effect(() => {
		if (editingTheme?.colors?.background) {
			parseGradient(editingTheme.colors.background);
		}
	});

	function parseGradient(bg) {
		if (bg.startsWith('linear-gradient')) {
			gradientType = 'linear';
			const match = bg.match(/linear-gradient\((\d+)deg,\s*(.+)\)/);
			if (match) {
				gradientAngle = match[1];
				const stopsStr = match[2];
				const stops = stopsStr.split(/,\s*(?=#)/).map(stop => {
					const parts = stop.match(/(#[0-9a-fA-F]{6})\s+(\d+)%/);
					if (parts) {
						return { color: parts[1], position: parts[2] };
					}
					return null;
				}).filter(Boolean);
				if (stops.length > 0) {
					gradientStops = stops;
				}
			}
		}
	}

	let backgroundPreview = $derived.by(() => {
		const stops = gradientStops.map(s => `${s.color} ${s.position}%`).join(', ');
		return `linear-gradient(${gradientAngle}deg, ${stops})`;
	});

	function updateBackground() {
		colors.background = backgroundPreview;
	}

	function addGradientStop() {
		gradientStops = [...gradientStops, { color: '#000000', position: '50' }];
		updateBackground();
	}

	function removeGradientStop(index) {
		if (gradientStops.length > 2) {
			gradientStops = gradientStops.filter((_, i) => i !== index);
			updateBackground();
		}
	}

	function handleSave() {
		if (!themeName.trim()) {
			alert('Please enter a theme name');
			return;
		}

		const key = themeKey || themeName.toLowerCase().replace(/\s+/g, '-');
		const theme = {
			key,
			name: themeName,
			colors: { ...colors },
			custom: true
		};

		onSave(theme);
	}

	function previewTheme() {
		const tempTheme = {
			colors: { ...colors }
		};
		const root = document.documentElement;

		Object.keys(colors).forEach(key => {
			const varName = '--color-' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
			root.style.setProperty(varName, colors[key]);
		});

		document.body.style.background = colors.background;
		document.body.style.backgroundAttachment = 'fixed';
	}
</script>

<div class="theme-builder">
	<h3>Custom Theme Builder</h3>

	<div class="form-section">
		<label>
			<span>Theme Name</span>
			<input type="text" bind:value={themeName} placeholder="My Custom Theme" />
		</label>
	</div>

	<div class="form-section">
		<h4>Colors</h4>

		<div class="color-grid">
			<label>
				<span>Primary</span>
				<input type="color" bind:value={colors.primary} />
			</label>

			<label>
				<span>Primary Hover</span>
				<input type="color" bind:value={colors.primaryHover} />
			</label>

			<label>
				<span>Secondary</span>
				<input type="color" bind:value={colors.secondary} />
			</label>

			<label>
				<span>Accent</span>
				<input type="color" bind:value={colors.accent} />
			</label>

			<label>
				<span>Accent Hover</span>
				<input type="color" bind:value={colors.accentHover} />
			</label>

			<label>
				<span>Text</span>
				<input type="color" bind:value={colors.text} />
			</label>

			<label>
				<span>Text Secondary</span>
				<input type="color" bind:value={colors.textSecondary} />
			</label>

			<label>
				<span>Card Background</span>
				<input type="color" bind:value={colors.cardBg} />
			</label>

			<label>
				<span>Card Border</span>
				<input type="color" bind:value={colors.cardBorder} />
			</label>
		</div>
	</div>

	<div class="form-section">
		<h4>Background Gradient</h4>

		<label>
			<span>Angle (degrees)</span>
			<input
				type="range"
				bind:value={gradientAngle}
				min="0"
				max="360"
				oninput={updateBackground}
			/>
			<span class="range-value">{gradientAngle}°</span>
		</label>

		<div class="gradient-stops">
			{#each gradientStops as stop, index (index)}
				<div class="gradient-stop">
					<input
						type="color"
						bind:value={stop.color}
						oninput={updateBackground}
					/>
					<input
						type="number"
						bind:value={stop.position}
						min="0"
						max="100"
						oninput={updateBackground}
					/>
					<span>%</span>
					{#if gradientStops.length > 2}
						<button
							type="button"
							class="btn-icon"
							onclick={() => removeGradientStop(index)}
						>
							×
						</button>
					{/if}
				</div>
			{/each}
		</div>

		<button type="button" class="btn-secondary" onclick={addGradientStop}>
			+ Add Gradient Stop
		</button>

		<div class="gradient-preview" style="background: {backgroundPreview};">
			Preview
		</div>
	</div>

	<div class="theme-preview">
		<h4>Theme Preview</h4>
		<div class="preview-card" style="
			background: {colors.cardBg};
			border: 1px solid {colors.cardBorder};
			color: {colors.text};
		">
			<h5 style="color: {colors.primary};">Sample Card</h5>
			<p style="color: {colors.textSecondary};">This is how your theme will look</p>
			<button class="preview-btn" style="
				background: {colors.primary};
				color: white;
			">
				Primary Button
			</button>
			<button class="preview-btn" style="
				background: {colors.accent};
				color: white;
			">
				Accent Button
			</button>
		</div>
	</div>

	<div class="actions">
		<button type="button" class="btn-secondary" onclick={onCancel}>Cancel</button>
		<button type="button" class="btn-secondary" onclick={previewTheme}>
			Preview Theme
		</button>
		<button type="button" class="btn-primary" onclick={handleSave}>
			Save Theme
		</button>
	</div>
</div>

<style>
	.theme-builder {
		padding: 1rem;
		max-height: 70vh;
		overflow-y: auto;
	}

	.form-section {
		margin-bottom: 1.5rem;
	}

	.form-section h4 {
		margin: 0 0 1rem 0;
		color: var(--color-text, #2c3e50);
		font-size: 1rem;
	}

	.form-section label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.form-section label span {
		font-size: 0.9rem;
		color: var(--color-text-secondary, #666);
	}

	.form-section input[type="text"] {
		padding: 0.6rem;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 1rem;
	}

	.color-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
	}

	.color-grid label {
		margin-bottom: 0;
	}

	.color-grid input[type="color"] {
		width: 100%;
		height: 50px;
		border: 1px solid #ddd;
		border-radius: 6px;
		cursor: pointer;
	}

	.form-section input[type="range"] {
		width: 100%;
	}

	.range-value {
		font-weight: 600;
		color: var(--color-primary, #667eea);
	}

	.gradient-stops {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 1rem 0;
	}

	.gradient-stop {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.gradient-stop input[type="color"] {
		width: 60px;
		height: 40px;
		border: 1px solid #ddd;
		border-radius: 6px;
		cursor: pointer;
	}

	.gradient-stop input[type="number"] {
		width: 70px;
		padding: 0.4rem;
		border: 1px solid #ddd;
		border-radius: 6px;
	}

	.btn-icon {
		background: #ff6b6b;
		color: white;
		border: none;
		border-radius: 50%;
		width: 30px;
		height: 30px;
		font-size: 1.2rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-icon:hover {
		background: #ff5252;
	}

	.gradient-preview {
		height: 80px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: 600;
		font-size: 1.1rem;
		margin-top: 1rem;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.theme-preview {
		margin: 1.5rem 0;
	}

	.preview-card {
		padding: 1.5rem;
		border-radius: 8px;
	}

	.preview-card h5 {
		margin: 0 0 0.5rem 0;
		font-size: 1.2rem;
	}

	.preview-card p {
		margin: 0 0 1rem 0;
	}

	.preview-btn {
		padding: 0.6rem 1.2rem;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		margin-right: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid #e0e0e0;
	}

	.btn-primary, .btn-secondary {
		padding: 0.6rem 1.2rem;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.95rem;
		font-weight: 600;
		transition: all 0.2s;
	}

	.btn-primary {
		background: var(--color-primary, #667eea);
		color: white;
	}

	.btn-primary:hover {
		background: var(--color-primary-hover, #5568d3);
	}

	.btn-secondary {
		background: #f0f0f0;
		color: #333;
	}

	.btn-secondary:hover {
		background: #e0e0e0;
	}

	:global(body.dark-mode) .theme-builder {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .form-section h4,
	:global(body.dark-mode) .theme-preview h4 {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .form-section input[type="text"],
	:global(body.dark-mode) .gradient-stop input[type="number"] {
		background: #2a2a3e;
		border-color: #3a3a4e;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .btn-secondary {
		background: #3a3a4e;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .btn-secondary:hover {
		background: #4a4a5e;
	}

	:global(body.dark-mode) .actions {
		border-top-color: #3a3a4e;
	}
</style>
