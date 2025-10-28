// Theme configuration with color palettes
export const themes = {
	ocean: {
		name: 'Ocean Blue',
		colors: {
			primary: '#0077be',
			primaryHover: '#005f99',
			secondary: '#00a8e8',
			background: 'linear-gradient(135deg, #0c4a6e 0%, #22d3ee 100%)',
			cardBg: '#ffffff',
			cardBorder: '#d4e9f7',
			text: '#1a3a52',
			textSecondary: '#4a6fa5',
			accent: '#00d4ff',
			accentHover: '#00b8e6'
		}
	},
	forest: {
		name: 'Forest Green',
		colors: {
			primary: '#2d6a4f',
			primaryHover: '#1b4332',
			secondary: '#52b788',
			background: 'linear-gradient(135deg, #14532d 0%, #86efac 100%)',
			cardBg: '#ffffff',
			cardBorder: '#d8f3dc',
			text: '#1b4332',
			textSecondary: '#40916c',
			accent: '#74c69d',
			accentHover: '#52b788'
		}
	},
	sunset: {
		name: 'Sunset Orange',
		colors: {
			primary: '#ff6b35',
			primaryHover: '#e55a2b',
			secondary: '#ff9f1c',
			background: 'linear-gradient(135deg, #dc2626 0%, #fbbf24 100%)',
			cardBg: '#ffffff',
			cardBorder: '#ffe5d9',
			text: '#4a1c04',
			textSecondary: '#8b4513',
			accent: '#ffb703',
			accentHover: '#fb8500'
		}
	},
	midnight: {
		name: 'Midnight Blue',
		colors: {
			primary: '#1e3a8a',
			primaryHover: '#1e3a70',
			secondary: '#3b82f6',
			background: 'linear-gradient(135deg, #1e1b4b 0%, #60a5fa 100%)',
			cardBg: '#ffffff',
			cardBorder: '#dbeafe',
			text: '#1e293b',
			textSecondary: '#475569',
			accent: '#60a5fa',
			accentHover: '#3b82f6'
		}
	},
	candy: {
		name: 'Candy Pink',
		colors: {
			primary: '#ec4899',
			primaryHover: '#db2777',
			secondary: '#f472b6',
			background: 'linear-gradient(135deg, #be185d 0%, #ec4899 50%, #f9a8d4 100%)',
			cardBg: '#ffffff',
			cardBorder: '#fce7f3',
			text: '#831843',
			textSecondary: '#9f1239',
			accent: '#f9a8d4',
			accentHover: '#f472b6'
		}
	},
	lavender: {
		name: 'Lavender Dream',
		colors: {
			primary: '#9333ea',
			primaryHover: '#7e22ce',
			secondary: '#c084fc',
			background: 'linear-gradient(135deg, #7c3aed 0%, #f0abfc 100%)',
			cardBg: '#ffffff',
			cardBorder: '#f3e8ff',
			text: '#581c87',
			textSecondary: '#7c3aed',
			accent: '#c084fc',
			accentHover: '#a855f7'
		}
	},
	crimson: {
		name: 'Crimson Fire',
		colors: {
			primary: '#b91c1c',
			primaryHover: '#991b1b',
			secondary: '#ef4444',
			background: 'linear-gradient(135deg, #7f1d1d 0%, #f87171 100%)',
			cardBg: '#ffffff',
			cardBorder: '#fee2e2',
			text: '#7f1d1d',
			textSecondary: '#991b1b',
			accent: '#fca5a5',
			accentHover: '#ef4444'
		}
	},
	aurora: {
		name: 'Aurora Borealis',
		colors: {
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
		}
	},
	amber: {
		name: 'Amber Glow',
		colors: {
			primary: '#d97706',
			primaryHover: '#b45309',
			secondary: '#fbbf24',
			background: 'linear-gradient(135deg, #92400e 0%, #fbbf24 100%)',
			cardBg: '#ffffff',
			cardBorder: '#fef3c7',
			text: '#78350f',
			textSecondary: '#92400e',
			accent: '#fcd34d',
			accentHover: '#f59e0b'
		}
	},
	monochrome: {
		name: 'Monochrome',
		colors: {
			primary: '#4b5563',
			primaryHover: '#374151',
			secondary: '#9ca3af',
			background: 'linear-gradient(135deg, #1f2937 0%, #9ca3af 100%)',
			cardBg: '#ffffff',
			cardBorder: '#e5e7eb',
			text: '#111827',
			textSecondary: '#4b5563',
			accent: '#6b7280',
			accentHover: '#4b5563'
		}
	},
	emerald: {
		name: 'Emerald Sea',
		colors: {
			primary: '#059669',
			primaryHover: '#047857',
			secondary: '#14b8a6',
			background: 'linear-gradient(135deg, #0f766e 0%, #5eead4 100%)',
			cardBg: '#ffffff',
			cardBorder: '#ccfbf1',
			text: '#134e4a',
			textSecondary: '#0f766e',
			accent: '#2dd4bf',
			accentHover: '#14b8a6'
		}
	}
};

// Apply theme CSS variables to the document
export function applyTheme(themeName) {
	const allThemes = getAllThemes();
	const theme = allThemes[themeName] || themes.aurora;
	const root = document.documentElement;

	root.style.setProperty('--color-primary', theme.colors.primary);
	root.style.setProperty('--color-primary-hover', theme.colors.primaryHover);
	root.style.setProperty('--color-secondary', theme.colors.secondary);
	root.style.setProperty('--color-background', theme.colors.background);
	root.style.setProperty('--color-card-bg', theme.colors.cardBg);
	root.style.setProperty('--color-card-border', theme.colors.cardBorder);
	root.style.setProperty('--color-text', theme.colors.text);
	root.style.setProperty('--color-text-secondary', theme.colors.textSecondary);
	root.style.setProperty('--color-accent', theme.colors.accent);
	root.style.setProperty('--color-accent-hover', theme.colors.accentHover);

	// Also set the background directly on body element to ensure it updates
	document.body.style.background = theme.colors.background;
	document.body.style.backgroundAttachment = 'fixed';
}

// View density configurations
export const viewDensities = {
	compact: {
		name: 'Compact',
		spacing: {
			todoItemPadding: '0.6rem 0.8rem',
			todoItemMargin: '0 0 0.5rem 0',
			fontSize: '0.9rem',
			gap: '0.4rem'
		}
	},
	comfortable: {
		name: 'Comfortable',
		spacing: {
			todoItemPadding: '0.9rem 1.1rem',
			todoItemMargin: '0 0 0.75rem 0',
			fontSize: '1rem',
			gap: '0.5rem'
		}
	},
	spacious: {
		name: 'Spacious',
		spacing: {
			todoItemPadding: '1.2rem 1.5rem',
			todoItemMargin: '0 0 1rem 0',
			fontSize: '1.05rem',
			gap: '0.75rem'
		}
	}
};

// Apply view density CSS variables to the document
export function applyViewDensity(densityName) {
	const density = viewDensities[densityName] || viewDensities.comfortable;
	const root = document.documentElement;

	root.style.setProperty('--todo-item-padding', density.spacing.todoItemPadding);
	root.style.setProperty('--todo-item-margin', density.spacing.todoItemMargin);
	root.style.setProperty('--todo-item-font-size', density.spacing.fontSize);
	root.style.setProperty('--todo-item-gap', density.spacing.gap);
}

export const fontScales = {
	small: {
		name: 'Compact',
		rootSize: '15px',
		bodyLineHeight: '1.45'
	},
	medium: {
		name: 'Comfortable',
		rootSize: '16px',
		bodyLineHeight: '1.5'
	},
	large: {
		name: 'Relaxed',
		rootSize: '17px',
		bodyLineHeight: '1.6'
	}
};

export function applyFontScale(scaleName) {
	const scale = fontScales[scaleName] || fontScales.medium;
	const root = document.documentElement;

	root.style.setProperty('--app-base-font-size', scale.rootSize);
	root.style.setProperty('--app-body-line-height', scale.bodyLineHeight);
}

export const fontFamilies = {
	system: {
		name: 'System Default',
		stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif"
	},
	serif: {
		name: 'Classic Serif',
		stack: "Georgia, 'Times New Roman', serif"
	},
	mono: {
		name: 'Monospace',
		stack: "'SFMono-Regular', Consolas, 'Liberation Mono', 'Courier New', monospace"
	},
	rounded: {
		name: 'Rounded',
		stack: "'Nunito', 'Quicksand', 'Segoe UI', sans-serif"
	}
};

export function applyFontFamily(familyName) {
	const family = fontFamilies[familyName] || fontFamilies.system;
	const root = document.documentElement;

	root.style.setProperty('--app-font-family', family.stack);
}

// Custom theme management
const CUSTOM_THEMES_KEY = 'tido_custom_themes';

export function getCustomThemes() {
	if (typeof localStorage === 'undefined') return {};
	const stored = localStorage.getItem(CUSTOM_THEMES_KEY);
	return stored ? JSON.parse(stored) : {};
}

export function saveCustomTheme(theme) {
	console.log('Saving custom theme:', theme);
	const customThemes = getCustomThemes();
	customThemes[theme.key] = {
		name: theme.name,
		colors: theme.colors,
		custom: true
	};
	console.log('Updated custom themes:', customThemes);
	localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes));
	console.log('Saved to localStorage');
	return theme.key;
}

export function deleteCustomTheme(themeKey) {
	const customThemes = getCustomThemes();
	delete customThemes[themeKey];
	localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes));
}

export function getAllThemes() {
	return { ...themes, ...getCustomThemes() };
}

export function exportTheme(themeKey) {
	const allThemes = getAllThemes();
	const theme = allThemes[themeKey];
	if (!theme) return null;

	const exportData = {
		key: themeKey,
		name: theme.name,
		colors: theme.colors,
		version: '1.0',
		exportedAt: new Date().toISOString()
	};

	return JSON.stringify(exportData, null, 2);
}

export function importTheme(jsonString) {
	try {
		const themeData = JSON.parse(jsonString);

		// Validate theme structure
		if (!themeData.name || !themeData.colors) {
			throw new Error('Invalid theme format');
		}

		// Generate a unique key if needed
		let key = themeData.key || themeData.name.toLowerCase().replace(/\s+/g, '-');

		// Ensure key is unique
		const customThemes = getCustomThemes();
		let counter = 1;
		let originalKey = key;
		while (customThemes[key] || themes[key]) {
			key = `${originalKey}-${counter}`;
			counter++;
		}

		const theme = {
			key,
			name: themeData.name,
			colors: themeData.colors,
			custom: true
		};

		saveCustomTheme(theme);
		return theme;
	} catch (error) {
		throw new Error('Failed to import theme: ' + error.message);
	}
}
