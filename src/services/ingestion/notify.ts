import { NodeType } from '@/types/database';

interface NotifyPayload {
  title: string;
  nodeType: NodeType;
  publishedAt?: string;
  chunksCreated?: number;
  url?: string;
}

function formatDate(iso?: string): string {
  if (!iso) return 'unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

function typeHeader(nodeType: NodeType): string {
  switch (nodeType) {
    case 'podcast':
      return '🎙️ New Podcast Episode';
    case 'article':
      return '📝 New Article';
    case 'ainews':
      return '📰 AI News Daily';
    case 'builders-club':
      return '🛠️ New Builders Club Session';
    case 'paper-club':
      return '📄 New Paper Club Session';
    case 'workshop':
      return '📺 New LatentSpaceTV Video';
    default:
      return '📌 New Content';
  }
}

function typePrompt(nodeType: NodeType): string {
  switch (nodeType) {
    case 'podcast':
      return "what's the signal here?";
    case 'article':
      return 'break this down for us';
    case 'ainews':
      return "what's the signal in today's noise?";
    default:
      return 'what stands out here?';
  }
}

function buildAnnouncementContent(payload: NotifyPayload): string {
  const lines = [
    typeHeader(payload.nodeType),
    '',
    `**${payload.title}**`,
    `Published: ${formatDate(payload.publishedAt)}${payload.chunksCreated !== undefined ? ` | ${payload.chunksCreated} chunks indexed` : ''}`,
  ];

  if (payload.url) {
    lines.push(payload.url);
  }

  return lines.join('\n');
}

function buildYapContent(payload: NotifyPayload): string {
  const sigId = process.env.DISCORD_SIG_USER_ID;
  const mention = sigId ? `<@${sigId}>` : '@Sig';

  const lines = [
    '🧠 Discussion Kickoff',
    '',
    `**${payload.title}**`,
    `Published: ${formatDate(payload.publishedAt)}${payload.chunksCreated !== undefined ? ` | ${payload.chunksCreated} chunks indexed` : ''}`,
  ];

  if (payload.url) {
    lines.push(payload.url);
  }

  lines.push('', `${mention} ${typePrompt(payload.nodeType)}`);
  return lines.join('\n');
}

async function sendWebhook(webhookUrl: string, content: string): Promise<void> {
  const webhookUsername = process.env.DISCORD_WEBHOOK_USERNAME || 'Latent Space Hub';
  const webhookAvatar = process.env.DISCORD_WEBHOOK_AVATAR_URL;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: webhookUsername,
      avatar_url: webhookAvatar,
      content,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed (${response.status})`);
  }
}

export async function notifyAnnouncementsThenYap(payload: NotifyPayload): Promise<void> {
  const announcementsWebhook = process.env.DISCORD_ANNOUNCEMENTS_WEBHOOK_URL;
  const yapWebhook = process.env.DISCORD_YAP_WEBHOOK_URL;

  if (announcementsWebhook) {
    await sendWebhook(announcementsWebhook, buildAnnouncementContent(payload));
  }

  if (yapWebhook) {
    await sendWebhook(yapWebhook, buildYapContent(payload));
  }
}
