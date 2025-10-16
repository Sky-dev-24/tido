<script>
	import { getContext } from 'svelte';

	let { todoId, attachments = [] } = $props();

	const { uploadAttachment, removeAttachment } = getContext('todo-actions');

	let isUploading = $state(false);
	let attachmentError = $state('');
	let dragActive = $state(false);

	let attachmentCount = $derived((attachments ?? []).length);

	function formatFileSize(bytes) {
		const size = Number(bytes);
		if (!Number.isFinite(size) || size <= 0) return '';
		if (size < 1024) return `${size} B`;
		const units = ['KB', 'MB', 'GB', 'TB'];
		let unitIndex = 0;
		let value = size / 1024;
		while (value >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex += 1;
		}
		return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
	}

	function formatTimestamp(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleString();
	}

	async function handleFiles(fileList) {
		const files = Array.from(fileList ?? []).filter((file) => file && file.size > 0);
		if (!files.length || !todoId) return;

		isUploading = true;
		attachmentError = '';

		for (const file of files) {
			const success = await uploadAttachment(todoId, file);
			if (!success) {
				attachmentError = `Failed to upload ${file.name}`;
			}
		}

		dragActive = false;
		isUploading = false;
	}

	function handleInput(event) {
		const { files } = event.currentTarget;
		event.currentTarget.value = '';
		handleFiles(files);
	}

	function handleDragOver(event) {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		dragActive = true;
	}

	function handleDragEnter(event) {
		handleDragOver(event);
	}

	function handleDragLeave(event) {
		event.preventDefault();
		const related = event.relatedTarget;
		if (related && event.currentTarget.contains(related)) {
			return;
		}
		dragActive = false;
	}

	function handleDrop(event) {
		event.preventDefault();
		dragActive = false;
		const { files } = event.dataTransfer ?? {};
		if (files && files.length > 0) {
			handleFiles(files);
		}
	}

	function handlePaste(event) {
		const clipboard = event.clipboardData;
		if (!clipboard) return;
		const items = Array.from(clipboard.items ?? []);
		const files = items
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter(Boolean);

		if (files.length > 0) {
			event.preventDefault();
			handleFiles(files);
		}
	}

	async function handleDelete(attachmentId) {
		if (!attachmentId || isUploading) return;
		await removeAttachment(attachmentId);
	}
</script>

<div
	class="attachments-section"
	class:drag-active={dragActive}
	role="region"
	aria-label="Task attachments upload area"
	ondragover={handleDragOver}
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	onpaste={handlePaste}
>
	<div class="attachments-header">
		<span class="attachments-title">Attachments ({attachmentCount})</span>
		{#if isUploading}
			<span class="attachments-status">Uploading...</span>
		{:else if attachmentError}
			<span class="attachments-error">{attachmentError}</span>
		{/if}
	</div>

	{#if attachmentCount > 0}
		<ul class="attachments-list">
			{#each attachments as attachment (attachment.id)}
				<li class="attachment-item">
					<!-- svelte-ignore a11y_invalid_attribute -->
					<a
						class="attachment-preview"
						href={`/api/todos/attachments/${attachment.id}`}
						target="_blank"
						rel="noopener noreferrer"
						download={attachment.original_name}
					>
						{#if attachment.mime_type && attachment.mime_type.startsWith('image/')}
							<img src={`/api/todos/attachments/${attachment.id}`} alt={attachment.original_name} loading="lazy" />
						{:else}
							<span class="attachment-icon">📎</span>
						{/if}
					</a>
					<div class="attachment-info">
						<!-- svelte-ignore a11y_invalid_attribute -->
						<a
							href={`/api/todos/attachments/${attachment.id}`}
							target="_blank"
							rel="noopener noreferrer"
							download={attachment.original_name}
						>
							{attachment.original_name}
						</a>
						<div class="attachment-meta">
							{#if attachment.size}
								<span>{formatFileSize(attachment.size)}</span>
							{/if}
							{#if formatTimestamp(attachment.created_at)}
								<span class="attachment-dot">•</span>
								<span>{formatTimestamp(attachment.created_at)}</span>
							{/if}
						</div>
					</div>
					<button
						class="attachment-delete-btn"
						type="button"
						onclick={() => handleDelete(attachment.id)}
						disabled={isUploading}
						aria-label={`Remove attachment ${attachment.original_name}`}
					>
						✕
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="attachments-empty">
			Drop files, paste images, or click below to upload.
		</div>
	{/if}

	<div class="attachments-controls">
		<label class="attachment-upload-btn">
			<input
				class="attachment-file-input"
				type="file"
				multiple
				onchange={handleInput}
				disabled={isUploading}
			/>
			<span>{isUploading ? 'Uploading...' : 'Select files'}</span>
		</label>
		<span class="attachments-hint">Supports drag & drop • Paste images</span>
	</div>
</div>

<style>
	.attachments-section {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: #f7f8ff;
		border: 1px dashed #ccd2ff;
		border-radius: 8px;
		transition: border-color 0.2s ease, background-color 0.2s ease;
	}

	.attachments-section.drag-active {
		border-color: #667eea;
		background: #eef1ff;
	}

	.attachments-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.attachments-title {
		font-weight: 600;
		font-size: 0.9rem;
		color: #4c5aa8;
	}

	.attachments-status {
		font-size: 0.8rem;
		color: #4c5aa8;
		font-weight: 600;
	}

	.attachments-error {
		font-size: 0.8rem;
		color: #d32f2f;
		font-weight: 600;
	}

	.attachments-list {
		list-style: none;
		margin: 0 0 0.75rem 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.attachment-item {
		display: grid;
		grid-template-columns: 48px minmax(0, 1fr) auto;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem;
		background: white;
		border: 1px solid #e4e9ff;
		border-radius: 8px;
		box-shadow: 0 2px 6px rgba(64, 76, 140, 0.06);
	}

	.attachment-preview {
		width: 48px;
		height: 48px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		overflow: hidden;
		background: #f0f2ff;
		border: 1px solid rgba(102, 126, 234, 0.2);
	}

	.attachment-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.attachment-icon {
		font-size: 1.5rem;
		color: #667eea;
	}

	.attachment-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.attachment-info a {
		font-weight: 600;
		color: #3f4fbe;
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.attachment-info a:hover {
		text-decoration: underline;
	}

	.attachment-meta {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: #7b88af;
	}

	.attachment-dot {
		color: #b3bbdc;
	}

	.attachment-delete-btn {
		border: none;
		background: transparent;
		color: #d5555d;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0.25rem;
		transition: color 0.2s ease;
	}

	.attachment-delete-btn:hover {
		color: #b12f37;
	}

	.attachment-delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.attachments-empty {
		font-size: 0.85rem;
		color: #7b88af;
		text-align: center;
		padding: 0.75rem;
		background: rgba(102, 126, 234, 0.08);
		border-radius: 6px;
		margin-bottom: 0.75rem;
	}

	.attachments-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.attachment-upload-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.9rem;
		background: #667eea;
		color: white;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease, transform 0.2s ease;
		overflow: hidden;
	}

	.attachment-upload-btn:hover {
		background: #5568d3;
		transform: translateY(-1px);
	}

	.attachment-upload-btn span {
		pointer-events: none;
	}

	.attachment-file-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.attachment-file-input:disabled {
		cursor: not-allowed;
	}

	.attachment-file-input:disabled + span {
		opacity: 0.6;
	}

	.attachments-hint {
		font-size: 0.75rem;
		color: #8792c0;
	}

	:global(body.dark-mode) .attachments-section {
		background: #2a2a3e;
		border-color: #404057;
	}

	:global(body.dark-mode) .attachments-section.drag-active {
		border-color: #8b95e8;
		background: #333350;
	}

	:global(body.dark-mode) .attachments-title,
	:global(body.dark-mode) .attachments-status {
		color: #c3c7e9;
	}

	:global(body.dark-mode) .attachments-error {
		color: #ff8a65;
	}

	:global(body.dark-mode) .attachment-item {
		background: #2f2f44;
		border-color: #404057;
		box-shadow: none;
	}

	:global(body.dark-mode) .attachment-preview {
		background: #333350;
		border-color: rgba(139, 149, 232, 0.3);
	}

	:global(body.dark-mode) .attachment-icon {
		color: #8b95e8;
	}

	:global(body.dark-mode) .attachment-info a {
		color: #a7b0ff;
	}

	:global(body.dark-mode) .attachment-meta {
		color: #9a9eb8;
	}

	:global(body.dark-mode) .attachment-delete-btn {
		color: #ff8a65;
	}

	:global(body.dark-mode) .attachment-delete-btn:hover {
		color: #ff7043;
	}

	:global(body.dark-mode) .attachments-empty {
		background: rgba(139, 149, 232, 0.12);
		color: #9a9eb8;
	}

	:global(body.dark-mode) .attachment-upload-btn {
		background: #8b95e8;
	}

	:global(body.dark-mode) .attachment-upload-btn:hover {
		background: #7a84d7;
	}

	:global(body.dark-mode) .attachments-hint {
		color: #9a9eb8;
	}
</style>
