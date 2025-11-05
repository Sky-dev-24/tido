/**
 * File validation utilities with server-side MIME type detection
 * Uses magic numbers (file signatures) to verify actual file types
 */

import { createLogger } from './logger.js';

const logger = createLogger('FileValidation');

// File type signatures (magic numbers) - first bytes of files
const FILE_SIGNATURES = {
	// Images
	'image/jpeg': [
		[0xFF, 0xD8, 0xFF] // JPEG
	],
	'image/png': [
		[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] // PNG
	],
	'image/gif': [
		[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
		[0x47, 0x49, 0x46, 0x38, 0x39, 0x61]  // GIF89a
	],
	'image/webp': [
		[0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] // RIFF....WEBP
	],
	'image/bmp': [
		[0x42, 0x4D] // BM
	],
	'image/svg+xml': [
		[0x3C, 0x73, 0x76, 0x67], // <svg
		[0x3C, 0x3F, 0x78, 0x6D, 0x6C] // <?xml
	],

	// Documents
	'application/pdf': [
		[0x25, 0x50, 0x44, 0x46] // %PDF
	],
	'application/zip': [
		[0x50, 0x4B, 0x03, 0x04], // PK.. (ZIP)
		[0x50, 0x4B, 0x05, 0x06], // PK.. (empty ZIP)
		[0x50, 0x4B, 0x07, 0x08]  // PK.. (spanned ZIP)
	],
	'application/x-rar-compressed': [
		[0x52, 0x61, 0x72, 0x21, 0x1A, 0x07] // Rar!..
	],
	'application/x-7z-compressed': [
		[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] // 7z
	],

	// Office documents (all are ZIP-based, so need content inspection)
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [ // .docx
		[0x50, 0x4B, 0x03, 0x04]
	],
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [ // .xlsx
		[0x50, 0x4B, 0x03, 0x04]
	],
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': [ // .pptx
		[0x50, 0x4B, 0x03, 0x04]
	],

	// Text files
	'text/plain': [
		// No magic number - will be default for text-like content
	],

	// Audio
	'audio/mpeg': [
		[0xFF, 0xFB], // MP3
		[0x49, 0x44, 0x33] // ID3 (MP3 with ID3 tag)
	],
	'audio/wav': [
		[0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x41, 0x56, 0x45] // RIFF....WAVE
	],

	// Video
	'video/mp4': [
		[null, null, null, null, 0x66, 0x74, 0x79, 0x70] // ....ftyp
	],
	'video/webm': [
		[0x1A, 0x45, 0xDF, 0xA3]
	]
};

// Allowed file types for attachments
const ALLOWED_MIME_TYPES = [
	// Images
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/bmp',
	'image/svg+xml',

	// Documents
	'application/pdf',
	'application/zip',
	'application/x-rar-compressed',
	'application/x-7z-compressed',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
	'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
	'application/msword', // .doc
	'application/vnd.ms-excel', // .xls
	'application/vnd.ms-powerpoint', // .ppt

	// Text
	'text/plain',
	'text/csv',
	'text/html',
	'text/markdown',

	// Audio
	'audio/mpeg',
	'audio/wav',
	'audio/ogg',

	// Video
	'video/mp4',
	'video/webm',
	'video/ogg'
];

// Maximum file sizes by type (in bytes)
const MAX_FILE_SIZES = {
	'image/*': 10 * 1024 * 1024, // 10 MB for images
	'video/*': 50 * 1024 * 1024, // 50 MB for videos
	'audio/*': 20 * 1024 * 1024, // 20 MB for audio
	'application/*': 25 * 1024 * 1024, // 25 MB for documents
	'text/*': 5 * 1024 * 1024, // 5 MB for text files
	'default': 10 * 1024 * 1024 // 10 MB default
};

/**
 * Check if bytes match a signature pattern
 * @param {Buffer} buffer - File buffer
 * @param {Array<number|null>} signature - Signature pattern (null = wildcard)
 * @returns {boolean}
 */
function matchesSignature(buffer, signature) {
	if (buffer.length < signature.length) {
		return false;
	}

	for (let i = 0; i < signature.length; i++) {
		if (signature[i] !== null && buffer[i] !== signature[i]) {
			return false;
		}
	}

	return true;
}

/**
 * Detect actual MIME type from file buffer using magic numbers
 * @param {Buffer} buffer - File buffer
 * @returns {string|null} Detected MIME type or null
 */
export function detectMimeType(buffer) {
	// Need at least a few bytes to check
	if (!buffer || buffer.length < 4) {
		return null;
	}

	// Check against all known signatures
	for (const [mimeType, signatures] of Object.entries(FILE_SIGNATURES)) {
		for (const signature of signatures) {
			if (matchesSignature(buffer, signature)) {
				return mimeType;
			}
		}
	}

	// Check if it looks like text
	const sample = buffer.slice(0, Math.min(512, buffer.length));
	let textLikeBytes = 0;

	for (let i = 0; i < sample.length; i++) {
		const byte = sample[i];
		// Printable ASCII, newline, tab, carriage return
		if ((byte >= 0x20 && byte <= 0x7E) || byte === 0x09 || byte === 0x0A || byte === 0x0D) {
			textLikeBytes++;
		}
	}

	// If more than 90% looks like text, assume text/plain
	if (textLikeBytes / sample.length > 0.9) {
		return 'text/plain';
	}

	return null;
}

/**
 * Get max file size for a MIME type
 * @param {string} mimeType - MIME type
 * @returns {number} Max size in bytes
 */
export function getMaxFileSize(mimeType) {
	if (!mimeType) {
		return MAX_FILE_SIZES.default;
	}

	// Check exact match first
	if (MAX_FILE_SIZES[mimeType]) {
		return MAX_FILE_SIZES[mimeType];
	}

	// Check wildcard match (e.g., "image/*")
	const category = mimeType.split('/')[0] + '/*';
	if (MAX_FILE_SIZES[category]) {
		return MAX_FILE_SIZES[category];
	}

	return MAX_FILE_SIZES.default;
}

/**
 * Validate file upload
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Original filename
 * @param {string} clientMimeType - MIME type from client
 * @returns {Object} Validation result
 */
export function validateFileUpload(buffer, filename, clientMimeType) {
	// Check buffer exists
	if (!buffer || buffer.length === 0) {
		return {
			isValid: false,
			error: 'File is empty'
		};
	}

	// Detect actual MIME type
	const detectedMimeType = detectMimeType(buffer);

	// Check if MIME type is allowed
	if (!detectedMimeType) {
		return {
			isValid: false,
			error: 'Unable to determine file type. File may be corrupted or unsupported.'
		};
	}

	if (!ALLOWED_MIME_TYPES.includes(detectedMimeType)) {
		return {
			isValid: false,
			error: `File type '${detectedMimeType}' is not allowed. Please upload images, documents, or media files.`
		};
	}

	// Check file size
	const maxSize = getMaxFileSize(detectedMimeType);
	if (buffer.length > maxSize) {
		const maxSizeMB = Math.round(maxSize / (1024 * 1024));
		return {
			isValid: false,
			error: `File is too large. Maximum size for this file type is ${maxSizeMB} MB.`
		};
	}

	// Validate filename
	if (!filename || filename.length > 255) {
		return {
			isValid: false,
			error: 'Invalid filename'
		};
	}

	// Check for dangerous file extensions (even if MIME type looks safe)
	const dangerousExtensions = [
		'.exe', '.bat', '.cmd', '.com', '.msi', '.scr',
		'.vbs', '.js', '.jar', '.app', '.deb', '.rpm',
		'.sh', '.bash', '.ps1', '.psm1'
	];

	const lowerFilename = filename.toLowerCase();
	for (const ext of dangerousExtensions) {
		if (lowerFilename.endsWith(ext)) {
			return {
				isValid: false,
				error: `File extension '${ext}' is not allowed for security reasons.`
			};
		}
	}

	// Check for MIME type mismatch (if client provided one)
	if (clientMimeType && clientMimeType !== detectedMimeType) {
		// Log mismatch but don't fail - client MIME types are often wrong
		logger.security('MIME type mismatch', {
			clientMimeType,
			detectedMimeType,
			filename
		});
	}

	return {
		isValid: true,
		mimeType: detectedMimeType,
		size: buffer.length
	};
}

/**
 * Get safe filename extension from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string} File extension with dot
 */
export function getExtensionFromMimeType(mimeType) {
	const extensionMap = {
		'image/jpeg': '.jpg',
		'image/png': '.png',
		'image/gif': '.gif',
		'image/webp': '.webp',
		'image/bmp': '.bmp',
		'image/svg+xml': '.svg',
		'application/pdf': '.pdf',
		'application/zip': '.zip',
		'application/x-rar-compressed': '.rar',
		'application/x-7z-compressed': '.7z',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
		'text/plain': '.txt',
		'text/csv': '.csv',
		'text/html': '.html',
		'text/markdown': '.md',
		'audio/mpeg': '.mp3',
		'audio/wav': '.wav',
		'audio/ogg': '.ogg',
		'video/mp4': '.mp4',
		'video/webm': '.webm',
		'video/ogg': '.ogv'
	};

	return extensionMap[mimeType] || '';
}
