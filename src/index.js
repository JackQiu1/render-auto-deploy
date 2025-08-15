/**
 * Cloudflare Worker to monitor GitHub repository tags and trigger Render deployment
 * Repository: MoonTechLab/LunaTV
 */

export default {
	async fetch(request, env, ctx) {
		try {
			// Basic environment validation
			if (!env.TAG_STORAGE) {
				return new Response(
					JSON.stringify({
						error: 'KV storage binding not found',
						message: 'TAG_STORAGE binding is not configured properly',
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			}

			const url = new URL(request.url);

			// Handle different endpoints
			if (url.pathname === '/check-updates') {
				return await checkForUpdates(env);
			} else if (url.pathname === '/manual-trigger') {
				return await manualTrigger(env);
			} else if (url.pathname === '/status') {
				return await getStatus(env);
			} else {
				return new Response(
					JSON.stringify({
						message: 'GitHub Tag Monitor for LunaTV',
						endpoints: {
							'/check-updates': 'Check for tag updates',
							'/manual-trigger': 'Manually trigger deployment',
							'/status': 'Get current status',
						},
					}),
					{
						headers: { 'Content-Type': 'application/json' },
					}
				);
			}
		} catch (error) {
			console.error('Worker fetch error:', error);
			return new Response(
				JSON.stringify({
					error: 'Internal worker error',
					details: error.message,
					stack: error.stack,
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}
	},

	// Scheduled event handler (runs on cron schedule)
	async scheduled(event, env, ctx) {
		try {
			ctx.waitUntil(checkForUpdates(env));
		} catch (error) {
			console.error('Scheduled event error:', error);
		}
	},
};

/**
 * Check for GitHub repository tag updates
 */
async function checkForUpdates(env) {
	try {
		console.log('Checking for tag updates...');

		// Get the latest tag from GitHub API
		const latestTag = await getLatestTag(env);
		if (!latestTag) {
			return new Response(
				JSON.stringify({
					error: 'Failed to fetch latest tag from GitHub',
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		// Get stored tag from KV
		const storedTag = await env.TAG_STORAGE.get('latest_tag');
		console.log(`Stored tag: ${storedTag}, Latest tag: ${latestTag}`);

		// Compare tags
		if (storedTag !== latestTag) {
			console.log('Tag updated! Triggering deployment...');

			// Trigger Render deployment
			const deployResult = await triggerRenderDeploy(env, latestTag);

			if (deployResult.success) {
				// Update stored tag
				await env.TAG_STORAGE.put('latest_tag', latestTag);

				// Store deployment history
				const timestamp = new Date().toISOString();
				const deployHistory = {
					tag: latestTag,
					previousTag: storedTag,
					timestamp: timestamp,
					status: 'success',
				};
				await env.TAG_STORAGE.put(`deploy_${Date.now()}`, JSON.stringify(deployHistory));

				// Update last check timestamp
				await env.TAG_STORAGE.put('last_check', timestamp);

				return new Response(
					JSON.stringify({
						message: 'Tag updated and deployment triggered',
						oldTag: storedTag || 'none',
						newTag: latestTag,
						deploymentTriggered: true,
						timestamp: timestamp,
					}),
					{
						headers: { 'Content-Type': 'application/json' },
					}
				);
			} else {
				return new Response(
					JSON.stringify({
						message: 'Tag updated but deployment failed',
						oldTag: storedTag || 'none',
						newTag: latestTag,
						error: deployResult.error,
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			}
		} else {
			// Update last check timestamp even if no deployment
			const timestamp = new Date().toISOString();
			await env.TAG_STORAGE.put('last_check', timestamp);

			return new Response(
				JSON.stringify({
					message: 'No tag updates found',
					currentTag: latestTag,
					lastCheck: timestamp,
				}),
				{
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}
	} catch (error) {
		console.error('Error checking for updates:', error);
		return new Response(
			JSON.stringify({
				error: 'Failed to check for updates',
				details: error.message,
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	}
}

/**
 * Get the latest tag from GitHub repository
 */
async function getLatestTag(env) {
	try {
		const response = await fetch('https://api.github.com/repos/MoonTechLab/LunaTV/releases/latest', {
			headers: {
				'User-Agent': 'Cloudflare-Worker-Tag-Monitor',
				Accept: 'application/vnd.github.v3+json',
				// Add GitHub token if available for higher rate limits
				...(env.GITHUB_TOKEN && { Authorization: `token ${env.GITHUB_TOKEN}` }),
			},
		});

		if (!response.ok) {
			console.error(`GitHub API error: ${response.status} ${response.statusText}`);
			const errorBody = await response.text();
			console.error('GitHub API error body:', errorBody);
			return null;
		}

		const data = await response.json();
		return data.tag_name;
	} catch (error) {
		console.error('Error fetching latest tag:', error);
		return null;
	}
}

/**
 * Trigger Render deployment via webhook
 */
async function triggerRenderDeploy(env, tag) {
	try {
		if (!env.RENDER_WEBHOOK_URL) {
			throw new Error('RENDER_WEBHOOK_URL environment variable not set');
		}

		console.log(`Triggering Render deployment for tag: ${tag}`);

		const response = await fetch(env.RENDER_WEBHOOK_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'Cloudflare-Worker-Tag-Monitor',
			},
			// Render webhooks typically don't need a body, but we'll send some info
			body: JSON.stringify({
				trigger: 'github_tag_update',
				tag: tag,
				repository: 'MoonTechLab/LunaTV',
				timestamp: new Date().toISOString(),
			}),
		});

		if (response.ok) {
			console.log('Render deployment triggered successfully');
			return { success: true };
		} else {
			const errorText = await response.text();
			console.error(`Render webhook failed: ${response.status} ${errorText}`);
			return { success: false, error: `Webhook failed: ${response.status} - ${errorText}` };
		}
	} catch (error) {
		console.error('Error triggering Render deployment:', error);
		return { success: false, error: error.message };
	}
}

/**
 * Manual trigger endpoint for testing
 */
async function manualTrigger(env) {
	try {
		// Get current tag
		const currentTag = await getLatestTag(env);
		if (!currentTag) {
			return new Response(
				JSON.stringify({
					error: 'Failed to fetch current tag from GitHub',
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		const result = await triggerRenderDeploy(env, currentTag);

		if (result.success) {
			// Update timestamp for manual trigger
			const timestamp = new Date().toISOString();
			const deployHistory = {
				tag: currentTag,
				timestamp: timestamp,
				status: 'manual_trigger_success',
				type: 'manual',
			};
			await env.TAG_STORAGE.put(`manual_${Date.now()}`, JSON.stringify(deployHistory));

			return new Response(
				JSON.stringify({
					message: 'Manual deployment triggered successfully',
					tag: currentTag,
					timestamp: timestamp,
				}),
				{
					headers: { 'Content-Type': 'application/json' },
				}
			);
		} else {
			return new Response(
				JSON.stringify({
					error: 'Failed to trigger deployment',
					details: result.error,
					tag: currentTag,
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: 'Manual trigger failed',
				details: error.message,
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	}
}

/**
 * Get current status and recent deployment history
 */
async function getStatus(env) {
	try {
		// Validate KV binding
		if (!env.TAG_STORAGE) {
			return new Response(
				JSON.stringify({
					error: 'KV storage not available',
					details: 'TAG_STORAGE binding not configured',
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		const currentTag = await env.TAG_STORAGE.get('latest_tag');
		const lastCheck = await env.TAG_STORAGE.get('last_check');

		// Get recent deployment history
		const deployKeys = await env.TAG_STORAGE.list({ prefix: 'deploy_' });
		const recentDeploys = [];

		// Safely process deployment history
		if (deployKeys && deployKeys.keys) {
			const keysToProcess = deployKeys.keys.slice(-5); // Get last 5 deployments
			for (const key of keysToProcess) {
				try {
					const deployData = await env.TAG_STORAGE.get(key.name);
					if (deployData) {
						const parsed = JSON.parse(deployData);
						recentDeploys.push(parsed);
					}
				} catch (parseError) {
					console.error('Error parsing deployment data:', parseError);
					// Skip invalid deployment records
				}
			}
		}

		return new Response(
			JSON.stringify({
				status: 'active',
				currentTag: currentTag || 'none',
				lastCheck: lastCheck || 'never',
				recentDeployments: recentDeploys.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
				repository: 'MoonTechLab/LunaTV',
			}),
			{
				headers: { 'Content-Type': 'application/json' },
			}
		);
	} catch (error) {
		console.error('Error in getStatus:', error);
		return new Response(
			JSON.stringify({
				error: 'Failed to get status',
				details: error.message,
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	}
}
