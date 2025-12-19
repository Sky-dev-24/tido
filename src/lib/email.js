/**
 * Email utility for sending transactional emails
 * Supports SMTP configuration via environment variables
 */

import nodemailer from 'nodemailer';
import { createLogger } from './logger.js';

const logger = createLogger('Email');

// Email configuration from environment
const EMAIL_CONFIG = {
	enabled: process.env.SMTP_HOST && process.env.SMTP_FROM,
	host: process.env.SMTP_HOST,
	port: parseInt(process.env.SMTP_PORT || '587'),
	secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS
	},
	from: process.env.SMTP_FROM || 'noreply@example.com'
};

let transporter = null;

/**
 * Initialize email transporter
 */
function getTransporter() {
	if (!EMAIL_CONFIG.enabled) {
		logger.warn('Email not configured - emails will be logged instead of sent');
		return null;
	}

	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: EMAIL_CONFIG.host,
			port: EMAIL_CONFIG.port,
			secure: EMAIL_CONFIG.secure,
			auth: EMAIL_CONFIG.auth
		});

		logger.info('Email transporter initialized', {
			host: EMAIL_CONFIG.host,
			port: EMAIL_CONFIG.port
		});
	}

	return transporter;
}

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} options.html - HTML body
 * @returns {Promise<boolean>} Success status
 */
async function sendEmail({ to, subject, text, html }) {
	const transport = getTransporter();

	// If email is not configured, log instead of sending
	if (!transport) {
		logger.info('Email would be sent (SMTP not configured)', {
			to,
			subject,
			textPreview: text?.substring(0, 100)
		});
		return false;
	}

	try {
		const info = await transport.sendMail({
			from: EMAIL_CONFIG.from,
			to,
			subject,
			text,
			html
		});

		logger.info('Email sent successfully', {
			to,
			subject,
			messageId: info.messageId
		});

		return true;
	} catch (error) {
		logger.error('Failed to send email', error);
		return false;
	}
}

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} username - User's username
 * @param {string} resetToken - Password reset token
 * @param {string} baseUrl - Application base URL
 * @returns {Promise<boolean>}
 */
export async function sendPasswordResetEmail(email, username, resetToken, baseUrl) {
	const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
	const expiryMinutes = 60; // 1 hour

	const subject = 'Password Reset Request - Tido';

	const text = `
Hi ${username},

You requested a password reset for your Tido account.

Click the link below to reset your password:
${resetUrl}

This link will expire in ${expiryMinutes} minutes.

If you didn't request this, please ignore this email and your password will remain unchanged.

Best regards,
Tido Team
	`.trim();

	const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<style>
		body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
		.container { max-width: 600px; margin: 0 auto; padding: 20px; }
		.button {
			display: inline-block;
			padding: 12px 24px;
			background-color: #4F46E5;
			color: white;
			text-decoration: none;
			border-radius: 6px;
			margin: 20px 0;
		}
		.footer { margin-top: 30px; font-size: 12px; color: #666; }
		.warning { color: #DC2626; font-weight: bold; }
	</style>
</head>
<body>
	<div class="container">
		<h2>Password Reset Request</h2>
		<p>Hi ${username},</p>
		<p>You requested a password reset for your Tido account.</p>
		<p>Click the button below to reset your password:</p>
		<a href="${resetUrl}" class="button">Reset Password</a>
		<p>Or copy and paste this link into your browser:</p>
		<p><a href="${resetUrl}">${resetUrl}</a></p>
		<p class="warning">This link will expire in ${expiryMinutes} minutes.</p>
		<p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
		<div class="footer">
			<p>Best regards,<br>Tido Team</p>
		</div>
	</div>
</body>
</html>
	`.trim();

	return await sendEmail({ to: email, subject, text, html });
}

/**
 * Send email verification email
 * @param {string} email - Recipient email
 * @param {string} username - User's username
 * @param {string} verificationToken - Email verification token
 * @param {string} baseUrl - Application base URL
 * @returns {Promise<boolean>}
 */
export async function sendEmailVerification(email, username, verificationToken, baseUrl) {
	const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

	const subject = 'Verify Your Email - Tido';

	const text = `
Hi ${username},

Welcome to Tido! Please verify your email address to complete your registration.

Click the link below to verify your email:
${verifyUrl}

If you didn't create an account with Tido, please ignore this email.

Best regards,
Tido Team
	`.trim();

	const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<style>
		body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
		.container { max-width: 600px; margin: 0 auto; padding: 20px; }
		.button {
			display: inline-block;
			padding: 12px 24px;
			background-color: #10B981;
			color: white;
			text-decoration: none;
			border-radius: 6px;
			margin: 20px 0;
		}
		.footer { margin-top: 30px; font-size: 12px; color: #666; }
		h2 { color: #4F46E5; }
	</style>
</head>
<body>
	<div class="container">
		<h2>Welcome to Tido!</h2>
		<p>Hi ${username},</p>
		<p>Thank you for registering with Tido. Please verify your email address to complete your registration.</p>
		<a href="${verifyUrl}" class="button">Verify Email Address</a>
		<p>Or copy and paste this link into your browser:</p>
		<p><a href="${verifyUrl}">${verifyUrl}</a></p>
		<p>If you didn't create an account with Tido, please ignore this email.</p>
		<div class="footer">
			<p>Best regards,<br>Tido Team</p>
		</div>
	</div>
</body>
</html>
	`.trim();

	return await sendEmail({ to: email, subject, text, html });
}

/**
 * Send admin approval notification email
 * @param {string} email - Recipient email
 * @param {string} username - User's username
 * @param {string} baseUrl - Application base URL
 * @returns {Promise<boolean>}
 */
export async function sendApprovalNotification(email, username, baseUrl) {
	const loginUrl = `${baseUrl}/login`;

	const subject = 'Your Tido Account Has Been Approved!';

	const text = `
Hi ${username},

Good news! Your Tido account has been approved by an administrator.

You can now log in and start using Tido:
${loginUrl}

Best regards,
Tido Team
	`.trim();

	const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<style>
		body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
		.container { max-width: 600px; margin: 0 auto; padding: 20px; }
		.button {
			display: inline-block;
			padding: 12px 24px;
			background-color: #10B981;
			color: white;
			text-decoration: none;
			border-radius: 6px;
			margin: 20px 0;
		}
		.footer { margin-top: 30px; font-size: 12px; color: #666; }
		h2 { color: #10B981; }
	</style>
</head>
<body>
	<div class="container">
		<h2>Account Approved!</h2>
		<p>Hi ${username},</p>
		<p>Good news! Your Tido account has been approved by an administrator.</p>
		<p>You can now log in and start using Tido:</p>
		<a href="${loginUrl}" class="button">Log In to Tido</a>
		<p>Or copy and paste this link into your browser:</p>
		<p><a href="${loginUrl}">${loginUrl}</a></p>
		<div class="footer">
			<p>Best regards,<br>Tido Team</p>
		</div>
	</div>
</body>
</html>
	`.trim();

	return await sendEmail({ to: email, subject, text, html });
}

/**
 * Verify SMTP configuration
 * @returns {Promise<boolean>}
 */
export async function verifyEmailConfig() {
	const transport = getTransporter();
	if (!transport) {
		return false;
	}

	try {
		await transport.verify();
		logger.info('SMTP configuration verified successfully');
		return true;
	} catch (error) {
		logger.error('SMTP configuration verification failed', error);
		return false;
	}
}
